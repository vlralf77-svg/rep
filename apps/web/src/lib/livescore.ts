import axios from 'axios';
import { BetmanGame } from './api';

// ── 네이버 스포츠 API (한글 팀명 → betman과 바로 매칭) ─────────────
const NAVER_SCOREBOARD = 'https://api.sports.naver.com/scoreboard';
const NAVER_SCHEDULE = 'https://api.sports.naver.com/schedule/games';

// football-data.org 폴백
const FOOTBALL_API_KEY = '6942278d1b1e447bb04375f4b84ce286';
const FOOTBALL_BASE = 'https://api.football-data.org/v4';

export interface LiveScore {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: 'LIVE' | 'FINISHED' | 'SCHEDULED';
  minute?: number;
  timestamp: number;
  sport: string;
  inning?: string;
}

function todayStr(): string {
  // 한국 시간 기준
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function yesterdayStr(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// ── 네이버 스포츠 스코어보드 ─────────────────────────────────────
// 네이버 API 응답 형식 (추정 기반, 실제 응답에 맞춰 조정 필요)
interface NaverGame {
  gameId?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamScore?: number;
  awayTeamScore?: number;
  statusCode?: string;
  statusInfo?: string;
  gameDateTime?: string;
  startTime?: string;
  categoryId?: string;
  currentInning?: string;
  currentPeriodName?: string;
  homeTeam?: { name?: string; score?: number };
  awayTeam?: { name?: string; score?: number };
  // 다양한 응답 형태 대응
  [key: string]: any;
}

function parseNaverStatus(statusCode: string | undefined, statusInfo: string | undefined): LiveScore['status'] {
  const code = (statusCode || '').toUpperCase();
  const info = (statusInfo || '');
  if (code === 'RESULT' || code === 'FINAL' || code === 'END' || info.includes('종료') || code === 'FINISHED') return 'FINISHED';
  if (code === 'PROGRESS' || code === 'PLAYING' || code === 'LIVE' || info.includes('진행') || info.includes('회')) return 'LIVE';
  return 'SCHEDULED';
}

function parseNaverGames(games: any[], sport: string): LiveScore[] {
  const scores: LiveScore[] = [];
  for (const g of games) {
    const home = g.homeTeamName || g.homeTeam?.name || g.homeTeam?.teamName || '';
    const away = g.awayTeamName || g.awayTeam?.name || g.awayTeam?.teamName || '';
    const hs = g.homeTeamScore ?? g.homeTeam?.score ?? g.homeScore ?? 0;
    const as_ = g.awayTeamScore ?? g.awayTeam?.score ?? g.awayScore ?? 0;
    const dt = g.gameDateTime || g.startTime || g.gameDate || '';
    const ts = dt ? new Date(dt).getTime() : 0;
    const status = parseNaverStatus(g.statusCode || g.gameStatus, g.statusInfo || g.statusText);
    const inning = g.currentInning || g.currentPeriodName || g.statusInfo || undefined;

    if (!home && !away) continue;
    scores.push({
      homeTeam: home, awayTeam: away,
      homeScore: typeof hs === 'number' ? hs : parseInt(hs) || 0,
      awayScore: typeof as_ === 'number' ? as_ : parseInt(as_) || 0,
      status, timestamp: ts || Date.now(), sport,
      minute: status === 'LIVE' ? undefined : undefined,
      inning: status === 'LIVE' ? inning : undefined,
    });
  }
  return scores;
}

async function fetchNaverScores(): Promise<LiveScore[]> {
  const scores: LiveScore[] = [];
  const today = todayStr();
  const yesterday = yesterdayStr();

  // 카테고리: kbo(야구), wfootball(해외축구), kfootball(국내축구), kleague(K리그)
  const categories = [
    { id: 'kbo', sport: '야구' },
    { id: 'wfootball', sport: '축구' },
    { id: 'kfootball', sport: '축구' },
    { id: 'kleague', sport: '축구' },
  ];

  for (const day of [today, yesterday]) {
    for (const cat of categories) {
      try {
        // 스코어보드 API 시도
        const res = await axios.get(NAVER_SCOREBOARD, {
          params: { date: day, category: cat.id },
          headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://m.sports.naver.com/' },
          timeout: 8000,
        });
        const data = res.data;
        const games = data?.games || data?.result?.games || data?.scoreboardList || data || [];
        if (Array.isArray(games) && games.length > 0) {
          scores.push(...parseNaverGames(games, cat.sport));
          continue;
        }
      } catch { /* 폴백 시도 */ }

      try {
        // 스케줄 API 폴백
        const res = await axios.get(NAVER_SCHEDULE, {
          params: { date: day, category: cat.id },
          headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://m.sports.naver.com/' },
          timeout: 8000,
        });
        const data = res.data;
        const games = data?.games || data?.result?.games || data || [];
        if (Array.isArray(games)) {
          scores.push(...parseNaverGames(games, cat.sport));
        }
      } catch {
        // 이 카테고리 건너뜀
      }
    }
  }

  return scores;
}

// ── football-data.org 폴백 (네이버 실패 시) ──────────────────────
async function fetchFootballFallback(): Promise<LiveScore[]> {
  const scores: LiveScore[] = [];
  const today = todayStr();
  const yesterday = yesterdayStr();
  try {
    const res = await axios.get(`${FOOTBALL_BASE}/matches`, {
      headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
      params: { dateFrom: yesterday, dateTo: today },
      timeout: 10000,
    });
    for (const m of (res.data.matches || [])) {
      const ts = new Date(m.utcDate).getTime();
      const st = m.status;
      const status: LiveScore['status'] =
        ['IN_PLAY', 'PAUSED', 'HALFTIME', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'].includes(st) ? 'LIVE'
          : st === 'FINISHED' ? 'FINISHED' : 'SCHEDULED';
      scores.push({
        homeTeam: m.homeTeam?.name || '',
        awayTeam: m.awayTeam?.name || '',
        homeScore: m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? 0,
        awayScore: m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? 0,
        status, minute: m.minute ?? undefined,
        timestamp: ts, sport: '축구',
      });
    }
  } catch (e) {
    console.error('[livescore] football fallback failed', e);
  }
  return scores;
}

// ── 통합 라이브스코어 (네이버 우선 → 폴백) ──────────────────────
export async function fetchLiveScores(): Promise<LiveScore[]> {
  // 네이버 스포츠 먼저 시도
  let scores = await fetchNaverScores();

  // 네이버에서 축구 데이터 못 가져왔으면 football-data.org 폴백
  const hasFootball = scores.some(s => s.sport === '축구' && s.status !== 'SCHEDULED');
  if (!hasFootball) {
    const fallback = await fetchFootballFallback();
    scores.push(...fallback);
  }

  return scores;
}

// ── betman 경기와 라이브스코어 매칭 ──────────────────────────────
export function matchScore(game: BetmanGame, scores: LiveScore[]): LiveScore | null {
  if (!game.gameDate) return null;
  const gameTs = new Date(game.gameDate).getTime();
  const TOLERANCE = 30 * 60 * 1000;

  // 1차: 같은 종목 + 시간 근접 + 팀명 포함
  for (const s of scores) {
    if (s.sport !== game.sport) continue;
    if (Math.abs(s.timestamp - gameTs) > TOLERANCE) continue;
    const homeMatch = game.homeTeam.includes(s.homeTeam) || s.homeTeam.includes(game.homeTeam);
    const awayMatch = game.awayTeam.includes(s.awayTeam) || s.awayTeam.includes(game.awayTeam);
    if (homeMatch && awayMatch) return s;
  }

  // 2차: 팀명 한쪽만 매칭 + 시간 근접
  for (const s of scores) {
    if (s.sport !== game.sport) continue;
    if (Math.abs(s.timestamp - gameTs) > TOLERANCE) continue;
    const homeMatch = game.homeTeam.includes(s.homeTeam) || s.homeTeam.includes(game.homeTeam);
    const awayMatch = game.awayTeam.includes(s.awayTeam) || s.awayTeam.includes(game.awayTeam);
    if (homeMatch || awayMatch) return s;
  }

  // 3차: 시간만으로 매칭 (5분 이내)
  const tight = scores
    .filter(s => s.sport === game.sport && Math.abs(s.timestamp - gameTs) < 5 * 60 * 1000);
  if (tight.length === 1) return tight[0];

  return null;
}

// ── 스코어 → 마켓 결과 자동 판정 ────────────────────────────────
export function determineResult(
  marketType: string,
  homeScore: number,
  awayScore: number,
  line?: number,
): string | null {
  if (marketType.includes('승무패') || marketType === '전반 승무패') {
    return homeScore > awayScore ? '승' : homeScore === awayScore ? '무' : '패';
  }
  if (marketType.includes('승1패') || marketType === '승패') {
    return homeScore > awayScore ? '승' : '패';
  }
  if (marketType.includes('언더오버')) {
    if (line == null) return null;
    const total = homeScore + awayScore;
    return total > line ? '오버' : total < line ? '언더' : null;
  }
  if (marketType.includes('핸디캡')) {
    if (line == null) return null;
    const adj = homeScore + line;
    return adj > awayScore ? '승' : adj === awayScore ? '무' : '패';
  }
  return null;
}
