// 번호표 뽑기 새로고침 복원 — 우리집 동물병원과 저장 슬롯을 분리해서 서로 안 건드린다.
import { APP_ID, APP_VERSION } from "../app-config.js";

const KEY = APP_ID + "_flip7_save";

export function saveFlip7Game(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: APP_VERSION, t: Date.now(), state }));
  } catch (e) {
    /* 저장 실패(용량 등)는 게임을 막지 않는다 */
  }
}

export function loadFlip7Game({ maxAgeMs = 24 * 3600e3 } = {}) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { v, t, state } = JSON.parse(raw);
    if (v !== APP_VERSION) return null;
    if (Date.now() - t > maxAgeMs) return null;
    return state;
  } catch (e) {
    return null;
  }
}

export function clearFlip7Game() {
  localStorage.removeItem(KEY);
}
