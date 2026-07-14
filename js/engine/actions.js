// 공개 행동 API — UI와 simulate.mjs가 게임을 진행시키는 유일한 통로.
// applyAction(state, action) 하나로 모든 입력을 처리하고, getLegalActions(state)로
// 현재 허용되는 행동 목록을 계산한다 (엔진과 화면 분리, 명세 23장 설계 원칙).
import { getPlayer, startGamePlay, logAction } from "./state.js";
import { doDraw, runQueue } from "./queue.js";
import { applyBank, resolvePlunderDecision } from "./bank.js";
import {
  resolveMonkeyDecision,
  resolveDogDecision,
  resolveMoleDecision,
  resolveOwlDecision,
  resolveCatDecision,
} from "./abilities.js";
import { VARIANTS } from "../data/variants.js";
import { getTrait } from "../data/traits.js";
import { nextRandom } from "./rng.js";

export function getLegalActions(state) {
  if (state.phase === "trait_selection") {
    const d = state.pendingDecision;
    if (d.type === "harbor_watch_target") {
      return d.options.map((targetPlayerId) => ({ type: "SELECT_HARBOR_TARGET", targetPlayerId }));
    }
    return d.options.map((traitId) => ({ type: "SELECT_TRAIT", traitId }));
  }
  if (state.phase === "variant_selection") {
    if (state.mode.variantMode === "manual") {
      return Object.keys(VARIANTS).map((variantId) => ({ type: "SELECT_VARIANT", variantId }));
    }
    return [{ type: "CONFIRM_VARIANT" }];
  }
  if (state.phase === "game_over") return [];
  if (state.pendingDecision) return legalDecisionActions(state);
  if (state.phase === "turn_start") return [{ type: "DRAW" }];
  if (state.phase === "waiting_for_choice") {
    const actions = [];
    if (state.drawPile.length > 0) actions.push({ type: "DRAW" });
    if (state.requiredExtraDraws === 0 || state.drawPile.length === 0) actions.push({ type: "BANK" });
    return actions;
  }
  return [];
}

function legalDecisionActions(state) {
  const d = state.pendingDecision;
  switch (d.type) {
    case "monkey_choose_card":
    case "mole_choose_card":
      return d.options.map((cardId) => ({ type: "DECIDE", value: cardId }));
    case "dog_choose_target":
    case "cat_choose_target":
      return d.options.map((opt) => ({ type: "DECIDE", value: opt }));
    case "plunder_choose_target":
      return d.options.map((targetPlayerId) => ({ type: "DECIDE", value: targetPlayerId }));
    case "owl_choose": {
      // 부엉이 영상 판독가(Mystic): 3장을 보여주지만 접수 가능한 건 첫 번째뿐.
      const takeable = d.mysticMode ? d.previewCardIds.slice(0, 1) : d.previewCardIds;
      const actions = takeable.map((cardId) => ({ type: "DECIDE", value: { action: "take", cardId } }));
      if (d.canBank) actions.push({ type: "DECIDE", value: { action: "bank" } });
      return actions;
    }
    default:
      return [];
  }
}

function actionsEqual(a, b) {
  if (a.type !== b.type) return false;
  if (a.type === "SELECT_TRAIT") return a.traitId === b.traitId;
  if (a.type === "SELECT_HARBOR_TARGET") return a.targetPlayerId === b.targetPlayerId;
  if (a.type === "SELECT_VARIANT") return a.variantId === b.variantId;
  if (a.type === "DECIDE") return JSON.stringify(a.value) === JSON.stringify(b.value);
  return true; // DRAW / BANK / CONFIRM_VARIANT — 페이로드 없음
}

export function applyAction(state, action) {
  const legal = getLegalActions(state);
  if (!legal.some((a) => actionsEqual(a, action))) {
    throw new Error("허용되지 않는 행동입니다: " + JSON.stringify(action));
  }
  switch (action.type) {
    case "SELECT_TRAIT":
      doSelectTrait(state, action.traitId);
      break;
    case "SELECT_HARBOR_TARGET":
      doSelectHarborTarget(state, action.targetPlayerId);
      break;
    case "SELECT_VARIANT":
      doSelectVariant(state, action.variantId);
      break;
    case "CONFIRM_VARIANT":
      doConfirmVariant(state);
      break;
    case "DRAW":
      doDraw(state);
      break;
    case "BANK":
      applyBank(state);
      break;
    case "DECIDE":
      doDecide(state, action.value);
      break;
    default:
      throw new Error("알 수 없는 행동: " + action.type);
  }
  return state;
}

function doSelectTrait(state, traitId) {
  const playerId = state.pendingDecision.playerId;
  const player = getPlayer(state, playerId);
  player.traitId = traitId;
  logAction(state, { type: "trait_selected", playerId, traitId });

  const trait = getTrait(traitId);
  if (trait && trait.needsTargetPlayer) {
    const otherPlayerIds = state.players.filter((p) => p.playerId !== playerId).map((p) => p.playerId);
    if (otherPlayerIds.length > 0) {
      state.pendingDecision = { type: "harbor_watch_target", playerId, options: otherPlayerIds };
      return;
    }
  }
  advanceTraitSelection(state, player);
}

function doSelectHarborTarget(state, targetPlayerId) {
  const playerId = state.pendingDecision.playerId;
  const player = getPlayer(state, playerId);
  player.harborWatchTargetId = targetPlayerId;
  logAction(state, { type: "harbor_watch_target_selected", playerId, targetPlayerId });
  advanceTraitSelection(state, player);
}

function advanceTraitSelection(state, player) {
  const nextPlayer = state.players.find((p) => p.seatIndex === player.seatIndex + 1);
  if (nextPlayer) {
    state.pendingDecision = {
      type: "trait_select",
      playerId: nextPlayer.playerId,
      options: state.traitOffers[nextPlayer.playerId],
    };
    return;
  }
  state.pendingDecision = null;
  if (state.mode.variantMode !== "none") {
    state.phase = "variant_selection";
  } else {
    startGamePlay(state);
  }
}

function doSelectVariant(state, variantId) {
  state.activeVariantId = variantId;
  logAction(state, { type: "variant_selected", variantId, mode: "manual" });
  startGamePlay(state);
}

function doConfirmVariant(state) {
  if (state.mode.variantMode === "random") {
    const ids = Object.keys(VARIANTS);
    state.activeVariantId = ids[Math.floor(nextRandom(state) * ids.length)];
    logAction(state, { type: "variant_selected", variantId: state.activeVariantId, mode: "random" });
  }
  startGamePlay(state);
}

function doDecide(state, value) {
  const type = state.pendingDecision.type;
  switch (type) {
    case "monkey_choose_card":
      resolveMonkeyDecision(state, value);
      break;
    case "dog_choose_target":
      resolveDogDecision(state, value);
      break;
    case "mole_choose_card":
      resolveMoleDecision(state, value);
      break;
    case "cat_choose_target":
      resolveCatDecision(state, value);
      break;
    case "plunder_choose_target":
      resolvePlunderDecision(state, value);
      break;
    case "owl_choose": {
      const result = resolveOwlDecision(state, value);
      if (result.bankNow) {
        applyBank(state);
        return;
      }
      break;
    }
    default:
      throw new Error("처리할 수 없는 결정 유형: " + type);
  }
  runQueue(state);
}
