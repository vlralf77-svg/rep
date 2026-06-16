/* ⚽ 프리킥 챌린지 — 원근감/궤적/효과음을 갖춘 현실감 버전 */
(() => {
  "use strict";

  const canvas = document.getElementById("field");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;   // 400
  const H = canvas.height;  // 600

  const scoreEl = document.getElementById("score");
  const shotsEl = document.getElementById("shots");
  const bestEl = document.getElementById("best");
  const hintEl = document.getElementById("hint");
  const btn = document.getElementById("actionBtn");
  const msgEl = document.getElementById("message");

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  // ── 원근 투영 ──────────────────────────────────────────────
  // u: 좌우(-1~1), d: 깊이(0=발밑, 1=골라인), h: 높이(0=땅, 1=크로스바)
  const FIELD = { nearY: 552, farY: 200, nearHalf: 210, farHalf: 100, cx: W / 2 };
  function project(u, d, h) {
    const dd = clamp(d, 0, 1);
    const gy = lerp(FIELD.nearY, FIELD.farY, dd);
    const half = lerp(FIELD.nearHalf, FIELD.farHalf, dd);
    const scale = lerp(1, 0.5, dd);
    const heightPx = h * lerp(165, 90, dd);
    return { x: FIELD.cx + u * half, y: gy - heightPx, gy, scale };
  }

  // 골대 규격
  const GOAL_U = 0.6;    // 골대 반폭 (u)
  const BAR_H = 1.3;     // 크로스바 높이 (h)

  // ── 효과음 (WebAudio, 외부 파일 없음) ──────────────────────
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
  function env(node, g, t0, atk, dec) {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.exponentialRampToValueAtTime(g, t0 + atk);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + atk + dec);
  }
  function sfxKick() {
    if (!actx) return;
    const t = actx.currentTime;
    const src = actx.createBufferSource(); src.buffer = noiseBuf;
    const f = actx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900;
    const g = actx.createGain(); env(g, 0.7, t, 0.005, 0.12);
    src.connect(f); f.connect(g); g.connect(actx.destination);
    src.start(t); src.stop(t + 0.2);
    const o = actx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
    const og = actx.createGain(); env(og, 0.5, t, 0.005, 0.12);
    o.connect(og); og.connect(actx.destination); o.start(t); o.stop(t + 0.2);
  }
  function sfxGoal() {
    if (!actx) return;
    const t = actx.currentTime;
    // 그물 출렁 + 관중 환호
    const src = actx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = actx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1200; f.Q.value = 0.6;
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    src.connect(f); f.connect(g); g.connect(actx.destination); src.start(t); src.stop(t + 1.5);
    [523, 659, 784].forEach((fr, i) => {
      const o = actx.createOscillator(); o.type = "triangle"; o.frequency.value = fr;
      const og = actx.createGain(); env(og, 0.18, t + i * 0.07, 0.02, 0.5);
      o.connect(og); og.connect(actx.destination); o.start(t + i * 0.07); o.stop(t + 0.8);
    });
  }
  function sfxSave() {
    if (!actx) return;
    const t = actx.currentTime;
    const src = actx.createBufferSource(); src.buffer = noiseBuf;
    const f = actx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 500;
    const g = actx.createGain(); env(g, 0.6, t, 0.005, 0.18);
    src.connect(f); f.connect(g); g.connect(actx.destination); src.start(t); src.stop(t + 0.3);
  }
  function sfxMiss() {
    if (!actx) return;
    const t = actx.currentTime;
    const o = actx.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.4);
    const g = actx.createGain(); env(g, 0.18, t, 0.02, 0.4);
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.5);
  }

  // ── 게임 상태 ──────────────────────────────────────────────
  const TOTAL_SHOTS = 5;
  const S = { AIM: 0, POWER: 1, SHOOT: 2, RESULT: 3, OVER: 4 };

  let state, score, shotsLeft, best;
  best = Number(localStorage.getItem("freekick_best2") || 0);

  let aimU = -GOAL_U, aimDir = 1;
  const AIM_SPEED = 0.012;
  let power = 0, powerDir = 1;
  const POWER_SPEED = 0.02;

  let shot, ball, keeper, kicker, resultTimer, netRipple = 0;

  function freshBall() {
    return { u: 0, d: 0, h: 0, t: 0, spin: 0, resolved: false, goalH: 0, uFinal: 0 };
  }
  function freshKeeper() {
    return { u: 0, target: 0, dive: 0, reach: 0.7, anim: 0 };
  }
  function freshKicker() {
    return { x: FIELD.cx - 16, run: 0, kick: 0 };
  }

  function reset() {
    state = S.AIM;
    score = 0; shotsLeft = TOTAL_SHOTS;
    aimU = -GOAL_U; aimDir = 1; power = 0; powerDir = 1;
    ball = freshBall(); keeper = freshKeeper(); kicker = freshKicker();
    netRipple = 0;
    updateHud(); hideMsg();
    btn.disabled = false; btn.textContent = "조준 시작";
    hintEl.textContent = "버튼/화면을 눌러 방향을 멈추세요";
  }

  function updateHud() {
    scoreEl.textContent = score; shotsEl.textContent = shotsLeft; bestEl.textContent = best;
  }
  function showMsg(text, cls) { msgEl.textContent = text; msgEl.className = "message " + cls; }
  function hideMsg() { msgEl.className = "message hidden"; }

  // ── 입력 ──────────────────────────────────────────────────
  function advance() {
    initAudio();
    if (state === S.AIM) {
      shot = { uT: aimU };
      state = S.POWER; power = 0; powerDir = 1;
      btn.textContent = "파워 결정!";
      hintEl.textContent = "적당한 세기로! (너무 세면 골대 위로)";
    } else if (state === S.POWER) {
      shot.power = power; launch();
    } else if (state === S.OVER) {
      reset();
    }
  }
  btn.addEventListener("click", advance);
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (state === S.AIM || state === S.POWER || state === S.OVER) advance();
  });

  // ── 슛 발사 ────────────────────────────────────────────────
  function launch() {
    state = S.SHOOT;
    btn.disabled = true; btn.textContent = "슛!"; hintEl.textContent = "";

    const p = shot.power;
    ball = freshBall();
    ball.uStart = 0; ball.uT = shot.uT;
    ball.goalH = (p - 0.45) * 2.9;               // 골라인에서의 높이 (파워↑ → 높이↑)
    ball.arc = 0.32 + p * 0.55;                   // 비행 중 포물선 정점
    ball.swerve = rand(-0.05, 0.05);              // 살짝 휘는 무회전성 흔들림
    ball.frames = Math.round(52 - p * 16);        // 파워↑ → 빠름
    ball.flying = false;                          // 백스윙 후 발사

    // 골키퍼: 한쪽으로 예측 다이빙
    const r = Math.random();
    const guessU = r < 0.34 ? shot.uT : (Math.random() < 0.5 ? -0.28 : 0.28);
    keeper = freshKeeper();
    keeper.target = clamp(guessU + rand(-0.06, 0.06), -GOAL_U, GOAL_U);
    keeper.reach = rand(0.55, 0.92);

    // 키커 백스윙 → 컨택
    kicker = freshKicker();
    kicker.x = FIELD.cx - 46; kicker.run = 0; kicker.kick = 0;
  }

  function contact() {
    ball.flying = true;
    sfxKick();
  }

  // ── 업데이트 ──────────────────────────────────────────────
  function update() {
    if (state === S.AIM) {
      aimU += aimDir * AIM_SPEED;
      if (aimU > GOAL_U) { aimU = GOAL_U; aimDir = -1; }
      if (aimU < -GOAL_U) { aimU = -GOAL_U; aimDir = 1; }
    } else if (state === S.POWER) {
      power += powerDir * POWER_SPEED;
      if (power > 1) { power = 1; powerDir = -1; }
      if (power < 0) { power = 0; powerDir = 1; }
    } else if (state === S.SHOOT) {
      if (!ball.flying) {
        // 달려와서 차기
        kicker.run = Math.min(1, kicker.run + 0.07);
        kicker.x = lerp(FIELD.cx - 46, FIELD.cx - 14, kicker.run);
        if (kicker.run >= 1) {
          kicker.kick = Math.min(1, kicker.kick + 0.14);
          if (kicker.kick >= 0.5 && !ball.flying) contact();
        }
      } else {
        kicker.kick = Math.min(1, kicker.kick + 0.14);
        ball.t += 1 / ball.frames;
        ball.spin += 0.32;
        const t = clamp(ball.t, 0, 1);
        ball.d = t;
        ball.u = lerp(ball.uStart, ball.uT, t) + ball.swerve * Math.sin(Math.PI * t);
        ball.h = ball.goalH * t + ball.arc * Math.sin(Math.PI * t);

        // 골키퍼 다이빙
        keeper.anim = Math.min(1, keeper.anim + 0.09);
        keeper.u = lerp(0, keeper.target, keeper.anim);

        if (!ball.resolved && ball.t >= 1) { ball.resolved = true; resolveShot(); }
      }
    } else if (state === S.RESULT) {
      if (netRipple > 0) netRipple = Math.max(0, netRipple - 0.04);
      ball.spin += 0.05;
      resultTimer--;
      if (resultTimer <= 0) nextShot();
    }
  }

  function resolveShot() {
    const uF = ball.u;
    ball.uFinal = uF;
    const overBar = ball.goalH > BAR_H;
    const wide = Math.abs(uF) > GOAL_U - 0.02;
    const grounded = ball.goalH < -0.05;
    const inside = !overBar && !wide && !grounded;
    const saved = inside &&
      Math.abs(uF - keeper.u) < 0.16 &&
      ball.goalH <= keeper.reach + 0.05;

    const goal = inside && !saved;

    if (goal) {
      score++; netRipple = 1;
      if (score > best) { best = score; localStorage.setItem("freekick_best2", best); }
      showMsg("⚽ 골!!", "goal"); sfxGoal();
    } else {
      let reason = "❌ 빗나감";
      if (overBar) { reason = "🚀 골대 위로!"; sfxMiss(); }
      else if (wide) { reason = "❌ 골대 옆!"; sfxMiss(); }
      else if (saved) { reason = "🧤 선방!"; sfxSave(); }
      else { reason = "❌ 빗나감"; sfxMiss(); }
      showMsg(reason, "miss");
    }
    updateHud();
    state = S.RESULT; resultTimer = 75;
  }

  function nextShot() {
    hideMsg();
    shotsLeft--; updateHud();
    if (shotsLeft <= 0) { gameOver(); return; }
    ball = freshBall(); keeper = freshKeeper(); kicker = freshKicker();
    aimU = -GOAL_U; aimDir = 1; netRipple = 0;
    state = S.AIM; btn.disabled = false; btn.textContent = "조준 시작";
    hintEl.textContent = "버튼/화면을 눌러 방향을 멈추세요";
  }

  function gameOver() {
    state = S.OVER;
    showMsg(`경기 종료\n${score} / ${TOTAL_SHOTS} 골`, score >= 3 ? "goal" : "miss");
    btn.disabled = false; btn.textContent = "다시 하기";
    hintEl.textContent = "버튼을 눌러 새 경기를 시작하세요";
  }

  // ── 렌더 ──────────────────────────────────────────────────
  function drawBackground() {
    // 하늘 + 스탠드
    const sky = ctx.createLinearGradient(0, 0, 0, FIELD.farY);
    sky.addColorStop(0, "#7fc7ff"); sky.addColorStop(1, "#cfeaff");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, FIELD.farY);
    // 관중석
    ctx.fillStyle = "#2c3550"; ctx.fillRect(0, FIELD.farY - 46, W, 46);
    for (let y = 0; y < 46; y += 6) {
      ctx.fillStyle = y % 12 === 0 ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)";
      ctx.fillRect(0, FIELD.farY - 46 + y, W, 3);
    }
    // 관중 점묘
    for (let i = 0; i < 220; i++) {
      ctx.fillStyle = `hsl(${Math.random() * 360},40%,${50 + Math.random() * 30}%)`;
      ctx.fillRect(Math.random() * W, FIELD.farY - 44 + Math.random() * 40, 2, 2);
    }
  }

  function drawPitch() {
    // 잔디 사다리꼴 (원근)
    const nl = project(-1.18, 0, 0), nr = project(1.18, 0, 0);
    const fl = project(-1.0, 1, 0), fr = project(1.0, 1, 0);
    const grad = ctx.createLinearGradient(0, FIELD.farY, 0, FIELD.nearY);
    grad.addColorStop(0, "#1f9b46"); grad.addColorStop(1, "#15863a");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(nl.x, nl.y); ctx.lineTo(nr.x, nr.y);
    ctx.lineTo(fr.x, fr.y); ctx.lineTo(fl.x, fl.y); ctx.closePath(); ctx.fill();

    // 가로 줄무늬 (깊이에 따라 촘촘)
    for (let i = 0; i < 9; i++) {
      const d0 = i / 9, d1 = (i + 0.5) / 9;
      const a = project(-1.18, d0, 0), b = project(1.18, d0, 0);
      const c = project(1.18, d1, 0), e = project(-1.18, d1, 0);
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(e.x, e.y);
      ctx.closePath(); ctx.fill();
    }

    // 페널티 박스 라인
    ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 2;
    const boxNearD = 0.18, boxFarD = 0.9, boxU = 0.82;
    const p1 = project(-boxU, boxFarD, 0), p2 = project(boxU, boxFarD, 0);
    const p3 = project(boxU, boxNearD, 0), p4 = project(-boxU, boxNearD, 0);
    ctx.beginPath();
    ctx.moveTo(p4.x, p4.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y);
    ctx.stroke();
    // 페널티 스폿
    const spot = project(0, 0.32, 0);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath(); ctx.ellipse(spot.x, spot.y, 3, 1.5, 0, 0, Math.PI * 2); ctx.fill();
  }

  function drawGoal(behind) {
    // behind=true: 그물/포스트 뒤판 / false: 앞쪽 포스트 (공보다 앞)
    const bl = project(-GOAL_U, 1, 0), br = project(GOAL_U, 1, 0);
    const tl = project(-GOAL_U, 1, BAR_H), tr = project(GOAL_U, 1, BAR_H);

    if (behind) {
      // 그물
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 1;
      const rip = netRipple * 8;
      const cols = 12, rows = 7;
      for (let i = 0; i <= cols; i++) {
        const u = lerp(-GOAL_U, GOAL_U, i / cols);
        const top = project(u, 1, BAR_H), bot = project(u, 1, 0);
        const off = Math.sin((i / cols) * Math.PI) * rip;
        ctx.beginPath(); ctx.moveTo(top.x, top.y + off); ctx.lineTo(bot.x, bot.y + off); ctx.stroke();
      }
      for (let j = 0; j <= rows; j++) {
        const h = lerp(0, BAR_H, j / rows);
        const l = project(-GOAL_U, 1, h), r = project(GOAL_U, 1, h);
        const off = Math.sin((j / rows) * Math.PI) * rip;
        ctx.beginPath(); ctx.moveTo(l.x, l.y + off); ctx.lineTo(r.x, r.y + off); ctx.stroke();
      }
      ctx.restore();
    } else {
      // 골 포스트 + 크로스바 (흰 프레임, 두께 원근 반영)
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 6; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(bl.x, bl.y); ctx.lineTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y); ctx.lineTo(br.x, br.y);
      ctx.stroke();
    }
  }

  function drawKeeper() {
    const base = project(keeper.u, 0.98, 0);
    const s = base.scale;
    const dive = keeper.anim * (keeper.target === 0 ? 0 : 1);
    const lean = keeper.target * 40 * keeper.anim;
    ctx.save();
    ctx.translate(base.x, base.y);
    // 그림자
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(0, 0, 22 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(lean, 0);
    // 점프 높이
    const jump = Math.sin(keeper.anim * Math.PI) * 26 * s * (Math.abs(keeper.target) > 0.05 ? 1 : 0.2);
    ctx.translate(0, -jump);
    const body = 40 * s;
    // 유니폼
    ctx.fillStyle = "#ffcc00";
    ctx.fillRect(-9 * s, -body, 18 * s, body * 0.62);
    // 다리
    ctx.fillStyle = "#222";
    ctx.fillRect(-8 * s, -body * 0.38, 6 * s, body * 0.38);
    ctx.fillRect(2 * s, -body * 0.38, 6 * s, body * 0.38);
    // 뻗는 팔(장갑)
    ctx.strokeStyle = "#ffcc00"; ctx.lineWidth = 5 * s; ctx.lineCap = "round";
    const armA = 0.5 + keeper.anim * 1.4 * Math.sign(keeper.target || 1);
    ctx.beginPath();
    ctx.moveTo(0, -body * 0.85);
    ctx.lineTo(Math.cos(-Math.PI / 2 - armA) * 22 * s, -body * 0.85 + Math.sin(-Math.PI / 2 - armA) * 22 * s);
    ctx.moveTo(0, -body * 0.85);
    ctx.lineTo(Math.cos(-Math.PI / 2 + armA) * 22 * s, -body * 0.85 + Math.sin(-Math.PI / 2 + armA) * 22 * s);
    ctx.stroke();
    // 머리
    ctx.fillStyle = "#ffd9b3";
    ctx.beginPath(); ctx.arc(0, -body - 6 * s, 7 * s, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawBallShadow() {
    const g = project(ball.u, ball.d, 0);
    const sc = g.scale * (1 - ball.h * 0.25);
    ctx.fillStyle = `rgba(0,0,0,${0.3 * (1 - ball.h * 0.4)})`;
    ctx.beginPath();
    ctx.ellipse(g.x, g.y, 14 * sc, 5 * sc, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBall() {
    const b = project(ball.u, ball.d, ball.h);
    const r = 14 * b.scale;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(ball.spin);
    // 본체
    const grd = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r);
    grd.addColorStop(0, "#ffffff"); grd.addColorStop(1, "#d2d6dc");
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    // 오각 무늬
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath(); ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, r * 0.17, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawKicker() {
    const base = project(-0.06, 0.02, 0);
    const kx = kicker.x, ky = base.y + 8;
    const swing = Math.sin(kicker.kick * Math.PI); // 0→1→0
    const runBob = Math.sin(kicker.run * Math.PI * 3) * 3 * (1 - kicker.kick);
    ctx.save();
    ctx.lineCap = "round";
    // 그림자
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath(); ctx.ellipse(kx, ky + 2, 20, 6, 0, 0, Math.PI * 2); ctx.fill();

    ctx.translate(0, runBob);
    // 디딤 다리
    ctx.strokeStyle = "#1f2937"; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(kx - 6, ky - 34); ctx.lineTo(kx - 11, ky); ctx.stroke();
    // 차는 다리
    const hipX = kx + 6, hipY = ky - 34;
    const footX = hipX + 6 + swing * 26;
    const footY = ky - 4 - swing * 34;
    ctx.strokeStyle = "#1f2937"; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(footX, footY); ctx.stroke();
    ctx.fillStyle = "#111";
    ctx.beginPath(); ctx.ellipse(footX + 2, footY, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
    // 몸통(유니폼)
    ctx.fillStyle = "#e3242b";
    ctx.beginPath();
    ctx.moveTo(kx - 11, ky - 34); ctx.lineTo(kx + 11, ky - 34);
    ctx.lineTo(kx + 8, ky - 66); ctx.lineTo(kx - 8, ky - 66); ctx.closePath(); ctx.fill();
    // 팔
    ctx.strokeStyle = "#ffd9b3"; ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(kx - 8, ky - 60); ctx.lineTo(kx - 22, ky - 48 + swing * 10);
    ctx.moveTo(kx + 8, ky - 60); ctx.lineTo(kx + 22, ky - 52 - swing * 6);
    ctx.stroke();
    // 머리
    ctx.fillStyle = "#ffd9b3";
    ctx.beginPath(); ctx.arc(kx, ky - 76, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2a1d12";
    ctx.beginPath(); ctx.arc(kx, ky - 79, 9, Math.PI, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawAimAndPower() {
    if (state === S.AIM || state === S.POWER) {
      const u = state === S.AIM ? aimU : shot.uT;
      const tgt = project(u, 1, 0.12);
      const from = project(0, 0.05, 0.05);
      ctx.strokeStyle = "rgba(255,235,59,0.9)"; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(tgt.x, tgt.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#ffeb3b";
      ctx.beginPath();
      ctx.moveTo(tgt.x, tgt.y - 9); ctx.lineTo(tgt.x - 7, tgt.y + 4); ctx.lineTo(tgt.x + 7, tgt.y + 4);
      ctx.closePath(); ctx.fill();
    }
    if (state === S.POWER) {
      const gx = W - 30, gy = 210, gw = 16, gh = 230;
      ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(gx, gy, gw, gh);
      ctx.fillStyle = "rgba(109,255,158,0.35)";
      ctx.fillRect(gx, gy + gh * (1 - 0.9), gw, gh * (0.9 - 0.6));
      const fillH = gh * power;
      ctx.fillStyle = power > 0.9 ? "#ff5252" : power >= 0.6 ? "#6dff9e" : "#ffd54f";
      ctx.fillRect(gx, gy + gh - fillH, gw, fillH);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(gx, gy, gw, gh);
    }
  }

  function render() {
    drawBackground();
    drawPitch();
    drawGoal(true);   // 그물(뒤)
    drawKeeper();
    if (state !== S.OVER) {
      drawBallShadow();
      drawBall();
    }
    drawGoal(false);  // 포스트(앞)
    if (state === S.SHOOT || state === S.AIM || state === S.POWER) drawKicker();
    drawAimAndPower();
  }

  function loop() { update(); render(); requestAnimationFrame(loop); }

  reset(); loop();
})();
