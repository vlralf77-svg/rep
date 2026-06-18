import { Capacitor } from '@capacitor/core';
import { CapacitorHttp } from '@capacitor/core';

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
  // 전반(하프타임) 스코어 — 전반 마켓 판정용 (없으면 undefined)
  homeHalfScore?: number;
  awayHalfScore?: number;
  // 요청 시점 실시간 API(football-data 등) 출처 — 분(minute) 표시가 실시간
  realtime?: boolean;
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
async function fetchNaverScoreboard(logs: string[]): Promise<LiveScore[]> {
  const scores: LiveScore[] = [];
  const urls = [
    'https://m.sports.naver.com/scoreboard/index',
    'https://m.sports.naver.com/scoreboard',
  ];

  for (const url of urls) {
    const { text, ok } = await httpGet(url);
    if (!ok || !text) {
      logs.push(`스코어보드 ${ok ? '빈응답' : '실패'}: ${url.split('.com')[1]}`);
      continue;
    }
    logs.push(`스코어보드 응답: ${text.length}자 ${text.slice(0, 80).replace(/\n/g, ' ')}`);

    const parsed = parseNaverNextData(text, '', logs);
    if (parsed.length > 0) {
      scores.push(...parsed);
      return scores;
    }
  }
  return scores;
}

// ── 네이버 종목별 일정 페이지 크롤링 ────────────────────────────
async function fetchNaverSchedulePages(logs: string[]): Promise<LiveScore[]> {
  const scores: LiveScore[] = [];
  const pages = [
    { url: 'https://m.sports.naver.com/kbaseball/schedule/index', sport: '야구' },
    { url: 'https://m.sports.naver.com/wfootball/schedule/index', sport: '축구' },
    { url: 'https://m.sports.naver.com/kfootball/schedule/index', sport: '축구' },
  ];

  for (const page of pages) {
    const { text, ok } = await httpGet(page.url);
    if (!ok || !text) {
      logs.push(`${page.sport}페이지: ${ok ? '빈' : '실패'}`);
      continue;
    }
    logs.push(`${page.sport}페이지: ${text.length}자 ${text.slice(0, 60).replace(/\n/g, ' ')}`);
    const parsed = parseNaverNextData(text, page.sport, logs);
    scores.push(...parsed);
  }
  return scores;
}

function parseNaverNextData(html: string, defaultSport: string, logs?: string[]): LiveScore[] {
  const scores: LiveScore[] = [];
  const log = (s: string) => { logs?.push(s); };

  // __NEXT_DATA__ 추출
  const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) {
    log('__NEXT_DATA__ 없음');
    return parseNaverHtmlFallback(html, defaultSport);
  }

  try {
    const data = JSON.parse(m[1]);
    const ppKeys = Object.keys(data?.props?.pageProps || {}).join(',');
    log(`NEXT_DATA keys: ${ppKeys}`);

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
async function fetchNaverApi(logs: string[]): Promise<LiveScore[]> {
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
            const topKeys = Object.keys(data || {}).join(',');
            logs.push(`API ${url.replace(/https:\/\/[^/]+/, '').substring(0, 40)}: ${topKeys} ${text.slice(0, 60)}`);
            const games: any[] = data?.result?.games || data?.games || data?.result?.gameList
              || data?.result || data?.data?.games || data?.data || [];
            if (!Array.isArray(games) || games.length === 0) continue;

            logs.push(`API 성공: ${games.length}건`);
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

// ── 영어 → 한글 팀/국가명 매핑 (betman 매칭용) ──────────────────
const TEAM_NAME_MAP: Record<string, string> = {
  // 국가대표 (월드컵/A매치)
  'Argentina': '아르헨티나', 'Algeria': '알제리', 'Brazil': '브라질',
  'France': '프랑스', 'Germany': '독일', 'Spain': '스페인', 'Portugal': '포르투갈',
  'England': '잉글랜드', 'Italy': '이탈리아', 'Netherlands': '네덜란드',
  'Belgium': '벨기에', 'Croatia': '크로아티아', 'Uruguay': '우루과이',
  'Colombia': '콜롬비아', 'Mexico': '멕시코', 'USA': '미국',
  'United States': '미국', 'Japan': '일본', 'South Korea': '대한민국',
  'Korea Republic': '대한민국', 'Korea': '한국', 'Morocco': '모로코',
  'Senegal': '세네갈', 'Nigeria': '나이지리아', 'Ghana': '가나',
  'Egypt': '이집트', 'Cameroon': '카메룬', 'Ecuador': '에콰도르',
  'Peru': '페루', 'Chile': '칠레', 'Paraguay': '파라과이',
  'Switzerland': '스위스', 'Austria': '오스트리아', 'Poland': '폴란드',
  'Denmark': '덴마크', 'Sweden': '스웨덴', 'Norway': '노르웨이',
  'Serbia': '세르비아', 'Turkey': '튀르키예', 'Türkiye': '튀르키예',
  'Greece': '그리스', 'Czech Republic': '체코', 'Czechia': '체코',
  'Ukraine': '우크라이나', 'Wales': '웨일스', 'Scotland': '스코틀랜드',
  'Ireland': '아일랜드', 'Australia': '호주', 'Canada': '캐나다',
  'Saudi Arabia': '사우디아라비아', 'Iran': '이란', 'Qatar': '카타르',
  'Tunisia': '튀니지', 'Costa Rica': '코스타리카',
  // 주요 유럽 클럽
  'Real Madrid': '레알마드리드', 'Real Madrid CF': '레알마드리드',
  'FC Barcelona': '바르셀로나', 'Barcelona': '바르셀로나',
  'Manchester United': '맨체스터유나이티드', 'Manchester United FC': '맨체스터유나이티드',
  'Manchester City': '맨체스터시티', 'Manchester City FC': '맨체스터시티',
  'Liverpool': '리버풀', 'Liverpool FC': '리버풀',
  'Chelsea': '첼시', 'Chelsea FC': '첼시',
  'Arsenal': '아스널', 'Arsenal FC': '아스널',
  'Tottenham Hotspur': '토트넘', 'Tottenham Hotspur FC': '토트넘',
  'Bayern München': '바이에른뮌헨', 'FC Bayern München': '바이에른뮌헨',
  'Borussia Dortmund': '도르트문트', 'Juventus': '유벤투스', 'Juventus FC': '유벤투스',
  'AC Milan': 'AC밀란', 'Inter': '인터밀란', 'FC Internazionale Milano': '인터밀란',
  'Paris Saint-Germain': '파리생제르맹', 'Paris Saint-Germain FC': '파리생제르맹',
  'Atlético Madrid': '아틀레티코마드리드', 'Club Atlético de Madrid': '아틀레티코마드리드',
  'Napoli': '나폴리', 'SSC Napoli': '나폴리', 'AS Roma': 'AS로마',
};

function toKoreanTeam(name: string): string {
  if (!name) return '';
  if (TEAM_NAME_MAP[name]) return TEAM_NAME_MAP[name];
  // 부분 매칭 (e.g. "Argentina" in "Argentina U21")
  for (const [en, ko] of Object.entries(TEAM_NAME_MAP)) {
    if (name.includes(en)) return ko;
  }
  return name;
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
      const homeEn = m.homeTeam?.name || m.homeTeam?.shortName || '';
      const awayEn = m.awayTeam?.name || m.awayTeam?.shortName || '';
      const htH = m.score?.halfTime?.home;
      const htA = m.score?.halfTime?.away;
      scores.push({
        homeTeam: toKoreanTeam(homeEn),
        awayTeam: toKoreanTeam(awayEn),
        homeScore: m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? 0,
        awayScore: m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? 0,
        status: ['IN_PLAY', 'PAUSED', 'HALFTIME', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'].includes(st) ? 'LIVE'
          : st === 'FINISHED' ? 'FINISHED' : 'SCHEDULED',
        minute: m.minute ?? undefined,
        timestamp: new Date(m.utcDate).getTime(),
        sport: '축구',
        homeHalfScore: typeof htH === 'number' ? htH : undefined,
        awayHalfScore: typeof htA === 'number' ? htA : undefined,
        realtime: true,
      });
    }
  } catch { /* skip */ }
  return scores;
}

// ── spojoy.com 스크래핑 (한글 라이브스코어) ─────────────────────
async function fetchSpojoy(logs: string[]): Promise<LiveScore[]> {
  const scores: LiveScore[] = [];
  const urls = [
    'https://www.spojoy.com/live/',
    'https://spojoy.com/live/',
  ];

  for (const url of urls) {
    const { text, ok } = await httpGet(url);
    if (!ok || !text) {
      logs.push(`spojoy ${ok ? '빈' : '실패'}: ${url}`);
      continue;
    }
    logs.push(`spojoy 응답: ${text.length}자 ${text.slice(0, 70).replace(/\s+/g, ' ')}`);

    // 1) JSON 데이터 추출 시도 (__NEXT_DATA__, window 변수, JSON 블록)
    const jsonMatch = text.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
      || text.match(/window\.__(?:NUXT|DATA|INITIAL_STATE|matchData)__\s*=\s*({[\s\S]*?})\s*[;<]/)
      || text.match(/var\s+(?:matchList|gameList|liveData)\s*=\s*(\[[\s\S]*?\]);/);
    if (jsonMatch) {
      logs.push(`spojoy JSON 발견: ${jsonMatch[1].slice(0, 60)}`);
      try {
        const data = JSON.parse(jsonMatch[1]);
        const items = Array.isArray(data) ? data
          : data?.props?.pageProps?.matches || data?.matches || data?.games || data?.list || [];
        for (const g of (Array.isArray(items) ? items : [])) {
          const home = g.homeTeam || g.home || g.homeName || g.hometeam || '';
          const away = g.awayTeam || g.away || g.awayName || g.awayteam || '';
          if (!home || !away) continue;
          const hs = g.homeScore ?? g.homeGoal ?? g.hscore ?? 0;
          const as_ = g.awayScore ?? g.awayGoal ?? g.ascore ?? 0;
          const st = (g.status || g.state || g.gameStatus || '').toString();
          scores.push({
            homeTeam: String(home), awayTeam: String(away),
            homeScore: typeof hs === 'number' ? hs : parseInt(hs) || 0,
            awayScore: typeof as_ === 'number' ? as_ : parseInt(as_) || 0,
            status: /종료|fin|ft|end/i.test(st) ? 'FINISHED' : /진행|live|playing/i.test(st) ? 'LIVE' : 'SCHEDULED',
            timestamp: g.startTime ? new Date(g.startTime).getTime() : Date.now(),
            sport: /야구|baseball/i.test(g.sport || g.category || '') ? '야구' : '축구',
          });
        }
      } catch (e: any) { logs.push(`spojoy JSON 파싱실패: ${e?.message}`); }
    }

    // 2) HTML 테이블/행 파싱 폴백
    if (scores.length === 0) {
      // 한글 팀명 + 스코어 패턴: 팀A  N : N  팀B
      const re = /([가-힣A-Za-z][가-힣A-Za-z0-9\s.]{1,20}?)\s*(\d{1,3})\s*[:：]\s*(\d{1,3})\s*([가-힣A-Za-z][가-힣A-Za-z0-9\s.]{1,20}?)(?:\s|<)/g;
      let m;
      let cnt = 0;
      while ((m = re.exec(text)) !== null && cnt < 100) {
        cnt++;
        const home = m[1].trim(), away = m[4].trim();
        if (home.length < 2 || away.length < 2) continue;
        scores.push({
          homeTeam: home, awayTeam: away,
          homeScore: parseInt(m[2]), awayScore: parseInt(m[3]),
          status: 'FINISHED',
          timestamp: Date.now(),
          sport: '축구',
        });
      }
      if (cnt > 0) logs.push(`spojoy HTML파싱: ${cnt}개 패턴`);
    }

    if (scores.length > 0) return scores;
  }
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

// 서버(GitHub Actions)에서 Puppeteer로 미리 크롤링해 둔 라이브스코어 JSON.
// 네이버는 클라이언트 렌더링이라 앱에서 직접 못 긁으므로 서버가 대신 긁어서 저장.
const LIVESCORES_JSON_URL = 'https://raw.githubusercontent.com/vlralf77-svg/rep/claude%2Fgracious-fermat-c195k9/data/livescores.json';

async function fetchServerScores(logs: string[]): Promise<{ scores: LiveScore[]; age: number }> {
  // 캐시 무력화를 위해 타임스탬프 쿼리 추가
  const url = `${LIVESCORES_JSON_URL}?t=${Date.now()}`;
  const { text, ok } = await httpGet(url);
  if (!ok || !text) {
    logs.push(`서버JSON: ${ok ? '빈응답' : '실패'}`);
    return { scores: [], age: -1 };
  }
  try {
    const data = JSON.parse(text);
    const arr: LiveScore[] = Array.isArray(data?.scores) ? data.scores : [];
    const age = data?.updatedAt ? Math.round((Date.now() - new Date(data.updatedAt).getTime()) / 60000) : -1;
    logs.push(`서버JSON: ${arr.length}건 (${age >= 0 ? age + '분전' : '시각미상'})${data?.error ? ' err:' + data.error : ''}`);
    return { scores: arr, age };
  } catch (e: any) {
    logs.push(`서버JSON 파싱실패: ${e?.message}`);
    return { scores: [], age: -1 };
  }
}

// ── 통합 ─────────────────────────────────────────────────────────
export async function fetchLiveScores(): Promise<LiveScore[]> {
  const result = await fetchLiveScoresWithLog();
  return result.scores;
}

// 서버 JSON이 이 시간(분)보다 오래되면 신선한 실시간 소스를 우선 사용
const STALE_THRESHOLD_MIN = 10;

export async function fetchLiveScoresWithLog(): Promise<FetchResult> {
  const allScores: LiveScore[] = [];
  const logs: string[] = [];
  logs.push(`isNative: ${isNative}`);

  // 0. 서버 사전 크롤링 JSON (네이버 데이터 — 커버리지 넓음)
  let serverScores: LiveScore[] = [];
  let serverAge = -1;
  try {
    const srv = await fetchServerScores(logs);
    serverScores = srv.scores;
    serverAge = srv.age;
  } catch (e: any) { logs.push(`0.서버JSON: 에러 ${e?.message || e}`); }

  // 서버 데이터가 오래됐거나(>임계) 시각 미상이면 신선하지 않은 것으로 간주
  const serverStale = serverAge < 0 || serverAge > STALE_THRESHOLD_MIN;
  logs.push(`서버데이터: ${serverStale ? `오래됨(${serverAge}분) → 실시간소스 우선` : '신선'}`);

  // 신선하면 서버 데이터를 먼저 채움 (기존 동작)
  if (!serverStale) {
    allScores.push(...serverScores);
  }

  // 1. spojoy.com (한글 라이브스코어 — betman 매칭에 최적)
  if (allScores.length === 0) {
    try {
      const sp = await fetchSpojoy(logs);
      allScores.push(...sp);
      logs.push(`1.spojoy: ${sp.length}건`);
    } catch (e: any) { logs.push(`1.spojoy: 에러 ${e?.message || e}`); }
  }

  // 2. football-data.org (해외 축구, 영어→한글 매핑 + 전반 스코어 제공)
  //    서버 데이터가 오래됐으면 무조건 가져와서 우선 사용
  //    분(minute)이 실시간이라 항상 가져와서 LIVE 경기에 우선 적용
  let fbScores: LiveScore[] = [];
  try {
    fbScores = await fetchFootballData();
  } catch (e: any) { logs.push(`2.football-data: 에러 ${e?.message || e}`); }
  allScores.push(...fbScores);
  logs.push(`2.football-data: ${fbScores.length}건 추가 (실시간 분)`);

  // 3. 야구 — 서버 데이터가 오래됐거나 야구가 없으면 TheSportsDB (KBO)
  if (serverStale || !allScores.some(s => s.sport === '야구')) {
    try {
      const sdb = await fetchSportsDB();
      allScores.push(...sdb);
      logs.push(`3.SportsDB: ${sdb.length}건${serverStale ? ' (실시간 우선)' : ''}`);
    } catch (e: any) { logs.push(`3.SportsDB: 에러 ${e?.message || e}`); }
  }

  // 서버 데이터가 오래된 경우: 신선한 실시간 소스가 커버하지 못한 경기만
  // 서버 데이터로 보강 (네이버의 넓은 커버리지 유지, 단 신선한 데이터가 우선)
  if (serverStale && serverScores.length > 0) {
    let added = 0;
    for (const srv of serverScores) {
      if (!allScores.some(fresh => isSameGame(fresh, srv))) {
        allScores.push(srv);
        added++;
      }
    }
    logs.push(`0b.서버JSON 보강: ${added}건 (실시간에 없는 경기만)`);
  }

  // 4. 네이버 API (마지막 시도)
  if (allScores.length === 0) {
    try {
      const api = await fetchNaverApi(logs);
      allScores.push(...api);
      logs.push(`4.네이버API: ${api.length}건`);
    } catch (e: any) { logs.push(`4.네이버API: 에러 ${e?.message || e}`); }
  }

  // 5. livescore.in (축구 폴백)
  if (!allScores.some(s => s.sport === '축구')) {
    try {
      const ls = await fetchLivescoreIn();
      allScores.push(...ls);
      logs.push(`5.livescore.in: ${ls.length}건`);
    } catch (e: any) { logs.push(`5.livescore.in: 에러 ${e?.message || e}`); }
  }

  // 전반 마켓 판정용 하프타임 스코어 병합 — 서버/네이버 축구 경기에
  // 전반 스코어가 없으면 football-data 의 하프타임 값으로 보강.
  let halfMerged = 0;
  for (const s of allScores) {
    if (s.sport !== '축구' || s.homeHalfScore != null) continue;
    for (const fb of fbScores) {
      if (fb.homeHalfScore == null) continue;
      if (teamMatch(s.homeTeam, fb.homeTeam) && teamMatch(s.awayTeam, fb.awayTeam)) {
        s.homeHalfScore = fb.homeHalfScore; s.awayHalfScore = fb.awayHalfScore; halfMerged++; break;
      }
      if (teamMatch(s.homeTeam, fb.awayTeam) && teamMatch(s.awayTeam, fb.homeTeam)) {
        s.homeHalfScore = fb.awayHalfScore; s.awayHalfScore = fb.homeHalfScore; halfMerged++; break;
      }
    }
  }
  if (halfMerged) logs.push(`전반스코어 병합: ${halfMerged}건`);

  // 중복 제거 (같은 경기가 여러 소스에서 다른 타임스탬프로 들어올 수 있음)
  const deduped = deduplicateScores(allScores);
  if (deduped.length < allScores.length) {
    logs.push(`중복제거: ${allScores.length} → ${deduped.length}건`);
  }

  const summary = `총 ${deduped.length}건 (LIVE:${deduped.filter(s => s.status === 'LIVE').length} FIN:${deduped.filter(s => s.status === 'FINISHED').length})`;
  logs.push(summary);
  console.log(`[livescore] ${logs.join(' | ')}`);

  return { scores: deduped, logs };
}

// ── betman 경기 매칭 ─────────────────────────────────────────────
function norm(s: string): string {
  return (s || '').replace(/\s+/g, '').replace(/FC|fc|cf|CF/g, '').toLowerCase();
}
function teamMatch(a: string, b: string): boolean {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  // 약어 매칭: 짧은 쪽이 2자 이상이고 앞 2글자가 동일하면 같은 팀으로 간주
  // (예: "도미니공" ↔ "도미니카공화국", "세인트루" ↔ "세인트루이스")
  const short = na.length <= nb.length ? na : nb;
  const long = na.length <= nb.length ? nb : na;
  if (short.length >= 3 && long.startsWith(short.slice(0, 3))) return true;
  return false;
}

// 홈/원정이 뒤바뀐 경우 스코어를 betman 기준으로 정렬해서 반환
function orientScore(s: LiveScore): LiveScore {
  return {
    ...s,
    homeScore: s.awayScore, awayScore: s.homeScore,
    homeTeam: s.awayTeam, awayTeam: s.homeTeam,
    homeHalfScore: s.awayHalfScore, awayHalfScore: s.homeHalfScore,
  };
}

// homeTeam/awayTeam/gameDate/sport 만 있으면 매칭 가능 (BetmanGame, PredictionRecord 공용)
interface MatchableGame {
  homeTeam: string;
  awayTeam: string;
  gameDate?: string;
  sport?: string;
}

// KST 기준 날짜 키 (YYYY-MM-DD)
function kstDayKey(ts: number): string {
  const d = new Date(ts + 9 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// 같은 경기(같은 종목·양팀·같은 KST 날짜)인지 판별 — 중복 제거용
function isSameGame(a: LiveScore, b: LiveScore): boolean {
  if (a.sport !== b.sport) return false;
  if (kstDayKey(a.timestamp) !== kstDayKey(b.timestamp)) return false;
  return (teamMatch(a.homeTeam, b.homeTeam) && teamMatch(a.awayTeam, b.awayTeam))
    || (teamMatch(a.homeTeam, b.awayTeam) && teamMatch(a.awayTeam, b.homeTeam));
}

// 상태 우선순위: LIVE > FINISHED > SCHEDULED
function statusRank(s: LiveScore['status']): number {
  return s === 'LIVE' ? 0 : s === 'FINISHED' ? 1 : 2;
}

// 중복 경기 제거 — LIVE/FINISHED를 SCHEDULED보다 우선,
// 같은 상태면 실시간 소스(football-data)를 우선 (분 표시가 실시간)
function deduplicateScores(scores: LiveScore[]): LiveScore[] {
  const result: LiveScore[] = [];
  for (const s of scores) {
    const idx = result.findIndex(r => isSameGame(r, s));
    if (idx < 0) {
      result.push(s);
      continue;
    }
    const cur = result[idx];
    const rs = statusRank(s.status), rc = statusRank(cur.status);
    if (rs < rc) {
      result[idx] = s;
    } else if (rs === rc && s.realtime && !cur.realtime) {
      // 같은 상태면 실시간 분 정보를 가진 쪽으로 교체하되,
      // 한글 분 표기 등 기존 정보가 유용하면 minute만 실시간으로 보강
      result[idx] = { ...s, homeHalfScore: s.homeHalfScore ?? cur.homeHalfScore, awayHalfScore: s.awayHalfScore ?? cur.awayHalfScore };
    }
  }
  return result;
}

export function matchScore(game: MatchableGame, scores: LiveScore[]): LiveScore | null {
  if (!game.gameDate) return null;
  const gameTs = new Date(game.gameDate).getTime();
  const gameDay = kstDayKey(gameTs);
  const sameSport = (s: LiveScore) => !game.sport || s.sport === game.sport;

  // 양팀명이 일치하는 후보 수집 (연속 시리즈로 같은 팀 경기가 여럿일 수 있음)
  interface Cand { score: LiveScore; diff: number; sameDay: boolean; }
  const cands: Cand[] = [];
  for (const s of scores) {
    if (!sameSport(s)) continue;
    const diff = Math.abs(s.timestamp - gameTs);
    if (diff > 12 * 60 * 60 * 1000) continue;

    let flipped: boolean | null = null;
    if (teamMatch(game.homeTeam, s.homeTeam) && teamMatch(game.awayTeam, s.awayTeam)) flipped = false;
    else if (teamMatch(game.homeTeam, s.awayTeam) && teamMatch(game.awayTeam, s.homeTeam)) flipped = true;
    if (flipped === null) continue;

    cands.push({ score: flipped ? orientScore(s) : s, diff, sameDay: kstDayKey(s.timestamp) === gameDay });
  }

  if (cands.length > 0) {
    // 우선순위: ① 같은 KST 날짜 ② LIVE 상태(진행중 우선) ③ 시간 근접
    const rank = (c: Cand) => (c.sameDay ? 0 : 1000) + (c.score.status === 'LIVE' ? -1 : 0);
    cands.sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      return a.diff - b.diff;
    });
    return cands[0].score;
  }

  let best: LiveScore | null = null;
  let bestDiff = Infinity;

  // 폴백: 한쪽 팀명만 매칭 + 종목 + 시간 3시간 이내 (가장 가까운 것)
  bestDiff = Infinity;
  for (const s of scores) {
    const diff = Math.abs(s.timestamp - gameTs);
    if (diff > 3 * 60 * 60 * 1000 || !sameSport(s)) continue;
    const homeMatch = teamMatch(game.homeTeam, s.homeTeam) || teamMatch(game.homeTeam, s.awayTeam);
    const awayMatch = teamMatch(game.awayTeam, s.awayTeam) || teamMatch(game.awayTeam, s.homeTeam);
    if ((homeMatch || awayMatch) && diff < bestDiff) {
      bestDiff = diff;
      if (teamMatch(game.homeTeam, s.awayTeam) || teamMatch(game.awayTeam, s.homeTeam)) {
        best = orientScore(s);
      } else {
        best = s;
      }
    }
  }

  return best;
}

// ── 스코어 → 마켓 결과 자동 판정 ────────────────────────────────
export function determineResult(
  marketType: string,
  homeScore: number,
  awayScore: number,
  line?: number,
  homeHalfScore?: number,
  awayHalfScore?: number,
): string | null {
  // 전반 마켓: 전반(하프타임) 스코어가 있어야 판정 가능
  if (marketType.includes('전반')) {
    if (homeHalfScore == null || awayHalfScore == null) return null;
    homeScore = homeHalfScore;
    awayScore = awayHalfScore;
  }

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
