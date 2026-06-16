import { footballApi } from './footballApi';
import { updateEloRating } from './predictionEngine';
import prisma from '../models/db';

const LEAGUES = ['PL', 'BL1', 'SA', 'PD', 'FL1'];

async function upsertTeam(team: { id: number; name: string; shortName: string; crest: string }) {
  return prisma.team.upsert({
    where: { id: team.id },
    update: {
      name: team.name,
      shortName: team.shortName,
      crest: team.crest,
    },
    create: {
      id: team.id,
      name: team.name,
      shortName: team.shortName,
      crest: team.crest,
      eloRating: 1500,
    },
  });
}

async function syncLeagueMatches(league: string) {
  console.log(`Syncing matches for league: ${league}`);

  try {
    const matches = await footballApi.getMatches(league);

    for (const match of matches) {
      await upsertTeam(match.homeTeam);
      await upsertTeam(match.awayTeam);

      await prisma.match.upsert({
        where: { id: match.id },
        update: {
          status: match.status,
          homeScore: match.score.fullTime.home,
          awayScore: match.score.fullTime.away,
          htHomeScore: match.score.halfTime.home,
          htAwayScore: match.score.halfTime.away,
          winner: match.score.winner,
          lastUpdated: new Date(match.lastUpdated),
        },
        create: {
          id: match.id,
          homeTeamId: match.homeTeam.id,
          awayTeamId: match.awayTeam.id,
          utcDate: new Date(match.utcDate),
          status: match.status,
          matchday: match.matchday,
          stage: match.stage,
          groupName: match.group,
          competitionId: match.competition.id,
          competitionName: match.competition.name,
          competitionCode: match.competition.code,
          homeScore: match.score.fullTime.home,
          awayScore: match.score.fullTime.away,
          htHomeScore: match.score.halfTime.home,
          htAwayScore: match.score.halfTime.away,
          winner: match.score.winner,
          lastUpdated: new Date(match.lastUpdated),
        },
      });

      // Update Elo for finished matches
      if (match.status === 'FINISHED' && match.score.winner) {
        const homeTeam = await prisma.team.findUnique({ where: { id: match.homeTeam.id } });
        const awayTeam = await prisma.team.findUnique({ where: { id: match.awayTeam.id } });

        if (homeTeam && awayTeam) {
          let homeActual: number;
          let awayActual: number;

          if (match.score.winner === 'HOME_TEAM') {
            homeActual = 1; awayActual = 0;
          } else if (match.score.winner === 'AWAY_TEAM') {
            homeActual = 0; awayActual = 1;
          } else {
            homeActual = 0.5; awayActual = 0.5;
          }

          const newHomeElo = updateEloRating(homeTeam.eloRating, awayTeam.eloRating, homeActual);
          const newAwayElo = updateEloRating(awayTeam.eloRating, homeTeam.eloRating, awayActual);

          await prisma.team.update({ where: { id: homeTeam.id }, data: { eloRating: newHomeElo } });
          await prisma.team.update({ where: { id: awayTeam.id }, data: { eloRating: newAwayElo } });
        }
      }
    }

    console.log(`Synced ${matches.length} matches for ${league}`);
    return matches.length;
  } catch (error) {
    console.error(`Error syncing ${league}:`, error);
    return 0;
  }
}

export async function syncAll(): Promise<{ matchesSynced: number; status: 'success' | 'error'; message?: string }> {
  let totalSynced = 0;
  const errors: string[] = [];

  for (const league of LEAGUES) {
    try {
      const count = await syncLeagueMatches(league);
      totalSynced += count;
      // Rate limit: 10 requests/minute for free tier
      await new Promise(resolve => setTimeout(resolve, 6000));
    } catch (error) {
      errors.push(`${league}: ${error}`);
    }
  }

  if (errors.length > 0) {
    return { matchesSynced: totalSynced, status: 'error', message: errors.join(', ') };
  }

  return { matchesSynced: totalSynced, status: 'success' };
}
