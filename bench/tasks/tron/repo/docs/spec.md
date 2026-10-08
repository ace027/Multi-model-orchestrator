# Light Cycles

Two light cycles race around an arena, each leaving a solid trail behind it. A cycle that runs into a wall, an obstacle or any trail crashes. You steer the cyan cycle (player 1); the computer steers the orange one (player 2).

## Page

- `index.html` at the repository root. It must work when the repository root is served over HTTP by any static file server. Plain JavaScript (ES modules are fine), no build step, no external files or network requests.
- The arena is drawn on `<canvas id="game">`. The page also has an element `#score` and an element `#message` (any tag).
- The whole arena is visible in a 1024×768 window and every cell is at least 8×8 CSS pixels.

## Arena

- A grid of W×H cells, 64×48 unless the test hook says otherwise. Cell (x, y): x runs 0..W-1 to the right, y runs 0..H-1 downwards. Everything outside the grid is wall.
- Obstacle cells may be placed in the arena (the test hook can add them). Normal play uses none.
- Player 1 starts at (floor(W/4), floor(H/2)) heading right. Player 2 starts at (W-1-floor(W/4), floor(H/2)) heading left. Each start cell is part of that player's trail.

## Rules

The game advances in ticks.

1. **Steering.** A player may request a direction (`up`, `down`, `left`, `right`) at any time. A request for the reverse of the player's current direction is ignored. If several requests arrive between two ticks, the last one that was not ignored applies at the next tick. A player's current direction is the direction it last moved in (its starting direction before the first move).
2. **Moving.** On each tick both cycles move one cell in their direction at the same time. The cell a cycle moves into becomes part of its trail.
3. **Crashing.** A cycle crashes if the cell it moves into is outside the grid, an obstacle, or part of any trail as the trails were before this tick (which includes the cells both cycles occupied before the move). If both cycles move into the same cell, both crash. A crashed cycle does not move: its position stays at its last cell and the cell it tried to enter does not become trail.
4. **Rounds.** A round ends on the tick in which at least one cycle crashes. If exactly one crashed, the other player wins the round and scores a point. If both crashed it is a draw and nobody scores.
5. **Match.** The first player to win 3 rounds wins the match.
6. **Next round.** After a round has ended, the next tick does not move anything: it starts the next round instead. Trails are cleared (obstacles stay), both cycles go back to their start cells and directions, the round number goes up by one, and the round's tick count starts again at 0. Scores carry over. Once the match is won, ticks do nothing.

## Playing

- The game runs at 15 ticks per second.
- On load the game waits for the player: `#message` shows text containing the word "Space", and nothing moves. Pressing Space starts the match.
- The arrow keys and W, A, S, D steer player 1. P pauses and resumes the game; nothing moves while it is paused.
- `#score` always shows the round wins as `"{player 1} - {player 2}"`, for example `2 - 1`, and is updated as soon as a round ends.
- When a round ends, `#message` says how it ended, the game shows the crash for about a second, and then the next round starts by itself.
- When the match ends, `#message` says who won and contains the word "Space". Pressing Space starts a new match at `0 - 0`.

## Look

- The arena background is black or near-black.
- Player 1's cycle and trail are cyan `#00e5ff`; player 2's are orange `#ff8c00`. The heads may be drawn lighter. Obstacles and the arena border use a colour that is neither, such as grey.

## Computer player

Player 2 is steered by `chooseMove(view)`, a pure function. `view` is:

```js
{
  width, height,           // grid size
  grid,                    // array of `height` strings of `width` characters; '.' is free, anything else is blocked
  me: { x, y, dir },       // the cycle being steered
  opponent: { x, y, dir }, // the other cycle
}
```

It returns `'up'`, `'down'`, `'left'` or `'right'`, within 20 ms on a 64×48 arena. On every tick the game calls it with the state before the tick and treats the answer as player 2's request for that tick. It must work for either player: it only knows "me" and "the opponent".

The computer player is scored by playing rounds against bots of increasing strength on arenas with obstacles, as either player. The better it plays, the better the score.

## Test hook

Once the page has loaded, `window.tron` provides:

- `reset(options)`: starts a new match in manual mode. Real-time ticking stops; ticks then happen only through `step()`. `options` (all optional): `width` (64), `height` (48), `obstacles` (an array of `[x, y]` cells, default none), `ai` (default `true`: player 2 is steered by `chooseMove`; `false`: player 2 is steered only through `setDirection`).
- `setDirection(player, dir)`: a steering request for player 1 or 2, exactly like a key press.
- `step()`: one tick, following the rules above. With `ai` on, player 2's `chooseMove` request is made just before the move.
- `state()`: the current state as a plain object, in manual mode and during normal play:
  ```js
  {
    width, height,
    tick,          // ticks played in the current round; 0 at the start of a round
    round,         // 1 for the first round of the match
    players: [     // player 1, then player 2
      { x, y, dir, alive, score },
      { x, y, dir, alive, score },
    ],
    grid,          // array of `height` strings: '.' free, '#' obstacle, '1' and '2' the players' trails
    roundOver,     // true from the tick a round ends until the next round starts
    roundWinner,   // null while the round runs; then 1, 2, or 0 for a draw
    matchWinner,   // null, 1 or 2
  }
  ```
- `chooseMove(view)`: the computer player's function described above.
