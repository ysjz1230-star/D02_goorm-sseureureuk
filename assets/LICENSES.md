# 에셋 라이선스 기록표

배포 전 모든 행의 "확인일"을 채우세요. **불확실한 파일은 사용하지 않습니다.**

| 파일 | 종류 | 출처 | 제작자 | 라이선스 | 귀속 표시 | 확인일 |
|---|---|---|---|---|---|---|
| `images/bg-*.webp` (5) | 이미지 | `tools/make_assets.py`로 코드 생성 | 이 프로젝트 | 직접 제작(저작권 이슈 없음) | 불필요 | 2026-10-03 |
| `video/bg-*.mp4` (5) | 영상 | `tools/make_assets.py`로 코드 생성 | 이 프로젝트 | 직접 제작 | 불필요 | 2026-10-03 |
| `audio/cues/*.mp3` (3) | 호흡 안내음 | `tools/make_assets.py`로 사인파 합성 | 이 프로젝트 | 직접 제작 | 불필요 | 2026-10-03 |
| `icons/*.png` | 앱 아이콘 | `tools/make_assets.py`로 코드 생성 | 이 프로젝트 | 직접 제작 | 불필요 | 2026-10-03 |
| `audio/ambient/*.mp3` (6) | 배경 소리 | 프로젝트의 `sound/` 폴더 샘플(코드로 합성한 소리로 알고 있음) | 이 프로젝트 | 직접 합성 | 불필요 | **확인 필요** |
| `fonts/PretendardVariable.woff2` | 폰트 | https://github.com/orioncactus/pretendard (v1.3.9) | Kil Hyung-jin 외 | SIL Open Font License 1.1 (`fonts/PRETENDARD_LICENSE.txt`) | 라이선스 문구 동봉 | 2026-10-03 |
| `audio/guides/s01~s07.mp3` (7) | 가이드 음성 | 직접 쓴 원고(`tools/narration.py`) + Windows 내장 TTS(Microsoft Heami)로 임시 생성 | 이 프로젝트(원고) | **임시(placeholder)** — Windows TTS 음성의 상업적 이용·재배포 조건이 불명확 | - | **교체 필요** |

## 배포 전 해야 할 일
1. **가이드 음성 교체**: 직접 녹음하거나, 상업적 이용·재배포가 약관상 허용되는 TTS/라이선스 음원으로 바꾸세요. 파일 이름(`s01.mp3`…)과 길이를 유지하면 코드 수정이 필요 없습니다. 바꾼 뒤 `python tools/build_media.py`를 다시 실행하고 위 표를 갱신하세요.
2. **배경 소리 출처 확인**: `sound/` 폴더 파일의 출처가 직접 합성한 것이 맞는지 확인하세요.
3. 외부 사이트에서 소리·영상·이미지를 추가할 때는 내려받는 시점의 라이선스(상업 이용·수정·귀속 표시)를 확인해 이 표에 기록하세요.
