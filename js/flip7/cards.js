// 번호표 뽑기 카드 정의 — 병원 대기표 접수 테마로 재구성.
// 원작 카드 구성을 그대로 따른다: 0~12 번호표(숫자만큼 장수, 단 0/1은 1장씩) 79장 +
// 보너스 카드(+2/+4/+6/+8/+10, VIP 진료권 ×2) 6장 + 특수권 3종×3장 = 94장.
export const NUMBER_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const FLIP_TARGET = 7; // 서로 다른 번호표 7장을 모으면 즉시 라운드 종료 + 보너스
export const FLIP7_BONUS = 15;
export const PLUS_AMOUNTS = [2, 4, 6, 8, 10];

function numberCount(n) {
  return n <= 1 ? 1 : n;
}

export function buildDeck() {
  const ids = [];
  for (const n of NUMBER_VALUES) {
    for (let i = 0; i < numberCount(n); i++) ids.push(`num-${n}-${i}`);
  }
  for (const amount of PLUS_AMOUNTS) ids.push(`mod-plus${amount}`);
  ids.push("mod-x2");
  for (let i = 0; i < 3; i++) ids.push(`act-freeze-${i}`);
  for (let i = 0; i < 3; i++) ids.push(`act-flip3-${i}`);
  for (let i = 0; i < 3; i++) ids.push(`act-second-${i}`);
  return ids;
}

// 카드 ID에서 직접 파싱한다(고정 풀 조회 방식은 아이디 형식이 늘어날 때 깨지기 쉽다 —
// 우리집 동물병원의 getCard가 deckMultiplier에서 겪었던 버그와 같은 함정을 피한다).
export function getCard(cardId) {
  const [kind, tag] = cardId.split("-");
  if (kind === "num") {
    return { id: cardId, kind: "number", value: Number(tag) };
  }
  if (kind === "mod") {
    if (tag === "x2") return { id: cardId, kind: "modifier", modType: "x2" };
    return { id: cardId, kind: "modifier", modType: "plus", amount: Number(tag.replace("plus", "")) };
  }
  if (kind === "act") {
    const map = { freeze: "freeze", flip3: "flip_three", second: "second_chance" };
    return { id: cardId, kind: "action", actionType: map[tag] };
  }
  throw new Error("알 수 없는 카드 ID: " + cardId);
}

// 카드 한 장의 화면 표시용 라벨/아이콘 — 병원 접수 테마.
export function cardDisplay(cardId) {
  const card = getCard(cardId);
  if (card.kind === "number") return { icon: "🎫", label: `번호표 ${card.value}`, sub: String(card.value) };
  if (card.kind === "modifier") {
    if (card.modType === "x2") return { icon: "💎", label: "VIP 진료권", sub: "×2" };
    return { icon: "⚡", label: "빠른 접수권", sub: `+${card.amount}` };
  }
  if (card.actionType === "freeze") return { icon: "🥶", label: "조기 마감권", sub: "" };
  if (card.actionType === "flip_three") return { icon: "🚨", label: "응급 호출", sub: "×3" };
  return { icon: "🎟️", label: "재접수권", sub: "" };
}

// 특수권(능력) 카드가 열릴 때 화면에 함께 보여줄 설명 — 특기/변형규칙 탭 설명과 같은 톤.
export const ACTION_DESCRIPTIONS = {
  freeze: "지정한 사람은 이번 라운드를 즉시 마감(동결)해요. 그때까지 모은 번호표가 그대로 점수로 확정돼요.",
  flip_three: "지정한 사람은 번호표를 3장 연달아 뽑아야 해요. 중간에 멈출 수 없어요.",
  second_chance: "번호가 중복되면 한 번 무효로 하고 계속 접수할 수 있어요. 이미 갖고 있으면 아직 없는 다른 사람에게 넘겨요.",
};

// 숫자마다 다른 색을 줘서(0~12, 13색 고른 간격) 카드가 한눈에 구분되게 한다.
export function numberColor(value) {
  const hue = Math.round((value / NUMBER_VALUES.length) * 360) % 360;
  return `hsl(${hue}, 68%, 40%)`;
}

export function computeCardsScore(cardIds) {
  let sum = 0;
  let flatBonus = 0;
  let hasX2 = false;
  for (const cid of cardIds) {
    const card = getCard(cid);
    if (card.kind === "number") sum += card.value;
    else if (card.modType === "x2") hasX2 = true;
    else flatBonus += card.amount;
  }
  return sum * (hasX2 ? 2 : 1) + flatBonus;
}
