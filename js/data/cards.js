// 카드 생성 및 조회 — 명세 4장, 17장.
import { SUITS, valuesFor } from "./animals.js";

// deckMultiplier: 1 = 기본(60장), 2 = 카드 2배 확장(120장, 각 카드 2장씩).
// 확장 대비용 지원이며 기본 게임에서는 1만 사용한다 (명세 18장).
export function buildCardPool(deckMultiplier = 1) {
  const cards = {};
  for (const suit of SUITS) {
    for (const value of valuesFor(suit)) {
      for (let i = 0; i < deckMultiplier; i++) {
        const instance = deckMultiplier > 1 ? String.fromCharCode(97 + i) : null;
        const id = instance ? `${suit}-${value}-${instance}` : `${suit}-${value}`;
        cards[id] = { id, suit, value };
      }
    }
  }
  return cards;
}

// 기본 카드 풀 (60장) — 대부분의 코드는 이걸 그대로 쓴다.
export const CARD_POOL = buildCardPool(1);

export function getCard(cardId) {
  const card = CARD_POOL[cardId];
  if (!card) throw new Error("알 수 없는 카드 ID: " + cardId);
  return card;
}

export function allCardIds(deckMultiplier = 1) {
  if (deckMultiplier === 1) return Object.keys(CARD_POOL);
  return Object.keys(buildCardPool(deckMultiplier));
}
