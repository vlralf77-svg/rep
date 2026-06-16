#!/usr/bin/env node
/**
 * betman.co.kr 스크래퍼 v2
 * - 모든 네트워크 요청을 로깅하여 내부 API 엔드포인트 탐지
 * - 페이지 로드 대기 시간 증가
 * - 직접 API 호출 시도
 */

const puppeteer = require('puppeteer-core');
const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'data', 'betman.json');

const result = {
  updatedAt: new Date().toISOString(),
  toto: [],
  proto: [],
};

// betman 내부 API 직접 호출 시도
async function tryDirectApi() {
  const endpoints = [
    // 스포츠토토 승무패 게임 목록
    'https://www.betman.co.kr/main/game/S01/selectGameList.do',
    'https://www.betman.co.kr/api/game/S01/list',
    'https://www.betman.co.kr/main/mainPage/game/S01/selectGameList.json',
    // 프로토 승부식
    'https://www.betman.co.kr/main/game/S02/selectGameList.do',
    'https://www.betman.co.kr/api/game/S02/list',
    // 공통 게임 목록
    'https://www.betman.co.kr/main/mainPage/game/selectCurrentGameList.do',
    'https://www.betman.co.kr/ntry/spayo/game/infoGame.do',
  ];

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 12; SM-S908N) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Referer': 'https://www.betman.co.kr/',
    'X-Requested-With': 'XMLHttpRequest',
  };

  for (const url of endpoints) {
    try {
      const data = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
        .then(r => r.text());
      if (data && data.length > 100 && (data.includes('gameId') || data.includes('homeTeam') || data.includes('odds') || data.includes('배당'))) {
        console.log('[betman] 직접 API 성공:', url);
        try { return JSON.parse(data); } catch { return { raw: data }; }
      }
    } catch (e) {
      // 무시
    }
  }
  return null;
}

async function scrape() {
  console.log('[betman] v2 스크래퍼 시작...');

  // 직접 API 시도
  const directData = await tryDirectApi();
  if (directData) {
    console.log('[betman] 직접 API로 데이터 획득');
    const games = extractTotoGames(directData);
    result.toto.push(...games);
  }

  // Puppeteer로 브라우저 접근
  console.log('[betman] 브라우저 시작...');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--lang=ko-KR,ko',
      '--disable-blink-features=AutomationControlled',
    ],
    defaultViewport: { width: 390, height: 844 },
  });

  try {
    const page = await browser.newPage();

    // 봇 탐지 우회
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    await page.setUserAgent('Mozilla/5.0 (Linux; Android 12; SM-S908N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    });

    // 모든 네트워크 요청 로깅
    const capturedApis = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('betman') && !url.includes('.css') && !url.includes('.js') && !url.includes('.png') && !url.includes('.jpg')) {
        console.log('[net]', req.method(), url.replace('https://www.betman.co.kr', ''));
      }
    });

    page.on('response', async (response) => {
      const url = response.url();
      if (!url.includes('betman')) return;
      const ct = response.headers()['content-type'] || '';
      if (ct.includes('json') || url.includes('.json') || url.includes('List') || url.includes('list')) {
        try {
          const text = await response.text();
          if (text.length > 50) {
            console.log('[api]', url.replace('https://www.betman.co.kr', ''), '→', text.substring(0, 200));
            try {
              const json = JSON.parse(text);
              capturedApis.push({ url, data: json });
            } catch {
              capturedApis.push({ url, text });
            }
          }
        } catch { /* ignore */ }
      }
    });

    // 메인 페이지 먼저 방문 (쿠키/세션 획득)
    console.log('[betman] 메인 페이지 방문...');
    await page.goto('https://www.betman.co.kr/', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));

    // 스포츠토토 페이지
    console.log('[betman] 스포츠토토 게임 페이지...');
    await page.goto('https://www.betman.co.kr/main/mainPage/game/S01/selectGameView.do', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    }).catch(() => {});
    await new Promise(r => setTimeout(r, 5000));

    // 페이지 내 클릭 유도 (동적 로딩)
    await page.evaluate(() => {
      const els = document.querySelectorAll('a, button, .game-tab, .tab, [onclick]');
      els.forEach(el => { try { el.click(); } catch {} });
    }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));

    // HTML에서 데이터 추출
    const htmlGames = await page.evaluate(() => {
      const games = [];

      // 배당 숫자 패턴으로 행 탐색
      const allElements = document.querySelectorAll('tr, li, [class*="game"], [class*="match"], [class*="item"]');
      allElements.forEach(el => {
        const text = el.innerText || '';
        // 배당률 패턴 (1.xx ~ 9.xx)
        const odds = text.match(/\b[1-9]\.\d{2}\b/g);
        if (odds && odds.length >= 2) {
          // 팀명 추출 시도
          const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
          games.push({
            raw: lines.slice(0, 8).join(' | '),
            oddsFound: odds,
          });
        }
      });

      // 스크립트 변수에서 데이터 추출
      const scripts = Array.from(document.querySelectorAll('script:not([src])'));
      const scriptData = [];
      scripts.forEach(s => {
        const t = s.textContent || '';
        if ((t.includes('gameList') || t.includes('oddsInfo') || t.includes('homeTeam')) && t.length < 100000) {
          scriptData.push(t.substring(0, 500));
        }
      });

      return { games: games.slice(0, 20), scriptHints: scriptData.slice(0, 3) };
    }).catch(() => ({ games: [], scriptHints: [] }));

    console.log('[betman] HTML 게임 후보:', htmlGames.games.length, '개');
    if (htmlGames.scriptHints.length > 0) {
      console.log('[betman] 스크립트 힌트:', htmlGames.scriptHints[0].substring(0, 300));
    }

    // 캡처된 API 응답 처리
    for (const { url, data, text } of capturedApis) {
      if (data) {
        const games = extractTotoGames(data);
        if (games.length > 0) {
          console.log(`[betman] API에서 ${games.length}경기 추출:`, url);
          result.toto.push(...games);
        }
      }
    }

    // HTML에서 추출한 raw 데이터 (API 실패 시 폴백)
    if (result.toto.length === 0 && htmlGames.games.length > 0) {
      console.log('[betman] HTML raw 데이터 사용');
      result.toto = htmlGames.games.map((g, i) => ({
        gameId: `html_${i}`,
        round: '',
        gameDate: '',
        sport: '',
        league: '',
        homeTeam: '',
        awayTeam: '',
        odds: { homeWin: parseFloat(g.oddsFound?.[0] || '0'), draw: parseFloat(g.oddsFound?.[1] || '0'), awayWin: parseFloat(g.oddsFound?.[2] || '0') },
        status: '',
        result: null,
        raw: g.raw,
      }));
    }

    // 프로토 페이지
    console.log('[betman] 프로토 페이지...');
    await page.goto('https://www.betman.co.kr/main/mainPage/game/S02/selectGameView.do', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    }).catch(() => {});
    await new Promise(r => setTimeout(r, 5000));

    const htmlGames2 = await page.evaluate(() => {
      const games = [];
      const allElements = document.querySelectorAll('tr, li, [class*="game"], [class*="match"], [class*="item"]');
      allElements.forEach(el => {
        const text = el.innerText || '';
        const odds = text.match(/\b[1-9]\.\d{2}\b/g);
        if (odds && odds.length >= 2) {
          const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
          games.push({ raw: lines.slice(0, 8).join(' | '), oddsFound: odds });
        }
      });
      return games.slice(0, 20);
    }).catch(() => []);

    if (result.proto.length === 0 && htmlGames2.length > 0) {
      result.proto = htmlGames2.map((g, i) => ({
        gameId: `proto_${i}`,
        round: '', gameDate: '', sport: '', league: '', homeTeam: '', awayTeam: '',
        odds: { homeWin: parseFloat(g.oddsFound?.[0] || '0'), draw: parseFloat(g.oddsFound?.[1] || '0'), awayWin: parseFloat(g.oddsFound?.[2] || '0') },
        status: '', result: null, raw: g.raw,
      }));
    }

  } finally {
    await browser.close();
  }

  console.log(`[betman] 토토: ${result.toto.length}경기, 프로토: ${result.proto.length}경기`);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2), 'utf-8');
  console.log('[betman] 저장 완료');
}

function extractTotoGames(data) {
  const games = [];
  const list = data?.gameList || data?.list || data?.data?.gameList
    || data?.result?.gameList || data?.body?.gameList
    || data?.response?.gameList || (Array.isArray(data) ? data : []);
  if (!Array.isArray(list)) return games;
  for (const g of list) {
    try {
      games.push({
        gameId: String(g.gameId || g.id || g.gmId || ''),
        round: String(g.gameRound || g.round || g.gmRound || ''),
        gameDate: g.gameDate || g.matchDate || g.gmDate || '',
        sport: g.sportsTypeNm || g.sport || g.sportsNm || '',
        league: g.leagueNm || g.league || g.leagName || '',
        homeTeam: g.homeTeamNm || g.homeTeam || g.hmTeamNm || '',
        awayTeam: g.awayTeamNm || g.awayTeam || g.awTeamNm || '',
        odds: {
          homeWin: parseFloat(g.homeOdds || g.winOdds || g.hmOdds || '0') || 0,
          draw: parseFloat(g.drawOdds || g.drawOdd || '0') || 0,
          awayWin: parseFloat(g.awayOdds || g.loseOdds || g.awOdds || '0') || 0,
        },
        status: g.gameStatus || g.status || g.gmStatus || '',
        result: g.gameResult || g.result || null,
      });
    } catch { /* skip */ }
  }
  return games;
}

scrape().catch(err => {
  console.error('[betman] 오류:', err.message);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({ ...result, error: err.message }, null, 2), 'utf-8');
  process.exit(0);
});
