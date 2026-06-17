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

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

async function fetchHtml(url: string): Promise<string> {
  if (isNative) {
    const res = await CapacitorHttp.get({
      url,
      headers: {
        'User-Agent': MOBILE_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      connectTimeout: 12000,
      readTimeout: 12000,
    });
    return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  }
  // 브라우저에서는 CORS 프록시 경유
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];
  for (const p of proxies) {
    try {
      const res = await fetch(p, { signal: AbortSignal.timeout(12000) });
      if (res.ok) return res.text();
    } catch { /* next */ }
  }
  return '';
}

async function fetchJson(url: string, headers?: Record<string, string>): Promise<any> {
  if (isNative) {
    const res = await CapacitorHttp.get({
      url,
      headers: { 'User-Agent': MOBILE_UA, ...headers },
      connectTimeout: 10000,
      readTimeout: 10000,
    });
    return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  }
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];
  for (const p of proxies) {
    try {
      const res = await fetch(p, { headers, signal: AbortSignal.timeout(10000) });
      if (res.ok) return res.json();
    } catch { /* next */ }
  }
  throw new Error('fetch failed');
}

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

// ── 1. 네이버 스포츠 API (JSON) ──────────────────────────────────
async function fetchNaverApi(): Promise<LiveScore[]> {
  const scores: LiveScore[] = [];
  const hosts = ['https://api-gw.sports.naver.com', 'https://api.sports.naver.com'];
  const categories = [
    { id: 'kbo', sport: '야구' },
    { id: 'wfootball', sport: '축구' },
    { id: 'kfootball', sport: '축구' },
    { id: 'kleague', sport: '축구' },
  ];
  const headers = {
    'User-Agent': MOBILE_UA,
    'Referer': 'https://m.sports.naver.com/',
    'Accept': 'application/json',
  };

  for (const day of [todayKST(), yesterdayKST()]) {
    for (const cat of categories) {
      for (const host of hosts) {
        try {
          const data = await fetchJson(
            `${host}/schedule/games?date=${day}&category=${cat.id}&fields=basic,superCategoryId,categoryId,statusNum`,
            headers,
          );
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
            scores.push({
              homeTeam: home, awayTeam: away,
              homeScore: typeof hs === 'number' ? hs : parseInt(hs) || 0,
              awayScore: typeof as_ === 'number' ? as_ : parseInt(as_) || 0,
              status, timestamp: ts, sport: cat.sport,
              minute: status === 'LIVE' ? (g.gameMinute || g.matchMinute || undefined) : undefined,
              inning: status === 'LIVE' ? (g.currentInning || g.statusInfo || undefined) : undefined,
            });
          }
          if (scores.length > 0) break;
        } catch { /* next host */ }
      }
    }
  }
  return scores;
}

// ── 2. 네이버 스포츠 HTML 스크래핑 (폴백) ─────────────────────────
// m.sports.naver.com/scoreboard 또는 개별 종목 일정 페이지에서
// __NEXT_DATA__ JSON 또는 HTML에서 스코어 정보 추출
async function fetchNaverHtml(): Promise<LiveScore[]> {
  const scores: LiveScore[] = [];
  const pages = [
    { url: 'https://m.sports.naver.com/kbaseball/schedule/index', sport: '야구' },
    { url: 'https://m.sports.naver.com/wfootball/schedule/index', sport: '축구' },
    { url: 'https://m.sports.naver.com/kfootball/schedule/index', sport: '축구' },
  ];

  for (const page of pages) {
    try {
      const html = await fetchHtml(page.url);
      if (!html) continue;

      // __NEXT_DATA__ JSON 추출
      const nextMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (nextMatch) {
        try {
          const nextData = JSON.parse(nextMatch[1]);
          const props = nextData?.props?.pageProps;
          const scheduleList = props?.scheduleList || props?.todaySchedule || props?.schedule || [];
          const gamesList: any[] = Array.isArray(scheduleList) ? scheduleList : [scheduleList];

          for (const group of gamesList) {
            const games = group?.games || group?.gameList || (Array.isArray(group) ? group : []);
            for (const g of games) {
              const home = g.homeTeamName || g.homeTeam?.teamName || '';
              const away = g.awayTeamName || g.awayTeam?.teamName || '';
              if (!home && !away) continue;

              const hs = g.homeTeamScore ?? g.homeScore ?? 0;
              const as_ = g.awayTeamScore ?? g.awayScore ?? 0;
              const dt = g.gameDateTime || g.startTime || g.gameDate || '';
              const ts = dt ? new Date(dt).getTime() : Date.now();
              const code = (g.statusCode || g.gameStatus || '').toUpperCase();
              const info = g.statusInfo || '';
              let status: LiveScore['status'] = 'SCHEDULED';
              if (['RESULT', 'FINAL', 'END', 'FINISHED', 'CANCEL'].includes(code) || info.includes('종료')) status = 'FINISHED';
              else if (['PROGRESS', 'PLAYING', 'LIVE'].includes(code) || info.includes('진행') || info.includes('회')) status = 'LIVE';

              scores.push({
                homeTeam: home, awayTeam: away,
                homeScore: typeof hs === 'number' ? hs : parseInt(hs) || 0,
                awayScore: typeof as_ === 'number' ? as_ : parseInt(as_) || 0,
                status, timestamp: ts, sport: page.sport,
                inning: status === 'LIVE' ? (g.currentInning || info || undefined) : undefined,
              });
            }
          }
        } catch { /* JSON parse fail */ }
      }

      // HTML 파싱 폴백: 스코어 패턴 추출
      // 네이버 모바일 스코어보드: 팀이름 + 스코어가 포함된 패턴
      if (scores.filter(s => s.sport === page.sport).length === 0) {
        // data-game-id 등의 속성 또는 일반적인 스코어 패턴
        const gameBlocks = html.match(/data-game-id="[^"]*"[\s\S]*?(?=data-game-id="|$)/g) || [];
        for (const block of gameBlocks) {
          const homeMatch = block.match(/home[^"]*team[^"]*name[^"]*"[^>]*>([^<]+)/i);
          const awayMatch = block.match(/away[^"]*team[^"]*name[^"]*"[^>]*>([^<]+)/i);
          const scoreMatch = block.match(/(\d+)\s*(?::\s*|-\s*)(\d+)/);
          if (homeMatch && awayMatch) {
            scores.push({
              homeTeam: homeMatch[1].trim(),
              awayTeam: awayMatch[1].trim(),
              homeScore: scoreMatch ? parseInt(scoreMatch[1]) : 0,
              awayScore: scoreMatch ? parseInt(scoreMatch[2]) : 0,
              status: block.includes('종료') ? 'FINISHED' : block.includes('진행') ? 'LIVE' : 'SCHEDULED',
              timestamp: Date.now(),
              sport: page.sport,
            });
          }
        }
      }
    } catch { /* skip page */ }
  }
  return scores;
}

// ── 3. livescore.in 스크래핑 (축구 폴백) ────────────────────────
async function fetchLivescoreIn(): Promise<LiveScore[]> {
  const scores: LiveScore[] = [];
  try {
    const html = await fetchHtml('https://www.livescore.in/kr/');
    if (!html) return scores;

    // __NEXT_DATA__ 또는 window.__DATA__ 추출
    const dataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
      || html.match(/window\.__(?:NEXT_DATA|DATA|INITIAL_STATE)__\s*=\s*({[\s\S]*?});?\s*<\/script>/);
    if (dataMatch) {
      try {
        const data = JSON.parse(dataMatch[1]);
        const events = data?.props?.pageProps?.events
          || data?.props?.pageProps?.matches
          || data?.events || [];
        for (const e of (Array.isArray(events) ? events : [])) {
          const home = e.homeTeam?.name || e.home?.name || e.homeName || '';
          const away = e.awayTeam?.name || e.away?.name || e.awayName || '';
          if (!home || !away) continue;
          const hs = e.homeScore ?? e.homeTeam?.score ?? 0;
          const as_ = e.awayScore ?? e.awayTeam?.score ?? 0;
          const st = (e.status || e.statusText || '').toLowerCase();
          let status: LiveScore['status'] = 'SCHEDULED';
          if (st.includes('fin') || st.includes('ft') || st.includes('종료') || st.includes('end')) status = 'FINISHED';
          else if (st.includes('live') || st.includes('진행') || st.includes('1st') || st.includes('2nd') || st.includes('ht')) status = 'LIVE';
          scores.push({
            homeTeam: home, awayTeam: away,
            homeScore: typeof hs === 'number' ? hs : parseInt(hs) || 0,
            awayScore: typeof as_ === 'number' ? as_ : parseInt(as_) || 0,
            status, timestamp: e.startTimestamp ? e.startTimestamp * 1000 : Date.now(),
            sport: '축구',
          });
        }
      } catch { /* parse fail */ }
    }

    // HTML 직접 파싱 폴백
    if (scores.length === 0) {
      const rows = html.match(/class="[^"]*event__match[^"]*"[\s\S]*?(?=class="[^"]*event__match|$)/g) || [];
      for (const row of rows) {
        const teams = row.match(/class="[^"]*participant[^"]*"[^>]*>([^<]+)/g);
        const scoreNums = row.match(/class="[^"]*score[^"]*"[^>]*>(\d+)/g);
        if (teams && teams.length >= 2) {
          const home = teams[0].replace(/.*>/, '').trim();
          const away = teams[1].replace(/.*>/, '').trim();
          const hs = scoreNums?.[0] ? parseInt(scoreNums[0].replace(/.*>/, '')) : 0;
          const as_ = scoreNums?.[1] ? parseInt(scoreNums[1].replace(/.*>/, '')) : 0;
          const isLive = row.includes('live') || row.includes('진행');
          const isFin = row.includes('Fin') || row.includes('종료') || row.includes('FT');
          scores.push({
            homeTeam: home, awayTeam: away,
            homeScore: hs, awayScore: as_,
            status: isFin ? 'FINISHED' : isLive ? 'LIVE' : 'SCHEDULED',
            timestamp: Date.now(), sport: '축구',
          });
        }
      }
    }
  } catch { /* skip */ }
  return scores;
}

// ── 4. TheSportsDB (KBO 폴백) ───────────────────────────────────
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
      const data = await fetchJson(`https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${day}&l=4342`);
      for (const e of (data.events || [])) {
        const ts = e.strTimestamp ? new Date(e.strTimestamp).getTime()
          : new Date(`${e.dateEvent}T${e.strTime || '18:00:00'}+09:00`).getTime();
        const hasScore = e.intHomeScore !== null && e.intHomeScore !== '';
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

// ── 5. football-data.org (축구 폴백) ────────────────────────────
async function fetchFootballScores(): Promise<LiveScore[]> {
  const scores: LiveScore[] = [];
  try {
    const data = await fetchJson(
      `https://api.football-data.org/v4/matches?dateFrom=${yesterdayISO()}&dateTo=${todayISO()}`,
      { 'X-Auth-Token': '6942278d1b1e447bb04375f4b84ce286' },
    );
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

// ── 통합: API → HTML 스크래핑 → 해외 폴백 ───────────────────────
export async function fetchLiveScores(): Promise<LiveScore[]> {
  const scores: LiveScore[] = [];

  // 1. 네이버 API 시도
  try {
    const api = await fetchNaverApi();
    scores.push(...api);
    console.log(`[livescore] 네이버 API: ${api.length}건`);
  } catch { console.log('[livescore] 네이버 API 실패'); }

  // 2. API 실패 시 HTML 스크래핑
  if (scores.length === 0) {
    try {
      const html = await fetchNaverHtml();
      scores.push(...html);
      console.log(`[livescore] 네이버 HTML: ${html.length}건`);
    } catch { console.log('[livescore] 네이버 HTML 실패'); }
  }

  // 3. 야구 없으면 TheSportsDB
  if (!scores.some(s => s.sport === '야구')) {
    try {
      const sdb = await fetchSportsDBScores();
      scores.push(...sdb);
      console.log(`[livescore] TheSportsDB: ${sdb.length}건`);
    } catch { /* skip */ }
  }

  // 4. 축구 없으면 livescore.in
  if (!scores.some(s => s.sport === '축구')) {
    try {
      const ls = await fetchLivescoreIn();
      scores.push(...ls);
      console.log(`[livescore] livescore.in: ${ls.length}건`);
    } catch { /* skip */ }
  }

  // 5. 여전히 축구 없으면 football-data.org
  if (!scores.some(s => s.sport === '축구')) {
    try {
      const fb = await fetchFootballScores();
      scores.push(...fb);
      console.log(`[livescore] football-data.org: ${fb.length}건`);
    } catch { /* skip */ }
  }

  console.log(`[livescore] 총 ${scores.length}건 (LIVE: ${scores.filter(s => s.status === 'LIVE').length}, FINISHED: ${scores.filter(s => s.status === 'FINISHED').length})`);
  return scores;
}

// ── betman 경기 매칭 ─────────────────────────────────────────────
export function matchScore(game: BetmanGame, scores: LiveScore[]): LiveScore | null {
  if (!game.gameDate) return null;
  const gameTs = new Date(game.gameDate).getTime();
  const TOLERANCE = 3 * 60 * 60 * 1000; // 3시간 허용 (시간대 차이 고려)

  // 1차: 종목 + 시간 + 양팀명 매칭
  for (const s of scores) {
    if (s.sport !== game.sport) continue;
    if (Math.abs(s.timestamp - gameTs) > TOLERANCE) continue;
    const hm = game.homeTeam.includes(s.homeTeam) || s.homeTeam.includes(game.homeTeam);
    const am = game.awayTeam.includes(s.awayTeam) || s.awayTeam.includes(game.awayTeam);
    if (hm && am) return s;
  }

  // 2차: 팀명만 매칭 (시간 무시)
  for (const s of scores) {
    if (s.sport !== game.sport) continue;
    const hm = game.homeTeam.includes(s.homeTeam) || s.homeTeam.includes(game.homeTeam);
    const am = game.awayTeam.includes(s.awayTeam) || s.awayTeam.includes(game.awayTeam);
    if (hm && am) return s;
  }

  // 3차: 한쪽 팀명 + 시간 근접
  for (const s of scores) {
    if (s.sport !== game.sport) continue;
    if (Math.abs(s.timestamp - gameTs) > TOLERANCE) continue;
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
