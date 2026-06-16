#!/usr/bin/env node
/**
 * betman.co.kr 크롤러 v5
 * buyableGameList.do (발매중) → gameScheduleList.do (예정) 순서로 시도
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
  return page2.evaluate((gameName) => {
    // Diagnostic: dump all table rows
    const tableData = [];
    document.querySelectorAll('table').forEach((tbl, ti) => {
      const rows = [];
      tbl.querySelectorAll('tr').forEach(tr => {
        const cells = Array.from(tr.querySelectorAll('td, th')).map(c => {
          // Normalize whitespace and non-breaking spaces
          return c.textContent.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
        }).filter(Boolean);
        if (cells.length > 0) rows.push(cells);
      });
      if (rows.length > 0) tableData.push({ tableIndex: ti, rows: rows.slice(0, 20) });
    });

    // Log first few tables for diagnosis
    const diagLog = tableData.slice(0, 5).map(t =>
      `[Table ${t.tableIndex}]\n` + t.rows.map(r => r.join(' | ')).join('\n')
    ).join('\n\n');

    // Extract odds from all tables
    const results = [];
    const oddsRe = /^[1-9]\d*\.\d{2}$/;

    for (const tbl of tableData) {
      for (const cells of tbl.rows) {
        // Try exact match on cells
        const oddsCells = cells.filter(c => oddsRe.test(c));
        if (oddsCells.length >= 2) {
          const nonOdds = cells.filter(c => !oddsRe.test(c) && !/^\d+$/.test(c) && c.length > 1 && c.length < 40);
          results.push({
            gameId: `${gameName}_${results.length}`,
            round: '', gameDate: '',
            sport: gameName.includes('야구') ? '야구' : '축구',
            league: gameName,
            homeTeam: nonOdds[0] || '',
            awayTeam: nonOdds[1] || '',
            odds: {
              homeWin: parseFloat(oddsCells[0]) || 0,
              draw: oddsCells.length >= 3 ? parseFloat(oddsCells[1]) || 0 : 0,
              awayWin: parseFloat(oddsCells[oddsCells.length - 1]) || 0,
            },
            status: '발매중', result: null,
            raw: cells.join(' | '),
          });
        }
      }
    }

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

    // 1. 발매중 게임 목록 먼저 시도
    console.log('[betman] 발매중 게임(buyableGameList) 로딩...');
    let gameLinks = await getGameLinks(page, `${BASE}/main/mainPage/gamebuy/buyableGameList.do`);
    console.log(`[betman] 발매중 게임 ${gameLinks.length}개`);
    gameLinks.forEach(g => console.log(' -', g.name, '|', g.cells.join(' | ').substring(0, 80)));

    // 2. 없으면 게임 일정(예정 포함)으로 폴백
    if (gameLinks.length === 0) {
      console.log('[betman] 발매중 게임 없음 → 게임일정 목록 시도');
      gameLinks = await getGameLinks(page, `${BASE}/main/mainPage/gamebuy/gameScheduleList.do`);
      console.log(`[betman] 일정 게임 ${gameLinks.length}개`);
      gameLinks.forEach(g => console.log(' -', g.name, '|', g.cells.join(' | ').substring(0, 80)));
    }

    // 3. 상세 페이지에서 배당 추출
    const page2 = await browser.newPage();
    await page2.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36');

    let firstDetail = true;
    for (const game of gameLinks.slice(0, 8)) {
      console.log(`[betman] 상세 로딩: ${game.name} → ${game.href}`);
      await page2.goto(game.href, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));

      const dHtml = await page2.content();
      if (firstDetail) {
        fs.writeFileSync(DETAIL_DEBUG, dHtml);
        const odds = dHtml.match(/\b[1-9]\.\d{2}\b/g);
        console.log(`[debug] 상세 HTML: ${dHtml.length}bytes, 배당후보: ${odds ? [...new Set(odds)].slice(0,10) : '없음'}`);
        if (dHtml.includes('로그인이 필요')) console.log('[debug] 로그인 필요!');
        firstDetail = false;
      }

      const { results: matches, diagLog } = await extractMatches(page2, game);

      if (matches.length === 0) {
        // Print table diagnosis for debugging
        console.log(`[debug] ${game.name} 테이블 구조:\n${diagLog.substring(0, 800)}`);
      }

      console.log(`  → ${matches.length}경기 추출`);
      if (game.name.includes('야구')) result.proto.push(...matches);
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
