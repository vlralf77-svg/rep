// 배트맨 배당을 2가지 방법으로 분석
//  1) 시장 배당 확률 : 배당 역산(1/odds) 후 마진 제거 정규화 (북메이커 관점)
//  2) AI 보정 예측   : 페이버릿-롱샷 편향 보정 + 가치 베팅(기대값) 탐지
import { BetmanMarket } from './api';

export interface AnalyzedSelection {
  label: string;
  odds: number;
  marketProb: number; // 시장 역산 확률
  aiProb: number;     // AI 보정 확률
  ev: number;         // 기대값 = aiProb * odds (1보다 크면 가치)
  isValue: boolean;   // 가치 베팅 여부
}

export interface MarketAnalysis {
  selections: AnalyzedSelection[];
  margin: number;        // 북메이커 마진 %
  marketBestIdx: number; // 시장 기준 최고 확률
  aiBestIdx: number;     // AI 기준 최고 확률
  valueIdx: number;      // 최고 기대값(가치) 인덱스, 없으면 -1
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

// 페이버릿-롱샷 편향 보정 계수 (>1 이면 강팀 확률을 끌어올리고 약팀 확률을 낮춤)
const GAMMA = 1.18;
// 가치 베팅 판단 임계값 (기대값이 이 이상이면 "가치 있음")
const VALUE_THRESHOLD = 1.03;

export function analyzeMarket(market: BetmanMarket): MarketAnalysis {
  const sels = market.selections;
  const raw = sels.map((s) => (s.odds > 0 ? 1 / s.odds : 0));
  const total = raw.reduce((a, b) => a + b, 0) || 1;
  const marketProbs = raw.map((r) => r / total);
  const margin = (total - 1) * 100;

  // AI 보정: 시장 확률에 멱변환을 적용해 편향 제거 후 재정규화
  const adj = marketProbs.map((p) => Math.pow(p, GAMMA));
  const adjTotal = adj.reduce((a, b) => a + b, 0) || 1;
  const aiProbs = adj.map((a) => a / adjTotal);

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

  // 가치 베팅: 기대값이 가장 높고 임계값을 넘는 항목
  let valueIdx = -1;
  let bestEv = VALUE_THRESHOLD;
  selections.forEach((s, i) => {
    if (s.ev > bestEv) { bestEv = s.ev; valueIdx = i; }
  });

  const maxAi = Math.max(...aiProbs);
  const confidence: 'HIGH' | 'MEDIUM' | 'LOW' =
    maxAi > 0.6 ? 'HIGH' : maxAi > 0.42 ? 'MEDIUM' : 'LOW';

  return { selections, margin, marketBestIdx, aiBestIdx, valueIdx, confidence };
}
