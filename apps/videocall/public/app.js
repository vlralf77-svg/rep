'use strict';

/**
 * WiFi 영상통화 클라이언트 (WebRTC 메시 방식)
 *
 * 동작 개요
 *  - WebSocket 으로 서버에 접속해 '방(room)'에 입장한다.
 *  - 방에 이미 있던 참가자들에게 신규 참가자가 offer 를 보내 P2P 연결을 만든다.
 *  - 연결이 만들어지면 영상/음성은 서버를 거치지 않고 브라우저끼리 직접 흐른다.
 *  - N명이면 각 참가자가 서로 (N-1)개의 연결을 갖는 풀메시 구조 (소규모 통화에 적합).
 */

const $ = (id) => document.getElementById(id);

// ---- 상태 ----
let ws = null;
let myId = null;
let myName = '';
let roomId = '';
let localStream = null;
let screenStream = null;
let iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
let facingMode = 'user'; // 'user'(전면) | 'environment'(후면)
const peers = new Map(); // peerId -> { pc, tile, video, name, sentName }

// ---- 로비 ----
$('randomRoomBtn').addEventListener('click', () => {
  $('roomInput').value = Math.random().toString(36).slice(2, 8);
});

$('joinBtn').addEventListener('click', join);
$('roomInput').addEventListener('keydown', (e) => e.key === 'Enter' && join());
$('nameInput').addEventListener('keydown', (e) => e.key === 'Enter' && join());

// URL 해시로 방 코드 자동 채우기 (초대링크)
if (location.hash.length > 1) {
  $('roomInput').value = decodeURIComponent(location.hash.slice(1));
}

async function join() {
  const name = $('nameInput').value.trim();
  const room = $('roomInput').value.trim();
  const err = $('lobbyError');
  err.hidden = true;

  if (!name) return showLobbyError('이름을 입력하세요.');
  if (!room) return showLobbyError('방 코드를 입력하세요.');

  myName = name;
  roomId = room;

  // 1) 카메라/마이크 확보
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (e) {
    return showLobbyError('카메라/마이크 권한이 필요합니다: ' + e.message);
  }

  // 2) ICE 서버 설정 로드 (실패해도 기본 STUN 으로 진행)
  try {
    const cfg = await fetch('/config').then((r) => r.json());
    if (cfg.iceServers) iceServers = cfg.iceServers;
  } catch { /* 기본값 사용 */ }

  // 3) 화면 전환
  $('lobby').hidden = true;
  $('call').hidden = false;
  $('roomLabel').textContent = roomId;
  addTile('self', myName + ' (나)', localStream, true);

  // 4) 시그널링 연결
  connectSignaling();
}

function showLobbyError(msg) {
  const err = $('lobbyError');
  err.textContent = msg;
  err.hidden = false;
}

// ---- 시그널링 ----
function connectSignaling() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => {
    setStatus('연결됨 · 참가자 대기 중');
    ws.send(JSON.stringify({ type: 'join', room: roomId }));
  };

  ws.onmessage = async (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'welcome') {
      myId = msg.id;
      // 기존 참가자들에게 내가 발신자(offer)로 연결
      for (const pid of msg.peers) {
        const pc = createPeer(pid, true);
        await makeOffer(pid, pc);
      }
      updateStatus();
    } else if (msg.type === 'peer-joined') {
      // 신규 참가자가 나에게 offer 를 보낼 것이므로 여기선 대기만
      createPeer(msg.id, false);
      updateStatus();
    } else if (msg.type === 'peer-left') {
      removePeer(msg.id);
      updateStatus();
    } else if (msg.type === 'signal') {
      await handleSignal(msg.from, msg.data);
    }
  };

  ws.onclose = () => setStatus('연결 끊김');
  ws.onerror = () => setStatus('연결 오류');
}

function signal(to, data) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type: 'signal', to, data }));
  }
}

// ---- 피어 연결 ----
function createPeer(peerId, isInitiator) {
  if (peers.has(peerId)) return peers.get(peerId).pc;

  const pc = new RTCPeerConnection({ iceServers });
  const entry = { pc, tile: null, video: null, name: '상대방', sentName: false };
  peers.set(peerId, entry);

  // 내 트랙 추가
  for (const track of localStream.getTracks()) {
    pc.addTrack(track, localStream);
  }

  pc.onicecandidate = (e) => {
    if (e.candidate) signal(peerId, { kind: 'ice', candidate: e.candidate });
  };

  pc.ontrack = (e) => {
    const [stream] = e.streams;
    if (!entry.video) {
      const { tile, video } = addTile('p' + peerId, entry.name, stream, false);
      entry.tile = tile;
      entry.video = video;
    } else {
      entry.video.srcObject = stream;
    }
    // 오디오 트랙 뮤트 상태 반영
    stream.getAudioTracks().forEach((t) => {
      t.onmute = () => entry.tile && entry.tile.classList.add('audio-off');
      t.onunmute = () => entry.tile && entry.tile.classList.remove('audio-off');
    });
  };

  pc.onconnectionstatechange = () => {
    if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
      // 연결 실패 시 정리 (재입장으로 복구)
      if (pc.connectionState === 'failed') removePeer(peerId);
    }
    updateStatus();
  };

  // 연결되면 내 이름을 상대에게 알림
  const nameTimer = setInterval(() => {
    if (ws && ws.readyState === ws.OPEN && !entry.sentName) {
      signal(peerId, { kind: 'name', name: myName });
      entry.sentName = true;
      clearInterval(nameTimer);
    }
  }, 300);

  return pc;
}

async function makeOffer(peerId, pc) {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  signal(peerId, { kind: 'sdp', description: pc.localDescription });
}

async function handleSignal(from, data) {
  let entry = peers.get(from);
  if (!entry) {
    createPeer(from, false);
    entry = peers.get(from);
  }
  const pc = entry.pc;

  if (data.kind === 'name') {
    entry.name = data.name;
    if (entry.tile) {
      const label = entry.tile.querySelector('.label');
      if (label) label.textContent = data.name;
    }
  } else if (data.kind === 'sdp') {
    await pc.setRemoteDescription(data.description);
    if (data.description.type === 'offer') {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signal(from, { kind: 'sdp', description: pc.localDescription });
    }
  } else if (data.kind === 'ice') {
    try {
      await pc.addIceCandidate(data.candidate);
    } catch (e) {
      console.warn('ICE 추가 실패', e);
    }
  }
}

function removePeer(peerId) {
  const entry = peers.get(peerId);
  if (!entry) return;
  try { entry.pc.close(); } catch {}
  if (entry.tile) entry.tile.remove();
  peers.delete(peerId);
}

// ---- 타일(비디오) ----
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
  video.srcObject = stream;
  tile.querySelector('.label').textContent = name;
  return { tile, video };
}

// ---- 컨트롤 ----
$('micBtn').addEventListener('click', () => {
  const track = localStream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  $('micBtn').classList.toggle('off', !track.enabled);
  $('micBtn').textContent = track.enabled ? '🎤' : '🔇';
});

$('camBtn').addEventListener('click', () => {
  const track = localStream.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  $('camBtn').classList.toggle('off', !track.enabled);
  $('camBtn').textContent = track.enabled ? '📷' : '🚫';
});

$('shareBtn').addEventListener('click', toggleScreenShare);

async function toggleScreenShare() {
  const btn = $('shareBtn');
  if (screenStream) {
    // 화면 공유 종료 → 카메라로 복귀
    stopScreenShare();
    return;
  }
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  } catch {
    return; // 사용자가 취소
  }
  const screenTrack = screenStream.getVideoTracks()[0];
  replaceVideoTrack(screenTrack);
  btn.classList.add('active');
  // 셀프뷰도 화면으로
  const selfVideo = document.querySelector('#tile-self video');
  if (selfVideo) selfVideo.srcObject = screenStream;
  document.getElementById('tile-self').classList.remove('self'); // 화면은 미러 해제
  screenTrack.onended = stopScreenShare;
}

function stopScreenShare() {
  if (!screenStream) return;
  screenStream.getTracks().forEach((t) => t.stop());
  screenStream = null;
  const camTrack = localStream.getVideoTracks()[0];
  replaceVideoTrack(camTrack);
  $('shareBtn').classList.remove('active');
  const selfVideo = document.querySelector('#tile-self video');
  if (selfVideo) selfVideo.srcObject = localStream;
  document.getElementById('tile-self').classList.add('self');
}

function replaceVideoTrack(track) {
  for (const { pc } of peers.values()) {
    const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
    if (sender) sender.replaceTrack(track);
  }
}

// 전/후면 카메라 전환 (모바일)
$('flipBtn').addEventListener('click', async () => {
  if (screenStream) return; // 화면 공유 중엔 무시
  facingMode = facingMode === 'user' ? 'environment' : 'user';
  try {
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    const newTrack = newStream.getVideoTracks()[0];
    const oldTrack = localStream.getVideoTracks()[0];
    localStream.removeTrack(oldTrack);
    oldTrack.stop();
    localStream.addTrack(newTrack);
    replaceVideoTrack(newTrack);
    const selfVideo = document.querySelector('#tile-self video');
    if (selfVideo) selfVideo.srcObject = localStream;
  } catch (e) {
    facingMode = facingMode === 'user' ? 'environment' : 'user'; // 롤백
  }
});

$('leaveBtn').addEventListener('click', () => {
  if (ws) { try { ws.send(JSON.stringify({ type: 'leave' })); ws.close(); } catch {} }
  for (const id of [...peers.keys()]) removePeer(id);
  if (localStream) localStream.getTracks().forEach((t) => t.stop());
  if (screenStream) screenStream.getTracks().forEach((t) => t.stop());
  location.reload();
});

$('copyLinkBtn').addEventListener('click', async () => {
  const url = location.origin + '/#' + encodeURIComponent(roomId);
  try {
    await navigator.clipboard.writeText(url);
    $('copyLinkBtn').textContent = '✅ 복사됨';
    setTimeout(() => ($('copyLinkBtn').textContent = '🔗 초대링크 복사'), 1500);
  } catch {
    prompt('아래 링크를 공유하세요:', url);
  }
});

// ---- 상태 표시 ----
function setStatus(text) { $('statusText').textContent = text; }
function updateStatus() {
  const n = peers.size + 1;
  setStatus(`참가자 ${n}명 · 방 ${roomId}`);
}

// 페이지 종료 시 정리
window.addEventListener('beforeunload', () => {
  if (ws && ws.readyState === ws.OPEN) {
    try { ws.send(JSON.stringify({ type: 'leave' })); } catch {}
  }
});
