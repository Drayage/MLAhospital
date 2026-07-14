// 진료 마치기(뱅킹) — 명세 7장, 볼빵빵 햄스터 조합 포함.
import { getCard } from "../data/cards.js";
import { traitEffect } from "../data/traits.js";
import { currentPlayer, logAction } from "./state.js";
import { gainCardToHospital } from "./hospital.js";
import { nextRandom } from "./rng.js";
import { endTurnAndAdvance } from "./turn.js";

function playAreaHasSuit(state, suit) {
  return state.playArea.some((cid) => getCard(cid).suit === suit);
}

export function applyBank(state) {
  const player = currentPlayer(state);
  const hasCombo = playAreaHasSuit(state, "hamster") && playAreaHasSuit(state, "almond");
  const bankedCount = state.playArea.length;

  for (const cid of state.playArea) gainCardToHospital(state, player, cid);
  state.playArea = [];
  state.protectedCardIds = [];
  state.requiredExtraDraws = 0;

  const bonusCards = [];
  if (hasCombo) {
    const override = traitEffect(player, "hamsterAlmondBonus");
    const bonusCount = Math.min(
      override ? override(state, { defaultCount: bankedCount }) : bankedCount,
      state.discardPile.length
    );
    for (let i = 0; i < bonusCount; i++) {
      const idx = Math.floor(nextRandom(state) * state.discardPile.length);
      const cid = state.discardPile.splice(idx, 1)[0];
      bonusCards.push(cid);
      gainCardToHospital(state, player, cid); // 능력 미발동 — 진료 줄을 거치지 않고 바로 입원
    }
  }

  logAction(state, { type: "bank", playerId: player.playerId, bankedCount, hasCombo, bonusCards });
  state.pendingDecision = null;
  state.effectQueue = [];
  endTurnAndAdvance(state);
}
