/* Pac-Man: deterministic tick engine (UMD) plus browser UI.
 * Under node: module.exports = { createGame, CLASSIC_MAZE, ... }.
 * In the browser: defines window.pacman (test hook) and runs the game. */
(function (root, factory) {
  var engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.PacmanEngine = engine;
    setupBrowser(window, document, engine);
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CLASSIC_MAZE = [
    '############################',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#o####.#####.##.#####.####o#',
    '#.####.#####.##.#####.####.#',
    '#..........................#',
    '#.####.##.########.##.####.#',
    '#.####.##.########.##.####.#',
    '#......##....##....##......#',
    '######.##### ## #####.######',
    '     #.##### ## #####.#     ',
    '     #.##    b     ##.#     ',
    '     #.## ###--### ##.#     ',
    '######.## #      # ##.######',
    '      .   #i p c #   .      ',
    '######.## #      # ##.######',
    '     #.## ######## ##.#     ',
    '     #.##          ##.#     ',
    '     #.## ######## ##.#     ',
    '######.## ######## ##.######',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#.####.#####.##.#####.####.#',
    '#o..##.......C .......##..o#',
    '###.##.##.########.##.##.###',
    '###.##.##.########.##.##.###',
    '#......##....##....##......#',
    '#.##########.##.##########.#',
    '#.##########.##.##########.#',
    '#..........................#',
    '############################'
  ];

  var ORDER = ['up', 'left', 'down', 'right'];
  var VEC = { up: [0, -1], left: [-1, 0], down: [0, 1], right: [1, 0] };
  var OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  var GHOSTS = [
    { name: 'blinky', ch: 'b', release: 0 },
    { name: 'pinky', ch: 'p', release: 0 },
    { name: 'inky', ch: 'i', release: 30 },
    { name: 'clyde', ch: 'c', release: 60 }
  ];
  // [first mode-clock value NOT in this phase, mode]
  var SCHEDULE = [[70, 'scatter'], [270, 'chase'], [340, 'scatter'], [540, 'chase'], [600, 'scatter'], [Infinity, 'chase']];
  var EAT_SCORES = [200, 400, 800, 1600];

  function scheduleMode(t) {
    for (var i = 0; i < SCHEDULE.length; i++) if (t < SCHEDULE[i][0]) return SCHEDULE[i][1];
    return 'chase';
  }
  function frightenedDuration(level) { return Math.max(10, 40 - 5 * (level - 1)); }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

  function parseMaze(rows) {
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('maze must be a non-empty list of rows');
    var H = rows.length, W = rows[0].length;
    var base = [], items = [], pac = null, starts = {}, doors = [], total = 0;
    for (var y = 0; y < H; y++) {
      var row = String(rows[y]);
      if (row.length !== W) throw new Error('maze rows must have equal length');
      base.push([]); items.push([]);
      for (var x = 0; x < W; x++) {
        var c = row[x];
        var b = ' ', it = null;
        if (c === '#') b = '#';
        else if (c === '-') { b = '-'; doors.push({ x: x, y: y }); }
        else if (c === '.' || c === 'o') { it = c; total++; }
        else if (c === 'C') { if (pac) throw new Error('maze must have exactly one C'); pac = { x: x, y: y }; }
        else if (c === 'b' || c === 'p' || c === 'i' || c === 'c') starts[c] = { x: x, y: y };
        else if (c !== ' ') throw new Error('unknown maze character ' + JSON.stringify(c));
        base[y].push(b); items[y].push(it);
      }
    }
    if (!pac) throw new Error('maze must have exactly one C');
    var m = { W: W, H: H, base: base, items: items, total: total, pacStart: pac, starts: starts,
      door: null, exit: null, house: {} };
    if (doors.length) {
      // leftmost door tile (ties: topmost)
      var d = doors[0];
      for (var k = 1; k < doors.length; k++) {
        if (doors[k].x < d.x || (doors[k].x === d.x && doors[k].y < d.y)) d = doors[k];
      }
      m.door = d;
      m.exit = { x: d.x, y: (d.y - 1 + H) % H };
      // house: flood fill from tiles directly below door tiles through non-wall non-door tiles
      var queue = [];
      doors.forEach(function (dt) {
        var sx = dt.x, sy = (dt.y + 1) % H;
        if (base[sy][sx] === ' ' && !m.house[sx + ',' + sy]) { m.house[sx + ',' + sy] = true; queue.push([sx, sy]); }
      });
      while (queue.length) {
        var t = queue.shift();
        for (var j = 0; j < 4; j++) {
          var v = VEC[ORDER[j]];
          var nx = (t[0] + v[0] + W) % W, ny = (t[1] + v[1] + H) % H;
          if (base[ny][nx] === ' ' && !m.house[nx + ',' + ny]) { m.house[nx + ',' + ny] = true; queue.push([nx, ny]); }
        }
      }
    }
    return m;
  }

  function createGame(options) {
    options = options || {};
    var maze = parseMaze(options.maze || CLASSIC_MAZE);
    var W = maze.W, H = maze.H;
    var fixedMode = (options.mode === 'scatter' || options.mode === 'chase') ? options.mode : null;
    var items, pellets;
    var s = {
      tick: 0, level: options.level != null ? options.level : 1,
      score: 0, lives: options.lives != null ? options.lives : 3,
      status: 'playing', frightened: 0, mode: 'scatter',
      levelClock: 0, modeClock: 0, chain: 0, extraLife: false
    };
    var pac = { x: 0, y: 0, dir: 'left', req: null };
    var ghosts = [];
    GHOSTS.forEach(function (g) {
      var st = maze.starts[g.ch];
      if (!st) return;
      ghosts.push({ name: g.name, release: g.release, start: st,
        inHouse: !!maze.house[st.x + ',' + st.y], x: st.x, y: st.y, dir: 'left', mode: 'house', rev: false });
    });
    var blinky = ghosts.filter(function (g) { return g.name === 'blinky'; })[0] || null;

    function restoreItems() {
      items = maze.items.map(function (r) { return r.slice(); });
      pellets = maze.total;
    }
    function resetActors() {
      s.levelClock = 0; s.modeClock = 0; s.frightened = 0;
      s.mode = fixedMode || scheduleMode(0);
      pac.x = maze.pacStart.x; pac.y = maze.pacStart.y; pac.dir = 'left'; pac.req = null;
      ghosts.forEach(function (g) {
        g.x = g.start.x; g.y = g.start.y; g.dir = 'left'; g.rev = false;
        g.mode = g.inHouse ? 'house' : s.mode;
      });
    }
    restoreItems();
    resetActors();

    function nextTile(x, y, dir) {
      var v = VEC[dir];
      return { x: (x + v[0] + W) % W, y: (y + v[1] + H) % H };
    }
    function open(t) { return maze.base[t.y][t.x] === ' '; }
    function addScore(n) {
      s.score += n;
      if (!s.extraLife && s.score >= 10000) { s.extraLife = true; s.lives += 1; }
    }
    function revival(g) { return maze.exit || g.start; }

    function target(g) {
      if (g.mode === 'eyes') return revival(g);
      var v = VEC[pac.dir], P = pac;
      if (g.mode === 'scatter') {
        switch (g.name) {
          case 'blinky': return { x: W - 3, y: -3 };
          case 'pinky': return { x: 2, y: -3 };
          case 'inky': return { x: W - 1, y: H };
          default: return { x: 0, y: H };
        }
      }
      switch (g.name) {
        case 'blinky': return { x: P.x, y: P.y };
        case 'pinky': return { x: P.x + 4 * v[0], y: P.y + 4 * v[1] };
        case 'inky':
          var ax = P.x + 2 * v[0], ay = P.y + 2 * v[1];
          if (!blinky) return { x: ax, y: ay };
          return { x: 2 * ax - blinky.x, y: 2 * ay - blinky.y };
        default:
          if (dist2(g.x, g.y, P.x, P.y) > 64) return { x: P.x, y: P.y };
          return { x: 0, y: H };
      }
    }

    function moveGhost(g) {
      if (g.mode === 'house') return;
      if (g.mode === 'leaving') {
        var dx = maze.door.x;
        g.dir = g.x !== dx ? (g.x < dx ? 'right' : 'left') : 'up';
        var t0 = nextTile(g.x, g.y, g.dir);
        g.x = t0.x; g.y = t0.y;
        if (g.x === maze.exit.x && g.y === maze.exit.y) { g.mode = s.mode; g.dir = 'left'; }
        return;
      }
      if (g.mode === 'frightened' && s.tick % 2 !== 0) return;
      var choice = null;
      if (g.rev) {
        g.rev = false;
        var back = OPP[g.dir];
        if (open(nextTile(g.x, g.y, back))) choice = back;
      }
      if (!choice) {
        var cands = ORDER.filter(function (d) { return d !== OPP[g.dir] && open(nextTile(g.x, g.y, d)); });
        if (!cands.length) {
          if (open(nextTile(g.x, g.y, OPP[g.dir]))) cands = [OPP[g.dir]];
          else return; // stays
        }
        var best = null, bestD = 0;
        if (g.mode === 'frightened') {
          cands.forEach(function (d) {
            var t = nextTile(g.x, g.y, d), dd = dist2(t.x, t.y, pac.x, pac.y);
            if (best === null || dd > bestD) { best = d; bestD = dd; }
          });
        } else {
          var tg = target(g);
          cands.forEach(function (d) {
            var t = nextTile(g.x, g.y, d), dd = dist2(t.x, t.y, tg.x, tg.y);
            if (best === null || dd < bestD) { best = d; bestD = dd; }
          });
        }
        choice = best;
      }
      g.dir = choice;
      var t1 = nextTile(g.x, g.y, choice);
      g.x = t1.x; g.y = t1.y;
      if (g.mode === 'eyes') {
        var r = revival(g);
        if (g.x === r.x && g.y === r.y) g.mode = s.mode;
      }
    }

    // returns true if Pac-Man died (rest of the tick is skipped)
    function collisions() {
      for (var i = 0; i < ghosts.length; i++) {
        var g = ghosts[i];
        if (g.x !== pac.x || g.y !== pac.y) continue;
        if (g.mode === 'eyes') continue;
        if (g.mode === 'frightened') {
          g.mode = 'eyes'; g.rev = false;
          s.chain += 1;
          addScore(EAT_SCORES[Math.min(s.chain, 4) - 1]);
          continue;
        }
        s.lives -= 1;
        if (s.lives <= 0) { s.lives = 0; s.status = 'game_over'; }
        else resetActors();
        return true;
      }
      return false;
    }

    function step() {
      if (s.status === 'game_over') return;
      if (s.status === 'level_clear') {
        s.tick += 1;
        s.level += 1;
        restoreItems();
        resetActors();
        s.status = 'playing';
        return;
      }
      // 1. clocks
      s.tick += 1; s.levelClock += 1;
      if (s.frightened > 0) {
        s.frightened -= 1;
        if (s.frightened === 0) ghosts.forEach(function (g) { if (g.mode === 'frightened') g.mode = s.mode; });
      } else {
        s.modeClock += 1;
        var m = fixedMode || scheduleMode(s.modeClock);
        if (m !== s.mode) {
          s.mode = m;
          ghosts.forEach(function (g) {
            if (g.mode === 'scatter' || g.mode === 'chase') { g.mode = m; g.rev = true; }
          });
        }
      }
      ghosts.forEach(function (g) { if (g.mode === 'house' && g.release <= s.levelClock) g.mode = 'leaving'; });
      // 2. Pac-Man moves
      if (pac.req && open(nextTile(pac.x, pac.y, pac.req))) pac.dir = pac.req;
      var n = nextTile(pac.x, pac.y, pac.dir);
      if (open(n)) { pac.x = n.x; pac.y = n.y; }
      // 3. eating
      var it = items[pac.y][pac.x];
      if (it) {
        items[pac.y][pac.x] = null; pellets -= 1;
        if (it === '.') addScore(10);
        else {
          addScore(50);
          s.frightened = frightenedDuration(s.level);
          s.chain = 0;
          ghosts.forEach(function (g) {
            if (g.mode === 'scatter' || g.mode === 'chase' || g.mode === 'frightened') { g.mode = 'frightened'; g.rev = true; }
          });
        }
        if (pellets === 0) { s.status = 'level_clear'; return; }
      }
      // 4. collisions
      if (collisions()) return;
      // 5. ghosts move
      ghosts.forEach(moveGhost);
      // 6. collisions
      collisions();
    }

    function setDirection(dir) { if (VEC.hasOwnProperty(dir)) pac.req = dir; }

    function state() {
      var g = {};
      ghosts.forEach(function (gh) { g[gh.name] = { x: gh.x, y: gh.y, dir: gh.dir, mode: gh.mode }; });
      var rows = [];
      for (var y = 0; y < H; y++) {
        var r = '';
        for (var x = 0; x < W; x++) r += items[y][x] || maze.base[y][x];
        rows.push(r);
      }
      return {
        tick: s.tick, level: s.level, score: s.score, lives: s.lives, status: s.status,
        pellets: pellets, frightened: s.frightened, mode: s.mode,
        pacman: { x: pac.x, y: pac.y, dir: pac.dir },
        ghosts: g, maze: rows
      };
    }

    return { step: step, setDirection: setDirection, state: state, width: W, height: H,
      exitTile: maze.exit ? { x: maze.exit.x, y: maze.exit.y } : null,
      isHouse: function (x, y) { return !!maze.house[x + ',' + y]; } };
  }

  return { createGame: createGame, parseMaze: parseMaze, CLASSIC_MAZE: CLASSIC_MAZE,
    scheduleMode: scheduleMode, frightenedDuration: frightenedDuration };
});

function setupBrowser(window, document, engine) {
  'use strict';
  var COLORS = {
    bg: '#000000', wall: '#2121ff', door: '#ff80c0', pac: '#ffff00', pellet: '#ffb8ae',
    blinky: '#ff0000', pinky: '#ffb8ff', inky: '#00ffff', clyde: '#ffb852',
    frightened: '#3030c8', eye: '#ffffff', pupil: '#1a1aa0'
  };
  var TICK_MS = 100, CLEAR_PAUSE_TICKS = 10;
  var game = engine.createGame();
  var waiting = true, manual = false, paused = false, clearWait = 0, timer = null;
  var canvas, ctx, elScore, elLives, elMsg, tile = 20;

  function stopLoop() { if (timer) { clearInterval(timer); timer = null; } }
  function startLoop() {
    stopLoop();
    timer = setInterval(function () {
      if (paused || manual) return;
      var st = game.state();
      if (st.status === 'game_over') { stopLoop(); render(); return; }
      if (st.status === 'level_clear') {
        clearWait += 1;
        if (clearWait < CLEAR_PAUSE_TICKS) { render(); return; }
        clearWait = 0;
      }
      game.step();
      if (game.state().status === 'game_over') stopLoop();
      render();
    }, TICK_MS);
  }
  function newRealtimeGame() {
    game = engine.createGame();
    waiting = false; manual = false; paused = false; clearWait = 0;
    sizeCanvas(); startLoop(); render();
  }

  window.pacman = {
    reset: function (opts) {
      stopLoop();
      manual = true; waiting = false; paused = false; clearWait = 0;
      game = engine.createGame(opts || {});
      sizeCanvas(); render();
    },
    setDirection: function (dir) { game.setDirection(dir); },
    step: function () { game.step(); render(); },
    state: function () { return game.state(); }
  };

  var KEYS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', W: 'up', a: 'left', A: 'left', s: 'down', S: 'down', d: 'right', D: 'right'
  };
  function onKey(e) {
    var dir = KEYS[e.key];
    if (dir) { e.preventDefault(); game.setDirection(dir); return; }
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (waiting || game.state().status === 'game_over') newRealtimeGame();
      return;
    }
    if (e.key === 'p' || e.key === 'P') {
      if (waiting || manual || game.state().status === 'game_over') return;
      paused = !paused; render();
    }
  }

  function sizeCanvas() {
    if (!canvas) return;
    var W = game.width, H = game.height;
    tile = Math.max(16, Math.min(20, Math.floor(980 / W), Math.floor(640 / H)));
    canvas.width = W * tile; canvas.height = H * tile;
  }

  function message(st) {
    if (waiting) return 'Press Space to start';
    if (st.status === 'game_over') return 'Game over — press Space to play again';
    if (paused) return 'Paused — press P to resume';
    if (st.status === 'level_clear') return 'Level ' + st.level + ' clear!';
    return '';
  }

  function drawGhost(g, name, t) {
    var cx = (g.x + 0.5) * t, cy = (g.y + 0.5) * t, r = t * 0.45;
    if (g.mode !== 'eyes') {
      ctx.fillStyle = g.mode === 'frightened' ? COLORS.frightened : COLORS[name];
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.15, r, Math.PI, 0);
      var bottom = cy + r, left = cx - r, w = 2 * r;
      ctx.lineTo(cx + r, bottom);
      for (var i = 3; i >= 0; i--) ctx.lineTo(left + w * i / 4 + w / 8, bottom - (i % 2 === 0 ? r * 0.25 : 0) - r * 0.0);
      ctx.lineTo(left, bottom);
      ctx.closePath();
      ctx.fill();
    }
    var v = { up: [0, -1], left: [-1, 0], down: [0, 1], right: [1, 0] }[g.dir] || [0, 0];
    var er = g.mode === 'eyes' ? r * 0.38 : r * 0.3;
    [-1, 1].forEach(function (side) {
      var ex = cx + side * r * 0.4, ey = cy - r * 0.2;
      ctx.fillStyle = g.mode === 'frightened' ? '#ffb8ae' : COLORS.eye;
      ctx.beginPath(); ctx.arc(ex, ey, g.mode === 'frightened' ? er * 0.45 : er, 0, Math.PI * 2); ctx.fill();
      if (g.mode !== 'frightened') {
        ctx.fillStyle = COLORS.pupil;
        ctx.beginPath(); ctx.arc(ex + v[0] * er * 0.45, ey + v[1] * er * 0.45, er * 0.45, 0, Math.PI * 2); ctx.fill();
      }
    });
  }

  function render() {
    var st = game.state();
    if (elScore) elScore.textContent = String(st.score);
    if (elLives) elLives.textContent = String(st.lives);
    if (elMsg) {
      var m = message(st);
      elMsg.textContent = m;
      
    }
    if (!ctx) return;
    var t = tile;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (var y = 0; y < st.maze.length; y++) {
      var row = st.maze[y];
      for (var x = 0; x < row.length; x++) {
        var c = row[x];
        if (c === '#') {
          ctx.fillStyle = COLORS.wall;
          ctx.fillRect(x * t, y * t, t, t);
        } else if (c === '-') {
          ctx.fillStyle = COLORS.door;
          ctx.fillRect(x * t, y * t + t * 0.4, t, t * 0.2);
        } else if (c === '.') {
          ctx.fillStyle = COLORS.pellet;
          ctx.beginPath(); ctx.arc((x + 0.5) * t, (y + 0.5) * t, Math.max(2, t * 0.12), 0, Math.PI * 2); ctx.fill();
        } else if (c === 'o') {
          ctx.fillStyle = COLORS.pellet;
          ctx.beginPath(); ctx.arc((x + 0.5) * t, (y + 0.5) * t, t * 0.38, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    // Pac-Man
    var p = st.pacman;
    var ang = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[p.dir];
    var mouth = (st.tick % 2 === 0 ? 0.22 : 0.08) * Math.PI;
    ctx.fillStyle = COLORS.pac;
    ctx.beginPath();
    ctx.moveTo((p.x + 0.5) * t, (p.y + 0.5) * t);
    ctx.arc((p.x + 0.5) * t, (p.y + 0.5) * t, t * 0.46, ang + mouth, ang + 2 * Math.PI - mouth);
    ctx.closePath(); ctx.fill();
    // ghosts (draw Clyde first so Blinky ends on top)
    ['clyde', 'inky', 'pinky', 'blinky'].forEach(function (n) { if (st.ghosts[n]) drawGhost(st.ghosts[n], n, t); });
  }

  function init() {
    canvas = document.getElementById('game');
    ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    elScore = document.getElementById('score');
    elLives = document.getElementById('lives');
    elMsg = document.getElementById('message');
    sizeCanvas();
    render();
    document.addEventListener('keydown', onKey);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}
