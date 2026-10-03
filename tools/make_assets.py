"""스르륵 에셋 생성기 — 배경 이미지·영상, 호흡 안내음, 앱 아이콘을 코드로 직접 그립니다.

모든 결과물은 이 스크립트가 만든 창작물이라 외부 저작권 이슈가 없습니다.
실행: python tools/make_assets.py [images|videos|cues|icons|all]
필요: pip install numpy pillow imageio-ffmpeg
"""
import math
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent.parent
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
TAU = 2 * math.pi


def hexrgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32)


# ---------- 그리기 도구 (좌표는 0~1 비율) ----------
class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
        self.X = xs / w
        self.Y = ys / h
        self.px = 1.0 / h  # 1픽셀의 비율
        self.img = np.zeros((h, w, 3), dtype=np.float32)

    def gradient(self, stops):
        pos = [s[0] for s in stops]
        for c in range(3):
            self.img[..., c] = np.interp(self.Y, pos, [hexrgb(s[1])[c] for s in stops])

    def glow(self, cx, cy, r, color, strength=1.0, aspect=1.0):
        d2 = ((self.X - cx) * self.w / self.h * aspect) ** 2 + (self.Y - cy) ** 2
        g = np.exp(-d2 / (r * r)) * strength
        self.img += g[..., None] * hexrgb(color)

    def blend(self, mask, color, alpha=1.0):
        m = (np.clip(mask, 0, 1) * alpha)[..., None]
        self.img = self.img * (1 - m) + hexrgb(color) * m

    def ridge(self, base, waves, color, alpha=1.0, fade=None):
        """산등성이 실루엣. waves=[(진폭, 주파수, 위상)]"""
        line = base + sum(a * np.sin(TAU * f * self.X + p) for a, f, p in waves)
        mask = np.clip((self.Y - line) / (2.5 * self.px) + 0.5, 0, 1)
        if fade:  # 아래로 갈수록 색이 바뀌는 효과
            col = hexrgb(color)
            alt = hexrgb(fade)
            k = np.clip((self.Y - line) / 0.35, 0, 1)[..., None]
            m = (mask * alpha)[..., None]
            self.img = self.img * (1 - m) + (col * (1 - k) + alt * k) * m
        else:
            self.blend(mask, color, alpha)

    def band(self, cy, width, color, strength, wave=None):
        """가로 띠(안개·파도 반짝임). wave=(진폭, 주파수, 위상)"""
        off = 0 if wave is None else wave[0] * np.sin(TAU * wave[1] * self.X + wave[2])
        g = np.exp(-(((self.Y - cy - off) / width) ** 2)) * strength
        self.img += g[..., None] * hexrgb(color)

    def stars(self, rng, n, t, ymax=0.7, size=1.0):
        xs = rng.random(n)
        ys = rng.random(n) ** 1.3 * ymax
        ph = rng.random(n)
        fr = rng.integers(1, 3, n)
        br = 0.35 + 0.65 * rng.random(n)
        for x, y, p, f, b in zip(xs, ys, ph, fr, br):
            tw = 0.55 + 0.45 * math.sin(TAU * (f * t + p))
            r = (0.0016 + 0.0016 * b) * size
            d2 = ((self.X - x) * self.w / self.h) ** 2 + (self.Y - y) ** 2
            self.img += (np.exp(-d2 / (r * r)) * b * tw)[..., None] * hexrgb("#ffffff")

    def finish(self):
        return (np.clip(self.img, 0, 1) * 255).astype(np.uint8)


# ---------- 장면 5개 (t: 0~1, 1이 되면 처음과 똑같아지는 루프) ----------
def scene_dusk(c, t):
    rng = np.random.default_rng(11)
    c.gradient([(0, "#17164a"), (0.4, "#4e3a86"), (0.68, "#c85f8a"), (0.84, "#f2a373"), (1, "#f8cd8e")])
    c.stars(rng, 40, t, ymax=0.4, size=0.8)
    c.glow(0.5, 0.74, 0.30, "#ff9f70", 0.38)
    c.glow(0.5, 0.74, 0.09, "#ffd6a0", 0.40)
    for i in range(7):
        x0, y0 = rng.random(), 0.2 + 0.5 * rng.random()
        drift = 0.05 * math.sin(TAU * (t + i / 7))
        for k in range(4):  # 둥근 구름 덩어리
            cx = x0 + drift + (k - 1.5) * 0.045
            c.glow(cx, y0 + 0.006 * (k % 2), 0.034, "#ffb6c9", 0.20, aspect=0.5)
    c.ridge(0.84, [(0.015, 1.2, 0.5), (0.008, 2.7, 1.0)], "#3a2a63", fade="#221846")
    c.ridge(0.91, [(0.012, 1.6, 2.2), (0.006, 3.4, 0.3)], "#241a47", fade="#150f33")


def scene_night(c, t):
    rng = np.random.default_rng(23)
    c.gradient([(0, "#04051a"), (0.55, "#11154a"), (1, "#2a2f7a")])
    c.glow(0.72, 0.2, 0.28, "#6b74d6", 0.28)
    c.stars(rng, 170, t, ymax=0.75)
    c.glow(0.72, 0.2, 0.05, "#fff6dc", 0.9)
    # 초승달: 밝은 원에서 어두운 원을 일부 가린다
    d_moon = np.sqrt(((c.X - 0.72) * c.w / c.h) ** 2 + (c.Y - 0.2) ** 2)
    d_cut = np.sqrt(((c.X - 0.745) * c.w / c.h) ** 2 + (c.Y - 0.19) ** 2)
    moon = np.clip((0.045 - d_moon) / (2 * c.px), 0, 1) * (1 - np.clip((0.04 - d_cut) / (2 * c.px), 0, 1))
    c.blend(moon, "#fff3d2")
    c.ridge(0.86, [(0.03, 0.8, 0.2), (0.012, 2.1, 1.4)], "#171a52", fade="#0d0f33")
    c.ridge(0.93, [(0.02, 1.3, 2.5), (0.01, 3.1, 0.6)], "#0b0d2c", fade="#070920")


def scene_forest(c, t):
    rng = np.random.default_rng(37)
    c.gradient([(0, "#031c1c"), (0.5, "#0c4540"), (1, "#1b6b55")])
    for i in range(5):  # 숲 사이로 들어오는 햇살
        x0 = 0.15 + 0.2 * i + 0.04 * rng.random()
        pulse = 0.55 + 0.45 * math.sin(TAU * (t + i / 5))
        d = (c.X - (x0 + 0.28 * c.Y)) * c.w / c.h
        beam = np.exp(-(d / 0.07) ** 2) * np.clip(1 - c.Y * 1.1, 0, 1)
        c.img += (beam * 0.20 * pulse)[..., None] * hexrgb("#d6ffd0")
    # 뾰족한 나무 실루엣(고주파 삼각파)
    for base, f, col, fade in [(0.62, 9, "#0f4a40", "#0a3a33"), (0.74, 6, "#0a362f", "#06231f"), (0.88, 4, "#041c19", "#02100e")]:
        tri = np.abs(((c.X * f) % 1.0) - 0.5) * 2
        line = base - 0.09 * (1 - tri) + 0.02 * np.sin(TAU * 1.3 * c.X + f)
        mask = np.clip((c.Y - line) / (2.5 * c.px) + 0.5, 0, 1)
        c.blend(mask, col)
    for i in range(34):  # 반딧불
        x, y, p = rng.random(), 0.3 + 0.55 * rng.random(), rng.random()
        x += 0.02 * math.sin(TAU * (t + p))
        y += 0.025 * math.sin(TAU * (2 * t + p))
        b = 0.4 + 0.6 * (0.5 + 0.5 * math.sin(TAU * (t + 2 * p)))
        c.glow(x, y, 0.006, "#eaffa8", 0.9 * b)
        c.glow(x, y, 0.02, "#b6ff9a", 0.12 * b)


def scene_ocean(c, t):
    hz = 0.45
    c.gradient([(0, "#091a48"), (hz - 0.02, "#2b6aa5"), (hz, "#a9d4e6"), (hz + 0.001, "#1c6593"), (1, "#04203c")])
    c.glow(0.5, hz, 0.22, "#ffe9c4", 0.45)
    c.glow(0.5, hz, 0.06, "#fff7e2", 0.5)
    below = (c.Y > hz).astype(np.float32)
    # 달빛이 물결에 반사
    refl = np.exp(-(((c.X - 0.5) * c.w / c.h) / 0.10) ** 2) * np.clip(1 - (c.Y - hz) * 1.6, 0, 1) * below
    c.img += (refl * 0.10)[..., None] * hexrgb("#ffe9c4")
    for k in range(12):  # 일렁이는 파도 띠
        y = hz + 0.02 + (k ** 1.55) * 0.012
        n = 1 + (k % 2)
        c.band(y, 0.005 + 0.0016 * k, "#9fd6e8", 0.10 + 0.012 * k,
               wave=(0.004 + 0.0012 * k, 2 + k % 3, TAU * (n * t) + k))
    c.img *= 1 - 0.15 * np.clip((c.Y - 0.85) / 0.15, 0, 1)[..., None]


def scene_mist(c, t):
    c.gradient([(0, "#25235a"), (0.45, "#5f5ca0"), (0.72, "#b6b2d6"), (1, "#dcd8ee")])
    c.glow(0.3, 0.3, 0.25, "#e7d9ff", 0.20)
    layers = [(0.50, "#5a5798", 0.9), (0.60, "#6f6cab", 0.8), (0.70, "#8c89be", 0.75), (0.79, "#aaa7d0", 0.7)]
    for i, (base, col, a) in enumerate(layers):
        c.ridge(base, [(0.035, 0.8 + 0.3 * i, i * 1.7), (0.015, 2.2 + 0.4 * i, i * 0.8)], col, alpha=a)
        # 산 사이 안개
        c.band(base + 0.07, 0.04, "#e8e4f7", 0.22,
               wave=(0.006, 1 + i % 2, TAU * t * (1 if i % 2 else 2) + i))
    c.ridge(0.84, [(0.004, 3, 0.2)], "#c9c5e3")  # 호수 수면
    c.band(0.87, 0.02, "#f4f0ff", 0.12, wave=(0.004, 3, TAU * t))
    c.band(0.93, 0.03, "#8f8bc4", 0.18, wave=(0.005, 2, TAU * 2 * t + 1))


SCENES = {"dusk": scene_dusk, "night": scene_night, "forest": scene_forest, "ocean": scene_ocean, "mist": scene_mist}


def render(name, t, w, h):
    c = Canvas(w, h)
    SCENES[name](c, t)
    return c.finish()


# ---------- 이미지·영상 ----------
def make_images():
    out = ROOT / "assets/images"
    for name in SCENES:
        arr = render(name, 0.0, 540, 960)
        im = Image.fromarray(arr).resize((1080, 1920), Image.LANCZOS)
        im.save(out / f"bg-{name}.webp", quality=80, method=6)
        print("image", name, (out / f"bg-{name}.webp").stat().st_size // 1024, "KB")


def make_videos(fps=24, seconds=8):
    out = ROOT / "assets/video"
    n = fps * seconds
    for name in SCENES:
        dst = out / f"bg-{name}.mp4"
        cmd = [FFMPEG, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "720x1280",
               "-r", str(fps), "-i", "-", "-an", "-c:v", "libx264", "-crf", "31", "-preset", "slow",
               "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(dst)]
        p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        for i in range(n):
            arr = render(name, i / n, 360, 640)
            p.stdin.write(np.asarray(Image.fromarray(arr).resize((720, 1280), Image.BICUBIC)).tobytes())
        p.stdin.close()
        p.wait()
        print("video", name, dst.stat().st_size // 1024, "KB")


# ---------- 호흡 안내음 ----------
def write_wav(path, data, sr=44100):
    pcm = (np.clip(data, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(sr)
        f.writeframes(pcm.tobytes())


def tone(f0, f1, dur, attack, decay, sr=44100):
    t = np.arange(int(sr * dur)) / sr
    freq = f0 + (f1 - f0) * (t / dur)  # 음높이 이동
    phase = TAU * np.cumsum(freq) / sr
    wave_ = np.sin(phase) + 0.3 * np.sin(2 * phase) + 0.1 * np.sin(3 * phase)
    env = np.minimum(t / attack, 1) * np.exp(-t / decay)
    env *= np.clip((dur - t) / 0.08, 0, 1)  # 끝에서 부드럽게
    y = wave_ * env
    return y / np.max(np.abs(y)) * 0.6


def make_cues():
    out = ROOT / "assets/audio/cues"
    tmp = ROOT / "tools/_tmp"
    tmp.mkdir(exist_ok=True)
    cues = {"inhale": tone(392, 523, 0.9, 0.18, 0.55), "hold": tone(440, 440, 0.6, 0.02, 0.25),
            "exhale": tone(523, 330, 1.0, 0.12, 0.6)}
    for name, data in cues.items():
        wav = tmp / f"{name}.wav"
        write_wav(wav, data)
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(wav), "-ac", "1", "-b:a", "64k",
                        str(out / f"{name}.mp3")], check=True)
        print("cue", name, (out / f"{name}.mp3").stat().st_size, "B")


# ---------- 앱 아이콘 ----------
def make_icons():
    out = ROOT / "assets/icons"
    for maskable in (False, True):
        s = 512
        c = Canvas(s, s)
        c.gradient([(0, "#2a2370"), (0.6, "#16174f"), (1, "#0d0f2b")])
        scale = 0.78 if maskable else 1.0
        c.glow(0.5, 0.5, 0.30 * scale, "#9fd6c9", 0.35)
        d = np.sqrt(((c.X - 0.5)) ** 2 + (c.Y - 0.5) ** 2)
        for r, col, a in [(0.30 * scale, "#9fd6c9", 0.30), (0.22 * scale, "#9fd6c9", 0.55), (0.13 * scale, "#f4c98a", 0.95)]:
            c.blend(np.clip((r - d) / (2.5 * c.px) + 0.5, 0, 1), col, a)
        im = Image.fromarray(c.finish())
        if not maskable:  # 둥근 모서리
            mask = Image.new("L", (s, s), 0)
            from PIL import ImageDraw
            ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=255)
            im.putalpha(mask)
        name = "icon-maskable-512.png" if maskable else "icon-512.png"
        im.save(out / name)
        if not maskable:
            im.resize((192, 192), Image.LANCZOS).save(out / "icon-192.png")
    print("icons ok")


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    steps = {"images": make_images, "videos": make_videos, "cues": make_cues, "icons": make_icons}
    for k, fn in steps.items():
        if what in ("all", k):
            fn()
