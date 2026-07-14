// 턴 종료/전환 — 명세 7.4/8.4/10장 + 14장 즉사 변형.
import { getVariant } from "../data/variants.js";
import { syncCurrentPlayerFlags } from "./state.js";
import { computeScore, finishGame } from "./scoring.js";

export function endTurnAndAdvance(state) {
  const variant = getVariant(state.activeVariantId);
  if (variant && variant.suddenDeathThreshold != null) {
    for (const p of state.players) {
      if (computeScore(state, p) >= variant.suddenDeathThreshold) {
        finishGame(state, [p.playerId]);
        return;
      }
    }
  }

  if (state.drawPile.length === 0) {
    finishGame(state);
    return;
  }

  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  syncCurrentPlayerFlags(state);
  state.playArea = [];
  state.protectedCardIds = [];
  state.requiredExtraDraws = 0;
  state.turnFlags = { monkeyRecalledCardIds: [], owlDrawnCardIds: [], safeHarborRemaining: 0, hospitalizedSuitsThisTurn: [] };
  state.pendingDecision = null;
  state.phase = "turn_start";
}
