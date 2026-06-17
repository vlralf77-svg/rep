#!/usr/bin/env node
/**
 * 라이브 스코어 크롤러
 * 네이버 스포츠는 클라이언트 사이드 렌더링이라 앱에서 직접 크롤링 불가.
 * → 서버(GitHub Actions)에서 Puppeteer로 실제 브라우저 렌더링 후
 *   네이버가 호출하는 JSON API 응답을 가로채서 data/livescores.json 으로 저장.
 *   앱은 이 JSON 파일만 읽으면 됨 (CORS/렌더링 문제 없음).
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'data', 'livescores.json');

function kstDate(offsetDays = 0) {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetDays * 86400000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

// 네이버 상태 판정: statusCode / statusNum 만 권위 있는 값으로 사용.
// statusInfo("1회초" 등)는 경기전에도 placeholder로 들어있어 신뢰 불가 → 표시용으로만 사용.
function mapStatus(g) {
  if (g.cancel === true || g.suspended === true) return 'SCHEDULED';
  const c = (g.statusCode || g.gameStatus || '').toString().toUpperCase();
  if (['BEFORE', 'READY', 'SCHEDULED', 'NOTSTARTED', 'NS'].includes(c)) return 'SCHEDULED';
  if (['STARTED', 'PROGRESS', 'PLAYING', 'LIVE', 'DURING', 'INPROGRESS'].includes(c)) return 'LIVE';
  if (['RESULT', 'FINAL', 'END', 'FINISHED', 'CLOSED', 'FT', 'AOT'].includes(c)) return 'FINISHED';
  if (['CANCEL', 'CANCELLED', 'POSTPONE', 'POSTPONED'].includes(c)) return 'SCHEDULED';
  // statusCode 가 없거나 미지의 값이면 statusNum 으로 폴백
  const n = Number(g.statusNum);
  if (!isNaN(n)) {
    if (n <= 1) return 'SCHEDULED';
    if (n <= 3) return 'LIVE';
    return 'FINISHED'; // 4,5
  }
  return 'SCHEDULED';
}

function parseGame(g) {
  const home = g.homeTeamName || g.homeTeam?.teamName || g.homeTeam?.name || g.homeName || '';
  const away = g.awayTeamName || g.awayTeam?.teamName || g.awayTeam?.name || g.awayName || '';
  if (!home || !away) return null;
  const hsRaw = g.homeTeamScore ?? g.homeTeam?.score ?? g.homeScore;
  const asRaw = g.awayTeamScore ?? g.awayTeam?.score ?? g.awayScore;
  const dt = g.gameDateTime || g.startTime || g.gameDate || g.startDateTime || '';
  const ts = dt ? new Date(dt).getTime() : Date.now();
  if (isNaN(ts)) return null;
  const status = mapStatus(g);
  const sc = [g.superCategoryId, g.sportCode, g.categoryId, g.categoryName, g.sportName]
    .filter(Boolean).join(' ').toLowerCase();
  const sport = sc.includes('volleyball') || sc.includes('배구') ? '배구'
    : sc.includes('basketball') || sc.includes('농구') ? '농구'
    : sc.includes('baseball') || sc.includes('kbo') || sc.includes('야구') ? '야구'
    : sc.includes('football') || sc.includes('soccer') || sc.includes('축구') ? '축구'
    : '기타';
  const out = {
    homeTeam: home, awayTeam: away,
    homeScore: hsRaw == null || hsRaw === '' ? 0 : (typeof hsRaw === 'number' ? hsRaw : parseInt(hsRaw) || 0),
    awayScore: asRaw == null || asRaw === '' ? 0 : (typeof asRaw === 'number' ? asRaw : parseInt(asRaw) || 0),
    status, timestamp: ts, sport,
  };
  // LIVE 일 때만 진행 정보 표시 (statusInfo: "후반 1'", "9회초" 등)
  if (status === 'LIVE' && g.statusInfo) {
    if (sport === '축구') out.minute = String(g.statusInfo);
    else out.inning = String(g.statusInfo);
  }
  return out;
}

// JSON 응답 본문에서 games 배열을 재귀적으로 찾기
function collectGames(obj, out) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const x of obj) collectGames(x, out);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if ((k === 'games' || k === 'gameList') && Array.isArray(v)) {
      for (const g of v) {
        const s = parseGame(g);
        if (s) out.push(s);
      }
    } else if (typeof v === 'object') {
      collectGames(v, out);
    }
  }
}

// spojoy 종목별 페이지 innerText 파싱 (네이버에 없는 배구 등 보완)
function parseSpojoy(text, sportName) {
  const out = [];
  const lines = text.split('\n').map(l => l.replace(/ /g, ' ').trim()).filter(Boolean);
  let curDate = null;
  const isHeader = (l) => /홈팀|원정팀|^대회$|^시간$|결과|비고|일정이 없습니다/.test(l);
  for (let i = 0; i < lines.length; i++) {
    const dm = lines[i].match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
    if (dm) { curDate = { y: +dm[1], mo: +dm[2], d: +dm[3] }; continue; }
    const tm = lines[i].match(/^(\d{1,2}):(\d{2})$/);
    if (!tm || !curDate) continue;
    let home, away, hs = 0, as = 0, status = 'SCHEDULED', found = false;
    for (let j = i + 1; j < Math.min(i + 9, lines.length); j++) {
      const L = lines[j];
      if (j > i + 1 && (/^\d{1,2}:\d{2}$/.test(L) || /\d{4}년/.test(L))) break;
      if (isHeader(L)) continue;
      const m = L.match(/^(.+?)\s+(\d+)\s*[-:]\s*(\d+)\s+(.+)$/);
      const v = L.match(/^(.+?)\s+vs\s+(.+)$/i);
      if (m) { home = m[1].trim(); hs = +m[2]; as = +m[3]; away = m[4].trim(); found = true; }
      else if (v) { home = v[1].trim(); away = v[2].trim(); found = true; }
      if (/경기종료|종료/.test(L)) status = 'FINISHED';
      else if (/경기중|진행/.test(L)) status = 'LIVE';
      else if (/경기취소|취소|연기|순연/.test(L)) status = 'SCHEDULED';
    }
    if (found && home && away) {
      const ts = Date.UTC(curDate.y, curDate.mo - 1, curDate.d, +tm[1] - 9, +tm[2]);
      out.push({ homeTeam: home, awayTeam: away, homeScore: hs, awayScore: as, status, timestamp: ts, sport: sportName });
    }
  }
  return out;
}

async function scrape() {
  console.log('[scores] 브라우저 시작...');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--lang=ko-KR'],
    defaultViewport: { width: 412, height: 900, isMobile: true },
  });

  const scores = [];
  const seen = new Set();
  const addScore = (s) => {
    const key = `${s.homeTeam}|${s.awayTeam}|${s.timestamp}`;
    if (seen.has(key)) return;
    seen.add(key);
    scores.push(s);
  };

  const apiDebug = [];
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36');

    // 네이버가 호출하는 모든 스포츠 API JSON 응답 가로채기
    page.on('response', async (res) => {
      const url = res.url();
      if (!/sports\.naver\.com/i.test(url)) return;
      if (!/(schedule|scoreboard|games|game|match|calendar)/i.test(url)) return;
      try {
        const ct = res.headers()['content-type'] || '';
        if (!ct.includes('json')) return;
        const data = await res.json();
        const before = scores.length;
        const tmp = [];
        collectGames(data, tmp);
        tmp.forEach(addScore);
        const added = scores.length - before;
        apiDebug.push(`+${added} ${url.replace(/https?:\/\/[^/]+/, '')}`);
        if (added > 0) console.log(`[scores] API +${added} ${url.slice(0, 80)}`);
      } catch { /* skip */ }
    });

    const dates = [kstDate(0), kstDate(-1)];
    const pages = [
      'https://m.sports.naver.com/scoreboard/index',
      ...dates.flatMap(d => [
        `https://m.sports.naver.com/kbaseball/schedule/index?date=${d}`,
        `https://m.sports.naver.com/wbaseball/schedule/index?date=${d}`,
        `https://m.sports.naver.com/wfootball/schedule/index?date=${d}`,
        `https://m.sports.naver.com/kfootball/schedule/index?date=${d}`,
        `https://m.sports.naver.com/volleyball/schedule/index?date=${d}`,
        `https://m.sports.naver.com/wvolleyball/schedule/index?date=${d}`,
        `https://m.sports.naver.com/basketball/schedule/index?date=${d}`,
        `https://m.sports.naver.com/wkbl/schedule/index?date=${d}`,
      ]),
    ];

    for (const url of pages) {
      console.log(`[scores] 방문: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(e => console.log('[warn]', e.message));
      await new Promise(r => setTimeout(r, 2500));
    }

    // ── spojoy.com (네이버에 없는 종목/경기 보완: 배구 등) ──
    const spojoyPages = [
      { mct: 'volleyball', sport: '배구' },
      { mct: 'basketball', sport: '농구' },
    ];
    for (const sp of spojoyPages) {
      try {
        console.log(`[scores] spojoy ${sp.sport} 방문...`);
        await page.goto(`https://www.spojoy.com/live/?mct=${sp.mct}`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(e => console.log('[warn spojoy]', e.message));
        await new Promise(r => setTimeout(r, 3500));
        const text = await page.evaluate(() => document.body ? document.body.innerText : '');
        const parsed = parseSpojoy(text, sp.sport);
        const before = scores.length;
        parsed.forEach(addScore);
        console.log(`[scores] spojoy ${sp.sport}: +${scores.length - before} (파싱 ${parsed.length})`);
      } catch (e) { console.log('[warn spojoy]', e.message); }
    }
  } finally {
    await browser.close();
  }

  void apiDebug;
  const result = {
    updatedAt: new Date().toISOString(),
    count: scores.length,
    scores,
  };
  console.log(`[scores] 완료 - ${scores.length}건 (LIVE:${scores.filter(s => s.status === 'LIVE').length} FIN:${scores.filter(s => s.status === 'FINISHED').length})`);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2), 'utf-8');
}

scrape().catch(err => {
  console.error('[scores] 오류:', err.message);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({ updatedAt: new Date().toISOString(), error: err.message, count: 0, scores: [] }, null, 2), 'utf-8');
  process.exit(0);
});
