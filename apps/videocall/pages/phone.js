'use strict';

/**
 * 영상 "전화" - PeerJS 기반 (서버 운영 불필요)
 *
 *  - 각자 "내 아이디"로 PeerJS 클라우드에 등록(온라인)한다.
 *  - 상대 아이디로 전화를 걸면, 상대의 열려 있는 페이지에서 벨이 울린다(수신 오버레이 + 링톤).
 *  - 받으면 카메라를 켜고 응답 → 영상·음성은 P2P 로 직접 흐른다.
 *
 * 제약: 상대가 이 페이지를 "열어 온라인 상태"여야 벨이 울린다.
 *       (앱이 완전히 꺼진 상태에서 울리려면 별도 푸시 서버가 필요하다.)
 */

const $ = (id) => document.getElementById(id);
const ID_PREFIX = 'wvcphone-';

// ---- PeerServer 설정 (기본: 공개 클라우드 / URL 파라미터로 로컬 지정 가능) ----
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
let myId = '';           // 사용자가 정한 아이디 (표시용)
let online = false;
let localStream = null;
let currentCall = null;  // 진행 중인 MediaConnection
let pendingCall = null;  // 수신 대기 중(아직 안 받은) MediaConnection
let pendingCallbackFrom = null; // 푸시 알림으로 열려서 "되걸어야 하는" 상대 아이디
let callingTarget = null; // 내가 지금 걸고 있는 상대(sanitize된 아이디)
let callTimeout = null;
let facingMode = 'user';

// 푸시 알림을 눌러 열렸을 때 ?answer=<상대아이디> 로 되걸기 대상 전달
const answerFrom = params.get('answer');

// ---- 링톤 (WebAudio, 파일 불필요) ----
let audioCtx = null;
let ringTimer = null;
let vibTimer = null;
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
function beep() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  [0, 0.4].forEach((off) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = 480 + off * 200;
    o.connect(g); g.connect(audioCtx.destination);
    g.gain.setValueAtTime(0.0001, t + off);
    g.gain.exponentialRampToValueAtTime(0.25, t + off + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.35);
    o.start(t + off); o.stop(t + off + 0.36);
  });
}
function startRing(vibrate) {
  ensureAudio();
  beep();
  ringTimer = setInterval(beep, 2500);
  if (vibrate && navigator.vibrate) {
    navigator.vibrate([600, 400, 600, 400, 600]);
    vibTimer = setInterval(() => navigator.vibrate([600, 400, 600]), 2500);
  }
}
function stopRing() {
  if (ringTimer) { clearInterval(ringTimer); ringTimer = null; }
  if (vibTimer) { clearInterval(vibTimer); vibTimer = null; }
  if (navigator.vibrate) navigator.vibrate(0);
}

// 사용자 제스처에서 오디오 활성화
document.body.addEventListener('click', ensureAudio, { once: false });

// ---- 홈 ----
const savedId = localStorage.getItem('wvc_myid') || '';
if (savedId) $('myIdInput').value = savedId;

$('onlineBtn').addEventListener('click', goOnline);
$('callBtn').addEventListener('click', startCall);
$('cancelBtn').addEventListener('click', cancelOutgoing);
$('acceptBtn').addEventListener('click', acceptCall);
$('declineBtn').addEventListener('click', declineCall);
$('hangupBtn').addEventListener('click', hangup);
$('peerIdInput').addEventListener('keydown', (e) => e.key === 'Enter' && startCall());

// 저장된 아이디가 있으면 자동 접속
if (savedId) goOnline();

function homeError(msg) {
  const el = $('homeError');
  el.textContent = msg;
  el.hidden = false;
}

function sanitize(s) {
  return s.trim().toLowerCase().replace(/[^a-z0-9\-_]/g, '-');
}

function goOnline() {
  const raw = $('myIdInput').value.trim();
  $('homeError').hidden = true;
  if (!raw) return homeError('내 아이디를 입력하세요.');
  myId = raw;
  localStorage.setItem('wvc_myid', raw);
  ensureAudio();

  if (peer) { try { peer.destroy(); } catch (e) {} }
  peer = new Peer(ID_PREFIX + sanitize(raw), peerOptions);

  peer.on('open', () => {
    online = true;
    $('myStatus').textContent = '🟢 온라인 · 아이디: ' + raw;
    $('myStatus').classList.add('online');
    $('onlineBtn').textContent = '접속됨';
    // 푸시 구독(백엔드에서 서빙될 때만 활성). 실패해도 온라인 통화는 동작.
    if (window.pushInit) window.pushInit(raw).then((ok) => {
      if (ok) $('myStatus').textContent = '🟢 온라인 · 알림 켜짐 · 아이디: ' + raw;
    });
    // 알림을 눌러 열린 경우: 되걸기 대상에게 벨을 띄운다(사용자가 받기 누르면 연결)
    if (answerFrom && !currentCall) handleAnswerRequest(answerFrom);
  });
  peer.on('call', onIncomingCall);
  peer.on('error', (err) => {
    if (err && err.type === 'unavailable-id') {
      homeError('이미 사용 중인 아이디예요. 다른 아이디로 접속하거나, 다른 기기의 접속을 끊어주세요.');
      $('myStatus').textContent = '오프라인 (아이디 중복)';
    } else if (err && err.type === 'peer-unavailable') {
      // 상대가 지금 앱을 닫아둔 상태일 수 있다. 푸시가 켜져 있으면 알림으로 깨우는 중이므로
      // 즉시 실패시키지 않고 되걸어오기를(타임아웃까지) 기다린다.
      if (callingTarget && window.pushAvailable && window.pushAvailable()) return;
      onCallFailed('상대가 오프라인이거나 아이디가 틀렸어요.');
    } else {
      console.warn('peer error', err && err.type, err);
    }
  });
}

// ---- 발신 ----
async function startCall() {
  const target = $('peerIdInput').value.trim();
  $('homeError').hidden = true;
  if (!online) return homeError('먼저 "접속"을 눌러 온라인 상태가 되세요.');
  if (!target) return homeError('상대 아이디를 입력하세요.');
  if (sanitize(target) === sanitize(myId)) return homeError('자기 자신에게는 걸 수 없어요.');

  try {
    localStream = await getMedia();
  } catch (e) {
    return homeError('카메라/마이크 권한이 필요합니다: ' + e.message);
  }

  callingTarget = sanitize(target);
  const call = peer.call(ID_PREFIX + sanitize(target), localStream, { metadata: { name: myId } });
  currentCall = call;
  showOverlay('outgoing');
  $('outTarget').textContent = target;

  // 상대 앱이 닫혀 있어도 벨이 울리도록 푸시 발송(백엔드 있을 때만)
  if (window.pushCall) {
    window.pushCall(myId, target).then((r) => {
      if (r && r.ok && r.delivered > 0) {
        document.querySelector('#outgoing .ovsub').textContent = '상대 기기에 알림을 보냈어요. 응답을 기다립니다…';
      }
    });
  }

  call.on('stream', (remote) => {
    clearTimeout(callTimeout);
    callingTarget = null;
    enterCall(target, remote);
  });
  call.on('close', () => {
    if (!$('call').hidden) return; // 이미 통화 종료 처리됨
    onCallFailed('상대가 받지 않았거나 통화가 종료됐어요.');
  });
  call.on('error', () => onCallFailed('통화 연결에 실패했어요.'));

  // 30초 무응답 → 취소
  callTimeout = setTimeout(() => {
    onCallFailed('상대가 응답하지 않아요.');
  }, 30000);
}

function cancelOutgoing() {
  clearTimeout(callTimeout);
  callingTarget = null;
  if (currentCall) { try { currentCall.close(); } catch (e) {} currentCall = null; }
  stopLocal();
  hideOverlays();
}

function onCallFailed(msg) {
  clearTimeout(callTimeout);
  callingTarget = null;
  if (currentCall) { try { currentCall.close(); } catch (e) {} currentCall = null; }
  stopLocal();
  hideOverlays();
  homeError(msg);
}

// ---- 수신 ----
function onIncomingCall(call) {
  // 내가 걸고 있던 상대가 (푸시 알림을 받고) 되걸어온 경우 → 자동 응답
  if (callingTarget && call.peer === ID_PREFIX + callingTarget && localStream) {
    clearTimeout(callTimeout);
    callingTarget = null;
    currentCall = call;
    call.answer(localStream);
    const from = (call.metadata && call.metadata.name) || $('outTarget').textContent || '상대';
    call.on('stream', (remote) => enterCall(from, remote));
    call.on('close', hangup);
    call.on('error', hangup);
    return;
  }
  // 이미 통화 중/수신 중이면 새 전화는 무시(통화 중)
  if (currentCall || pendingCall || pendingCallbackFrom) { try { call.close(); } catch (e) {} return; }
  pendingCall = call;
  const from = (call.metadata && call.metadata.name) || '알 수 없음';
  $('inFrom').textContent = from;
  showOverlay('incoming');
  startRing(true);

  call.on('close', () => {
    // 상대가 걸다가 끊음
    if (pendingCall === call) {
      stopRing();
      pendingCall = null;
      hideOverlays();
    }
  });
}

async function acceptCall() {
  stopRing();
  // 푸시 알림으로 열려 "되걸어야" 하는 경우
  if (pendingCallbackFrom) {
    const from = pendingCallbackFrom;
    pendingCallbackFrom = null;
    return startCallback(from);
  }
  const call = pendingCall;
  pendingCall = null;
  if (!call) return;
  try {
    localStream = await getMedia();
  } catch (e) {
    try { call.close(); } catch (er) {}
    hideOverlays();
    homeError('카메라/마이크 권한이 필요합니다: ' + e.message);
    return;
  }
  currentCall = call;
  call.answer(localStream);
  const from = (call.metadata && call.metadata.name) || '상대';
  call.on('stream', (remote) => enterCall(from, remote));
  call.on('close', hangup);
  call.on('error', hangup);
}

function declineCall() {
  stopRing();
  if (pendingCall) { try { pendingCall.close(); } catch (e) {} pendingCall = null; }
  pendingCallbackFrom = null;
  hideOverlays();
}

// 푸시 알림을 받고 열렸을 때: 상대에게 벨(수신 화면)을 띄운다.
function handleAnswerRequest(from) {
  if (currentCall) return;
  pendingCallbackFrom = from;
  $('inFrom').textContent = from;
  showOverlay('incoming');
  startRing(true);
}

// 되걸기: 알림을 받은 쪽이 원래 발신자에게 연결한다(발신자는 자동 응답).
async function startCallback(from) {
  if (!online) return homeError('접속이 끊겨 되걸 수 없어요. 다시 시도해 주세요.');
  try {
    localStream = await getMedia();
  } catch (e) {
    hideOverlays();
    return homeError('카메라/마이크 권한이 필요합니다: ' + e.message);
  }
  callingTarget = sanitize(from);
  const call = peer.call(ID_PREFIX + sanitize(from), localStream, { metadata: { name: myId } });
  currentCall = call;
  showOverlay('outgoing');
  $('outTarget').textContent = from;
  document.querySelector('#outgoing .ovsub').textContent = '연결 중…';
  call.on('stream', (remote) => { clearTimeout(callTimeout); callingTarget = null; enterCall(from, remote); });
  call.on('close', () => { if ($('call').hidden) onCallFailed('연결이 종료됐어요.'); });
  call.on('error', () => onCallFailed('연결에 실패했어요.'));
  callTimeout = setTimeout(() => onCallFailed('상대와 연결되지 않았어요.'), 30000);
}

// 이미 열려 있는 창이 푸시를 받으면 SW가 메시지를 보냄
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'answer-call' && !currentCall) {
      handleAnswerRequest(e.data.from);
    }
  });
}

// ---- 통화 화면 ----
function enterCall(peerName, remoteStream) {
  hideOverlays();
  $('home').hidden = true;
  $('call').hidden = false;
  $('peerLabel').textContent = peerName;
  addTile('self', myId + ' (나)', localStream, true);
  addTile('remote', peerName, remoteStream, false);
  setStatus('연결됨');
}

function hangup() {
  if (currentCall) { try { currentCall.close(); } catch (e) {} currentCall = null; }
  stopLocal();
  location.reload();
}

// ---- 미디어/타일 ----
function getMedia() {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: { echoCancellation: true, noiseSuppression: true },
  });
}
function stopLocal() {
  if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
}
function addTile(key, name, stream, isSelf) {
  const grid = $('grid');
  let tile = document.getElementById('tile-' + key);
  if (!tile) {
    tile = document.createElement('div');
    tile.id = 'tile-' + key;
    tile.className = 'tile' + (isSelf ? ' self' : '');
    tile.innerHTML =
      '<video autoplay playsinline' + (isSelf ? ' muted' : '') + '></video>' +
      '<span class="label"></span>';
    grid.appendChild(tile);
  }
  tile.querySelector('video').srcObject = stream;
  tile.querySelector('.label').textContent = name;
}

// ---- 통화 컨트롤 ----
$('micBtn').addEventListener('click', () => {
  const t = localStream && localStream.getAudioTracks()[0];
  if (!t) return;
  t.enabled = !t.enabled;
  $('micBtn').classList.toggle('off', !t.enabled);
  $('micBtn').textContent = t.enabled ? '🎤' : '🔇';
});
$('camBtn').addEventListener('click', () => {
  const t = localStream && localStream.getVideoTracks()[0];
  if (!t) return;
  t.enabled = !t.enabled;
  $('camBtn').classList.toggle('off', !t.enabled);
  $('camBtn').textContent = t.enabled ? '📷' : '🚫';
});
$('flipBtn').addEventListener('click', async () => {
  facingMode = facingMode === 'user' ? 'environment' : 'user';
  try {
    const ns = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
    const nt = ns.getVideoTracks()[0];
    const ot = localStream.getVideoTracks()[0];
    localStream.removeTrack(ot); ot.stop(); localStream.addTrack(nt);
    if (currentCall && currentCall.peerConnection) {
      const sender = currentCall.peerConnection.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) sender.replaceTrack(nt);
    }
    const selfVideo = document.querySelector('#tile-self video');
    if (selfVideo) selfVideo.srcObject = localStream;
  } catch (e) {
    facingMode = facingMode === 'user' ? 'environment' : 'user';
  }
});

// ---- 오버레이 제어 ----
function showOverlay(id) {
  hideOverlays();
  $(id).hidden = false;
}
function hideOverlays() {
  $('outgoing').hidden = true;
  $('incoming').hidden = true;
}
function setStatus(t) { $('statusText').textContent = t; }

window.addEventListener('beforeunload', () => { try { if (peer) peer.destroy(); } catch (e) {} });
