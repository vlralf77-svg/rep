import { Prediction, ScorePrediction, BettingMarkets } from '@sports/shared';
import prisma from '../models/db';

const K_FACTOR = 32;
const HOME_ADVANTAGE = 1.3;
const MAX_GOALS = 8;
// 전반전은 전체 득점의 약 45% 발생
const FIRST_HALF_RATIO = 0.45;

function factorial(n: number): number {
  if (n === 0 || n === 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function poissonProbability(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function updateEloRating(ratingA: number, ratingB: number, actualA: number): number {
  const expected = expectedScore(ratingA, ratingB);
  return ratingA + K_FACTOR * (actualA - expected);
}

function calcOverUnder(lambdaHome: number, lambdaAway: number, line: number) {
  let under = 0;
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      if (h + a < line) {
        under += poissonProbability(lambdaHome, h) * poissonProbability(lambdaAway, a);
      }
    }
  }
  return { over: 1 - under, under };
}

function calcWDL(lambdaHome: number, lambdaAway: number, eloBlend: number) {
  let homeWin = 0, draw = 0, awayWin = 0;
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = poissonProbability(lambdaHome, h) * poissonProbability(lambdaAway, a);
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
    }
  }
  const total = homeWin + draw + awayWin;
  const blendFactor = 0.7;
  const fHome = blendFactor * (homeWin / total) + (1 - blendFactor) * eloBlend;
  const fAway = blendFactor * (awayWin / total) + (1 - blendFactor) * (1 - eloBlend);
  const fDraw = Math.max(0, 1 - fHome - fAway);
  return { homeWin: fHome, draw: fDraw, awayWin: fAway };
}

async function getTeamStats(teamId: number, limit = 10) {
  const matches = await prisma.match.findMany({
    where: { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }], status: 'FINISHED' },
    orderBy: { utcDate: 'desc' },
    take: limit,
  });

  if (matches.length === 0) return { avgGoalsScored: 1.5, avgGoalsConceded: 1.5, recentForm: [] as string[] };

  let scored = 0, conceded = 0;
  const form: string[] = [];

  for (const m of matches) {
    const isHome = m.homeTeamId === teamId;
    scored += isHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0);
    conceded += isHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0);
    if (m.winner === 'HOME_TEAM') form.push(isHome ? 'W' : 'L');
    else if (m.winner === 'AWAY_TEAM') form.push(isHome ? 'L' : 'W');
    else form.push('D');
  }

  return { avgGoalsScored: scored / matches.length, avgGoalsConceded: conceded / matches.length, recentForm: form };
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

  const lambdaHome = homeStats.avgGoalsScored * HOME_ADVANTAGE;
  const lambdaAway = awayStats.avgGoalsScored;
  const lambdaHtHome = lambdaHome * FIRST_HALF_RATIO;
  const lambdaHtAway = lambdaAway * FIRST_HALF_RATIO;

  const eloExpected = expectedScore(match.homeTeam.eloRating, match.awayTeam.eloRating);

  // 풀타임 승/무/패
  const ft = calcWDL(lambdaHome, lambdaAway, eloExpected);

  // 전반전 승/무/패
  const ht = calcWDL(lambdaHtHome, lambdaHtAway, eloExpected);

  // 오버/언더 (2.5골)
  const ftOU25 = calcOverUnder(lambdaHome, lambdaAway, 2.5);
  const ftOU15 = calcOverUnder(lambdaHome, lambdaAway, 1.5);
  const ftOU35 = calcOverUnder(lambdaHome, lambdaAway, 3.5);

  // 전반 오버/언더 (0.5, 1.5)
  const htOU05 = calcOverUnder(lambdaHtHome, lambdaHtAway, 0.5);
  const htOU15 = calcOverUnder(lambdaHtHome, lambdaHtAway, 1.5);

  // 스코어 매트릭스
  const scoreMatrix: ScorePrediction[] = [];
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      const prob = poissonProbability(lambdaHome, h) * poissonProbability(lambdaAway, a);
      scoreMatrix.push({ homeScore: h, awayScore: a, probability: prob });
    }
  }
  const topScores = scoreMatrix.sort((a, b) => b.probability - a.probability).slice(0, 5);

  const maxProb = Math.max(ft.homeWin, ft.draw, ft.awayWin);
  const confidence: 'HIGH' | 'MEDIUM' | 'LOW' = maxProb > 0.5 ? 'HIGH' : maxProb > 0.35 ? 'MEDIUM' : 'LOW';

  const betting: BettingMarkets = {
    // 풀타임
    ftHomeWin: ft.homeWin,
    ftDraw: ft.draw,
    ftAwayWin: ft.awayWin,
    // 오버/언더
    over15: ftOU15.over,
    under15: ftOU15.under,
    over25: ftOU25.over,
    under25: ftOU25.under,
    over35: ftOU35.over,
    under35: ftOU35.under,
    // 전반 승/무/패
    htHomeWin: ht.homeWin,
    htDraw: ht.draw,
    htAwayWin: ht.awayWin,
    // 전반 오버/언더
    htOver05: htOU05.over,
    htUnder05: htOU05.under,
    htOver15: htOU15.over,
    htUnder15: htOU15.under,
  };

  return {
    matchId,
    homeWinProbability: ft.homeWin,
    drawProbability: ft.draw,
    awayWinProbability: ft.awayWin,
    expectedHomeGoals: lambdaHome,
    expectedAwayGoals: lambdaAway,
    topScorePredictions: topScores,
    confidence,
    betting,
    generatedAt: new Date().toISOString(),
  };
}
