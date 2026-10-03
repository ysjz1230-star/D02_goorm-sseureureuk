// 기기 기능: 화면 켜짐 유지, 진동, 동작 줄이기 설정
let lock = null;
let wanted = false;

async function request() {
  try {
    if ("wakeLock" in navigator) {
      lock = await navigator.wakeLock.request("screen");
      lock.addEventListener?.("release", () => (lock = null));
    }
  } catch {
    lock = null; // 미지원·거부는 무시
  }
}

export function keepAwake() {
  wanted = true;
  return request();
}

export function releaseAwake() {
  wanted = false;
  try {
    lock?.release();
  } catch {}
  lock = null;
}

document.addEventListener("visibilitychange", () => {
  if (wanted && document.visibilityState === "visible" && !lock) request();
});

// iOS Safari는 vibrate를 지원하지 않는다 → 소리·시각 안내가 기본
export const canVibrate = "vibrate" in navigator && !/iPhone|iPad|iPod/.test(navigator.userAgent);

export function vibrate(ms = 40) {
  if (!canVibrate) return;
  try {
    navigator.vibrate(ms);
  } catch {}
}

export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
