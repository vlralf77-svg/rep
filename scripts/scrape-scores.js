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

// 네이버 상태 판정: statusCode / statusNum 만 권위 있는 값으로 사용.
// statusInfo("1회초" 등)는 경기전에도 placeholder로 들어있어 신뢰 불가 → 표시용으로만 사용.
function mapStatus(g) {
  if (g.cancel === true || g.suspended === true) return 'SCHEDULED';
  const c = (g.statusCode || g.gameStatus || '').toString().toUpperCase();
  if (['BEFORE', 'READY', 'SCHEDULED', 'NOTSTARTED', 'NS'].includes(c)) return 'SCHEDULED';
  if (['STARTED', 'PROGRESS', 'PLAYING', 'LIVE', 'DURING', 'INPROGRESS'].includes(c)) return 'LIVE';
  if (['RESULT', 'FINAL', 'END', 'FINISHED', 'CLOSED', 'FT', 'AOT'].includes(c)) return 'FINISHED';
  if (['CANCEL', 'CANCELLED', 'POSTPONE', 'POSTPONED'].includes(c)) return 'SCHEDULED';
  // statusCode 가 없거나 미지의 값이면 statusNum 으로 폴백
  const n = Number(g.statusNum);
  if (!isNaN(n)) {
    if (n <= 1) return 'SCHEDULED';
    if (n <= 3) return 'LIVE';
    return 'FINISHED'; // 4,5
  }
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
  const status = mapStatus(g);
  const sc = [g.superCategoryId, g.sportCode, g.categoryId, g.categoryName, g.sportName]
    .filter(Boolean).join(' ').toLowerCase();
  const sport = sc.includes('volleyball') || sc.includes('배구') ? '배구'
    : sc.includes('basketball') || sc.includes('농구') ? '농구'
    : sc.includes('baseball') || sc.includes('kbo') || sc.includes('야구') ? '야구'
    : sc.includes('football') || sc.includes('soccer') || sc.includes('축구') ? '축구'
    : '기타';
  const toNum = (v) => v == null || v === '' ? undefined : (typeof v === 'number' ? v : (isNaN(parseInt(v)) ? undefined : parseInt(v)));
  const out = {
    homeTeam: home, awayTeam: away,
    homeScore: hsRaw == null || hsRaw === '' ? 0 : (typeof hsRaw === 'number' ? hsRaw : parseInt(hsRaw) || 0),
    awayScore: asRaw == null || asRaw === '' ? 0 : (typeof asRaw === 'number' ? asRaw : parseInt(asRaw) || 0),
    status, timestamp: ts, sport,
  };
  // 전반(하프타임) 스코어 — 네이버 축구 경기 객체에 있으면 표시 (필드명 후보 다수)
  if (sport === '축구') {
    const hh = toNum(g.homeTeamHalfScore ?? g.homeHalfScore ?? g.homeTeamFirstHalfScore
      ?? g.homeTeam?.halfScore ?? g.homeTeam?.firstHalfScore
      ?? (Array.isArray(g.homeTeamScoreByPeriod) ? g.homeTeamScoreByPeriod[0] : undefined)
      ?? (Array.isArray(g.homePeriodScores) ? g.homePeriodScores[0] : undefined));
    const ah = toNum(g.awayTeamHalfScore ?? g.awayHalfScore ?? g.awayTeamFirstHalfScore
      ?? g.awayTeam?.halfScore ?? g.awayTeam?.firstHalfScore
      ?? (Array.isArray(g.awayTeamScoreByPeriod) ? g.awayTeamScoreByPeriod[0] : undefined)
      ?? (Array.isArray(g.awayPeriodScores) ? g.awayPeriodScores[0] : undefined));
    if (hh != null && ah != null) { out.homeHalfScore = hh; out.awayHalfScore = ah; }
  }
  // LIVE 일 때만 진행 정보 표시 (statusInfo: "후반 1'", "9회초" 등)
  if (status === 'LIVE' && g.statusInfo) {
    if (sport === '축구') out.minute = String(g.statusInfo);
    else out.inning = String(g.statusInfo);
  }
  return out;
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

// spojoy 종목별 페이지 innerText 파싱 (네이버에 없는 배구 등 보완)
function parseSpojoy(text, sportName) {
  const out = [];
  const lines = text.split('\n').map(l => l.replace(/ /g, ' ').trim()).filter(Boolean);
  let curDate = null;
  const isHeader = (l) => /홈팀|원정팀|^대회$|^시간$|결과|비고|일정이 없습니다/.test(l);
  for (let i = 0; i < lines.length; i++) {
    const dm = lines[i].match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
    if (dm) { curDate = { y: +dm[1], mo: +dm[2], d: +dm[3] }; continue; }
    const tm = lines[i].match(/^(\d{1,2}):(\d{2})$/);
    if (!tm || !curDate) continue;
    let home, away, hs = 0, as = 0, status = 'SCHEDULED', found = false, halfHome, halfAway;
    for (let j = i + 1; j < Math.min(i + 9, lines.length); j++) {
      const L = lines[j];
      if (j > i + 1 && (/^\d{1,2}:\d{2}$/.test(L) || /\d{4}년/.test(L))) break;
      if (isHeader(L)) continue;
      const m = L.match(/^(.+?)\s+(\d+)\s*[-:]\s*(\d+)\s+(.+)$/);
      const v = L.match(/^(.+?)\s+vs\s+(.+)$/i);
      if (m) { home = m[1].trim(); hs = +m[2]; as = +m[3]; away = m[4].trim(); found = true; }
      else if (v) { home = v[1].trim(); away = v[2].trim(); found = true; }
      // 전반 스코어 파싱: "(전반 1-0)", "(1:0)", "전반 2-1" 등
      const hm = L.match(/(?:전반|HT|1st)\s*(\d+)\s*[-:]\s*(\d+)/i) || L.match(/\((\d+)\s*[-:]\s*(\d+)\)/);
      if (hm && !halfHome) { halfHome = +hm[1]; halfAway = +hm[2]; }
      if (/경기종료|종료/.test(L)) status = 'FINISHED';
      else if (/경기중|진행/.test(L)) status = 'LIVE';
      else if (/경기취소|취소|연기|순연/.test(L)) status = 'SCHEDULED';
    }
    if (found && home && away) {
      const ts = Date.UTC(curDate.y, curDate.mo - 1, curDate.d, +tm[1] - 9, +tm[2]);
      const entry = { homeTeam: home, awayTeam: away, homeScore: hs, awayScore: as, status, timestamp: ts, sport: sportName };
      if (halfHome != null) { entry.homeHalfScore = halfHome; entry.awayHalfScore = halfAway; }
      out.push(entry);
    }
  }
  return out;
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
    if (seen.has(key)) {
      // 이미 있으면 전반 스코어만 보강
      if (s.homeHalfScore != null) {
        const existing = scores.find(x => `${x.homeTeam}|${x.awayTeam}|${x.timestamp}` === key);
        if (existing && existing.homeHalfScore == null) {
          existing.homeHalfScore = s.homeHalfScore;
          existing.awayHalfScore = s.awayHalfScore;
        }
      }
      return;
    }
    seen.add(key);
    scores.push(s);
  };

  const apiDebug = [];
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36');

    // 네이버가 호출하는 모든 스포츠 API JSON 응답 가로채기
    page.on('response', async (res) => {
      const url = res.url();
      if (!/sports\.naver\.com/i.test(url)) return;
      if (!/(schedule|scoreboard|games|game|match|calendar)/i.test(url)) return;
      try {
        const ct = res.headers()['content-type'] || '';
        if (!ct.includes('json')) return;
        const data = await res.json();
        const before = scores.length;
        const tmp = [];
        collectGames(data, tmp);
        tmp.forEach(addScore);
        const added = scores.length - before;
        apiDebug.push(`+${added} ${url.replace(/https?:\/\/[^/]+/, '')}`);
        if (added > 0) console.log(`[scores] API +${added} ${url.slice(0, 80)}`);
      } catch { /* skip */ }
    });

    const dates = [kstDate(0), kstDate(-1)];
    const pages = [
      'https://m.sports.naver.com/scoreboard/index',
      ...dates.flatMap(d => [
        `https://m.sports.naver.com/kbaseball/schedule/index?date=${d}`,
        `https://m.sports.naver.com/wbaseball/schedule/index?date=${d}`,
        `https://m.sports.naver.com/wfootball/schedule/index?date=${d}`,
        `https://m.sports.naver.com/kfootball/schedule/index?date=${d}`,
        `https://m.sports.naver.com/volleyball/schedule/index?date=${d}`,
        `https://m.sports.naver.com/wvolleyball/schedule/index?date=${d}`,
        `https://m.sports.naver.com/basketball/schedule/index?date=${d}`,
        `https://m.sports.naver.com/wkbl/schedule/index?date=${d}`,
      ]),
    ];

    for (const url of pages) {
      console.log(`[scores] 방문: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(e => console.log('[warn]', e.message));
      await new Promise(r => setTimeout(r, 2500));
    }

    // ── spojoy.com (네이버에 없는 종목/경기 보완 + 축구 전반 스코어) ──
    const spojoyPages = [
      { mct: 'soccer', sport: '축구' },
      { mct: 'volleyball', sport: '배구' },
      { mct: 'basketball', sport: '농구' },
    ];
    for (const sp of spojoyPages) {
      try {
        console.log(`[scores] spojoy ${sp.sport} 방문...`);
        await page.goto(`https://www.spojoy.com/live/?mct=${sp.mct}`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(e => console.log('[warn spojoy]', e.message));
        await new Promise(r => setTimeout(r, 3500));
        const text = await page.evaluate(() => document.body ? document.body.innerText : '');
        if (sp.sport === '축구') {
          console.log('===SPOJOY_SOCCER_TEXT_START===');
          console.log(text.slice(0, 4000));
          console.log('===SPOJOY_SOCCER_TEXT_END===');
        }
        const parsed = parseSpojoy(text, sp.sport);
        const before = scores.length;
        // 축구는 새 경기 추가보다 전반 스코어 병합이 주 목적
        if (sp.sport === '축구') {
          let merged = 0;
          for (const p of parsed) {
            if (p.homeHalfScore == null) continue;
            const pn = (s) => (s || '').replace(/\s+/g, '').toLowerCase();
            for (const s of scores) {
              if (s.sport !== '축구' || s.homeHalfScore != null) continue;
              const sh = pn(s.homeTeam), sa = pn(s.awayTeam), ph = pn(p.homeTeam), pa = pn(p.awayTeam);
              const eq = (a, b) => a === b || a.includes(b) || b.includes(a) || (a.length >= 3 && b.startsWith(a.slice(0,3))) || (b.length >= 3 && a.startsWith(b.slice(0,3)));
              if (eq(sh, ph) && eq(sa, pa)) { s.homeHalfScore = p.homeHalfScore; s.awayHalfScore = p.awayHalfScore; merged++; }
              else if (eq(sh, pa) && eq(sa, ph)) { s.homeHalfScore = p.awayHalfScore; s.awayHalfScore = p.homeHalfScore; merged++; }
            }
          }
          console.log(`[scores] spojoy ${sp.sport} 전반스코어 병합: ${merged}건`);
        }
        parsed.forEach(addScore);
        console.log(`[scores] spojoy ${sp.sport}: +${scores.length - before} (파싱 ${parsed.length})`);
      } catch (e) { console.log('[warn spojoy]', e.message); }
    }
  } finally {
    await browser.close();
  }

  // ── football-data.org 전반(하프타임) 스코어 병합 ──
  const TEAM_KO = {
    'Argentina':'아르헨티나','Algeria':'알제리','Brazil':'브라질','France':'프랑스',
    'Germany':'독일','Spain':'스페인','Portugal':'포르투갈','England':'잉글랜드',
    'Italy':'이탈리아','Netherlands':'네덜란드','Belgium':'벨기에','Croatia':'크로아티아',
    'Uruguay':'우루과이','Colombia':'콜롬비아','Mexico':'멕시코','USA':'미국',
    'United States':'미국','Japan':'일본','South Korea':'대한민국','Korea Republic':'대한민국',
    'Morocco':'모로코','Senegal':'세네갈','Nigeria':'나이지리아','Ghana':'가나',
    'Egypt':'이집트','Cameroon':'카메룬','Ecuador':'에콰도르','Peru':'페루',
    'Chile':'칠레','Paraguay':'파라과이','Switzerland':'스위스','Austria':'오스트리아',
    'Poland':'폴란드','Denmark':'덴마크','Sweden':'스웨덴','Norway':'노르웨이',
    'Serbia':'세르비아','Turkey':'튀르키예','Türkiye':'튀르키예','Greece':'그리스',
    'Czech Republic':'체코','Czechia':'체코','Ukraine':'우크라이나','Wales':'웨일스',
    'Scotland':'스코틀랜드','Ireland':'아일랜드','Australia':'호주','Canada':'캐나다',
    'Saudi Arabia':'사우디아라비아','Iran':'이란','Qatar':'카타르','Tunisia':'튀니지',
    'Costa Rica':'코스타리카','Jordan':'요르단','China PR':'중국','China':'중국',
    'Thailand':'태국','Vietnam':'베트남','India':'인도','Iraq':'이라크',
    'Uzbekistan':'우즈베키스탄','Dominican Republic':'도미니카공화국',
    'Bolivia':'볼리비아','Venezuela':'베네수엘라','Honduras':'온두라스',
    'Panama':'파나마','Jamaica':'자메이카','El Salvador':'엘살바도르',
    'Bulgaria':'불가리아','Romania':'루마니아','Hungary':'헝가리',
    'Slovakia':'슬로바키아','Slovenia':'슬로베니아','Finland':'핀란드',
    'Iceland':'아이슬란드','Albania':'알바니아','Bosnia and Herzegovina':'보스니아',
    'Montenegro':'몬테네그로','North Macedonia':'북마케도니아','Kosovo':'코소보',
    'Georgia':'조지아','Armenia':'아르메니아','Azerbaijan':'아제르바이잔',
    'Belarus':'벨라루스','Lithuania':'리투아니아','Latvia':'라트비아',
    'Estonia':'에스토니아','Luxembourg':'룩셈부르크','Cyprus':'키프로스',
    'Malta':'몰타','Liechtenstein':'리히텐슈타인','Andorra':'안도라',
    'Faroe Islands':'페로제도','Gibraltar':'지브롤터','San Marino':'산마리노',
  };
  const toKo = (en) => TEAM_KO[en] || en;
  const norm = (s) => (s || '').replace(/\s+/g, '').toLowerCase();
  const tmatch = (a, b) => {
    const na = norm(a), nb = norm(b);
    if (!na || !nb) return false;
    if (na === nb || na.includes(nb) || nb.includes(na)) return true;
    if (na.length >= 3 && nb.startsWith(na.slice(0,3))) return true;
    if (nb.length >= 3 && na.startsWith(nb.slice(0,3))) return true;
    return false;
  };
  try {
    const https = require('https');
    const fdGet = (url) => new Promise((res, rej) => {
      https.get(url, { headers: { 'X-Auth-Token': '6942278d1b1e447bb04375f4b84ce286' } }, (r) => {
        let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
      }).on('error', rej);
    });
    const today = kstDate(0);
    const dateStr = `${today.slice(0,4)}-${today.slice(4,6)}-${today.slice(6,8)}`;
    const yesterday = kstDate(-1);
    const yDateStr = `${yesterday.slice(0,4)}-${yesterday.slice(4,6)}-${yesterday.slice(6,8)}`;
    const fdUrl = `https://api.football-data.org/v4/matches?dateFrom=${yDateStr}&dateTo=${dateStr}`;
    console.log(`[scores] football-data.org 전반 스코어 조회...`);
    const fdText = await fdGet(fdUrl);
    const fdData = JSON.parse(fdText);
    let halfMerged = 0;
    for (const m of (fdData.matches || [])) {
      const htH = m.score?.halfTime?.home;
      const htA = m.score?.halfTime?.away;
      if (htH == null || htA == null) continue;
      const homeKo = toKo(m.homeTeam?.name || m.homeTeam?.shortName || '');
      const awayKo = toKo(m.awayTeam?.name || m.awayTeam?.shortName || '');
      for (const s of scores) {
        if (s.sport !== '축구' || s.homeHalfScore != null) continue;
        if (tmatch(s.homeTeam, homeKo) && tmatch(s.awayTeam, awayKo)) {
          s.homeHalfScore = htH; s.awayHalfScore = htA; halfMerged++;
        } else if (tmatch(s.homeTeam, awayKo) && tmatch(s.awayTeam, homeKo)) {
          s.homeHalfScore = htA; s.awayHalfScore = htH; halfMerged++;
        }
      }
    }
    console.log(`[scores] football-data 전반 스코어 병합: ${halfMerged}건`);
  } catch (e) { console.log('[warn football-data halftime]', e.message); }

  void apiDebug;
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
