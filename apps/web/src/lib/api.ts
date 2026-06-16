// 백엔드 없이 앱에서 직접 스포츠 API를 호출 (Capacitor 네이티브 HTTP로 CORS 우회)
import axios from 'axios';
import { predict, eloUpdate, TeamStats, PredictionResult } from './predict';

const FOOTBALL_API_KEY = '6942278d1b1e447bb04375f4b84ce286';
const FOOTBALL_BASE = 'https://api.football-data.org/v4';
const SPORTSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/3';
const KBO_LEAGUE_ID = '4342';
const BETMAN_JSON_URL = 'https://raw.githubusercontent.com/vlralf77-svg/rep/main/data/betman.json';

export type Sport = 'football' | 'baseball';

export interface AppTeam {
  id: string;
  name: string;
  shortName: string;
  crest: string;
  elo: number;
}

export interface AppMatch {
  id: string;
  sport: Sport;
  league: string;
  leagueName: string;
  utcDate: string;
  status: string;
  homeTeam: AppTeam;
  awayTeam: AppTeam;
  homeScore: number | null;
  awayScore: number | null;
}

const STORAGE_KEY = 'sports_data_v1';

interface StoredData {
  matches: AppMatch[];
  teamStats: Record<string, { scored: number[]; conceded: number[]; elo: number }>;
  lastSync: string;
}

function loadStore(): StoredData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { matches: [], teamStats: {}, lastSync: '' };
}

function saveStore(data: StoredData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ---------- 축구 (football-data.org) ----------
const FOOTBALL_LEAGUES = [
  { code: 'PL', name: '프리미어리그' },
  { code: 'BL1', name: '분데스리가' },
  { code: 'SA', name: '세리에 A' },
  { code: 'PD', name: '라리가' },
  { code: 'FL1', name: '리그 앙' },
];

async function syncFootballLeague(code: string, name: string): Promise<AppMatch[]> {
  const res = await axios.get(`${FOOTBALL_BASE}/competitions/${code}/matches`, {
    headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
    timeout: 15000,
  });
  const matches = res.data.matches || [];
  return matches.map((m: any): AppMatch => ({
    id: `f_${m.id}`,
    sport: 'football',
    league: code,
    leagueName: name,
    utcDate: m.utcDate,
    status: m.status,
    homeTeam: { id: `f_${m.homeTeam.id}`, name: m.homeTeam.name, shortName: m.homeTeam.shortName || m.homeTeam.tla || m.homeTeam.name, crest: m.homeTeam.crest || '', elo: 1500 },
    awayTeam: { id: `f_${m.awayTeam.id}`, name: m.awayTeam.name, shortName: m.awayTeam.shortName || m.awayTeam.tla || m.awayTeam.name, crest: m.awayTeam.crest || '', elo: 1500 },
    homeScore: m.score?.fullTime?.home ?? null,
    awayScore: m.score?.fullTime?.away ?? null,
  }));
}

// ---------- 야구 (TheSportsDB KBO) ----------
function parseKboDate(dateEvent: string, strTime: string | null, ts: string | null): string {
  if (ts) return new Date(ts).toISOString();
  const time = strTime || '18:00:00';
  return new Date(`${dateEvent}T${time}+09:00`).toISOString();
}

async function syncKBO(): Promise<AppMatch[]> {
  const teamsRes = await axios.get(`${SPORTSDB_BASE}/lookup_all_teams.php?id=${KBO_LEAGUE_ID}`, { timeout: 15000 });
  const teamMap: Record<string, AppTeam> = {};
  for (const t of (teamsRes.data.teams || [])) {
    teamMap[t.idTeam] = { id: `b_${t.idTeam}`, name: t.strTeam, shortName: t.strTeamShort || t.strTeam, crest: t.strBadge || '', elo: 1500 };
  }

  const year = new Date().getFullYear();
  const [season, next, last] = await Promise.all([
    axios.get(`${SPORTSDB_BASE}/eventsseason.php?id=${KBO_LEAGUE_ID}&s=${year}`, { timeout: 15000 }).then(r => r.data.events || []).catch(() => []),
    axios.get(`${SPORTSDB_BASE}/eventsnextleague.php?id=${KBO_LEAGUE_ID}`, { timeout: 15000 }).then(r => r.data.events || []).catch(() => []),
    axios.get(`${SPORTSDB_BASE}/eventspastleague.php?id=${KBO_LEAGUE_ID}`, { timeout: 15000 }).then(r => r.data.events || []).catch(() => []),
  ]);

  const seen = new Set<string>();
  const all = [...season, ...next, ...last].filter((e: any) => e.idEvent && !seen.has(e.idEvent) && seen.add(e.idEvent));

  const result: AppMatch[] = [];
  for (const e of all) {
    const home = teamMap[e.idHomeTeam] || { id: `b_${e.idHomeTeam}`, name: e.strHomeTeam, shortName: e.strHomeTeam, crest: '', elo: 1500 };
    const away = teamMap[e.idAwayTeam] || { id: `b_${e.idAwayTeam}`, name: e.strAwayTeam, shortName: e.strAwayTeam, crest: '', elo: 1500 };
    const hs = e.intHomeScore !== null && e.intHomeScore !== '' ? parseInt(e.intHomeScore) : null;
    const as = e.intAwayScore !== null && e.intAwayScore !== '' ? parseInt(e.intAwayScore) : null;
    let status = 'SCHEDULED';
    if (e.strPostponed === 'yes') status = 'POSTPONED';
    else if (hs !== null && as !== null) status = 'FINISHED';
    result.push({
      id: `b_${e.idEvent}`,
      sport: 'baseball',
      league: 'KBO',
      leagueName: 'KBO 리그',
      utcDate: parseKboDate(e.dateEvent, e.strTime, e.strTimestamp),
      status,
      homeTeam: home,
      awayTeam: away,
      homeScore: hs,
      awayScore: as,
    });
  }
  return result;
}

// ---------- 통합 동기화 ----------
export async function syncSport(sport: Sport): Promise<{ count: number; error?: string }> {
  const store = loadStore();
  try {
    let newMatches: AppMatch[] = [];
    if (sport === 'football') {
      for (const lg of FOOTBALL_LEAGUES) {
        try {
          const ms = await syncFootballLeague(lg.code, lg.name);
          newMatches.push(...ms);
          await new Promise(r => setTimeout(r, 6500)); // rate limit
        } catch (e) {
          console.error(`${lg.code} sync failed`, e);
        }
      }
    } else {
      newMatches = await syncKBO();
    }

    // 기존에서 같은 sport 제거 후 병합
    const others = store.matches.filter(m => m.sport !== sport);
    store.matches = [...others, ...newMatches];

    // 팀 스탯 재계산 (완료된 경기 기준)
    recomputeStats(store);
    store.lastSync = new Date().toISOString();
    saveStore(store);

    return { count: newMatches.length };
  } catch (e: any) {
    return { count: 0, error: e?.message || String(e) };
  }
}

function recomputeStats(store: StoredData) {
  const stats: StoredData['teamStats'] = {};
  const getT = (id: string) => stats[id] || (stats[id] = { scored: [], conceded: [], elo: 1500 });

  const finished = store.matches
    .filter(m => m.status === 'FINISHED' && m.homeScore !== null && m.awayScore !== null)
    .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());

  for (const m of finished) {
    const h = getT(m.homeTeam.id);
    const a = getT(m.awayTeam.id);
    h.scored.push(m.homeScore!); h.conceded.push(m.awayScore!);
    a.scored.push(m.awayScore!); a.conceded.push(m.homeScore!);
    const outcome = m.homeScore! > m.awayScore! ? 1 : m.homeScore! === m.awayScore! ? 0.5 : 0;
    const [nh, na] = eloUpdate(h.elo, a.elo, outcome);
    h.elo = nh; a.elo = na;
  }
  store.teamStats = stats;
}

function teamStatsFor(store: StoredData, id: string, isBaseball: boolean): TeamStats {
  const s = store.teamStats[id];
  const def = isBaseball ? 4.5 : 1.3;
  if (!s || s.scored.length === 0) return { avgScored: def, avgConceded: def, elo: s?.elo ?? 1500, form: [] };
  const recent = (arr: number[]) => arr.slice(-10);
  const avg = (arr: number[]) => arr.reduce((x, y) => x + y, 0) / arr.length;
  return {
    avgScored: avg(recent(s.scored)),
    avgConceded: avg(recent(s.conceded)),
    elo: s.elo,
    form: [],
  };
}

// ---------- 조회 ----------
export function getMatches(sport: Sport, status?: string): AppMatch[] {
  const store = loadStore();
  let list = store.matches.filter(m => m.sport === sport);
  if (status) list = list.filter(m => m.status === status);
  return list.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
}

export function getMatchById(id: string): AppMatch | undefined {
  return loadStore().matches.find(m => m.id === id);
}

export function getPrediction(matchId: string): { match: AppMatch; prediction: PredictionResult } | null {
  const store = loadStore();
  const match = store.matches.find(m => m.id === matchId);
  if (!match) return null;
  const isBaseball = match.sport === 'baseball';
  const home = teamStatsFor(store, match.homeTeam.id, isBaseball);
  const away = teamStatsFor(store, match.awayTeam.id, isBaseball);
  const prediction = predict(home, away, isBaseball);
  return { match, prediction };
}

export function getLastSync(): string {
  return loadStore().lastSync;
}

// ── Betman 데이터 ────────────────────────────────────────────────────────────
export interface BetmanGame {
  gameId: string;
  round: string;
  gameDate: string;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  odds: { homeWin: number; draw: number; awayWin: number };
  handicap?: string | null;
  overUnder?: string | null;
  status: string;
  result: string | null;
  raw?: string;
}

export interface BetmanData {
  updatedAt: string;
  error?: string;
  toto: BetmanGame[];
  proto: BetmanGame[];
}

export async function fetchBetmanData(): Promise<BetmanData> {
  const res = await axios.get<BetmanData>(BETMAN_JSON_URL, { timeout: 10000 });
  return res.data;
}

export { FOOTBALL_LEAGUES };
