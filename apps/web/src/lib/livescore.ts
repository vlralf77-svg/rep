import axios from 'axios';
import { BetmanGame } from './api';

const FOOTBALL_API_KEY = '6942278d1b1e447bb04375f4b84ce286';
const FOOTBALL_BASE = 'https://api.football-data.org/v4';
const SPORTSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/3';
const KBO_LEAGUE_ID = '4342';

function corsProxy(url: string): string {
  return `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
}

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

// 한국시간 기준 오늘/어제
function todayKST(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}
function yesterdayKST(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function yesterdayISO(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── 네이버 스포츠 API ────────────────────────────────────────────
// 여러 엔드포인트 패턴 시도
const NAVER_HOSTS = [
  'https://api-gw.sports.naver.com',
  'https://api.sports.naver.com',
];
const NAVER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
  'Referer': 'https://m.sports.naver.com/',
  'Accept': 'application/json',
};

interface NaverResult {
  games: LiveScore[];
  success: boolean;
}

async function tryNaverEndpoint(host: string, date: string, category: string, sport: string): Promise<LiveScore[]> {
  const scores: LiveScore[] = [];
  const urls = [
    `${host}/schedule/games?date=${date}&category=${category}&fields=basic,superCategoryId,categoryId,statusNum`,
    `${host}/schedule/games?date=${date}&category=${category}`,
  ];

  for (const url of urls) {
    try {
      const res = await axios.get(corsProxy(url), { timeout: 10000 });
      const data = res.data;
      const games: any[] = data?.result?.games || data?.games || data?.result || [];
      if (!Array.isArray(games) || games.length === 0) continue;

      for (const g of games) {
        const home = g.homeTeamName || g.homeTeam?.teamName || g.homeTeam?.name || '';
        const away = g.awayTeamName || g.awayTeam?.teamName || g.awayTeam?.name || '';
        if (!home && !away) continue;

        const hs = g.homeTeamScore ?? g.homeTeam?.score ?? 0;
        const as_ = g.awayTeamScore ?? g.awayTeam?.score ?? 0;
        const dt = g.gameDateTime || g.startTime || '';
        const ts = dt ? new Date(dt).getTime() : Date.now();

        const code = (g.statusCode || g.gameStatus || '').toUpperCase();
        const info = g.statusInfo || g.statusText || '';
        let status: LiveScore['status'] = 'SCHEDULED';
        if (['RESULT', 'FINAL', 'END', 'FINISHED', 'CANCEL'].includes(code) || info.includes('종료')) {
          status = 'FINISHED';
        } else if (['PROGRESS', 'PLAYING', 'LIVE'].includes(code) || info.includes('진행') || info.includes('회')) {
          status = 'LIVE';
        }

        const inning = g.currentInning || g.statusInfo || undefined;
        const minute = g.gameMinute || g.matchMinute || undefined;

        scores.push({
          homeTeam: home, awayTeam: away,
          homeScore: typeof hs === 'number' ? hs : parseInt(hs) || 0,
          awayScore: typeof as_ === 'number' ? as_ : parseInt(as_) || 0,
          status, timestamp: ts, sport,
          minute: status === 'LIVE' ? minute : undefined,
          inning: status === 'LIVE' ? inning : undefined,
        });
      }

      if (scores.length > 0) return scores;
    } catch {
      // 다음 URL 시도
    }
  }
  return scores;
}

async function fetchNaverScores(): Promise<LiveScore[]> {
  const scores: LiveScore[] = [];
  const today = todayKST();
  const yesterday = yesterdayKST();

  const categories = [
    { id: 'kbo', sport: '야구' },
    { id: 'wfootball', sport: '축구' },
    { id: 'kfootball', sport: '축구' },
  ];

  for (const day of [today, yesterday]) {
    for (const cat of categories) {
      for (const host of NAVER_HOSTS) {
        const result = await tryNaverEndpoint(host, day, cat.id, cat.sport);
        if (result.length > 0) {
          scores.push(...result);
          break; // 이 host에서 성공하면 다음 host 안 시도
        }
      }
    }
  }
  return scores;
}

// ── TheSportsDB (KBO 폴백) ───────────────────────────────────────
const KBO_MAP: Record<string, string> = {
  'Doosan Bears': '두산', 'LG Twins': 'LG', 'Samsung Lions': '삼성',
  'Hanwha Eagles': '한화', 'Kiwoom Heroes': '키움', 'NC Dinos': 'NC',
  'SSG Landers': 'SSG', 'KT Wiz': 'KT', 'Lotte Giants': '롯데',
  'KIA Tigers': 'KIA',
};

async function fetchSportsDBScores(): Promise<LiveScore[]> {
  const scores: LiveScore[] = [];
  for (const day of [todayISO(), yesterdayISO()]) {
    try {
      const sdbUrl = `${SPORTSDB_BASE}/eventsday.php?d=${day}&l=${KBO_LEAGUE_ID}`;
      const res = await axios.get(corsProxy(sdbUrl), { timeout: 10000 });
      for (const e of (res.data.events || [])) {
        const ts = e.strTimestamp ? new Date(e.strTimestamp).getTime()
          : new Date(`${e.dateEvent}T${e.strTime || '18:00:00'}+09:00`).getTime();
        const hasScore = e.intHomeScore !== null && e.intHomeScore !== '';
        const hs = hasScore ? parseInt(e.intHomeScore) : 0;
        const as_ = hasScore ? parseInt(e.intAwayScore) : 0;
        let status: LiveScore['status'] = 'SCHEDULED';
        if (e.strStatus === 'FT' || e.strStatus === 'AOT') status = 'FINISHED';
        else if (hasScore && e.strStatus !== 'NS' && e.strStatus !== 'Not Started') status = 'LIVE';
        scores.push({
          homeTeam: KBO_MAP[e.strHomeTeam] || e.strHomeTeam || '',
          awayTeam: KBO_MAP[e.strAwayTeam] || e.strAwayTeam || '',
          homeScore: hs, awayScore: as_,
          status, timestamp: ts, sport: '야구',
        });
      }
    } catch { /* skip */ }
  }
  return scores;
}

// ── football-data.org (축구 폴백) ────────────────────────────────
async function fetchFootballScores(): Promise<LiveScore[]> {
  const scores: LiveScore[] = [];
  try {
    const fbUrl = `${FOOTBALL_BASE}/matches?dateFrom=${yesterdayISO()}&dateTo=${todayISO()}`;
    const res = await axios.get(corsProxy(fbUrl), {
      headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
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
  } catch { /* skip */ }
  return scores;
}

// ── 통합: 네이버 우선 → 폴백 ────────────────────────────────────
export async function fetchLiveScores(): Promise<LiveScore[]> {
  const scores: LiveScore[] = [];

  // 1. 네이버 스포츠 시도
  const naver = await fetchNaverScores();
  scores.push(...naver);
  console.log(`[livescore] 네이버: ${naver.length}건`);

  // 2. 야구 데이터 없으면 TheSportsDB 폴백
  const hasBaseball = scores.some(s => s.sport === '야구');
  if (!hasBaseball) {
    const sdb = await fetchSportsDBScores();
    scores.push(...sdb);
    console.log(`[livescore] TheSportsDB 폴백: ${sdb.length}건`);
  }

  // 3. 축구 데이터 없으면 football-data.org 폴백
  const hasFootball = scores.some(s => s.sport === '축구');
  if (!hasFootball) {
    const fb = await fetchFootballScores();
    scores.push(...fb);
    console.log(`[livescore] football-data.org 폴백: ${fb.length}건`);
  }

  console.log(`[livescore] 총 ${scores.length}건 (LIVE: ${scores.filter(s => s.status === 'LIVE').length}, FINISHED: ${scores.filter(s => s.status === 'FINISHED').length})`);
  return scores;
}

// ── betman 경기 매칭 ─────────────────────────────────────────────
export function matchScore(game: BetmanGame, scores: LiveScore[]): LiveScore | null {
  if (!game.gameDate) return null;
  const gameTs = new Date(game.gameDate).getTime();
  const TOLERANCE = 30 * 60 * 1000;

  // 1차: 종목 + 시간 + 양팀명 매칭
  for (const s of scores) {
    if (s.sport !== game.sport) continue;
    if (Math.abs(s.timestamp - gameTs) > TOLERANCE) continue;
    const hm = game.homeTeam.includes(s.homeTeam) || s.homeTeam.includes(game.homeTeam);
    const am = game.awayTeam.includes(s.awayTeam) || s.awayTeam.includes(game.awayTeam);
    if (hm && am) return s;
  }

  // 2차: 한쪽 팀명만 매칭
  for (const s of scores) {
    if (s.sport !== game.sport) continue;
    if (Math.abs(s.timestamp - gameTs) > TOLERANCE) continue;
    const hm = game.homeTeam.includes(s.homeTeam) || s.homeTeam.includes(game.homeTeam);
    const am = game.awayTeam.includes(s.awayTeam) || s.awayTeam.includes(game.awayTeam);
    if (hm || am) return s;
  }

  // 3차: 5분 이내 + 같은 종목 유일 매칭
  const tight = scores.filter(s => s.sport === game.sport && Math.abs(s.timestamp - gameTs) < 5 * 60 * 1000);
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
  // 전반 마켓은 풀타임 스코어로 판정 불가 → 수동 입력만 가능
  if (marketType.includes('전반')) return null;

  if (marketType.includes('승무패')) {
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
  if (marketType === 'SUM' || marketType.includes('홀짝')) {
    const total = homeScore + awayScore;
    return total % 2 === 0 ? '짝' : '홀';
  }
  return null;
}
