// 진료 마치기(뱅킹) — 명세 7장, 볼빵빵 햄스터 조합 포함.
import { getCard } from "../data/cards.js";
import { traitEffect, findPlayerWithTrait } from "../data/traits.js";
import { currentPlayer, getPlayer, logAction } from "./state.js";
import {
  gainCardToHospital,
  getTopCardId,
  removeFromHospital,
  hospitalSuitsWithCards,
  totalHospitalCardCount,
} from "./hospital.js";
import { nextRandom } from "./rng.js";
import { endTurnAndAdvance } from "./turn.js";

function playAreaHasSuit(state, suit) {
  return state.playArea.some((cid) => getCard(cid).suit === suit);
}

export function applyBank(state) {
  const player = currentPlayer(state);
  // 심심한 모드에서는 볼빵빵 콤보도 비활성 — 능력 없는 순수 숫자 카드 게임이 된다.
  const hasCombo = !state.mode.noAbilities && playAreaHasSuit(state, "hamster") && playAreaHasSuit(state, "almond");
  const bankedCount = state.playArea.length;

  for (const cid of state.playArea) gainCardToHospital(state, player, cid);
  state.playArea = [];
  state.protectedCardIds = [];
  state.requiredExtraDraws = 0;
  state.pendingDecision = null;
  state.effectQueue = [];

  if (!hasCombo) {
    logAction(state, { type: "bank", playerId: player.playerId, bankedCount, hasCombo: false, bonusCards: [] });
    endTurnAndAdvance(state);
    return;
  }

  const override = traitEffect(player, "hamsterAlmondBonus");
  const bonusCount = override ? override(state, { defaultCount: bankedCount }) : bankedCount;

  // 간식 가로채기(Plunderer): 누가 갖고 있든, 조합 보너스의 출처가 귀가 더미 대신
  // "다른 플레이어 한 명의 병원"으로 바뀐다 (전역 규칙 — 특기 보유자 본인이 조합을
  // 완성해도 적용됨). 대상을 고를 사람이 여럿이면 결정을 기다린다.
  const plunderer = findPlayerWithTrait(state, "plunderer");
  if (plunderer) {
    const targets = state.players.filter((p) => p.playerId !== player.playerId);
    if (targets.length === 0) {
      logAction(state, { type: "bank", playerId: player.playerId, bankedCount, hasCombo: true, bonusCards: [] });
      endTurnAndAdvance(state);
      return;
    }
    if (targets.length === 1) {
      applyPlunder(state, player, targets[0], bonusCount, bankedCount);
      return;
    }
    state.pendingDecision = {
      type: "plunder_choose_target",
      playerId: player.playerId,
      options: targets.map((p) => p.playerId),
      bonusCount,
      bankedCount,
    };
    return;
  }

  const bonusCards = drawBonusFromDiscard(state, player, bonusCount);
  logAction(state, { type: "bank", playerId: player.playerId, bankedCount, hasCombo: true, bonusCards });
  endTurnAndAdvance(state);
}

function drawBonusFromDiscard(state, player, bonusCount) {
  const n = Math.min(bonusCount, state.discardPile.length);
  const bonusCards = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(nextRandom(state) * state.discardPile.length);
    const cid = state.discardPile.splice(idx, 1)[0];
    bonusCards.push(cid);
    gainCardToHospital(state, player, cid); // 능력 미발동 — 진료 줄을 거치지 않고 바로 입원
  }
  return bonusCards;
}

function applyPlunder(state, player, targetPlayer, bonusCount, bankedCount) {
  const n = Math.min(bonusCount, totalHospitalCardCount(targetPlayer));
  const plundered = [];
  for (let i = 0; i < n; i++) {
    const suits = hospitalSuitsWithCards(targetPlayer);
    if (suits.length === 0) break;
    const suit = suits[Math.floor(nextRandom(state) * suits.length)];
    const topId = getTopCardId(targetPlayer.hospitalStacks[suit]);
    removeFromHospital(targetPlayer, topId);
    plundered.push(topId);
    gainCardToHospital(state, player, topId); // 능력 미발동
  }
  logAction(state, {
    type: "bank",
    playerId: player.playerId,
    bankedCount,
    hasCombo: true,
    bonusCards: plundered,
    plunderedFrom: targetPlayer.playerId,
  });
  endTurnAndAdvance(state);
}

export function resolvePlunderDecision(state, targetPlayerId) {
  const decision = state.pendingDecision;
  const player = currentPlayer(state);
  const target = getPlayer(state, targetPlayerId);
  state.pendingDecision = null;
  applyPlunder(state, player, target, decision.bonusCount, decision.bankedCount);
}
