// Hidden checks for the browser game tasks. Serves the work dir over HTTP, opens
// index.html in headless Chromium (a fresh page per case), and runs each case.
// A case is { part, name, fn: async (page, h) => {} } and passes when fn returns
// without throwing. Prints one JSON line: { parts: {part: [passed, total]}, failed: [...] }.
const http = require('http')
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.txt': 'text/plain', '.png': 'image/png', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' }

function serve(root) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let file = path.join(root, rel)
    if (!file.startsWith(root)) { res.writeHead(403); return res.end() }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok(server)))
}

class Fail extends Error {}
const helpers = page => ({
  assert(cond, msg) { if (!cond) throw new Fail(msg) },
  eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected)
    if (a !== e) throw new Fail(`${msg}: got ${a}, expected ${e}`)
  },
  sleep: ms => new Promise(ok => setTimeout(ok, ms)),
  // Counts screenshot pixels within `tol` (per channel) of each named colour: a real
  // screenshot of the page, decoded in the page itself.
  async colorCounts(colors, tol = 40) {
    const png = (await page.screenshot()).toString('base64')
    return page.evaluate(async ({ png, colors, tol }) => {
      const img = new Image()
      img.src = 'data:image/png;base64,' + png
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      const g = c.getContext('2d')
      g.drawImage(img, 0, 0)
      const d = g.getImageData(0, 0, c.width, c.height).data
      const rgb = Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, [1, 3, 5].map(i => parseInt(v.slice(i, i + 2), 16))]))
      const out = Object.fromEntries(Object.keys(colors).map(k => [k, 0]))
      for (let i = 0; i < d.length; i += 4)
        for (const [k, [r, gg, b]] of Object.entries(rgb))
          if (Math.abs(d[i] - r) <= tol && Math.abs(d[i + 1] - gg) <= tol && Math.abs(d[i + 2] - b) <= tol) out[k]++
      return out
    }, { png, colors, tol })
  },
})

async function run(work, cases, { hook, caseTimeout = 60000, after } = {}) {
  if (!fs.existsSync(path.join(work, 'index.html'))) {
    const parts = {}
    for (const c of cases) { parts[c.part] = parts[c.part] || [0, 0]; parts[c.part][1]++ }
    const extra = after ? await after(null, null) : {}
    for (const [k, v] of Object.entries(extra.parts || {})) parts[k] = [0, v[1]]
    return { parts, failed: ['no index.html'] }
  }
  const server = await serve(path.resolve(work))
  const url = `http://127.0.0.1:${server.address().port}/index.html`
  const browser = await chromium.launch()
  const parts = {}, failed = []
  for (const c of cases) {
    parts[c.part] = parts[c.part] || [0, 0]
    parts[c.part][1]++
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(String(e)))
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 15000 })
      if (hook) await page.waitForFunction(h => typeof window[h] === 'object' && window[h] !== null, hook, { timeout: 5000 })
      let timer
      await Promise.race([c.fn(page, helpers(page), errors),
        new Promise((_, no) => { timer = setTimeout(() => no(new Fail('timed out')), caseTimeout) })])
      clearTimeout(timer)
      parts[c.part][0]++
    } catch (e) {
      failed.push(`${c.part}/${c.name}: ${String(e.message || e).split('\n')[0].slice(0, 200)}`)
    }
    await context.close()
  }
  const extra = after ? await after(browser, url) : {}
  await browser.close()
  server.close()
  for (const [k, v] of Object.entries(extra.parts || {})) parts[k] = v
  return { parts, failed: [...failed, ...(extra.failed || [])] }
}

module.exports = { run, Fail }
