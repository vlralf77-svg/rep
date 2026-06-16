import prisma from '../models/db';
import { fetchKBOTeams, fetchKBOEventsBySeason, fetchKBONextEvents, fetchKBOLastEvents, SportsDBEvent } from './kboApi';
import { updateEloRating } from './predictionEngine';

const KBO_COMPETITION_CODE = 'KBO';
const KBO_COMPETITION_NAME = 'KBO 리그';
const KBO_COMPETITION_ID = 4342;
// KBO는 한국 시간(UTC+9) → UTC로 저장 시 9시간 차이
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function parseKBODate(dateEvent: string, strTime: string | null, strTimestamp: string | null): Date {
  // strTimestamp가 있으면 그것 사용
  if (strTimestamp) {
    return new Date(strTimestamp);
  }
  // dateEvent는 "2026-06-16" 형식, strTime은 "18:00:00" 형식 (KST)
  const timeStr = strTime || '18:00:00'; // KBO 기본 시작 시간 오후 6시
  const kstDate = new Date(`${dateEvent}T${timeStr}+09:00`);
  return kstDate;
}

async function upsertKBOTeam(idTeam: string, name: string, shortName: string, badge: string) {
  const id = parseInt(idTeam) + 1000000;
  return prisma.team.upsert({
    where: { id },
    update: { name, shortName: shortName || name.slice(0, 3), crest: badge || '' },
    create: {
      id,
      name,
      shortName: shortName || name.slice(0, 3),
      crest: badge || '',
      eloRating: 1500,
      sport: 'baseball',
    },
  });
}

async function syncKBOEvent(event: SportsDBEvent) {
  if (!event.idHomeTeam || !event.idAwayTeam) return;

  const homeId = parseInt(event.idHomeTeam) + 1000000;
  const awayId = parseInt(event.idAwayTeam) + 1000000;

  const [homeTeam, awayTeam] = await Promise.all([
    prisma.team.findUnique({ where: { id: homeId } }),
    prisma.team.findUnique({ where: { id: awayId } }),
  ]);
  if (!homeTeam || !awayTeam) return;

  const matchId = parseInt(event.idEvent);
  const utcDate = parseKBODate(event.dateEvent, event.strTime, event.strTimestamp);
  const homeScore = event.intHomeScore !== null && event.intHomeScore !== '' ? parseInt(event.intHomeScore) : null;
  const awayScore = event.intAwayScore !== null && event.intAwayScore !== '' ? parseInt(event.intAwayScore) : null;

  let status = 'SCHEDULED';
  if (event.strPostponed === 'yes') {
    status = 'POSTPONED';
  } else if (homeScore !== null && awayScore !== null) {
    status = 'FINISHED';
  } else if (event.strStatus === 'Match Finished') {
    status = 'FINISHED';
  } else if (event.strStatus === 'In Progress') {
    status = 'LIVE';
  }

  let winner: string | null = null;
  if (status === 'FINISHED' && homeScore !== null && awayScore !== null) {
    if (homeScore > awayScore) winner = 'HOME_TEAM';
    else if (awayScore > homeScore) winner = 'AWAY_TEAM';
    else winner = 'DRAW';
  }

  await prisma.match.upsert({
    where: { id: matchId },
    update: { status, homeScore, awayScore, winner, lastUpdated: new Date() },
    create: {
      id: matchId,
      homeTeamId: homeId,
      awayTeamId: awayId,
      utcDate,
      status,
      matchday: event.intRound ? parseInt(event.intRound) : null,
      competitionId: KBO_COMPETITION_ID,
      competitionName: KBO_COMPETITION_NAME,
      competitionCode: KBO_COMPETITION_CODE,
      sport: 'baseball',
      homeScore,
      awayScore,
      winner,
      lastUpdated: new Date(),
    },
  });

  if (status === 'FINISHED' && winner) {
    const homeActual = winner === 'HOME_TEAM' ? 1 : winner === 'DRAW' ? 0.5 : 0;
    const newHomeElo = updateEloRating(homeTeam.eloRating, awayTeam.eloRating, homeActual);
    const newAwayElo = updateEloRating(awayTeam.eloRating, homeTeam.eloRating, 1 - homeActual);
    await prisma.team.update({ where: { id: homeId }, data: { eloRating: newHomeElo } });
    await prisma.team.update({ where: { id: awayId }, data: { eloRating: newAwayElo } });
  }
}

export async function syncKBO(): Promise<{ matchesSynced: number; status: 'success' | 'error'; message?: string }> {
  try {
    // 1. 팀 동기화
    console.log('KBO: syncing teams...');
    const teams = await fetchKBOTeams();
    for (const t of teams) {
      await upsertKBOTeam(t.idTeam, t.strTeam, t.strTeamShort, t.strBadge);
    }
    console.log(`KBO: ${teams.length} teams synced`);

    // 2. 현재 시즌 + 다음/최근 경기 모두 수집
    const currentYear = new Date().getFullYear();
    const [seasonEvents, nextEvents, lastEvents] = await Promise.all([
      fetchKBOEventsBySeason(String(currentYear)),
      fetchKBONextEvents(),
      fetchKBOLastEvents(),
    ]);

    console.log(`KBO raw data: season=${seasonEvents.length}, next=${nextEvents.length}, last=${lastEvents.length}`);

    // 중복 제거
    const seen = new Set<string>();
    const allEvents = [...seasonEvents, ...nextEvents, ...lastEvents].filter(e => {
      if (!e.idEvent || seen.has(e.idEvent)) return false;
      seen.add(e.idEvent);
      return true;
    });

    console.log(`KBO: ${allEvents.length} unique events to sync`);

    let synced = 0;
    for (const event of allEvents) {
      try {
        await syncKBOEvent(event);
        synced++;
      } catch (e) {
        console.error(`KBO event ${event.idEvent} sync error:`, e);
      }
    }

    console.log(`KBO: ${synced}/${allEvents.length} events synced`);
    return { matchesSynced: synced, status: 'success' };
  } catch (error) {
    console.error('KBO sync failed:', error);
    return { matchesSynced: 0, status: 'error', message: String(error) };
  }
}
