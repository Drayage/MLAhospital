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

// 기본 카드 풀 (60장) — 열거가 필요한 곳(예: 공작 카드 전부 훑기)에서 쓴다.
export const CARD_POOL = buildCardPool(1);

// ID 문자열(`suit-value` 또는 파티모드의 `suit-value-instance`)에서 직접 파싱한다.
// 예전엔 고정된 CARD_POOL(deckMultiplier=1)을 조회했는데, 그러면 파티모드(2배, "-a"/"-b"
// 접미사 ID)의 카드를 못 찾고 에러가 났다 — ID 포맷이 결정적이므로 파싱이 더 안전하다.
export function getCard(cardId) {
  const dashIdx = cardId.indexOf("-");
  const suit = cardId.slice(0, dashIdx);
  const value = parseInt(cardId.slice(dashIdx + 1), 10);
  if (!SUITS.includes(suit) || Number.isNaN(value)) {
    throw new Error("알 수 없는 카드 ID: " + cardId);
  }
  return { id: cardId, suit, value };
}

export function allCardIds(deckMultiplier = 1) {
  if (deckMultiplier === 1) return Object.keys(CARD_POOL);
  return Object.keys(buildCardPool(deckMultiplier));
}
