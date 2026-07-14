// 카드 공개 처리 순서(명세 6.2장) — 이벤트 큐로 재귀 없이 처리한다.
// 카드 추가 → 중복 확인 → 대소동 또는 능력 발동 → 능력이 새 카드를 추가하면
// 그 카드도 같은 큐에 실려 순서대로 처리된다.
import { getCard } from "../data/cards.js";
import { traitEffect } from "../data/traits.js";
import { currentPlayer, logAction } from "./state.js";
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

  state.requiredExtraDraws = Math.max(0, state.requiredExtraDraws - 1);

  const player = currentPlayer(state);
  const card = getCard(cardId);
  const hook = traitEffect(player, "onCardEntered");
  if (hook) {
    hook(state, {
      card,
      cardId,
      protectNow: (cid) => {
        if (!state.protectedCardIds.includes(cid)) state.protectedCardIds.push(cid);
      },
    });
  }

  logAction(state, { type: "card_entered", playerId: player.playerId, cardId, suit: card.suit, value: card.value });
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
