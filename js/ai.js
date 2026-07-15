// AI 상대 — 항상 최선은 아니지만 그럴듯하게 위험을 재는 정책.
// 규칙 로직은 절대 두지 않는다: getLegalActions가 만든 선택지 중에서만 고른다.
import { getCard } from "./data/cards.js";
import { getVariant } from "./data/variants.js";
import { getLegalActions } from "./engine/actions.js";
import { getTopCardId, getTargetCardId } from "./engine/hospital.js";
import { computeScore } from "./engine/scoring.js";
import { nextRandom } from "./engine/rng.js";

// 진료 줄을 다시 노릴 때 위협적인 순서(공격/방어 능력을 우선 재사용).
const SUIT_ATTACK_PRIORITY = ["dog", "cat", "rabbit", "turtle", "owl", "mole", "monkey", "hamster", "almond", "peacock"];

// 특기 선택 시 참고할 대략적인 강함 순서(주관적 튜닝) — 낮은 인덱스일수록 선호.
// 매 게임 2장 중 1장만 고르므로 완벽한 평가보다 "동전 던지기보다는 낫다" 수준이면 충분.
const TRAIT_PREFERENCE = [
  "treasure_hunter", "safe_harbor", "master_gunner", "golden_scales", "captains_hook",
  "scavenger", "fisherman", "navigator", "swordsman", "plunderer",
  "casanova", "beastmaster", "misfire", "parry", "harbor_watch", "mystic", "miser",
];

export function chooseAiAction(state) {
  const legal = getLegalActions(state);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0];

  if (state.phase === "trait_selection") {
    return chooseTraitPhaseAction(state, legal);
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

// 지금 활성화된 변형 규칙(있다면)까지 반영해 "이 카드가 지금 들어오면 겹치는가"를 정확히
// 판단한다 — 예를 들어 "같은 규모 예약 충돌"(Strange Lands)은 종류가 아니라 숫자가
// 같으면 겹친다. 엔진의 checkDuplicate와 같은 기준을 쓰되, 아직 진료 줄에 넣지 않은
// 카드를 미리 평가하는 용도라 playArea 전체와 비교한다(checkDuplicate는 이미 넣은
// 마지막 카드를 제외하고 비교하는 점만 다름).
function wouldBust(state, candidateCardId) {
  const variant = getVariant(state.activeVariantId);
  if (variant && variant.isDuplicate) {
    return variant.isDuplicate(state, [...state.playArea, candidateCardId], candidateCardId, getCard);
  }
  const candidateSuit = getCard(candidateCardId).suit;
  return state.playArea.some((cid) => getCard(cid).suit === candidateSuit);
}

// 진료 줄에 이미 있는 종류와 겹치는 카드가 대기실 덱에 얼마나 남았는지로 위험을 추정.
function bustProbability(state) {
  if (state.playArea.length === 0 || state.drawPile.length === 0) return 0;
  const dangerous = state.drawPile.filter((cid) => wouldBust(state, cid)).length;
  return dangerous / state.drawPile.length;
}

// 대소동이 나도 거북이 등으로 보호된 카드는 안전하게 입원하므로, "실제로 잃을 수 있는"
// 가치만 캔다 — 보호된 카드가 많으면 계속 진행해도 부담이 훨씬 적다.
function unprotectedValueInPlay(state) {
  const protectedSet = new Set(state.protectedCardIds);
  return state.playArea
    .filter((cid) => !protectedSet.has(cid))
    .reduce((sum, cid) => sum + getCard(cid).value, 0);
}

// 지금 내가 상대보다 뒤처져 있으면 조금 더 과감하게, 앞서 있으면 조금 더 안전하게.
function standingBias(state) {
  const me = state.players[state.currentPlayerIndex];
  const others = state.players.filter((p) => p.playerId !== me.playerId);
  if (others.length === 0) return 0;
  const myScore = computeScore(state, me);
  const bestOtherScore = Math.max(...others.map((p) => computeScore(state, p)));
  const gap = bestOtherScore - myScore; // 양수 = 내가 뒤처짐
  return Math.max(-0.12, Math.min(0.12, gap / 150));
}

function shouldKeepGoing(state) {
  if (state.requiredExtraDraws > 0) return true;
  const risk = bustProbability(state);
  const caution = Math.min(0.4, unprotectedValueInPlay(state) / 80);
  const continueChance = Math.max(0.03, Math.min(0.95, 0.9 - risk * 1.7 - caution + standingBias(state)));
  return nextRandom(state) < continueChance;
}

function chooseTraitPhaseAction(state, legal) {
  const d = state.pendingDecision;
  if (d.type === "harbor_watch_target") {
    // 옆 병원 당직자: 대소동이 나면 카드를 대신 받아올 대상이니, 지금 가장 앞서 있는
    // (많이 쌓아둔) 상대를 지정해두면 나중에 그 사람이 터졌을 때 이득이 크다.
    return bestByValue(legal, (a) => {
      const target = state.players.find((p) => p.playerId === a.targetPlayerId);
      return computeScore(state, target);
    });
  }
  // 특기 선택(SELECT_TRAIT): 미리 정해둔 대략적인 선호 순위에서 더 앞선(강한) 쪽을 고른다.
  return bestByValue(legal, (a) => {
    const rank = TRAIT_PREFERENCE.indexOf(a.traitId);
    return rank === -1 ? -1 : TRAIT_PREFERENCE.length - rank;
  });
}

function chooseDecisionAction(state, legal) {
  switch (state.pendingDecision.type) {
    case "monkey_choose_card": {
      // 이미 진료 줄에 있는 종류를 다시 불러오면 곧장 대소동이 난다 — 안전한 선택지가
      // 있으면 그중에서, 없으면(전부 위험하면) 어쩔 수 없이 전체 중에서 고른다.
      const pool = preferSafe(state, legal, (a) => a.value);
      return bestBySuitPriority(pool);
    }
    case "mole_choose_card": {
      const pool = preferSafe(state, legal, (a) => a.value);
      return bestByValue(pool, (a) => getCard(a.value).value);
    }
    case "dog_choose_target": {
      // 강아지 공포증 상대를 고르면 역공(내 병원에서 카드 하나를 잃음)당하니 피한다.
      const pool = legal.filter((a) => {
        const opponent = state.players.find((p) => p.playerId === a.value.opponentId);
        return !opponent || opponent.traitId !== "misfire";
      });
      return bestTarget(state, pool.length > 0 ? pool : legal);
    }
    case "cat_choose_target": {
      // 훔쳐온 카드가 내 진료 줄에서 이미 나온 종류와 겹치면 스스로 대소동을 낸다.
      const pool = legal.filter((a) => {
        const cardId = catTargetCardId(state, a.value);
        return cardId && !wouldBust(state, cardId);
      });
      return bestTarget(state, pool.length > 0 ? pool : legal);
    }
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

// legal 중 "지금 넣어도 대소동이 안 나는" 것만 남긴다. 하나도 없으면 원래 목록 그대로.
function preferSafe(state, legal, cardIdOf) {
  const safe = legal.filter((a) => !wouldBust(state, cardIdOf(a)));
  return safe.length > 0 ? safe : legal;
}

// 고양이 능력이 실제로 데려올 카드 ID — "오늘의 병원 규칙"에 따라 스택의 맨 위/아래가
// 달라지므로(작은 가족부터), 엔진과 같은 기준(getTargetCardId)으로 계산해야 정확하다.
function catTargetCardId(state, opt) {
  const opponent = state.players.find((p) => p.playerId === opt.opponentId);
  if (!opponent) return null;
  const variant = getVariant(state.activeVariantId);
  return getTargetCardId(opponent.hospitalStacks[opt.suit], variant);
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
  const safeTakes = takeOpts.filter((a) => !wouldBust(state, a.value.cardId));
  if (safeTakes.length > 0 && (!bankOpt || shouldKeepGoing(state))) {
    return bestByValue(safeTakes, (a) => getCard(a.value.cardId).value);
  }
  return bankOpt || takeOpts[0];
}
