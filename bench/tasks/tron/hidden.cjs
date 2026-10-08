// Hidden checks for the tron task: rules through window.tron (20), the page in real
// time with screenshots (8), and a tournament of chooseMove against four bots (24 rounds).
// Usage: node hidden.cjs <work dir>
const path = require('path')
const { run } = require(path.join(__dirname, '..', '..', 'webgrade.cjs'))

const S = page => page.evaluate(() => window.tron.state())
const R = (page, opts) => page.evaluate(o => window.tron.reset(o), opts)
const D = (page, p, d) => page.evaluate(([p, d]) => window.tron.setDirection(p, d), [p, d])
const step = (page, n = 1) => page.evaluate(n => { for (let i = 0; i < n; i++) window.tron.step() }, n)
const pos = s => s.players.map(p => [p.x, p.y, p.dir, p.alive])
const small = { width: 20, height: 10, ai: false }

const rules = {
  async initial_state(page, h) {
    await R(page, small)
    const s = await S(page)
    h.eq(pos(s), [[5, 5, 'right', true], [14, 5, 'left', true]], 'start positions')
    h.eq([s.width, s.height, s.tick, s.round, s.roundOver, s.roundWinner, s.matchWinner], [20, 10, 0, 1, false, null, null], 'fields')
    h.eq([s.players[0].score, s.players[1].score], [0, 0], 'scores')
    h.eq([s.grid.length, s.grid[0].length, s.grid[5][5], s.grid[5][14], s.grid[0]], [10, 20, '1', '2', '.'.repeat(20)], 'grid')
  },
  async step_moves_both(page, h) {
    await R(page, small); await step(page)
    const s = await S(page)
    h.eq(pos(s), [[6, 5, 'right', true], [13, 5, 'left', true]], 'positions')
    h.eq([s.tick, s.grid[5].slice(5, 7), s.grid[5].slice(13, 15)], [1, '11', '22'], 'trails')
  },
  async turn(page, h) {
    await R(page, small); await D(page, 1, 'up'); await D(page, 2, 'down'); await step(page)
    h.eq(pos(await S(page)), [[5, 4, 'up', true], [14, 6, 'down', true]], 'positions')
  },
  async reverse_ignored(page, h) {
    await R(page, small); await D(page, 1, 'left'); await D(page, 2, 'right'); await step(page)
    h.eq(pos(await S(page)), [[6, 5, 'right', true], [13, 5, 'left', true]], 'positions')
  },
  async last_request_wins(page, h) {
    await R(page, small); await D(page, 1, 'up'); await D(page, 1, 'down'); await step(page)
    h.eq(pos(await S(page))[0], [5, 6, 'down', true], 'up then down')
  },
  async ignored_request_does_not_cancel(page, h) {
    await R(page, small); await D(page, 1, 'up'); await D(page, 1, 'left'); await step(page)
    h.eq(pos(await S(page))[0], [5, 4, 'up', true], 'up then left (reverse)')
  },
  async reverse_of_last_move(page, h) {
    await R(page, small); await D(page, 1, 'up'); await step(page); await D(page, 1, 'down'); await step(page)
    h.eq(pos(await S(page))[0], [5, 3, 'up', true], 'down after moving up')
  },
  async wall_crash(page, h) {
    await R(page, small); await D(page, 1, 'up'); await step(page, 5)
    h.eq((await S(page)).players[0].alive, true, 'alive at the top row')
    await step(page)
    const s = await S(page)
    h.eq(pos(s)[0], [5, 0, 'up', false], 'crashed in place')
    h.eq([s.roundOver, s.roundWinner, s.players[0].score, s.players[1].score, s.tick], [true, 2, 0, 1, 6], 'round result')
  },
  async own_trail_crash(page, h) {
    await R(page, small)
    for (const d of ['up', 'left', 'down', 'right']) { await D(page, 1, d); await step(page) }
    const s = await S(page)
    h.eq([s.players[0].alive, s.roundWinner, s.players[0].x, s.players[0].y], [false, 2, 4, 5], 'crash into own start cell')
  },
  async opponent_trail_crash(page, h) {
    await R(page, small); await D(page, 2, 'up'); await step(page); await D(page, 2, 'left'); await step(page, 7)
    h.eq((await S(page)).roundOver, false, 'still running after 8 ticks')
    await step(page)
    const s = await S(page)
    h.eq([s.players[0].alive, s.players[1].alive, s.roundWinner, s.players[1].score], [false, true, 2, 1], 'player 1 hit player 2\'s start cell')
    h.eq(s.grid[5][14], '2', 'the cell stays player 2\'s trail')
  },
  async head_on_swap_is_draw(page, h) {
    await R(page, small); await step(page, 4)
    h.eq(pos(await S(page)), [[9, 5, 'right', true], [10, 5, 'left', true]], 'adjacent')
    await step(page)
    const s = await S(page)
    h.eq([pos(s), s.roundWinner, s.players[0].score, s.players[1].score], [[[9, 5, 'right', false], [10, 5, 'left', false]], 0, 0, 0], 'draw')
  },
  async same_cell_is_draw(page, h) {
    await R(page, { width: 21, height: 10, ai: false }); await step(page, 5)
    const s = await S(page)
    h.eq([pos(s), s.roundWinner, s.grid[5][10]], [[[9, 5, 'right', false], [11, 5, 'left', false]], 0, '.'], 'both crash, cell stays free')
  },
  async obstacle_crash(page, h) {
    await R(page, { ...small, obstacles: [[7, 5], [0, 0]] })
    h.eq([(await S(page)).grid[5][7], (await S(page)).grid[0][0]], ['#', '#'], 'obstacles in grid')
    await step(page, 2)
    const s = await S(page)
    h.eq([pos(s)[0], s.roundWinner, s.grid[5][7]], [[6, 5, 'right', false], 2, '#'], 'crash')
  },
  async both_walls_same_tick_draw(page, h) {
    await R(page, { width: 20, height: 11, ai: false }); await D(page, 1, 'up'); await D(page, 2, 'down'); await step(page, 5)
    h.eq((await S(page)).roundOver, false, 'running after 5')
    await step(page)
    const s = await S(page)
    h.eq([s.players[0].alive, s.players[1].alive, s.roundWinner], [false, false, 0], 'draw')
  },
  async next_round_resets(page, h) {
    await R(page, { ...small, obstacles: [[3, 3]] }); await D(page, 1, 'up'); await step(page, 6); await step(page)
    const s = await S(page)
    h.eq(pos(s), [[5, 5, 'right', true], [14, 5, 'left', true]], 'start positions')
    h.eq([s.tick, s.round, s.roundOver, s.roundWinner, s.players[0].score, s.players[1].score], [0, 2, false, null, 0, 1], 'fields')
    h.eq(s.grid.join('').replace(/\./g, ''), '#12', 'only the obstacle and start cells')
  },
  async match_over(page, h) {
    await R(page, small)
    for (let r = 0; r < 3; r++) { await D(page, 1, 'up'); await step(page, 6); if (r < 2) await step(page) }
    const s = await S(page)
    h.eq([s.matchWinner, s.players[1].score, s.round], [2, 3, 3], 'player 2 won the match')
    await step(page, 3)
    h.eq(await S(page), s, 'ticks do nothing after the match')
  },
  async ai_steers_player_two(page, h) {
    await R(page, { width: 30, height: 20 }); await step(page)
    const s = await S(page)
    const [x, y] = [s.players[1].x, s.players[1].y]
    h.assert(s.players[1].alive && Math.abs(x - 22) + Math.abs(y - 10) === 1 && s.players[1].dir !== 'right', `player 2 moved one cell: ${JSON.stringify(s.players[1])}`)
    h.eq(s.tick, 1, 'tick')
  },
  async choose_move_is_fast_and_valid(page, h) {
    const r = await page.evaluate(() => {
      const W = 64, H = 48, out = []
      const grid = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x * 7 + y * 13) % 11 === 0 ? '#' : '.').join(''))
      for (let i = 0; i < 40; i++) {
        const me = { x: 3 + i, y: 20, dir: ['up', 'down', 'left', 'right'][i % 4] }, opponent = { x: 60 - i, y: 30, dir: 'left' }
        const mark = (rows, c, ch) => rows.map((row, y) => y === c.y ? row.slice(0, c.x) + ch + row.slice(c.x + 1) : row)
        const g = mark(mark(grid, me, '1'), opponent, '2')
        const t0 = performance.now()
        const m = window.tron.chooseMove({ width: W, height: H, grid: g, me, opponent })
        out.push([m, performance.now() - t0])
      }
      return out
    })
    h.assert(r.every(([m]) => ['up', 'down', 'left', 'right'].includes(m)), `answers: ${r.map(x => x[0]).join(',')}`)
    const slow = r.slice(1).filter(([, t]) => t > 20)
    h.assert(slow.length === 0, `${slow.length} calls over 20 ms (max ${Math.max(...r.map(x => x[1])).toFixed(1)})`)
  },
  async choose_move_takes_the_only_exit(page, h) {
    const m = await page.evaluate(() => [
      window.tron.chooseMove({ width: 5, height: 5, grid: ['.....', '..#..', '.#1..', '.....', '.....'], me: { x: 2, y: 2, dir: 'up' }, opponent: { x: 4, y: 4, dir: 'left' } }),
      window.tron.chooseMove({ width: 5, height: 5, grid: ['.....', '..2..', '.11#.', '.....', '.....'], me: { x: 2, y: 2, dir: 'right' }, opponent: { x: 2, y: 1, dir: 'up' } }),
      window.tron.chooseMove({ width: 3, height: 3, grid: ['...', '.2.', '...'], me: { x: 1, y: 1, dir: 'left' }, opponent: { x: 2, y: 2, dir: 'up' } }) && 'ok',
    ])
    h.eq(m.slice(0, 2), ['right', 'down'], 'only safe moves')
  },
  async choose_move_avoids_dead_ends(page, h) {
    // Heading up into a wall: left leads into a one-cell pocket, right into open space.
    const grid = ['..........', '..........', '..........', '..........', '...#####..', '..#.1.....', '...#......', '..........', '..........', '..........']
    const a = await page.evaluate(g => window.tron.chooseMove({ width: 10, height: 10, grid: g, me: { x: 4, y: 5, dir: 'up' }, opponent: { x: 9, y: 0, dir: 'up' } }), grid)
    const mirrored = grid.map(r => [...r].reverse().join(''))
    const b = await page.evaluate(g => window.tron.chooseMove({ width: 10, height: 10, grid: g, me: { x: 5, y: 5, dir: 'up' }, opponent: { x: 0, y: 0, dir: 'up' } }), mirrored)
    h.eq([a, b], ['right', 'left'], 'the open side')
  },
}

const COLORS = { p1: '#00e5ff', p2: '#ff8c00', black: '#000000' }
const start = async page => { await page.keyboard.press('Space') }
const ui = {
  async loads_cleanly(page, h, errors) {
    await page.waitForTimeout(500)
    h.eq(errors, [], 'page errors')
    const box = await page.locator('canvas#game').boundingBox()
    h.assert(box && box.width >= 512 && box.height >= 384 && box.x >= 0 && box.y >= 0 && box.x + box.width <= 1024 && box.y + box.height <= 768,
      `canvas#game box ${JSON.stringify(box)}`)
  },
  async waits_for_space(page, h) {
    h.assert(/space/i.test(await page.locator('#message').innerText()), '#message mentions Space')
    h.eq((await page.locator('#score').innerText()).trim(), '0 - 0', '#score')
    await page.waitForTimeout(700)
    const s = await S(page)
    h.eq([s.tick, s.round], [0, 1], 'nothing moves before Space')
  },
  async runs_at_15_ticks_per_second(page, h) {
    await start(page); await page.keyboard.press('ArrowUp')
    await page.waitForTimeout(100)
    const a = (await S(page)).tick
    await page.waitForTimeout(800)
    const b = (await S(page)).tick
    h.assert(b - a >= 8 && b - a <= 17, `${b - a} ticks in 800 ms`)
  },
  async draws_both_cycles(page, h) {
    await start(page); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(1000)
    const c = await h.colorCounts(COLORS, 30)
    const total = 1024 * 768
    h.assert(c.p1 > 300 && c.p2 > 300, `cyan ${c.p1}, orange ${c.p2} pixels`)
    h.assert(c.black > total * 0.2, `near-black ${c.black} pixels`)
  },
  async trails_grow_on_screen(page, h) {
    await start(page); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(200)
    const a = await h.colorCounts(COLORS, 30)
    await page.waitForTimeout(500)
    const b = await h.colorCounts(COLORS, 30)
    h.assert(b.p1 - a.p1 > 200 && b.p2 - a.p2 > 200, `cyan +${b.p1 - a.p1}, orange +${b.p2 - a.p2} pixels in 500 ms`)
  },
  async keys_steer(page, h) {
    await start(page)
    await page.keyboard.press('ArrowUp'); await page.waitForTimeout(250)
    const a = (await S(page)).players[0].dir
    await page.keyboard.press('a'); await page.waitForTimeout(250)
    const b = (await S(page)).players[0].dir
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(250)
    const c = (await S(page)).players[0].dir
    h.eq([a, b, c], ['up', 'left', 'left'], 'arrow, WASD, reverse ignored')
  },
  async pause(page, h) {
    await start(page); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(300)
    await page.keyboard.press('p')
    const a = (await S(page)).tick
    await page.waitForTimeout(500)
    const b = (await S(page)).tick
    await page.keyboard.press('p'); await page.waitForTimeout(400)
    const c = (await S(page)).tick
    h.assert(a === b && c > b, `ticks ${a} -> ${b} paused -> ${c} resumed`)
  },
  async rounds_score_and_continue(page, h) {
    await start(page); await page.keyboard.press('ArrowUp')
    let s
    for (let i = 0; i < 40; i++) { await page.waitForTimeout(100); s = await S(page); if (s.roundOver || s.round > 1) break }
    h.assert(s.roundOver || s.round > 1, 'player 1 drove into the top wall')
    const score = (await page.locator('#score').innerText()).trim()
    h.eq(score, `${s.players[0].score} - ${s.players[1].score}`, '#score matches the state')
    h.eq(score, '0 - 1', 'player 2 won the round')
    for (let i = 0; i < 30 && s.round === 1; i++) { await page.waitForTimeout(100); s = await S(page) }
    await page.waitForTimeout(300)
    s = await S(page)
    h.assert(s.round === 2 && s.tick > 0, `next round started by itself (round ${s.round}, tick ${s.tick})`)
  },
}

// The tournament: a reference engine and four bots, injected into a fresh page, play
// the page's chooseMove on three obstacle arenas from both sides.
const TOURNAMENT = `
window.__tournament = function () {
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
  const REV = { up: 'down', down: 'up', left: 'right', right: 'left' }
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
  const W = 40, H = 30
  function arena(seed) {
    const r = rng(seed), g = Array.from({ length: H }, () => Array(W).fill('.'))
    const keep = (x, y) => Math.abs(y - 15) <= 1 && (Math.abs(x - 10) <= 4 || Math.abs(x - 29) <= 4)
    for (let k = 0; k < 7; k++) {
      const w = 1 + Math.floor(r() * 6), h = 1 + Math.floor(r() * 6), x0 = Math.floor(r() * (W - w)), y0 = Math.floor(r() * (H - h))
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++)
        if (!keep(x, y) && !keep(W - 1 - x, H - 1 - y)) { g[y][x] = '#'; g[H - 1 - y][W - 1 - x] = '#' }
    }
    return g
  }
  const free = (g, x, y) => x >= 0 && y >= 0 && x < W && y < H && g[y][x] === '.'
  const safe = (v, d) => free(v.grid, v.me.x + DIRS[d][0], v.me.y + DIRS[d][1])
  const options = v => Object.keys(DIRS).filter(d => d !== REV[v.me.dir] && safe(v, d))
  function fill(grid, x, y, block) {
    const seen = new Set([block]), q = [[x, y]]; let n = 0
    seen.add(x + ',' + y)
    while (q.length) { const [a, b] = q.pop(); n++
      for (const [dx, dy] of Object.values(DIRS)) { const k = (a + dx) + ',' + (b + dy)
        if (!seen.has(k) && free(grid, a + dx, b + dy)) { seen.add(k); q.push([a + dx, b + dy]) } } }
    return n
  }
  function dist(grid, x, y) {
    const d = new Map([[x + ',' + y, 0]]), q = [[x, y]]
    for (let i = 0; i < q.length; i++) { const [a, b] = q[i]
      for (const [dx, dy] of Object.values(DIRS)) { const k = (a + dx) + ',' + (b + dy)
        if (!d.has(k) && free(grid, a + dx, b + dy)) { d.set(k, d.get(a + ',' + b) + 1); q.push([a + dx, b + dy]) } } }
    return d
  }
  const pick = (r, list) => list[Math.floor(r() * list.length)]
  const BOTS = {
    straight: r => v => { const o = options(v); return o.includes(v.me.dir) ? v.me.dir : (o.length ? pick(r, o) : v.me.dir) },
    random: r => v => { const o = options(v); return o.length ? pick(r, o) : v.me.dir },
    area: r => v => {
      const o = options(v); if (!o.length) return v.me.dir
      const score = d => fill(v.grid, v.me.x + DIRS[d][0], v.me.y + DIRS[d][1]) + (d === v.me.dir ? 0.5 : 0) + r() * 0.1
      return o.sort((a, b) => score(b) - score(a))[0]
    },
    voronoi: r => v => {
      const o = options(v); if (!o.length) return v.me.dir
      const score = d => {
        const x = v.me.x + DIRS[d][0], y = v.me.y + DIRS[d][1]
        const g = v.grid.map((row, j) => j === y ? row.slice(0, x) + 'x' + row.slice(x + 1) : row)
        const mine = dist(g, x, y), theirs = dist(g, v.opponent.x, v.opponent.y)
        let reach = false, s = 0
        for (const [k, dm] of mine) { if (k === x + ',' + y) continue; const dt = theirs.get(k); if (dt !== undefined) reach = true; if (dt === undefined || dm < dt) s++; else if (dt < dm) s-- }
        const near = Math.abs(x - v.opponent.x) + Math.abs(y - v.opponent.y) === 1
        if (!reach) s = 1000 + fill(v.grid, x, y)
        return s + (d === v.me.dir ? 0.5 : 0) - (near ? 50 : 0) + r() * 0.1
      }
      return o.sort((a, b) => score(b) - score(a))[0]
    },
  }
  function round(seed, bot, side) {
    const g = arena(seed), r = rng(seed * 31 + side)
    const p = [{ x: 10, y: 15, dir: 'right', alive: true }, { x: 29, y: 15, dir: 'left', alive: true }]
    g[15][10] = '1'; g[15][29] = '2'
    const botMove = BOTS[bot](r)
    let slow = 0, bad = 0
    for (let t = 0; t < 1500; t++) {
      const grid = g.map(row => row.join(''))
      const want = [0, 1].map(i => {
        const view = { width: W, height: H, grid, me: { ...p[i] }, opponent: { ...p[1 - i] } }
        if (i !== side) return botMove(view)
        let d; const t0 = performance.now()
        try { d = window.tron.chooseMove(view) } catch (e) { d = null }
        if (performance.now() - t0 > 50) slow++
        if (!DIRS[d]) { bad++; d = p[i].dir }
        return d
      })
      const next = p.map((c, i) => { const d = want[i] === REV[c.dir] ? c.dir : want[i]; return { x: c.x + DIRS[d][0], y: c.y + DIRS[d][1], dir: d } })
      const crash = next.map(n => !free(g, n.x, n.y))
      if (next[0].x === next[1].x && next[0].y === next[1].y) crash[0] = crash[1] = true
      next.forEach((n, i) => { if (!crash[i]) { p[i].x = n.x; p[i].y = n.y; p[i].dir = n.dir; g[n.y][n.x] = String(i + 1) } })
      if (crash[0] || crash[1]) return { points: crash[side] ? (crash[1 - side] ? 0.5 : 0) : 1, slow, bad, ticks: t + 1 }
    }
    return { points: 0.5, slow, bad, ticks: 1500 }
  }
  const out = []
  for (const bot of Object.keys(BOTS)) for (const seed of [11, 22, 33]) for (const side of [0, 1]) out.push({ bot, seed, side, ...round(seed, bot, side) })
  return out
}`

async function tournament(browser, url) {
  const page = await (await browser.newContext()).newPage()
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 15000 })
    await page.waitForFunction(() => window.tron && typeof window.tron.chooseMove === 'function', null, { timeout: 5000 })
    await page.evaluate(() => window.tron.reset && window.tron.reset({ width: 64, height: 48, ai: false }))
    await page.addScriptTag({ content: TOURNAMENT })
    const rounds = await page.evaluate(() => window.__tournament())
    const by = {}
    for (const r of rounds) by[r.bot] = (by[r.bot] || 0) + r.points
    const points = rounds.reduce((a, r) => a + r.points, 0)
    const slow = rounds.reduce((a, r) => a + r.slow, 0), bad = rounds.reduce((a, r) => a + r.bad, 0)
    process.stderr.write(`tournament: ${JSON.stringify(by)} slow=${slow} bad=${bad}\n`)
    return { parts: { ai: [points, rounds.length] }, failed: [`ai/by-bot ${Object.entries(by).map(([k, v]) => `${k} ${v}/6`).join(', ')}${slow || bad ? `; ${slow} slow, ${bad} invalid moves` : ''}`] }
  } catch (e) {
    return { parts: { ai: [0, 24] }, failed: [`ai/tournament did not run: ${String(e.message || e).split('\n')[0]}`] }
  }
}

const cases = [
  ...Object.entries(rules).map(([name, fn]) => ({ part: 'rules', name, fn })),
  ...Object.entries(ui).map(([name, fn]) => ({ part: 'ui', name, fn })),
]

run(process.argv[2], cases, { hook: 'tron', after: tournament }).then(r => console.log(JSON.stringify(r)))
