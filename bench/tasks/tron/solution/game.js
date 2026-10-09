/* Light Cycles: game rules and computer player.
 * Plain script usable both in the browser (exposes window.TronGame) and in
 * Node via require('./game.js') (CommonJS export). No dependencies. */
(function (root) {
  'use strict';

  var DIRS = ['up', 'right', 'down', 'left'];
  var DX = [0, 1, 0, -1];
  var DY = [-1, 0, 1, 0];
  var DIR_INDEX = { up: 0, right: 1, down: 2, left: 3 };
  var REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };
  var ROUNDS_TO_WIN = 3;

  var EMPTY = 0, OBSTACLE = 3; // 1 and 2 are the players' trails
  var CELL_CHARS = ['.', '1', '2', '#'];

  function isDir(d) { return typeof d === 'string' && DIR_INDEX.hasOwnProperty(d); }

  // ---------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------

  function Game(options) {
    options = options || {};
    var w = options.width == null ? 64 : Math.floor(Number(options.width));
    var h = options.height == null ? 48 : Math.floor(Number(options.height));
    if (!(w > 0)) w = 64;
    if (!(h > 0)) h = 48;
    this.width = w;
    this.height = h;
    this.ai = options.ai === undefined ? true : !!options.ai;
    this.chooseMove = options.chooseMove || chooseMove;
    this.obstacles = new Uint8Array(w * h);
    var obs = options.obstacles || [];
    for (var i = 0; i < obs.length; i++) {
      var c = obs[i];
      if (!c) continue;
      var x = Math.floor(Number(c[0])), y = Math.floor(Number(c[1]));
      if (x >= 0 && x < w && y >= 0 && y < h) this.obstacles[y * w + x] = 1;
    }
    this.cells = new Uint8Array(w * h);
    this.players = [
      { x: 0, y: 0, dir: 'right', alive: true, score: 0, pending: null },
      { x: 0, y: 0, dir: 'left', alive: true, score: 0, pending: null },
    ];
    this.round = 1;
    this.tick = 0;
    this.roundOver = false;
    this.roundWinner = null;
    this.matchWinner = null;
    this._startRound();
  }

  Game.prototype.startPositions = function () {
    var w = this.width, h = this.height;
    return [
      { x: Math.floor(w / 4), y: Math.floor(h / 2), dir: 'right' },
      { x: w - 1 - Math.floor(w / 4), y: Math.floor(h / 2), dir: 'left' },
    ];
  };

  Game.prototype._startRound = function () {
    var n = this.width * this.height;
    for (var i = 0; i < n; i++) this.cells[i] = this.obstacles[i] ? OBSTACLE : EMPTY;
    var starts = this.startPositions();
    for (var p = 0; p < 2; p++) {
      var pl = this.players[p];
      pl.x = starts[p].x;
      pl.y = starts[p].y;
      pl.dir = starts[p].dir;
      pl.alive = true;
      pl.pending = null;
      pl.crashCell = null;
      this.cells[pl.y * this.width + pl.x] = p + 1;
    }
    this.tick = 0;
    this.roundOver = false;
    this.roundWinner = null;
  };

  // A steering request, exactly like a key press. Returns true if accepted.
  Game.prototype.setDirection = function (player, dir) {
    var p = Number(player);
    if (p !== 1 && p !== 2) return false;
    if (!isDir(dir)) return false;
    var pl = this.players[p - 1];
    if (REVERSE[pl.dir] === dir) return false; // reversal of current direction: ignored
    pl.pending = dir;
    return true;
  };

  Game.prototype.isFree = function (x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return this.cells[y * this.width + x] === EMPTY;
  };

  Game.prototype.gridStrings = function () {
    var rows = [], w = this.width;
    for (var y = 0; y < this.height; y++) {
      var s = '';
      for (var x = 0; x < w; x++) s += CELL_CHARS[this.cells[y * w + x]];
      rows.push(s);
    }
    return rows;
  };

  // The view handed to chooseMove for player p (1 or 2).
  Game.prototype.view = function (p) {
    var me = this.players[p - 1], op = this.players[2 - p];
    return {
      width: this.width,
      height: this.height,
      grid: this.gridStrings(),
      me: { x: me.x, y: me.y, dir: me.dir },
      opponent: { x: op.x, y: op.y, dir: op.dir },
    };
  };

  // One tick. Returns a string describing what happened:
  // 'none' (match over), 'newRound', 'move', or 'roundEnd'.
  Game.prototype.step = function () {
    if (this.matchWinner !== null) return 'none';
    if (this.roundOver) {
      this.round += 1;
      this._startRound();
      return 'newRound';
    }
    if (this.ai) {
      var req = this.chooseMove(this.view(2));
      this.setDirection(2, req);
    }
    var w = this.width, h = this.height;
    var targets = [], crashed = [false, false];
    for (var p = 0; p < 2; p++) {
      var pl = this.players[p];
      var dir = pl.pending || pl.dir;
      var d = DIR_INDEX[dir];
      var nx = pl.x + DX[d], ny = pl.y + DY[d];
      targets.push({ x: nx, y: ny, dir: dir });
      // Trails as they were before this tick (includes both heads).
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || this.cells[ny * w + nx] !== EMPTY) crashed[p] = true;
    }
    if (targets[0].x === targets[1].x && targets[0].y === targets[1].y) {
      crashed[0] = true;
      crashed[1] = true;
    }
    for (p = 0; p < 2; p++) {
      pl = this.players[p];
      pl.pending = null;
      if (crashed[p]) {
        pl.crashCell = { x: targets[p].x, y: targets[p].y };
        pl.alive = false; // stays on its last cell; direction is the one it last moved in
      } else {
        pl.x = targets[p].x;
        pl.y = targets[p].y;
        pl.dir = targets[p].dir;
        this.cells[pl.y * w + pl.x] = p + 1;
      }
    }
    this.tick += 1;
    if (crashed[0] || crashed[1]) {
      this.roundOver = true;
      if (crashed[0] && crashed[1]) {
        this.roundWinner = 0;
      } else {
        var winner = crashed[0] ? 2 : 1;
        this.roundWinner = winner;
        this.players[winner - 1].score += 1;
        if (this.players[winner - 1].score >= ROUNDS_TO_WIN) this.matchWinner = winner;
      }
      return 'roundEnd';
    }
    return 'move';
  };

  Game.prototype.state = function () {
    return {
      width: this.width,
      height: this.height,
      tick: this.tick,
      round: this.round,
      players: this.players.map(function (pl) {
        return { x: pl.x, y: pl.y, dir: pl.dir, alive: pl.alive, score: pl.score };
      }),
      grid: this.gridStrings(),
      roundOver: this.roundOver,
      roundWinner: this.roundWinner,
      matchWinner: this.matchWinner,
    };
  };

  // ---------------------------------------------------------------------
  // Computer player
  // ---------------------------------------------------------------------

  var now = (typeof performance !== 'undefined' && performance.now)
    ? function () { return performance.now(); }
    : function () { return Date.now(); };

  var TIME_BUDGET_MS = 7;
  var WIN = 1e6, LOSS = -1e6, DRAW = -2;

  // Search context: padded grid (one wall cell around the arena), so
  // neighbour lookups need no bounds checks.
  var ctx = {
    size: 0, W2: 0, blocked: null, off: null,
    distA: null, distB: null, queue: null, stamp: null, gen: 0,
    deadline: 0, nodes: 0, colour: null,
  };

  function ensureCtx(w, h) {
    var W2 = w + 2, size = W2 * (h + 2);
    if (ctx.size !== size || ctx.W2 !== W2) {
      ctx.size = size;
      ctx.W2 = W2;
      ctx.blocked = new Uint8Array(size);
      ctx.distA = new Int32Array(size);
      ctx.distB = new Int32Array(size);
      ctx.queue = new Int32Array(size);
      ctx.queueB = new Int32Array(size);
      ctx.stamp = new Int32Array(size);
      ctx.stampB = new Int32Array(size);
      ctx.gen = 0;
      ctx.colour = new Uint8Array(size);
      for (var y = 0; y < h + 2; y++) for (var x = 0; x < W2; x++) ctx.colour[y * W2 + x] = (x + y) & 1;
    }
    ctx.off = [-W2, 1, W2, -1];
  }

  function nextGen() {
    ctx.gen++;
    if (ctx.gen > 0x3fffffff) {
      ctx.stamp.fill(0);
      ctx.stampB.fill(0);
      ctx.gen = 1;
    }
    return ctx.gen;
  }

  // BFS distances from start into dist (valid where stampArr[i] === gen).
  function bfs(start, dist, stampArr, gen, q) {
    var blocked = ctx.blocked, off = ctx.off;
    var head = 0, tail = 0;
    stampArr[start] = gen;
    dist[start] = 0;
    q[tail++] = start;
    while (head < tail) {
      var c = q[head++], dc = dist[c] + 1;
      for (var k = 0; k < 4; k++) {
        var n = c + off[k];
        if (blocked[n] || stampArr[n] === gen) continue;
        stampArr[n] = gen;
        dist[n] = dc;
        q[tail++] = n;
      }
    }
    return tail;
  }

  // Voronoi evaluation: cells I reach strictly first minus cells the opponent
  // reaches strictly first (heads are blocked; BFS walks out from them).
  // Edges (free neighbour counts) of owned cells are a small tie-breaker.
  function voronoi(me, op) {
    var gen = nextGen();
    var stampA = ctx.stamp, stampB = ctx.stampB, dA = ctx.distA, dB = ctx.distB;
    var qA = ctx.queue, qB = ctx.queueB;
    var nA = bfs(me, dA, stampA, gen, qA);
    var nB = bfs(op, dB, stampB, gen, qB);
    var off = ctx.off, blocked = ctx.blocked;
    var mine = 0, theirs = 0, edgesMine = 0, edgesTheirs = 0, i, c, k;
    for (i = 1; i < nA; i++) {
      c = qA[i];
      if (stampB[c] !== gen || dA[c] < dB[c]) {
        mine++;
        for (k = 0; k < 4; k++) if (!blocked[c + off[k]]) edgesMine++;
      }
    }
    for (i = 1; i < nB; i++) {
      c = qB[i];
      if (stampA[c] !== gen || dB[c] < dA[c]) {
        theirs++;
        for (k = 0; k < 4; k++) if (!blocked[c + off[k]]) edgesTheirs++;
      }
    }
    return (mine - theirs) * 4 + (edgesMine - edgesTheirs);
  }

  function safeMoves(pos, dir, out) {
    var blocked = ctx.blocked, off = ctx.off, n = 0;
    var rev = dir >= 0 ? (dir + 2) & 3 : -1;
    for (var k = 0; k < 4; k++) {
      if (k === rev) continue;
      if (!blocked[pos + off[k]]) out[n++] = k;
    }
    return n;
  }

  // Simultaneous-move minimax (I pick, opponent answers knowing my pick),
  // alpha-beta pruned, Voronoi at the leaves. Sets ctx.aborted on timeout;
  // results computed after an abort are discarded by the caller.
  var MAX_PLY = 128;
  var moveBuf = new Int8Array(MAX_PLY * 8);

  function search(me, md, op, od, depth, ply, alpha, beta) {
    if (ctx.aborted || ((++ctx.nodes & 3) === 0 && now() > ctx.deadline)) { ctx.aborted = true; return 0; }
    if (depth === 0) return voronoi(me, op);
    var off = ctx.off, blocked = ctx.blocked;
    var mb = ply * 8, ob = mb + 4;
    var nm = 0, no = 0, k, rev;
    rev = (md + 2) & 3;
    for (k = 0; k < 4; k++) if (k !== rev && !blocked[me + off[k]]) moveBuf[mb + nm++] = k;
    rev = (od + 2) & 3;
    for (k = 0; k < 4; k++) if (k !== rev && !blocked[op + off[k]]) moveBuf[ob + no++] = k;
    if (nm === 0 && no === 0) return DRAW;
    if (nm === 0) return LOSS + ply;
    if (no === 0) return WIN - ply;
    var best = -Infinity;
    for (var i = 0; i < nm; i++) {
      var a = moveBuf[mb + i], ca = me + off[a];
      var worst = Infinity;
      var lo = alpha > best ? alpha : best;
      for (var j = 0; j < no; j++) {
        var b = moveBuf[ob + j], cb = op + off[b], v;
        if (ca === cb) {
          v = DRAW;
        } else {
          blocked[ca] = 1;
          blocked[cb] = 1;
          v = search(ca, a, cb, b, depth - 1, ply + 1, lo, worst < beta ? worst : beta);
          blocked[ca] = 0;
          blocked[cb] = 0;
          if (ctx.aborted) return 0;
        }
        if (v < worst) worst = v;
        if (worst <= lo) break;
      }
      if (worst > best) best = worst;
      if (best >= beta) break;
    }
    return best;
  }

  // Upper bound on the length of a path from head through its region,
  // using checkerboard parity.
  function fillEstimate(head) {
    var gen = nextGen();
    var stampArr = ctx.stamp, blocked = ctx.blocked, off = ctx.off, q = ctx.queue, col = ctx.colour;
    var h = 0, t = 0, same = 0, other = 0, hc = col[head];
    stampArr[head] = gen;
    q[t++] = head;
    while (h < t) {
      var c = q[h++];
      for (var k = 0; k < 4; k++) {
        var n = c + off[k];
        if (blocked[n] || stampArr[n] === gen) continue;
        stampArr[n] = gen;
        q[t++] = n;
        if (col[n] === hc) same++; else other++;
      }
    }
    // Path from head alternates colours starting with "other".
    return other > same ? 2 * same + 1 : 2 * other;
  }

  function longest(pos, depth) {
    if (ctx.aborted || ((++ctx.nodes & 3) === 0 && now() > ctx.deadline)) { ctx.aborted = true; return 0; }
    if (depth === 0) return fillEstimate(pos);
    var blocked = ctx.blocked, off = ctx.off, best = 0;
    for (var k = 0; k < 4; k++) {
      var n = pos + off[k];
      if (blocked[n]) continue;
      blocked[n] = 1;
      var v = 1 + longest(n, depth - 1);
      blocked[n] = 0;
      if (ctx.aborted) return 0;
      if (v > best) best = v;
    }
    return best;
  }

  function freeNeighbours(pos) {
    var c = 0, off = ctx.off, blocked = ctx.blocked;
    for (var k = 0; k < 4; k++) if (!blocked[pos + off[k]]) c++;
    return c;
  }

  function reachable(from, target) {
    // Is any free neighbour of target reachable from a free neighbour of from?
    var gen = nextGen();
    var stampArr = ctx.stamp, blocked = ctx.blocked, off = ctx.off, q = ctx.queue;
    var h = 0, t = 0;
    stampArr[from] = gen;
    q[t++] = from;
    while (h < t) {
      var c = q[h++];
      for (var k = 0; k < 4; k++) {
        var n = c + off[k];
        if (n === target) return true;
        if (blocked[n] || stampArr[n] === gen) continue;
        stampArr[n] = gen;
        q[t++] = n;
      }
    }
    return false;
  }

  function chooseMove(view) {
    var start = now();
    var w = view.width | 0, h = view.height | 0;
    var meDir = DIR_INDEX.hasOwnProperty(view.me.dir) ? DIR_INDEX[view.me.dir] : -1;
    var opDir = view.opponent && DIR_INDEX.hasOwnProperty(view.opponent.dir) ? DIR_INDEX[view.opponent.dir] : -1;
    var fallback = meDir >= 0 ? DIRS[meDir] : 'up';
    if (!(w > 0 && h > 0) || !view.grid) return fallback;
    ensureCtx(w, h);
    var W2 = ctx.W2, blocked = ctx.blocked, off = ctx.off;
    blocked.fill(1);
    for (var y = 0; y < h; y++) {
      var row = view.grid[y] || '';
      var base = (y + 1) * W2 + 1;
      for (var x = 0; x < w; x++) blocked[base + x] = row.charAt(x) === '.' ? 0 : 1;
    }
    var me = (view.me.y + 1) * W2 + view.me.x + 1;
    var op = view.opponent ? (view.opponent.y + 1) * W2 + view.opponent.x + 1 : -1;
    if (me >= 0 && me < ctx.size) blocked[me] = 1;
    if (op >= 0 && op < ctx.size) blocked[op] = 1;

    var moves = [0, 0, 0, 0];
    var nm = safeMoves(me, meDir, moves);
    if (nm === 0) return fallback; // every move crashes
    if (nm === 1) return DIRS[moves[0]];

    ctx.deadline = start + TIME_BUDGET_MS;
    ctx.nodes = 0;
    ctx.aborted = false;
    var cand = [];
    for (var i = 0; i < nm; i++) cand.push({ d: moves[i], score: 0, tie: -freeNeighbours(me + off[moves[i]]) });
    cand.sort(byScore);
    var bestMove = cand[0].d;
    var depth, results = [0, 0, 0, 0];

    if (op >= 0 && reachable(me, op)) {
      // Opponent reachable: iterative-deepening minimax with Voronoi leaves.
      var opM = [0, 0, 0, 0], no = safeMoves(op, opDir, opM);
      for (depth = 1; depth < MAX_PLY - 2; depth++) {
        var bestVal = -Infinity;
        for (i = 0; i < cand.length && !ctx.aborted; i++) {
          var a = cand[i].d, ca = me + off[a], worst = no === 0 ? WIN : Infinity;
          for (var j = 0; j < no; j++) {
            var cb = op + off[opM[j]], v;
            if (ca === cb) v = DRAW;
            else {
              blocked[ca] = 1; blocked[cb] = 1;
              v = search(ca, a, cb, opM[j], depth - 1, 1, bestVal, worst);
              blocked[ca] = 0; blocked[cb] = 0;
              if (ctx.aborted) break;
            }
            if (v < worst) worst = v;
            if (worst <= bestVal) break;
          }
          results[i] = worst;
          if (worst > bestVal) bestVal = worst;
        }
        if (ctx.aborted) break; // keep the last completed depth's ordering
        for (i = 0; i < cand.length; i++) cand[i].score = results[i];
        cand.sort(byScore);
        bestMove = cand[0].d;
        if (bestVal >= WIN - 1000) break; // forced win found
        if (now() - start > TIME_BUDGET_MS / 3) break; // next depth would not finish
      }
    } else {
      // Separated: fill own region for as long as possible, hugging walls.
      var region = fillEstimate(me);
      for (depth = 0; depth <= region && depth < 200; depth++) {
        for (i = 0; i < cand.length && !ctx.aborted; i++) {
          var c = me + off[cand[i].d];
          blocked[c] = 1;
          results[i] = 1 + longest(c, depth);
          blocked[c] = 0;
        }
        if (ctx.aborted) break;
        for (i = 0; i < cand.length; i++) cand[i].score = results[i];
        cand.sort(byScore);
        bestMove = cand[0].d;
        if (now() - start > TIME_BUDGET_MS / 3) break;
      }
    }
    return DIRS[bestMove];
  }

  function byScore(p, q) { return q.score - p.score || q.tie - p.tie; }

  var api = {
    Game: Game,
    chooseMove: chooseMove,
    DIRS: DIRS,
    REVERSE: REVERSE,
    ROUNDS_TO_WIN: ROUNDS_TO_WIN,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TronGame = api;
})(typeof window !== 'undefined' ? window : this);
