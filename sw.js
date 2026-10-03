// 스르륵 Service Worker
// 배포할 때 파일이 바뀌었다면 아래 버전 숫자를 올려 주세요(오래된 캐시를 지우고 새로 저장합니다).
const APP_CACHE = "app-v1"; // A등급: 앱 껍데기 (설치 때 자동 저장)
const MEDIA_CACHE = "media-v1"; // B등급: 사용자가 고른 영상·소리·음성
const KEEP = [APP_CACHE, MEDIA_CACHE];

// 1) 설치: media.json의 A등급 목록을 한꺼번에 저장
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const res = await fetch("/data/media.json", { cache: "reload" });
      const media = await res.json();
      const urls = media.groups.A.files.map((f) => (typeof f === "string" ? f : f.path));
      const cache = await caches.open(APP_CACHE);
      await cache.addAll(urls.map((u) => new Request(u, { cache: "reload" })));
      await self.skipWaiting(); // MVP: 새 버전을 즉시 적용
    })()
  );
});

// 2) 활성화: 이전 버전 캐시 삭제
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !KEEP.includes(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

// 3) 요청 처리
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 화면 이동: 저장된 index.html (오프라인에서도 앱이 열리도록)
  if (req.mode === "navigate") {
    event.respondWith(
      caches.match("/index.html").then((hit) => hit || fetch(req).catch(() => offlineResponse()))
    );
    return;
  }
  event.respondWith(handle(req));
});

async function handle(req) {
  // 캐시 우선: 저장본이 있으면 즉시, 없으면 네트워크
  const hit = await caches.match(req.url, { ignoreSearch: true });
  if (hit) return req.headers.has("range") ? rangeResponse(req, hit) : hit;
  try {
    return await fetch(req);
  } catch {
    return offlineResponse(); // 미저장 + 오프라인 → 화면에서 안내 문구로 처리
  }
}

function offlineResponse() {
  return new Response("offline", { status: 503, statusText: "Offline", headers: { "Content-Type": "text/plain" } });
}

// Safari(iOS)는 오디오·영상을 Range(부분 요청)로 재생한다.
// 저장된 전체 파일에서 요청한 구간만 잘라 206 Partial Content로 직접 응답한다.
async function rangeResponse(req, res) {
  const buf = await res.arrayBuffer(); // 전체 파일 (최대 수 MB)
  const size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") || "");
  if (!m) return res;
  let start = m[1] === "" ? NaN : parseInt(m[1], 10);
  let end = m[2] === "" ? NaN : parseInt(m[2], 10);
  if (Number.isNaN(start)) {
    // "bytes=-500" → 마지막 500바이트
    start = Math.max(0, size - end);
    end = size - 1;
  } else if (Number.isNaN(end) || end >= size) {
    end = size - 1;
  }
  if (start > end || start >= size) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "application/octet-stream",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}
