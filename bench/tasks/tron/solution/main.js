/* Light Cycles: browser front end (rendering, input, real-time loop, test hook). */
(function () {
  'use strict';

  var TG = window.TronGame;
  var TICK_MS = 1000 / 15;       // 15 ticks per second
  var ROUND_PAUSE_MS = 1000;     // crash is shown for about a second
  var COLORS = {
    bg: '#000000',
    p1: '#00e5ff', p1Head: '#b8f7ff',
    p2: '#ff8c00', p2Head: '#ffd08a',
    obstacle: '#7a828c',
    crash: '#ffffff',
  };

  var canvas = document.getElementById('game');
  var ctx2d = canvas.getContext('2d');
  var scoreEl = document.getElementById('score');
  var messageEl = document.getElementById('message');

  // mode: 'waiting' (before first Space), 'running', 'over' (match won),
  // 'manual' (driven by window.tron.step()).
  var mode = 'waiting';
  var paused = false;
  var game = new TG.Game({ ai: true });
  var cell = 12;
  var lastTime = 0, acc = 0;
  var roundPauseLeft = 0; // ms left before the next round starts
  var timer = null;

  function cellSize(w, h) {
    // Fit within ~960x640 CSS px (leaves room for the header in 1024x768), never below 8.
    return Math.max(8, Math.min(16, Math.floor(Math.min(960 / w, 640 / h))));
  }

  function resizeCanvas() {
    cell = cellSize(game.width, game.height);
    canvas.width = game.width * cell;
    canvas.height = game.height * cell;
    canvas.style.width = canvas.width + 'px';
    canvas.style.height = canvas.height + 'px';
  }

  function draw() {
    var w = game.width, h = game.height, cells = game.cells;
    ctx2d.fillStyle = COLORS.bg;
    ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var v = cells[y * w + x];
        if (!v) continue;
        ctx2d.fillStyle = v === 1 ? COLORS.p1 : v === 2 ? COLORS.p2 : COLORS.obstacle;
        ctx2d.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    for (var p = 0; p < 2; p++) {
      var pl = game.players[p];
      ctx2d.fillStyle = p === 0 ? COLORS.p1Head : COLORS.p2Head;
      var inset = Math.max(1, Math.floor(cell / 6));
      ctx2d.fillRect(pl.x * cell + inset, pl.y * cell + inset, cell - 2 * inset, cell - 2 * inset);
      if (!pl.alive && pl.crashCell) {
        // Crash burst on the cell the cycle tried to enter.
        var cx = (pl.crashCell.x + 0.5) * cell, cy = (pl.crashCell.y + 0.5) * cell;
        ctx2d.strokeStyle = COLORS.crash;
        ctx2d.lineWidth = 2;
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, cell * 0.9, 0, Math.PI * 2);
        ctx2d.stroke();
      }
    }
  }

  function scoreText() {
    return game.players[0].score + ' - ' + game.players[1].score;
  }

  function roundEndText() {
    var r = game.round;
    if (game.roundWinner === 0) return 'Both cycles crashed: round ' + r + ' is a draw.';
    if (game.roundWinner === 1) return 'Orange crashed: you win round ' + r + '!';
    return 'You crashed: the computer wins round ' + r + '.';
  }

  function updateText() {
    scoreEl.textContent = scoreText();
    var msg;
    if (mode === 'waiting') msg = 'Press Space to start';
    else if (game.matchWinner !== null) {
      msg = (game.matchWinner === 1 ? 'You win the match ' : 'The computer wins the match ') +
        scoreText() + '! Press Space to play again.';
    } else if (paused) msg = 'Paused: press P to resume';
    else if (game.roundOver) msg = roundEndText();
    else msg = 'Round ' + game.round + ': steer with arrows or WASD, P to pause';
    if (messageEl.textContent !== msg) messageEl.textContent = msg;
  }

  function render() {
    draw();
    updateText();
  }

  function doStep() {
    return game.step();
  }

  function newGame(options) {
    game = new TG.Game(options);
    resizeCanvas();
  }

  // ------------------------------------------------------------------
  // Real-time loop
  // ------------------------------------------------------------------

  function stopLoop() {
    if (timer !== null) { clearInterval(timer); timer = null; }
  }

  function startLoop() {
    stopLoop();
    lastTime = performance.now();
    acc = 0;
    timer = setInterval(loop, 5);
  }

  function loop() {
    var t = performance.now();
    var dt = t - lastTime;
    lastTime = t;
    if (mode !== 'running' || paused) return;
    if (dt > 250) dt = 250; // tab was asleep: don't fast-forward
    var changed = false;
    if (game.roundOver) {
      if (game.matchWinner !== null) {
        mode = 'over';
        stopLoop();
        render();
        return;
      }
      roundPauseLeft -= dt;
      if (roundPauseLeft <= 0) {
        doStep();             // this tick starts the next round
        acc = 0;
        changed = true;
      }
    } else {
      acc += dt;
      while (acc >= TICK_MS && !game.roundOver) {
        acc -= TICK_MS;
        var r = doStep();
        changed = true;
        if (r === 'roundEnd') {
          roundPauseLeft = ROUND_PAUSE_MS;
          acc = 0;
          if (game.matchWinner !== null) mode = 'over';
        }
      }
    }
    if (changed) render();
    if (mode === 'over') stopLoop();
  }

  function startMatch() {
    newGame({ ai: true });
    mode = 'running';
    paused = false;
    render();
    startLoop();
  }

  // ------------------------------------------------------------------
  // Input
  // ------------------------------------------------------------------

  var KEY_DIRS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right',
  };
  var CODE_DIRS = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };

  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var dir = KEY_DIRS[e.key] || CODE_DIRS[e.code];
    if (dir) {
      e.preventDefault();
      if (mode === 'running' || mode === 'manual') game.setDirection(1, dir);
      return;
    }
    if (e.key === ' ' || e.code === 'Space' || e.key === 'Spacebar') {
      e.preventDefault();
      if (e.repeat) return;
      if (mode === 'waiting' || mode === 'over') startMatch();
      return;
    }
    if (e.key === 'p' || e.key === 'P' || e.code === 'KeyP') {
      e.preventDefault();
      if (e.repeat) return;
      if (mode === 'running') {
        paused = !paused;
        lastTime = performance.now();
        render();
      }
    }
  });

  // ------------------------------------------------------------------
  // Test hook
  // ------------------------------------------------------------------

  window.tron = {
    reset: function (options) {
      options = options || {};
      stopLoop();
      mode = 'manual';
      paused = false;
      newGame({
        width: options.width,
        height: options.height,
        obstacles: options.obstacles,
        ai: options.ai === undefined ? true : !!options.ai,
      });
      render();
    },
    setDirection: function (player, dir) {
      game.setDirection(player, dir);
    },
    step: function () {
      doStep();
      render();
    },
    state: function () {
      return game.state();
    },
    chooseMove: function (view) {
      return TG.chooseMove(view);
    },
  };

  newGame({ ai: true });
  render();
})();
