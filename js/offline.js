// 오프라인 저장: 상태 확인, B등급 다운로드(진행률)·삭제, 저장 공간, 온라인 감지
import { load, save, KEYS } from "./storage.js";

const MEDIA_CACHE = "media-v1";
export const hasCache = typeof caches !== "undefined";
export const isOnline = () => navigator.onLine;

let mediaPromise = null;
export function loadMedia() {
  if (!mediaPromise) {
    mediaPromise = fetch("/data/media.json")
      .then((r) => {
        if (!r.ok) throw new Error("media.json " + r.status);
        return r.json();
      })
      .catch((e) => {
        mediaPromise = null;
        throw e;
      });
  }
  return mediaPromise;
}

// 어떤 캐시에든 저장돼 있는가 (A는 app 캐시, B는 media 캐시)
export async function isCached(path) {
  if (!hasCache) return false;
  try {
    return !!(await caches.match(path, { ignoreSearch: true }));
  } catch {
    return false;
  }
}

// 그룹(또는 파일 목록)의 저장 현황: {saved, total, bytesSaved, bytesTotal, set:Set(저장된 path)}
export async function statusOf(files) {
  const set = new Set();
  let bytesSaved = 0;
  await Promise.all(
    files.map(async (f) => {
      if (await isCached(f.path)) {
        set.add(f.path);
        bytesSaved += f.bytes;
      }
    })
  );
  return { saved: set.size, total: files.length, bytesSaved, bytesTotal: files.reduce((s, f) => s + f.bytes, 0), set };
}

// 파일들을 내려받아 media 캐시(A는 app 캐시)에 저장. onProgress(0~1)
// 저장 본문은 전체(200) 응답으로 보관 → 재생 때 sw.js가 Range(206)로 잘라 준다.
export async function saveFiles(files, { onProgress, signal, cacheName = MEDIA_CACHE } = {}) {
  if (!hasCache) throw new Error("이 브라우저는 오프라인 저장을 지원하지 않아요.");
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  const cache = await caches.open(cacheName);
  const total = files.reduce((s, f) => s + f.bytes, 0) || 1;
  let done = 0;
  for (const f of files) {
    if (await isCached(f.path)) {
      done += f.bytes;
      onProgress?.(Math.min(done / total, 1));
      continue;
    }
    const res = await fetch(f.path, { signal, cache: "reload" });
    if (!res.ok || res.status !== 200) throw new Error(`${f.path} (${res.status})`);
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      chunks.push(value);
      got += value.length;
      onProgress?.(Math.min((done + got) / total, 1));
    }
    await cache.put(
      f.path,
      new Response(new Blob(chunks), { status: 200, headers: { "Content-Type": res.headers.get("Content-Type") || "application/octet-stream" } })
    );
    done += f.bytes;
    onProgress?.(Math.min(done / total, 1));
  }
}

export async function removeFiles(files, cacheName = MEDIA_CACHE) {
  if (!hasCache) return;
  const cache = await caches.open(cacheName);
  await Promise.all(files.map((f) => cache.delete(f.path)));
}

export function rememberSaved(group) {
  const rec = load(KEYS.offline, {}) || {};
  rec[group] = new Date().toISOString();
  save(KEYS.offline, rec);
}

export async function estimate() {
  try {
    if (navigator.storage?.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      return { usage, quota };
    }
  } catch {}
  return null;
}

export function onNetChange(cb) {
  const h = () => cb(isOnline());
  window.addEventListener("online", h);
  window.addEventListener("offline", h);
  cb(isOnline());
}
