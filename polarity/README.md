# POLARITY

A neon arcade shoot-'em-up. Your ship carries one **polarity** — fire only harms enemies of the
*same color*. Wrong-color enemies must be dodged, and camping one color too long triggers an
**OVERLOAD** surge of the opposite color. Swap often, chain kills for combos, catch gold orbs for
OVERDRIVE, and take down the boss that arrives every 5th wave.

Originally a single-file HTML game, now split into clean, separate files.

## Run it

Just open `index.html` in any modern browser (Chrome, Firefox, Safari, Edge).

Because the game loads fonts from Google Fonts, it needs an internet connection. If you'd rather
serve it locally (recommended, avoids any file:// quirks):

```bash
python3 -m http.server
```

Then open `http://localhost:8000` in your browser.

## Controls

| Action        | Keyboard / Mouse                     |
|---------------|--------------------------------------|
| Move          | `W` / `A` / `S` / `D` or arrow keys  |
| Fire          | `Space` (hold to autofire)           |
| Swap polarity | `X`                                  |
| Start / retry | `Space` or tap the screen            |

On touch devices, use the on-screen buttons (◀ ▶ move, SWAP, FIRE).

## Game systems

- **Polarity combat** — bullets only hurt enemies of the same color; the wrong color is invulnerable to you.
- **Combo multiplier** — kills in quick succession multiply your score (up to x8).
- **Overdrive** — catch gold orbs to temporarily damage everything regardless of color.
- **Overload** — staying on one polarity too long (6 kills in a row) summons a red surge of the opposite color.
- **Boss waves** — every 5th wave a boss appears; it flips color periodically and fires spread shots.
- **Enemy types** — straight, sine, homing, and shooter enemies, introduced as waves progress.

## Project structure

```
index.html    — page markup and the arcade cabinet UI
styles.css    — neon styling, glow, scanlines, vignette
script.js     — all game logic (canvas rendering, update loop, audio)
```

Audio is synthesized at runtime with the Web Audio API — no asset files needed.

## Customization ideas

- Tweak difficulty: `OVERLOAD_THRESHOLD` and wave timing in `script.js`.
- Rebalance enemy speed/health in `spawnEnemy()` and `spawnBoss()`.
- Adjust the neon palette in the `:root` variables in `styles.css`.
