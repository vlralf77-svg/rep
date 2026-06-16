#!/usr/bin/env node
/**
 * betman.co.kr 크롤러
 * 1단계: 페이지 HTML을 data/betman-debug.html 에 저장해서 구조 파악
 * 2단계: 구조 확인 후 실제 파싱 로직 추가
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'data', 'betman.json');
const DEBUG_HTML = path.join(__dirname, '..', 'data', 'betman-debug.html');

async function scrape() {
  console.log('[betman] 브라우저 시작...');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', '--disable-gpu',
      '--lang=ko-KR,ko',
      '--disable-blink-features=AutomationControlled',
    ],
    defaultViewport: { width: 1280, height: 900 },
  });

  const result = { updatedAt: new Date().toISOString(), toto: [], proto: [] };

  try {
    const page = await browser.newPage();

    // 봇 탐지 우회
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // 게임 일정 페이지 (로그인 불필요)
    console.log('[betman] 게임 일정 페이지 로딩...');
    await page.goto('https://www.betman.co.kr/main/mainPage/gamebuy/gameScheduleList.do', {
      waitUntil: 'networkidle0',
      timeout: 40000,
    }).catch(e => console.log('[warn]', e.message));

    // JS 렌더링 대기
    await new Promise(r => setTimeout(r, 5000));

    // 페이지 제목 확인
    const title = await page.title();
    console.log('[betman] 페이지 제목:', title);

    // 전체 HTML 저장 (구조 파악용)
    const html = await page.content();
    fs.mkdirSync(path.dirname(DEBUG_HTML), { recursive: true });
    fs.writeFileSync(DEBUG_HTML, html, 'utf-8');
    console.log('[betman] HTML 저장됨:', DEBUG_HTML, '(' + html.length + ' bytes)');

    // HTML에서 패턴으로 데이터 추출 시도
    // betman.co.kr 알려진 구조: 테이블 기반, 팀명+배당률
    const games = await page.evaluate(() => {
      const results = [];

      // 방법 1: 배당률이 있는 테이블 행
      document.querySelectorAll('table tbody tr').forEach(tr => {
        const tds = Array.from(tr.querySelectorAll('td'));
        const texts = tds.map(td => td.innerText.trim()).filter(Boolean);
        // 배당률 패턴 (x.xx)
        const oddsPattern = /^\d\.\d{2}$/;
        const oddsInRow = texts.filter(t => oddsPattern.test(t));
        if (oddsInRow.length >= 2) {
          results.push({ type: 'table', texts });
        }
      });

      // 방법 2: class에 'game' 또는 'match' 포함된 요소
      document.querySelectorAll('[class*="game"], [class*="match"], [class*="sport"]').forEach(el => {
        const text = el.innerText?.trim();
        if (text && text.length > 10 && text.length < 500) {
          const oddsPattern = /\d\.\d{2}/;
          if (oddsPattern.test(text)) {
            results.push({ type: 'class', text: text.substring(0, 200) });
          }
        }
      });

      // 방법 3: 페이지 내 모든 텍스트에서 배당 패턴
      const body = document.body.innerText;
      const lines = body.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      let oddsLineCount = 0;
      lines.forEach(line => {
        if (/\d\.\d{2}/.test(line) && line.length < 200) {
          if (++oddsLineCount <= 30) results.push({ type: 'text', line });
        }
      });

      return results;
    });

    console.log('[betman] 추출 결과:', games.length, '개 항목');
    games.forEach((g, i) => {
      if (i < 20) console.log(`  [${g.type}]`, JSON.stringify(g).substring(0, 150));
    });

    // 파싱된 게임을 결과에 추가
    const tableGames = games.filter(g => g.type === 'table');
    if (tableGames.length > 0) {
      result.toto = tableGames.map((g, i) => {
        const odds = g.texts.filter(t => /^\d\.\d{2}$/.test(t));
        return {
          gameId: `t_${i}`,
          round: '', gameDate: '',
          sport: '스포츠토토', league: '',
          homeTeam: g.texts[0] || '',
          awayTeam: g.texts[1] || '',
          odds: {
            homeWin: parseFloat(odds[0] || '0'),
            draw: parseFloat(odds[1] || '0'),
            awayWin: parseFloat(odds[2] || '0'),
          },
          status: '', result: null,
          raw: g.texts.join(' | '),
        };
      });
    } else if (games.length > 0) {
      // raw 텍스트라도 저장
      result.toto = games.slice(0, 30).map((g, i) => ({
        gameId: `r_${i}`,
        round: '', gameDate: '',
        sport: '스포츠토토', league: '',
        homeTeam: '', awayTeam: '',
        odds: { homeWin: 0, draw: 0, awayWin: 0 },
        status: '', result: null,
        raw: g.texts?.join(' | ') || g.text || g.line || '',
      }));
    }

  } finally {
    await browser.close();
  }

  console.log(`[betman] 토토: ${result.toto.length}경기`);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2), 'utf-8');
  console.log('[betman] 완료');
}

scrape().catch(err => {
  console.error('[betman] 오류:', err.message);
  const result = { updatedAt: new Date().toISOString(), error: err.message, toto: [], proto: [] };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2), 'utf-8');
  process.exit(0);
});
