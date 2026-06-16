/* ⚽ 3D 프리킥 챌린지 — Three.js (WebGL) */
import * as THREE from "three";

// ── DOM ──────────────────────────────────────────────────────
const canvas = document.getElementById("scene");
const scoreEl = document.getElementById("score");
const shotsEl = document.getElementById("shots");
const bestEl = document.getElementById("best");
const hintEl = document.getElementById("hint");
const btn = document.getElementById("actionBtn");
const msgEl = document.getElementById("message");
const gaugeEl = document.getElementById("gauge");
const gaugeFill = document.getElementById("gaugeFill");
const gaugeZone = document.getElementById("gaugeZone");

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

// ── 경기장 규격 (m) ─────────────────────────────────────────
const GOAL_W = 7.32, GOAL_HW = GOAL_W / 2, GOAL_H = 2.44, GOAL_Z = -22;
const BALL_R = 0.22;
const KEEP_Z = GOAL_Z + 0.7;

// ── 렌더러/씬/카메라 ────────────────────────────────────────
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (e) {
  document.getElementById("fallback").classList.remove("hidden");
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd3ff);
scene.fog = new THREE.Fog(0x8fd3ff, 30, 70);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
const CAM_HOME = new THREE.Vector3(0, 2.3, 7.5);
camera.position.copy(CAM_HOME);

// ── 조명 ────────────────────────────────────────────────────
scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x3a6b34, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(-8, 18, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -20;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
scene.add(sun);

// ── 텍스처 생성 ─────────────────────────────────────────────
function makePitchTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d");
  for (let i = 0; i < 8; i++) {
    x.fillStyle = i % 2 === 0 ? "#2aa14a" : "#239141";
    x.fillRect(0, i * 32, 256, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 12);
  t.anisotropy = 4;
  return t;
}
function makeBallTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d");
  x.fillStyle = "#f5f5f5"; x.fillRect(0, 0, 256, 256);
  const penta = (cx, cy, r, rot) => {
    x.fillStyle = "#15151a"; x.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = rot + i / 5 * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.closePath(); x.fill();
  };
  penta(128, 128, 34, 0);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 - Math.PI / 2;
    penta(128 + Math.cos(a) * 78, 128 + Math.sin(a) * 78, 20, a);
  }
  penta(40, 30, 20, 0.4); penta(220, 40, 20, 1.1);
  penta(30, 220, 20, 0.8); penta(225, 220, 20, 0.2);
  return new THREE.CanvasTexture(c);
}
function makeNetTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const x = c.getContext("2d");
  x.clearRect(0, 0, 64, 64);
  x.strokeStyle = "rgba(255,255,255,0.85)"; x.lineWidth = 2;
  for (let i = 0; i <= 64; i += 8) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.stroke();
    x.beginPath(); x.moveTo(0, i); x.lineTo(64, i); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ── 잔디 ────────────────────────────────────────────────────
const pitch = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 120),
  new THREE.MeshStandardMaterial({ map: makePitchTexture(), roughness: 1 })
);
pitch.rotation.x = -Math.PI / 2;
pitch.position.z = -20;
pitch.receiveShadow = true;
scene.add(pitch);

// 라인 (페널티 박스 등 간단히)
function lineBox() {
  const g = new THREE.BufferGeometry();
  const w = 9, zf = GOAL_Z + 0.1, zn = GOAL_Z + 11;
  const pts = [
    -w, 0.02, zf, w, 0.02, zf,
    w, 0.02, zf, w, 0.02, zn,
    w, 0.02, zn, -w, 0.02, zn,
    -w, 0.02, zn, -w, 0.02, zf,
  ];
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
}
scene.add(lineBox());

// ── 골대 + 그물 ─────────────────────────────────────────────
const goal = new THREE.Group();
const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
const postR = 0.06, depth = 1.8;
function post(x) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, GOAL_H, 12), postMat);
  m.position.set(x, GOAL_H / 2, GOAL_Z); m.castShadow = true; return m;
}
goal.add(post(-GOAL_HW), post(GOAL_HW));
const bar = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, GOAL_W, 12), postMat);
bar.rotation.z = Math.PI / 2; bar.position.set(0, GOAL_H, GOAL_Z); bar.castShadow = true;
goal.add(bar);

const netMat = new THREE.MeshStandardMaterial({
  map: makeNetTexture(), transparent: true, opacity: 0.5, side: THREE.DoubleSide,
  depthWrite: false, color: 0xffffff,
});
function netPlane(w, h, tile) {
  const m = makeNetTexture(); m.repeat.set(tile[0], tile[1]);
  const mat = netMat.clone(); mat.map = m;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}
// 뒤
const netBack = netPlane(GOAL_W, GOAL_H, [12, 4]);
netBack.position.set(0, GOAL_H / 2, GOAL_Z - depth);
goal.add(netBack);
// 천장
const netTop = netPlane(GOAL_W, depth, [12, 3]);
netTop.rotation.x = -Math.PI / 2;
netTop.position.set(0, GOAL_H, GOAL_Z - depth / 2);
goal.add(netTop);
// 좌우
for (const sx of [-1, 1]) {
  const s = netPlane(depth, GOAL_H, [3, 4]);
  s.rotation.y = Math.PI / 2;
  s.position.set(sx * GOAL_HW, GOAL_H / 2, GOAL_Z - depth / 2);
  goal.add(s);
}
scene.add(goal);

// 스탠드(관중석) 배경
const stand = new THREE.Mesh(
  new THREE.BoxGeometry(60, 10, 2),
  new THREE.MeshStandardMaterial({ color: 0x2c3550, roughness: 1 })
);
stand.position.set(0, 5, GOAL_Z - 8);
scene.add(stand);

// ── 공 ──────────────────────────────────────────────────────
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_R, 24, 24),
  new THREE.MeshStandardMaterial({ map: makeBallTexture(), roughness: 0.4 })
);
ball.castShadow = true;
scene.add(ball);

// 공 그림자 보조(가짜 블롭) — 바닥 대비 강조
const blob = new THREE.Mesh(
  new THREE.CircleGeometry(BALL_R * 1.2, 16),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 })
);
blob.rotation.x = -Math.PI / 2;
scene.add(blob);

// ── 골키퍼 ──────────────────────────────────────────────────
const keeper = new THREE.Group();
const kitMat = new THREE.MeshStandardMaterial({ color: 0x16c79a, roughness: 0.6 });
const skinMat = new THREE.MeshStandardMaterial({ color: 0xffd9b3, roughness: 0.7 });
const shortMat = new THREE.MeshStandardMaterial({ color: 0x0e3d57, roughness: 0.7 });
const gloveMat = new THREE.MeshStandardMaterial({ color: 0xff7a00, roughness: 0.5 });

const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 4, 10), kitMat);
torso.position.y = 1.25; torso.castShadow = true; keeper.add(torso);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), skinMat);
head.position.y = 1.75; head.castShadow = true; keeper.add(head);
const hip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.28), shortMat);
hip.position.y = 0.92; keeper.add(hip);
function leg(x) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.7, 4, 8), skinMat);
  m.position.set(x, 0.45, 0); m.castShadow = true; return m;
}
keeper.add(leg(-0.16), leg(0.16));
// 팔(어깨에 피벗) — 다이빙 때 위로 뻗음
function arm(x) {
  const pivot = new THREE.Group();
  pivot.position.set(x, 1.5, 0);
  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.6, 4, 8), kitMat);
  upper.position.y = -0.3; upper.castShadow = true;
  const glove = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), gloveMat);
  glove.position.y = -0.66;
  pivot.add(upper, glove);
  keeper.add(pivot);
  return pivot;
}
const armL = arm(-0.28), armR = arm(0.28);
keeper.position.set(0, 0, KEEP_Z);
scene.add(keeper);

// ── 조준 마커 ───────────────────────────────────────────────
const marker = new THREE.Mesh(
  new THREE.PlaneGeometry(0.5, GOAL_H),
  new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
);
marker.position.set(0, GOAL_H / 2, GOAL_Z + 0.05);
scene.add(marker);

// ── 사운드 ──────────────────────────────────────────────────
let actx = null, noiseBuf = null;
function initAudio() {
  if (actx) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    const len = actx.sampleRate * 0.5;
    noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
  } catch (e) { actx = null; }
}
function envGain(g, peak, t0, atk, dec) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + atk + dec);
}
function sfxKick() {
  if (!actx) return; const t = actx.currentTime;
  const s = actx.createBufferSource(); s.buffer = noiseBuf;
  const f = actx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900;
  const g = actx.createGain(); envGain(g, 0.7, t, 0.005, 0.12);
  s.connect(f); f.connect(g); g.connect(actx.destination); s.start(t); s.stop(t + 0.2);
  const o = actx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(170, t);
  o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
  const og = actx.createGain(); envGain(og, 0.5, t, 0.005, 0.12);
  o.connect(og); og.connect(actx.destination); o.start(t); o.stop(t + 0.2);
}
function sfxGoal() {
  if (!actx) return; const t = actx.currentTime;
  const s = actx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = actx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1200; f.Q.value = 0.6;
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.25, t + 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
  s.connect(f); f.connect(g); g.connect(actx.destination); s.start(t); s.stop(t + 1.6);
  [523, 659, 784].forEach((fr, i) => {
    const o = actx.createOscillator(); o.type = "triangle"; o.frequency.value = fr;
    const og = actx.createGain(); envGain(og, 0.18, t + i * 0.07, 0.02, 0.5);
    o.connect(og); og.connect(actx.destination); o.start(t + i * 0.07); o.stop(t + 0.8);
  });
}
function sfxSave() {
  if (!actx) return; const t = actx.currentTime;
  const s = actx.createBufferSource(); s.buffer = noiseBuf;
  const f = actx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 500;
  const g = actx.createGain(); envGain(g, 0.6, t, 0.005, 0.18);
  s.connect(f); f.connect(g); g.connect(actx.destination); s.start(t); s.stop(t + 0.3);
}
function sfxMiss() {
  if (!actx) return; const t = actx.currentTime;
  const o = actx.createOscillator(); o.type = "sawtooth";
  o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.4);
  const g = actx.createGain(); envGain(g, 0.18, t, 0.02, 0.4);
  o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.5);
}

// ── 게임 상태 ───────────────────────────────────────────────
const S = { AIM: 0, POWER: 1, SHOOT: 2, RESULT: 3, OVER: 4 };
const TOTAL_SHOTS = 5;
let state, score, shotsLeft, best;
best = Number(localStorage.getItem("freekick3d_best") || 0);

let aimX = -GOAL_HW * 0.9, aimDir = 1;
let power = 0, powerDir = 1;
let vel = new THREE.Vector3();
let keeperTargetX = 0, keeperReachY = 2, keeperDive = 0, keeperGuessSide = 0;
let resultTimer = 0, spinAxis = new THREE.Vector3(1, 0, 0), resolved = false;

function resetBall() {
  ball.position.set(0, BALL_R, 0);
  ball.rotation.set(0, 0, 0);
  vel.set(0, 0, 0);
}
function resetKeeper() {
  keeper.position.set(0, 0, KEEP_Z);
  keeper.rotation.z = 0;
  armL.rotation.z = 0.3; armR.rotation.z = -0.3;
  keeperDive = 0;
}

function setState(s) { state = s; }

function reset() {
  score = 0; shotsLeft = TOTAL_SHOTS;
  updateHud(); hideMsg();
  newShot();
}
function newShot() {
  resetBall(); resetKeeper();
  aimX = -GOAL_HW * 0.9; aimDir = 1; power = 0; powerDir = 1;
  marker.visible = true; marker.position.x = aimX;
  gaugeEl.classList.add("hidden");
  camera.position.copy(CAM_HOME);
  camera.lookAt(0, 1.1, -12);
  setState(S.AIM);
  btn.disabled = false; btn.textContent = "조준 멈추기";
  hintEl.textContent = "버튼/화면을 눌러 방향을 멈추세요";
}

function updateHud() { scoreEl.textContent = score; shotsEl.textContent = shotsLeft; bestEl.textContent = best; }
function showMsg(t, c) { msgEl.textContent = t; msgEl.className = "message " + c; }
function hideMsg() { msgEl.className = "message hidden"; }

// ── 입력 ────────────────────────────────────────────────────
function advance() {
  initAudio();
  if (state === S.AIM) {
    setState(S.POWER); power = 0; powerDir = 1;
    gaugeEl.classList.remove("hidden");
    gaugeZone.style.bottom = "58%"; gaugeZone.style.height = "32%";
    btn.textContent = "슛!";
    hintEl.textContent = "적당한 세기로! (너무 세면 골대 위로)";
  } else if (state === S.POWER) {
    gaugeEl.classList.add("hidden");
    launch();
  } else if (state === S.OVER) {
    reset();
  }
}
btn.addEventListener("click", advance);
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (state === S.AIM || state === S.POWER || state === S.OVER) advance();
});

// ── 슛 ──────────────────────────────────────────────────────
function launch() {
  setState(S.SHOOT);
  btn.disabled = true; btn.textContent = "슛!"; hintEl.textContent = "";
  marker.visible = false;
  resolved = false;

  const p = power;
  const targetY = clamp((p - 0.32) * 4.2, 0.2, 5);  // 골라인 도달 높이
  const T = lerp(1.25, 0.78, p);                     // 비행 시간(파워↑ → 빠름)
  const g = 9.8;
  const dist = -GOAL_Z;
  vel.z = GOAL_Z / T;                                // 전진(-)
  vel.x = aimX / T + rand(-0.25, 0.25);              // 좌우(+살짝 흔들림)
  vel.y = (targetY - BALL_R + 0.5 * g * T * T) / T;  // 포물선
  spinAxis.set(rand(-1, 1), rand(-0.3, 0.3), 0).normalize();

  // 골키퍼 예측
  const r = Math.random();
  keeperGuessSide = r < 0.34 ? Math.sign(aimX) : (Math.random() < 0.5 ? -1 : 1);
  keeperTargetX = r < 0.34 ? clamp(aimX, -GOAL_HW + 0.4, GOAL_HW - 0.4)
                           : keeperGuessSide * rand(1.6, 2.8);
  keeperReachY = rand(1.7, 2.6);

  sfxKick();
}

// ── 물리/판정 ───────────────────────────────────────────────
const G = 9.8;
function stepBall(dt) {
  vel.y -= G * dt;
  ball.position.addScaledVector(vel, dt);
  // 회전
  const spd = vel.length();
  ball.rotateOnWorldAxis(spinAxis, spd * dt / BALL_R * 0.5);
  // 바닥 바운스(골 못 넣고 굴러갈 때)
  if (ball.position.y < BALL_R) { ball.position.y = BALL_R; vel.y = -vel.y * 0.4; vel.multiplyScalar(0.8); }
  // 그물에 박혀 멈춤(골)
  if (ball.position.z < GOAL_Z - depth + BALL_R &&
      Math.abs(ball.position.x) < GOAL_HW && ball.position.y < GOAL_H) {
    ball.position.z = GOAL_Z - depth + BALL_R; vel.multiplyScalar(0.0);
  }
}
function keeperUpdate(dt) {
  // 다이빙 진행
  keeperDive = Math.min(1, keeperDive + dt * 1.8);
  const kx = lerp(0, keeperTargetX, easeOut(keeperDive));
  keeper.position.x = clamp(kx, -GOAL_HW + 0.3, GOAL_HW - 0.3);
  const diving = Math.abs(keeperTargetX) > 0.3;
  const lean = diving ? Math.sign(keeperTargetX) * keeperDive * 1.15 : 0;
  keeper.rotation.z = -lean;
  const jump = Math.sin(keeperDive * Math.PI) * (diving ? 0.5 : 0.05);
  keeper.position.y = jump;
  // 팔 위로
  armL.rotation.z = 0.3 + keeperDive * 1.2;
  armR.rotation.z = -0.3 - keeperDive * 1.2;
}
function easeOut(t) { return 1 - (1 - t) * (1 - t); }

function resolveShot() {
  resolved = true;
  const x = ball.position.x, y = ball.position.y;
  const overBar = y > GOAL_H + BALL_R * 0.5;
  const wide = Math.abs(x) > GOAL_HW + BALL_R * 0.5;
  const inside = !overBar && !wide && y > 0;
  const saved = inside && Math.abs(x - keeper.position.x) < 1.3 && y < keeperReachY;

  if (inside && !saved) {
    score++; if (score > best) { best = score; localStorage.setItem("freekick3d_best", best); }
    showMsg("⚽ 골!!", "goal"); sfxGoal();
  } else {
    let msg = "❌ 빗나감";
    if (overBar) { msg = "🚀 골대 위로!"; sfxMiss(); }
    else if (wide) { msg = "❌ 골대 옆!"; sfxMiss(); }
    else if (saved) {
      msg = "🧤 선방!"; sfxSave();
      vel.set(Math.sign(ball.position.x - keeper.position.x || 1) * 3, 2.5, 4); // 펀칭 튕김
    }
    else sfxMiss();
    showMsg(msg, "miss");
  }
  updateHud();
  setState(S.RESULT); resultTimer = 1.4;
}

function nextShot() {
  hideMsg();
  shotsLeft--; updateHud();
  if (shotsLeft <= 0) { gameOver(); return; }
  newShot();
}
function gameOver() {
  setState(S.OVER);
  showMsg(`경기 종료\n${score} / ${TOTAL_SHOTS} 골`, score >= 3 ? "goal" : "miss");
  btn.disabled = false; btn.textContent = "다시 하기";
  hintEl.textContent = "버튼을 눌러 새 경기를 시작하세요";
}

// ── 루프 ────────────────────────────────────────────────────
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state === S.AIM) {
    aimX += aimDir * 5 * dt;
    if (aimX > GOAL_HW * 0.92) { aimX = GOAL_HW * 0.92; aimDir = -1; }
    if (aimX < -GOAL_HW * 0.92) { aimX = -GOAL_HW * 0.92; aimDir = 1; }
    marker.position.x = aimX;
  } else if (state === S.POWER) {
    power += powerDir * 0.9 * dt;
    if (power > 1) { power = 1; powerDir = -1; }
    if (power < 0) { power = 0; powerDir = 1; }
    gaugeFill.style.height = (power * 100) + "%";
    gaugeFill.style.background = power > 0.9 ? "#ff5252" : power >= 0.58 ? "#6dff9e" : "#ffd54f";
  } else if (state === S.SHOOT) {
    stepBall(dt);
    keeperUpdate(dt);
    // 카메라가 공을 살짝 따라감
    camera.position.x = lerp(camera.position.x, ball.position.x * 0.3, 0.05);
    camera.lookAt(ball.position.x * 0.3, 1.2, ball.position.z * 0.5 - 8);
    if (!resolved && ball.position.z <= GOAL_Z) resolveShot();
    // 너무 멀리/오래 가면 종료
    if (!resolved && (ball.position.z < GOAL_Z - 4 || ball.position.y > 12)) resolveShot();
  } else if (state === S.RESULT) {
    keeperUpdate(dt); stepBall(dt);
    resultTimer -= dt;
    if (resultTimer <= 0) nextShot();
  }

  // 공 그림자 블롭 따라가기
  blob.position.set(ball.position.x, 0.015, ball.position.z);
  const h = Math.max(0, ball.position.y - BALL_R);
  blob.scale.setScalar(clamp(1 - h * 0.06, 0.4, 1.2));
  blob.material.opacity = clamp(0.3 - h * 0.02, 0.05, 0.3);

  renderer.render(scene, camera);
}

// ── 리사이즈 ────────────────────────────────────────────────
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

reset();
animate();
