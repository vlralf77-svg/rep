import prisma from '../models/db';
import { fetchMatches, fetchStandings, ApiMatch, ApiStanding } from './footballApi';
import { updateElo } from './predictionEngine';
import { SUPPORTED_LEAGUES } from '@sports/shared';

async function upsertTeam(team: { id: number; name: string; shortName: string; tla: string; crest?: string }, leagueId: string) {
  return prisma.team.upsert({
    where: { id: team.id },
    update: { name: team.name, shortName: team.shortName, tla: team.tla, crest: team.crest },
    create: {
      id: team.id,
      name: team.name,
      shortName: team.shortName,
      tla: team.tla,
      crest: team.crest,
      leagueId,
      eloRating: 1500,
    },
  });
}

async function syncLeague(leagueCode: string, leagueName: string) {
  console.log(`Syncing ${leagueName}...`);

  const matches = await fetchMatches(leagueCode);

  for (const m of matches) {
    await upsertTeam(m.homeTeam, leagueCode);
    await upsertTeam(m.awayTeam, leagueCode);

    const utcDate = new Date(m.utcDate);
    const season = utcDate.getFullYear().toString();

    await prisma.match.upsert({
      where: { id: m.id },
      update: {
        status: m.status,
        homeScore: m.score.fullTime.home ?? undefined,
        awayScore: m.score.fullTime.away ?? undefined,
        utcDate,
      },
      create: {
        id: m.id,
        homeTeamId: m.homeTeam.id,
        awayTeamId: m.awayTeam.id,
        utcDate,
        status: m.status,
        matchday: m.matchday,
        stage: m.stage,
        homeScore: m.score.fullTime.home ?? undefined,
        awayScore: m.score.fullTime.away ?? undefined,
        leagueId: leagueCode,
        leagueName,
        season,
      },
    });

    if (m.status === 'FINISHED' && m.score.fullTime.home !== null && m.score.fullTime.away !== null) {
      const homeTeam = await prisma.team.findUnique({ where: { id: m.homeTeam.id } });
      const awayTeam = await prisma.team.findUnique({ where: { id: m.awayTeam.id } });
      if (homeTeam && awayTeam) {
        const outcome = m.score.fullTime.home > m.score.fullTime.away ? 1 :
          m.score.fullTime.home === m.score.fullTime.away ? 0.5 : 0;
        const [newHomeElo, newAwayElo] = updateElo(homeTeam.eloRating, awayTeam.eloRating, outcome);
        await prisma.team.update({ where: { id: homeTeam.id }, data: { eloRating: newHomeElo } });
        await prisma.team.update({ where: { id: awayTeam.id }, data: { eloRating: newAwayElo } });
      }
    }
  }

  const standings = await fetchStandings(leagueCode);
  for (const s of standings) {
    await upsertTeam(s.team, leagueCode);
    await prisma.standing.upsert({
      where: { teamId_leagueId_season: { teamId: s.team.id, leagueId: leagueCode, season: new Date().getFullYear().toString() } },
      update: {
        position: s.position,
        playedGames: s.playedGames,
        won: s.won,
        draw: s.draw,
        lost: s.lost,
        goalsFor: s.goalsFor,
        goalsAgainst: s.goalsAgainst,
        goalDifference: s.goalDifference,
        points: s.points,
        form: s.form,
      },
      create: {
        teamId: s.team.id,
        leagueId: leagueCode,
        season: new Date().getFullYear().toString(),
        position: s.position,
        playedGames: s.playedGames,
        won: s.won,
        draw: s.draw,
        lost: s.lost,
        goalsFor: s.goalsFor,
        goalsAgainst: s.goalsAgainst,
        goalDifference: s.goalDifference,
        points: s.points,
        form: s.form,
      },
    });
  }

  console.log(`${leagueName}: ${matches.length} matches synced`);
}

export async function syncAll() {
  for (const league of SUPPORTED_LEAGUES) {
    try {
      await syncLeague(league.id, league.name);
    } catch (err) {
      console.error(`Failed to sync ${league.name}:`, err);
    }
  }
}
