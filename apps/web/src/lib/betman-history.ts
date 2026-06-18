export interface MarketPrediction {
  marketType: string;   // "승무패", "언더오버" etc.
  aiPick: string;       // label of AI top pick
  aiProb: number;       // AI probability (0-1)
  marketPick: string;   // label of market-implied top pick
  line?: number;        // 언더오버/핸디캡 기준점수 (결과 판정에 필요)
  actual?: string;      // set after game: winner label, or undefined
  modelPicks?: { modelName: string; pick: string; prob: number }[];
  odds?: number;
}

export interface PredictionRecord {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  gameDate: string;
  savedAt: string;
  sport?: string;
  predictions: MarketPrediction[];
}

export interface AccuracyStats {
  total: number;
  correct: number;
  rate: number; // 0-1
  aiCorrect: number;
  marketCorrect: number;
}

const STORAGE_KEY = 'betman_predictions_v1';

export function getPredictions(): PredictionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PredictionRecord[];
  } catch {
    return [];
  }
}

export function savePredictions(record: PredictionRecord): void {
  const records = getPredictions();
  const idx = records.findIndex((r) => r.matchId === record.matchId);
  if (idx >= 0) {
    // 이미 저장된 예측은 덮어쓰지 않음 (배당 변동으로 aiPick이 바뀌는 것 방지)
    const existing = records[idx];
    const merged: PredictionRecord = {
      ...record,
      predictions: record.predictions.map((p) => {
        const old = existing.predictions.find((e) => e.marketType === p.marketType);
        // 기존 예측은 유지하되, 빠져있던 기준점수(line)는 보강
        if (old) return old.line == null && p.line != null ? { ...old, line: p.line } : old;
        return p;
      }),
    };
    // 기존에 없던 새 마켓만 추가
    for (const ep of existing.predictions) {
      if (!merged.predictions.some((p) => p.marketType === ep.marketType)) {
        merged.predictions.push(ep);
      }
    }
    records[idx] = merged;
  } else {
    records.push(record);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function setActualResult(matchId: string, marketType: string, actual: string): void {
  const records = getPredictions();
  const rec = records.find((r) => r.matchId === matchId);
  if (!rec) return;
  const pred = rec.predictions.find((p) => p.marketType === marketType);
  if (!pred) return;
  pred.actual = actual;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function getAccuracyStats(): AccuracyStats {
  const records = getPredictions();
  let total = 0;
  let aiCorrect = 0;
  let marketCorrect = 0;

  for (const rec of records) {
    for (const pred of rec.predictions) {
      if (pred.actual === undefined) continue;
      total++;
      if (pred.actual === pred.aiPick) aiCorrect++;
      if (pred.actual === pred.marketPick) marketCorrect++;
    }
  }

  const correct = aiCorrect; // primary "correct" = AI correct
  const rate = total > 0 ? correct / total : 0;
  return { total, correct, rate, aiCorrect, marketCorrect };
}

export function clearPredictions(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export interface ModelAccuracyStats {
  modelName: string;
  total: number;
  correct: number;
  rate: number;
}

export function getModelAccuracyStats(): ModelAccuracyStats[] {
  const records = getPredictions();
  const stats = new Map<string, { total: number; correct: number }>();

  for (const rec of records) {
    for (const pred of rec.predictions) {
      if (pred.actual === undefined || !pred.modelPicks) continue;
      for (const mp of pred.modelPicks) {
        const s = stats.get(mp.modelName) || { total: 0, correct: 0 };
        s.total++;
        if (pred.actual === mp.pick) s.correct++;
        stats.set(mp.modelName, s);
      }
    }
  }

  return Array.from(stats.entries()).map(([modelName, s]) => ({
    modelName,
    total: s.total,
    correct: s.correct,
    rate: s.total > 0 ? s.correct / s.total : 0,
  }));
}
