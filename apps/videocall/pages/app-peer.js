'use strict';

/**
 * WiFi 영상통화 - PeerJS 버전 (별도 서버/배포 불필요)
 *
 * 시그널링을 직접 운영하지 않고, PeerJS 공개 클라우드(peerjs.com)를 통해
 * 피어끼리 연결을 맺는다. 영상/음성은 여전히 브라우저끼리 P2P(WebRTC)로 흐른다.
 *
 * 방(room) 구현:
 *  - 방 코드로부터 결정적인 "호스트 ID"(wvcall-<코드>)를 만든다.
 *  - 방에 처음 들어온 사람이 그 ID를 선점해 "호스트"가 되어 참가자 명단을 관리한다.
 *  - 이미 호스트가 있으면(ID 선점 실패) "게스트"로서 랜덤 ID를 쓰고 호스트에 연결한다.
 *  - 새 게스트는 호스트에게서 기존 참가자 명단을 받아 각자에게 미디어 콜을 건다.
 *    → 모두가 서로 연결되는 풀메시가 된다. (소규모 통화용)
 *
 * 주의: PeerJS 공개 클라우드의 ID는 전 세계 공용이므로 방 코드는 겹치지 않게 특이하게.
 */

const $ = (id) => document.getElementById(id);

// ---- PeerServer 설정 (기본: 공개 클라우드. URL 파라미터로 로컬 서버 지정 가능) ----
const params = new URLSearchParams(location.search);
const peerOptions = {
  debug: 1,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  },
};
if (params.get('peerhost')) {
  peerOptions.host = params.get('peerhost');
  peerOptions.port = Number(params.get('peerport') || 9000);
  peerOptions.path = params.get('peerpath') || '/';
  peerOptions.secure = params.get('peersecure') === '1';
}

// ---- 상태 ----
let peer = null;
let isHost = false;
let myId = null;
let myName = '';
let roomId = '';
let hostId = '';
let hostConn = null; // 게스트→호스트 데이터 연결
let localStream = null;
let screenStream = null;
let facingMode = 'user';

const members = new Map();     // (호스트) memberPeerId -> name
const guestConns = new Map();  // (호스트) guestPeerId -> DataConnection
const knownNames = new Map();  // peerId -> name (라벨용)
const mediaConns = new Map();  // peerId -> MediaConnection

// ---- 로비 ----
$('randomRoomBtn').addEventListener('click', () => {
  $('roomInput').value = 'room-' + Math.random().toString(36).slice(2, 6) + Math.floor(Math.random() * 9000 + 1000);
});
$('joinBtn').addEventListener('click', join);
$('roomInput').addEventListener('keydown', (e) => e.key === 'Enter' && join());
$('nameInput').addEventListener('keydown', (e) => e.key === 'Enter' && join());
if (location.hash.length > 1) $('roomInput').value = decodeURIComponent(location.hash.slice(1));

async function join() {
  const name = $('nameInput').value.trim();
  const room = $('roomInput').value.trim();
  $('lobbyError').hidden = true;
  if (!name) return lobbyError('이름을 입력하세요.');
  if (!room) return lobbyError('방 코드를 입력하세요.');

  myName = name;
  roomId = room;
  hostId = 'wvcall-' + room.toLowerCase().replace(/[^a-z0-9\-]/g, '-');

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (e) {
    return lobbyError('카메라/마이크 권한이 필요합니다: ' + e.message);
  }

  $('lobby').hidden = true;
  $('call').hidden = false;
  $('roomLabel').textContent = roomId;
  addTile('self', myName + ' (나)', localStream, true);

  tryHost();
}

function lobbyError(msg) {
  const el = $('lobbyError');
  el.textContent = msg;
  el.hidden = false;
}

// ---- 호스트/게스트 결정 ----
function tryHost() {
  setStatus('연결 중…');
  peer = new Peer(hostId, peerOptions);
  let decided = false;

  peer.on('open', () => {
    if (decided) return;
    decided = true;
    becomeHost();
  });
  peer.on('error', (err) => {
    if (!decided && err.type === 'unavailable-id') {
      decided = true;
      try { peer.destroy(); } catch (e) {}
      becomeGuest();
    } else {
      handlePeerError(err);
    }
  });
}

function becomeHost() {
  isHost = true;
  myId = hostId;
  members.set(hostId, myName);
  knownNames.set(hostId, myName);

  peer.on('connection', onHostDataConn);
  peer.on('call', answerCall);
  peer.on('error', handlePeerError);
  updateStatus();
}

function becomeGuest() {
  isHost = false;
  peer = new Peer(peerOptions);
  peer.on('open', (id) => {
    myId = id;
    knownNames.set(myId, myName);
    connectToHost();
  });
  peer.on('call', answerCall);
  peer.on('error', handlePeerError);
}

function connectToHost() {
  hostConn = peer.connect(hostId, { reliable: true, metadata: { name: myName } });
  hostConn.on('open', () => hostConn.send({ t: 'hello', name: myName }));
  hostConn.on('data', onGuestData);
  hostConn.on('close', onHostLost);
  hostConn.on('error', () => {});
}

// ---- 호스트: 데이터 채널 처리 ----
function onHostDataConn(conn) {
  conn.on('data', (d) => {
    if (d && d.t === 'hello') {
      const newId = conn.peer;
      const newName = d.name || '게스트';
      // 신규 참가자에게 기존 명단 전달 (본인 제외)
      const list = [...members.entries()].map(([id, name]) => ({ id, name }));
      conn.send({ t: 'welcome', members: list });
      // 다른 게스트들에게 신규 참가자 알림
      broadcast({ t: 'add', id: newId, name: newName }, newId);
      members.set(newId, newName);
      knownNames.set(newId, newName);
      guestConns.set(newId, conn);
      updateStatus();
    }
  });
  conn.on('close', () => {
    const gid = conn.peer;
    members.delete(gid);
    guestConns.delete(gid);
    broadcast({ t: 'remove', id: gid });
    removeTile(gid);
    updateStatus();
  });
  conn.on('error', () => {});
}

function broadcast(msg, exceptId) {
  for (const [id, conn] of guestConns) {
    if (id !== exceptId) {
      try { conn.send(msg); } catch (e) {}
    }
  }
}

// ---- 게스트: 호스트로부터 온 데이터 처리 ----
function onGuestData(d) {
  if (!d) return;
  if (d.t === 'welcome') {
    // 기존 참가자(호스트 포함) 각자에게 내가 미디어 콜을 건다
    for (const m of d.members) {
      knownNames.set(m.id, m.name);
      callPeer(m.id);
    }
    updateStatus();
  } else if (d.t === 'add') {
    // 나보다 늦게 들어온 참가자 → 그쪽이 나에게 콜을 건다. 이름만 기억.
    knownNames.set(d.id, d.name);
    updateLabel(d.id, d.name);
  } else if (d.t === 'remove') {
    removeTile(d.id);
  }
}

function onHostLost() {
  // 호스트가 나가면 새 참가자 합류는 막히지만, 기존 통화(미디어)는 유지된다.
  if (!isHost) setStatus('호스트가 나감 · 기존 통화는 계속됩니다');
}

// ---- 미디어 (콜) ----
function callPeer(id) {
  if (id === myId || mediaConns.has(id)) return;
  const call = peer.call(id, localStream, { metadata: { name: myName } });
  registerCall(id, call);
}

function answerCall(call) {
  const id = call.peer;
  if (call.metadata && call.metadata.name) knownNames.set(id, call.metadata.name);
  call.answer(localStream);
  registerCall(id, call);
}

function registerCall(id, call) {
  mediaConns.set(id, call);
  call.on('stream', (stream) => {
    addTile('p' + id, knownNames.get(id) || '상대방', stream, false);
    updateStatus();
  });
  call.on('close', () => removeTile(id));
  call.on('error', () => removeTile(id));
}

// ---- 타일 ----
function addTile(key, name, stream, isSelf) {
  const grid = $('grid');
  let tile = document.getElementById('tile-' + key);
  if (!tile) {
    tile = document.createElement('div');
    tile.id = 'tile-' + key;
    tile.className = 'tile' + (isSelf ? ' self' : '');
    tile.innerHTML =
      '<video autoplay playsinline' + (isSelf ? ' muted' : '') + '></video>' +
      '<span class="label"></span>' +
      '<span class="muted-badge">🔇</span>';
    grid.appendChild(tile);
  }
  const video = tile.querySelector('video');
  if (video.srcObject !== stream) video.srcObject = stream;
  tile.querySelector('.label').textContent = name;
  return tile;
}

function updateLabel(peerId, name) {
  const tile = document.getElementById('tile-p' + peerId);
  if (tile) tile.querySelector('.label').textContent = name;
}

function removeTile(peerId) {
  const conn = mediaConns.get(peerId);
  if (conn) { try { conn.close(); } catch (e) {} }
  mediaConns.delete(peerId);
  members.delete(peerId);
  knownNames.delete(peerId);
  const tile = document.getElementById('tile-p' + peerId);
  if (tile) tile.remove();
  updateStatus();
}

// ---- 컨트롤 ----
$('micBtn').addEventListener('click', () => {
  const t = localStream.getAudioTracks()[0];
  if (!t) return;
  t.enabled = !t.enabled;
  $('micBtn').classList.toggle('off', !t.enabled);
  $('micBtn').textContent = t.enabled ? '🎤' : '🔇';
});
$('camBtn').addEventListener('click', () => {
  const t = localStream.getVideoTracks()[0];
  if (!t) return;
  t.enabled = !t.enabled;
  $('camBtn').classList.toggle('off', !t.enabled);
  $('camBtn').textContent = t.enabled ? '📷' : '🚫';
});
$('shareBtn').addEventListener('click', toggleScreenShare);
$('flipBtn').addEventListener('click', flipCamera);
$('leaveBtn').addEventListener('click', leave);
$('copyLinkBtn').addEventListener('click', copyLink);

async function toggleScreenShare() {
  const btn = $('shareBtn');
  if (screenStream) return stopScreenShare();
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  } catch (e) { return; }
  const track = screenStream.getVideoTracks()[0];
  replaceVideoTrack(track);
  btn.classList.add('active');
  const selfVideo = document.querySelector('#tile-self video');
  if (selfVideo) selfVideo.srcObject = screenStream;
  document.getElementById('tile-self').classList.remove('self');
  track.onended = stopScreenShare;
}
function stopScreenShare() {
  if (!screenStream) return;
  screenStream.getTracks().forEach((t) => t.stop());
  screenStream = null;
  replaceVideoTrack(localStream.getVideoTracks()[0]);
  $('shareBtn').classList.remove('active');
  const selfVideo = document.querySelector('#tile-self video');
  if (selfVideo) selfVideo.srcObject = localStream;
  document.getElementById('tile-self').classList.add('self');
}
function replaceVideoTrack(track) {
  for (const call of mediaConns.values()) {
    const pc = call.peerConnection;
    if (!pc) continue;
    const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
    if (sender) sender.replaceTrack(track);
  }
}
async function flipCamera() {
  if (screenStream) return;
  facingMode = facingMode === 'user' ? 'environment' : 'user';
  try {
    const ns = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
    });
    const nt = ns.getVideoTracks()[0];
    const ot = localStream.getVideoTracks()[0];
    localStream.removeTrack(ot); ot.stop(); localStream.addTrack(nt);
    replaceVideoTrack(nt);
    const selfVideo = document.querySelector('#tile-self video');
    if (selfVideo) selfVideo.srcObject = localStream;
  } catch (e) {
    facingMode = facingMode === 'user' ? 'environment' : 'user';
  }
}
async function copyLink() {
  const url = location.origin + location.pathname + '#' + encodeURIComponent(roomId);
  try {
    await navigator.clipboard.writeText(url);
    $('copyLinkBtn').textContent = '✅ 복사됨';
    setTimeout(() => ($('copyLinkBtn').textContent = '🔗 초대링크 복사'), 1500);
  } catch (e) {
    prompt('아래 링크를 공유하세요:', url);
  }
}
function leave() {
  try { if (localStream) localStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
  try { if (screenStream) screenStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
  try { if (peer) peer.destroy(); } catch (e) {}
  location.reload();
}

// ---- 상태/에러 ----
function setStatus(text) { $('statusText').textContent = text; }
function updateStatus() {
  const n = mediaConns.size + 1;
  setStatus(`참가자 ${n}명 · 방 ${roomId}`);
}
function handlePeerError(err) {
  console.warn('Peer error:', err && err.type, err);
  if (err && err.type === 'peer-unavailable') return; // 상대가 아직 없음/나감
  if (err && (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error')) {
    setStatus('시그널링 서버 연결 문제 · 재시도해 주세요');
  }
}

window.addEventListener('beforeunload', () => { try { if (peer) peer.destroy(); } catch (e) {} });
