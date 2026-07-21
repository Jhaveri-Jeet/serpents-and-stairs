# Serpents & Stairs 🐍🪜

A polished, full-screen Snakes & Ladders game for 2-4 players, built with plain HTML/CSS/JS (no build step, no dependencies).

## Features

- Full-viewport responsive board — no cramped centered box
- 10x10 board, 1-100, classic boustrophedon (boustrophedon = alternating row direction) numbering
- Real SVG snakes: curvy wavy bodies, a head with eyes + forked tongue, tail taper
- Real SVG ladders: two rails + rungs
- Smooth square-by-square token movement, plus a dedicated slide-down-the-snake / climb-the-ladder animation that follows the actual snake curve
- Animated dice roll (shake → settle) with pip faces
- 2-4 player hot-seat multiplayer, editable names, distinct colored tokens
- Extra turn on rolling a 6; must roll the exact number to land on 100
- Turn indicator, live player position list, win screen with confetti

## How to run

No build step needed — it's static HTML/CSS/JS.

```bash
cd serpents-and-stairs
python3 -m http.server 8000
# then open http://localhost:8000 in a browser
```

Or just double-click `index.html` to open it directly in a browser.

## How to play

1. On the start screen, choose 2-4 players and optionally rename them.
2. Click **Start Game**. Players begin stacked on square 1.
3. On your turn, click **Roll Dice**. Your token walks forward one square at a time.
   - Land on a ladder's bottom square → climb straight up to the top.
   - Land on a snake's head → slide down its body to the tail.
   - Roll a 6 → you get to roll again.
   - If your roll would take you past square 100, you stay put (you must land on 100 exactly).
4. First player to land exactly on square 100 wins — enjoy the confetti.
5. **Restart Game** at any time to set up a new game.

## Files

- `index.html` — page structure (start screen, board, sidebar, win screen)
- `style.css` — full-screen layout, jungle/board-game theme, animations
- `game.js` — board math, SVG snake/ladder generation, dice + movement logic, game state
