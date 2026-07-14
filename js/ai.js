// AI 상대 — 항상 최선은 아니지만 그럴듯하게 위험을 재는 정책.
// 규칙 로직은 절대 두지 않는다: getLegalActions가 만든 선택지 중에서만 고른다.
import { getCard } from "./data/cards.js";
import { getLegalActions } from "./engine/actions.js";
import { getTopCardId } from "./engine/hospital.js";
import { nextRandom } from "./engine/rng.js";

// 진료 줄을 다시 노릴 때 위협적인 순서(공격/방어 능력을 우선 재사용).
const SUIT_ATTACK_PRIORITY = ["dog", "cat", "rabbit", "turtle", "owl", "mole", "monkey", "hamster", "almond", "peacock"];

export function chooseAiAction(state) {
  const legal = getLegalActions(state);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0];

  if (state.phase === "trait_selection") {
    return legal[Math.floor(nextRandom(state) * legal.length)];
  }
  if (state.pendingDecision) {
    return chooseDecisionAction(state, legal);
  }

  const drawAction = legal.find((a) => a.type === "DRAW");
  const bankAction = legal.find((a) => a.type === "BANK");
  if (drawAction && bankAction) {
    return shouldKeepGoing(state) ? drawAction : bankAction;
  }
  return drawAction || bankAction || legal[0];
}

// 진료 줄에 이미 있는 종류와 겹치는 카드가 대기실 덱에 얼마나 남았는지로 위험을 추정.
function bustProbability(state) {
  if (state.playArea.length === 0 || state.drawPile.length === 0) return 0;
  const suitsInPlay = new Set(state.playArea.map((cid) => getCard(cid).suit));
  const dangerous = state.drawPile.filter((cid) => suitsInPlay.has(getCard(cid).suit)).length;
  return dangerous / state.drawPile.length;
}

function shouldKeepGoing(state) {
  if (state.requiredExtraDraws > 0) return true;
  const risk = bustProbability(state);
  const bankedValue = state.playArea.reduce((sum, cid) => sum + getCard(cid).value, 0);
  const caution = Math.min(0.35, bankedValue / 90); // 이미 많이 쌓였으면 더 신중하게
  const continueChance = Math.max(0.03, 0.92 - risk * 1.7 - caution);
  return nextRandom(state) < continueChance;
}

function chooseDecisionAction(state, legal) {
  switch (state.pendingDecision.type) {
    case "monkey_choose_card":
      return bestBySuitPriority(legal);
    case "mole_choose_card":
      return bestByValue(legal, (a) => getCard(a.value).value);
    case "dog_choose_target":
    case "cat_choose_target":
      return bestTarget(state, legal);
    case "owl_choose":
      return chooseOwl(state, legal);
    case "plunder_choose_target":
      return bestByValue(legal, (a) => {
        const target = state.players.find((p) => p.playerId === a.value);
        return Object.values(target.hospitalStacks).reduce((sum, stack) => sum + stack.length, 0);
      });
    default:
      return legal[Math.floor(nextRandom(state) * legal.length)];
  }
}

function bestBySuitPriority(legal) {
  let best = legal[0];
  let bestScore = -1;
  for (const a of legal) {
    const suit = getCard(a.value).suit;
    const score = SUIT_ATTACK_PRIORITY.length - SUIT_ATTACK_PRIORITY.indexOf(suit);
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

function bestByValue(legal, valueFn) {
  let best = legal[0];
  let bestVal = -Infinity;
  for (const a of legal) {
    const v = valueFn(a);
    if (v > bestVal) {
      bestVal = v;
      best = a;
    }
  }
  return best;
}

function bestTarget(state, legal) {
  return bestByValue(legal, (a) => {
    const opponent = state.players.find((p) => p.playerId === a.value.opponentId);
    const topId = getTopCardId(opponent.hospitalStacks[a.value.suit]);
    return topId ? getCard(topId).value : 0;
  });
}

function chooseOwl(state, legal) {
  const bankOpt = legal.find((a) => a.value.action === "bank");
  const takeOpts = legal.filter((a) => a.value.action === "take");
  const suitsInPlay = new Set(state.playArea.map((cid) => getCard(cid).suit));
  const safeTakes = takeOpts.filter((a) => !suitsInPlay.has(getCard(a.value.cardId).suit));
  if (safeTakes.length > 0 && (!bankOpt || shouldKeepGoing(state))) {
    return bestByValue(safeTakes, (a) => getCard(a.value.cardId).value);
  }
  return bankOpt || takeOpts[0];
}
