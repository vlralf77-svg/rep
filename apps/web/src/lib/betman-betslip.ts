import { BetPick } from '../components/BetmanGames';

const PICKS_KEY = 'betman_slip_picks_v1';
const AMOUNT_KEY = 'betman_slip_amount_v1';
const SAVED_KEY = 'betman_saved_bets_v1';

// ── 현재 작성 중인 슬립 (앱 재시작해도 유지) ──────────────────────
export function loadPicks(): BetPick[] {
  try {
    const raw = localStorage.getItem(PICKS_KEY);
    return raw ? (JSON.parse(raw) as BetPick[]) : [];
  } catch {
    return [];
  }
}
export function savePicks(picks: BetPick[]): void {
  localStorage.setItem(PICKS_KEY, JSON.stringify(picks));
}

export function loadAmount(): string {
  return localStorage.getItem(AMOUNT_KEY) || '';
}
export function saveAmount(amount: string): void {
  localStorage.setItem(AMOUNT_KEY, amount);
}

// ── 저장된 베팅 기록 ──────────────────────────────────────────────
export interface SavedBet {
  id: string;
  savedAt: string;
  picks: BetPick[];
  amount: number;
  combinedOdds: number;
  payout: number;
}

export function getSavedBets(): SavedBet[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as SavedBet[]) : [];
  } catch {
    return [];
  }
}

export function addSavedBet(bet: Omit<SavedBet, 'id' | 'savedAt'>): SavedBet {
  const list = getSavedBets();
  const record: SavedBet = { ...bet, id: `${Date.now()}`, savedAt: new Date().toISOString() };
  list.unshift(record);
  localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  return record;
}

export function removeSavedBet(id: string): void {
  const list = getSavedBets().filter((b) => b.id !== id);
  localStorage.setItem(SAVED_KEY, JSON.stringify(list));
}
