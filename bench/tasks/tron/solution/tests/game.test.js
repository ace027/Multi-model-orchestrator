'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { Game, chooseMove, REVERSE } = require(path.join(__dirname, '..', 'game.js'));

const DX = { up: 0, down: 0, left: -1, right: 1 };
const DY = { up: -1, down: 1, left: 0, right: 0 };

function manual(opts) {
  return new Game(Object.assign({ ai: false }, opts));
}

test('initial state on 64x48', () => {
  const g = manual();
  const s = g.state();
  assert.equal(s.width, 64);
  assert.equal(s.height, 48);
  assert.equal(s.tick, 0);
  assert.equal(s.round, 1);
  assert.deepEqual(s.players[0], { x: 16, y: 24, dir: 'right', alive: true, score: 0 });
  assert.deepEqual(s.players[1], { x: 47, y: 24, dir: 'left', alive: true, score: 0 });
  assert.equal(s.grid.length, 48);
  assert.equal(s.grid[0].length, 64);
  assert.equal(s.grid[24][16], '1');
  assert.equal(s.grid[24][47], '2');
  assert.equal(s.roundOver, false);
  assert.equal(s.roundWinner, null);
  assert.equal(s.matchWinner, null);
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(s))), JSON.stringify(s));
});

test('custom size, obstacles appear as #', () => {
  const g = manual({ width: 20, height: 10, obstacles: [[0, 0], [19, 9]] });
  const s = g.state();
  assert.equal(s.players[0].x, 5);
  assert.equal(s.players[0].y, 5);
  assert.equal(s.players[1].x, 14);
  assert.equal(s.grid[0][0], '#');
  assert.equal(s.grid[9][19], '#');
});

test('moving leaves a trail and counts ticks', () => {
  const g = manual();
  g.step();
  const s = g.state();
  assert.equal(s.tick, 1);
  assert.deepEqual([s.players[0].x, s.players[0].y], [17, 24]);
  assert.deepEqual([s.players[1].x, s.players[1].y], [46, 24]);
  assert.equal(s.grid[24].slice(16, 18), '11');
  assert.equal(s.grid[24].slice(46, 48), '22');
});

test('reversal is ignored; last non-ignored request wins', () => {
  const g = manual();
  g.setDirection(1, 'left'); // reverse: ignored
  g.step();
  assert.equal(g.state().players[0].dir, 'right');
  g.setDirection(1, 'up');
  g.setDirection(1, 'left'); // reverse of current (right): ignored, 'up' stays
  g.step();
  let p = g.state().players[0];
  assert.equal(p.dir, 'up');
  assert.deepEqual([p.x, p.y], [17, 23]);
  // reversal is judged against the current direction, not a pending request
  g.setDirection(1, 'left');
  g.setDirection(1, 'down'); // reverse of current 'up': ignored
  g.step();
  p = g.state().players[0];
  assert.equal(p.dir, 'left');
  assert.deepEqual([p.x, p.y], [16, 23]);
  // invalid values are ignored
  g.setDirection(1, 'sideways');
  g.setDirection(3, 'up');
  g.step();
  assert.equal(g.state().players[0].dir, 'left');
});

test('a request applies only to the next tick', () => {
  const g = manual();
  g.setDirection(2, 'up');
  g.step();
  g.step();
  const p = g.state().players[1];
  assert.deepEqual([p.x, p.y, p.dir], [47, 22, 'up']);
});

test('wall crash: crashed cycle stays, opponent scores', () => {
  const g = manual({ width: 12, height: 6 });
  // P1 at (3,3) heading right; steer up into the top wall.
  g.setDirection(1, 'up');
  g.step(); g.step(); g.step();
  let s = g.state();
  assert.equal(s.players[0].y, 0);
  assert.equal(s.roundOver, false);
  g.step();
  s = g.state();
  assert.equal(s.players[0].alive, false);
  assert.deepEqual([s.players[0].x, s.players[0].y], [3, 0]);
  assert.equal(s.players[1].alive, true);
  assert.equal(s.roundOver, true);
  assert.equal(s.roundWinner, 2);
  assert.equal(s.players[1].score, 1);
  assert.equal(s.tick, 4);
});

test('both into the same cell: draw, nobody scores, cell not trail', () => {
  const g = manual({ width: 9, height: 3 });
  // P1 (2,1) right, P2 (6,1) left; after one tick (3,1) and (5,1); both enter (4,1).
  g.step();
  g.step();
  const s = g.state();
  assert.equal(s.players[0].alive, false);
  assert.equal(s.players[1].alive, false);
  assert.equal(s.roundWinner, 0);
  assert.equal(s.players[0].score + s.players[1].score, 0);
  assert.equal(s.grid[1][4], '.');
  assert.deepEqual([s.players[0].x, s.players[1].x], [3, 5]);
});

test('swapping heads: both crash (old heads are trail)', () => {
  const g = manual({ width: 8, height: 3 });
  // P1 at (2,1), P2 at (5,1). After one tick: (3,1) and (4,1) adjacent, then they swap.
  g.step();
  g.step();
  const s = g.state();
  assert.equal(s.roundWinner, 0);
  assert.equal(s.players[0].alive, false);
  assert.equal(s.players[1].alive, false);
});

test('running into the opponent trail is a crash', () => {
  const g = manual({ width: 20, height: 10 });
  // P2 leaves (14,5) going up, then zigzags up-right; P1 runs along row 5 into (14,5).
  const zig = ['up', 'right', 'up', 'right', 'up', 'right', 'up', 'right'];
  for (const d of zig) { g.setDirection(2, d); g.step(); }
  let s = g.state();
  assert.deepEqual([s.players[0].x, s.players[1].x, s.players[1].y], [13, 18, 1]);
  assert.equal(s.roundOver, false);
  g.setDirection(2, 'up');
  g.step();
  s = g.state();
  assert.equal(s.players[0].alive, false);
  assert.deepEqual([s.players[0].x, s.players[0].y], [13, 5]);
  assert.deepEqual([s.players[1].x, s.players[1].y], [18, 0]);
  assert.equal(s.roundWinner, 1 + 1);
  assert.equal(s.tick, 9);
});

test('obstacle crash', () => {
  const g = manual({ width: 20, height: 10, obstacles: [[6, 5]] });
  g.step();
  const s = g.state();
  assert.equal(s.players[0].alive, false);
  assert.deepEqual([s.players[0].x, s.players[0].y], [5, 5]);
  assert.equal(s.roundWinner, 2);
});

test('next tick starts the next round; scores carry; obstacles stay', () => {
  const g = manual({ width: 20, height: 10, obstacles: [[6, 5], [0, 0]] });
  g.setDirection(2, 'up');
  g.step();
  let s = g.state();
  assert.equal(s.roundOver, true);
  g.setDirection(1, 'up');
  g.step();
  s = g.state();
  assert.equal(s.round, 2);
  assert.equal(s.tick, 0);
  assert.equal(s.roundOver, false);
  assert.equal(s.roundWinner, null);
  assert.equal(s.players[1].score, 1);
  assert.deepEqual(s.players[0], { x: 5, y: 5, dir: 'right', alive: true, score: 0 });
  assert.deepEqual(s.players[1], { x: 14, y: 5, dir: 'left', alive: true, score: 1 });
  assert.equal(s.grid[0][0], '#');
  assert.equal(s.grid[5][6], '#');
  assert.equal(s.grid.join('').replace(/[#.]/g, ''), '12');
});

test('first to 3 round wins takes the match; then ticks do nothing', () => {
  const g = manual({ width: 20, height: 10, obstacles: [[6, 5]] });
  for (let r = 1; r <= 3; r++) {
    assert.equal(g.state().round, r);
    g.step(); // P1 hits obstacle
    assert.equal(g.state().roundWinner, 2);
    if (r < 3) g.step();
  }
  let s = g.state();
  assert.equal(s.matchWinner, 2);
  assert.equal(s.players[1].score, 3);
  const before = JSON.stringify(s);
  g.step(); g.step();
  assert.equal(JSON.stringify(g.state()), before);
});

test('ai mode: player 2 is steered by chooseMove before the move', () => {
  const g = new Game({ width: 20, height: 10, ai: true, obstacles: [[13, 5]] });
  g.step();
  const s = g.state();
  assert.equal(s.players[1].alive, true);
  assert.notEqual(s.players[1].dir, 'left');
});

function randomView(seed, w, h, density) {
  let st = seed >>> 0;
  const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 4294967296);
  const rows = [];
  for (let y = 0; y < h; y++) {
    let r = '';
    for (let x = 0; x < w; x++) r += rnd() < density ? '#' : '.';
    rows.push(r);
  }
  const put = (x, y, c) => { rows[y] = rows[y].slice(0, x) + c + rows[y].slice(x + 1); };
  const dirs = ['up', 'down', 'left', 'right'];
  const me = { x: Math.floor(rnd() * w), y: Math.floor(rnd() * h), dir: dirs[Math.floor(rnd() * 4)] };
  let op;
  do { op = { x: Math.floor(rnd() * w), y: Math.floor(rnd() * h), dir: dirs[Math.floor(rnd() * 4)] }; }
  while (op.x === me.x && op.y === me.y);
  put(me.x, me.y, '1');
  put(op.x, op.y, '2');
  return { width: w, height: h, grid: rows, me, opponent: op };
}

function isFree(v, x, y) {
  return x >= 0 && y >= 0 && x < v.width && y < v.height && v.grid[y][x] === '.';
}

test('chooseMove never reverses and avoids blocked cells when a safe move exists', () => {
  for (let i = 0; i < 300; i++) {
    const v = randomView(i + 1, 30, 20, (i % 5) * 0.12);
    const m = chooseMove(v);
    assert.ok(['up', 'down', 'left', 'right'].includes(m));
    assert.notEqual(m, REVERSE[v.me.dir], `reversal in case ${i}`);
    const safe = ['up', 'down', 'left', 'right'].filter(
      (d) => d !== REVERSE[v.me.dir] && isFree(v, v.me.x + DX[d], v.me.y + DY[d]));
    if (safe.length) assert.ok(safe.includes(m), `unsafe move in case ${i}`);
  }
});

test('chooseMove stays under 20 ms on 64x48', () => {
  let worst = 0;
  for (let i = 0; i < 40; i++) {
    const v = randomView(1000 + i, 64, 48, (i % 4) * 0.05);
    const t0 = performance.now();
    chooseMove(v);
    worst = Math.max(worst, performance.now() - t0);
  }
  const g = new Game({ ai: false });
  const t0 = performance.now();
  chooseMove(g.view(2));
  worst = Math.max(worst, performance.now() - t0);
  assert.ok(worst < 20, `worst ${worst.toFixed(2)} ms`);
});

test('chooseMove works for either player and avoids a dead end', () => {
  // Me at (1,1) heading right in a corridor; going down leads into a 1-cell pocket.
  const grid = [
    '##########',
    '#........#',
    '#.########',
    '#.#......#',
    '###......#',
    '##########',
  ];
  const v = {
    width: 10, height: 6,
    grid: grid.map((r, y) => (y === 1 ? '#1' + r.slice(2) : r)),
    me: { x: 1, y: 1, dir: 'up' },
    opponent: { x: 8, y: 4, dir: 'up' },
  };
  v.grid[4] = '###.....2#';
  // From (1,1): right leads along row 1 (7 cells, dead end); down leads to (1,2),(1,3) then stuck.
  assert.equal(chooseMove(v), 'right');
});

test('chooseMove avoids a head-on collision when it has more room', () => {
  // Opponent at (8,5) can only move left to (7,5). Moving right into (7,5) would be a draw;
  // we own the big area, so we should turn instead.
  const w = 20, h = 11;
  const rows = [];
  for (let y = 0; y < h; y++) rows.push('.'.repeat(w));
  const put = (x, y, c) => { rows[y] = rows[y].slice(0, x) + c + rows[y].slice(x + 1); };
  for (let y = 0; y < h; y++) put(9, y, '#');
  for (let y = 0; y < h; y++) if (y !== 5) put(8, y, '#');
  for (let y = 0; y < h; y++) if (y !== 5) put(7, y, '#');
  put(8, 5, '2');
  put(5, 5, '1');
  const v = { width: w, height: h, grid: rows, me: { x: 5, y: 5, dir: 'right' }, opponent: { x: 8, y: 5, dir: 'left' } };
  // Opponent moves to (7,5) next, then must enter (6,5). Taking (6,5) now traps it.
  assert.equal(chooseMove(v), 'right');
  // But with the opponent one cell closer, stepping into the shared cell is a draw: avoid it.
  put(8, 5, '.');
  rows[5] = rows[5].slice(0, 7) + '2' + rows[5].slice(8);
  for (let y = 0; y < h; y++) if (y !== 5) put(6, y, '#');
  const v2 = { width: w, height: h, grid: rows, me: { x: 5, y: 5, dir: 'up' }, opponent: { x: 7, y: 5, dir: 'left' } };
  assert.notEqual(chooseMove(v2), 'right');
});
