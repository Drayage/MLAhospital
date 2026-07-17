// 공개 행동 API — getLegalActions(state) / applyAction(state, action).
// UI/AI는 이 파일을 통해서만 상태를 바꾼다(우리집 동물병원 엔진과 같은 설계 원칙).
import { currentPlayer } from "./state.js";
import { doHit, doStay, doDecide, continueToNextRound } from "./engine.js";

export function getLegalActions(state) {
  if (state.phase === "game_over") return [];
  if (state.phase === "round_over") return [{ type: "CONTINUE" }];
  if (state.pendingDecision) {
    return state.pendingDecision.options.map((playerId) => ({ type: "DECIDE", value: playerId }));
  }
  const player = currentPlayer(state);
  const actions = [{ type: "HIT" }];
  if (player.forcedHitsLeft === 0) actions.push({ type: "STAY" });
  return actions;
}

function actionsEqual(a, b) {
  if (a.type !== b.type) return false;
  if (a.type === "DECIDE") return a.value === b.value;
  return true;
}

export function applyAction(state, action) {
  const legal = getLegalActions(state);
  if (!legal.some((a) => actionsEqual(a, action))) {
    throw new Error("허용되지 않는 행동입니다: " + JSON.stringify(action));
  }
  if (action.type === "HIT") doHit(state);
  else if (action.type === "STAY") doStay(state);
  else if (action.type === "DECIDE") doDecide(state, action.value);
  else if (action.type === "CONTINUE") continueToNextRound(state);
  return state;
}
