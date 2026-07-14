// 게임 엔진 공개 API — UI(js/ui.js)와 시뮬레이터(scripts/simulate.mjs)가 쓰는 단일 진입점.
export { createGame, currentPlayer, getPlayer } from "./engine/state.js";
export { getLegalActions, applyAction } from "./engine/actions.js";
export { computeScore } from "./engine/scoring.js";
export { getTopCardId, hospitalSuitsWithCards, totalHospitalCardCount } from "./engine/hospital.js";
export { getCard } from "./data/cards.js";
export { ANIMALS, SUITS } from "./data/animals.js";
export { TRAITS, getTrait } from "./data/traits.js";
export { VARIANTS, getVariant } from "./data/variants.js";

import { getLegalActions as _getLegalActions, applyAction as _applyAction } from "./engine/actions.js";
import { nextRandom } from "./engine/rng.js";

export function isGameOver(state) {
  return state.phase === "game_over";
}

export function getResult(state) {
  return {
    winner: state.winnerIds.join(","),
    winnerIds: state.winnerIds,
    turns: state.actionLog.length,
    scores: Object.fromEntries(state.players.map((p) => [p.playerId, p.score])),
  };
}

// headless 시뮬레이션/디버깅용: 허용된 행동 중 하나를 무작위로 골라 한 스텝 진행한다.
// 실제 UI는 getLegalActions로 옵션을 보여주고 applyAction으로 사용자의 선택을 반영한다.
export function stepGame(state) {
  const legal = _getLegalActions(state);
  if (legal.length === 0) return state;
  const idx = Math.floor(nextRandom(state) * legal.length);
  return _applyAction(state, legal[idx]);
}
