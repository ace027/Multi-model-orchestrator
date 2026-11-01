// Snake: the engine (deterministic, per tick) and, in a browser, the page around it.
;(function () {
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
  const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }
  const DEFAULTS = { width: 20, height: 20, snake: [[10, 10], [9, 10], [8, 10]], dir: 'right', seed: 1, obstacles: [], wrap: false }

  function createGame(options = {}) {
    const o = { ...DEFAULTS, ...options }
    const g = {
      width: o.width, height: o.height, wrap: !!o.wrap, seed: o.seed,
      snake: o.snake.map(c => [c[0], c[1]]), dir: o.dir, requested: null,
      obstacles: new Set(o.obstacles.map(([x, y]) => y * o.width + x)),
      tick: 0, score: 0, status: 'playing', food: null,
    }
    if (o.food) g.food = [o.food[0], o.food[1]]
    else placeFood(g)
    return g
  }

  function placeFood(g) {
    g.seed = (g.seed * 48271) % 2147483647
    const n = g.width * g.height
    const taken = new Set(g.snake.map(([x, y]) => y * g.width + x))
    for (let k = 0, i = g.seed % n; k < n; k++, i = (i + 1) % n) {
      if (!taken.has(i) && !g.obstacles.has(i)) { g.food = [i % g.width, Math.floor(i / g.width)]; return }
    }
    g.food = null
    g.status = 'won'
  }

  function step(g) {
    if (g.status !== 'playing') return
    if (g.requested && g.requested !== OPPOSITE[g.dir]) g.dir = g.requested
    g.requested = null
    const [dx, dy] = DIRS[g.dir]
    let x = g.snake[0][0] + dx, y = g.snake[0][1] + dy
    if (g.wrap) { x = (x + g.width) % g.width; y = (y + g.height) % g.height }
    const outside = x < 0 || y < 0 || x >= g.width || y >= g.height
    const eating = !outside && g.food !== null && g.food[0] === x && g.food[1] === y
    const body = eating ? g.snake : g.snake.slice(0, -1)
    if (outside || g.obstacles.has(y * g.width + x) || body.some(c => c[0] === x && c[1] === y)) {
      g.status = 'game_over'
    } else {
      g.snake.unshift([x, y])
      if (eating) { g.score += 10; placeFood(g) } else g.snake.pop()
    }
    g.tick++
  }

  function setDirection(g, dir) { if (DIRS[dir]) g.requested = dir }

  function state(g) {
    return {
      tick: g.tick, score: g.score, status: g.status, dir: g.dir, length: g.snake.length,
      snake: g.snake.map(c => [c[0], c[1]]), food: g.food && [g.food[0], g.food[1]], width: g.width, height: g.height,
    }
  }

  const engine = { createGame, step, setDirection, state }
  if (typeof module !== 'undefined' && module.exports) module.exports = engine
  if (typeof window === 'undefined') return

  // The page.
  const CELL = 24
  const COLORS = { bg: '#000000', body: '#00c000', head: '#80ff80', food: '#ff3030', obstacle: '#808080' }
  const canvas = document.getElementById('game')
  const ctx = canvas.getContext('2d')
  const scoreEl = document.getElementById('score')
  const messageEl = document.getElementById('message')
  let game = createGame()
  let running = false, paused = false, manual = false, timer = null

  function draw() {
    canvas.width = game.width * CELL
    canvas.height = game.height * CELL
    ctx.fillStyle = COLORS.bg
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = COLORS.obstacle
    for (const i of game.obstacles) ctx.fillRect((i % game.width) * CELL, Math.floor(i / game.width) * CELL, CELL, CELL)
    if (game.food) { ctx.fillStyle = COLORS.food; ctx.fillRect(game.food[0] * CELL + 2, game.food[1] * CELL + 2, CELL - 4, CELL - 4) }
    game.snake.forEach(([x, y], i) => { ctx.fillStyle = i ? COLORS.body : COLORS.head; ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2) })
    scoreEl.textContent = String(game.score)
  }

  function show() {
    draw()
    if (game.status === 'game_over') messageEl.textContent = 'Game over. Press Space to play again.'
    else if (game.status === 'won') messageEl.textContent = 'You win! Press Space to play again.'
    else if (!running) messageEl.textContent = 'Press Space to start.'
    else messageEl.textContent = paused ? 'Paused (P to resume)' : ''
  }

  function loop() {
    if (!paused) step(game)
    if (game.status !== 'playing') { running = false; clearInterval(timer); timer = null }
    show()
  }

  function start() {
    game = createGame()
    running = true; paused = false
    clearInterval(timer)
    timer = setInterval(loop, 125)
    show()
  }

  const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' }
  document.addEventListener('keydown', e => {
    if (manual) return
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    if (k === ' ') { e.preventDefault(); if (!running) start(); return }
    if (k === 'p' && running) { paused = !paused; show(); return }
    if (KEYS[k] && running && !paused) { e.preventDefault(); setDirection(game, KEYS[k]) }
  })

  window.snake = {
    reset(options = {}) { manual = true; running = false; clearInterval(timer); timer = null; game = createGame(options); show() },
    setDirection(dir) { setDirection(game, dir) },
    step() { step(game); show() },
    state() { return state(game) },
  }
  show()
})()
