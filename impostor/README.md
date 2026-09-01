# IMPOSTER

> **One word goes around the table. One player never sees it. Find the liar before they find the word.**

**IMPOSTER** is a fast-paced social deduction party game designed for playing together on a single phone or screen.

Everyone receives the same secret word — except one player.

That player is the **Imposter**.

Give clues, read the room, vote carefully, and catch the Imposter before they survive enough rounds to escape.

---

## Features

### Secret Role Assignment

Before the game begins, players privately reveal their cards one at a time.

- Normal players receive the secret word.
- One randomly selected player becomes the Imposter.
- Role cards are revealed through an interactive flip-card animation.
- Players pass the phone around so each person can privately view their assignment.

### Player Setup

Add everyone playing at the table before starting.

- Supports custom player names
- Requires at least **3 players**
- Players can be added or removed
- Player order is randomized when the game begins

### Custom Word Decks

Create and manage your own collections of secret words.

Built-in decks include:

- 🐆 **Animals**
- 🎬 **Movies**
- 🍕 **Food**
- 🎲 **Random Words**

You can:

- Create new decks
- Rename decks
- Add cards/words
- Remove cards
- Delete decks
- Reuse decks across games

Deck changes are automatically persisted when storage is available.

### Randomized Gameplay

Each game randomly selects:

1. A word from the chosen deck
2. An Imposter
3. The order in which players reveal their roles
4. The clue order
5. The voting order

This keeps each game unpredictable.

### Clue Phase

Every player gives **one clue** about the secret word without saying the word itself.

Players take turns around the table, with the current speaker clearly displayed on screen.

The Imposter has to blend in by listening carefully and giving a believable clue without knowing the secret word.

### Voting

After everyone gives a clue, players privately vote for who they believe is the Imposter.

- Players vote one at a time
- Players cannot vote for themselves
- Votes are hidden until everyone has voted
- The player with the most votes is eliminated
- Ties result in no elimination

### Multiple Rounds

If the group eliminates an innocent player, the game continues.

Players can choose how many elimination rounds are allowed before the Imposter escapes.

If the Imposter survives all selected rounds, **the Imposter wins**.

If the Imposter is eliminated, **the players win**.

### Round Results

After each vote, the game displays:

- Who was eliminated
- Whether they were the Imposter
- Vote totals
- Vote percentages
- Remaining rounds

### Final Results

At the end of the game, players can see:

- Whether the Imposter was caught
- Who the Imposter was
- The secret word
- The elimination order
- Whether the Imposter escaped

Players can immediately start another round or return to the home screen.

---

## How to Play

### 1. Start a Game

Open the app and select **Start Game**.

### 2. Add Players

Enter everyone's name.

You need at least **3 players** to continue.

### 3. Choose a Deck

Select the deck containing the words you want to play with.

### 4. Choose the Number of Rounds

Choose how many elimination rounds the group gets before the Imposter automatically escapes.

### 5. Reveal Roles

Pass the phone to each player.

Each player taps their card to privately reveal:

- The secret word, or
- **YOU ARE THE IMPOSTER**

Hide the card and pass the phone to the next player.

### 6. Give Clues

Each player gives one clue describing the secret word.

**Do not say the word itself.**

The Imposter must try to figure out the word from everyone else's clues.

### 7. Vote

Pass the phone around again.

Each player privately selects the person they believe is the Imposter.

### 8. Reveal the Vote

The game counts the votes and eliminates the player with the most votes.

### 9. Continue or Finish

- If the Imposter is caught → **Players win**
- If the maximum number of rounds is reached → **Imposter wins**
- If an innocent player is eliminated → **Continue to the next round**

---

## Game Flow

```text
HOME
  │
  ▼
PLAYER SETUP
  │
  ▼
DECK SELECTION
  │
  ▼
ROLE REVEAL
  │
  ▼
CLUE ROUND
  │
  ▼
VOTING
  │
  ▼
ROUND RESULT
  │
  ├── Imposter caught ──────► FINAL RESULTS
  │
  ├── Rounds exhausted ─────► FINAL RESULTS
  │
  └── Game continues ───────► NEXT CLUE ROUND
