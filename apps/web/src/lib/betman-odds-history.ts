import { BetmanGame } from './api';

export interface OddsSnapshot {
  matchId: string;
  marketType: string;
  odds: number[];
  labels: string[];
  timestamp: string;
}

const STORAGE_KEY = 'betman_odds_history_v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function loadAll(): OddsSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as OddsSnapshot[] : [];
  } catch {
    return [];
  }
}

function saveAll(snapshots: OddsSnapshot[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
}

export function saveOddsSnapshot(games: BetmanGame[]): void {
  const now = new Date().toISOString();
  const cutoff = Date.now() - MAX_AGE_MS;
  let all = loadAll().filter(s => new Date(s.timestamp).getTime() > cutoff);

  for (const game of games) {
    for (const m of game.markets) {
      const last = all.filter(s => s.matchId === game.matchId && s.marketType === m.type).slice(-1)[0];
      const odds = m.selections.map(s => s.odds);
      if (last && JSON.stringify(last.odds) === JSON.stringify(odds)) continue;
      all.push({
        matchId: game.matchId,
        marketType: m.type,
        odds,
        labels: m.selections.map(s => s.label),
        timestamp: now,
      });
    }
  }
  saveAll(all);
}

export function getOddsHistory(matchId: string, marketType: string): OddsSnapshot[] {
  return loadAll().filter(s => s.matchId === matchId && s.marketType === marketType)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function detectSharpMove(history: OddsSnapshot[]): { direction: string; magnitude: number; label: string } | null {
  if (history.length < 2) return null;
  const first = history[0];
  const last = history[history.length - 1];

  let maxChange = 0;
  let maxIdx = 0;
  for (let i = 0; i < first.odds.length; i++) {
    const change = Math.abs((last.odds[i] - first.odds[i]) / first.odds[i]);
    if (change > maxChange) {
      maxChange = change;
      maxIdx = i;
    }
  }

  if (maxChange < 0.03) return null;

  const diff = last.odds[maxIdx] - first.odds[maxIdx];
  const firstBest = first.odds.indexOf(Math.min(...first.odds));
  const lastBest = last.odds.indexOf(Math.min(...last.odds));

  if (maxChange >= 0.05 && firstBest !== lastBest) {
    return {
      direction: 'sharp',
      magnitude: maxChange * 100,
      label: `${first.labels[firstBest]}->${last.labels[lastBest]}`,
    };
  }

  return {
    direction: diff > 0 ? 'up' : 'down',
    magnitude: maxChange * 100,
    label: last.labels[maxIdx],
  };
}
