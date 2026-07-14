// 진료실 대소동 — 명세 8장.
import { getCard } from "../data/cards.js";
import { getVariant } from "../data/variants.js";
import { findPlayerWithTrait } from "../data/traits.js";
import { currentPlayer, getPlayer, logAction } from "./state.js";
import { gainCardToHospital } from "./hospital.js";
import { endTurnAndAdvance } from "./turn.js";

export function checkDuplicate(state, newCardId) {
  const variant = getVariant(state.activeVariantId);
  if (variant && variant.isDuplicate) return variant.isDuplicate(state, state.playArea, newCardId, getCard);
  return state.playArea.slice(0, -1).some((cid) => getCard(cid).suit === getCard(newCardId).suit);
}

export function resolveBust(state, triggeringCardId) {
  state.effectQueue = [];
  const player = currentPlayer(state);
  const protectedSet = new Set(state.protectedCardIds);
  const protectedIds = state.playArea.filter((cid) => protectedSet.has(cid));
  const lostIds = state.playArea.filter((cid) => !protectedSet.has(cid));

  for (const cid of protectedIds) gainCardToHospital(state, player, cid);

  // 옆 병원 당직자(Harbor Watch): 지정한 상대가 대소동을 내면, 오늘의 병원 규칙보다
  // 우선해서 그 카드들을 자기 병원으로 가져간다.
  let destination = { type: "discard" };
  const harborWatcher = findPlayerWithTrait(state, "harbor_watch");
  if (harborWatcher && harborWatcher.harborWatchTargetId === player.playerId) {
    destination = { type: "player", playerId: harborWatcher.playerId };
  } else {
    const variant = getVariant(state.activeVariantId);
    if (variant && variant.bustDestination) destination = variant.bustDestination(state, player);
  }
  for (const cid of lostIds) {
    if (destination.type === "player") {
      gainCardToHospital(state, getPlayer(state, destination.playerId), cid);
    } else {
      state.discardPile.push(cid);
    }
  }

  logAction(state, {
    type: "bust",
    playerId: player.playerId,
    triggeringCardId,
    lostCardIds: lostIds,
    protectedCardIds: protectedIds,
  });

  state.playArea = [];
  state.protectedCardIds = [];
  state.requiredExtraDraws = 0;
  state.pendingDecision = null;

  endTurnAndAdvance(state);
}
