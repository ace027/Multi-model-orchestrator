// Head-to-head Tron between finished games: each AI's chooseMove runs in its own page and
// this script applies the spec's rules on 8 seeded 40x30 obstacle arenas, both sides (16 rounds per pair).
// Usage: node bench/tron_crossplay.cjs name=<work dir> name=<work dir> ...  (no model calls)
const http = require('http'), fs = require('fs'), path = require('path')
const serve = root => new Promise(ok => { const s = http.createServer((q, r) => { let f = path.join(root, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); if (!fs.existsSync(f)) { r.writeHead(404); return r.end() } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' }); fs.createReadStream(f).pipe(r) }); s.listen(0, '127.0.0.1', () => ok(s)) })
const AIS = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')))
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }, OPP = { up: 'down', down: 'up', left: 'right', right: 'left' }
function rng(a) { return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
function arena(seed, W = 40, H = 30) {
  const r = rng(seed), g = Array.from({ length: H }, () => Array(W).fill('.'))
  const s1 = [Math.floor(W / 4), Math.floor(H / 2)], s2 = [W - 1 - Math.floor(W / 4), Math.floor(H / 2)]
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(r() * W), y = Math.floor(r() * H), len = 1 + Math.floor(r() * 5), horiz = r() < .5
    for (let k = 0; k < len; k++) {
      const cx = x + (horiz ? k : 0), cy = y + (horiz ? 0 : k)
      if (cx >= W || cy >= H) continue
      if (Math.abs(cx - s1[0]) + Math.abs(cy - s1[1]) < 4 || Math.abs(cx - s2[0]) + Math.abs(cy - s2[1]) < 4) continue
      g[cy][cx] = '#'; g[H - 1 - cy][W - 1 - cx] = '#'
    }
  }
  return { W, H, g, s1, s2 }
}
async function main() {
  const browser = await chromium.launch(), pages = {}
  for (const [name, dir] of Object.entries(AIS)) {
    const s = await serve(dir), p = await (await browser.newContext()).newPage()
    await p.goto(`http://127.0.0.1:${s.address().port}/index.html`)
    await p.waitForFunction(() => window.tron && window.tron.chooseMove)
    pages[name] = p
  }
  const names = Object.keys(pages), table = {}
  for (const a of names) for (const b of names) if (a < b) {
    let pa = 0, pb = 0
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) for (const swap of [false, true]) {
      const { W, H, g, s1, s2 } = arena(seed)
      const P = [{ x: s1[0], y: s1[1], dir: 'right' }, { x: s2[0], y: s2[1], dir: 'left' }]
      const who = swap ? [b, a] : [a, b]
      g[P[0].y][P[0].x] = '1'; g[P[1].y][P[1].x] = '2'
      let res = null
      for (let t = 0; t < 1500 && !res; t++) {
        const want = []
        for (const i of [0, 1]) {
          const view = { width: W, height: H, grid: g.map(r => r.join('')), me: { ...P[i] }, opponent: { ...P[1 - i] } }
          let d; try { d = await pages[who[i]].evaluate(v => window.tron.chooseMove(v), view) } catch { d = null }
          want.push(DIRS[d] && d !== OPP[P[i].dir] ? d : P[i].dir)
        }
        const nxt = P.map((p, i) => ({ x: p.x + DIRS[want[i]][0], y: p.y + DIRS[want[i]][1], dir: want[i] }))
        const dead = nxt.map(n => n.x < 0 || n.y < 0 || n.x >= W || n.y >= H || g[n.y][n.x] !== '.')
        if (nxt[0].x === nxt[1].x && nxt[0].y === nxt[1].y) dead[0] = dead[1] = true
        if (dead[0] || dead[1]) res = dead[0] && dead[1] ? 0 : dead[0] ? 2 : 1
        else nxt.forEach((n, i) => { P[i] = n; g[n.y][n.x] = String(i + 1) })
      }
      const winner = res === 1 ? who[0] : res === 2 ? who[1] : null
      if (!winner) { pa += .5; pb += .5 } else if (winner === a) pa++; else pb++
    }
    table[`${a} vs ${b}`] = `${pa} - ${pb}`
    console.log(`${a} vs ${b}: ${pa} - ${pb}`)
  }
  await browser.close(); process.exit(0)
}
main()
