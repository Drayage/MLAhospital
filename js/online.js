// 온라인 모드 오케스트레이션 — 방 생성/참가/좌석 배정/턴 동기화.
// DOM은 전혀 만지지 않는다(js/net.js와 같은 계층). 상태가 바뀔 때마다 ui.js가
// 등록한 콜백을 불러 알려주기만 하고, 실제 렌더링은 ui.js/render.js가 담당한다.
import {
  myNetId, createRoom, joinRoom, updateLobby, writeState,
  subscribeRoom, setupPresence, tryRejoin, leaveRoom,
} from "./net.js";
import { createGame } from "./engine/state.js";
import { applyAction } from "./engine/actions.js";
import { finishGame } from "./engine/scoring.js";

let unsubscribe = null;
let listener = null; // ui.js가 등록하는 콜백: (room, code) => void
let currentCode = null;

export function onRoomChange(cb) {
  listener = cb;
}

function notify(room) {
  if (listener) listener(room, currentCode);
}

function subscribe(code) {
  if (unsubscribe) unsubscribe();
  currentCode = code;
  unsubscribe = subscribeRoom(code, (room) => notify(room));
}

export function myId() {
  return myNetId();
}

export async function hostCreateRoom(displayName) {
  const id = myNetId();
  const code = await createRoom({ id, name: displayName, isAI: false });
  subscribe(code);
  setupPresence(code, id);
  return code;
}

export async function joinExistingRoom(code, displayName) {
  const id = myNetId();
  await joinRoom(code, { id, name: displayName, isAI: false });
  subscribe(code);
  setupPresence(code, id);
  return code;
}

// 호스트가 로비에서 특기/변형규칙/특수모드를 바꿀 때 — 다른 참가자에게도 즉시 반영.
export async function updateConfig(patch) {
  if (!currentCode) return;
  await updateLobby(currentCode, (room) => ({ config: { ...room.config, ...patch } }));
}

export function isHost(room) {
  return !!(room && room.hostId === myNetId());
}

// 호스트가 로비에서 AI 좌석을 추가/제거한다. AI는 실제 접속이 없으므로 joinedAt은
// serverTimestamp 대신(트랜잭션 안에서는 제대로 치환되지 않을 수 있어) 클라이언트
// 시각을 쓴다 — 같은 호스트가 순서대로 추가하는 것뿐이라 좌석 순서엔 문제 없다.
export async function addAiPlayer() {
  if (!currentCode) return;
  await updateLobby(currentCode, (room) => {
    const players = room.players || {};
    if (Object.keys(players).length >= 4) return undefined;
    const aiCount = Object.values(players).filter((p) => p.isAI).length;
    const id = "ai-" + Math.random().toString(36).slice(2, 8);
    return { players: { ...players, [id]: { id, name: `AI ${aiCount + 1}`, isAI: true, online: true, joinedAt: Date.now() } } };
  });
}

export async function removePlayer(playerId) {
  if (!currentCode) return;
  await updateLobby(currentCode, (room) => {
    const players = { ...room.players };
    delete players[playerId];
    return { players };
  });
}

// 호스트가 "게임 시작"을 누르면: 참가 순서(joinedAt)대로 좌석을 배정해 로컬
// createGame()으로 실제 엔진 상태를 만들고, 각 플레이어에 netId를 붙여 방에 쓴다.
// 이후 모든 클라이언트는 이 state만 구독해서 렌더한다 — 온라인 플레이는 사람과
// AI를 함께 지원하되, AI 턴은 호스트의 클라이언트가 전담해 계산한다(js/ui.js의
// scheduleAiIfNeeded 참조) — 호스트가 자리를 비우면 그 사이엔 AI 턴이 멈춘다.
export async function hostStartGame(room) {
  const joined = Object.values(room.players || {}).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  if (joined.length < 2 || joined.length > 4) {
    throw new Error("플레이어는 2~4명이어야 합니다.");
  }
  const state = createGame({
    playerNames: joined.map((p) => p.name),
    aiFlags: joined.map((p) => !!p.isAI),
    useTraits: !!room.config?.useTraits,
    variantMode: room.config?.variantMode || "none",
    deckMultiplier: room.config?.deckMultiplier || 1,
    kingOfEr: !!room.config?.kingOfEr,
    noAbilities: !!room.config?.noAbilities,
  });
  state.players.forEach((p, i) => {
    p.netId = joined[i].id;
  });
  await updateLobby(currentCode, () => ({ phase: "playing", state }));
}

// 다시 로비로 — 같은 방 코드를 유지한 채 새 판을 준비할 수 있게 한다.
export async function returnToLobby() {
  if (!currentCode) return;
  await updateLobby(currentCode, () => ({ phase: "lobby", state: null }));
}

export function myPlayerId(state) {
  const id = myNetId();
  const me = state.players.find((p) => p.netId === id);
  return me ? me.playerId : null;
}

// 지금 이 클라이언트가 행동을 낼 차례인지 — 턴 소유자든, 대기 중인 결정(원숭이/
// 강아지 선택 등)의 당사자든 둘 다 확인한다(actions.js의 currentActorId와 동일 개념).
export function isMyTurn(state) {
  const mine = myPlayerId(state);
  if (!mine) return false;
  // 오늘의 병원 규칙 확인은 특정 플레이어 소속이 아니라 누구나 먼저 눌러 확정할 수 있다
  // (로컬 hotseat도 마찬가지 — actions.js의 currentActorId가 null을 반환하는 지점).
  if (state.phase === "variant_selection") return true;
  if (state.pendingDecision) return state.pendingDecision.playerId === mine;
  if (state.phase === "turn_start" || state.phase === "waiting_for_choice") {
    return state.players[state.currentPlayerIndex].playerId === mine;
  }
  return false;
}

// 내 차례에 액션을 적용 — 로컬에서 결정적으로 계산한 뒤 서버에 seq 가드로 써넣는다.
// 화면은 이 결과를 낙관적으로 그리지 않고, subscribeRoom이 확정 상태를 돌려줄 때만
// 갱신한다(net.js의 설계 원칙 4번).
export async function sendAction(room, action) {
  const nextState = JSON.parse(JSON.stringify(room.state));
  applyAction(nextState, action); // 결정적 RNG(state.seed/rngCounter)라 모든 클라가 같은 결과를 낸다
  const committed = await writeState(currentCode, room.seq, nextState);
  if (!committed) {
    // 누군가 먼저 썼다 — 곧 subscribeRoom이 그 최신 상태를 넣어줄 것이므로 그냥 둔다.
    console.warn("온라인 상태 쓰기 충돌 — 최신 상태를 기다립니다.");
  }
}

// 항복 — 로컬과 마찬가지로 아무나(누구 차례든) 눌러 게임 전체를 즉시 끝낼 수 있다.
// finishGame은 RNG를 쓰지 않는 결정적 연산이라 로컬에서 계산해 그대로 써넣으면 된다.
export async function surrenderOnline(room) {
  const nextState = JSON.parse(JSON.stringify(room.state));
  finishGame(nextState);
  await writeState(currentCode, room.seq, nextState);
}

export async function attemptRejoin() {
  const info = await tryRejoin();
  if (!info) return null;
  subscribe(info.code);
  return info;
}

export function leaveOnlineGame() {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  currentCode = null;
  leaveRoom();
}

export function getCurrentCode() {
  return currentCode;
}
