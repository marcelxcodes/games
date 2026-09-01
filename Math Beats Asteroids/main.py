"""Math Beats Asteroids - a small arcade maths game built with pygame.

The game intentionally keeps its save file next to this script so it works when
launched from an IDE, a terminal, or a desktop shortcut.
"""
from __future__ import annotations

import csv
import json
import random
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import pygame


WIDTH, HEIGHT = 1280, 720
FPS = 60
TARGET_SCORE = 31
STARTING_LIVES = 7
MODE_NAMES = {
    1: "Addition",
    2: "Subtraction",
    3: "Multiplication",
    4: "Division",
    5: "Order of Operations",
}

ROOT = Path(__file__).resolve().parent
IMAGES_DIR = ROOT / "assets" / "images"
AUDIO_DIR = ROOT / "assets" / "audio"
TIMES_FILE = ROOT / "data" / "times.csv"
SETTINGS_FILE = ROOT / "data" / "settings.json"

WHITE = (245, 248, 255)
MUTED = (164, 177, 202)
DARK = (9, 14, 30)
PANEL = (18, 27, 52)
PANEL_LIGHT = (30, 43, 76)
BLUE = (77, 169, 255)
CYAN = (82, 231, 220)
GREEN = (88, 222, 145)
RED = (255, 102, 119)
YELLOW = (255, 204, 92)


@dataclass
class Question:
    text: str
    answer: int


@dataclass
class Button:
    rect: pygame.Rect
    label: str
    accent: tuple[int, int, int] = BLUE


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def load_settings() -> dict[str, float]:
    defaults = {"music_volume": 0.45, "effects_volume": 0.70}
    try:
        with SETTINGS_FILE.open(encoding="utf-8") as file:
            saved = json.load(file)
        for key in defaults:
            if isinstance(saved.get(key), (int, float)):
                defaults[key] = clamp(float(saved[key]))
    except (OSError, ValueError, TypeError):
        pass
    return defaults


def save_settings(settings: dict[str, float]) -> None:
    try:
        with SETTINGS_FILE.open("w", encoding="utf-8") as file:
            json.dump(settings, file, indent=2)
    except OSError:
        # A read-only folder should not prevent the game from running.
        pass


def load_times() -> dict[int, list[float]]:
    times = {mode: [] for mode in MODE_NAMES}
    if not TIMES_FILE.exists():
        return times
    try:
        with TIMES_FILE.open(newline="", encoding="utf-8") as file:
            for row in csv.reader(file):
                if len(row) < 2:
                    continue
                try:
                    mode, elapsed = int(row[0]), float(row[1])
                except (TypeError, ValueError):
                    continue
                if mode in times and elapsed > 0:
                    times[mode].append(elapsed)
    except OSError:
        pass
    return times


def save_time(mode: int, elapsed: float) -> None:
    """Append a completed run while preserving the original two-column format."""
    try:
        with TIMES_FILE.open("a", newline="", encoding="utf-8") as file:
            csv.writer(file).writerow([mode, f"{elapsed:.3f}"])
    except OSError:
        pass


def make_question(mode: int, score: int, rng: random.Random) -> Question:
    """Create a valid question whose difficulty rises as the player progresses."""
    tier = min(score // 10, 3)
    if mode == 1:
        limits = [(10, 10), (20, 20), (50, 50), (100, 100)][tier]
        a, b = rng.randint(1, limits[0]), rng.randint(1, limits[1])
        if tier == 3:
            c, d = rng.randint(1, 20), rng.randint(1, 20)
            return Question(f"{a} + {b} + {c} + {d} = ?", a + b + c + d)
        return Question(f"{a} + {b} = ?", a + b)
    if mode == 2:
        a = rng.randint(10 + tier * 15, 25 + tier * 25)
        b = rng.randint(1, min(a, 10 + tier * 8))
        if tier == 3:
            c, d = rng.randint(1, 10), rng.randint(1, 5)
            return Question(f"{a} - {b} - {c} - {d} = ?", a - b - c - d)
        return Question(f"{a} - {b} = ?", a - b)
    if mode == 3:
        max_a = [10, 20, 50, 100][tier]
        a, b = rng.randint(1, max_a), rng.randint(1, 10 if tier < 2 else 12)
        if tier == 3:
            c = rng.randint(1, 5)
            return Question(f"{a} × {b} × {c} = ?", a * b * c)
        return Question(f"{a} × {b} = ?", a * b)
    if mode == 4:
        divisor = rng.randint(1, 5 + tier * 3)
        quotient = rng.randint(2, 10 + tier * 10)
        dividend = divisor * quotient
        return Question(f"{dividend} ÷ {divisor} = ?", quotient)

    if tier == 0:
        a, b, c, d = rng.randint(2, 12), rng.randint(1, 6), rng.randint(1, 8), rng.randint(1, 6)
        return Question(f"({a} × {b}) + {c} - {d} = ?", a * b + c - d)
    if tier == 1:
        a, b, c = rng.randint(1, 6), rng.randint(1, 6), rng.randint(1, 3)
        return Question(f"({a} + {b}) ^ {c} = ?", (a + b) ** c)
    divisor = rng.randint(1, 9)
    quotient = rng.randint(5, 20 + tier * 8)
    a, b = divisor * quotient, rng.randint(1, 8)
    return Question(f"({a} ÷ {divisor}) + {b} = ?", quotient + b)


class MathBeatsAsteroids:
    def __init__(self) -> None:
        pygame.init()
        try:
            pygame.mixer.init()
        except pygame.error:
            pass
        self.screen = pygame.display.set_mode((WIDTH, HEIGHT))
        pygame.display.set_caption("Math Beats Asteroids")
        self.clock = pygame.time.Clock()
        self.rng = random.Random()
        self.settings = load_settings()
        self.times = load_times()
        self.state = "menu"
        self.running = True
        self.mode = 1
        self.score = 0
        self.lives = STARTING_LIVES
        self.elapsed = 0.0
        self.question = Question("", 0)
        self.answer_input = ""
        self.feedback = ""
        self.feedback_color = WHITE
        self.feedback_until = 0
        self.message = ""
        self.message_until = 0
        self.paused_at = 0.0
        self.game_over = False
        self.bullet: Optional[pygame.Rect] = None
        self.asteroid = pygame.Rect(0, -80, 72, 72)
        self.asteroid_speed = 110.0
        # Two-font type system: futuristic display face + highly legible UI face.
        # Use a bundled/fallback futuristic display face and a clean UI face.
        # DejaVu Sans is available with the local Python/Pygame installation and
        # keeps the game portable without downloading assets at runtime.
        self.fonts = {
            "title": pygame.font.SysFont("dejavusans", 62, bold=True),
            "hero": pygame.font.SysFont("dejavusans", 38, bold=True),
            "heading": pygame.font.SysFont("dejavusans", 30, bold=True),
            "body": pygame.font.SysFont("dejavusans", 21),
            "small": pygame.font.SysFont("dejavusans", 16),
            "number": pygame.font.SysFont("dejavusans", 42, bold=True),
        }
        self.assets = self.load_assets()
        self.music_track = None
        self.sounds: dict[str, Optional[pygame.mixer.Sound]] = {}
        self.load_audio()
        self.play_music("menu")

    def load_image(self, filename: str, size: tuple[int, int], fallback_color: tuple[int, int, int]) -> pygame.Surface:
        try:
            image = pygame.image.load(str(IMAGES_DIR / filename)).convert_alpha()
            return pygame.transform.smoothscale(image, size)
        except (pygame.error, FileNotFoundError):
            image = pygame.Surface(size, pygame.SRCALPHA)
            image.fill((*fallback_color, 255))
            return image

    def load_assets(self) -> dict[str, pygame.Surface]:
        return {
            "background": self.load_image("space_background.jpg", (WIDTH, HEIGHT), DARK),
            "logo": self.load_image("logo.png", (360, 360), BLUE),
            "ship": self.load_image("ship.png", (82, 82), CYAN),
            "rock": self.load_image("asteroid.png", (76, 76), (126, 126, 145)),
            "bullet": self.load_image("bullet.png", (24, 36), YELLOW),
            "heart": self.load_image("heart.png", (30, 30), RED),
        }

    def load_audio(self) -> None:
        sound_files = {
            "laser": "laser.wav",
            "hit": "explosion.wav",
            "wrong": "wrong.mp3",
            "win": "victory.mp3",
            "lose": "wompwomp.mp3",
        }
        for name, filename in sound_files.items():
            try:
                self.sounds[name] = pygame.mixer.Sound(str(AUDIO_DIR / filename))
            except (pygame.error, FileNotFoundError):
                self.sounds[name] = None
        self.music_files = {
            "menu": AUDIO_DIR / "menu_music.wav",
            "game": AUDIO_DIR / "game_music.mp3",
        }

    def play_music(self, track: str) -> None:
        if not pygame.mixer.get_init():
            return
        filename = self.music_files.get(track)
        if filename == self.music_track:
            return
        try:
            pygame.mixer.music.load(str(filename))
            pygame.mixer.music.set_volume(self.settings["music_volume"])
            pygame.mixer.music.play(-1)
            self.music_track = filename
        except (pygame.error, FileNotFoundError):
            self.music_track = None

    def play_sound(self, name: str) -> None:
        sound = self.sounds.get(name)
        if sound:
            sound.set_volume(self.settings["effects_volume"])
            sound.play()

    def text(self, value: str, font: str = "body", color: tuple[int, int, int] = WHITE) -> pygame.Surface:
        return self.fonts[font].render(value, True, color)

    def draw_text(self, value: str, position: tuple[int, int], font: str = "body", color: tuple[int, int, int] = WHITE, center: bool = False) -> pygame.Rect:
        surface = self.text(value, font, color)
        rect = surface.get_rect(center=position) if center else surface.get_rect(topleft=position)
        self.screen.blit(surface, rect)
        return rect

    def button(self, button: Button, mouse_pos: tuple[int, int], active: bool = True) -> None:
        hovered = active and button.rect.collidepoint(mouse_pos)
        color = tuple(min(255, c + 25) for c in button.accent) if hovered else button.accent
        pygame.draw.rect(self.screen, color, button.rect, border_radius=12)
        pygame.draw.rect(self.screen, (255, 255, 255, 45), button.rect, 2, border_radius=12)
        self.draw_text(button.label, button.rect.center, "body", WHITE, center=True)

    def draw_icon_clock(self, center: tuple[int, int]) -> None:
        cx, cy = center
        pygame.draw.circle(self.screen, WHITE, (cx, cy), 7, 2)
        pygame.draw.line(self.screen, WHITE, (cx, cy), (cx, cy - 4), 2)
        pygame.draw.line(self.screen, WHITE, (cx, cy), (cx + 3, cy - 1), 2)

    def draw_icon_question(self, center: tuple[int, int]) -> None:
        surface = self.text("?", "heading", WHITE)
        rect = surface.get_rect(center=center)
        self.screen.blit(surface, rect)

    def draw_icon_gear(self, center: tuple[int, int]) -> None:
        cx, cy = center
        for angle in range(0, 360, 45):
            import math
            rad = math.radians(angle)
            start = (cx + int(9 * math.cos(rad)), cy + int(9 * math.sin(rad)))
            end = (cx + int(13 * math.cos(rad)), cy + int(13 * math.sin(rad)))
            pygame.draw.line(self.screen, WHITE, start, end, 2)
        pygame.draw.circle(self.screen, WHITE, (cx, cy), 6, 2)

    def draw_icon_x(self, center: tuple[int, int]) -> None:
        cx, cy = center
        pygame.draw.line(self.screen, WHITE, (cx - 6, cy - 6), (cx + 6, cy + 6), 3)
        pygame.draw.line(self.screen, WHITE, (cx - 6, cy + 6), (cx + 6, cy - 6), 3)

    def panel(self, rect: pygame.Rect, color: tuple[int, int, int] = PANEL) -> None:
        pygame.draw.rect(self.screen, color, rect, border_radius=18)
        pygame.draw.rect(self.screen, (76, 104, 157), rect, 1, border_radius=18)

    def background(self) -> None:
        self.screen.blit(self.assets["background"], (0, 0))
        shade = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        shade.fill((4, 8, 22, 90))
        self.screen.blit(shade, (0, 0))

    def start_game(self, mode: int) -> None:
        self.mode = mode
        self.score = 0
        self.lives = STARTING_LIVES
        self.elapsed = 0.0
        self.answer_input = ""
        self.feedback = ""
        self.message = ""
        self.bullet = None
        self.asteroid_speed = 110.0
        self.asteroid = pygame.Rect(WIDTH // 2 - 38, -85, 76, 76)
        self.question = make_question(mode, self.score, self.rng)
        self.state = "game"
        self.play_music("game")

    def next_asteroid(self) -> None:
        self.asteroid.topleft = (WIDTH // 2 - self.asteroid.width // 2, -85)
        self.asteroid_speed = 110 + self.score * 4

    def submit_answer(self) -> None:
        if not self.answer_input:
            self.set_message("Type an answer first", YELLOW)
            return
        try:
            answer = int(self.answer_input)
        except ValueError:
            answer = None
        self.answer_input = ""
        if answer == self.question.answer:
            self.score += 1
            self.feedback, self.feedback_color = "CORRECT!", GREEN
            self.feedback_until = pygame.time.get_ticks() + 900
            self.play_sound("laser")
            ship = pygame.Rect(WIDTH // 2 - 41, HEIGHT - 98, 82, 82)
            self.bullet = pygame.Rect(ship.centerx - 8, ship.top, 16, 34)
            if self.score >= TARGET_SCORE:
                self.finish_game(True)
            else:
                self.question = make_question(self.mode, self.score, self.rng)
        else:
            self.feedback, self.feedback_color = "TRY AGAIN", RED
            self.feedback_until = pygame.time.get_ticks() + 900
            self.play_sound("wrong")

    def finish_game(self, won: bool) -> None:
        self.game_over = not won
        if won:
            save_time(self.mode, self.elapsed)
            self.times.setdefault(self.mode, []).append(self.elapsed)
            self.play_sound("win")
            self.message = f"Finished in {self.elapsed:.2f} seconds"
        else:
            self.play_sound("lose")
            self.message = f"Final score: {self.score} / {TARGET_SCORE}"
        self.state = "result"
        pygame.mixer.music.pause()

    def set_message(self, message: str, color: tuple[int, int, int] = WHITE) -> None:
        self.message = message
        self.feedback_color = color
        self.message_until = pygame.time.get_ticks() + 1400

    def update_game(self, dt: float) -> None:
        self.elapsed += dt
        self.asteroid.y += int(self.asteroid_speed * dt)
        if self.bullet:
            self.bullet.y -= int(650 * dt)
            if self.bullet.bottom < 0:
                self.bullet = None
            elif self.bullet.colliderect(self.asteroid):
                self.play_sound("hit")
                self.bullet = None
                self.next_asteroid()
        if self.asteroid.top > HEIGHT - 80:
            self.lives -= 1
            self.play_sound("hit")
            self.set_message("ASTEROID GOT THROUGH!", RED)
            self.next_asteroid()
            if self.lives <= 0:
                self.finish_game(False)

    def handle_game_event(self, event: pygame.event.Event) -> None:
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_ESCAPE:
                self.state = "pause"
                self.paused_at = time.monotonic()
            elif event.key in (pygame.K_RETURN, pygame.K_KP_ENTER):
                self.submit_answer()
            elif event.key == pygame.K_BACKSPACE:
                self.answer_input = self.answer_input[:-1]
            elif event.unicode.isdigit() and len(self.answer_input) < 7:
                self.answer_input += event.unicode
        elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            if pygame.Rect(WIDTH - 104, 22, 76, 42).collidepoint(event.pos):
                self.state = "pause"
                self.paused_at = time.monotonic()

    def draw_hud(self) -> None:
        self.panel(pygame.Rect(20, 18, 330, 82))
        self.draw_text(f"SCORE  {self.score:02d} / {TARGET_SCORE}", (38, 31), "heading", CYAN)
        for index in range(self.lives):
            self.screen.blit(self.assets["heart"], (38 + index * 35, 68))
        self.draw_text(f"{self.lives} lives", (295, 72), "small", MUTED)
        self.panel(pygame.Rect(WIDTH - 230, 18, 126, 82))
        self.draw_text(f"{self.elapsed:05.1f}s", (WIDTH - 167, 43), "heading", YELLOW, center=True)
        self.draw_text("TIME", (WIDTH - 167, 77), "small", MUTED, center=True)
        pause = Button(pygame.Rect(WIDTH - 104, 22, 76, 42), "Ⅱ", PANEL_LIGHT)
        self.button(pause, pygame.mouse.get_pos())

    def draw_game(self) -> None:
        self.background()
        self.draw_hud()
        ship_rect = self.assets["ship"].get_rect(center=(WIDTH // 2, HEIGHT - 55))
        self.screen.blit(self.assets["ship"], ship_rect)
        self.screen.blit(self.assets["rock"], self.asteroid)
        if self.bullet:
            self.screen.blit(self.assets["bullet"], self.bullet)

        question_panel = pygame.Rect(70, 145, WIDTH - 140, 205)
        self.panel(question_panel)
        self.draw_text(MODE_NAMES[self.mode].upper(), (WIDTH // 2, 177), "small", CYAN, center=True)
        self.draw_text(self.question.text, (WIDTH // 2, 222), "number", WHITE, center=True)
        input_box = pygame.Rect(WIDTH // 2 - 180, 260, 360, 58)
        pygame.draw.rect(self.screen, DARK, input_box, border_radius=10)
        pygame.draw.rect(self.screen, BLUE, input_box, 2, border_radius=10)
        self.draw_text(self.answer_input or "answer", input_box.center, "heading", WHITE if self.answer_input else MUTED, center=True)
        self.draw_text("Enter to fire  •  Backspace to erase  •  Esc to pause", (WIDTH // 2, 334), "small", MUTED, center=True)
        now = pygame.time.get_ticks()
        if self.feedback and now < self.feedback_until:
            self.draw_text(self.feedback, (WIDTH // 2, 385), "heading", self.feedback_color, center=True)
        if self.message and now < self.message_until:
            self.draw_text(self.message, (WIDTH // 2, 420), "body", self.feedback_color, center=True)

    def draw_menu(self) -> list[Button]:
        """Draw the menu only; button order and click behavior remain unchanged."""
        self.background()
        mouse_pos = pygame.mouse.get_pos()

        # Centered two-column composition: brand supports the focal mission panel.
        brand_panel = pygame.Rect(54, 42, 390, 650)
        mission_panel = pygame.Rect(480, 42, 746, 650)
        self.panel(brand_panel, (12, 22, 47))
        self.panel(mission_panel, (15, 25, 54))

        logo_rect = self.assets["logo"].get_rect(center=(brand_panel.centerx, 220))
        self.screen.blit(self.assets["logo"], logo_rect)
        # The logo already contains the full brand name; avoid repeating it.
        pygame.draw.line(self.screen, CYAN, (130, 430), (368, 430), 2)
        self.draw_text("Solve fast. Shoot smart.", (brand_panel.centerx, 470), "body", WHITE, center=True)
        self.draw_text("Save your best time.", (brand_panel.centerx, 505), "small", (205, 216, 235), center=True)

        # Five evenly spaced missions, plus a badge that makes the 5th read as
        # deliberately special (it is the hardest / bonus mission).
        self.draw_text("5 TRAINING SECTORS", (mission_panel.centerx, 150), "small", (205, 216, 235), center=True)
        self.draw_text("SECTOR 5 · BONUS", (mission_panel.centerx, 417), "small", YELLOW, center=True)
        self.draw_text("Type your answer, then press ENTER to fire.", (mission_panel.centerx, 490), "small", (205, 216, 235), center=True)
        self.draw_text("Tip: wrong answers never cost a life.", (mission_panel.centerx, 514), "small", (205, 216, 235), center=True)

        self.draw_text("CHOOSE A MISSION", (mission_panel.centerx, 82), "title", WHITE, center=True)
        self.draw_text("Select a training sector to begin", (mission_panel.centerx, 122), "body", (205, 216, 235), center=True)

        buttons = []
        mission_width, mission_height = 300, 70
        grid_left = mission_panel.centerx - mission_width - 12
        for index, (mode, name) in enumerate(MODE_NAMES.items()):
            x = grid_left + (index % 2) * (mission_width + 24)
            y = 170 + (index // 2) * 82
            if index == 4:
                x = mission_panel.centerx - mission_width // 2
            button = Button(pygame.Rect(x, y, mission_width, mission_height), name, (37, 105, 173))
            buttons.append(button)
            self.button(button, mouse_pos)

        # Secondary actions stay inside the same mission panel, grouped below a divider.
        pygame.draw.line(self.screen, (76, 104, 157), (518, 543), (1188, 543), 1)
        extras = [
            Button(pygame.Rect(518, 565, 166, 48), "Best times", PANEL_LIGHT),
            Button(pygame.Rect(700, 565, 166, 48), "How to play", PANEL_LIGHT),
            Button(pygame.Rect(882, 565, 166, 48), "Settings", PANEL_LIGHT),
            Button(pygame.Rect(1064, 565, 166, 48), "Quit", (104, 57, 75)),
        ]
        for button in extras:
            self.button(button, mouse_pos)
        # Draw reliable icons (pure shapes, no font glyphs) left of each label.
        icon_y = 589
        self.draw_icon_clock((535, icon_y))
        self.draw_icon_question((717, icon_y))
        self.draw_icon_gear((899, icon_y))
        self.draw_icon_x((1081, icon_y))
        return buttons + extras

    def draw_times(self) -> list[Button]:
        self.background()
        self.draw_text("BEST TIMES", (WIDTH // 2, 55), "title", WHITE, center=True)
        self.draw_text("Your three fastest completed runs per mission", (WIDTH // 2, 105), "body", MUTED, center=True)
        for index, (mode, name) in enumerate(MODE_NAMES.items()):
            x = 55 + (index % 3) * 405
            y = 155 + (index // 3) * 205
            rect = pygame.Rect(x, y, 365, 170)
            self.panel(rect)
            self.draw_text(f"{mode}. {name}", (x + 20, y + 17), "heading", CYAN)
            entries = sorted(self.times.get(mode, []))[:3]
            if not entries:
                self.draw_text("No completed runs yet", (x + 20, y + 78), "body", MUTED)
            for place, value in enumerate(entries):
                color = YELLOW if place == 0 else WHITE
                self.draw_text(f"{place + 1}    {value:.2f} seconds", (x + 25, y + 65 + place * 30), "body", color)
        back = Button(pygame.Rect(55, HEIGHT - 65, 160, 45), "Back", PANEL_LIGHT)
        self.button(back, pygame.mouse.get_pos())
        return [back]

    def draw_tips(self) -> list[Button]:
        self.background()
        self.draw_text("HOW TO PLAY", (WIDTH // 2, 55), "title", WHITE, center=True)
        tips = [
            ("1", ["Solve the question", "to charge your laser."]),
            ("2", ["Press Enter to fire", "at the falling asteroid."]),
            ("3", ["Wrong answers do not cost a life,", "but time keeps moving."]),
            ("4", ["Letting an asteroid through", "costs one of your seven lives."]),
            ("5", [f"Destroy {TARGET_SCORE} asteroids", "to complete the mission."]),
            ("6", ["Escape or the pause button", "opens a safe pause menu."]),
        ]
        for index, (number, lines) in enumerate(tips):
            x, y = 190 + (index % 2) * 470, 145 + (index // 2) * 125
            self.panel(pygame.Rect(x, y, 410, 94))
            self.draw_text(number, (x + 32, y + 47), "heading", YELLOW, center=True)
            self.draw_text(lines[0], (x + 68, y + 18), "body", WHITE)
            self.draw_text(lines[1], (x + 68, y + 51), "small", MUTED)
        back = Button(pygame.Rect(55, HEIGHT - 65, 160, 45), "Back", PANEL_LIGHT)
        self.button(back, pygame.mouse.get_pos())
        return [back]

    def draw_settings(self) -> list[Button]:
        self.background()
        self.draw_text("SETTINGS", (WIDTH // 2, 70), "title", WHITE, center=True)
        self.panel(pygame.Rect(300, 145, 680, 350))
        controls = []
        for index, (key, label) in enumerate((("music_volume", "Music"), ("effects_volume", "Sound effects"))):
            y = 235 + index * 105
            self.draw_text(label, (365, y - 22), "heading", WHITE)
            track = pygame.Rect(365, y + 30, 440, 10)
            pygame.draw.rect(self.screen, PANEL_LIGHT, track, border_radius=5)
            filled = pygame.Rect(track.x, track.y, int(track.width * self.settings[key]), track.height)
            pygame.draw.rect(self.screen, CYAN, filled, border_radius=5)
            pygame.draw.circle(self.screen, WHITE, (filled.right, track.centery), 12)
            self.draw_text(f"{int(self.settings[key] * 100)}%", (840, y + 18), "body", CYAN)
            controls.append((key, pygame.Rect(track.x - 15, track.y - 18, track.width + 30, 46)))
        self.draw_text("Volume choices are saved automatically.", (WIDTH // 2, 460), "small", MUTED, center=True)
        back = Button(pygame.Rect(560, 555, 160, 48), "Back", PANEL_LIGHT)
        self.button(back, pygame.mouse.get_pos())
        return controls + [("__back__", back.rect)]

    def draw_pause(self) -> list[Button]:
        self.draw_game()
        overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        overlay.fill((3, 7, 18, 190))
        self.screen.blit(overlay, (0, 0))
        self.panel(pygame.Rect(WIDTH // 2 - 230, 145, 460, 390))
        self.draw_text("PAUSED", (WIDTH // 2, 205), "title", WHITE, center=True)
        self.draw_text("Take a breath, commander.", (WIDTH // 2, 260), "body", MUTED, center=True)
        buttons = [
            Button(pygame.Rect(WIDTH // 2 - 150, 300, 300, 55), "Continue", (42, 147, 116)),
            Button(pygame.Rect(WIDTH // 2 - 150, 370, 300, 55), "Restart mission", PANEL_LIGHT),
            Button(pygame.Rect(WIDTH // 2 - 150, 440, 300, 55), "Main menu", (135, 52, 73)),
        ]
        for button in buttons:
            self.button(button, pygame.mouse.get_pos())
        return buttons

    def draw_result(self) -> list[Button]:
        self.background()
        if self.game_over:
            self.draw_text("MISSION FAILED", (WIDTH // 2, 150), "title", RED, center=True)
            self.draw_text("The asteroid field got the better of you.", (WIDTH // 2, 220), "body", MUTED, center=True)
        else:
            self.draw_text("MISSION COMPLETE!", (WIDTH // 2, 150), "title", GREEN, center=True)
            self.draw_text("Excellent work, commander.", (WIDTH // 2, 220), "body", MUTED, center=True)
        self.panel(pygame.Rect(WIDTH // 2 - 245, 270, 490, 115))
        self.draw_text(self.message, (WIDTH // 2, 327), "heading", YELLOW if not self.game_over else WHITE, center=True)
        buttons = [
            Button(pygame.Rect(WIDTH // 2 - 230, 450, 210, 56), "Play again", (42, 147, 116)),
            Button(pygame.Rect(WIDTH // 2 + 20, 450, 210, 56), "Main menu", PANEL_LIGHT),
        ]
        for button in buttons:
            self.button(button, pygame.mouse.get_pos())
        return buttons

    def handle_menu_click(self, event: pygame.event.Event, buttons: list[Button]) -> None:
        if event.type != pygame.MOUSEBUTTONDOWN or event.button != 1:
            return
        for index, button in enumerate(buttons):
            if button.rect.collidepoint(event.pos):
                if index < 5:
                    self.start_game(index + 1)
                elif index == 5:
                    self.state = "times"
                elif index == 6:
                    self.state = "tips"
                elif index == 7:
                    self.state = "settings"
                else:
                    self.running = False
                return

    def handle_simple_click(self, event: pygame.event.Event, buttons: list[Button], destination: str = "menu") -> None:
        if event.type != pygame.MOUSEBUTTONDOWN or event.button != 1:
            return
        for index, button in enumerate(buttons):
            if button.rect.collidepoint(event.pos):
                if self.state == "settings" and index == 0:
                    save_settings(self.settings)
                self.state = destination
                if destination == "menu":
                    self.play_music("menu")
                return

    def handle_settings_click(self, event: pygame.event.Event, controls: list[tuple[str, pygame.Rect]], back: pygame.Rect) -> None:
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            if back.collidepoint(event.pos):
                save_settings(self.settings)
                self.state = "menu"
                self.play_music("menu")
                return
            for key, rect in controls:
                if rect.collidepoint(event.pos):
                    self.set_volume(key, event.pos[0], rect)
        elif event.type == pygame.MOUSEMOTION and pygame.mouse.get_pressed()[0]:
            for key, rect in controls:
                if rect.collidepoint(event.pos):
                    self.set_volume(key, event.pos[0], rect)

    def set_volume(self, key: str, x: int, rect: pygame.Rect) -> None:
        self.settings[key] = clamp((x - rect.left) / rect.width)
        if key == "music_volume" and pygame.mixer.get_init():
            pygame.mixer.music.set_volume(self.settings[key])
        save_settings(self.settings)

    def run(self) -> None:
        menu_buttons: list[Button] = []
        while self.running:
            dt = self.clock.tick(FPS) / 1000.0
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False
                elif self.state == "menu":
                    self.handle_menu_click(event, menu_buttons)
                elif self.state == "game":
                    self.handle_game_event(event)
                elif self.state == "pause":
                    self.handle_pause_event(event)
                elif self.state == "result":
                    self.handle_result_event(event)
                elif self.state == "times":
                    self.handle_simple_click(event, self.page_buttons, "menu")
                elif self.state == "tips":
                    self.handle_simple_click(event, self.page_buttons, "menu")
                elif self.state == "settings":
                    self.handle_settings_click(event, self.setting_controls[:-1], self.page_buttons[-1])
            if self.state == "game":
                self.update_game(dt)
            if self.state == "menu":
                menu_buttons = self.draw_menu()
            elif self.state == "game":
                self.draw_game()
            elif self.state == "pause":
                self.page_buttons = self.draw_pause()
            elif self.state == "result":
                self.page_buttons = self.draw_result()
            elif self.state == "times":
                self.page_buttons = self.draw_times()
            elif self.state == "tips":
                self.page_buttons = self.draw_tips()
            elif self.state == "settings":
                self.setting_controls = self.draw_settings()
            pygame.display.flip()
        save_settings(self.settings)
        pygame.quit()

    def handle_pause_event(self, event: pygame.event.Event) -> None:
        if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
            self.state = "game"
            return
        if event.type != pygame.MOUSEBUTTONDOWN or event.button != 1:
            return
        buttons = self.page_buttons
        for index, button in enumerate(buttons):
            if button.rect.collidepoint(event.pos):
                if index == 0:
                    self.state = "game"
                elif index == 1:
                    self.start_game(self.mode)
                else:
                    self.state = "menu"
                    self.play_music("menu")
                return

    def handle_result_event(self, event: pygame.event.Event) -> None:
        if event.type != pygame.MOUSEBUTTONDOWN or event.button != 1:
            return
        for index, button in enumerate(self.page_buttons):
            if button.rect.collidepoint(event.pos):
                if index == 0:
                    self.start_game(self.mode)
                else:
                    self.state = "menu"
                    self.play_music("menu")
                return


def main() -> None:
    MathBeatsAsteroids().run()


if __name__ == "__main__":
    main()
