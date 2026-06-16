#!/usr/bin/env node
/**
 * betman.co.kr API 직접 호출 스크래퍼
 * Puppeteer 없이 HTTP 요청으로 내부 API 탐색
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'data', 'betman.json');

const BASE = 'https://www.betman.co.kr';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 12; SM-S908N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36',
  'Accept': 'application/json, text/html, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Referer': 'https://www.betman.co.kr/',
  'X-Requested-With': 'XMLHttpRequest',
};

function request(url, options = {}) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const reqOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: { ...HEADERS, ...options.headers },
      timeout: 10000,
    };
    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    });
    req.on('error', () => resolve({ status: 0, data: '', headers: {} }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, data: 'timeout', headers: {} }); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function tryEndpoint(url, method = 'GET', body = null) {
  const opts = { method };
  if (body) {
    opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    opts.headers = { 'Content-Type': body && typeof body === 'object' ? 'application/json' : 'application/x-www-form-urlencoded' };
  }
  const res = await request(url, opts);
  if (res.status === 200 && res.data.length > 100) {
    try {
      const json = JSON.parse(res.data);
      console.log(`[OK ${res.status}] ${url} → ${res.data.substring(0, 150)}`);
      return json;
    } catch {
      // HTML 응답에서 JSON 블록 추출 시도
      const match = res.data.match(/\{[\s\S]{50,5000}\}/);
      if (match) {
        try { return JSON.parse(match[0]); } catch {}
      }
      console.log(`[HTML ${res.status}] ${url} → ${res.data.substring(0, 100)}`);
    }
  } else {
    console.log(`[${res.status}] ${url}`);
  }
  return null;
}

async function scrape() {
  console.log('[betman] HTTP 직접 호출 스크래퍼 시작');

  const result = { updatedAt: new Date().toISOString(), toto: [], proto: [] };

  // 세션 쿠키 획득
  console.log('[betman] 메인 페이지에서 세션 쿠키 획득...');
  const mainRes = await request(BASE + '/');
  const cookies = mainRes.headers['set-cookie']?.map(c => c.split(';')[0]).join('; ') || '';
  if (cookies) {
    HEADERS['Cookie'] = cookies;
    console.log('[betman] 쿠키 획득:', cookies.substring(0, 80));
  }

  // 스포츠토토 게임 목록 API 후보들
  const totoEndpoints = [
    // GET 방식
    `${BASE}/main/mainPage/game/S01/selectGameList.do`,
    `${BASE}/main/game/S01/selectGameList.do`,
    `${BASE}/ntry/spayo/game/infoGame.do`,
    `${BASE}/ntry/spayo/game/selectGameList.do`,
    `${BASE}/ntry/spayo/game/S01/selectGameList.do`,
    `${BASE}/main/mainPage/game/selectCurrentGameList.do?gameId=S01`,
    `${BASE}/main/mainPage/game/S01/selectGameView.do`,
    `${BASE}/api/game/S01`,
    `${BASE}/api/v1/game/S01/list`,
    `${BASE}/game/S01/list.json`,
  ];

  // POST 방식 시도
  const totoPostEndpoints = [
    [`${BASE}/main/mainPage/game/S01/selectGameList.do`, 'gameId=S01&pageIndex=1'],
    [`${BASE}/ntry/spayo/game/infoGame.do`, 'gameKindId=1&gameStatusCode=1'],
    [`${BASE}/main/mainPage/game/selectCurrentGameList.do`, 'sportsType=S01'],
  ];

  for (const url of totoEndpoints) {
    const data = await tryEndpoint(url);
    if (data) {
      const games = extractGames(data);
      if (games.length > 0) {
        console.log(`[betman] 토토 ${games.length}경기 획득!`);
        result.toto.push(...games);
        break;
      }
    }
  }

  if (result.toto.length === 0) {
    for (const [url, body] of totoPostEndpoints) {
      const data = await tryEndpoint(url, 'POST', body);
      if (data) {
        const games = extractGames(data);
        if (games.length > 0) {
          console.log(`[betman] 토토 POST로 ${games.length}경기 획득!`);
          result.toto.push(...games);
          break;
        }
      }
    }
  }

  // 프로토 게임 목록 API 후보들
  const protoEndpoints = [
    `${BASE}/main/mainPage/game/S02/selectGameList.do`,
    `${BASE}/main/game/S02/selectGameList.do`,
    `${BASE}/ntry/spayo/game/S02/selectGameList.do`,
    `${BASE}/main/mainPage/game/selectCurrentGameList.do?gameId=S02`,
    `${BASE}/api/game/S02`,
  ];

  for (const url of protoEndpoints) {
    const data = await tryEndpoint(url);
    if (data) {
      const games = extractGames(data);
      if (games.length > 0) {
        console.log(`[betman] 프로토 ${games.length}경기 획득!`);
        result.proto.push(...games);
        break;
      }
    }
  }

  console.log(`[betman] 완료 - 토토: ${result.toto.length}, 프로토: ${result.proto.length}`);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2), 'utf-8');
  console.log('[betman] 저장:', OUTPUT);
}

function extractGames(data) {
  const candidates = [
    data?.gameList, data?.list, data?.data?.gameList,
    data?.result?.gameList, data?.body?.gameList,
    data?.response?.gameList, data?.games,
    data?.data, data?.items,
  ];
  for (const list of candidates) {
    if (Array.isArray(list) && list.length > 0) {
      return list.map(g => ({
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
      }));
    }
  }
  return [];
}

scrape().catch(err => {
  console.error('[betman] 오류:', err.message);
  const result = { updatedAt: new Date().toISOString(), error: err.message, toto: [], proto: [] };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2), 'utf-8');
  process.exit(0);
});
