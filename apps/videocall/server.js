'use strict';

/**
 * WiFi 영상통화 - 시그널링 서버 + 정적 파일 서버
 *
 * - HTTPS 로 클라이언트(public/)를 서빙한다.
 *   브라우저는 localhost 가 아닌 주소(예: WiFi 내 노트북 IP)에서 카메라/마이크를
 *   허용하려면 "보안 컨텍스트(HTTPS)"를 요구하기 때문에 자체 서명 인증서를 사용한다.
 * - WebSocket 으로 WebRTC 시그널링(offer/answer/ICE) 만 중계한다.
 *   실제 영상/음성 데이터는 브라우저끼리 P2P(WebRTC)로 직접 흐른다.
 *   → 같은 WiFi 안에서는 서버를 거치지 않고 단말끼리 직접 연결된다.
 *
 * OS 독립: 서버는 Node.js, 클라이언트는 표준 웹 브라우저(WebRTC)만 있으면
 * Windows / macOS / Linux / Android / iOS 어디서나 동작한다.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const selfsigned = require('selfsigned');

const PORT = Number(process.env.PORT) || 8443;
const USE_HTTP = process.env.HTTP === '1'; // 리버스 프록시(HTTPS 종단) 뒤에서 쓸 때

// ---------------------------------------------------------------------------
// 인증서: 없으면 자체 서명 인증서를 자동 생성한다.
// ---------------------------------------------------------------------------
function loadCredentials() {
  const certDir = path.join(__dirname, 'certs');
  const keyPath = path.join(certDir, 'key.pem');
  const certPath = path.join(certDir, 'cert.pem');

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
  }

  console.log('[cert] 자체 서명 인증서를 생성합니다...');
  const attrs = [{ name: 'commonName', value: 'wifi-videocall.local' }];
  const pems = selfsigned.generate(attrs, {
    days: 3650,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: true },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          ...localIPs().map((ip) => ({ type: 7, ip })),
        ],
      },
    ],
  });
  fs.mkdirSync(certDir, { recursive: true });
  fs.writeFileSync(keyPath, pems.private);
  fs.writeFileSync(certPath, pems.cert);
  return { key: pems.private, cert: pems.cert };
}

function localIPs() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

// ---------------------------------------------------------------------------
// HTTP(S) + 정적 파일
// ---------------------------------------------------------------------------
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// 클라이언트가 ICE 서버 설정을 받아가는 엔드포인트.
// TURN 자격증명을 환경변수로 주입하면 대칭형 NAT/모바일 데이터에서도 연결된다.
app.get('/config', (_req, res) => {
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME || '',
      credential: process.env.TURN_CREDENTIAL || '',
    });
  }
  res.json({ iceServers });
});

app.get('/healthz', (_req, res) => res.json({ ok: true }));

let server;
if (USE_HTTP) {
  server = http.createServer(app);
} else {
  server = https.createServer(loadCredentials(), app);
}

// ---------------------------------------------------------------------------
// WebSocket 시그널링
//   메시지 종류:
//     { type: 'join', room }                     -> 방 입장
//     { type: 'leave' }                          -> 방 퇴장
//     { type: 'signal', to, data }               -> 특정 피어에게 SDP/ICE 전달
//   서버가 보내는 메시지:
//     { type: 'welcome', id, peers: [...] }      -> 내 ID + 기존 참가자 목록
//     { type: 'peer-joined', id }                -> 새 참가자
//     { type: 'peer-left', id }                  -> 참가자 퇴장
//     { type: 'signal', from, data }             -> 시그널 중계
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ server });
const rooms = new Map(); // roomId -> Map<peerId, ws>
let nextId = 1;

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function leaveRoom(ws) {
  const { roomId, id } = ws.meta || {};
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (room) {
    room.delete(id);
    for (const peer of room.values()) send(peer, { type: 'peer-left', id });
    if (room.size === 0) rooms.delete(roomId);
  }
  ws.meta = {};
}

wss.on('connection', (ws) => {
  ws.meta = {};

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'join') {
      leaveRoom(ws);
      const roomId = String(msg.room || 'main').slice(0, 64);
      const id = nextId++;
      ws.meta = { roomId, id };

      if (!rooms.has(roomId)) rooms.set(roomId, new Map());
      const room = rooms.get(roomId);
      const existing = [...room.keys()];
      room.set(id, ws);

      // 새 참가자에게: 본인 ID + 기존 참가자 목록.
      // 신규 참가자가 기존 참가자들에게 offer 를 보내는(발신) 역할을 맡는다.
      send(ws, { type: 'welcome', id, peers: existing });
      for (const pid of existing) {
        send(room.get(pid), { type: 'peer-joined', id });
      }
    } else if (msg.type === 'signal') {
      const { roomId } = ws.meta;
      const room = rooms.get(roomId);
      if (!room) return;
      const target = room.get(msg.to);
      if (target) send(target, { type: 'signal', from: ws.meta.id, data: msg.data });
    } else if (msg.type === 'leave') {
      leaveRoom(ws);
    }
  });

  ws.on('close', () => leaveRoom(ws));
  ws.on('error', () => leaveRoom(ws));
});

// ---------------------------------------------------------------------------
server.listen(PORT, '0.0.0.0', () => {
  const scheme = USE_HTTP ? 'http' : 'https';
  console.log('==========================================================');
  console.log('  WiFi 영상통화 서버 실행 중');
  console.log('  같은 WiFi에 연결된 기기의 브라우저에서 아래 주소로 접속하세요:');
  console.log('');
  console.log(`    ${scheme}://localhost:${PORT}`);
  for (const ip of localIPs()) console.log(`    ${scheme}://${ip}:${PORT}`);
  console.log('');
  if (!USE_HTTP) {
    console.log('  ※ 자체 서명 인증서라 브라우저에 "안전하지 않음" 경고가 뜹니다.');
    console.log('    "고급 → 계속 진행"을 누르면 됩니다. (같은 방 코드를 공유해 통화)');
  }
  console.log('==========================================================');
});
