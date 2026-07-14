// 입원실(hospitalStacks) 조작 헬퍼 — 명세 5.1/6.4.2/11장.
import { getCard } from "../data/cards.js";
import { logAction } from "./state.js";

// 스택 안에서 가장 숫자가 높은 카드 ID (없으면 null). "맨 위"의 정의.
export function getTopCardId(stack) {
  if (!stack || stack.length === 0) return null;
  let best = stack[0];
  for (const cid of stack) {
    if (getCard(cid).value > getCard(best).value) best = cid;
  }
  return best;
}

// 스택 안에서 가장 숫자가 낮은 카드 ID — "작은 가족부터" 변형 규칙(Bottom Feeder)용.
export function getBottomCardId(stack) {
  if (!stack || stack.length === 0) return null;
  let worst = stack[0];
  for (const cid of stack) {
    if (getCard(cid).value < getCard(worst).value) worst = cid;
  }
  return worst;
}

// 고양이/강아지가 상대 카드를 대상으로 할 때, 활성 변형 규칙에 따라 맨 위(기본) 또는
// 맨 아래(작은 가족부터) 카드를 고른다.
export function getTargetCardId(stack, variant) {
  return variant && variant.smallestFamilyFirst ? getBottomCardId(stack) : getTopCardId(stack);
}

export function removeFromHospital(player, cardId) {
  const suit = getCard(cardId).suit;
  const stack = player.hospitalStacks[suit];
  const idx = stack.indexOf(cardId);
  if (idx === -1) throw new Error(`${player.playerId}의 입원실에 ${cardId}가 없습니다.`);
  stack.splice(idx, 1);
}

// 카드를 플레이어 입원실에 최종적으로 넣는다 (뱅킹/보호 성공 시 호출).
export function gainCardToHospital(state, player, cardId) {
  const card = getCard(cardId);
  player.hospitalStacks[card.suit].push(cardId);
  logAction(state, { type: "gain_card", playerId: player.playerId, cardId });
}

export function hasAnyHospitalCards(player) {
  return Object.values(player.hospitalStacks).some((stack) => stack.length > 0);
}

export function hospitalSuitsWithCards(player) {
  return Object.keys(player.hospitalStacks).filter((s) => player.hospitalStacks[s].length > 0);
}

export function totalHospitalCardCount(player) {
  return Object.values(player.hospitalStacks).reduce((sum, s) => sum + s.length, 0);
}
