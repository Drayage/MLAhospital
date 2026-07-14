// 모바일 외부 테스트 지원: 버전 배지 + 5탭 dev리셋 + 에러 오버레이
// "지금 최신 버전을 보고 있나?"와 "무슨 에러가 났나?"를 폰에서 즉시 알 수 있게 한다.
import { APP_VERSION } from "./app-config.js";

// ── 버전 배지: 타이틀 화면 구석에 항상 표시 ─────────────────────
export function mountVersionBadge() {
  const el = document.createElement("div");
  el.id = "version-badge";
  el.textContent = "v" + APP_VERSION;
  el.style.cssText =
    "position:fixed;right:6px;bottom:6px;z-index:9999;font:10px monospace;" +
    "opacity:.45;padding:2px 6px;background:#0006;color:#fff;border-radius:8px;" +
    "user-select:none;-webkit-user-select:none;";
  document.body.appendChild(el);

  // 5탭 dev리셋: 캐시 전체 삭제 + SW 해제 + 새로고침 (수동 캐시초기화 대체)
  let taps = 0, timer = 0;
  el.addEventListener("click", async () => {
    taps++;
    clearTimeout(timer);
    timer = setTimeout(() => (taps = 0), 1500);
    if (taps < 5) return;
    taps = 0;
    el.textContent = "리셋 중...";
    try {
      for (const k of await caches.keys()) await caches.delete(k);
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      for (const r of regs || []) await r.unregister();
    } finally {
      location.reload();
    }
  });
}

// ── 에러 오버레이: 에러 텍스트를 복사 가능한 토스트로 표시 ─────────
// 버그 발견 시 증상 묘사 대신 이 텍스트를 그대로 Claude에게 붙여넣을 것.
export function mountErrorOverlay() {
  const show = (msg) => {
    let box = document.getElementById("error-overlay");
    if (!box) {
      box = document.createElement("pre");
      box.id = "error-overlay";
      box.style.cssText =
        "position:fixed;left:8px;right:8px;bottom:40px;z-index:10000;max-height:40vh;" +
        "overflow:auto;background:#300c;color:#fdd;font:11px monospace;padding:8px;" +
        "border-radius:8px;white-space:pre-wrap;word-break:break-all;";
      box.addEventListener("click", () => {
        navigator.clipboard?.writeText(box.textContent);
        box.style.background = "#030c";
        setTimeout(() => box.remove(), 400);
      });
      document.body.appendChild(box);
    }
    box.textContent += (box.textContent ? "\n\n" : "[탭하면 복사 후 닫힘]\n") + msg;
  };
  window.addEventListener("error", (e) => {
    show(`${e.message}\n  at ${e.filename}:${e.lineno}:${e.colno}\n${e.error?.stack || ""}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    show("Unhandled rejection: " + (e.reason?.stack || e.reason));
  });
}
