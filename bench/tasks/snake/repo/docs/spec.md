# Snake: specification

A single-player Snake game in the browser. The game runs on a grid of cells and advances in discrete ticks; everything below is defined per tick so that the game is deterministic and can be checked through the test hook at the end.

## Grid

- The grid is `width` × `height` cells (default 20 × 20). `x` runs from 0 (left) to `width − 1`, `y` from 0 (top) to `height − 1`.
- A cell's index is `y · width + x` (row by row, top row first).
- Obstacles are cells the snake must not enter (default: none).

## The snake

- The snake is a list of cells, head first. The default snake is `[[10, 10], [9, 10], [8, 10]]`, heading `right`.
- Directions are `up` (y − 1), `down` (y + 1), `left` (x − 1) and `right` (x + 1).

## Food

There is at most one food cell at a time. Its position comes from a seeded random number generator so that every game is reproducible:

- The generator keeps a number `s`, starting at the game's `seed` (default 1; an integer from 1 to 2147483646).
- To place food: set `s = (s · 48271) mod 2147483647`, let `start = s mod (width · height)`, and scan the cells from index `start` upwards, wrapping from the last index to 0, for the first cell that is neither part of the snake nor an obstacle. That cell is the food.
- If no cell is free, there is no food (`null`) and the game is won.
- Food is placed once when the game starts (after the snake) and again each time the snake eats. The generator advances only when food is placed this way.

With the defaults, the first food is at `[11, 13]`.

## A tick

Each tick, in this order:

1. If the status is not `playing`, nothing happens (the tick count does not change either).
2. **Turn.** If a direction has been requested since the last tick and it is not the opposite of the current direction, it becomes the current direction. Only the most recent request counts. A request for the opposite direction is ignored.
3. **Move.** The new head is the current head moved one cell in the current direction.
   - With `wrap` off (the default), a new head outside the grid ends the game: the status becomes `game_over`, the snake stays where it was, and go to step 6.
   - With `wrap` on, the new head wraps around to the opposite edge.
4. **Collide.** The snake eats when the new head is on the food. The new head hits the snake if it is on any of its cells, except the last one (the tail moves away this tick) when the snake is not eating. A hit, or a new head on an obstacle, ends the game as in step 3.
5. **Grow.** The new head is added at the front. If the snake is not eating, its last cell is removed. If it is eating, the score goes up by 10 and new food is placed (see Food); when no cell is free the status becomes `won`.
6. The tick count goes up by 1.

## Play

- The game runs at 8 ticks per second.
- On load it shows the grid and the snake and waits, with `#message` containing the word "Space". Space starts the game.
- Arrow keys and WASD request a direction. P pauses and resumes.
- When the game is over, `#message` contains "Game over" and the word "Space"; Space starts a new game. A won game shows "You win" and the word "Space".

## Page

- `index.html` at the repository root, with a `<canvas id="game">`, an element `#score` and an element `#message`.
- The whole grid is visible in a 1024×768 window without scrolling, with cells of at least 20×20 pixels.
- `#score` shows the score as a plain number (`0` at the start).

## Look

- Black background (`#000000`).
- Snake body `#00c000`, head `#80ff80`, food `#ff3030`, obstacles `#808080`.

## Test hook

The page defines `window.snake` as soon as it has loaded:

- `reset(options)`: starts a new game and switches to manual mode: the real-time loop stops and the game only advances through `step()`. Options, all optional: `width`, `height`, `snake` (cells, head first), `dir`, `seed`, `food` (a cell: the first food is put there instead of being placed by the generator, which then does not advance), `obstacles` (a list of cells), `wrap` (boolean). Status `playing`, score 0, `tick` 0.
- `setDirection(dir)`: requests a direction (`'up'`, `'down'`, `'left'`, `'right'`).
- `step()`: advances one tick as above.
- `state()` returns a plain object:

```js
{
  tick, score,
  status,      // 'playing' | 'game_over' | 'won'
  dir,         // the current direction
  length,      // number of snake cells
  snake,       // [[x, y], ...], head first
  food,        // [x, y] or null
  width, height,
}
```

Before the player presses Space, `state()` describes the waiting game (tick 0) with the defaults.
