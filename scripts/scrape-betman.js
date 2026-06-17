#!/usr/bin/env node
/**
 * betman.co.kr 크롤러 v9
 * 경기별로 여러 베팅 마켓(승무패/전반승무패/언더오버/전반언더오버 등)을 묶어서 수집
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

// 경기별로 마켓을 묶어서 추출. matchMap: key=home|away|ts → match object
async function extractInto(page2, gameName, matchMap) {
  await page2.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(r => setTimeout(r, 1500));

  const matches = await page2.evaluate(() => {
    const out = [];
    // 각 ul.list-proto-detail = 한 경기, 안의 li = 베팅 타입
    document.querySelectorAll('ul.list-proto-detail').forEach(ul => {
      const rowname = ul.getAttribute('data-rowname') || '';
      // 형식: 홈팀_원정팀_타임스탬프
      const m = rowname.match(/^(.+)_(.+)_(\d{10,13})$/);
      if (!m) return;
      const homeTeam = m[1].trim();
      const awayTeam = m[2].trim();
      const ts = parseInt(m[3]);
      const gameDate = ts ? new Date(ts).toISOString() : '';

      const markets = [];
      Array.from(ul.children).filter(el => el.tagName === 'LI' && el.hasAttribute('data-matchseq')).forEach(li => {
        const gb = li.querySelector('b.game');
        if (!gb) return;
        const fullType = gb.textContent.trim(); // "야구 승1패", "축구 전반 언더오버" 등
        const sport = fullType.startsWith('야구') ? '야구' : fullType.startsWith('축구') ? '축구' : '';
        const type = fullType.replace(/^(야구|축구)\s*/, '');

        // 언더오버/핸디캡 기준점수: span.udPoint (예: "U/O 2.5", "H -1.0")
        let line = null;
        const udSpans = li.querySelectorAll('span.udPoint');
        if (udSpans.length > 0) {
          const txt = udSpans[0].textContent.trim();
          const mm = txt.match(/-?\d+(\.\d+)?/);
          if (mm) line = parseFloat(mm[0]);
        }

        const selections = [];
        li.querySelectorAll('button.btnChk').forEach(btn => {
          const spans = btn.querySelectorAll('span');
          // 첫 span = label(승/무/패/언더/오버/홀/짝), span.db = 배당
          const db = btn.querySelector('span.db');
          let label = '';
          for (const s of spans) {
            if (s.classList.contains('db') || s.classList.contains('blind')) continue;
            const t = s.textContent.trim();
            if (t) { label = t; break; }
          }
          if (db) {
            const odds = parseFloat(db.textContent.replace(/[^0-9.]/g, ''));
            if (!isNaN(odds)) selections.push({ label, odds });
          }
        });

        if (selections.length >= 2) {
          markets.push({ type, sport, selections, ...(line !== null ? { line } : {}) });
        }
      });

      if (markets.length > 0) {
        out.push({ homeTeam, awayTeam, gameDate, ts, markets });
      }
    });
    return out;
  });

  // 머지: 같은 경기면 마켓 추가(타입 중복 제거)
  for (const mt of matches) {
    const key = `${mt.homeTeam}|${mt.awayTeam}|${mt.ts}`;
    if (!matchMap.has(key)) {
      const sport = mt.markets[0]?.sport || (gameName.includes('야구') ? '야구' : '축구');
      matchMap.set(key, {
        matchId: key,
        sport,
        league: gameName,
        homeTeam: mt.homeTeam,
        awayTeam: mt.awayTeam,
        gameDate: mt.gameDate,
        status: '발매중',
        markets: [],
      });
    }
    const entry = matchMap.get(key);
    // 같은 타입이라도 기준점(line)이 다르면 별도 마켓 (예: 핸디캡 2개 → 핸디캡, 핸디캡2)
    const seen = new Map(); // baseType -> [lines...]
    for (const m of entry.markets) {
      const base = m.type.replace(/\d+$/, '');
      if (!seen.has(base)) seen.set(base, []);
      seen.get(base).push(m.line ?? null);
    }
    for (const mk of mt.markets) {
      const base = mk.type;
      const lines = seen.get(base) || [];
      // 동일 타입+동일 line이면 진짜 중복 → skip
      if (lines.some(l => l === (mk.line ?? null))) continue;
      // 동일 타입이 이미 있으면 번호 부여(핸디캡 → 핸디캡2, 핸디캡3...)
      let type = base;
      if (lines.length > 0) type = `${base}${lines.length + 1}`;
      entry.markets.push({ type, selections: mk.selections, ...(mk.line != null ? { line: mk.line } : {}) });
      if (!seen.has(base)) seen.set(base, []);
      seen.get(base).push(mk.line ?? null);
    }
  }

  return matches.length;
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

    // 승부식(프로토) 페이지가 모든 베팅 타입을 포함함
    const protoGames = gameLinks.filter(g => g.name.includes('승부식'));
    const totoGames = gameLinks.filter(g => g.name.includes('승1패') || g.name.includes('승무패'));
    console.log(`[betman] 프로토 ${protoGames.length}개, 토토 ${totoGames.length}개`);

    const page2 = await browser.newPage();
    await page2.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36');

    let firstDetail = true;
    const protoMap = new Map();
    for (const game of protoGames.slice(0, 4)) {
      console.log(`[betman] 프로토 로딩: ${game.name}`);
      await page2.goto(game.href, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));
      if (firstDetail) { fs.writeFileSync(DETAIL_DEBUG, await page2.content()); firstDetail = false; }
      const n = await extractInto(page2, game.name, protoMap);
      console.log(`  → ul ${n}개 처리, 누적 경기 ${protoMap.size}`);
    }

    const totoMap = new Map();
    for (const game of totoGames.slice(0, 4)) {
      console.log(`[betman] 토토 로딩: ${game.name}`);
      await page2.goto(game.href, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));
      const n = await extractInto(page2, game.name, totoMap);
      console.log(`  → ul ${n}개 처리, 누적 경기 ${totoMap.size}`);
    }

    result.proto = Array.from(protoMap.values());
    result.toto = Array.from(totoMap.values());

    result.proto.forEach(m => console.log(`  [P] ${m.homeTeam} vs ${m.awayTeam} | 마켓 ${m.markets.length}개: ${m.markets.map(x => x.type).join(', ')}`));

    await page2.close();
  } finally {
    await browser.close();
  }

  console.log(`[betman] 완료 - 토토: ${result.toto.length}경기, 프로토: ${result.proto.length}경기`);
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
