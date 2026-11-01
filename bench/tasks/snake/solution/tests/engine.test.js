const test = require('node:test')
const assert = require('node:assert')
const { createGame, step, setDirection, state } = require('../snake.js')

test('first food with the defaults', () => {
  assert.deepStrictEqual(state(createGame()).food, [11, 13])
})

test('eating grows the snake and scores 10', () => {
  const g = createGame({ food: [11, 10] })
  step(g)
  const s = state(g)
  assert.strictEqual(s.length, 4)
  assert.strictEqual(s.score, 10)
})

test('a reverse request is ignored; leaving the grid ends the game', () => {
  const g = createGame({ snake: [[19, 0], [18, 0]] })
  setDirection(g, 'left')
  step(g)
  assert.strictEqual(state(g).status, 'game_over')
})
