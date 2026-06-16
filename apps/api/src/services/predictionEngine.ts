import { Prediction, ScorePrediction } from '@sports/shared';
import prisma from '../models/db';

const K_FACTOR = 32;
const HOME_ADVANTAGE = 1.3;
const MAX_GOALS = 6;

function factorial(n: number): number {
  if (n === 0 || n === 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function poissonProbability(lambda: number, k: number): number {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function updateEloRating(ratingA: number, ratingB: number, actualA: number): number {
  const expected = expectedScore(ratingA, ratingB);
  return ratingA + K_FACTOR * (actualA - expected);
}

async function getTeamStats(teamId: number, limit: number = 10): Promise<{
  avgGoalsScored: number;
  avgGoalsConceded: number;
  recentForm: string[];
}> {
  const matches = await prisma.match.findMany({
    where: {
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      status: 'FINISHED',
    },
    orderBy: { utcDate: 'desc' },
    take: limit,
  });

  if (matches.length === 0) {
    return { avgGoalsScored: 1.5, avgGoalsConceded: 1.5, recentForm: [] };
  }

  let totalGoalsScored = 0;
  let totalGoalsConceded = 0;
  const form: string[] = [];

  for (const match of matches) {
    const isHome = match.homeTeamId === teamId;
    const goalsScored = isHome ? (match.homeScore ?? 0) : (match.awayScore ?? 0);
    const goalsConceded = isHome ? (match.awayScore ?? 0) : (match.homeScore ?? 0);

    totalGoalsScored += goalsScored;
    totalGoalsConceded += goalsConceded;

    if (match.winner === 'HOME_TEAM') {
      form.push(isHome ? 'W' : 'L');
    } else if (match.winner === 'AWAY_TEAM') {
      form.push(isHome ? 'L' : 'W');
    } else if (match.winner === 'DRAW') {
      form.push('D');
    }
  }

  return {
    avgGoalsScored: totalGoalsScored / matches.length,
    avgGoalsConceded: totalGoalsConceded / matches.length,
    recentForm: form,
  };
}

export async function generatePrediction(matchId: number): Promise<Prediction | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { homeTeam: true, awayTeam: true },
  });

  if (!match) return null;

  const [homeStats, awayStats] = await Promise.all([
    getTeamStats(match.homeTeamId),
    getTeamStats(match.awayTeamId),
  ]);

  // Poisson lambdas
  const lambdaHome = homeStats.avgGoalsScored * HOME_ADVANTAGE;
  const lambdaAway = awayStats.avgGoalsScored;

  // Calculate score probabilities
  const scoreMatrix: ScorePrediction[] = [];
  let homeWinProb = 0;
  let drawProb = 0;
  let awayWinProb = 0;

  for (let h = 0; h < MAX_GOALS; h++) {
    for (let a = 0; a < MAX_GOALS; a++) {
      const prob = poissonProbability(lambdaHome, h) * poissonProbability(lambdaAway, a);
      scoreMatrix.push({ homeScore: h, awayScore: a, probability: prob });

      if (h > a) homeWinProb += prob;
      else if (h === a) drawProb += prob;
      else awayWinProb += prob;
    }
  }

  // Adjust with Elo
  const homeElo = match.homeTeam.eloRating;
  const awayElo = match.awayTeam.eloRating;
  const eloExpected = expectedScore(homeElo, awayElo);

  // Blend Poisson and Elo
  const totalPoisson = homeWinProb + drawProb + awayWinProb;
  const blendFactor = 0.7;

  const finalHomeWin = blendFactor * (homeWinProb / totalPoisson) + (1 - blendFactor) * eloExpected;
  const finalAwayWin = blendFactor * (awayWinProb / totalPoisson) + (1 - blendFactor) * (1 - eloExpected);
  const finalDraw = 1 - finalHomeWin - finalAwayWin;

  // Top 3 score predictions
  const topScores = scoreMatrix
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 3);

  // Confidence based on data availability and probability spread
  const maxProb = Math.max(finalHomeWin, finalDraw, finalAwayWin);
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  if (maxProb > 0.5) confidence = 'HIGH';
  else if (maxProb > 0.35) confidence = 'MEDIUM';
  else confidence = 'LOW';

  return {
    matchId,
    homeWinProbability: Math.max(0, Math.min(1, finalHomeWin)),
    drawProbability: Math.max(0, Math.min(1, finalDraw)),
    awayWinProbability: Math.max(0, Math.min(1, finalAwayWin)),
    expectedHomeGoals: lambdaHome,
    expectedAwayGoals: lambdaAway,
    topScorePredictions: topScores,
    confidence,
    generatedAt: new Date().toISOString(),
  };
}
