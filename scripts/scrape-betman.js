#!/usr/bin/env node
/**
 * betman.co.kr 크롤러 v3
 * gameScheduleList.do → 게임 목록 → 각 상세 페이지에서 배당 추출
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const BASE = 'https://www.betman.co.kr';
const OUTPUT = path.join(__dirname, '..', 'data', 'betman.json');
const DEBUG_HTML = path.join(__dirname, '..', 'data', 'betman-debug.html');

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

    // 1. 게임 일정 목록 페이지
    console.log('[betman] 게임 일정 목록 로딩...');
    await page.goto(`${BASE}/main/mainPage/gamebuy/gameScheduleList.do`, {
      waitUntil: 'networkidle0', timeout: 40000,
    }).catch(e => console.log('[warn]', e.message));
    await new Promise(r => setTimeout(r, 3000));

    const html = await page.content();
    fs.writeFileSync(DEBUG_HTML, html);

    // 2. 목록에서 게임 링크 추출
    const gameLinks = await page.evaluate((base) => {
      const links = [];
      document.querySelectorAll('#listTbl tbody tr').forEach(tr => {
        const a = tr.querySelector('a');
        if (!a) return;
        const href = a.getAttribute('href');
        const name = a.textContent.trim();
        const cells = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
        links.push({ name, href: href.startsWith('http') ? href : base + href, cells });
      });
      return links;
    }, BASE);

    console.log(`[betman] 게임 ${gameLinks.length}개 발견`);
    gameLinks.forEach(g => console.log(' -', g.name, g.href));

    // 3. 발매중인 게임만 상세 페이지 크롤링 (최대 5개)
    const activGames = gameLinks.filter(g =>
      g.cells.some(c => c.includes('발매중') || c.includes('마감임박') || c.includes('발매예정'))
    ).slice(0, 8);

    const page2 = await browser.newPage();
    await page2.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36');

    const DETAIL_DEBUG = path.join(__dirname, '..', 'data', 'betman-detail-debug.html');
    let firstDetail = true;

    for (const game of activGames) {
      console.log(`[betman] 상세 로딩: ${game.name}`);
      await page2.goto(game.href, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));

      // 첫 번째 상세 페이지 HTML 저장 (디버그)
      if (firstDetail) {
        const detailHtml = await page2.content();
        fs.writeFileSync(DETAIL_DEBUG, detailHtml);
        const title = await page2.title();
        console.log(`[debug] 상세 페이지 제목: ${title}, HTML: ${detailHtml.length}bytes`);
        // 로그인 필요 여부
        if (detailHtml.includes('로그인이 필요')) {
          console.log('[debug] 상세 페이지도 로그인 필요!');
        }
        // 배당률 패턴
        const odds = detailHtml.match(/\b[1-9]\.\d{2}\b/g);
        console.log('[debug] 배당률 패턴:', odds ? odds.slice(0, 10) : '없음');
        firstDetail = false;
      }

      const matches = await page2.evaluate((gameName) => {
        const results = [];

        // 배당 테이블 선택자 시도
        const tables = document.querySelectorAll('table');
        tables.forEach(table => {
          const rows = Array.from(table.querySelectorAll('tr'));
          rows.forEach(row => {
            const cells = Array.from(row.querySelectorAll('td, th')).map(c => c.textContent.trim()).filter(Boolean);
            if (cells.length < 3) return;

            // 배당률 패턴 (x.xx)
            const oddsPattern = /^\d\.\d{2}$/;
            const oddsCells = cells.filter(c => oddsPattern.test(c));

            if (oddsCells.length >= 2) {
              results.push({
                raw: cells.join(' | '),
                odds: oddsCells,
                cells,
              });
            }
          });
        });

        // 팀명 + 배당 패턴으로 매치 구성
        const matchResults = [];
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          const nonOdds = r.cells.filter(c => !/^\d[\d.]*$/.test(c) && c.length > 1 && c.length < 30);
          matchResults.push({
            gameId: `${gameName}_${i}`,
            round: '',
            gameDate: '',
            sport: gameName.includes('야구') ? '야구' : '축구',
            league: gameName,
            homeTeam: nonOdds[0] || '',
            awayTeam: nonOdds[1] || '',
            odds: {
              homeWin: parseFloat(r.odds[0] || '0') || 0,
              draw: r.odds.length >= 3 ? parseFloat(r.odds[1] || '0') || 0 : 0,
              awayWin: parseFloat(r.odds[r.odds.length - 1] || '0') || 0,
            },
            status: '발매중',
            result: null,
            raw: r.raw,
          });
        }
        return matchResults;
      }, game.name);

      console.log(`  → ${matches.length}경기 추출`);

      if (game.name.includes('야구') || game.name.includes('BS')) {
        result.proto.push(...matches);
      } else {
        result.toto.push(...matches);
      }
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
