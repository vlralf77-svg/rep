import { PredictionResult, ScorePrediction } from '@sports/shared';
import prisma from '../models/db';

const ELO_K = 32;
const HOME_ADVANTAGE = 1.1;
const DEFAULT_ELO = 1500;

function poisson(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let result = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) result *= lambda / i;
  return result;
}

function expectedElo(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function updateElo(ratingA: number, ratingB: number, outcome: number): [number, number] {
  const expA = expectedElo(ratingA, ratingB);
  const expB = 1 - expA;
  return [
    ratingA + ELO_K * (outcome - expA),
    ratingB + ELO_K * ((1 - outcome) - expB),
  ];
}

async function getTeamStats(teamId: number, isHome: boolean) {
  const recentMatches = await prisma.match.findMany({
    where: {
      status: 'FINISHED',
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    orderBy: { utcDate: 'desc' },
    take: 10,
  });

  if (recentMatches.length === 0) return { avgGoalsFor: 1.3, avgGoalsAgainst: 1.2 };

  let totalGoalsFor = 0;
  let totalGoalsAgainst = 0;
  let weightSum = 0;

  recentMatches.forEach((m, idx) => {
    const weight = idx < 5 ? 2 : 1;
    const isMatchHome = m.homeTeamId === teamId;
    const goalsFor = isMatchHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0);
    const goalsAgainst = isMatchHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0);
    totalGoalsFor += goalsFor * weight;
    totalGoalsAgainst += goalsAgainst * weight;
    weightSum += weight;
  });

  return {
    avgGoalsFor: totalGoalsFor / weightSum,
    avgGoalsAgainst: totalGoalsAgainst / weightSum,
  };
}

export async function computePrediction(matchId: number): Promise<PredictionResult> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { homeTeam: true, awayTeam: true },
  });

  if (!match) throw new Error(`Match ${matchId} not found`);

  const homeStats = await getTeamStats(match.homeTeamId, true);
  const awayStats = await getTeamStats(match.awayTeamId, false);

  const leagueAvgGoals = 1.35;
  const lambdaHome =
    (homeStats.avgGoalsFor / leagueAvgGoals) *
    (awayStats.avgGoalsAgainst / leagueAvgGoals) *
    leagueAvgGoals *
    HOME_ADVANTAGE;
  const lambdaAway =
    (awayStats.avgGoalsFor / leagueAvgGoals) *
    (homeStats.avgGoalsAgainst / leagueAvgGoals) *
    leagueAvgGoals;

  let homeWin = 0, draw = 0, awayWin = 0;
  const scoreProbs: ScorePrediction[] = [];

  for (let h = 0; h <= 5; h++) {
    for (let a = 0; a <= 5; a++) {
      const p = poisson(lambdaHome, h) * poisson(lambdaAway, a);
      scoreProbs.push({ homeScore: h, awayScore: a, probability: p });
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
    }
  }

  const topScores = scoreProbs
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 3)
    .map(s => ({ ...s, probability: Math.round(s.probability * 1000) / 10 }));

  const homeElo = match.homeTeam.eloRating ?? DEFAULT_ELO;
  const awayElo = match.awayTeam.eloRating ?? DEFAULT_ELO;
  const eloFactor = expectedElo(homeElo, awayElo);

  const blendedHomeWin = homeWin * 0.7 + eloFactor * 0.3;
  const total = blendedHomeWin + draw + awayWin;

  const rationale = [
    `홈팀 ${match.homeTeam.name}: 최근 평균 ${homeStats.avgGoalsFor.toFixed(1)}득점 / ${homeStats.avgGoalsAgainst.toFixed(1)}실점`,
    `원정팀 ${match.awayTeam.name}: 최근 평균 ${awayStats.avgGoalsFor.toFixed(1)}득점 / ${awayStats.avgGoalsAgainst.toFixed(1)}실점`,
    `Elo 레이팅 — 홈: ${homeElo.toFixed(0)}, 원정: ${awayElo.toFixed(0)}`,
    `홈 어드밴티지 계수 x${HOME_ADVANTAGE} 적용`,
  ].join(' | ');

  const result: PredictionResult = {
    matchId,
    homeWinProbability: Math.round((blendedHomeWin / total) * 1000) / 10,
    drawProbability: Math.round((draw / total) * 1000) / 10,
    awayWinProbability: Math.round((awayWin / total) * 1000) / 10,
    expectedHomeGoals: Math.round(lambdaHome * 10) / 10,
    expectedAwayGoals: Math.round(lambdaAway * 10) / 10,
    topScores,
    homeElo,
    awayElo,
    rationale,
    computedAt: new Date().toISOString(),
  };

  await prisma.prediction.upsert({
    where: { matchId },
    update: {
      homeWinProbability: result.homeWinProbability,
      drawProbability: result.drawProbability,
      awayWinProbability: result.awayWinProbability,
      expectedHomeGoals: result.expectedHomeGoals,
      expectedAwayGoals: result.expectedAwayGoals,
      topScores: JSON.stringify(result.topScores),
      homeElo: result.homeElo,
      awayElo: result.awayElo,
      rationale: result.rationale,
      computedAt: new Date(),
    },
    create: {
      matchId,
      homeWinProbability: result.homeWinProbability,
      drawProbability: result.drawProbability,
      awayWinProbability: result.awayWinProbability,
      expectedHomeGoals: result.expectedHomeGoals,
      expectedAwayGoals: result.expectedAwayGoals,
      topScores: JSON.stringify(result.topScores),
      homeElo: result.homeElo,
      awayElo: result.awayElo,
      rationale: result.rationale,
    },
  });

  return result;
}
