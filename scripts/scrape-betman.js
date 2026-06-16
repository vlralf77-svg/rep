#!/usr/bin/env node
/**
 * betman.co.kr 크롤러 v8
 * div.btnChkBox 구조 + 날짜/베팅타입 추출
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const BASE = 'https://www.betman.co.kr';
const OUTPUT = path.join(__dirname, '..', 'data', 'betman.json');
const DEBUG_HTML = path.join(__dirname, '..', 'data', 'betman-debug.html');
const DETAIL_DEBUG = path.join(__dirname, '..', 'data', 'betman-detail-debug.html');

async function getGameLinks(page, url) {
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 40000 }).catch(e => console.log('[warn]', e.message));
  await new Promise(r => setTimeout(r, 3000));
  const html = await page.content();
  fs.writeFileSync(DEBUG_HTML, html);

  return page.evaluate((base) => {
    const links = [];
    document.querySelectorAll('#listTbl tbody tr, table tbody tr').forEach(tr => {
      const a = tr.querySelector('a[href*=".do"]');
      if (!a) return;
      const href = a.getAttribute('href');
      const name = a.textContent.trim();
      if (!name) return;
      const cells = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
      links.push({ name, href: href.startsWith('http') ? href : base + href, cells });
    });
    return links;
  }, BASE);
}

async function extractMatches(page2, game) {
  await page2.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(r => setTimeout(r, 1500));

  return page2.evaluate((gameName) => {
    const results = [];
    const boxes = document.querySelectorAll('div.btnChkBox');
    const diagLog = `Found ${boxes.length} btnChkBox elements`;

    boxes.forEach((box, idx) => {
      const buttons = box.querySelectorAll('button.btnChk');
      if (!buttons.length) return;

      // Extract game date from data-gamecombkey timestamp
      const combKey = box.getAttribute('data-gamecombkey') || '';
      const tsMatch = combKey.match(/\d{13}/);
      const gameDate = tsMatch ? new Date(parseInt(tsMatch[0])).toISOString() : '';

      // Sport from key prefix (BS=baseball, SC=soccer) or game name
      const prefix = combKey.slice(0, 2);
      const sport = prefix === 'BS' ? '야구' : prefix === 'SC' ? '축구'
        : (gameName.includes('야구') ? '야구' : '축구');

      const title = buttons[0].getAttribute('title') || '';
      const [homeTeam = '', awayTeam = ''] = title.split(' vs ');

      const oddsMap = {};
      const selkeys = [];
      buttons.forEach(btn => {
        const selkey = btn.getAttribute('data-selkey');
        const span = btn.querySelector('span.db');
        if (selkey && span) {
          const val = parseFloat(span.textContent.replace(/\s/g, ''));
          if (!isNaN(val)) { oddsMap[selkey] = val; selkeys.push(selkey); }
        }
      });

      // Determine bet type from selkeys
      let betType = '';
      if (selkeys.includes('X')) betType = '승무패';
      else if (selkeys.includes('O') && selkeys.includes('U')) betType = '언더오버';
      else if (selkeys.some(k => /^H/.test(k))) betType = '핸디캡';
      else if (selkeys.includes('1') && selkeys.includes('2')) betType = '승1패';
      else return; // unknown type, skip

      // Build unified odds structure
      const homeWin = oddsMap['1'] || 0;
      const awayWin = oddsMap['2'] || 0;
      const drawOrOver = oddsMap['X'] || oddsMap['O'] || 0;
      const under = oddsMap['U'] || 0;

      if (!homeWin && !awayWin && !drawOrOver) return;

      results.push({
        gameId: `${gameName}_${idx}`,
        round: '',
        gameDate,
        sport,
        league: gameName,
        homeTeam: homeTeam.trim(),
        awayTeam: awayTeam.trim(),
        betType,
        odds: {
          homeWin,
          draw: drawOrOver,
          awayWin: betType === '언더오버' ? under : awayWin,
        },
        status: '발매중', result: null,
      });
    });

    return { results, diagLog };
  }, game.name);
}

async function scrape() {
  console.log('[betman] 브라우저 시작...');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--lang=ko-KR'],
    defaultViewport: { width: 1280, height: 900 },
  });

  const result = { updatedAt: new Date().toISOString(), toto: [], proto: [] };

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36');

    console.log('[betman] 발매중 게임(buyableGameList) 로딩...');
    let gameLinks = await getGameLinks(page, `${BASE}/main/mainPage/gamebuy/buyableGameList.do`);
    console.log(`[betman] 발매중 게임 ${gameLinks.length}개`);

    if (gameLinks.length === 0) {
      gameLinks = await getGameLinks(page, `${BASE}/main/mainPage/gamebuy/gameScheduleList.do`);
      console.log(`[betman] 일정 게임 ${gameLinks.length}개`);
    }

    const targetGames = gameLinks.filter(g =>
      g.name.includes('승부식') || g.name.includes('승1패') || g.name.includes('승무패')
    );
    console.log(`[betman] 배당 추출 대상: ${targetGames.length}개`);

    const page2 = await browser.newPage();
    await page2.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36');

    let firstDetail = true;
    for (const game of targetGames.slice(0, 6)) {
      console.log(`[betman] 상세 로딩: ${game.name}`);
      await page2.goto(game.href, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));

      if (firstDetail) {
        fs.writeFileSync(DETAIL_DEBUG, await page2.content());
        firstDetail = false;
      }

      const { results: matches, diagLog } = await extractMatches(page2, game);
      console.log(`  → ${matches.length}경기 추출 (${diagLog})`);
      matches.forEach(m => console.log(`    [${m.betType}] ${m.homeTeam} vs ${m.awayTeam} | 홈:${m.odds.homeWin} 무:${m.odds.draw} 원:${m.odds.awayWin} | ${m.gameDate}`));

      if (game.name.includes('야구') || game.name.includes('승부식')) result.proto.push(...matches);
      else result.toto.push(...matches);
    }

    await page2.close();
  } finally {
    await browser.close();
  }

  console.log(`[betman] 완료 - 토토: ${result.toto.length}, 프로토: ${result.proto.length}`);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2), 'utf-8');
}

scrape().catch(err => {
  console.error('[betman] 오류:', err.message);
  const result = { updatedAt: new Date().toISOString(), error: err.message, toto: [], proto: [] };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2), 'utf-8');
  process.exit(0);
});
