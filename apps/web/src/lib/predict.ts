// 클라이언트 사이드 예측 엔진 (백엔드 없이 앱 안에서 동작)

const HOME_ADVANTAGE = 1.3;
const MAX_GOALS = 8;
const FIRST_HALF_RATIO = 0.45;

function factorial(n: number): number {
  if (n <= 1) return 1;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function poisson(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

function eloExpected(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

export interface TeamStats {
  avgScored: number;
  avgConceded: number;
  elo: number;
  form: string[];
}

export interface BettingMarkets {
  ftHomeWin: number; ftDraw: number; ftAwayWin: number;
  over15: number; under15: number;
  over25: number; under25: number;
  over35: number; under35: number;
  htHomeWin: number; htDraw: number; htAwayWin: number;
  htOver05: number; htUnder05: number;
  htOver15: number; htUnder15: number;
}

export interface ScorePred { homeScore: number; awayScore: number; probability: number; }

export interface PredictionResult {
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  topScores: ScorePred[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  betting: BettingMarkets;
}

function calcOU(lh: number, la: number, line: number) {
  let under = 0;
  for (let h = 0; h <= MAX_GOALS; h++)
    for (let a = 0; a <= MAX_GOALS; a++)
      if (h + a < line) under += poisson(lh, h) * poisson(la, a);
  return { over: 1 - under, under };
}

function calcWDL(lh: number, la: number, eloBlend: number) {
  let hw = 0, d = 0, aw = 0;
  for (let h = 0; h <= MAX_GOALS; h++)
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = poisson(lh, h) * poisson(la, a);
      if (h > a) hw += p; else if (h === a) d += p; else aw += p;
    }
  const total = hw + d + aw;
  const bf = 0.7;
  const fHome = bf * (hw / total) + (1 - bf) * eloBlend;
  const fAway = bf * (aw / total) + (1 - bf) * (1 - eloBlend);
  const fDraw = Math.max(0, 1 - fHome - fAway);
  return { homeWin: fHome, draw: fDraw, awayWin: fAway };
}

export function predict(home: TeamStats, away: TeamStats, isBaseball = false): PredictionResult {
  // 야구는 홈 어드밴티지가 작고 무승부가 거의 없음
  const homeAdv = isBaseball ? 1.1 : HOME_ADVANTAGE;
  const leagueAvg = isBaseball ? 4.5 : 1.35;

  const lh = ((home.avgScored / leagueAvg) * (away.avgConceded / leagueAvg) * leagueAvg) * homeAdv;
  const la = (away.avgScored / leagueAvg) * (home.avgConceded / leagueAvg) * leagueAvg;
  const lhtH = lh * FIRST_HALF_RATIO;
  const lhtA = la * FIRST_HALF_RATIO;

  const elo = eloExpected(home.elo, away.elo);

  const ft = calcWDL(lh, la, elo);
  const ht = calcWDL(lhtH, lhtA, elo);
  const ou15 = calcOU(lh, la, 1.5);
  const ou25 = calcOU(lh, la, 2.5);
  const ou35 = calcOU(lh, la, 3.5);
  const htou05 = calcOU(lhtH, lhtA, 0.5);
  const htou15 = calcOU(lhtH, lhtA, 1.5);

  const scores: ScorePred[] = [];
  for (let h = 0; h <= MAX_GOALS; h++)
    for (let a = 0; a <= MAX_GOALS; a++)
      scores.push({ homeScore: h, awayScore: a, probability: poisson(lh, h) * poisson(la, a) });
  const topScores = scores.sort((x, y) => y.probability - x.probability).slice(0, 5);

  const maxP = Math.max(ft.homeWin, ft.draw, ft.awayWin);
  const confidence: 'HIGH' | 'MEDIUM' | 'LOW' = maxP > 0.5 ? 'HIGH' : maxP > 0.38 ? 'MEDIUM' : 'LOW';

  return {
    homeWinProbability: ft.homeWin,
    drawProbability: ft.draw,
    awayWinProbability: ft.awayWin,
    expectedHomeGoals: Math.round(lh * 10) / 10,
    expectedAwayGoals: Math.round(la * 10) / 10,
    topScores,
    confidence,
    betting: {
      ftHomeWin: ft.homeWin, ftDraw: ft.draw, ftAwayWin: ft.awayWin,
      over15: ou15.over, under15: ou15.under,
      over25: ou25.over, under25: ou25.under,
      over35: ou35.over, under35: ou35.under,
      htHomeWin: ht.homeWin, htDraw: ht.draw, htAwayWin: ht.awayWin,
      htOver05: htou05.over, htUnder05: htou05.under,
      htOver15: htou15.over, htUnder15: htou15.under,
    },
  };
}

export function eloUpdate(a: number, b: number, actualA: number): [number, number] {
  const exp = eloExpected(a, b);
  return [a + 32 * (actualA - exp), b + 32 * ((1 - actualA) - (1 - exp))];
}
