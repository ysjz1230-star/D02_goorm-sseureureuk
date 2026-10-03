// 호흡 안내음과 배경 소리
export const AMBIENT = [
  { id: "rain", label: "빗소리", icon: "i-rain", src: "/assets/audio/ambient/rain.mp3" },
  { id: "ocean", label: "파도", icon: "i-wave", src: "/assets/audio/ambient/ocean.mp3" },
  { id: "forest", label: "숲의 밤", icon: "i-tree", src: "/assets/audio/ambient/forest.mp3" },
  { id: "wind", label: "바람", icon: "i-wind", src: "/assets/audio/ambient/wind.mp3" },
  { id: "fire", label: "모닥불", icon: "i-flame", src: "/assets/audio/ambient/fire.mp3" },
  { id: "deep", label: "깊은 소리", icon: "i-deep", src: "/assets/audio/ambient/deep.mp3" },
];

const CUE_SRC = {
  inhale: "/assets/audio/cues/inhale.mp3",
  hold: "/assets/audio/cues/hold.mp3",
  exhale: "/assets/audio/cues/exhale.mp3",
};
const cues = {};

export function preloadCues() {
  for (const [k, src] of Object.entries(CUE_SRC)) {
    if (!cues[k]) {
      cues[k] = new Audio(src);
      cues[k].preload = "auto";
    }
  }
}

export function playCue(name) {
  preloadCues();
  const a = cues[name];
  if (!a) return;
  try {
    a.currentTime = 0;
    a.play().catch(() => {});
  } catch {}
}

// ---- 배경 소리 (반복, 부드럽게 켜고 끔) ----
let amb = null;
let fadeTimer = null;

function fade(audio, to, ms, done) {
  clearInterval(fadeTimer);
  const from = audio.volume;
  const steps = Math.max(1, Math.round(ms / 50));
  let i = 0;
  fadeTimer = setInterval(() => {
    i++;
    audio.volume = Math.min(1, Math.max(0, from + ((to - from) * i) / steps));
    if (i >= steps) {
      clearInterval(fadeTimer);
      done?.();
    }
  }, 50);
}

// 반환: 재생 시작 성공 여부
export async function startAmbient(id, volume = 0.3) {
  const def = AMBIENT.find((a) => a.id === id) || AMBIENT[0];
  stopAmbient(true);
  const a = new Audio(def.src);
  a.loop = true;
  a.volume = 0;
  amb = a;
  try {
    await a.play();
    if (amb === a) fade(a, volume, 1500);
    return true;
  } catch {
    if (amb === a) amb = null;
    return false; // 미저장 + 오프라인, 자동재생 차단 등
  }
}

export function stopAmbient(immediate = false) {
  const a = amb;
  amb = null;
  if (!a) return;
  if (immediate) {
    clearInterval(fadeTimer);
    a.pause();
    return;
  }
  fade(a, 0, 800, () => a.pause());
}

export const isAmbientOn = () => !!amb;
