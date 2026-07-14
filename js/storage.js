// 새로고침 복원 — 7개 게임에서 나중에 따로 구현했던 패턴의 표준판.
// 게임 상태를 매 턴 저장하고, 시작 시 이어하기를 제안한다.
import { APP_ID, APP_VERSION } from "./app-config.js";

const KEY = APP_ID + "_save";

export function saveGame(state) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ v: APP_VERSION, t: Date.now(), state })
    );
  } catch (e) {
    /* 저장 실패(용량 등)는 게임을 막지 않는다 */
  }
}

// 반환: 이어할 상태 또는 null.
// 버전이 다르면 상태 포맷이 바뀌었을 수 있으므로 기본은 폐기 (원하면 마이그레이션 추가)
export function loadGame({ acceptOldVersion = false, maxAgeMs = 24 * 3600e3 } = {}) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { v, t, state } = JSON.parse(raw);
    if (!acceptOldVersion && v !== APP_VERSION) return null;
    if (Date.now() - t > maxAgeMs) return null;
    return state;
  } catch (e) {
    return null;
  }
}

export function clearGame() {
  localStorage.removeItem(KEY);
}

// 온라인 재입장 정보 (net.js와 함께 사용)
const REJOIN_KEY = APP_ID + "_rejoin";
export function saveRejoin(info) {
  localStorage.setItem(REJOIN_KEY, JSON.stringify(info));
}
export function loadRejoin() {
  try {
    return JSON.parse(localStorage.getItem(REJOIN_KEY));
  } catch (e) {
    return null;
  }
}
export function clearRejoin() {
  localStorage.removeItem(REJOIN_KEY);
}
