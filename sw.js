// 서비스워커 — 캐시 고착 방지 확정 패턴 (4개 프로젝트가 각자 도달한 동일 결론)
// 앱 코드(html/js/css): network-first / 불변 에셋: cache-first
// ★ 코드를 수정한 커밋마다 CACHE_VERSION을 반드시 bump ★
const CACHE_VERSION = "v20260714-6";
const CACHE_NAME = "app-" + CACHE_VERSION;
// 새 js/에셋 파일을 추가하면 여기에도 추가 (Paws-Order 누락 전례)
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./js/app-config.js",
  "./js/audio.js",
  "./js/devtools.js",
  "./js/palettes.js",
  "./js/storage.js",
  "./js/ui.js",
  "./js/ai.js",
  "./js/engine.js",
  "./js/ui/render.js",
  "./js/data/animals.js",
  "./js/data/cards.js",
  "./js/data/traits.js",
  "./js/data/variants.js",
  "./js/engine/abilities.js",
  "./js/engine/actions.js",
  "./js/engine/bank.js",
  "./js/engine/bust.js",
  "./js/engine/hospital.js",
  "./js/engine/queue.js",
  "./js/engine/rng.js",
  "./js/engine/scoring.js",
  "./js/engine/state.js",
  "./js/engine/turn.js",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // 개별 실패가 install 전체를 막지 않게 하나씩 (uritichu 교훈)
      await Promise.allSettled(PRECACHE.map((u) => cache.add(u)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE_NAME) await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

const isAppCode = (url) =>
  url.pathname.endsWith("/") || /\.(html|js|css)$/.test(url.pathname);

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  if (isAppCode(url)) {
    // network-first: 항상 최신 코드, 오프라인일 때만 캐시
    e.respondWith(
      (async () => {
        try {
          const res = await fetch(e.request);
          (await caches.open(CACHE_NAME)).put(e.request, res.clone());
          return res;
        } catch (err) {
          const hit = await caches.match(e.request);
          if (hit) return hit;
          throw err;
        }
      })()
    );
  } else {
    // cache-first: 이미지/오디오 등 불변 에셋
    e.respondWith(
      (async () => {
        const hit = await caches.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        (await caches.open(CACHE_NAME)).put(e.request, res.clone());
        return res;
      })()
    );
  }
});
