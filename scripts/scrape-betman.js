#!/usr/bin/env node
/**
 * betman.co.kr 스크래퍼
 * 스포츠토토(승무패) + 프로토 배당 데이터를 수집하여 data/betman.json으로 저장
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'data', 'betman.json');

async function scrape() {
  console.log('[betman] 브라우저 시작...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--lang=ko-KR',
    ],
  });

  const result = {
    updatedAt: new Date().toISOString(),
    toto: [],   // 스포츠토토 승무패
    proto: [],  // 프로토 승부식
  };

  try {
    // ── 스포츠토토 (승무패) ──────────────────────────────────────────────
    console.log('[betman] 스포츠토토 페이지 접근...');
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9' });

    // XHR/Fetch 응답 인터셉트 (내부 API 엔드포인트 캡처)
    const apiData = {};
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('betman') && (url.includes('/api/') || url.includes('.json') || url.includes('game'))) {
        try {
          const ct = response.headers()['content-type'] || '';
          if (ct.includes('json')) {
            const json = await response.json().catch(() => null);
            if (json) apiData[url] = json;
          }
        } catch { /* ignore */ }
      }
    });

    await page.goto('https://www.betman.co.kr/main/mainPage/game/S01/selectGameView.do', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    }).catch(() => {});

    await new Promise(r => setTimeout(r, 3000));

    // 캡처된 API 응답 먼저 파싱
    for (const [url, data] of Object.entries(apiData)) {
      console.log('[betman] API 응답 감지:', url);
      const games = extractTotoGames(data);
      result.toto.push(...games);
    }

    // API 응답이 없으면 HTML 파싱 시도
    if (result.toto.length === 0) {
      console.log('[betman] HTML 파싱 시도...');
      result.toto = await page.evaluate(() => {
        const games = [];
        // 일반적인 스포츠토토 경기 목록 선택자 시도
        const rows = document.querySelectorAll(
          '.game-list tr, .match-list tr, [class*="game"] tr, table tr'
        );
        rows.forEach((row) => {
          const cells = Array.from(row.querySelectorAll('td'));
          if (cells.length < 3) return;
          const texts = cells.map(c => c.innerText.trim()).filter(Boolean);
          // 팀명 + 배당 패턴 탐지
          if (texts.length >= 3 && texts.some(t => /^\d+\.\d+$/.test(t))) {
            games.push({ raw: texts.join(' | ') });
          }
        });
        return games;
      });
    }

    // ── 프로토 (승부식) ──────────────────────────────────────────────────
    console.log('[betman] 프로토 페이지 접근...');
    const page2 = await browser.newPage();
    await page2.setUserAgent('Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36');

    const apiData2 = {};
    page2.on('response', async (response) => {
      const url = response.url();
      if (url.includes('betman') && (url.includes('/api/') || url.includes('json') || url.includes('proto'))) {
        try {
          const ct = response.headers()['content-type'] || '';
          if (ct.includes('json')) {
            const json = await response.json().catch(() => null);
            if (json) apiData2[url] = json;
          }
        } catch { /* ignore */ }
      }
    });

    await page2.goto('https://www.betman.co.kr/main/mainPage/game/S02/selectGameView.do', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    }).catch(() => {});

    await new Promise(r => setTimeout(r, 3000));

    for (const [url, data] of Object.entries(apiData2)) {
      console.log('[betman] 프로토 API 응답 감지:', url);
      const games = extractProtoGames(data);
      result.proto.push(...games);
    }

    if (result.proto.length === 0) {
      result.proto = await page2.evaluate(() => {
        const games = [];
        const rows = document.querySelectorAll(
          '.game-list tr, .match-list tr, [class*="game"] tr, table tr'
        );
        rows.forEach((row) => {
          const cells = Array.from(row.querySelectorAll('td'));
          if (cells.length < 3) return;
          const texts = cells.map(c => c.innerText.trim()).filter(Boolean);
          if (texts.length >= 3 && texts.some(t => /^\d+\.\d+$/.test(t))) {
            games.push({ raw: texts.join(' | ') });
          }
        });
        return games;
      });
    }

    await page.close();
    await page2.close();
  } finally {
    await browser.close();
  }

  console.log(`[betman] 토토: ${result.toto.length}경기, 프로토: ${result.proto.length}경기`);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`[betman] 저장 완료: ${OUTPUT}`);
  return result;
}

/** betman API 응답에서 토토 게임 추출 (응답 구조에 따라 조정 필요) */
function extractTotoGames(data) {
  const games = [];
  const list = data?.gameList || data?.list || data?.data?.gameList || data?.result?.gameList || [];
  if (!Array.isArray(list)) return games;

  for (const g of list) {
    try {
      games.push({
        gameId: g.gameId || g.id || '',
        round: g.gameRound || g.round || '',
        gameDate: g.gameDate || g.matchDate || '',
        sport: g.sportsTypeNm || g.sport || '',
        league: g.leagueNm || g.league || '',
        homeTeam: g.homeTeamNm || g.homeTeam || '',
        awayTeam: g.awayTeamNm || g.awayTeam || '',
        odds: {
          homeWin: parseFloat(g.homeOdds || g.winOdds || '0'),
          draw: parseFloat(g.drawOdds || '0'),
          awayWin: parseFloat(g.awayOdds || g.loseOdds || '0'),
        },
        status: g.gameStatus || g.status || '',
        result: g.gameResult || null,
      });
    } catch { /* skip */ }
  }
  return games;
}

/** betman API 응답에서 프로토 게임 추출 */
function extractProtoGames(data) {
  const games = [];
  const list = data?.gameList || data?.list || data?.data?.gameList || data?.result?.gameList || [];
  if (!Array.isArray(list)) return games;

  for (const g of list) {
    try {
      games.push({
        gameId: g.gameId || g.id || '',
        round: g.gameRound || g.round || '',
        gameDate: g.gameDate || g.matchDate || '',
        sport: g.sportsTypeNm || g.sport || '',
        league: g.leagueNm || g.league || '',
        homeTeam: g.homeTeamNm || g.homeTeam || '',
        awayTeam: g.awayTeamNm || g.awayTeam || '',
        odds: {
          homeWin: parseFloat(g.homeOdds || g.winOdds || '0'),
          draw: parseFloat(g.drawOdds || '0'),
          awayWin: parseFloat(g.awayOdds || g.loseOdds || '0'),
        },
        handicap: g.handicap || null,
        overUnder: g.overUnder || null,
        status: g.gameStatus || g.status || '',
        result: g.gameResult || null,
      });
    } catch { /* skip */ }
  }
  return games;
}

scrape().catch(err => {
  console.error('[betman] 오류:', err.message);
  // 오류가 나도 빈 파일 저장 (workflow가 실패하지 않도록)
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({
    updatedAt: new Date().toISOString(),
    error: err.message,
    toto: [],
    proto: [],
  }, null, 2), 'utf-8');
  process.exit(0); // CI 실패 방지
});
