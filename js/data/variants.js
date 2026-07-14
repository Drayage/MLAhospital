// 오늘의 병원 규칙 (게임 변형 카드) — 명세 14장.
// 각 변형은 기본 엔진 함수를 훅으로 "덮어쓰는" 형태로 구현한다 (명세 23장 설계 원칙).
// 한 게임에는 최대 1개의 변형만 활성화된다 (명세 5.4/14).
import { SUITS } from "./animals.js";

export const VARIANTS = {
  transfer_to_left: {
    id: "transfer_to_left",
    name: "옆집 병원 소개",
    description: "대소동 시 보호되지 않은 카드가 귀가 더미가 아니라 왼쪽 플레이어에게 갑니다.",
    // 대소동 시 보호되지 않은 카드의 목적지를 결정.
    bustDestination(state, ownerPlayer) {
      const idx = ownerPlayer.seatIndex;
      const n = state.players.length;
      const leftPlayer = state.players.find((p) => p.seatIndex === (idx + 1) % n);
      return { type: "player", playerId: leftPlayer.playerId };
    },
  },

  score_all_cards: {
    id: "score_all_cards",
    name: "박리다매 병원",
    description: "종류별 최고 카드가 아니라 입원실의 모든 카드 숫자를 합산합니다.",
    scoreStyle: "sum_all",
  },

  sudden_death_50: {
    id: "sudden_death_50",
    name: "50점 즉시 마감",
    description: "어떤 플레이어의 점수가 50점 이상이 되는 순간 게임이 끝나고 그 플레이어가 승리합니다.",
    suddenDeathThreshold: 50,
  },

  missing_suit_penalty: {
    id: "missing_suit_penalty",
    name: "전문의 평가 규정",
    description: "게임 종료 시 보유하지 않은 카드 종류 하나당 5점을 감점합니다.",
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
    name: "숫자로 접수하는 병원",
    description: "대소동 판정 기준이 종류가 아니라 숫자로 바뀝니다. 능력은 그대로 종류 기준으로 발동합니다.",
    // 새 카드가 이미 진료 줄에 있는 카드와 "숫자"가 같으면 대소동.
    isDuplicate(state, playArea, newCardId, getCard) {
      const newCard = getCard(newCardId);
      return playArea.slice(0, -1).some((cid) => getCard(cid).value === newCard.value);
    },
  },

  stay_below_60: {
    id: "stay_below_60",
    name: "적정 진료 규정",
    description: "60점 이상인 플레이어는 승리 자격을 잃습니다. 모두 60점 이상이면 가장 낮은 점수의 플레이어가 승리합니다.",
    winnerCap: 60,
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
