// 오늘의 병원 규칙 (게임 변형 카드) — 명세 14장. 원작 Dead Man's Draw 변형 카드
// (Thieves Island ~ Beneath the Waves) + 공식 웹 추가 변형(Bottom Feeder) 1종.
// 각 변형은 기본 엔진 함수를 훅으로 "덮어쓰는" 형태로 구현한다 (명세 23장 설계 원칙).
// 한 게임에는 최대 1개의 변형만 활성화된다 (명세 5.4/14).
import { SUITS } from "./animals.js";

export const VARIANTS = {
  transfer_to_left: {
    id: "transfer_to_left",
    name: "옆 병원으로 이송",
    originalName: "Thieves Island",
    description: "누군가 대소동을 일으키면, 보호되지 않은 카드가 귀가 더미 대신 왼쪽 플레이어 병원에 전부 입원됩니다. 2인 게임에서는 곧바로 상대가 전부 가져갑니다.",
    bustDestination(state, ownerPlayer) {
      const idx = ownerPlayer.seatIndex;
      const n = state.players.length;
      const leftPlayer = state.players.find((p) => p.seatIndex === (idx + 1) % n);
      return { type: "player", playerId: leftPlayer.playerId };
    },
  },

  score_all_cards: {
    id: "score_all_cards",
    name: "모두 소중한 환자",
    originalName: "Pile o' Treasure",
    description: "게임 종료 시 종류별 가장 큰 가족만 계산하지 않고, 내 병원에 있는 모든 카드의 숫자를 합산합니다.",
    scoreStyle: "sum_all",
  },

  sudden_death_50: {
    id: "sudden_death_50",
    name: "목표 환자 수",
    originalName: "Sudden Death",
    description: "자기 병원의 현재 점수가 50점 이상이 되는 순간 즉시 승리합니다. 점수는 기본 규칙대로 종류별 가장 큰 가족 카드만 계산합니다.",
    suddenDeathThreshold: 50,
  },

  missing_suit_penalty: {
    id: "missing_suit_penalty",
    name: "모든 동물을 돌봐요",
    originalName: "All Hands on Deck",
    description: "게임 종료 시 보유하지 못한 환자 종류 하나당 5점을 감점합니다. 아몬드 바구니도 하나의 카드 종류로 계산됩니다.",
    // 햄스터/아몬드도 각각 별도 종류로 계산 (SUITS 전체 10종 기준).
    missingSuitPenalty(player, cardsById) {
      let missing = 0;
      for (const suit of SUITS) {
        if (!player.hospitalStacks[suit] || player.hospitalStacks[suit].length === 0) missing++;
      }
      return missing * -5;
    },
  },

  duplicate_by_number: {
    id: "duplicate_by_number",
    name: "같은 규모 예약 충돌",
    originalName: "Strange Lands",
    description: "종류가 같은 카드가 아니라 숫자가 같은 카드가 두 장 나오면 대소동이 발생합니다. 같은 동물이어도 숫자가 다르면 함께 진료할 수 있습니다.",
    isDuplicate(state, playArea, newCardId, getCard) {
      const newCard = getCard(newCardId);
      return playArea.slice(0, -1).some((cid) => getCard(cid).value === newCard.value);
    },
  },

  stay_below_60: {
    id: "stay_below_60",
    name: "정원 초과 금지",
    originalName: "Beneath the Waves",
    description: "최종 점수가 60점 미만인 플레이어 중 가장 높은 사람이 승리합니다. 60점 이상은 즉시 승리 후보에서 제외됩니다.",
    winnerCap: 60,
  },

  bottom_feeder: {
    id: "bottom_feeder",
    name: "작은 가족부터",
    originalName: "Bottom Feeder (공식 웹 추가 변형)",
    description: "고양이와 강아지 능력으로 상대 카드를 가져오거나 내보낼 때, 가족 더미의 맨 위(가장 큰 가족)가 아니라 맨 아래(가장 작은 가족) 카드가 대상이 됩니다.",
    smallestFamilyFirst: true,
  },
};

export function getVariant(variantId) {
  if (!variantId) return null;
  return VARIANTS[variantId] || null;
}

export function randomVariantId(rng) {
  const ids = Object.keys(VARIANTS);
  return ids[Math.floor(rng() * ids.length)];
}
