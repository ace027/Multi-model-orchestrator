Build a Pac-Man clone that plays in the browser. The full specification is in `docs/spec.md`; follow it exactly, including the `window.pacman` test hook, because the game is checked against it. The default maze is in `levels/classic.txt`.

The game is plain HTML, CSS and JavaScript served as static files from the repository root (`index.html`), with no build step, no dependencies and no network access. Write automated tests as `tests/*.test.js` that pass with `node --test`.

Playwright for Node and Chromium are installed (`require('playwright')`): serve the repository (for example `python3 -m http.server`), open the game, play it with key presses and look at screenshots to check that it works and looks right.
