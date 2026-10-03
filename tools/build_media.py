"""data/media.json 생성: 오프라인 저장 대상 파일 목록과 실제 크기를 계산합니다.
실행: python tools/build_media.py   (에셋·코드를 바꾼 뒤 항상 다시 실행)"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSION = 1
AMBIENT_LABELS = {"rain": "빗소리", "ocean": "파도", "forest": "숲의 밤", "wind": "바람", "fire": "모닥불", "deep": "깊은 소리"}


def entry(p, **extra):
    rel = "/" + p.relative_to(ROOT).as_posix()
    return {"path": rel, "bytes": p.stat().st_size, **extra}


def files(pattern, **kw):
    return [entry(p, **kw) for p in sorted(ROOT.glob(pattern)) if p.is_file()]


def main():
    sessions = json.loads((ROOT / "data/sessions.json").read_text(encoding="utf-8"))
    a = []
    for name in ("index.html", "styles.css", "app.js", "manifest.webmanifest"):
        a.append(entry(ROOT / name))
    a += files("js/*.js")
    a += files("data/*.json")  # media.json 자신 포함(아래에서 크기 보정)
    a += files("assets/fonts/*.woff2")
    a += files("assets/icons/*.png")
    a += files("assets/images/*.webp")
    a += files("assets/audio/cues/*.mp3")

    media = {
        "version": VERSION,
        "groups": {
            "A": {"label": "앱 기본 파일", "desc": "호흡 운동에 필요한 화면·배경 이미지·안내음. 처음 열 때 자동 저장돼요.", "files": a},
            "B1": {"label": "배경 영상", "desc": "호흡·명상 화면에 흐르는 5개의 느린 풍경 영상", "files": files("assets/video/*.mp4")},
            "B2": {"label": "배경 소리", "desc": "빗소리·파도·숲의 밤 등 6개의 반복 재생 소리",
                   "files": [entry(p, label=AMBIENT_LABELS.get(p.stem, p.stem)) for p in sorted((ROOT / "assets/audio/ambient").glob("*.mp3"))]},
            "B3": {"label": "명상 음성", "desc": "가이드 명상 7개. 원하는 것만 골라 저장할 수 있어요.",
                   "files": [entry(ROOT / s["audio"].lstrip("/"), label=f'{s["title"]} · {s["minutes"]}분', sessionId=s["id"]) for s in sessions]},
        },
    }
    dst = ROOT / "data/media.json"
    dst.write_text(json.dumps(media, ensure_ascii=False, indent=1), encoding="utf-8")
    for g, v in media["groups"].items():
        print(g, len(v["files"]), "files", round(sum(f["bytes"] for f in v["files"]) / 1024 / 1024, 2), "MB")


if __name__ == "__main__":
    main()
