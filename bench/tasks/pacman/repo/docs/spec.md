# Pac-Man: specification

A single-player Pac-Man game in the browser. The game runs on a grid of tiles and advances in discrete ticks; everything below is defined per tick so that the game is deterministic and can be checked through the test hook at the end.

## Page

- `index.html` at the repository root, with a `<canvas id="game">`, an element `#score`, an element `#lives` and an element `#message`.
- The whole maze is visible in a 1024×768 window without scrolling, with tiles of at least 16×16 pixels.
- `#score` shows the score as a plain number (`0` at the start). `#lives` shows the number of lives left as a plain number (`3` at the start).

## Maze

A maze is a list of equal-length strings, one per row. `levels/classic.txt` holds the default maze (28×31); the game may embed a copy of it. Characters:

| Char | Meaning |
| --- | --- |
| `#` | wall |
| `.` | pellet |
| `o` | power pellet |
| ` ` | empty floor |
| `-` | ghost-house door |
| `C` | Pac-Man's start tile (floor) |
| `b` `p` `i` `c` | start tiles (floor) of Blinky, Pinky, Inky and Clyde |

A maze has exactly one `C` and any subset of the four ghosts. Coordinates are `x` (column, from 0 at the left) and `y` (row, from 0 at the top). Directions are `up` (y−1), `left` (x−1), `down` (y+1) and `right` (x+1); when a rule lists directions, the order is always up, left, down, right.

- **Wrapping.** The tile next to (x, y) in a direction wraps around the grid: moving left from x = 0 leads to x = W−1, and likewise for the other edges (this makes the side tunnel of the classic maze).
- **Open tiles.** A tile is open to Pac-Man unless it is a wall or a door. It is open to a ghost unless it is a wall or a door, except that a ghost leaving the house passes through the door (below).
- **The house.** The house is the set of tiles reachable from the tiles directly below the door tiles by moving through tiles that are neither walls nor doors (with wrapping). The **exit tile** is the tile directly above the leftmost door tile. A maze without a door has no house and no exit tile.

## Actors

**Pac-Man** has a position, a direction and a requested direction. He starts on `C` with direction `left` and no request.

**Ghosts** have a position, a direction, a mode and a pending-reversal flag. Each starts on its letter with direction `left` and no pending reversal. A ghost starting in the house has mode `house`; any other ghost starts in the current global mode. Modes:

- `house`: waiting in the house; does not move.
- `leaving`: walking out of the house.
- `scatter`, `chase`: hunting, by target tile.
- `frightened`: blue and running away; Pac-Man can eat it.
- `eyes`: eaten; returning to be revived.

The **global mode** is `scatter` or `chase`, set by the mode schedule.

## The tick

`step()` advances one tick. If the status is `game_over` it does nothing at all. If the status is `level_clear`, it adds 1 to `tick`, starts the next level (below) and does nothing else. Otherwise it runs these phases in order:

1. **Clocks.** Add 1 to `tick` and to the level clock. Then:
   - If `frightened` (the frightened-ticks counter) is above 0, subtract 1; if it reaches 0, every `frightened` ghost switches to the global mode (no reversal).
   - Otherwise add 1 to the mode clock and look up the global mode for the new mode-clock value in the schedule. If it differs from the current global mode, the global mode changes, and every ghost in `scatter` or `chase` switches to it and gets a pending reversal.
   - Every ghost in `house` whose release tick is at most the level clock switches to `leaving`. Release ticks: Blinky 0, Pinky 0, Inky 30, Clyde 60.
2. **Pac-Man moves.** If the tile next to him in the requested direction is open, his direction becomes the requested one. Then, if the tile next to him in his direction is open, he moves there; otherwise he stays put (keeping his direction). The request is kept until a new one replaces it; Pac-Man may reverse at any time.
3. **Eating.** If Pac-Man's tile holds a pellet he eats it for 10 points; a power pellet scores 50 and frightens the ghosts: `frightened` is set to the frightened duration, the ghost-eating chain restarts, and every ghost in `scatter`, `chase` or `frightened` becomes `frightened` and gets a pending reversal. Ghosts in other modes are not affected. If no pellets or power pellets remain, the status becomes `level_clear` and the tick ends here.
4. **Collisions** (see below).
5. **Ghosts move**, in the order Blinky, Pinky, Inky, Clyde, one tile each at most:
   - `house`: stays.
   - `leaving`: if its x differs from the leftmost door tile's x it moves one tile horizontally towards it (direction `left` or `right`), otherwise one tile up (direction `up`), through the door. If it is then on the exit tile, it switches to the global mode with direction `left`.
   - `frightened`: moves only when `tick` is even, choosing as below.
   - `scatter`, `chase`, `eyes`: move every tick, choosing as below. An `eyes` ghost that arrives on its revival tile switches to the global mode, keeping its direction.
6. **Collisions** again.

**Collisions.** The ghosts on Pac-Man's tile are handled in the order Blinky, Pinky, Inky, Clyde:

- A `frightened` ghost is eaten: it becomes `eyes` (its pending reversal is cleared) and scores 200, 400, 800 and then 1600 for the first, second, third and every later ghost eaten since the last power pellet.
- An `eyes` ghost is ignored.
- Any other ghost kills Pac-Man. The rest of the tick is skipped. Lives go down by 1; at 0 lives the status becomes `game_over` and nothing moves any more. Otherwise Pac-Man and the ghosts go back to their starts as described under Actors (request cleared, pending reversals cleared), the level clock and the mode clock go back to 0, `frightened` goes to 0, and the global mode goes back to the schedule's first mode. Pellets stay eaten.

**Extra life.** The first time the score reaches 10000 or more, Pac-Man gains a life.

## How a ghost chooses

When a ghost in `scatter`, `chase`, `frightened` or `eyes` moves:

1. If it has a pending reversal, it clears the flag; if the tile behind it (opposite its direction) is open, it turns around and moves there, and that is its move.
2. Otherwise the candidates are the directions whose next tile is open, except the opposite of its current direction. If there are none, the opposite direction is the only candidate (if it is open; else the ghost stays).
3. In `frightened` mode it picks the candidate whose next tile is farthest from Pac-Man's tile; in the other modes, the candidate whose next tile is closest to its target tile. Distance is the squared straight-line distance (dx² + dy²) using plain coordinates, without wrapping. Ties go to the first in the order up, left, down, right.

**Targets.** P is Pac-Man's tile and v his direction as a unit vector, both as they are after his move this tick. W and H are the maze width and height.

| Ghost | `chase` target | `scatter` target |
| --- | --- | --- |
| Blinky | P | (W−3, −3) |
| Pinky | P + 4v | (2, −3) |
| Inky | 2·(P + 2v) − B, where B is Blinky's tile (after Blinky's move this tick); P + 2v if the maze has no Blinky | (W−1, H) |
| Clyde | P if Clyde is more than 8 tiles from P (squared distance above 64), otherwise its scatter target | (0, H) |

An `eyes` ghost targets its **revival tile**: the exit tile, or the ghost's own start tile in a maze without a door.

## Mode schedule

The mode clock counts ticks since the level started or Pac-Man last died, not counting ticks during which `frightened` was above 0 at the start of the tick. The global mode for mode-clock value t is:

| t | mode |
| --- | --- |
| 0–69 | scatter |
| 70–269 | chase |
| 270–339 | scatter |
| 340–539 | chase |
| 540–599 | scatter |
| 600 and later | chase |

**Frightened duration** is max(10, 40 − 5·(level − 1)) ticks.

## Levels

When the status is `level_clear`, the next step starts the next level: the level goes up by 1, all pellets and power pellets of the maze come back, Pac-Man and the ghosts go back to their starts, the level clock, the mode clock and `frightened` go to 0, the global mode goes back to the schedule's first mode, and the status becomes `playing`. Score and lives are kept.

## Play

- The game runs at 10 ticks per second.
- On load it shows the maze and waits, with `#message` containing the word "Space". Space starts the game.
- Arrow keys and WASD set Pac-Man's requested direction. P pauses and resumes.
- After a level is cleared, the game shows it for about a second and then goes on with the next level.
- When the game is over, `#message` contains "Game over" and the word "Space"; Space starts a new game.

## Look

- Black background.
- Walls `#2121ff`, Pac-Man `#ffff00`.
- Blinky `#ff0000`, Pinky `#ffb8ff`, Inky `#00ffff`, Clyde `#ffb852`; frightened ghosts in a colour that is none of these; eyes mostly white.
- Pellets and power pellets `#ffb8ae`, drawn steadily (no blinking); power pellets clearly bigger.

## Test hook

The page defines `window.pacman` as soon as it has loaded:

- `reset(options)`: starts a new game and switches to manual mode: the real-time loop stops and the game only advances through `step()`. Options, all optional: `maze` (list of row strings; default the classic maze), `lives` (default 3), `level` (default 1), `mode` (`'scatter'` or `'chase'`: when given, the global mode is fixed at that value for the whole game, after deaths and new levels too, and the schedule is ignored). Status `playing`, score 0, `tick` 0.
- `setDirection(dir)`: sets Pac-Man's requested direction (`'up'`, `'down'`, `'left'`, `'right'`).
- `step()`: advances one tick as above.
- `state()` returns a plain object:

```js
{
  tick, level, score, lives,
  status,       // 'playing' | 'level_clear' | 'game_over'
  pellets,      // pellets plus power pellets left
  frightened,   // frightened ticks left (0 when not frightened)
  mode,         // global mode: 'scatter' | 'chase'
  pacman: { x, y, dir },
  ghosts: { blinky: { x, y, dir, mode }, ... },   // only the ghosts in the maze
  maze,         // rows as strings: '#', '-', '.', 'o' and ' ' (start letters shown as ' ')
}
```

Before the player presses Space, `state()` describes the waiting game (tick 0) on the classic maze.
