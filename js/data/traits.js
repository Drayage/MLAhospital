// 수의사 특기 (17종) — 명세 13장. 원작 Dead Man's Draw 특성 카드
// (Beastmaster ~ Treasure Hunter) 정확한 효과를 병원 테마로 옮긴 것.
// 각 플레이어는 게임 시작 시 정확히 1개의 특기만 선택하므로(명세 5.3),
// 같은 특기를 두 플레이어가 동시에 가질 일은 없다(선택 시 서로 다른 2장씩 배분).
//
// 확장 지점(effects)은 엔진(js/engine/*)이 정해진 시점에 명시적으로 조회한다.
// 대부분은 "행동하는 본인"의 특기만 조회하면 되지만(self), 원작 특성 중 다수가
// "다른 플레이어가 ~하면 나에게 유리하게 반응"(other) 하거나 "누가 갖고 있든 모두에게
// 적용"(global) 되는 패턴이라 두 가지 조회 방식을 함께 쓴다:
//   - self: traitEffect(actingPlayer, key) — 지금까지 쓰던 방식
//   - other/global: findPlayerWithTrait(state, traitId, excludePlayerId?) — 플레이어 전체를
//     훑어 그 특기를 가진 사람을 찾는다 (js/engine/traitHooks.js)
//
// 사용하는 확장 지점 키:
//   onCardEntered(state, ctx)        — 카드가 진료 줄에 성공적으로 들어온 직후(능력 발동 전).
//                                      모든 플레이어의 이 훅을 순서대로 호출하며, ctx.isSelf로
//                                      "지금 낸 사람 본인인지" 구분한다. ctx.protectNow/adoptNow/
//                                      ejectToDiscard로 카드 상태를 바꿀 수 있다.
//   monkeyPickCount(state, ctx)      — 원숭이 능력의 선택 가능 장수 (기본 1)
//   rabbitInstantAdopt(state, ctx)   — true면 내가 낸 토끼를 추가 접수 없이 즉시 입원시킴
//   dogRemoveEntireStack(state, ctx) — true면 강아지 능력이 선택한 스택 전체를 귀가시킴
//   dogDestination(state, ctx)       — 강아지가 제거한 카드의 목적지 ("discard" | "owner_hospital")
//   hamsterAlmondBonus(state, ctx)   — 볼빵빵 보너스 장수 계산 (기본값을 ctx.defaultCount로 받음)
//   moleRevealAll(state, ctx)        — true면 두더지가 귀가 더미 3장이 아니라 전체를 공개
//   owlMysticMode(state, ctx)        — true면 부엉이가 3장을 순서대로 확인하고 첫 장만 접수 가능
//   catUnlimited(state, ctx)         — 고양이: 내 입원실 보유 종류 제한 해제 여부
//   peacockScoreBonus(state, ctx)    — 점수 계산 시 공작 카드 한 장당 추가할 점수

export const TRAITS = {
  beastmaster: {
    id: "beastmaster",
    name: "토끼 행동 전문가",
    originalName: "Beastmaster",
    description: "다른 플레이어가 토끼를 접수하면, 카드 2장이 아니라 4장을 더 접수해야 진료를 끝낼 수 있습니다. 나 자신에게는 적용되지 않습니다.",
    affectedSuit: "rabbit",
    priority: 100,
  },
  captains_hook: {
    id: "captains_hook",
    name: "원숭이 조련사",
    originalName: "Captain's Hook",
    description: "내가 원숭이를 접수하면 내 병원에서 카드 1장이 아니라 2장을 진료 줄에 추가합니다 (가능한 한 두 장 모두).",
    affectedSuit: "monkey",
    priority: 100,
    effects: {
      monkeyPickCount: () => 2,
    },
  },
  casanova: {
    id: "casanova",
    name: "공작 애호가",
    originalName: "Casanova",
    description: "내가 공작을 접수하면 공작 카드를 즉시 내 병원에 입원시킵니다. 공작은 진료 줄에서 빠지고, 나머지 진료를 계속할 수 있습니다.",
    affectedSuit: "peacock",
    priority: 200,
    effects: {
      onCardEntered(state, ctx) {
        if (ctx.isSelf && ctx.card.suit === "peacock") ctx.adoptNow(ctx.cardId);
      },
    },
  },
  harbor_watch: {
    id: "harbor_watch",
    name: "옆 병원 당직자",
    originalName: "Davy Jones' Locker",
    description: "게임 시작 시 다른 플레이어 한 명을 지정합니다. 그 플레이어가 대소동을 일으키면, 버려질 진료 줄의 카드들이 귀가 더미 대신 전부 내 병원에 입원됩니다.",
    affectedSuit: null,
    priority: 300,
    needsTargetPlayer: true,
  },
  fisherman: {
    id: "fisherman",
    name: "토끼 전담 수의사",
    originalName: "Fisherman",
    description: "내가 토끼를 접수하면 토끼를 즉시 내 병원에 입원시킵니다. 추가 카드 2장을 접수할 필요도 없습니다.",
    affectedSuit: "rabbit",
    priority: 100,
    effects: {
      rabbitInstantAdopt: () => true,
    },
  },
  golden_scales: {
    id: "golden_scales",
    name: "공작 품평 전문가",
    originalName: "Golden Scales",
    description: "내가 확보한 공작 가족 카드의 점수를 각각 5점 높게 계산합니다 (보통 가장 큰 공작 한 장만 점수가 되므로, 일반적으로 그 카드에 +5점).",
    affectedSuit: "peacock",
    priority: 500,
    effects: {
      peacockScoreBonus: () => 5,
    },
  },
  miser: {
    id: "miser",
    name: "원숭이 안전관리자",
    originalName: "Miser",
    description: "원숭이 능력으로 내 병원에서 진료 줄에 추가한 카드는 대소동이 발생해도 안전합니다. 내가 직접 접수한 원숭이 카드도 안전합니다.",
    affectedSuit: "monkey",
    priority: 200,
    effects: {
      onCardEntered(state, ctx) {
        if (ctx.isSelf && ctx.card.suit === "monkey") ctx.protectNow(ctx.cardId);
      },
    },
  },
  navigator: {
    id: "navigator",
    name: "두더지 탐색 전문가",
    originalName: "Navigator",
    description: "내가 두더지를 접수하면 귀가 더미에서 무작위 3장이 아니라, 귀가 더미 전체를 확인하고 원하는 카드 한 장을 골라 진료 줄에 추가합니다.",
    affectedSuit: "mole",
    priority: 100,
    effects: {
      moleRevealAll: () => true,
    },
  },
  master_gunner: {
    id: "master_gunner",
    name: "대형견 훈련사",
    originalName: "Master Gunner",
    description: "내가 강아지를 접수하면 상대 병원의 맨 위 카드 한 장만 보내는 대신, 선택한 종류의 가족 카드 더미 전체를 귀가시킵니다.",
    affectedSuit: "dog",
    priority: 100,
    effects: {
      dogRemoveEntireStack: () => true,
    },
  },
  misfire: {
    id: "misfire",
    name: "강아지 공포증",
    originalName: "Misfire",
    description: "다른 플레이어는 강아지 능력으로 나를 공격할 수 없습니다. 나를 대상으로 선택했다면, 공격한 플레이어가 자기 병원에서 가족 카드 한 장을 골라 귀가시켜야 합니다.",
    affectedSuit: "dog",
    priority: 200,
  },
  mystic: {
    id: "mystic",
    name: "부엉이 영상 판독가",
    originalName: "Mystic",
    description: "내가 부엉이를 접수하면 다음 카드 3장을 순서대로 확인합니다(순서는 바꿀 수 없음). 그 후 첫 번째 카드를 추가하거나, 그대로 되돌리고 진료를 마칩니다.",
    affectedSuit: "owl",
    priority: 100,
    effects: {
      owlMysticMode: () => true,
    },
  },
  parry: {
    id: "parry",
    name: "고양이 알레르기",
    originalName: "Parry",
    description: "다른 플레이어가 고양이를 접수하면 반드시 내 병원에서 토끼 가족 카드를 데려가야 합니다. 내 병원에 토끼가 없다면 그 고양이 카드는 귀가 더미로 갑니다.",
    affectedSuit: "cat",
    priority: 200,
    effects: {
      onCardEntered(state, ctx) {
        if (ctx.isSelf || ctx.card.suit !== "cat") return;
        const rabbitStack = ctx.holder.hospitalStacks.rabbit;
        if (rabbitStack.length > 0) {
          ctx.transferRabbitFrom(ctx.holder);
        } else {
          ctx.ejectToDiscard(ctx.cardId);
        }
      },
    },
  },
  plunderer: {
    id: "plunderer",
    name: "간식 가로채기",
    originalName: "Plunderer",
    description: "누군가(나 자신 포함) 햄스터와 아몬드 조합을 완성하면, 귀가 더미에서 추가 카드를 얻는 대신 다른 플레이어 한 명의 병원에서 카드를 가져옵니다. 가져오는 장수는 그 차례에 확보한 카드 수와 같고, 카드가 부족하면 부족한 만큼은 얻지 못합니다.",
    affectedSuit: "hamster",
    priority: 400,
    isGlobal: true,
  },
  safe_harbor: {
    id: "safe_harbor",
    name: "확장형 거북이 보호대",
    originalName: "Safe Harbor",
    description: "누군가 거북이를 접수하면, 거북이 카드와 그 다음에 추가되는 카드 2장까지 대소동으로부터 보호됩니다. 단, 중복을 일으킨 마지막 카드는 보호 대상이라도 획득하지 못합니다.",
    affectedSuit: "turtle",
    priority: 200,
    isGlobal: true,
    effects: {
      onCardEntered(state, ctx) {
        if (ctx.card.suit === "turtle") {
          ctx.protectNow(ctx.cardId);
          state.turnFlags.safeHarborRemaining = 2;
        }
      },
    },
  },
  scavenger: {
    id: "scavenger",
    name: "강아지 구조대원",
    originalName: "Scavenger",
    description: "내가 강아지 능력으로 상대 가족 카드를 내보낼 때, 그 카드를 귀가 더미로 보내지 않고 내 병원에 입원시킵니다.",
    affectedSuit: "dog",
    priority: 400,
    effects: {
      dogDestination: () => "owner_hospital",
    },
  },
  swordsman: {
    id: "swordsman",
    name: "고양이 친화 수의사",
    originalName: "Swordsman",
    description: "내가 고양이를 접수하면, 내 병원에 이미 같은 종류가 있어도 상대 병원에서 그 종류를 데려올 수 있습니다. 단, 현재 진료 줄에 같은 종류가 있으면 여전히 대소동이 발생합니다.",
    affectedSuit: "cat",
    priority: 100,
    effects: {
      catUnlimited: () => true,
    },
  },
  treasure_hunter: {
    id: "treasure_hunter",
    name: "햄스터 간식 전문가",
    originalName: "Treasure Hunter",
    description: "내가 햄스터와 아몬드 조합을 완성하면 귀가 더미에서 현재 카드 수의 1배가 아니라 3배만큼 추가 카드를 가져옵니다.",
    affectedSuit: "hamster",
    priority: 400,
    effects: {
      hamsterAlmondBonus: (state, ctx) => ctx.defaultCount * 3,
    },
  },
};

export function getTrait(traitId) {
  if (!traitId) return null;
  return TRAITS[traitId] || null;
}

export function traitEffect(player, key) {
  const trait = getTrait(player && player.traitId);
  if (!trait || !trait.effects || !trait.effects[key]) return null;
  return trait.effects[key];
}

export function allTraitIds() {
  return Object.keys(TRAITS);
}

// 특정 특기를 가진 플레이어를 찾는다 (한 게임에서 특기는 중복 선택되지 않으므로 최대 1명).
// excludePlayerId를 주면 "다른 플레이어가 ~하면" 류의 조건에서 본인은 제외하고 찾는다.
export function findPlayerWithTrait(state, traitId, excludePlayerId) {
  return state.players.find((p) => p.traitId === traitId && p.playerId !== excludePlayerId);
}
