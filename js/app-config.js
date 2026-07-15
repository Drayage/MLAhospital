// ── 게임별 설정 ──────────────────────────────────────────────────
// APP_VERSION은 코드를 수정한 커밋마다 갱신하고, sw.js의 CACHE_VERSION과
// index.html의 스크립트 ?v= 쿼리를 같은 값으로 맞춘다.

export const APP_ID = "mlahospital";
export const APP_NAME = "우리집 동물병원";
export const APP_VERSION = "20260714-21";

// 로컬 한 기기 돌려가며 플레이(hotseat)가 기본이고, 온라인(같은 Firebase 프로젝트를
// 여러 게임이 공유)도 지원한다 — js/net.js 참조.
//
// config 값 자체는 비밀이 아니다(보안은 database rules가 담당). 이 프로젝트는
// "games/mlahospital/..." 경로 아래에만 쓰도록 js/net.js에서 네임스페이스를
// 강제한다 — 실제 배포된 규칙이 "games" 서브트리만 열려있고, 같은 프로젝트를
// 다른 게임들과 공유하기 때문에 절대 이 경로 밖에 쓰면 안 된다.
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDnEYQRvb16iW0HZyq4bgrvtnPysDbeFBc",
  authDomain: "frenzy-49857.firebaseapp.com",
  databaseURL: "https://frenzy-49857-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "frenzy-49857",
  storageBucket: "frenzy-49857.firebasestorage.app",
  messagingSenderId: "256453631137",
  appId: "1:256453631137:web:2491ec1d53b065e744a4e0",
};
