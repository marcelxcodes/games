# Math Beats Asteroids 🚀🧮

A fast-paced space-arcade math game built with **Python + Pygame**. Solve math
questions to charge your laser, destroy falling asteroids before they reach
your ship, and chase your best time across five mission types.

## Gameplay

- A math question appears at the top of the screen.
- Type your answer and press **Enter** to fire your laser at the falling asteroid.
- **Correct answer** → the asteroid is destroyed, your score goes up.
- **Wrong answer** → the asteroid keeps falling, but you don't lose a life.
- **Asteroid reaches the bottom** → you lose one of your 7 lives.
- Destroy **31 asteroids** to complete the mission and save your time.
- Lose all 7 lives and it's game over.

## Controls

| Action                  | Key / Input                          |
| ----------------------- | ------------------------------------ |
| Type your answer        | Number keys (0–9)                    |
| Submit / fire laser     | `Enter`                              |
| Erase last digit        | `Backspace`                          |
| Pause                   | `Esc` or the pause button (top right)|
| Menu navigation         | Mouse                                |

## Game Modes

| #  | Mode                | Difficulty progression                      |
| -- | ------------------- | ------------------------------------------- |
| 1  | Addition            | 1–10 → 1–20 → 1–50 → four-number sums       |
| 2  | Subtraction         | Two numbers → multi-step subtraction        |
| 3  | Multiplication      | Tables up to 10 → larger products           |
| 4  | Division            | Always exact, whole-number division         |
| 5  | Order of Operations | Bonus mission with mixed PEMDAS expressions |

Questions get harder as your score climbs within each mission.

## Project Structure

```
├── main.py              # The entire game (UI, logic, saving)
├── assets/
│   ├── images/          # Sprites, logo, and background art
│   └── audio/           # Sound effects and music
├── data/
│   ├── times.csv        # Saved best times per mode
│   └── settings.json    # Volume settings (created on first run)
└── .venv/               # Local Python environment
```

## Requirements

- Python 3.10+
- [Pygame](https://www.pygame.org/) 2.x

## Setup & Run

### Option A: Using the project's virtual environment (recommended)

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install pygame
python main.py
```

### Option B: Any Python environment

```bash
pip install pygame
python main.py
```

> Tip: the game also runs from a double-click on `main.py` in most file
> explorers, as long as Pygame is installed.

## Save Data

- **Best times** are stored in `data/times.csv` (one row per completed run:
  `mode,seconds`). The "Best times" menu shows your three fastest runs per mode.
- **Volume settings** are stored in `data/settings.json` and saved automatically.
- Both files are created next to `main.py` on first use, so the game works no
  matter where the folder lives.

## Credits

- Built with [Pygame](https://www.pygame.org/).
- Art and music are bundled in `assets/`; the stylized logo is the game's
  original artwork.
