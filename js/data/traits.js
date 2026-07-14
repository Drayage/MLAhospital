// 수의사 특기 (17종) — 명세 13장.
// 각 플레이어는 게임 시작 시 정확히 1개의 특기만 선택하므로(명세 5.3),
// 한 플레이어가 동시에 두 특기 효과를 가질 일은 없다.
//
// 확장 지점(effects)은 엔진(js/engine/*)이 정해진 시점에 명시적으로 조회한다.
// 사용하는 확장 지점 키:
//   protectSelf(state, ctx)         — 거북이 능력 직후: 거북이 자신을 보호에 포함할지
//   onBustProtect(state, ctx)       — 대소동 처리 직전: 귀가 예정 카드 중 일부를 보호로 옮김
//   onCardEntered(state, ctx)       — 카드가 진료 줄에 성공적으로 들어온 직후(능력 발동 전)
//   monkeyPickCount(state, ctx)     — 원숭이 능력의 선택 가능 장수 (기본 1)
//   dogRemoveCount(state, ctx)      — 강아지 능력의 제거 장수 (기본 1)
//   dogDestination(state, ctx)      — 강아지가 제거한 카드의 목적지 ("discard" | "owner_hospital")
//   hamsterAlmondBonus(state, ctx)  — 볼빵빵 햄스터 보너스 장수 계산 (기본값을 인자로 받음)
//   moleRevealCount(state, ctx)     — 두더지가 공개하는 귀가 더미 장수 (기본 3)
//   moleKeeperBonus(state, ctx)     — 두더지: 선택 안 한 카드 중 일부를 즉시 추가 획득
//   rabbitIncrement(state, ctx)     — 토끼로 증가하는 requiredExtraDraws (기본 2)
//   catUnlimited(state, ctx)        — 고양이: 내 입원실 보유 종류 제한 해제 여부
//   onSuitGained(state, ctx)        — 카드가 (뱅킹/보호로) 최종적으로 입원실에 들어올 때

export const TRAITS = {
  iron_shell: {
    id: "iron_shell",
    name: "무쇠 등껍질",
    originalName: "Anchor - Iron Shell",
    description: "거북이 능력이 발동하면 거북이 자신도 함께 보호됩니다.",
    affectedSuit: "turtle",
    priority: 200,
    effects: {
      protectSelf: () => true,
    },
  },
  guardian_bond: {
    id: "guardian_bond",
    name: "수호의 유대",
    originalName: "Anchor - Guardian Bond",
    description: "대소동이 나면, 귀가할 카드 중 가장 숫자가 높은 카드 1장을 대신 내 입원실로 보호합니다.",
    affectedSuit: "turtle",
    priority: 200,
    effects: {
      onBustProtect(state, ctx) {
        if (ctx.lostCardIds.length === 0) return;
        let best = ctx.lostCardIds[0];
        for (const cid of ctx.lostCardIds) {
          if (ctx.getCard(cid).value > ctx.getCard(best).value) best = cid;
        }
        ctx.moveToProtected(best);
      },
    },
  },

  captains_hook: {
    id: "captains_hook",
    name: "원장님의 갈고리손",
    originalName: "Hook - Captain's Hook",
    description: "원숭이 능력 발동 시 가능한 한 카드 2장을 순서대로 데려옵니다.",
    affectedSuit: "monkey",
    priority: 100,
    effects: {
      monkeyPickCount: () => 2,
    },
  },
  second_chance: {
    id: "second_chance",
    name: "두 번째 기회",
    originalName: "Hook - Second Chance",
    description: "원숭이로 데려온 카드 때문에 대소동이 나도, 그 원숭이 카드만은 귀가하지 않습니다.",
    affectedSuit: "monkey",
    priority: 200,
    effects: {
      onBustProtect(state, ctx) {
        for (const cid of ctx.turnFlags.monkeyRecalledCardIds || []) {
          if (ctx.lostCardIds.includes(cid)) ctx.moveToProtected(cid);
        }
      },
    },
  },

  double_barrel: {
    id: "double_barrel",
    name: "이단 발사",
    originalName: "Cannon - Double Barrel",
    description: "강아지 능력이 상대의 같은 스택에서 카드 2장을 제거합니다.",
    affectedSuit: "dog",
    priority: 100,
    effects: {
      dogRemoveCount: () => 2,
    },
  },
  sharp_shooter: {
    id: "sharp_shooter",
    name: "정조준",
    originalName: "Cannon - Sharpshooter",
    description: "강아지 능력으로 제거한 카드는 귀가 더미 대신 내 입원실로 들어옵니다.",
    affectedSuit: "dog",
    priority: 400,
    effects: {
      dogDestination: () => "owner_hospital",
    },
  },

  big_cheeks: {
    id: "big_cheeks",
    name: "볼빵빵",
    originalName: "Key - Big Cheeks",
    description: "햄스터+아몬드 조합 보너스로 확보 카드 수보다 2장 더 가져옵니다.",
    affectedSuit: "hamster",
    priority: 400,
    effects: {
      hamsterAlmondBonus: (state, ctx) => ctx.defaultCount + 2,
    },
  },

  extra_stash: {
    id: "extra_stash",
    name: "여분의 간식",
    originalName: "Chest - Extra Stash",
    description: "햄스터+아몬드 조합 보너스로 1장을 추가로 더 가져옵니다.",
    affectedSuit: "almond",
    priority: 400,
    effects: {
      hamsterAlmondBonus: (state, ctx) => ctx.defaultCount + 1,
    },
  },

  wide_tunnel: {
    id: "wide_tunnel",
    name: "넓은 굴착",
    originalName: "Map - Wide Tunnel",
    description: "두더지 능력이 귀가 더미에서 3장 대신 4장을 공개합니다.",
    affectedSuit: "mole",
    priority: 100,
    effects: {
      moleRevealCount: () => 4,
    },
  },
  keeper: {
    id: "keeper",
    name: "알뜰한 손길",
    originalName: "Map - Keeper",
    description: "두더지 능력으로 선택하지 않은 카드 중 1장을 즉시 추가로 입원실에 가져옵니다.",
    affectedSuit: "mole",
    priority: 400,
    effects: {
      moleKeeperBonus: (state, ctx) => (ctx.unchosenCardIds.length > 0 ? 1 : 0),
    },
  },

  second_sight: {
    id: "second_sight",
    name: "예지몽",
    originalName: "Oracle - Second Sight",
    description: "부엉이 능력이 대기실 덱 위에서 2장을 보여주고, 그중 접수할 1장을 고를 수 있습니다.",
    affectedSuit: "owl",
    priority: 100,
    effects: {
      owlPeekCount: () => 2,
    },
  },
  lucky_feather: {
    id: "lucky_feather",
    name: "행운의 깃털",
    originalName: "Oracle - Lucky Feather",
    description: "부엉이가 접수를 골랐다가 대소동이 나도, 부엉이 카드 자신만은 귀가하지 않습니다.",
    affectedSuit: "owl",
    priority: 200,
    effects: {
      onBustProtect(state, ctx) {
        for (const cid of ctx.turnFlags.owlDrawnCardIds || []) {
          if (ctx.lostCardIds.includes(cid)) ctx.moveToProtected(cid);
        }
      },
    },
  },

  unlimited_reach: {
    id: "unlimited_reach",
    name: "거침없는 손길",
    originalName: "Sword - Unlimited Reach",
    description: "내 입원실에 이미 있는 종류라도 고양이로 상대의 카드를 가져올 수 있습니다.",
    affectedSuit: "cat",
    priority: 100,
    effects: {
      catUnlimited: () => true,
    },
  },

  prized_specimen: {
    id: "prized_specimen",
    name: "귀한 표본",
    originalName: "Mermaid - Prized Specimen",
    description: "공작 카드를 확보할 때마다 최종 점수에 1점을 추가로 더합니다.",
    affectedSuit: "peacock",
    priority: 500,
    effects: {
      onSuitGained(state, ctx) {
        if (ctx.card.suit === "peacock") ctx.player.bonusScore = (ctx.player.bonusScore || 0) + 1;
      },
    },
  },
  showtime: {
    id: "showtime",
    name: "공작의 무대",
    originalName: "Mermaid - Showtime",
    description: "공작 카드가 진료 줄에 들어오면 그 즉시 보호됩니다 (대소동이 나도 안전).",
    affectedSuit: "peacock",
    priority: 200,
    effects: {
      onCardEntered(state, ctx) {
        if (ctx.card.suit === "peacock") ctx.protectNow(ctx.cardId);
      },
    },
  },

  gentle_touch: {
    id: "gentle_touch",
    name: "순한 토끼",
    originalName: "Kraken - Gentle Touch",
    description: "토끼로 늘어나는 추가 접수 요구가 2장 대신 1장입니다.",
    affectedSuit: "rabbit",
    priority: 100,
    effects: {
      rabbitIncrement: () => 1,
    },
  },
  wild_litter: {
    id: "wild_litter",
    name: "다산 토끼",
    originalName: "Kraken - Wild Litter",
    description: "토끼로 늘어나는 추가 접수 요구가 2장 대신 4장입니다.",
    affectedSuit: "rabbit",
    priority: 100,
    effects: {
      rabbitIncrement: () => 4,
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
