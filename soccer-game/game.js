/* ⚽ 프리킥 챌린지 — 방향과 게이지를 골라 골을 넣는 간단한 축구게임 */
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

  // ── 필드 좌표 ──────────────────────────────────────────────
  const GOAL = { left: 80, right: 320, top: 70, bottom: 150 }; // 골대 영역
  const BALL_START = { x: W / 2, y: 520 };
  const BALL_R = 13;

  // ── 게임 상태 ──────────────────────────────────────────────
  const TOTAL_SHOTS = 5;
  const State = { AIM: "aim", POWER: "power", SHOOT: "shoot", RESULT: "result", OVER: "over" };

  let state, score, shotsLeft, best;
  best = Number(localStorage.getItem("freekick_best") || 0);

  // 조준 표시기 (좌우 진동)
  let aimX = GOAL.left, aimDir = 1;
  const AIM_Y = GOAL.top + 28;
  const AIM_SPEED = 3.2;

  // 게이지 (상하 진동, 0~1)
  let power = 0, powerDir = 1;
  const POWER_SPEED = 0.022;

  // 슛 결과 보관
  let shot = null;       // { tx, power }
  let ball = null;       // 움직이는 공
  let keeper = null;     // 골키퍼
  let resultTimer = 0;
  let kickAnim = 0;      // 차는 동작 애니메이션 (1→0)

  // 차는 사람 위치 (공 바로 뒤)
  const KICKER = { x: BALL_START.x - 22, y: BALL_START.y + 30 };

  function reset() {
    state = State.AIM;
    score = 0;
    shotsLeft = TOTAL_SHOTS;
    aimX = GOAL.left;
    aimDir = 1;
    power = 0;
    powerDir = 1;
    ball = { ...BALL_START, r: BALL_R };
    keeper = { x: W / 2, y: GOAL.bottom - 10, w: 70, h: 16, vx: 0 };
    kickAnim = 0;
    updateHud();
    hideMsg();
    btn.disabled = false;
    btn.textContent = "조준 시작";
    hintEl.textContent = "버튼 또는 화면을 눌러 방향을 멈추세요";
  }

  function updateHud() {
    scoreEl.textContent = score;
    shotsEl.textContent = shotsLeft;
    bestEl.textContent = best;
  }

  function showMsg(text, cls) {
    msgEl.textContent = text;
    msgEl.className = "message " + cls;
  }
  function hideMsg() {
    msgEl.className = "message hidden";
  }

  // ── 입력 ──────────────────────────────────────────────────
  function advance() {
    if (state === State.AIM) {
      // 방향 확정 → 게이지 단계
      shot = { tx: aimX };
      state = State.POWER;
      power = 0;
      powerDir = 1;
      btn.textContent = "파워 결정!";
      hintEl.textContent = "게이지가 적당할 때 눌러 슛! (너무 세면 넘어가요)";
    } else if (state === State.POWER) {
      // 파워 확정 → 발사
      shot.power = power;
      launch();
    } else if (state === State.OVER) {
      reset();
    }
    // SHOOT / RESULT 중에는 입력 무시
  }

  btn.addEventListener("click", advance);
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (state === State.AIM || state === State.POWER || state === State.OVER) advance();
  });

  // ── 슛 발사 ────────────────────────────────────────────────
  function launch() {
    state = State.SHOOT;
    btn.disabled = true;
    btn.textContent = "슛!";
    hintEl.textContent = "";
    kickAnim = 1; // 다리 휘두르기 시작

    const p = shot.power;
    // 파워에 따른 도착 높이: 적정 파워(0.55~0.85)면 골대 안, 과하면 크로스바 위로
    const overshoot = Math.max(0, p - 0.9) * 600; // 너무 세면 위로 뜸
    const targetY = GOAL.top + 10 - overshoot;
    const targetX = shot.tx;

    const dx = targetX - ball.x;
    const dy = targetY - ball.y;
    const dist = Math.hypot(dx, dy);
    const speed = 9 + p * 9; // 파워가 셀수록 빠름
    ball.vx = (dx / dist) * speed;
    ball.vy = (dy / dist) * speed;
    ball.targetY = targetY;
    ball.targetX = targetX;
    ball.scored = false;
    ball.resolved = false;

    // 골키퍼: 한쪽 방향으로 다이빙 (난이도: 공 위치 근처로 갈 확률 약간)
    const goalCenter = (GOAL.left + GOAL.right) / 2;
    let diveTarget;
    const guessRight = Math.random() < 0.5;
    if (Math.random() < 0.35) {
      // 가끔 공 방향을 잘 읽음
      diveTarget = targetX;
    } else {
      diveTarget = guessRight ? GOAL.right - 50 : GOAL.left + 50;
    }
    keeper.target = diveTarget;
    keeper.speed = 5.5 + Math.random() * 2;
  }

  // ── 업데이트 ──────────────────────────────────────────────
  function update() {
    if (state === State.AIM) {
      aimX += aimDir * AIM_SPEED;
      if (aimX > GOAL.right) { aimX = GOAL.right; aimDir = -1; }
      if (aimX < GOAL.left)  { aimX = GOAL.left; aimDir = 1; }
    } else if (state === State.POWER) {
      power += powerDir * POWER_SPEED;
      if (power > 1) { power = 1; powerDir = -1; }
      if (power < 0) { power = 0; powerDir = 1; }
    } else if (state === State.SHOOT) {
      if (kickAnim > 0) kickAnim = Math.max(0, kickAnim - 0.06);
      // 공 이동
      ball.x += ball.vx;
      ball.y += ball.vy;

      // 골키퍼 다이빙
      const kd = keeper.target - keeper.x;
      if (Math.abs(kd) > keeper.speed) keeper.x += Math.sign(kd) * keeper.speed;
      else keeper.x = keeper.target;

      // 골라인 도달 판정
      if (!ball.resolved && ball.y <= GOAL.bottom) {
        ball.resolved = true;
        resolveShot();
      }
      // 화면 밖
      if (ball.y < -40 || ball.x < -40 || ball.x > W + 40) {
        if (!ball.resolved) { ball.resolved = true; resolveShot(); }
      }
    } else if (state === State.RESULT) {
      resultTimer--;
      if (resultTimer <= 0) nextShot();
    }
  }

  function resolveShot() {
    const overBar = ball.targetY < GOAL.top - 2;         // 크로스바 위로
    const insideGoal = ball.x > GOAL.left + 6 && ball.x < GOAL.right - 6 && !overBar;
    const keptByKeeper =
      Math.abs(ball.x - keeper.x) < keeper.w / 2 + ball.r &&
      ball.y <= keeper.y + keeper.h && ball.y >= keeper.y - 30;

    let goal = insideGoal && !keptByKeeper;

    if (goal) {
      score++;
      if (score > best) { best = score; localStorage.setItem("freekick_best", best); }
      showMsg("⚽ 골!", "goal");
      ball.scored = true;
    } else {
      let reason = "❌ 빗나감";
      if (overBar) reason = "🚀 골대 위로!";
      else if (keptByKeeper) reason = "🧤 선방!";
      else if (!insideGoal) reason = "❌ 골대 밖";
      showMsg(reason, "miss");
    }
    updateHud();
    state = State.RESULT;
    resultTimer = 70;
  }

  function nextShot() {
    hideMsg();
    shotsLeft--;
    updateHud();
    if (shotsLeft <= 0) {
      gameOver();
      return;
    }
    // 다음 킥 준비
    ball = { ...BALL_START, r: BALL_R };
    keeper = { x: W / 2, y: GOAL.bottom - 10, w: 70, h: 16, vx: 0 };
    kickAnim = 0;
    aimX = GOAL.left;
    aimDir = 1;
    state = State.AIM;
    btn.disabled = false;
    btn.textContent = "조준 시작";
    hintEl.textContent = "버튼 또는 화면을 눌러 방향을 멈추세요";
  }

  function gameOver() {
    state = State.OVER;
    showMsg(`경기 종료\n${score} / ${TOTAL_SHOTS} 골`, score >= 3 ? "goal" : "miss");
    btn.disabled = false;
    btn.textContent = "다시 하기";
    hintEl.textContent = "버튼을 눌러 새 경기를 시작하세요";
  }

  // ── 렌더 ──────────────────────────────────────────────────
  function drawField() {
    // 잔디
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1f9b46");
    g.addColorStop(1, "#157a35");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 잔디 줄무늬
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    for (let i = 0; i < H; i += 80) ctx.fillRect(0, i, W, 40);

    // 페널티 박스
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 3;
    ctx.strokeRect(40, GOAL.bottom, W - 80, 220);
    ctx.beginPath();
    ctx.arc(W / 2, GOAL.bottom + 220, 60, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();

    drawGoal();
  }

  function drawGoal() {
    // 골 그물
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.fillRect(GOAL.left, GOAL.top, GOAL.right - GOAL.left, GOAL.bottom - GOAL.top);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    for (let x = GOAL.left; x <= GOAL.right; x += 16) {
      ctx.beginPath(); ctx.moveTo(x, GOAL.top); ctx.lineTo(x, GOAL.bottom); ctx.stroke();
    }
    for (let y = GOAL.top; y <= GOAL.bottom; y += 16) {
      ctx.beginPath(); ctx.moveTo(GOAL.left, y); ctx.lineTo(GOAL.right, y); ctx.stroke();
    }
    // 골대 프레임
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(GOAL.left, GOAL.bottom);
    ctx.lineTo(GOAL.left, GOAL.top);
    ctx.lineTo(GOAL.right, GOAL.top);
    ctx.lineTo(GOAL.right, GOAL.bottom);
    ctx.stroke();
    ctx.restore();
  }

  function drawKeeper() {
    ctx.fillStyle = "#ff3b3b";
    const k = keeper;
    ctx.fillRect(k.x - k.w / 2, k.y - k.h, k.w, k.h);       // 팔(가로)
    ctx.fillRect(k.x - 10, k.y - k.h, 20, 26);              // 몸통
    ctx.fillStyle = "#ffd9b3";
    ctx.beginPath();
    ctx.arc(k.x, k.y - k.h - 6, 8, 0, Math.PI * 2);          // 머리
    ctx.fill();
  }

  function drawKicker() {
    const kx = KICKER.x, ky = KICKER.y;
    // 차는 순간 다리가 앞(위)으로 휘둘러짐: 0=뻗음, 1=차는 중
    const swing = Math.sin(kickAnim * Math.PI); // 0→1→0
    ctx.save();
    ctx.lineCap = "round";

    // 그림자
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(kx, ky + 2, 16, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 디딤 다리 (왼쪽)
    ctx.strokeStyle = "#2b2b2b";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(kx - 4, ky - 26);
    ctx.lineTo(kx - 8, ky);
    ctx.stroke();

    // 차는 다리 (오른쪽) — 공쪽(위)으로 휘두름
    const hipX = kx + 4, hipY = ky - 26;
    const footX = hipX + 4 + swing * 18;
    const footY = ky - swing * 26; // 휘두를수록 위로 올라감
    ctx.strokeStyle = "#2b2b2b";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(footX, footY);
    ctx.stroke();
    // 축구화
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.ellipse(footX + 2, footY, 6, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 몸통 (유니폼)
    ctx.fillStyle = "#1565ff";
    ctx.beginPath();
    ctx.moveTo(kx - 9, ky - 26);
    ctx.lineTo(kx + 9, ky - 26);
    ctx.lineTo(kx + 7, ky - 52);
    ctx.lineTo(kx - 7, ky - 52);
    ctx.closePath();
    ctx.fill();

    // 팔 (균형)
    ctx.strokeStyle = "#ffd9b3";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(kx - 7, ky - 48);
    ctx.lineTo(kx - 18, ky - 38 + swing * 6);
    ctx.moveTo(kx + 7, ky - 48);
    ctx.lineTo(kx + 17, ky - 40 - swing * 4);
    ctx.stroke();

    // 머리
    ctx.fillStyle = "#ffd9b3";
    ctx.beginPath();
    ctx.arc(kx, ky - 60, 8, 0, Math.PI * 2);
    ctx.fill();
    // 머리카락
    ctx.fillStyle = "#3a2a1a";
    ctx.beginPath();
    ctx.arc(kx, ky - 62, 8, Math.PI, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawBall() {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 6;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // 오각형 무늬
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawAim() {
    if (state !== State.AIM) {
      // 확정된 방향 점선 표시
      if (state === State.POWER) {
        ctx.strokeStyle = "rgba(255,255,80,0.8)";
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ball.x, ball.y);
        ctx.lineTo(shot.tx, AIM_Y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else {
      ctx.strokeStyle = "rgba(255,255,80,0.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(ball.x, ball.y);
      ctx.lineTo(aimX, AIM_Y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // 조준 마커
    const mx = state === State.AIM ? aimX : shot.tx;
    ctx.fillStyle = "#ffeb3b";
    ctx.beginPath();
    ctx.moveTo(mx, AIM_Y - 8);
    ctx.lineTo(mx - 7, AIM_Y + 6);
    ctx.lineTo(mx + 7, AIM_Y + 6);
    ctx.closePath();
    ctx.fill();
  }

  function drawPowerGauge() {
    if (state !== State.POWER) return;
    const gx = W - 34, gy = 200, gw = 18, gh = 240;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(gx, gy, gw, gh);
    // 적정 구간 표시 (0.55~0.85)
    ctx.fillStyle = "rgba(109,255,158,0.35)";
    ctx.fillRect(gx, gy + gh * (1 - 0.9), gw, gh * (0.9 - 0.55));
    // 채워진 파워
    const fillH = gh * power;
    const col = power > 0.9 ? "#ff5252" : power >= 0.55 ? "#6dff9e" : "#ffd54f";
    ctx.fillStyle = col;
    ctx.fillRect(gx, gy + gh - fillH, gw, fillH);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(gx, gy, gw, gh);
  }

  function render() {
    drawField();
    if (state !== State.OVER) {
      drawKeeper();
      drawAim();
      drawPowerGauge();
      drawKicker();
      drawBall();
    }
  }

  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }

  reset();
  loop();
})();
