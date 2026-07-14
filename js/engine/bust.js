// 진료실 대소동 — 명세 8장.
import { getCard } from "../data/cards.js";
import { getVariant } from "../data/variants.js";
import { traitEffect } from "../data/traits.js";
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
  let protectedIds = state.playArea.filter((cid) => protectedSet.has(cid));
  let lostIds = state.playArea.filter((cid) => !protectedSet.has(cid));

  const ctx = {
    lostCardIds: lostIds,
    getCard,
    turnFlags: state.turnFlags,
    moveToProtected(cardId) {
      if (!lostIds.includes(cardId)) return;
      lostIds = lostIds.filter((c) => c !== cardId);
      if (!protectedIds.includes(cardId)) protectedIds.push(cardId);
    },
  };
  const hook = traitEffect(player, "onBustProtect");
  if (hook) hook(state, ctx);

  for (const cid of protectedIds) gainCardToHospital(state, player, cid);

  const variant = getVariant(state.activeVariantId);
  let destination = { type: "discard" };
  if (variant && variant.bustDestination) destination = variant.bustDestination(state, player);
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
