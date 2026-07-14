// 카드 공개 처리 순서(명세 6.2장) — 이벤트 큐로 재귀 없이 처리한다.
// 카드 추가 → 중복 확인 → 대소동 또는 능력 발동 → 능력이 새 카드를 추가하면
// 그 카드도 같은 큐에 실려 순서대로 처리된다.
import { getCard } from "../data/cards.js";
import { traitEffect } from "../data/traits.js";
import { currentPlayer, logAction } from "./state.js";
import { getTopCardId, removeFromHospital, gainCardToHospital } from "./hospital.js";
import {
  resolveSuitAbility,
  beginMonkeyPick,
  beginDogPick,
  beginMolePick,
  beginOwlPeek,
  beginCatPick,
} from "./abilities.js";
import { checkDuplicate, resolveBust } from "./bust.js";

export function runQueue(state) {
  while (state.effectQueue.length && !state.pendingDecision && state.phase !== "game_over") {
    const task = state.effectQueue.shift();
    executeTask(state, task);
  }
  if (state.phase === "resolving_card" && !state.pendingDecision && state.effectQueue.length === 0) {
    state.phase = "waiting_for_choice";
  }
}

function executeTask(state, task) {
  switch (task.type) {
    case "ENTER_CARD":
      return handleEnterCard(state, task.cardId);
    case "MONKEY_PICK":
      return beginMonkeyPick(state, task);
    case "DOG_PICK":
      return beginDogPick(state, task);
    case "MOLE_PICK":
      return beginMolePick(state, task);
    case "OWL_PEEK":
      return beginOwlPeek(state, task);
    case "CAT_PICK":
      return beginCatPick(state, task);
    default:
      throw new Error("알 수 없는 작업: " + task.type);
  }
}

function handleEnterCard(state, cardId) {
  state.playArea.push(cardId);

  if (checkDuplicate(state, cardId)) {
    resolveBust(state, cardId);
    return;
  }

  // 확장형 거북이 보호대(세이프 하버)가 걸어둔 보호 카운트다운을 먼저 소모한다.
  // (지금 이 카드가 새 거북이라 카운트다운을 "다시" 세팅하기 전 시점 기준으로 소모해야
  //  거북이 자신은 아래 훅에서 별도로 보호되고, 카운트다운은 그 "다음" 카드부터 적용된다.)
  if (state.turnFlags.safeHarborRemaining > 0) {
    if (!state.protectedCardIds.includes(cardId)) state.protectedCardIds.push(cardId);
    state.turnFlags.safeHarborRemaining--;
  }

  state.requiredExtraDraws = Math.max(0, state.requiredExtraDraws - 1);

  const actor = currentPlayer(state);
  const card = getCard(cardId);

  // 카드가 들어온 직후 훅 — 모든 플레이어의 특기를 순서대로 확인한다.
  // 대부분은 본인(isSelf) 조건만 보지만, 원작 특기 중 다수는 "다른 사람이 ~하면"
  // 반응하거나(고양이 알레르기) 누가 갖고 있든 전역 적용(확장형 거북이 보호대)된다.
  const ctx = {
    card,
    cardId,
    actor,
    protectNow(cid) {
      if (!state.protectedCardIds.includes(cid)) state.protectedCardIds.push(cid);
    },
    adoptNow(cid) {
      const idx = state.playArea.indexOf(cid);
      if (idx !== -1) state.playArea.splice(idx, 1);
      gainCardToHospital(state, actor, cid);
      ctx.handled = true;
    },
    ejectToDiscard(cid) {
      const idx = state.playArea.indexOf(cid);
      if (idx !== -1) state.playArea.splice(idx, 1);
      state.discardPile.push(cid);
      ctx.handled = true;
    },
    // 고양이 알레르기: 소유자(holder)의 토끼 카드를 빼서 지금 진료 줄에 강제로 추가한다.
    transferRabbitFrom(holder) {
      const topId = getTopCardId(holder.hospitalStacks.rabbit);
      if (!topId) return;
      removeFromHospital(holder, topId);
      state.effectQueue.push({ type: "ENTER_CARD", cardId: topId });
      logAction(state, { type: "parry_transfer", holderId: holder.playerId, actorId: actor.playerId, cardId: topId });
    },
    handled: false,
  };

  for (const p of state.players) {
    const hook = traitEffect(p, "onCardEntered");
    if (hook) hook(state, { ...ctx, isSelf: p.playerId === actor.playerId, holder: p });
    if (ctx.handled) break;
  }

  if (ctx.handled) return; // 즉시 입원(공작 애호가) 또는 귀가 더미행(고양이 알레르기) — 능력 미발동

  logAction(state, { type: "card_entered", playerId: actor.playerId, cardId, suit: card.suit, value: card.value });
  resolveSuitAbility(state, cardId);
}

// 대기실 덱에서 카드를 한 장 뽑아 진료 줄에 올린다.
// 턴의 첫 카드(강제)와 "환자 더 받기"(자발적/토끼 강제) 모두 이 함수를 쓴다.
export function doDraw(state) {
  const cardId = state.drawPile.pop();
  state.effectQueue.push({ type: "ENTER_CARD", cardId });
  state.phase = "resolving_card";
  runQueue(state);
}
