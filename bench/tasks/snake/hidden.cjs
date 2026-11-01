// Hidden checks for the snake task: rules through window.snake (scripted cases from
// cases.json), the page in real time with screenshots (7), and 3 long replays driven by a
// deterministic bot (an all-or-nothing spec-fidelity signal).
// Usage: node hidden.cjs <work dir>
const path = require('path')
const { run } = require(path.join(__dirname, '..', '..', 'webgrade.cjs'))
const CASES = require(path.join(__dirname, 'cases.json'))

const S = page => page.evaluate(() => window.snake.state())

// Keeps only the keys the expectation names, in its order, so extra fields and key
// order in the game's state() don't matter.
function project(got, exp) {
  if (Array.isArray(exp)) return Array.isArray(got) ? exp.map((e, i) => project(got[i], e)) : got
  if (exp && typeof exp === 'object') {
    if (!got || typeof got !== 'object') return got
    return Object.fromEntries(Object.keys(exp).map(k => [k, project(got[k], exp[k])]))
  }
  return got
}

function play(page, opts, script, fields) {
  return page.evaluate(({ opts, script, fields }) => {
    const G = window.snake
    G.reset(opts)
    const snaps = []
    for (const t of script) {
      if (typeof t === 'number') for (let i = 0; i < t; i++) G.step()
      else if (t === '?') { const s = G.state(); snaps.push(JSON.parse(JSON.stringify(Object.fromEntries(fields.map(k => [k, s[k]]))))) }
      else G.setDirection(t)
    }
    return snaps
  }, { opts, script, fields })
}

const rules = CASES.rules.map(c => ({
  part: 'rules', name: c.name,
  async fn(page, h) {
    const got = await play(page, c.opts, c.script, c.fields)
    c.expect.forEach((e, i) => h.eq(project(got[i], e), e, `snapshot ${i + 1}`))
  },
}))

// The replay player, run in the page against the game's own state(): BFS from the head to
// the food through free cells (the tail counts as free), else any safe move, else straight on.
const BOT = `(s, obstacles, wrap) => {
  const W = s.width, H = s.height
  const D = [['up', 0, -1], ['left', -1, 0], ['down', 0, 1], ['right', 1, 0]]
  const blocked = new Set(obstacles.map(([x, y]) => x + ',' + y))
  for (const [x, y] of s.snake.slice(0, -1)) blocked.add(x + ',' + y)
  const at = (x, y) => wrap ? [(x + W) % W, (y + H) % H] : [x, y]
  const ok = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !blocked.has(x + ',' + y)
  const [hx, hy] = s.snake[0], start = hx + ',' + hy
  const first = { [start]: null }, q = [[hx, hy]]
  for (let i = 0; i < q.length && s.food; i++) {
    const [x, y] = q[i], key = x + ',' + y
    if (x === s.food[0] && y === s.food[1]) return first[key]
    for (const [d, dx, dy] of D) {
      const [nx, ny] = at(x + dx, y + dy), nk = nx + ',' + ny
      if (!ok(nx, ny) || nk in first) continue
      first[nk] = first[key] || d
      q.push([nx, ny])
    }
  }
  for (const [d, dx, dy] of D) { const [nx, ny] = at(hx + dx, hy + dy); if (ok(nx, ny)) return d }
  return s.dir
}`

const replays = CASES.replays.map(c => ({
  part: 'replay', name: c.name,
  async fn(page, h) {
    const got = await page.evaluate(({ opts, n, bot }) => {
      const G = window.snake, move = eval(bot)
      G.reset(opts)
      for (let t = 0; t < n; t++) {
        G.setDirection(move(G.state(), opts.obstacles || [], !!opts.wrap)); G.step()
        if (G.state().status !== 'playing') break
      }
      return JSON.parse(JSON.stringify(G.state()))
    }, { opts: c.opts, n: c.n, bot: BOT })
    for (const key of Object.keys(c.expect)) h.eq(project(got[key], c.expect[key]), c.expect[key], key)
  },
}))

const COLORS = { body: '#00c000', head: '#80ff80', food: '#ff3030', black: '#000000' }
async function start(page) { await page.keyboard.press('Space'); await page.waitForTimeout(50) }

const ui = {
  async loads_cleanly(page, h, errors) {
    await page.waitForTimeout(500)
    h.eq(errors, [], 'page errors')
    const box = await page.locator('canvas#game').boundingBox()
    h.assert(box && box.width >= 400 && box.height >= 400 && box.x >= 0 && box.y >= 0 && box.x + box.width <= 1024 && box.y + box.height <= 768,
      `canvas#game box ${JSON.stringify(box)}`)
  },
  async waits_for_space(page, h) {
    h.assert(/space/i.test(await page.locator('#message').innerText()), '#message mentions Space')
    h.eq((await page.locator('#score').innerText()).trim(), '0', '#score')
    await page.waitForTimeout(700)
    const s = await S(page)
    h.eq([s.tick, s.status, s.snake[0], s.food], [0, 'playing', [10, 10], [11, 13]], 'the waiting default game')
  },
  async runs_at_8_ticks_per_second(page, h) {
    await start(page); await page.waitForTimeout(100)
    const a = (await S(page)).tick
    await page.waitForTimeout(500)
    const b = (await S(page)).tick
    h.assert(b - a >= 2 && b - a <= 6, `${b - a} ticks in 500 ms`)
  },
  async draws_snake_and_food(page, h) {
    await start(page); await page.waitForTimeout(200)
    const c = await h.colorCounts(COLORS, 30)
    const low = Object.entries({ body: 300, head: 120, food: 80, black: 1024 * 768 * 0.3 })
      .filter(([k, n]) => c[k] < n).map(([k, n]) => `${k} ${c[k]} < ${Math.round(n)}`)
    h.eq(low, [], 'colour pixel counts')
  },
  async keys_steer(page, h) {
    await start(page)
    await page.keyboard.press('w'); await page.waitForTimeout(300)
    const a = (await S(page)).dir
    await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(300)
    const b = (await S(page)).dir
    await page.keyboard.press('s'); await page.waitForTimeout(300)
    const c = (await S(page)).dir
    h.eq([a, b, c], ['up', 'left', 'down'], 'w, ArrowLeft, s')
  },
  async pause(page, h) {
    await start(page); await page.waitForTimeout(200)
    await page.keyboard.press('p')
    const a = (await S(page)).tick
    await page.waitForTimeout(500)
    const b = (await S(page)).tick
    await page.keyboard.press('p'); await page.waitForTimeout(400)
    const c = (await S(page)).tick
    h.assert(a === b && c > b, `ticks ${a} -> ${b} paused -> ${c} resumed`)
  },
  async game_over_and_restart(page, h) {
    // Heading right from x 10, the snake leaves the grid on tick 10 (1.25 s).
    await start(page); await page.waitForTimeout(2000)
    const s = await S(page)
    const msg = await page.locator('#message').innerText()
    h.assert(s.status === 'game_over' && /game over/i.test(msg) && /space/i.test(msg), `status ${s.status}, #message ${JSON.stringify(msg)}`)
    await start(page); await page.waitForTimeout(300)
    const t = await S(page)
    h.assert(t.status === 'playing' && t.tick < 6, `after Space: status ${t.status}, tick ${t.tick}`)
  },
}

const cases = [
  ...rules,
  ...Object.entries(ui).map(([name, fn]) => ({ part: 'ui', name, fn })),
  ...replays,
]

if (require.main === module) run(process.argv[2], cases, { hook: 'snake', caseTimeout: 60000 }).then(r => console.log(JSON.stringify(r)))
module.exports = { BOT }
