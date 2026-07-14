// 환자 카드 능력 — 명세 9장. 각 능력은 begin(선택지 계산/자동실행/결정대기)과
// resolve(결정 확정 후 실제 처리)로 나뉜다. 옵션이 1개 이하면 즉시 자동 실행한다.
import { getCard } from "../data/cards.js";
import { traitEffect } from "../data/traits.js";
import { currentPlayer, getPlayer, logAction } from "./state.js";
import { getTopCardId, removeFromHospital, hospitalSuitsWithCards } from "./hospital.js";
import { nextRandom } from "./rng.js";

export function resolveSuitAbility(state, cardId) {
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
      return state.effectQueue.push({ type: "OWL_PEEK", playerId: player.playerId, peekCount: owlPeekCount(player) });
    case "cat":
      return state.effectQueue.push({ type: "CAT_PICK", playerId: player.playerId });
    case "hamster":
    case "almond":
    case "peacock":
      return; // 능력 없음 (조합/뱅킹 시점 또는 무능력)
    case "rabbit":
      return abilityRabbit(state, player);
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
  const protectSelf = traitEffect(player, "protectSelf");
  if (protectSelf && protectSelf(state, { cardId, player }) && !state.protectedCardIds.includes(cardId)) {
    state.protectedCardIds.push(cardId);
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
function dogRemoveCount(player) {
  const override = traitEffect(player, "dogRemoveCount");
  return override ? override() : 1;
}
function dogDestination(player) {
  const override = traitEffect(player, "dogDestination");
  return override ? override() : "discard";
}

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
  const count = dogRemoveCount(player);
  const destination = dogDestination(player);
  const removed = [];
  for (let i = 0; i < count; i++) {
    const stack = opponent.hospitalStacks[suit];
    const topId = getTopCardId(stack);
    if (!topId) break;
    removeFromHospital(opponent, topId);
    removed.push(topId);
    if (destination === "owner_hospital") {
      player.hospitalStacks[getCard(topId).suit].push(topId);
    } else {
      state.discardPile.push(topId);
    }
  }
  logAction(state, { type: "dog_remove", playerId: player.playerId, opponentId, suit, removed, destination });
}

// ── 두더지: 귀가 더미 탐색 ──────────────────────────────────────
function moleRevealCount(player) {
  const override = traitEffect(player, "moleRevealCount");
  return override ? override() : 3;
}

export function beginMolePick(state, task) {
  const player = getPlayer(state, task.playerId);
  if (state.discardPile.length === 0) return;
  const n = Math.min(moleRevealCount(player), state.discardPile.length);
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
  const keeperHook = traitEffect(player, "moleKeeperBonus");
  let keeperTaken = [];
  if (keeperHook && unchosenCardIds.length > 0) {
    const bonusCount = Math.min(keeperHook(state, { unchosenCardIds }), unchosenCardIds.length);
    keeperTaken = unchosenCardIds.slice(0, bonusCount);
    for (const cid of keeperTaken) {
      player.hospitalStacks[getCard(cid).suit].push(cid);
    }
  }
  const returned = unchosenCardIds.filter((cid) => !keeperTaken.includes(cid));
  state.discardPile.push(...returned);
  logAction(state, { type: "mole_pick", playerId: player.playerId, cardId, returned, keeperTaken });
  state.effectQueue.push({ type: "ENTER_CARD", cardId });
}

// ── 부엉이: 다음 카드 확인 ───────────────────────────────────────
function owlPeekCount(player) {
  const override = traitEffect(player, "owlPeekCount");
  return override ? override() : 1;
}

export function beginOwlPeek(state, task) {
  const player = getPlayer(state, task.playerId);
  if (state.drawPile.length === 0) return; // 볼 카드 없음 — 효과 없음
  const n = Math.min(task.peekCount || 1, state.drawPile.length);
  const previewCardIds = state.drawPile.slice(state.drawPile.length - n);
  const canBank = state.requiredExtraDraws === 0;
  state.pendingDecision = {
    type: "owl_choose",
    playerId: player.playerId,
    previewCardIds,
    canBank,
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
  const topId = getTopCardId(opponent.hospitalStacks[suit]);
  if (!topId) return;
  removeFromHospital(opponent, topId);
  logAction(state, { type: "cat_steal", playerId: player.playerId, opponentId, cardId: topId });
  state.effectQueue.push({ type: "ENTER_CARD", cardId: topId });
}

// ── 토끼: 추가 접수 강제 ─────────────────────────────────────────
function abilityRabbit(state, player) {
  const override = traitEffect(player, "rabbitIncrement");
  const amount = override ? override() : 2;
  state.requiredExtraDraws += amount;
  logAction(state, { type: "ability_rabbit", playerId: player.playerId, amount, requiredExtraDraws: state.requiredExtraDraws });
}
