// 환자 카드 능력 — 명세 9장. 각 능력은 begin(선택지 계산/자동실행/결정대기)과
// resolve(결정 확정 후 실제 처리)로 나뉜다. 옵션이 1개 이하면 즉시 자동 실행한다.
import { getCard } from "../data/cards.js";
import { traitEffect, findPlayerWithTrait } from "../data/traits.js";
import { getVariant } from "../data/variants.js";
import { currentPlayer, getPlayer, logAction } from "./state.js";
import {
  getTopCardId,
  getTargetCardId,
  removeFromHospital,
  hospitalSuitsWithCards,
  gainCardToHospital,
} from "./hospital.js";
import { nextRandom } from "./rng.js";

function activeVariant(state) {
  return getVariant(state.activeVariantId);
}

export function resolveSuitAbility(state, cardId) {
  // 심심한 모드: 카드는 그냥 숫자 카드일 뿐 — 어떤 동물 능력도 발동하지 않는다
  // (거북이 보호도, 토끼 강제 접수도 없다. 순수하게 겹침만 피하면 되는 게임이 된다).
  if (state.mode.noAbilities) return;
  const card = getCard(cardId);
  const player = currentPlayer(state);
  switch (card.suit) {
    case "turtle":
      return abilityTurtle(state, cardId, player);
    case "monkey":
      return state.effectQueue.push({ type: "MONKEY_PICK", playerId: player.playerId, remaining: monkeyPickCount(player) });
    case "dog":
      return state.effectQueue.push({ type: "DOG_PICK", playerId: player.playerId });
    case "mole":
      return state.effectQueue.push({ type: "MOLE_PICK", playerId: player.playerId });
    case "owl":
      return state.effectQueue.push({ type: "OWL_PEEK", playerId: player.playerId });
    case "cat":
      return state.effectQueue.push({ type: "CAT_PICK", playerId: player.playerId });
    case "hamster":
    case "almond":
    case "peacock":
      return; // 능력 없음 (조합/뱅킹 시점 또는 무능력. 공작 애호가는 onCardEntered에서 처리)
    case "rabbit":
      return abilityRabbit(state, cardId, player);
    default:
      throw new Error("알 수 없는 카드 종류: " + card.suit);
  }
}

// ── 거북이: 이전 카드 보호 ──────────────────────────────────────
function abilityTurtle(state, cardId, player) {
  const idx = state.playArea.indexOf(cardId);
  const before = state.playArea.slice(0, idx);
  for (const cid of before) {
    if (!state.protectedCardIds.includes(cid)) state.protectedCardIds.push(cid);
  }
  logAction(state, { type: "ability_turtle", playerId: player.playerId, protected: before });
}

// ── 원숭이: 입원실 카드 재투입 ──────────────────────────────────
function monkeyPickCount(player) {
  const override = traitEffect(player, "monkeyPickCount");
  return override ? override() : 1;
}

export function monkeyOptions(player) {
  return hospitalSuitsWithCards(player).map((suit) => getTopCardId(player.hospitalStacks[suit]));
}

export function beginMonkeyPick(state, task) {
  const player = getPlayer(state, task.playerId);
  const options = monkeyOptions(player);
  if (options.length === 0) return; // 입원실 비어있음 — 효과 없음
  if (options.length === 1) {
    applyMonkeyPick(state, player, options[0], task.remaining);
    return;
  }
  state.pendingDecision = { type: "monkey_choose_card", playerId: player.playerId, options, remaining: task.remaining };
}

export function resolveMonkeyDecision(state, cardId) {
  const decision = state.pendingDecision;
  const player = getPlayer(state, decision.playerId);
  state.pendingDecision = null;
  applyMonkeyPick(state, player, cardId, decision.remaining);
}

function applyMonkeyPick(state, player, cardId, remaining) {
  removeFromHospital(player, cardId);
  state.turnFlags.monkeyRecalledCardIds.push(cardId);
  logAction(state, { type: "monkey_recall", playerId: player.playerId, cardId });
  state.effectQueue.push({ type: "ENTER_CARD", cardId });
  if (remaining > 1) {
    state.effectQueue.push({ type: "MONKEY_PICK", playerId: player.playerId, remaining: remaining - 1 });
  }
}

// ── 강아지: 상대 카드 제거 ──────────────────────────────────────
function dogDestination(player) {
  const override = traitEffect(player, "dogDestination");
  return override ? override() : "discard";
}

// 강아지 공포증(Misfire) 보유자는 강아지 능력의 대상이 될 수 없다 — 그를 선택하면
// 대신 공격한 쪽이 자기 병원에서 카드 한 장을 잃는다. 그래서 정상 대상 목록에는
// 남겨두되(선택은 가능), 실제 처리에서 반사시킨다.
export function dogOptions(state, player) {
  const opponents = state.players.filter((p) => p.playerId !== player.playerId);
  const options = [];
  for (const opp of opponents) {
    for (const suit of hospitalSuitsWithCards(opp)) {
      options.push({ opponentId: opp.playerId, suit });
    }
  }
  return options;
}

export function beginDogPick(state, task) {
  const player = getPlayer(state, task.playerId);
  const options = dogOptions(state, player);
  if (options.length === 0) return;
  if (options.length === 1) {
    applyDogPick(state, player, options[0]);
    return;
  }
  state.pendingDecision = { type: "dog_choose_target", playerId: player.playerId, options };
}

export function resolveDogDecision(state, choice) {
  const decision = state.pendingDecision;
  const player = getPlayer(state, decision.playerId);
  state.pendingDecision = null;
  applyDogPick(state, player, choice);
}

function applyDogPick(state, player, { opponentId, suit }) {
  const opponent = getPlayer(state, opponentId);

  // 강아지 공포증: 반사 — 공격자 자신의 입원실에서 무작위 카드 한 장을 대신 잃는다.
  if (opponent.traitId === "misfire") {
    const mySuits = hospitalSuitsWithCards(player);
    if (mySuits.length > 0) {
      const pickSuit = mySuits[Math.floor(nextRandom(state) * mySuits.length)];
      const topId = getTopCardId(player.hospitalStacks[pickSuit]);
      removeFromHospital(player, topId);
      state.discardPile.push(topId);
      logAction(state, { type: "misfire_reflect", playerId: player.playerId, opponentId, cardId: topId });
    }
    return;
  }

  const destination = dogDestination(player);
  const entireStack = !!traitEffect(player, "dogRemoveEntireStack");
  const variant = activeVariant(state);
  const stack = opponent.hospitalStacks[suit];
  const removed = [];
  const count = entireStack ? stack.length : 1;
  for (let i = 0; i < count; i++) {
    const targetId = getTargetCardId(stack, variant);
    if (!targetId) break;
    removeFromHospital(opponent, targetId);
    removed.push(targetId);
    if (destination === "owner_hospital") {
      player.hospitalStacks[getCard(targetId).suit].push(targetId);
    } else {
      state.discardPile.push(targetId);
    }
  }
  logAction(state, { type: "dog_remove", playerId: player.playerId, opponentId, suit, removed, destination });
}

// ── 두더지: 귀가 더미 탐색 ──────────────────────────────────────
export function beginMolePick(state, task) {
  const player = getPlayer(state, task.playerId);
  if (state.discardPile.length === 0) return;
  const revealAll = !!traitEffect(player, "moleRevealAll");
  const n = revealAll ? state.discardPile.length : Math.min(3, state.discardPile.length);
  const revealed = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(nextRandom(state) * state.discardPile.length);
    revealed.push(state.discardPile.splice(idx, 1)[0]);
  }
  if (revealed.length === 1) {
    applyMolePick(state, player, revealed[0], []);
    return;
  }
  state.pendingDecision = { type: "mole_choose_card", playerId: player.playerId, options: revealed };
}

export function resolveMoleDecision(state, cardId) {
  const decision = state.pendingDecision;
  const player = getPlayer(state, decision.playerId);
  const unchosen = decision.options.filter((cid) => cid !== cardId);
  state.pendingDecision = null;
  applyMolePick(state, player, cardId, unchosen);
}

function applyMolePick(state, player, cardId, unchosenCardIds) {
  state.discardPile.push(...unchosenCardIds);
  logAction(state, { type: "mole_pick", playerId: player.playerId, cardId, returned: unchosenCardIds });
  state.effectQueue.push({ type: "ENTER_CARD", cardId });
}

// ── 부엉이: 다음 카드 확인 ───────────────────────────────────────
export function beginOwlPeek(state, task) {
  const player = getPlayer(state, task.playerId);
  if (state.drawPile.length === 0) return; // 볼 카드 없음 — 효과 없음
  const mysticMode = !!traitEffect(player, "owlMysticMode");
  const n = Math.min(mysticMode ? 3 : 1, state.drawPile.length);
  // drawPile은 배열 끝이 "맨 위"(다음에 뽑힐 카드)이므로, 뽑히는 순서대로 보여주려면
  // 뒤집어야 한다 (안 그러면 맨 위 카드가 미리보기의 마지막에 와서, 부엉이 영상
  // 판독가가 "첫 번째 카드"를 접수할 때 실제로는 가장 먼 카드를 접수하게 되는 버그가 생김).
  const previewCardIds = state.drawPile.slice(state.drawPile.length - n).reverse();
  const canBank = state.requiredExtraDraws === 0;
  state.pendingDecision = {
    type: "owl_choose",
    playerId: player.playerId,
    previewCardIds,
    canBank,
    // 부엉이 영상 판독가: 순서를 확인만 하고, 접수하려면 반드시 맨 앞(첫 번째) 카드만 가능.
    mysticMode,
  };
}

export function resolveOwlDecision(state, choice) {
  // choice: { action: "take", cardId } | { action: "bank" }
  const decision = state.pendingDecision;
  const player = getPlayer(state, decision.playerId);
  state.pendingDecision = null;
  if (choice.action === "bank") {
    if (!decision.canBank) throw new Error("추가 접수가 강제된 상태에서는 진료를 마칠 수 없습니다.");
    return { bankNow: true };
  }
  if (decision.mysticMode && choice.cardId !== decision.previewCardIds[0]) {
    throw new Error("부엉이 영상 판독가는 첫 번째 카드만 접수할 수 있습니다.");
  }
  const cardId = choice.cardId;
  // 미리 본 카드 중 선택한 카드만 덱에서 꺼내고 나머지는 원래 순서로 되돌린다.
  const idx = state.drawPile.lastIndexOf(cardId);
  state.drawPile.splice(idx, 1);
  state.turnFlags.owlDrawnCardIds.push(cardId);
  logAction(state, { type: "owl_take", playerId: player.playerId, cardId });
  state.effectQueue.push({ type: "ENTER_CARD", cardId });
  return { bankNow: false };
}

// ── 고양이: 상대 카드 가져오기 ──────────────────────────────────
export function catOptions(state, player) {
  const unlimited = !!traitEffect(player, "catUnlimited");
  const mySuits = new Set(hospitalSuitsWithCards(player));
  const opponents = state.players.filter((p) => p.playerId !== player.playerId);
  const options = [];
  for (const opp of opponents) {
    for (const suit of hospitalSuitsWithCards(opp)) {
      if (!unlimited && mySuits.has(suit)) continue;
      options.push({ opponentId: opp.playerId, suit });
    }
  }
  return options;
}

export function beginCatPick(state, task) {
  const player = getPlayer(state, task.playerId);
  const options = catOptions(state, player);
  if (options.length === 0) return;
  if (options.length === 1) {
    applyCatPick(state, player, options[0]);
    return;
  }
  state.pendingDecision = { type: "cat_choose_target", playerId: player.playerId, options };
}

export function resolveCatDecision(state, choice) {
  const decision = state.pendingDecision;
  const player = getPlayer(state, decision.playerId);
  state.pendingDecision = null;
  applyCatPick(state, player, choice);
}

function applyCatPick(state, player, { opponentId, suit }) {
  const opponent = getPlayer(state, opponentId);
  const variant = activeVariant(state);
  const targetId = getTargetCardId(opponent.hospitalStacks[suit], variant);
  if (!targetId) return;
  removeFromHospital(opponent, targetId);
  logAction(state, { type: "cat_steal", playerId: player.playerId, opponentId, cardId: targetId });
  state.effectQueue.push({ type: "ENTER_CARD", cardId: targetId });
}

// ── 토끼: 추가 접수 강제 ─────────────────────────────────────────
function abilityRabbit(state, cardId, player) {
  // 토끼 전담 수의사: 즉시 입원, 추가 접수 요구 없음.
  if (traitEffect(player, "rabbitInstantAdopt")) {
    const idx = state.playArea.indexOf(cardId);
    if (idx !== -1) state.playArea.splice(idx, 1);
    gainCardToHospital(state, player, cardId);
    logAction(state, { type: "ability_rabbit_instant", playerId: player.playerId, cardId });
    return;
  }
  // 토끼 행동 전문가(Beastmaster): 다른 누군가 갖고 있으면 2장 대신 4장 요구 (내가 보유한 경우 제외).
  const beastmaster = findPlayerWithTrait(state, "beastmaster", player.playerId);
  const amount = beastmaster ? 4 : 2;
  state.requiredExtraDraws += amount;
  logAction(state, { type: "ability_rabbit", playerId: player.playerId, amount, requiredExtraDraws: state.requiredExtraDraws });
}
