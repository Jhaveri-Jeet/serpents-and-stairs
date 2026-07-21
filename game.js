(() => {
  'use strict';

  // ---------- Board data ----------
  // classic-style board, all 38 start/end squares are unique (no overlaps)
  const LADDERS = { 3: 40, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100 };
  const SNAKES  = { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 };
  const SPECIAL = { ...LADDERS, ...SNAKES };

  const PLAYER_COLORS = [
    { name: 'Ruby',     main: '#e0483e', dark: '#a8281f' },
    { name: 'Sapphire', main: '#2f7de0', dark: '#1a4f96' },
    { name: 'Emerald',  main: '#3fae5c', dark: '#237a3c' },
    { name: 'Amber',    main: '#e8b23d', dark: '#b3801c' },
  ];
  const SNAKE_HUES = ['#5aa832', '#8e44ad', '#d9722c', '#c0392b', '#2f9e8f', '#b0499a'];
  const TOKEN_OFFSETS = [{ x: -18, y: -18 }, { x: 18, y: -18 }, { x: -18, y: 18 }, { x: 18, y: 18 }];

  // ---------- DOM ----------
  const startScreen = document.getElementById('start-screen');
  const gameScreen = document.getElementById('game-screen');
  const winScreen = document.getElementById('win-screen');
  const countSelect = document.getElementById('player-count-select');
  const nameList = document.getElementById('player-name-list');
  const startBtn = document.getElementById('start-btn');
  const boardWrap = document.getElementById('board-wrap');
  const boardSquare = document.getElementById('board-square');
  const cellsEl = document.getElementById('cells');
  const svgEl = document.getElementById('board-svg');
  const tokensEl = document.getElementById('tokens');
  const rollBtn = document.getElementById('roll-btn');
  const diceEl = document.getElementById('dice');
  const turnIndicator = document.getElementById('turn-indicator');
  const turnBanner = document.getElementById('turn-banner');
  const playerListEl = document.getElementById('player-list');
  const restartBtn = document.getElementById('restart-btn');
  const playAgainBtn = document.getElementById('play-again-btn');
  const winTitle = document.getElementById('win-title');
  const confettiLayer = document.getElementById('confetti-layer');

  let playerCount = 2;
  let state = null; // { players:[{name,color,position,el}], current, playing }
  const snakePathEls = {}; // headSquare -> <path> element (for slide animation)

  // ---------- geometry ----------
  function squareToRC(n) {
    const row = Math.floor((n - 1) / 10); // 0 = bottom row
    const posInRow = (n - 1) % 10;
    const col = row % 2 === 0 ? posInRow : 9 - posInRow;
    return { row, col };
  }
  function center(n) {
    const { row, col } = squareToRC(n);
    return { x: col * 100 + 50, y: (9 - row) * 100 + 50 };
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // ---------- board build ----------
  function buildCells() {
    cellsEl.innerHTML = '';
    for (let n = 1; n <= 100; n++) {
      const { row, col } = squareToRC(n);
      const gridRow = 10 - row, gridCol = col + 1;
      const div = document.createElement('div');
      div.className = 'cell' + ((row + col) % 2 ? ' alt' : '') + (row % 4 >= 2 ? ' tint' : '');
      if (n === 100) div.className += ' finish';
      div.style.gridRow = gridRow;
      div.style.gridColumn = gridCol;
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = n;
      div.appendChild(num);
      cellsEl.appendChild(div);
    }
  }

  function smoothPathD(points) {
    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
      const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
      d += ` Q ${points[i].x},${points[i].y} ${mid.x},${mid.y}`;
    }
    const last = points[points.length - 1], prev = points[points.length - 2];
    d += ` Q ${prev.x},${prev.y} ${last.x},${last.y}`;
    return d;
  }

  function wavyPoints(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    const segments = Math.max(3, Math.min(6, Math.round(len / 170)));
    const px = -dy / len, py = dx / len;
    const amp = 55;
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const p = { x: from.x + dx * t, y: from.y + dy * t };
      if (i > 0 && i < segments) {
        const sign = i % 2 === 0 ? 1 : -1;
        p.x += px * amp * sign;
        p.y += py * amp * sign;
      }
      pts.push(p);
    }
    return pts;
  }

  const svgNS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs) {
    const e = document.createElementNS(svgNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function renderSnake(headN, tailN, idx) {
    const head = center(headN), tail = center(tailN);
    const pts = wavyPoints(head, tail); // pts[0]=head .. last=tail
    const d = smoothPathD(pts);
    const color = SNAKE_HUES[idx % SNAKE_HUES.length];
    const dark = shade(color, -25);
    const light = shade(color, 20);

    const g = el('g', { class: 'snake' });
    const outline = el('path', { d, stroke: dark, 'stroke-width': 34, fill: 'none', 'stroke-linecap': 'round' });
    const body = el('path', { d, stroke: color, 'stroke-width': 25, fill: 'none', 'stroke-linecap': 'round' });
    const scales = el('path', { d, stroke: light, 'stroke-width': 25, fill: 'none', 'stroke-linecap': 'round', 'stroke-dasharray': '3 16' });
    g.appendChild(outline); g.appendChild(body); g.appendChild(scales);

    // head orientation from first segment direction
    const dirx = pts[1].x - pts[0].x, diry = pts[1].y - pts[0].y;
    const dlen = Math.hypot(dirx, diry) || 1;
    const ux = dirx / dlen, uy = diry / dlen;
    const px = -uy, py = ux;

    const headCircle = el('circle', { cx: head.x, cy: head.y, r: 26, fill: color, stroke: dark, 'stroke-width': 3 });
    const eye1 = el('circle', { cx: head.x + px * 10 + ux * 6, cy: head.y + py * 10 + uy * 6, r: 4.5, fill: 'white' });
    const eye2 = el('circle', { cx: head.x - px * 10 + ux * 6, cy: head.y - py * 10 + uy * 6, r: 4.5, fill: 'white' });
    const pupil1 = el('circle', { cx: head.x + px * 10 + ux * 8, cy: head.y + py * 10 + uy * 8, r: 2, fill: '#1a1a1a' });
    const pupil2 = el('circle', { cx: head.x - px * 10 + ux * 8, cy: head.y - py * 10 + uy * 8, r: 2, fill: '#1a1a1a' });
    const tongueBase = { x: head.x + ux * 24, y: head.y + uy * 24 };
    const tongueTip = { x: head.x + ux * 42, y: head.y + uy * 42 };
    const tongueL = { x: tongueTip.x + px * 6, y: tongueTip.y + py * 6 };
    const tongueR = { x: tongueTip.x - px * 6, y: tongueTip.y - py * 6 };
    const tongue = el('path', {
      d: `M ${tongueBase.x},${tongueBase.y} L ${tongueTip.x},${tongueTip.y} M ${tongueTip.x},${tongueTip.y} L ${tongueL.x},${tongueL.y} M ${tongueTip.x},${tongueTip.y} L ${tongueR.x},${tongueR.y}`,
      stroke: '#c0392b', 'stroke-width': 2.5, fill: 'none', 'stroke-linecap': 'round',
    });
    const tailDot = el('circle', { cx: pts[pts.length - 1].x, cy: pts[pts.length - 1].y, r: 9, fill: color, stroke: dark, 'stroke-width': 2 });

    g.appendChild(tailDot);
    g.appendChild(headCircle); g.appendChild(eye1); g.appendChild(eye2); g.appendChild(pupil1); g.appendChild(pupil2); g.appendChild(tongue);
    svgEl.appendChild(g);
    snakePathEls[headN] = body;
  }

  function renderLadder(lowN, highN) {
    const low = center(lowN), high = center(highN);
    const dx = high.x - low.x, dy = high.y - low.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len;
    const px = -uy, py = ux;
    const off = 22;
    const r1 = { x1: low.x + px * off, y1: low.y + py * off, x2: high.x + px * off, y2: high.y + py * off };
    const r2 = { x1: low.x - px * off, y1: low.y - py * off, x2: high.x - px * off, y2: high.y - py * off };

    const g = el('g', { class: 'ladder' });
    g.appendChild(el('line', { x1: r1.x1, y1: r1.y1, x2: r1.x2, y2: r1.y2, stroke: '#6b4423', 'stroke-width': 13, 'stroke-linecap': 'round' }));
    g.appendChild(el('line', { x1: r2.x1, y1: r2.y1, x2: r2.x2, y2: r2.y2, stroke: '#6b4423', 'stroke-width': 13, 'stroke-linecap': 'round' }));
    g.appendChild(el('line', { x1: r1.x1, y1: r1.y1, x2: r1.x2, y2: r1.y2, stroke: '#c98a4b', 'stroke-width': 7, 'stroke-linecap': 'round' }));
    g.appendChild(el('line', { x1: r2.x1, y1: r2.y1, x2: r2.x2, y2: r2.y2, stroke: '#c98a4b', 'stroke-width': 7, 'stroke-linecap': 'round' }));

    const rungCount = Math.max(4, Math.round(len / 65));
    for (let i = 1; i < rungCount; i++) {
      const t = i / rungCount;
      const a = { x: r1.x1 + (r1.x2 - r1.x1) * t, y: r1.y1 + (r1.y2 - r1.y1) * t };
      const b = { x: r2.x1 + (r2.x2 - r2.x1) * t, y: r2.y1 + (r2.y2 - r2.y1) * t };
      g.appendChild(el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#e0ab6a', 'stroke-width': 8, 'stroke-linecap': 'round' }));
      g.appendChild(el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#8a5a2e', 'stroke-width': 8, 'stroke-linecap': 'round', 'stroke-dasharray': `1 ${Math.hypot(b.x - a.x, b.y - a.y) - 1}` }));
    }
    svgEl.appendChild(g);
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) + amt, g = ((n >> 8) & 0xff) + amt, b = (n & 0xff) + amt;
    r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  function buildOverlays() {
    svgEl.innerHTML = '';
    for (const k in snakePathEls) delete snakePathEls[k];
    // ladders first (so snakes visually cross over if needed)
    Object.entries(LADDERS).forEach(([low, high]) => renderLadder(+low, +high));
    Object.entries(SNAKES).forEach(([head, tail], i) => renderSnake(+head, +tail, i));
  }

  // ---------- tokens ----------
  function tokenLeftTop(square, playerIdx) {
    const c = center(square);
    const off = TOKEN_OFFSETS[playerIdx % TOKEN_OFFSETS.length];
    return { left: (c.x + off.x) / 10, top: (c.y + off.y) / 10 };
  }

  function createTokens() {
    tokensEl.innerHTML = '';
    state.players.forEach((p, i) => {
      const t = document.createElement('div');
      t.className = 'token';
      t.style.background = `linear-gradient(160deg, ${shade(p.color.main, 25)}, ${p.color.main})`;
      t.style.borderColor = p.color.dark;
      const pos = tokenLeftTop(p.position, i);
      t.style.left = pos.left + '%';
      t.style.top = pos.top + '%';
      tokensEl.appendChild(t);
      p.el = t;
    });
  }

  function placeToken(player, idx, square, animate) {
    const pos = tokenLeftTop(square, idx);
    if (!animate) player.el.classList.add('moving');
    player.el.style.left = pos.left + '%';
    player.el.style.top = pos.top + '%';
  }

  function animateAlongPoints(player, points, duration) {
    return new Promise((resolve) => {
      player.el.classList.add('sliding');
      const start = performance.now();
      function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const idxF = eased * (points.length - 1);
        const i0 = Math.floor(idxF), i1 = Math.min(points.length - 1, i0 + 1);
        const localT = idxF - i0;
        const x = points[i0].x + (points[i1].x - points[i0].x) * localT;
        const y = points[i0].y + (points[i1].y - points[i0].y) * localT;
        player.el.style.left = (x / 10) + '%';
        player.el.style.top = (y / 10) + '%';
        if (t < 1) requestAnimationFrame(frame);
        else { player.el.classList.remove('sliding'); resolve(); }
      }
      requestAnimationFrame(frame);
    });
  }

  function sampleSnakePath(headN) {
    const pathEl = snakePathEls[headN];
    const len = pathEl.getTotalLength();
    const steps = 40;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const p = pathEl.getPointAtLength((i / steps) * len);
      pts.push({ x: p.x, y: p.y });
    }
    return pts;
  }

  // ---------- gameplay ----------
  async function movePlayerSteps(player, playerIdx, steps) {
    player.el.classList.add('moving');
    for (let i = 0; i < steps; i++) {
      player.position += 1;
      placeToken(player, playerIdx, player.position, true);
      updatePlayerRow(playerIdx);
      await sleep(190);
    }
    player.el.classList.remove('moving');

    const square = player.position;
    if (SNAKES[square]) {
      turnBanner.textContent = `${player.name} got bitten! Sliding down...`;
      await sleep(300);
      const pts = sampleSnakePath(square);
      await animateAlongPoints(player, pts, 700);
      player.position = SNAKES[square];
      updatePlayerRow(playerIdx);
    } else if (LADDERS[square]) {
      turnBanner.textContent = `${player.name} found a ladder! Climbing...`;
      await sleep(300);
      const from = center(square), to = center(LADDERS[square]);
      await animateAlongPoints(player, [from, to], 650);
      player.position = LADDERS[square];
      updatePlayerRow(playerIdx);
    }
  }

  function updatePlayerRow(idx) {
    const row = playerListEl.children[idx];
    if (row) row.querySelector('.p-pos').textContent = `Sq ${state.players[idx].position}`;
  }

  function renderPlayerList() {
    playerListEl.innerHTML = '';
    state.players.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'player-row' + (i === state.current ? ' active' : '');
      const icon = document.createElement('span');
      icon.className = 'token-icon';
      icon.style.background = p.color.main;
      const name = document.createElement('span');
      name.className = 'p-name';
      name.textContent = p.name;
      const pos = document.createElement('span');
      pos.className = 'p-pos';
      pos.textContent = `Sq ${p.position}`;
      li.appendChild(icon); li.appendChild(name); li.appendChild(pos);
      playerListEl.appendChild(li);
    });
  }

  function updateTurnUI() {
    const p = state.players[state.current];
    turnIndicator.innerHTML = '';
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = p.color.main;
    const label = document.createElement('span');
    label.textContent = `${p.name}'s turn`;
    turnIndicator.appendChild(dot); turnIndicator.appendChild(label);
    [...playerListEl.children].forEach((row, i) => row.classList.toggle('active', i === state.current));
  }

  function setDiceValue(v) {
    diceEl.dataset.value = v;
  }

  async function rollDice() {
    if (!state.playing) return;
    rollBtn.disabled = true;
    turnBanner.textContent = '';
    diceEl.classList.add('rolling');
    const shakeDuration = 550;
    const shakeStart = performance.now();
    await new Promise((resolve) => {
      const iv = setInterval(() => setDiceValue(1 + Math.floor(Math.random() * 6)), 70);
      setTimeout(() => { clearInterval(iv); resolve(); }, shakeDuration);
    });
    diceEl.classList.remove('rolling');
    const value = 1 + Math.floor(Math.random() * 6);
    setDiceValue(value);
    diceEl.classList.add('bounce');
    setTimeout(() => diceEl.classList.remove('bounce'), 420);
    await sleep(150);

    const idx = state.current;
    const player = state.players[idx];
    const destination = player.position + value;

    if (destination > 100) {
      turnBanner.textContent = `${player.name} rolled a ${value} — needs an exact roll to finish!`;
      await sleep(700);
      advanceTurn(value === 6);
      return;
    }

    await movePlayerSteps(player, idx, value);
    renderPlayerList(); // rebuild in case row styling drifted
    updateTurnUI();

    if (player.position === 100) {
      endGame(player);
      return;
    }
    advanceTurn(value === 6);
  }

  function advanceTurn(extraTurn) {
    if (!extraTurn) {
      state.current = (state.current + 1) % state.players.length;
    } else {
      turnBanner.textContent = `Rolled a 6 — go again!`;
    }
    updateTurnUI();
    rollBtn.disabled = false;
  }

  function endGame(player) {
    state.playing = false;
    rollBtn.disabled = true;
    winTitle.textContent = `${player.name} Wins!`;
    winTitle.style.color = player.color.dark;
    spawnConfetti();
    winScreen.classList.remove('hidden');
  }

  function spawnConfetti() {
    confettiLayer.innerHTML = '';
    const colors = PLAYER_COLORS.map((c) => c.main);
    for (let i = 0; i < 70; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + '%';
      piece.style.background = colors[i % colors.length];
      piece.style.animationDuration = (2.2 + Math.random() * 1.8) + 's';
      piece.style.animationDelay = (Math.random() * 1.5) + 's';
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      confettiLayer.appendChild(piece);
    }
  }

  // ---------- board sizing ----------
  function fitBoard() {
    const mobile = window.innerWidth <= 900;
    const PAD = 48;
    let size;
    if (mobile) {
      size = window.innerWidth - PAD;
    } else {
      const availW = window.innerWidth - 340 - PAD;
      const availH = window.innerHeight - PAD;
      size = Math.min(availW, availH);
    }
    size = Math.max(size, 260);
    boardSquare.style.width = size + 'px';
    boardSquare.style.height = size + 'px';
  }
  window.addEventListener('resize', () => { if (!gameScreen.classList.contains('hidden')) fitBoard(); });

  // ---------- start screen ----------
  function renderNameRows() {
    nameList.innerHTML = '';
    for (let i = 0; i < playerCount; i++) {
      const row = document.createElement('div');
      row.className = 'player-name-row';
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = PLAYER_COLORS[i].main;
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 16;
      input.value = `Player ${i + 1}`;
      input.dataset.idx = i;
      row.appendChild(swatch); row.appendChild(input);
      nameList.appendChild(row);
    }
  }

  countSelect.addEventListener('click', (e) => {
    const btn = e.target.closest('.count-btn');
    if (!btn) return;
    playerCount = +btn.dataset.count;
    [...countSelect.children].forEach((b) => b.classList.toggle('active', b === btn));
    renderNameRows();
  });

  function startGame() {
    const inputs = [...nameList.querySelectorAll('input')];
    const players = inputs.map((inp, i) => ({
      name: inp.value.trim() || `Player ${i + 1}`,
      color: PLAYER_COLORS[i],
      position: 1,
      el: null,
    }));
    state = { players, current: 0, playing: true };

    startScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    winScreen.classList.add('hidden');
    turnBanner.textContent = '';
    setDiceValue(1);

    fitBoard();
    buildCells();
    buildOverlays();
    createTokens();
    renderPlayerList();
    updateTurnUI();
    rollBtn.disabled = false;
  }

  function backToStart() {
    state = null;
    gameScreen.classList.add('hidden');
    winScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
  }

  startBtn.addEventListener('click', startGame);
  rollBtn.addEventListener('click', rollDice);
  restartBtn.addEventListener('click', backToStart);
  playAgainBtn.addEventListener('click', backToStart);

  renderNameRows();
})();
