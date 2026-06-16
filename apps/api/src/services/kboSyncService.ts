import prisma from '../models/db';
import { fetchKBOTeams, fetchKBOEvents, fetchKBONextEvents, fetchKBOLastEvents, SportsDBEvent } from './kboApi';
import { updateEloRating } from './predictionEngine';

const KBO_COMPETITION_CODE = 'KBO';
const KBO_COMPETITION_NAME = 'KBO 리그';
const KBO_COMPETITION_ID = 4342;

async function upsertKBOTeam(idTeam: string, name: string, shortName: string, badge: string) {
  const id = parseInt(idTeam) + 1000000;
  return prisma.team.upsert({
    where: { id },
    update: { name, shortName, crest: badge },
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
  const homeId = parseInt(event.idHomeTeam) + 1000000;
  const awayId = parseInt(event.idAwayTeam) + 1000000;

  const homeTeam = await prisma.team.findUnique({ where: { id: homeId } });
  const awayTeam = await prisma.team.findUnique({ where: { id: awayId } });
  if (!homeTeam || !awayTeam) return;

  const matchId = parseInt(event.idEvent);
  const utcDate = new Date(`${event.dateEvent}T${event.strTime || '10:00:00'}Z`);
  const homeScore = event.intHomeScore !== null ? parseInt(event.intHomeScore) : null;
  const awayScore = event.intAwayScore !== null ? parseInt(event.intAwayScore) : null;

  let status = 'SCHEDULED';
  if (event.strStatus === 'Match Finished' || (homeScore !== null && awayScore !== null)) {
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
      matchday: parseInt(event.intRound) || null,
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

  if (status === 'FINISHED' && winner && homeTeam && awayTeam) {
    const homeActual = winner === 'HOME_TEAM' ? 1 : winner === 'DRAW' ? 0.5 : 0;
    const awayActual = 1 - homeActual;
    const newHomeElo = updateEloRating(homeTeam.eloRating, awayTeam.eloRating, homeActual);
    const newAwayElo = updateEloRating(awayTeam.eloRating, homeTeam.eloRating, awayActual);
    await prisma.team.update({ where: { id: homeId }, data: { eloRating: newHomeElo } });
    await prisma.team.update({ where: { id: awayId }, data: { eloRating: newAwayElo } });
  }
}

export async function syncKBO(): Promise<{ matchesSynced: number; status: 'success' | 'error'; message?: string }> {
  try {
    console.log('Syncing KBO teams...');
    const teams = await fetchKBOTeams();
    for (const t of teams) {
      await upsertKBOTeam(t.idTeam, t.strTeam, t.strTeamShort || t.strTeam.slice(0, 3), t.strBadge);
    }
    console.log(`KBO: ${teams.length} teams synced`);

    const [nextEvents, lastEvents] = await Promise.all([
      fetchKBONextEvents(),
      fetchKBOLastEvents(),
    ]);

    const allEvents = [...nextEvents, ...lastEvents];
    const seen = new Set<string>();
    const uniqueEvents = allEvents.filter(e => {
      if (seen.has(e.idEvent)) return false;
      seen.add(e.idEvent);
      return true;
    });

    for (const event of uniqueEvents) {
      await syncKBOEvent(event);
    }

    console.log(`KBO: ${uniqueEvents.length} matches synced`);
    return { matchesSynced: uniqueEvents.length, status: 'success' };
  } catch (error) {
    console.error('KBO sync error:', error);
    return { matchesSynced: 0, status: 'error', message: String(error) };
  }
}
