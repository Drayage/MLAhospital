// 환자(동물) 종류 정의 — 명세 3장.
// 이 파일만 고치면 게임에 등장하는 동물 종류/이름/설명이 바뀐다.

export const SUITS = [
  "turtle", "monkey", "dog", "hamster", "almond",
  "mole", "owl", "cat", "peacock", "rabbit",
];

// 숫자 범위가 다른 동물들과 다른 종류 (공작만 특수)
export const NORMAL_SUITS = SUITS.filter((s) => s !== "peacock");
export const NORMAL_VALUES = [2, 3, 4, 5, 6, 7];
export const PEACOCK_VALUES = [4, 5, 6, 7, 8, 9];

export const ANIMALS = {
  turtle: {
    id: "turtle",
    name: "거북이 가족",
    icon: "🐢",
    ability: "이전 카드 보호",
    description: "진료 줄에 들어오면 이전에 놓인 모든 카드를 보호합니다.",
  },
  monkey: {
    id: "monkey",
    name: "원숭이 가족",
    icon: "🐵",
    ability: "입원실 카드 재투입",
    description: "내 입원실에서 카드 한 장을 골라 진료 줄에 다시 데려옵니다.",
  },
  dog: {
    id: "dog",
    name: "강아지 가족",
    icon: "🐶",
    ability: "상대 카드 제거",
    description: "상대 입원실의 카드 한 장을 골라 귀가시킵니다.",
  },
  hamster: {
    id: "hamster",
    name: "햄스터 가족",
    icon: "🐹",
    ability: "아몬드와 조합",
    description: "단독 능력 없음. 아몬드 바구니와 함께 확보하면 보너스!",
  },
  almond: {
    id: "almond",
    name: "아몬드 바구니",
    icon: "🥜",
    ability: "햄스터와 조합",
    description: "단독 능력 없음. 햄스터 가족과 함께 확보하면 보너스!",
  },
  mole: {
    id: "mole",
    name: "두더지 가족",
    icon: "🦔",
    ability: "귀가 더미 탐색",
    description: "귀가 더미에서 무작위 카드 최대 3장을 보고 한 장을 접수합니다.",
  },
  owl: {
    id: "owl",
    name: "부엉이 가족",
    icon: "🦉",
    ability: "다음 카드 확인",
    description: "대기실 덱의 다음 카드를 몰래 보고 접수할지 진료를 마칠지 정합니다.",
  },
  cat: {
    id: "cat",
    name: "고양이 가족",
    icon: "🐱",
    ability: "상대 카드 가져오기",
    description: "내 입원실에 없는 종류라면 상대의 카드를 가져올 수 있습니다.",
  },
  peacock: {
    id: "peacock",
    name: "공작 가족",
    icon: "🦚",
    ability: "없음 (고득점)",
    description: "특수능력은 없지만 숫자가 가장 높습니다.",
  },
  rabbit: {
    id: "rabbit",
    name: "토끼 가족",
    icon: "🐰",
    ability: "추가 접수 강제",
    description: "진료 줄에 들어오면 환자를 2가족 더 접수해야 합니다.",
  },
};

export function valuesFor(suit) {
  return suit === "peacock" ? PEACOCK_VALUES : NORMAL_VALUES;
}
