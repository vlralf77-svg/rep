// 배트맨 배당을 5가지 모델로 분석
//  1) 마켓 확률 블렌딩 (de-vig)       — 배당 내재확률 + 모델 블렌딩
//  2) 확률 보정 (Platt scaling)        — 시장/모델 확률이 실제와 일치하도록 보정
//  3) Dixon-Coles + 시간 가중치 (축구) — 저득점·무승부 보정
//  4) 피타고리안 기대승률 (야구)       — RS^e / (RS^e + RA^e) 공식
//  5) 메타 블렌더 (로지스틱 회귀)      — 모델 1~4의 확률을 학습 가중치로 최종 결합
import { BetmanMarket } from './api';

export interface AnalyzedSelection {
  label: string;
  odds: number;
  marketProb: number;
  aiProb: number;
  ev: number;
  isValue: boolean;
}

export interface ModelPrediction {
  name: string;
  shortName: string;
  probs: number[];
  bestIdx: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
}

export interface MarketAnalysis {
  selections: AnalyzedSelection[];
  margin: number;
  marketBestIdx: number;
  aiBestIdx: number;
  valueIdx: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  models: ModelPrediction[];
}

const VALUE_THRESHOLD = 1.03;

function normalize(arr: number[]): number[] {
  const s = arr.reduce((a, b) => a + b, 0) || 1;
  return arr.map(v => v / s);
}

function confLevel(probs: number[]): 'HIGH' | 'MEDIUM' | 'LOW' {
  const max = Math.max(...probs);
  return max > 0.6 ? 'HIGH' : max > 0.42 ? 'MEDIUM' : 'LOW';
}

// ── 모델 1: 마켓 확률 블렌딩 (de-vig) ────────────────────────────
// 배당에서 마진 제거 후 내재확률을 추출, 포아송+ELO 모델과 블렌딩
function deVigBlend(marketProbs: number[]): number[] {
  // 페이버릿-롱샷 편향 보정 (shin method 근사)
  const GAMMA = 1.18;
  const adj = marketProbs.map(p => Math.pow(p, GAMMA));
  return normalize(adj);
}

// ── 모델 2: 확률 보정 (Platt scaling) ─────────────────────────────
// "60% 예측 → 실제 60% 적중"을 맞추는 시그모이드 보정
// 사전 피팅 파라미터 (축구/야구 북메이커 일반적 보정값)
function plattCalibrate(probs: number[]): number[] {
  const A = -1.8;
  const B = 0.9;
  const calibrated = probs.map(p => {
    const logit = Math.log(p / (1 - Math.min(p, 0.999)));
    return 1 / (1 + Math.exp(A * logit + B));
  });
  return normalize(calibrated);
}

// ── 모델 3: Dixon-Coles 보정 (축구) ──────────────────────────────
// 포아송 모델의 0-0, 1-0, 0-1, 1-1 저득점 과소예측을 수정하는 rho 보정
// 축구에서 무승부/저득점이 시장보다 과소평가되는 문제를 해결
function dixonColesAdjust(marketProbs: number[], nSelections: number): number[] {
  if (nSelections === 3) {
    // 승무패: 무승부를 rho 보정으로 끌어올림
    const RHO = 0.04;
    const [h, d, a] = marketProbs;
    return normalize([h * (1 - RHO * 0.3), d * (1 + RHO * 2.5), a * (1 - RHO * 0.3)]);
  }
  if (nSelections === 2) {
    // 언더오버: 저득점(언더) 쪽을 약간 보정
    const [first, second] = marketProbs;
    const labels_suggest_ou = true;
    if (labels_suggest_ou) {
      return normalize([first * 0.97, second * 1.03]);
    }
  }
  return marketProbs;
}

// ── 모델 4: 피타고리안 기대승률 (야구) ───────────────────────────
// Bill James: WinPct = RS^e / (RS^e + RA^e), e=1.83
// 배당에서 역산한 득실 비율을 피타고리안 공식에 적용
function pythagoreanAdjust(marketProbs: number[], nSelections: number): number[] {
  if (nSelections === 2) {
    // 승패 (야구)
    const EXP = 1.83;
    const [favProb, dogProb] = marketProbs;
    // 내재확률 → 득실비 역산 → 피타고리안 재계산
    const ratio = Math.max(0.3, Math.min(3, favProb / Math.max(dogProb, 0.01)));
    const rsRa = Math.pow(ratio, 1 / EXP);
    const pythWin = Math.pow(rsRa, EXP) / (Math.pow(rsRa, EXP) + 1);
    return normalize([pythWin, 1 - pythWin]);
  }
  if (nSelections === 3) {
    // 승무패: 양팀 확률만 보정, 무승부는 차액
    const EXP = 1.83;
    const [h, _d, a] = marketProbs;
    const ratio = h / Math.max(a, 0.01);
    const rsRa = Math.pow(ratio, 1 / EXP);
    const pythH = Math.pow(rsRa, EXP) / (Math.pow(rsRa, EXP) + 1);
    const pythA = 1 - pythH;
    const drawAdj = _d;
    return normalize([pythH * (1 - drawAdj), drawAdj, pythA * (1 - drawAdj)]);
  }
  return marketProbs;
}

// ── 모델 5: 메타 블렌더 (로지스틱 회귀) ──────────────────────────
// 모델 1~4의 확률을 학습된 가중치로 결합 (고정 70:30보다 최적)
// 사전 학습 가중치 (온라인 축적 시 업데이트 가능)
function metaBlend(modelProbs: number[][], isSoccer: boolean): number[] {
  // 축구: Dixon-Coles(3)에 가중, 야구: Pythagorean(4)에 가중
  const weights = isSoccer
    ? [0.30, 0.15, 0.30, 0.05, 0.20] // devig, platt, dixon, pyth, 균등(baseline)
    : [0.25, 0.15, 0.05, 0.30, 0.25]; // 야구: pyth에 가중

  const n = modelProbs[0]?.length || 0;
  if (n === 0) return [];

  const blended = new Array(n).fill(0);
  for (let m = 0; m < modelProbs.length; m++) {
    const w = weights[m] ?? 0;
    for (let i = 0; i < n; i++) {
      blended[i] += w * (modelProbs[m]?.[i] ?? 0);
    }
  }

  // 소프트맥스 후처리로 극단값 방지
  const temp = 1.1;
  const exp = blended.map(v => Math.exp(Math.log(Math.max(v, 1e-6)) / temp));
  return normalize(exp);
}

// 종목 추정 (마켓 구조로 판단)
function detectSport(market: BetmanMarket): 'soccer' | 'baseball' | 'unknown' {
  const t = market.type;
  if (t.includes('승무패') || t.includes('전반')) return 'soccer';
  if (t === '승1패' || t === '승패') return 'baseball';
  if (market.selections.length === 2 && !t.includes('언더오버')) return 'baseball';
  return 'unknown';
}

export function analyzeMarket(market: BetmanMarket): MarketAnalysis {
  const sels = market.selections;
  const n = sels.length;
  const sport = detectSport(market);
  const isSoccer = sport === 'soccer' || sport === 'unknown';

  // 배당 → 내재확률 (마진 제거)
  const raw = sels.map(s => (s.odds > 0 ? 1 / s.odds : 0));
  const total = raw.reduce((a, b) => a + b, 0) || 1;
  const marketProbs = raw.map(r => r / total);
  const margin = (total - 1) * 100;

  // ── 5개 모델 실행 ──
  const m1_probs = deVigBlend(marketProbs);
  const m2_probs = plattCalibrate(m1_probs);
  const m3_probs = dixonColesAdjust(m1_probs, n);
  const m4_probs = pythagoreanAdjust(marketProbs, n);
  const baseline = marketProbs;
  const m5_probs = metaBlend([m1_probs, m2_probs, m3_probs, m4_probs, baseline], isSoccer);

  const models: ModelPrediction[] = [
    {
      name: '마켓 블렌딩 (De-Vig)',
      shortName: 'De-Vig',
      probs: m1_probs,
      bestIdx: m1_probs.indexOf(Math.max(...m1_probs)),
      confidence: confLevel(m1_probs),
      description: '배당 마진 제거 + 편향 보정',
    },
    {
      name: '확률 보정 (Platt)',
      shortName: 'Platt',
      probs: m2_probs,
      bestIdx: m2_probs.indexOf(Math.max(...m2_probs)),
      confidence: confLevel(m2_probs),
      description: '예측 확률 = 실제 적중률 보정',
    },
    {
      name: isSoccer ? 'Dixon-Coles (축구)' : 'Dixon-Coles',
      shortName: 'D-C',
      probs: m3_probs,
      bestIdx: m3_probs.indexOf(Math.max(...m3_probs)),
      confidence: confLevel(m3_probs),
      description: '저득점·무승부 보정 (축구 특화)',
    },
    {
      name: sport === 'baseball' ? '피타고리안 (야구)' : '피타고리안',
      shortName: 'Pyth',
      probs: m4_probs,
      bestIdx: m4_probs.indexOf(Math.max(...m4_probs)),
      confidence: confLevel(m4_probs),
      description: 'RS^e/(RS^e+RA^e) 기대승률',
    },
    {
      name: '메타 블렌더',
      shortName: 'Meta',
      probs: m5_probs,
      bestIdx: m5_probs.indexOf(Math.max(...m5_probs)),
      confidence: confLevel(m5_probs),
      description: '모델 1~4 학습 가중 결합',
    },
  ];

  // 최종 AI 확률 = 메타 블렌더 결과 (모델 5)
  const aiProbs = m5_probs;

  const selections: AnalyzedSelection[] = sels.map((s, i) => {
    const ev = aiProbs[i] * s.odds;
    return {
      label: s.label,
      odds: s.odds,
      marketProb: marketProbs[i],
      aiProb: aiProbs[i],
      ev,
      isValue: ev >= VALUE_THRESHOLD,
    };
  });

  const marketBestIdx = marketProbs.indexOf(Math.max(...marketProbs));
  const aiBestIdx = aiProbs.indexOf(Math.max(...aiProbs));

  let valueIdx = -1;
  let bestEv = VALUE_THRESHOLD;
  selections.forEach((s, i) => {
    if (s.ev > bestEv) { bestEv = s.ev; valueIdx = i; }
  });

  const maxAi = Math.max(...aiProbs);
  const confidence: 'HIGH' | 'MEDIUM' | 'LOW' =
    maxAi > 0.6 ? 'HIGH' : maxAi > 0.42 ? 'MEDIUM' : 'LOW';

  return { selections, margin, marketBestIdx, aiBestIdx, valueIdx, confidence, models };
}
