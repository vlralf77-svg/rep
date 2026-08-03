'use strict';

/**
 * PWA 웹푸시 백엔드
 *
 * 역할:
 *  - 통화 웹앱(정적 파일: ../videocall/pages)을 HTTPS(Render가 TLS 종단)로 서빙
 *  - 각 사용자의 푸시 구독(subscription)을 아이디별로 저장
 *  - 누군가 전화를 걸면(POST /call) 상대의 기기로 웹푸시를 보내
 *    앱이 닫혀 있어도 알림(벨)이 뜨게 한다.
 *
 * 실제 영상/음성 연결은 여전히 브라우저끼리 P2P(PeerJS) 로 이뤄진다.
 * 이 서버는 "전화가 왔다"는 신호(푸시)만 담당한다.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const webpush = require('web-push');

const PORT = Number(process.env.PORT) || 8090;
const DATA_DIR = process.env.DATA_DIR || __dirname;
const SUBS_FILE = path.join(DATA_DIR, 'subs.json');
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');
const STATIC_DIR = path.join(__dirname, '..', 'videocall', 'pages');

// ---- VAPID 키 (환경변수 우선, 없으면 생성해 파일에 저장) ----
function loadVapid() {
  if (process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE) {
    return { publicKey: process.env.VAPID_PUBLIC, privateKey: process.env.VAPID_PRIVATE };
  }
  try {
    return JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
  } catch (e) {
    const keys = webpush.generateVAPIDKeys();
    try { fs.writeFileSync(VAPID_FILE, JSON.stringify(keys)); } catch (e2) {}
    console.log('[vapid] 새 VAPID 키를 생성했습니다.');
    return keys;
  }
}
const vapid = loadVapid();
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
webpush.setVapidDetails(SUBJECT, vapid.publicKey, vapid.privateKey);

// ---- 구독 저장소 (아이디 -> [subscription...]) ----
let subs = {};
try { subs = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8')); } catch (e) { subs = {}; }
function saveSubs() {
  try { fs.writeFileSync(SUBS_FILE, JSON.stringify(subs)); } catch (e) {}
}

const app = express();
app.use(express.json({ limit: '50kb' }));
app.use(express.static(STATIC_DIR));

app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/vapidPublicKey', (_req, res) => res.json({ key: vapid.publicKey }));

// 구독 등록
app.post('/subscribe', (req, res) => {
  const { userId, subscription } = req.body || {};
  if (!userId || !subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'userId, subscription 필요' });
  }
  const id = String(userId).toLowerCase();
  if (!subs[id]) subs[id] = [];
  // 같은 endpoint 중복 제거 후 추가
  subs[id] = subs[id].filter((s) => s.endpoint !== subscription.endpoint);
  subs[id].push(subscription);
  saveSubs();
  res.json({ ok: true });
});

// 구독 해제
app.post('/unsubscribe', (req, res) => {
  const { userId, endpoint } = req.body || {};
  const id = String(userId || '').toLowerCase();
  if (subs[id]) {
    subs[id] = subs[id].filter((s) => s.endpoint !== endpoint);
    if (subs[id].length === 0) delete subs[id];
    saveSubs();
  }
  res.json({ ok: true });
});

// 전화 걸기 → 상대에게 푸시 발송
app.post('/call', async (req, res) => {
  const { from, to } = req.body || {};
  if (!from || !to) return res.status(400).json({ error: 'from, to 필요' });
  const id = String(to).toLowerCase();
  const list = subs[id] || [];
  if (list.length === 0) return res.json({ ok: true, delivered: 0, note: '상대 구독 없음(오프라인일 수 있음)' });

  const payload = JSON.stringify({ type: 'incoming-call', from: String(from), to: String(to), ts: Date.now() });
  let delivered = 0;
  const stale = [];
  await Promise.all(
    list.map((sub) =>
      webpush.sendNotification(sub, payload)
        .then(() => { delivered++; })
        .catch((err) => {
          if (err.statusCode === 404 || err.statusCode === 410) stale.push(sub.endpoint);
        })
    )
  );
  if (stale.length) {
    subs[id] = list.filter((s) => !stale.includes(s.endpoint));
    if (subs[id].length === 0) delete subs[id];
    saveSubs();
  }
  res.json({ ok: true, delivered });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('푸시 백엔드 실행 :' + PORT + '  (정적: ' + STATIC_DIR + ')');
});
