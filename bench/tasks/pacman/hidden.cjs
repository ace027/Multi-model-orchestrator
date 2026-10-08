// Hidden checks for the pacman task: rules through window.pacman (32 scripted cases from
// cases.json), the page in real time with screenshots (8), and 4 long replays on the
// classic maze driven by a deterministic bot (an all-or-nothing spec-fidelity signal).
// Usage: node hidden.cjs <work dir>
const path = require('path')
const { run } = require(path.join(__dirname, '..', '..', 'webgrade.cjs'))
const CASES = require(path.join(__dirname, 'cases.json'))

const S = page => page.evaluate(() => window.pacman.state())

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
    const P = window.pacman
    P.reset(opts)
    const snaps = []
    const pick = s => Object.fromEntries(fields.map(k => k === 'row23' ? [k, s.maze[23]] : [k, s[k]]))
    for (const t of script) {
      if (typeof t === 'number') for (let i = 0; i < t; i++) P.step()
      else if (t === '?') snaps.push(JSON.parse(JSON.stringify(pick(P.state()))))
      else P.setDirection(t)
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

// The replay player, run in the page against the game's own state(): BFS to the nearest
// frightened ghost (while there is one) or pellet, avoiding tiles within k of a dangerous ghost.
const BOT = `(s, k) => {
  const H = s.maze.length, W = s.maze[0].length
  const D = [['up', 0, -1], ['left', -1, 0], ['down', 0, 1], ['right', 1, 0]]
  const open = (x, y) => s.maze[y][x] !== '#' && s.maze[y][x] !== '-'
  const danger = new Set(), prey = new Set()
  for (const g of Object.values(s.ghosts)) {
    if (g.mode === 'frightened') prey.add(g.x + ',' + g.y)
    else if (g.mode !== 'eyes') for (let dx = -k; dx <= k; dx++) for (let dy = -k; dy <= k; dy++)
      if (Math.abs(dx) + Math.abs(dy) <= k) danger.add(((g.x + dx + W) % W) + ',' + ((g.y + dy + H) % H))
  }
  const start = s.pacman.x + ',' + s.pacman.y
  const first = { [start]: null }, q = [[s.pacman.x, s.pacman.y]]
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i], key = x + ',' + y
    if (key !== start && (prey.has(key) || (!prey.size && '.o'.includes(s.maze[y][x])))) return first[key]
    for (const [d, dx, dy] of D) {
      const nx = (x + dx + W) % W, ny = (y + dy + H) % H, nk = nx + ',' + ny
      if (!open(nx, ny) || nk in first || danger.has(nk)) continue
      first[nk] = first[key] || d
      q.push([nx, ny])
    }
  }
  for (const [d, dx, dy] of D) { const nx = (s.pacman.x + dx + W) % W, ny = (s.pacman.y + dy + H) % H; if (open(nx, ny) && !danger.has(nx + ',' + ny)) return d }
  return s.pacman.dir
}`

const replays = CASES.replays.map(c => ({
  part: 'replay', name: c.name,
  async fn(page, h) {
    const got = await page.evaluate(({ k, n, bot }) => {
      const P = window.pacman, move = eval(bot)
      P.reset({})
      for (let t = 0; t < n; t++) {
        P.setDirection(move(P.state(), k)); P.step()
        if (P.state().status === 'game_over') break
      }
      return JSON.parse(JSON.stringify(P.state()))
    }, { k: c.k, n: c.n, bot: BOT })
    for (const key of Object.keys(c.expect)) h.eq(project(got[key], c.expect[key]), c.expect[key], key)
  },
}))

const COLORS = { wall: '#2121ff', pac: '#ffff00', blinky: '#ff0000', pinky: '#ffb8ff', inky: '#00ffff', clyde: '#ffb852', pellet: '#ffb8ae', black: '#000000' }
async function start(page) { await page.keyboard.press('Space'); await page.waitForTimeout(50) }

const ui = {
  async loads_cleanly(page, h, errors) {
    await page.waitForTimeout(500)
    h.eq(errors, [], 'page errors')
    const box = await page.locator('canvas#game').boundingBox()
    h.assert(box && box.width >= 448 && box.height >= 496 && box.x >= 0 && box.y >= 0 && box.x + box.width <= 1024 && box.y + box.height <= 768,
      `canvas#game box ${JSON.stringify(box)}`)
  },
  async waits_for_space(page, h) {
    h.assert(/space/i.test(await page.locator('#message').innerText()), '#message mentions Space')
    h.eq([(await page.locator('#score').innerText()).trim(), (await page.locator('#lives').innerText()).trim()], ['0', '3'], '#score and #lives')
    await page.waitForTimeout(700)
    const s = await S(page)
    h.eq([s.tick, s.pellets, s.pacman.x, s.pacman.y], [0, 244, 13, 23], 'nothing moves before Space')
  },
  async runs_at_10_ticks_per_second(page, h) {
    await start(page); await page.waitForTimeout(100)
    const a = (await S(page)).tick
    await page.waitForTimeout(800)
    const b = (await S(page)).tick
    h.assert(b - a >= 5 && b - a <= 11, `${b - a} ticks in 800 ms`)
  },
  async draws_maze_and_actors(page, h) {
    await start(page); await page.waitForTimeout(300)
    const c = await h.colorCounts(COLORS, 30)
    const low = Object.entries({ wall: 1500, pac: 60, blinky: 40, pinky: 40, inky: 40, clyde: 40, pellet: 300, black: 1024 * 768 * 0.3 })
      .filter(([k, n]) => c[k] < n).map(([k, n]) => `${k} ${c[k]} < ${Math.round(n)}`)
    h.eq(low, [], 'colour pixel counts')
  },
  async eating_updates_score(page, h) {
    await start(page); await page.waitForTimeout(1500)
    const s = await S(page)
    h.assert(s.score > 0 && s.pellets < 244, `score ${s.score}, pellets ${s.pellets}`)
    h.eq((await page.locator('#score').innerText()).trim(), String(s.score), '#score matches the state')
  },
  async pellets_vanish_on_screen(page, h) {
    await page.waitForTimeout(300)
    const a = (await h.colorCounts({ pellet: COLORS.pellet }, 30)).pellet
    await start(page); await page.waitForTimeout(1500)
    const b = (await h.colorCounts({ pellet: COLORS.pellet }, 30)).pellet
    const eaten = 244 - (await S(page)).pellets
    h.assert(eaten >= 3 && b <= a * (1 - 3 / 244), `pellet pixels ${a} -> ${b} after eating ${eaten}`)
  },
  async keys_steer(page, h) {
    await start(page)
    await page.keyboard.press('w'); await page.waitForTimeout(400)
    const a = (await S(page)).pacman.dir
    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(400)
    const b = (await S(page)).pacman.dir
    await page.keyboard.press('a'); await page.waitForTimeout(300)
    const c = (await S(page)).pacman.dir
    h.eq([a, b, c], ['up', 'down', 'left'], 'w, ArrowDown, a')
  },
  async pause(page, h) {
    await start(page); await page.waitForTimeout(300)
    await page.keyboard.press('p')
    const a = (await S(page)).tick
    await page.waitForTimeout(500)
    const b = (await S(page)).tick
    await page.keyboard.press('p'); await page.waitForTimeout(400)
    const c = (await S(page)).tick
    h.assert(a === b && c > b, `ticks ${a} -> ${b} paused -> ${c} resumed`)
  },
}

const cases = [
  ...rules,
  ...Object.entries(ui).map(([name, fn]) => ({ part: 'ui', name, fn })),
  ...replays,
]

run(process.argv[2], cases, { hook: 'pacman', caseTimeout: 120000 }).then(r => console.log(JSON.stringify(r)))
