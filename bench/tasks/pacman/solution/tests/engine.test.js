'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createGame, CLASSIC_MAZE, scheduleMode, frightenedDuration } = require('../pacman.js');

const run = (g, n) => { for (let i = 0; i < n; i++) g.step(); };

test('embedded maze matches levels/classic.txt', () => {
  const file = fs.readFileSync(path.join(__dirname, '..', 'levels', 'classic.txt'), 'utf8')
    .split('\n').filter((r) => r.length > 0);
  assert.deepEqual(CLASSIC_MAZE, file);
});

test('initial state on the classic maze', () => {
  const s = createGame().state();
  assert.equal(s.tick, 0); assert.equal(s.level, 1); assert.equal(s.score, 0); assert.equal(s.lives, 3);
  assert.equal(s.status, 'playing'); assert.equal(s.frightened, 0); assert.equal(s.mode, 'scatter');
  assert.deepEqual(s.pacman, { x: 13, y: 23, dir: 'left' });
  assert.deepEqual(s.ghosts.blinky, { x: 13, y: 11, dir: 'left', mode: 'scatter' });
  assert.deepEqual(s.ghosts.pinky, { x: 13, y: 14, dir: 'left', mode: 'house' });
  assert.deepEqual(s.ghosts.inky, { x: 11, y: 14, dir: 'left', mode: 'house' });
  assert.deepEqual(s.ghosts.clyde, { x: 15, y: 14, dir: 'left', mode: 'house' });
  assert.equal(s.pellets, 244);
  assert.equal(s.maze[23], '#o..##.......  .......##..o#');
  assert.equal(s.maze[11], '     #.##          ##.#     ');
});

test('Pac-Man eats a pellet, keeps request, stops at walls', () => {
  const g = createGame();
  g.step();
  let s = g.state();
  assert.deepEqual(s.pacman, { x: 12, y: 23, dir: 'left' });
  assert.equal(s.score, 10); assert.equal(s.pellets, 243);
  assert.equal(s.maze[23][12], ' ');
  g.setDirection('up'); // wall above (12,22)? row 22 col 12 is '.', open
  g.step();
  assert.deepEqual(g.state().pacman, { x: 12, y: 22, dir: 'up' });
  run(g, 5);
  // (12,20) reached, (12,19) is wall: stops
  assert.deepEqual(g.state().pacman, { x: 12, y: 20, dir: 'up' });
});

test('request is kept until the turn opens up', () => {
  const g = createGame();
  g.setDirection('down'); // below (13,23) is wall
  run(g, 4); // at (9,23)
  assert.deepEqual(g.state().pacman, { x: 9, y: 23, dir: 'left' });
  g.step();
  assert.deepEqual(g.state().pacman, { x: 9, y: 24, dir: 'down' });
});

test('wrapping through the side tunnel', () => {
  const maze = ['#####', '  C  ', '#####'];
  const g = createGame({ maze });
  run(g, 2);
  assert.deepEqual(g.state().pacman, { x: 0, y: 1, dir: 'left' });
  g.step();
  assert.deepEqual(g.state().pacman, { x: 4, y: 1, dir: 'left' });
});

test('ghosts leave the house per release ticks', () => {
  const g = createGame();
  g.step();
  let s = g.state();
  assert.equal(s.ghosts.pinky.mode, 'leaving');
  assert.deepEqual([s.ghosts.pinky.x, s.ghosts.pinky.y, s.ghosts.pinky.dir], [13, 13, 'up']);
  g.step(); g.step();
  s = g.state();
  assert.deepEqual(s.ghosts.pinky, { x: 13, y: 11, dir: 'left', mode: 'scatter' });
  run(g, 27); // tick 30
  s = g.state();
  assert.equal(s.ghosts.inky.mode, 'leaving');
  assert.deepEqual([s.ghosts.inky.x, s.ghosts.inky.dir], [12, 'right']);
  assert.equal(s.ghosts.clyde.mode, 'house');
  run(g, 30);
  assert.equal(g.state().ghosts.clyde.mode, 'leaving');
  assert.equal(g.state().ghosts.clyde.dir, 'left');
});

test('mode schedule values', () => {
  const pts = [[0, 'scatter'], [69, 'scatter'], [70, 'chase'], [269, 'chase'], [270, 'scatter'], [339, 'scatter'],
    [340, 'chase'], [539, 'chase'], [540, 'scatter'], [599, 'scatter'], [600, 'chase'], [100000, 'chase']];
  for (const [t, m] of pts) assert.equal(scheduleMode(t), m, 't=' + t);
});

test('mode change at tick 70 reverses hunting ghosts', () => {
  const maze = ['#########', '#C#  b  #', '#########'];
  const g = createGame({ maze });
  run(g, 69);
  const before = g.state().ghosts.blinky;
  assert.equal(g.state().mode, 'scatter');
  g.step();
  const s = g.state();
  assert.equal(s.mode, 'chase');
  assert.equal(s.ghosts.blinky.mode, 'chase');
  assert.equal(s.ghosts.blinky.dir, before.dir === 'left' ? 'right' : 'left');
  assert.equal(Math.abs(s.ghosts.blinky.x - before.x), 1);
});

test('mode clock is paused while frightened', () => {
  const maze = ['##########', '#Co# b  .#', '##########'];
  const g = createGame({ maze });
  g.setDirection('right');
  g.step();
  assert.equal(g.state().frightened, 40);
  run(g, 39);
  assert.equal(g.state().frightened, 1);
  g.step(); // tick 41: frightened reaches 0, ghost back to scatter
  assert.equal(g.state().frightened, 0);
  assert.equal(g.state().ghosts.blinky.mode, 'scatter');
  run(g, 109 - 41);
  assert.equal(g.state().mode, 'scatter');
  g.step();
  assert.equal(g.state().tick, 110);
  assert.equal(g.state().mode, 'chase');
});

test('fixed mode option ignores the schedule', () => {
  const g = createGame({ mode: 'chase' });
  assert.equal(g.state().mode, 'chase');
  assert.equal(g.state().ghosts.blinky.mode, 'chase');
  run(g, 100);
  assert.equal(g.state().mode, 'chase');
});

test('Blinky kills Pac-Man; actors reset; game over freezes', () => {
  const maze = ['#######', '#C   b#', '#######'];
  const g = createGame({ maze, mode: 'chase', lives: 2 });
  g.step();
  assert.deepEqual(g.state().ghosts.blinky, { x: 4, y: 1, dir: 'left', mode: 'chase' });
  run(g, 3);
  let s = g.state();
  assert.equal(s.lives, 1);
  assert.deepEqual(s.ghosts.blinky, { x: 5, y: 1, dir: 'left', mode: 'chase' });
  assert.deepEqual(s.pacman, { x: 1, y: 1, dir: 'left' });
  run(g, 4);
  s = g.state();
  assert.equal(s.lives, 0);
  assert.equal(s.status, 'game_over');
  g.step();
  assert.deepEqual(g.state(), s);
});

test('power pellet, odd-tick freeze, eating chain 200 then 400', () => {
  const maze = ['#############', '#C.o.....pb.#', '#############'];
  const g = createGame({ maze, mode: 'scatter' });
  g.setDirection('right');
  run(g, 2);
  let s = g.state();
  assert.equal(s.score, 60);
  assert.equal(s.frightened, 40);
  assert.deepEqual(s.ghosts.blinky, { x: 10, y: 1, dir: 'right', mode: 'frightened' });
  assert.deepEqual(s.ghosts.pinky, { x: 9, y: 1, dir: 'right', mode: 'frightened' });
  g.step(); // odd tick: frightened ghosts stay
  assert.equal(g.state().ghosts.blinky.x, 10);
  run(g, 5); // tick 8: Blinky walks into Pac-Man
  s = g.state();
  assert.equal(s.score, 310);
  assert.equal(s.ghosts.blinky.mode, 'eyes');
  g.step(); // tick 9: Pac-Man walks into Pinky
  s = g.state();
  assert.equal(s.score, 710);
  // Pinky was eaten next to its start tile (its revival tile, no door) and revives on the same tick
  assert.deepEqual(s.ghosts.pinky, { x: 9, y: 1, dir: 'left', mode: 'scatter' });
  assert.deepEqual(s.ghosts.blinky, { x: 8, y: 1, dir: 'left', mode: 'eyes' });
});

test('eyes revive on arriving at their revival tile', () => {
  const maze = ['###########', '#C.o b  #.#', '###########'];
  const g = createGame({ maze, mode: 'scatter' });
  g.setDirection('right');
  run(g, 4);
  assert.equal(g.state().ghosts.blinky.mode, 'eyes');
  assert.equal(g.state().score, 260);
  run(g, 2);
  assert.equal(g.state().ghosts.blinky.mode, 'eyes');
  g.step();
  assert.deepEqual(g.state().ghosts.blinky, { x: 5, y: 1, dir: 'left', mode: 'scatter' });
});

test('frightened duration formula', () => {
  assert.equal(frightenedDuration(1), 40);
  assert.equal(frightenedDuration(2), 35);
  assert.equal(frightenedDuration(7), 10);
  assert.equal(frightenedDuration(20), 10);
});

test('level clear and next level', () => {
  const maze = ['#####', '#C.b#', '#####'];
  const g = createGame({ maze, mode: 'scatter' });
  g.setDirection('right');
  g.step();
  let s = g.state();
  assert.equal(s.status, 'level_clear'); assert.equal(s.score, 10); assert.equal(s.pellets, 0);
  g.step();
  s = g.state();
  assert.equal(s.status, 'playing'); assert.equal(s.level, 2); assert.equal(s.tick, 2);
  assert.equal(s.pellets, 1); assert.equal(s.score, 10);
  assert.deepEqual(s.pacman, { x: 1, y: 1, dir: 'left' });
});

test('level option sets frightened duration', () => {
  const g = createGame({ maze: ['#####', '#Co.#', '#####'], level: 3 });
  g.setDirection('right');
  g.step();
  assert.equal(g.state().frightened, 30);
});

test('extra life at 10000, only once', () => {
  const n = 1001;
  const g = createGame({ maze: ['#'.repeat(n + 3), '#C' + '.'.repeat(n) + '#', '#'.repeat(n + 3)] });
  g.setDirection('right');
  run(g, 999);
  assert.equal(g.state().lives, 3);
  g.step();
  assert.equal(g.state().score, 10000);
  assert.equal(g.state().lives, 4);
});

test('targets: Pinky ahead, ties prefer up', () => {
  const maze = ['#########', '#       #', '#   p   #', '#       #', '#C      #', '#########'];
  const g = createGame({ maze, mode: 'chase' });
  g.setDirection('up');
  g.step();
  assert.deepEqual(g.state().ghosts.pinky, { x: 4, y: 1, dir: 'up', mode: 'chase' });
});

test('targets: Clyde near Pac-Man heads for its scatter corner', () => {
  const maze = ['#######', '#    C#', '#     #', '#  c  #', '#     #', '#     #', '#######'];
  const g = createGame({ maze, mode: 'chase' });
  g.step();
  assert.deepEqual(g.state().ghosts.clyde, { x: 3, y: 4, dir: 'down', mode: 'chase' });
});

test('targets: Inky uses Blinky after his move', () => {
  const maze = ['#########', '#       #', '#   i   #', '#       #', '#     Cb#', '#########'];
  const g = createGame({ maze, mode: 'chase' });
  g.step();
  const s = g.state();
  assert.deepEqual(s.ghosts.blinky, { x: 6, y: 4, dir: 'left', mode: 'chase' });
  assert.deepEqual(s.ghosts.inky, { x: 3, y: 2, dir: 'left', mode: 'chase' });
});

test('house, exit tile and state shape', () => {
  const maze = ['#######', '#C . b#', '###-###', '#  p  #', '#######'];
  const g = createGame({ maze });
  assert.deepEqual(g.exitTile, { x: 3, y: 1 });
  assert.ok(g.isHouse(3, 3) && g.isHouse(1, 3) && !g.isHouse(3, 1));
  const s = g.state();
  assert.deepEqual(Object.keys(s.ghosts), ['blinky', 'pinky']);
  assert.equal(s.ghosts.pinky.mode, 'house');
  assert.deepEqual(s.maze, ['#######', '#  .  #', '###-###', '#     #', '#######']);
  g.step(); // Pinky (release 0) leaves: up onto the door
  assert.deepEqual(g.state().ghosts.pinky, { x: 3, y: 2, dir: 'up', mode: 'leaving' });
  g.step(); // reaches the exit tile: global mode, direction left
  assert.deepEqual(g.state().ghosts.pinky, { x: 3, y: 1, dir: 'left', mode: 'scatter' });
});
