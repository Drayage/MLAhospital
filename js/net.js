// Firebase RTDB 온라인 동기화 — game-baserule/starter/js/net.js를 이 프로젝트에 맞게 이식.
// 핵심 원칙(원본과 동일):
//  1) DB 경로는 항상 `games/${APP_ID}/rooms/` 네임스페이스 아래로만 쓴다.
//     ⚠ 원본 game-baserule의 기본 경로는 `${APP_ID}_rooms/`이지만, 이 Firebase
//     프로젝트에 실제 배포된 규칙은 "games" 서브트리만 열려있고(다른 게임들과 공유),
//     그 서브트리 안에서도 게임별 하위 경로로만 접근하도록 아래 함수들이 강제한다.
//     절대 "games" 밖이나 "games/mlahospital" 밖에 쓰지 말 것 — 다른 게임 데이터를
//     건드리게 된다.
//  2) 쓰기 전 undefined → null 정화 (Firebase는 undefined 거부)
//  3) seq 가드 — 오래된 쓰기가 새 상태를 덮어쓰지 못하게
//  4) 화면은 서버 확정 상태만 렌더 (낙관적 렌더 금지)
//  5) 새로고침 시 방을 즉시 파괴하지 않음 — 유예 + 재입장
import { APP_ID, FIREBASE_CONFIG } from "./app-config.js";
import { saveRejoin, loadRejoin, clearRejoin } from "./storage.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase, ref, get, set, update, onValue, off,
  onDisconnect, runTransaction, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

let db = null;
function ensureDb() {
  if (!db) db = getDatabase(initializeApp(FIREBASE_CONFIG));
  return db;
}

const roomsPath = (code) => `games/${APP_ID}/rooms/${code}`;

// ── (2) undefined 정화: 모든 쓰기는 이 함수를 통과시킬 것 ────────────
export function sanitize(value) {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitize);
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = sanitize(v);
  return out;
}

export function makeRoomCode(len = 5) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 혼동 문자 제외
  return Array.from({ length: len }, () => chars[(Math.random() * chars.length) | 0]).join("");
}

// 이 기기에서의 내 식별자 — 새로고침해도 같은 사람으로 인식되도록 localStorage에 고정.
const NET_ID_KEY = APP_ID + "_netId";
export function myNetId() {
  let id = localStorage.getItem(NET_ID_KEY);
  if (!id) {
    id = "u" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(NET_ID_KEY, id);
  }
  return id;
}

export async function createRoom(hostPlayer) {
  const code = makeRoomCode();
  const room = sanitize({
    seq: 0,
    createdAt: serverTimestamp(),
    hostId: hostPlayer.id,
    phase: "lobby",
    config: { useTraits: false, variantMode: "none", deckMultiplier: 1, kingOfEr: false, noAbilities: false },
    players: { [hostPlayer.id]: { ...hostPlayer, online: true, joinedAt: serverTimestamp() } },
    state: null,
  });
  await set(ref(ensureDb(), roomsPath(code)), room);
  saveRejoin({ code, playerId: hostPlayer.id });
  return code;
}

export async function joinRoom(code, player) {
  const snap = await get(ref(ensureDb(), roomsPath(code)));
  if (!snap.exists()) throw new Error("방을 찾을 수 없습니다: " + code);
  await update(
    ref(ensureDb(), `${roomsPath(code)}/players/${player.id}`),
    sanitize({ ...player, online: true, joinedAt: serverTimestamp() })
  );
  saveRejoin({ code, playerId: player.id });
}

// ── 로비 단계 범용 트랜잭션 (설정 변경/게임 시작 등, seq는 자동 증가) ──────
// mutateFn(room) → 병합할 패치 객체, 또는 undefined(포기).
export async function updateLobby(code, mutateFn) {
  const result = await runTransaction(ref(ensureDb(), roomsPath(code)), (cur) => {
    if (!cur) return cur;
    const patch = mutateFn(cur);
    if (patch === undefined) return undefined;
    return sanitize({ ...cur, ...patch, seq: (cur.seq || 0) + 1 });
  });
  return result.committed;
}

// ── (3) seq 가드 쓰기: 턴 진행 중 상태 저장은 반드시 이 함수로 ─────────
// 트랜잭션으로 "내가 읽은 seq보다 서버가 앞서 있으면 포기"를 보장한다.
export async function writeState(code, baseSeq, nextState) {
  const result = await runTransaction(ref(ensureDb(), roomsPath(code)), (cur) => {
    if (!cur) return cur; // 방 없음
    if ((cur.seq || 0) !== baseSeq) return undefined; // 이미 앞선 상태 → 포기
    return { ...cur, seq: baseSeq + 1, state: sanitize(nextState) };
  });
  return result.committed; // false면 호출측이 최신 상태 기준으로 재시도
}

// ── (4) 구독: 콜백이 받은 서버 상태만 렌더할 것 ─────────────────────
// onValue는 여러 변경이 합쳐져(coalesced) 올 수 있다 — 이벤트 로그/리플레이는
// diff가 아니라 상태에 포함된 누적 기록(actionLog)으로 관리한다(엔진이 이미 그렇게 함).
export function subscribeRoom(code, onRoom) {
  const r = ref(ensureDb(), roomsPath(code));
  onValue(r, (snap) => onRoom(snap.val()));
  return () => off(r);
}

// ── (5) presence: 즉시 삭제 금지, 오프라인 표시만 (재입장 유예) ───────
export function setupPresence(code, playerId) {
  const p = ref(ensureDb(), `${roomsPath(code)}/players/${playerId}`);
  update(p, { online: true, lastSeen: serverTimestamp() });
  onDisconnect(p).update({ online: false, lastSeen: serverTimestamp() });
  // 방 정리는 사람이 직접 "새 게임 시작"으로 나갈 때만 수행한다 (자동 삭제 없음).
}

export async function tryRejoin() {
  const info = loadRejoin();
  if (!info) return null;
  const snap = await get(ref(ensureDb(), roomsPath(info.code)));
  if (!snap.exists()) {
    clearRejoin();
    return null;
  }
  return { ...info, room: snap.val() };
}

export function leaveRoom() {
  clearRejoin();
}
