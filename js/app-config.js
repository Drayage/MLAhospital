// ── 게임별 설정 ──────────────────────────────────────────────────
// APP_VERSION은 코드를 수정한 커밋마다 갱신하고, sw.js의 CACHE_VERSION과
// index.html의 스크립트 ?v= 쿼리를 같은 값으로 맞춘다.

export const APP_ID = "mlahospital";
export const APP_NAME = "우리집 동물병원";
export const APP_VERSION = "20260714-8";

// 이 게임은 로컬 한 기기 돌려가며 플레이(hotseat)로 시작한다.
// 온라인 동기화가 필요해지면 game-baserule/starter/js/net.js를 다시 가져와 연결할 것
// (공유 Firebase 프로젝트 config와 database.rules.snippet.json 병합이 필요).
