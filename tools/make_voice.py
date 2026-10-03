"""가이드 음성 생성: 원고 → TTS(문장별) → 쉼 배분 → 모노 64kbps mp3 (-19 LUFS).
실행: python tools/make_voice.py
주의: 임시(placeholder) 음성입니다. 배포 전 직접 녹음하거나, 상업 이용이 허용된 음성으로 교체하세요."""
import hashlib
import json
import subprocess
import wave
from pathlib import Path

import numpy as np
import imageio_ffmpeg

from narration import SESSIONS

ROOT = Path(__file__).resolve().parent.parent
TMP = ROOT / "tools/_tmp/voice"
TMP.mkdir(parents=True, exist_ok=True)
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SR = 22050
LEAD = 0.5  # 앞뒤 무음


def fname(text):
    return hashlib.md5(text.encode("utf-8")).hexdigest()[:12] + ".wav"


def read(path):
    with wave.open(str(path), "rb") as f:
        assert f.getframerate() == SR and f.getnchannels() == 1
        return np.frombuffer(f.readframes(f.getnframes()), dtype="<i2")


def main():
    items = {}
    for s in SESSIONS.values():
        for text, _ in s["lines"]:
            items[fname(text)] = text
    jpath = TMP / "items.json"
    jpath.write_text(json.dumps([{"file": k, "text": v} for k, v in items.items()], ensure_ascii=False), encoding="utf-8")
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ROOT / "tools/tts.ps1"),
                    "-Json", str(jpath), "-OutDir", str(TMP)], check=True)

    out_dir = ROOT / "assets/audio/guides"
    for sid, s in SESSIONS.items():
        clips = [read(TMP / fname(t)) for t, _ in s["lines"]]
        weights = np.array([w for _, w in s["lines"]], dtype=float)
        target = s["minutes"] * 60 - 2 * LEAD
        speech = sum(len(c) for c in clips) / SR
        free = target - speech
        assert free > 0, f"{sid}: 음성이 목표보다 깁니다({speech:.0f}s)"
        pauses = free * weights / weights.sum()
        parts = [np.zeros(int(LEAD * SR), dtype="<i2")]
        for clip, p in zip(clips, pauses):
            parts += [clip, np.zeros(int(p * SR), dtype="<i2")]
        parts.append(np.zeros(int(LEAD * SR), dtype="<i2"))
        data = np.concatenate(parts)
        wav = TMP / f"{sid}.wav"
        with wave.open(str(wav), "wb") as f:
            f.setnchannels(1)
            f.setsampwidth(2)
            f.setframerate(SR)
            f.writeframes(data.tobytes())
        dst = out_dir / f"{sid}.mp3"
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(wav), "-af", "loudnorm=I=-19:TP=-2:LRA=7",
                        "-ar", "44100", "-ac", "1", "-b:a", "64k", str(dst)], check=True)
        print(sid, f"{len(data) / SR:.0f}s (음성 {speech:.0f}s)", dst.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
