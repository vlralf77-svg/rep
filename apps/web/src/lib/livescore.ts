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

// ── 통합 ─────────────────────────────────────────────────────────
export async function fetchLiveScores(): Promise<LiveScore[]> {
  const result = await fetchLiveScoresWithLog();
  return result.scores;
}

export async function fetchLiveScoresWithLog(): Promise<FetchResult> {
  const allScores: LiveScore[] = [];
  const logs: string[] = [];
  logs.push(`isNative: ${isNative}`);

  // 1. spojoy.com (한글 라이브스코어 — betman 매칭에 최적)
  try {
    const sp = await fetchSpojoy(logs);
    allScores.push(...sp);
    logs.push(`1.spojoy: ${sp.length}건`);
  } catch (e: any) { logs.push(`1.spojoy: 에러 ${e?.message || e}`); }

  // 2. football-data.org (해외 축구, 영어→한글 매핑)
  if (!allScores.some(s => s.sport === '축구')) {
    try {
      const fb = await fetchFootballData();
      allScores.push(...fb);
      logs.push(`2.football-data: ${fb.length}건`);
    } catch (e: any) { logs.push(`2.football-data: 에러 ${e?.message || e}`); }
  }

  // 3. 야구 없으면 TheSportsDB (KBO)
  if (!allScores.some(s => s.sport === '야구')) {
    try {
      const sdb = await fetchSportsDB();
      allScores.push(...sdb);
      logs.push(`3.SportsDB: ${sdb.length}건`);
    } catch (e: any) { logs.push(`3.SportsDB: 에러 ${e?.message || e}`); }
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

  const summary = `총 ${allScores.length}건 (LIVE:${allScores.filter(s => s.status === 'LIVE').length} FIN:${allScores.filter(s => s.status === 'FINISHED').length})`;
  logs.push(summary);
  console.log(`[livescore] ${logs.join(' | ')}`);

  return { scores: allScores, logs };
}

// ── betman 경기 매칭 ─────────────────────────────────────────────
function norm(s: string): string {
  return (s || '').replace(/\s+/g, '').replace(/FC|fc|cf|CF/g, '').toLowerCase();
}
function teamMatch(a: string, b: string): boolean {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

// 홈/원정이 뒤바뀐 경우 스코어를 betman 기준으로 정렬해서 반환
function orientScore(s: LiveScore): LiveScore {
  return { ...s, homeScore: s.awayScore, awayScore: s.homeScore, homeTeam: s.awayTeam, awayTeam: s.homeTeam };
}

// homeTeam/awayTeam/gameDate/sport 만 있으면 매칭 가능 (BetmanGame, PredictionRecord 공용)
interface MatchableGame {
  homeTeam: string;
  awayTeam: string;
  gameDate?: string;
  sport?: string;
}

export function matchScore(game: MatchableGame, scores: LiveScore[]): LiveScore | null {
  if (!game.gameDate) return null;
  const gameTs = new Date(game.gameDate).getTime();
  const sameSport = (s: LiveScore) => !game.sport || s.sport === game.sport;

  // 1차: 종목 + 양팀명 (홈/원정 순서 무관)
  for (const s of scores) {
    if (!sameSport(s)) continue;
    if (teamMatch(game.homeTeam, s.homeTeam) && teamMatch(game.awayTeam, s.awayTeam)) return s;
    if (teamMatch(game.homeTeam, s.awayTeam) && teamMatch(game.awayTeam, s.homeTeam)) return orientScore(s);
  }

  // 2차: 양팀명 (종목 무시, 시간 3시간 이내)
  for (const s of scores) {
    if (Math.abs(s.timestamp - gameTs) > 3 * 60 * 60 * 1000) continue;
    if (teamMatch(game.homeTeam, s.homeTeam) && teamMatch(game.awayTeam, s.awayTeam)) return s;
    if (teamMatch(game.homeTeam, s.awayTeam) && teamMatch(game.awayTeam, s.homeTeam)) return orientScore(s);
  }

  // 3차: 한쪽 팀명 + 종목 + 시간
  for (const s of scores) {
    if (!sameSport(s)) continue;
    if (Math.abs(s.timestamp - gameTs) > 3 * 60 * 60 * 1000) continue;
    if (teamMatch(game.homeTeam, s.homeTeam) || teamMatch(game.awayTeam, s.awayTeam)) return s;
    if (teamMatch(game.homeTeam, s.awayTeam) || teamMatch(game.awayTeam, s.homeTeam)) return orientScore(s);
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
