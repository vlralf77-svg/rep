#!/usr/bin/env node
/**
 * betman.co.kr 크롤러 v6
 * 승부식(G101) 고정배당 추출 + 리스트 페이지 팀명/배당 파싱
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
    const oddsRe = /^[1-9]\d*\.\d{2}$/;

    // Find ALL leaf elements containing odds-like text
    const oddsNodes = [];
    document.querySelectorAll('*').forEach(el => {
      if (el.children.length > 0) return;
      const txt = el.textContent.replace(/\s/g, '');
      if (oddsRe.test(txt)) {
        const parent = el.parentElement;
        const grand = parent && parent.parentElement;
        oddsNodes.push({
          tag: el.tagName,
          cls: el.className || '',
          text: txt,
          parentTag: parent ? parent.tagName : '',
          parentCls: parent ? (parent.className || '') : '',
          grandHtml: grand ? grand.outerHTML.substring(0, 400) : '',
        });
      }
    });

    const diagLog = `Found ${oddsNodes.length} odds leaf nodes:\n` +
      oddsNodes.slice(0, 5).map(n =>
        `<${n.tag} class="${n.cls}">${n.text} parent=<${n.parentTag} class="${n.parentCls}">`
      ).join('\n') +
      (oddsNodes.length > 0 ? `\n\nFirst grandParent HTML:\n${oddsNodes[0].grandHtml}` : '');

    const results = [];
    if (oddsNodes.length === 0) return { results, diagLog };

    // Group odds nodes by their grandparent (match row container)
    // Build a map: grandparent element -> list of odds values
    const grandMap = new Map();
    document.querySelectorAll('*').forEach(el => {
      if (el.children.length > 0) return;
      const txt = el.textContent.replace(/\s/g, '');
      if (!oddsRe.test(txt)) return;
      const parent = el.parentElement;
      const grand = parent && parent.parentElement;
      if (!grand) return;
      if (!grandMap.has(grand)) grandMap.set(grand, []);
      grandMap.get(grand).push({ el, val: parseFloat(txt) });
    });

    for (const [container, oddEls] of grandMap) {
      if (oddEls.length < 2 || oddEls.length > 4) continue;
      const oddsValues = oddEls.map(o => o.val);
      const allText = container.textContent.replace(/\s+/g, ' ').trim();
      // Remove odds numbers to get team name text
      const cleaned = allText.replace(/[1-9]\d*\.\d{2}/g, '').replace(/\s+/g, ' ').trim();
      // Split on common separators to find team names
      const parts = cleaned.split(/vs\.?|대|:/i).map(s => s.trim()).filter(s => s.length > 1 && s.length < 30);
      results.push({
        gameId: `${gameName}_${results.length}`,
        round: '', gameDate: '',
        sport: gameName.includes('야구') ? '야구' : '축구',
        league: gameName,
        homeTeam: parts[0] || '',
        awayTeam: parts[1] || '',
        odds: {
          homeWin: oddsValues[0] || 0,
          draw: oddsValues.length >= 3 ? oddsValues[1] || 0 : 0,
          awayWin: oddsValues[oddsValues.length - 1] || 0,
        },
        status: '발매중', result: null,
        raw: allText.substring(0, 120),
      });
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
    }

    // 승부식만 고정배당이 있음 - 다른 게임 타입은 skip
    const targetGames = gameLinks.filter(g =>
      g.name.includes('승부식') || g.name.includes('승1패') || g.name.includes('승무패')
    );
    console.log(`[betman] 배당 추출 대상: ${targetGames.length}개`);

    const page2 = await browser.newPage();
    await page2.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36');

    let firstDetail = true;
    for (const game of targetGames.slice(0, 6)) {
      console.log(`[betman] 상세 로딩: ${game.name} → ${game.href}`);
      await page2.goto(game.href, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));

      const dHtml = await page2.content();
      if (firstDetail) {
        fs.writeFileSync(DETAIL_DEBUG, dHtml);
        const odds = dHtml.match(/\b[1-9]\d*\.\d{2}\b/g);
        console.log(`[debug] ${game.name} HTML: ${dHtml.length}bytes, 배당후보: ${odds ? [...new Set(odds)].slice(0,10) : '없음'}`);
        firstDetail = false;
      }

      const { results: matches, diagLog } = await extractMatches(page2, game);
      console.log(`  → ${matches.length}경기 추출`);
      if (matches.length === 0) {
        console.log(`[debug] ${game.name} 진단:\n${diagLog.substring(0, 600)}`);
      } else {
        matches.forEach(m => console.log(`    ${m.homeTeam} vs ${m.awayTeam} | 홈:${m.odds.homeWin} 무:${m.odds.draw} 원:${m.odds.awayWin}`));
      }
      if (game.name.includes('야구') || game.name.includes('승1패')) result.proto.push(...matches);
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
