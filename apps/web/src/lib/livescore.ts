import { Capacitor } from '@capacitor/core';
import { CapacitorHttp } from '@capacitor/core';
import { BetmanGame } from './api';

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

const isNative = Capacitor.isNativePlatform();
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

async function httpGet(url: string, headers?: Record<string, string>): Promise<{ text: string; ok: boolean }> {
  try {
    if (isNative) {
      const res = await CapacitorHttp.get({
        url,
        headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', ...headers },
        connectTimeout: 12000,
        readTimeout: 12000,
      });
      const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      return { text, ok: res.status >= 200 && res.status < 400 };
    }
    // 브라우저: CORS 프록시
    const proxies = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      `https://corsproxy.io/?${encodeURIComponent(url)}`,
    ];
    for (const p of proxies) {
      try {
        const res = await fetch(p, { signal: AbortSignal.timeout(12000) });
        if (res.ok) return { text: await res.text(), ok: true };
      } catch { /* next */ }
    }
  } catch (e) {
    console.warn(`[livescore] httpGet failed: ${url}`, e);
  }
  return { text: '', ok: false };
}

function todayKST(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}
function yesterdayKST(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

// ── 네이버 스포츠 전체 스코어보드 (가장 신뢰성 높은 소스) ──────────
// m.sports.naver.com 의 전체 스코어보드 페이지에서 __NEXT_DATA__ 추출
async function fetchNaverScoreboard(): Promise<LiveScore[]> {
  const scores: LiveScore[] = [];
  const urls = [
    'https://m.sports.naver.com/scoreboard/index',
    'https://m.sports.naver.com/scoreboard',
  ];

  for (const url of urls) {
    const { text, ok } = await httpGet(url);
    if (!ok || !text) continue;
    console.log(`[livescore] 네이버 스코어보드 응답 길이: ${text.length}`);

    const parsed = parseNaverNextData(text, '');
    if (parsed.length > 0) {
      scores.push(...parsed);
      console.log(`[livescore] 스코어보드에서 ${parsed.length}건 추출`);
      return scores;
    }
  }
  return scores;
}

// ── 네이버 종목별 일정 페이지 크롤링 ────────────────────────────
async function fetchNaverSchedulePages(): Promise<LiveScore[]> {
  const scores: LiveScore[] = [];
  const pages = [
    { url: 'https://m.sports.naver.com/kbaseball/schedule/index', sport: '야구' },
    { url: 'https://m.sports.naver.com/wfootball/schedule/index', sport: '축구' },
    { url: 'https://m.sports.naver.com/kfootball/schedule/index', sport: '축구' },
    { url: 'https://m.sports.naver.com/basketball/schedule/index', sport: '농구' },
  ];

  for (const page of pages) {
    const { text } = await httpGet(page.url);
    if (!text) continue;
    const parsed = parseNaverNextData(text, page.sport);
    scores.push(...parsed);
    console.log(`[livescore] ${page.sport} 일정: ${parsed.length}건`);
  }
  return scores;
}

function parseNaverNextData(html: string, defaultSport: string): LiveScore[] {
  const scores: LiveScore[] = [];

  // __NEXT_DATA__ 추출
  const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) {
    console.log('[livescore] __NEXT_DATA__ 없음');
    return parseNaverHtmlFallback(html, defaultSport);
  }

  try {
    const data = JSON.parse(m[1]);
    console.log(`[livescore] __NEXT_DATA__ 파싱 성공, keys: ${Object.keys(data?.props?.pageProps || {}).join(',')}`);

    const pp = data?.props?.pageProps || {};
    // 다양한 데이터 구조 시도
    const sources = [
      pp.scheduleList, pp.todaySchedule, pp.schedule,
      pp.scoreboardList, pp.scoreboard, pp.gameList,
      pp.initialState?.schedule, pp.initialState?.games,
      pp.dehydratedState?.queries?.[0]?.state?.data,
    ].filter(Boolean);

    for (const src of sources) {
      const items = Array.isArray(src) ? src : [src];
      for (const group of items) {
        const games = group?.games || group?.gameList || group?.list || (Array.isArray(group) ? group : []);
        if (!Array.isArray(games)) continue;

        for (const g of games) {
          const score = parseNaverGame(g, defaultSport);
          if (score) scores.push(score);
        }
      }
    }

    // 최상위에 바로 games가 있는 경우
    if (scores.length === 0 && pp.games) {
      const games = Array.isArray(pp.games) ? pp.games : [];
      for (const g of games) {
        const score = parseNaverGame(g, defaultSport);
        if (score) scores.push(score);
      }
    }
  } catch (e) {
    console.warn('[livescore] __NEXT_DATA__ JSON 파싱 실패', e);
  }

  return scores;
}

function parseNaverGame(g: any, defaultSport: string): LiveScore | null {
  const home = g.homeTeamName || g.homeTeam?.teamName || g.homeTeam?.name || g.homeName || '';
  const away = g.awayTeamName || g.awayTeam?.teamName || g.awayTeam?.name || g.awayName || '';
  if (!home && !away) return null;

  const hs = g.homeTeamScore ?? g.homeTeam?.score ?? g.homeScore ?? 0;
  const as_ = g.awayTeamScore ?? g.awayTeam?.score ?? g.awayScore ?? 0;
  const dt = g.gameDateTime || g.startTime || g.gameDate || g.startDateTime || '';
  const ts = dt ? new Date(dt).getTime() : Date.now();

  if (isNaN(ts)) return null;

  const code = (g.statusCode || g.gameStatus || g.statusNum || '').toString().toUpperCase();
  const info = g.statusInfo || g.statusText || g.gameStatusInfo || '';
  let status: LiveScore['status'] = 'SCHEDULED';

  if (['RESULT', 'FINAL', 'END', 'FINISHED', 'CANCEL', 'POSTPONE'].includes(code)
    || code === '4' || code === '5'
    || info.includes('종료') || info.includes('경기종료') || info.includes('FT')) {
    status = 'FINISHED';
  } else if (['PROGRESS', 'PLAYING', 'LIVE'].includes(code)
    || code === '3'
    || info.includes('진행') || info.includes('회') || info.includes('이닝')
    || (hs > 0 || as_ > 0) && !['BEFORE', 'READY', '1', '2'].includes(code)) {
    status = 'LIVE';
  }

  const sport = g.sportCode === 'kbaseball' || g.categoryId === 'kbo' ? '야구'
    : g.sportCode?.includes('football') || g.categoryId?.includes('football') ? '축구'
    : defaultSport || '기타';

  return {
    homeTeam: home, awayTeam: away,
    homeScore: typeof hs === 'number' ? hs : parseInt(hs) || 0,
    awayScore: typeof as_ === 'number' ? as_ : parseInt(as_) || 0,
    status, timestamp: ts, sport,
    minute: status === 'LIVE' ? (g.gameMinute || g.matchMinute || undefined) : undefined,
    inning: status === 'LIVE' ? (g.currentInning || g.statusInfo || undefined) : undefined,
  };
}

function parseNaverHtmlFallback(html: string, sport: string): LiveScore[] {
  const scores: LiveScore[] = [];
  // JSON이 없는 경우 HTML에서 직접 파싱 시도
  // 네이버 모바일: data-game-id 또는 MatchBox_ 패턴
  const blocks = html.split(/(?=data-game-id|MatchBox_|game_item)/g);
  for (const block of blocks) {
    if (block.length < 50) continue;
    // 팀명 추출: 다양한 패턴
    const teams = block.match(/>([가-힣A-Za-z0-9\s]+?)\s*<\/(?:span|div|p|em|strong)/g) || [];
    const teamNames = teams.map(t => t.replace(/>/, '').replace(/<\/.*/, '').trim()).filter(t => t.length >= 2 && t.length <= 20);
    const scoreNums = block.match(/(?:score|point|run)[^>]*>(\d+)/gi);
    const allNums = scoreNums?.map(s => parseInt(s.replace(/.*>/, ''))) || [];

    if (teamNames.length >= 2) {
      scores.push({
        homeTeam: teamNames[0],
        awayTeam: teamNames[1],
        homeScore: allNums[0] || 0,
        awayScore: allNums[1] || 0,
        status: block.includes('종료') || block.includes('FT') ? 'FINISHED'
          : block.includes('진행') || block.includes('LIVE') ? 'LIVE' : 'SCHEDULED',
        timestamp: Date.now(),
        sport,
      });
    }
  }
  return scores;
}

// ── 네이버 스포츠 JSON API (여러 패턴 시도) ─────────────────────
async function fetchNaverApi(): Promise<LiveScore[]> {
  const scores: LiveScore[] = [];
  const dates = [todayKST(), yesterdayKST()];
  const categories = [
    { id: 'kbo', sport: '야구' },
    { id: 'wfootball', sport: '축구' },
    { id: 'kfootball', sport: '축구' },
    { id: 'kleague', sport: '축구' },
  ];
  const apiPatterns = [
    (host: string, date: string, cat: string) => `${host}/schedule/games?date=${date}&category=${cat}&fields=basic,superCategoryId,categoryId,statusNum`,
    (host: string, date: string, cat: string) => `${host}/schedule/games?date=${date}&category=${cat}`,
    (host: string, date: string, cat: string) => `${host}/schedule/${cat}/games?date=${date}`,
    (host: string, date: string, cat: string) => `${host}/${cat}/schedule/games?date=${date}`,
    (host: string, date: string, cat: string) => `${host}/scoreboard/${cat}?date=${date}`,
  ];
  const hosts = [
    'https://api-gw.sports.naver.com',
    'https://api.sports.naver.com',
    'https://sports-api.naver.com',
  ];
  const headers = {
    'Referer': 'https://m.sports.naver.com/',
    'Accept': 'application/json',
  };

  for (const date of dates) {
    for (const cat of categories) {
      let found = false;
      for (const host of hosts) {
        if (found) break;
        for (const pattern of apiPatterns) {
          const url = pattern(host, date, cat.id);
          const { text, ok } = await httpGet(url, headers);
          if (!ok || !text) continue;

          try {
            const data = JSON.parse(text);
            const games: any[] = data?.result?.games || data?.games || data?.result?.gameList
              || data?.result || data?.data?.games || data?.data || [];
            if (!Array.isArray(games) || games.length === 0) continue;

            console.log(`[livescore] API 성공: ${url} → ${games.length}건`);
            for (const g of games) {
              const score = parseNaverGame(g, cat.sport);
              if (score) scores.push(score);
            }
            found = true;
            break;
          } catch { /* not JSON */ }
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

async function fetchSportsDB(): Promise<LiveScore[]> {
  const scores: LiveScore[] = [];
  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  for (const d of [today, yesterday]) {
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const { text, ok } = await httpGet(`https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${ds}&l=4342`);
    if (!ok || !text) continue;
    try {
      const data = JSON.parse(text);
      for (const e of (data.events || [])) {
        const ts = e.strTimestamp ? new Date(e.strTimestamp).getTime()
          : new Date(`${e.dateEvent}T${e.strTime || '18:00:00'}+09:00`).getTime();
        const hasScore = e.intHomeScore != null && e.intHomeScore !== '';
        scores.push({
          homeTeam: KBO_MAP[e.strHomeTeam] || e.strHomeTeam || '',
          awayTeam: KBO_MAP[e.strAwayTeam] || e.strAwayTeam || '',
          homeScore: hasScore ? parseInt(e.intHomeScore) : 0,
          awayScore: hasScore ? parseInt(e.intAwayScore) : 0,
          status: e.strStatus === 'FT' || e.strStatus === 'AOT' ? 'FINISHED'
            : hasScore && e.strStatus !== 'NS' ? 'LIVE' : 'SCHEDULED',
          timestamp: ts, sport: '야구',
        });
      }
    } catch { /* skip */ }
  }
  return scores;
}

// ── football-data.org (축구 폴백) ────────────────────────────────
async function fetchFootballData(): Promise<LiveScore[]> {
  const scores: LiveScore[] = [];
  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const { text, ok } = await httpGet(
    `https://api.football-data.org/v4/matches?dateFrom=${fmt(yesterday)}&dateTo=${fmt(today)}`,
    { 'X-Auth-Token': '6942278d1b1e447bb04375f4b84ce286' },
  );
  if (!ok || !text) return scores;
  try {
    const data = JSON.parse(text);
    for (const m of (data.matches || [])) {
      const st = m.status;
      scores.push({
        homeTeam: m.homeTeam?.name || '',
        awayTeam: m.awayTeam?.name || '',
        homeScore: m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? 0,
        awayScore: m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? 0,
        status: ['IN_PLAY', 'PAUSED', 'HALFTIME', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'].includes(st) ? 'LIVE'
          : st === 'FINISHED' ? 'FINISHED' : 'SCHEDULED',
        minute: m.minute ?? undefined,
        timestamp: new Date(m.utcDate).getTime(),
        sport: '축구',
      });
    }
  } catch { /* skip */ }
  return scores;
}

// ── livescore.in 스크래핑 (축구 폴백) ─────────────────────────────
async function fetchLivescoreIn(): Promise<LiveScore[]> {
  const scores: LiveScore[] = [];
  const { text } = await httpGet('https://www.livescore.in/kr/');
  if (!text) return scores;

  const m = text.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    || text.match(/window\.__(?:NEXT_DATA|DATA)__\s*=\s*({[\s\S]*?});?\s*<\/script>/);
  if (m) {
    try {
      const data = JSON.parse(m[1]);
      const events = data?.props?.pageProps?.events || data?.props?.pageProps?.matches || [];
      for (const e of (Array.isArray(events) ? events : [])) {
        const home = e.homeTeam?.name || e.home?.name || '';
        const away = e.awayTeam?.name || e.away?.name || '';
        if (!home || !away) continue;
        const hs = e.homeScore ?? e.homeTeam?.score ?? 0;
        const as_ = e.awayScore ?? e.awayTeam?.score ?? 0;
        const st = (e.status || '').toLowerCase();
        scores.push({
          homeTeam: home, awayTeam: away,
          homeScore: typeof hs === 'number' ? hs : parseInt(hs) || 0,
          awayScore: typeof as_ === 'number' ? as_ : parseInt(as_) || 0,
          status: st.includes('fin') || st.includes('ft') ? 'FINISHED'
            : st.includes('live') || st.includes('1st') || st.includes('2nd') ? 'LIVE' : 'SCHEDULED',
          timestamp: e.startTimestamp ? e.startTimestamp * 1000 : Date.now(),
          sport: '축구',
        });
      }
    } catch { /* skip */ }
  }
  return scores;
}

export interface FetchResult {
  scores: LiveScore[];
  logs: string[];
}

// ── 통합 ─────────────────────────────────────────────────────────
export async function fetchLiveScores(): Promise<LiveScore[]> {
  const result = await fetchLiveScoresWithLog();
  return result.scores;
}

export async function fetchLiveScoresWithLog(): Promise<FetchResult> {
  const allScores: LiveScore[] = [];
  const logs: string[] = [];
  logs.push(`isNative: ${isNative}`);

  // 1. 네이버 스코어보드
  try {
    const sb = await fetchNaverScoreboard();
    allScores.push(...sb);
    logs.push(`1.스코어보드: ${sb.length}건`);
  } catch (e: any) { logs.push(`1.스코어보드: 실패 ${e?.message || e}`); }

  // 2. 네이버 API
  if (allScores.length === 0) {
    try {
      const api = await fetchNaverApi();
      allScores.push(...api);
      logs.push(`2.네이버API: ${api.length}건`);
    } catch (e: any) { logs.push(`2.네이버API: 실패 ${e?.message || e}`); }
  }

  // 3. 네이버 종목별 일정 페이지
  if (allScores.length === 0) {
    try {
      const pages = await fetchNaverSchedulePages();
      allScores.push(...pages);
      logs.push(`3.일정페이지: ${pages.length}건`);
    } catch (e: any) { logs.push(`3.일정페이지: 실패 ${e?.message || e}`); }
  }

  // 4. 야구 없으면 TheSportsDB
  if (!allScores.some(s => s.sport === '야구')) {
    try {
      const sdb = await fetchSportsDB();
      allScores.push(...sdb);
      logs.push(`4.SportsDB: ${sdb.length}건`);
    } catch (e: any) { logs.push(`4.SportsDB: 실패 ${e?.message || e}`); }
  }

  // 5. 축구 없으면 livescore.in
  if (!allScores.some(s => s.sport === '축구')) {
    try {
      const ls = await fetchLivescoreIn();
      allScores.push(...ls);
      logs.push(`5.livescore.in: ${ls.length}건`);
    } catch (e: any) { logs.push(`5.livescore.in: 실패 ${e?.message || e}`); }
  }

  // 6. 축구 여전히 없으면 football-data.org
  if (!allScores.some(s => s.sport === '축구')) {
    try {
      const fb = await fetchFootballData();
      allScores.push(...fb);
      logs.push(`6.football-data: ${fb.length}건`);
    } catch (e: any) { logs.push(`6.football-data: 실패 ${e?.message || e}`); }
  }

  const summary = `총 ${allScores.length}건 (LIVE:${allScores.filter(s => s.status === 'LIVE').length} FIN:${allScores.filter(s => s.status === 'FINISHED').length})`;
  logs.push(summary);
  console.log(`[livescore] ${logs.join(' | ')}`);

  return { scores: allScores, logs };
}

// ── betman 경기 매칭 ─────────────────────────────────────────────
export function matchScore(game: BetmanGame, scores: LiveScore[]): LiveScore | null {
  if (!game.gameDate) return null;
  const gameTs = new Date(game.gameDate).getTime();

  // 1차: 종목 + 양팀명
  for (const s of scores) {
    if (s.sport !== game.sport) continue;
    const hm = game.homeTeam.includes(s.homeTeam) || s.homeTeam.includes(game.homeTeam);
    const am = game.awayTeam.includes(s.awayTeam) || s.awayTeam.includes(game.awayTeam);
    if (hm && am) return s;
  }

  // 2차: 양팀명 (종목 무시, 시간 3시간 이내)
  for (const s of scores) {
    if (Math.abs(s.timestamp - gameTs) > 3 * 60 * 60 * 1000) continue;
    const hm = game.homeTeam.includes(s.homeTeam) || s.homeTeam.includes(game.homeTeam);
    const am = game.awayTeam.includes(s.awayTeam) || s.awayTeam.includes(game.awayTeam);
    if (hm && am) return s;
  }

  // 3차: 한쪽 팀명 + 종목 + 시간
  for (const s of scores) {
    if (s.sport !== game.sport) continue;
    if (Math.abs(s.timestamp - gameTs) > 3 * 60 * 60 * 1000) continue;
    const hm = game.homeTeam.includes(s.homeTeam) || s.homeTeam.includes(game.homeTeam);
    const am = game.awayTeam.includes(s.awayTeam) || s.awayTeam.includes(game.awayTeam);
    if (hm || am) return s;
  }

  return null;
}

// ── 스코어 → 마켓 결과 자동 판정 ────────────────────────────────
export function determineResult(
  marketType: string,
  homeScore: number,
  awayScore: number,
  line?: number,
): string | null {
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
