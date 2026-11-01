// Writes cases.json for the snake task from the reference engine in solution/snake.js.
// Each case's expectation was checked by hand against docs/spec.md; rerun after changing
// a case: node make_cases.cjs
const fs = require('fs')
const path = require('path')
const out = path.join(__dirname, 'cases.json')
if (!fs.existsSync(out)) fs.writeFileSync(out, '{"rules":[],"replays":[]}')
const E = require(path.join(__dirname, 'solution', 'snake.js'))
const { BOT } = require(path.join(__dirname, 'hidden.cjs'))

const ALL = ['tick', 'score', 'status', 'dir', 'length', 'snake', 'food']
const R = (name, opts, script, fields = ALL) => ({ name, opts, script, fields })
const sq = [[1, 1], [2, 1], [2, 2], [1, 2]] // heading left; the tail (1,2) is below the head

const RULES = [
  R('initial_state', {}, ['?'], [...ALL, 'width', 'height']),
  R('moves_one_cell_per_tick', {}, [1, '?', 4, '?']),
  R('turns', {}, ['up', 1, '?', 'left', 1, '?', 'down', 1, '?']),
  R('reverse_is_ignored', {}, ['left', 1, '?']),
  R('last_request_wins', {}, ['up', 'down', 1, '?']),
  R('last_request_reverse_is_ignored', {}, ['up', 'left', 1, '?']),
  R('request_lasts_one_tick', {}, ['up', 1, 1, '?']),
  R('wall_right_ends_game', { snake: [[19, 5], [18, 5], [17, 5]] }, [1, '?']),
  R('wall_top_after_turn', {}, ['up', 10, '?', 1, '?']),
  R('nothing_after_game_over', { snake: [[19, 5], [18, 5], [17, 5]] }, [1, 'up', 3, '?']),
  R('eat_grows_and_scores', { food: [11, 10] }, [1, '?', 1, '?']),
  R('given_food_does_not_advance_generator', { food: [12, 10] }, [2, '?']),
  R('second_food_by_generator', {}, [1, 'down', 3, '?']),
  R('custom_seed', { seed: 7 }, ['?']),
  R('custom_seed_second_food', { seed: 123456789, food: [14, 10] }, [4, '?']),
  R('food_skips_snake', { snake: [[13, 13], [12, 13], [11, 13]] }, ['?']),
  R('food_skips_obstacle', { obstacles: [[11, 13], [12, 13]] }, ['?']),
  R('food_scan_wraps_to_index_0', { width: 5, height: 5, snake: [[4, 4], [3, 4], [2, 4], [1, 4]] }, ['?']),
  R('moving_into_tail_is_allowed', { snake: sq, dir: 'left', food: [10, 10] }, ['down', 1, '?']),
  R('tail_counts_when_eating', { snake: sq, dir: 'left', food: [1, 2] }, ['down', 1, '?']),
  R('self_collision', { snake: [[2, 2], [3, 2], [3, 3], [2, 3], [1, 3]], dir: 'left', food: [10, 10] }, ['down', 1, '?']),
  R('obstacle_ends_game', { obstacles: [[12, 10]] }, [1, '?', 1, '?']),
  R('wrap_right_edge', { wrap: true, snake: [[19, 5], [18, 5], [17, 5]] }, [1, '?']),
  R('wrap_top_edge', { wrap: true, snake: [[5, 0], [5, 1], [5, 2]], dir: 'up' }, [1, '?']),
  R('won_when_no_cell_free', { width: 3, height: 1, snake: [[1, 0], [0, 0]], food: [2, 0] }, [1, '?', 2, '?'], [...ALL]),
  R('small_grid', { width: 6, height: 4, snake: [[2, 1], [1, 1]], seed: 99 }, ['?', 'down', 2, '?', 'right', 3, '?']),
]

const REPLAYS = [
  { name: 'bot_default', opts: {}, n: 3000 },
  { name: 'bot_obstacles_seed', opts: { seed: 2024, obstacles: [[5, 5], [5, 6], [5, 7], [14, 12], [15, 12], [16, 12], [10, 3]] }, n: 3000 },
  { name: 'bot_wrap_small', opts: { width: 12, height: 10, wrap: true, seed: 31337, snake: [[6, 5], [5, 5], [4, 5]] }, n: 3000 },
]

function play(c) {
  const g = E.createGame(c.opts), snaps = []
  for (const t of c.script) {
    if (typeof t === 'number') for (let i = 0; i < t; i++) E.step(g)
    else if (t === '?') { const s = E.state(g); snaps.push(Object.fromEntries(c.fields.map(k => [k, s[k]]))) }
    else E.setDirection(g, t)
  }
  return snaps
}

const move = eval(BOT)
function replay(c) {
  const g = E.createGame(c.opts)
  for (let t = 0; t < c.n; t++) {
    E.setDirection(g, move(E.state(g), c.opts.obstacles || [], !!c.opts.wrap)); E.step(g)
    if (g.status !== 'playing') break
  }
  const s = E.state(g)
  return { tick: s.tick, score: s.score, status: s.status, length: s.length, snake: s.snake, food: s.food }
}

const cases = {
  rules: RULES.map(c => ({ ...c, expect: play(c) })),
  replays: REPLAYS.map(c => ({ ...c, expect: replay(c) })),
}
fs.writeFileSync(out, JSON.stringify(cases, null, 1) + '\n')
for (const c of cases.rules) console.log(c.name, JSON.stringify(c.expect))
for (const c of cases.replays) console.log(c.name, JSON.stringify({ ...c.expect, snake: c.expect.snake.length }))
