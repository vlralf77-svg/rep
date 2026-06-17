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

function mapStatus(code, info) {
  const c = (code || '').toString().toUpperCase();
  const i = (info || '').toString();
  if (['RESULT', 'FINAL', 'END', 'FINISHED', 'CANCEL', 'POSTPONE'].includes(c)
    || i.includes('종료') || i.includes('FT')) return 'FINISHED';
  if (['PROGRESS', 'PLAYING', 'LIVE', 'STARTED'].includes(c)
    || i.includes('진행') || i.includes('회초') || i.includes('회말') || i.includes('이닝')) return 'LIVE';
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
  const status = mapStatus(g.statusCode || g.gameStatus || g.statusNum, g.statusInfo || g.statusText);
  const sc = (g.superCategoryId || g.sportCode || g.categoryId || '').toString().toLowerCase();
  const sport = sc.includes('baseball') || sc.includes('kbo') ? '야구'
    : sc.includes('football') || sc.includes('soccer') ? '축구' : '기타';
  return {
    homeTeam: home, awayTeam: away,
    homeScore: hsRaw == null || hsRaw === '' ? 0 : (typeof hsRaw === 'number' ? hsRaw : parseInt(hsRaw) || 0),
    awayScore: asRaw == null || asRaw === '' ? 0 : (typeof asRaw === 'number' ? asRaw : parseInt(asRaw) || 0),
    status, timestamp: ts, sport,
    // 진단용: 네이버 원본 상태 필드 (매핑 검증 후 제거)
    _raw: {
      statusCode: g.statusCode, gameStatus: g.gameStatus, statusNum: g.statusNum,
      statusInfo: g.statusInfo, statusText: g.statusText, gameStatusInfo: g.gameStatusInfo,
      cancel: g.cancel, suspended: g.suspended,
    },
  };
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

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36');

    // 네이버가 호출하는 스케줄/스코어보드 API 응답 가로채기
    page.on('response', async (res) => {
      const url = res.url();
      if (!/sports\.naver\.com\/.*(schedule|scoreboard|games)/i.test(url)) return;
      try {
        const ct = res.headers()['content-type'] || '';
        if (!ct.includes('json')) return;
        const data = await res.json();
        const before = scores.length;
        const tmp = [];
        collectGames(data, tmp);
        tmp.forEach(addScore);
        if (scores.length > before) console.log(`[scores] API ${url.slice(0, 60)} → +${scores.length - before}`);
      } catch { /* skip */ }
    });

    const dates = [kstDate(0), kstDate(-1)];
    const pages = [
      'https://m.sports.naver.com/scoreboard/index',
      ...dates.flatMap(d => [
        `https://m.sports.naver.com/kbaseball/schedule/index?date=${d}`,
        `https://m.sports.naver.com/wfootball/schedule/index?date=${d}`,
        `https://m.sports.naver.com/kfootball/schedule/index?date=${d}`,
      ]),
    ];

    for (const url of pages) {
      console.log(`[scores] 방문: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(e => console.log('[warn]', e.message));
      await new Promise(r => setTimeout(r, 2500));
    }
  } finally {
    await browser.close();
  }

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
