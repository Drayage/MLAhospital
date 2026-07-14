// 점수 계산 및 승자 결정 — 명세 11/12/14장.
import { SUITS } from "../data/animals.js";
import { getCard } from "../data/cards.js";
import { getVariant } from "../data/variants.js";
import { traitEffect } from "../data/traits.js";
import { getTopCardId, totalHospitalCardCount } from "./hospital.js";

export function computeScore(state, player) {
  const variant = getVariant(state.activeVariantId);
  // 공작 품평 전문가(Golden Scales): 점수에 반영되는 공작 카드 한 장당 +5.
  const peacockBonusHook = traitEffect(player, "peacockScoreBonus");
  const peacockBonus = peacockBonusHook ? peacockBonusHook() : 0;

  let base = 0;
  if (variant && variant.scoreStyle === "sum_all") {
    for (const suit of SUITS) {
      for (const cid of player.hospitalStacks[suit]) {
        base += getCard(cid).value;
        if (suit === "peacock") base += peacockBonus;
      }
    }
  } else {
    for (const suit of SUITS) {
      const topId = getTopCardId(player.hospitalStacks[suit]);
      if (topId) {
        base += getCard(topId).value;
        if (suit === "peacock") base += peacockBonus;
      }
    }
  }
  let penalty = 0;
  if (variant && variant.missingSuitPenalty) penalty = variant.missingSuitPenalty(player, null);
  return base + penalty + (player.bonusScore || 0);
}

export function finishGame(state, forcedWinnerIds) {
  for (const p of state.players) p.score = computeScore(state, p);
  state.phase = "game_over";
  state.pendingDecision = null;
  state.effectQueue = [];
  state.winnerIds = forcedWinnerIds && forcedWinnerIds.length ? forcedWinnerIds : pickWinners(state);
}

function pickWinners(state) {
  const variant = getVariant(state.activeVariantId);
  let pool = state.players;
  if (variant && variant.winnerCap != null) {
    const eligible = state.players.filter((p) => p.score < variant.winnerCap);
    if (eligible.length > 0) {
      pool = eligible;
    } else {
      // 모두 컷라인 이상이면 가장 낮은 점수의 플레이어가 승리 (명세 14장 권장안)
      const minScore = Math.min(...state.players.map((p) => p.score));
      return tieBreak(state.players.filter((p) => p.score === minScore));
    }
  }
  const maxScore = Math.max(...pool.map((p) => p.score));
  return tieBreak(pool.filter((p) => p.score === maxScore));
}

function tieBreak(candidates) {
  if (candidates.length === 1) return [candidates[0].playerId];
  const maxCount = Math.max(...candidates.map((p) => totalHospitalCardCount(p)));
  return candidates.filter((p) => totalHospitalCardCount(p) === maxCount).map((p) => p.playerId);
}
