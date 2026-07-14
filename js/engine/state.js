// 게임 상태 생성 — 명세 5장(게임 준비), 15장(상태 구조).
import { SUITS, valuesFor } from "../data/animals.js";
import { buildCardPool } from "../data/cards.js";
import { allTraitIds } from "../data/traits.js";
import { shuffle, randomInt } from "./rng.js";

export function createGame(options) {
  const {
    playerNames,
    aiFlags = [],
    useTraits = false,
    variantMode = "none", // "none" | "random" | "manual"
    deckMultiplier = 1,
    seed = Date.now() & 0xffffffff,
  } = options;

  if (!Array.isArray(playerNames) || playerNames.length < 2 || playerNames.length > 4) {
    throw new Error("플레이어는 2~4명이어야 합니다.");
  }

  const state = {
    gameId: "game-" + Math.floor(Math.random() * 1e9),
    phase: "setup",
    mode: { useTraits, variantMode, deckMultiplier },
    players: playerNames.map((name, i) => ({
      playerId: "p" + i,
      displayName: name,
      seatIndex: i,
      hospitalStacks: Object.fromEntries(SUITS.map((s) => [s, []])),
      traitId: null,
      score: 0,
      bonusScore: 0,
      isCurrentPlayer: false,
      isAI: !!aiFlags[i],
    })),
    currentPlayerIndex: 0,
    drawPile: [],
    discardPile: [],
    playArea: [],
    protectedCardIds: [],
    requiredExtraDraws: 0,
    activeVariantId: null,
    pendingDecision: null,
    effectQueue: [],
    turnFlags: { monkeyRecalledCardIds: [], owlDrawnCardIds: [] },
    traitOffers: null,
    actionLog: [],
    winnerIds: [],
    seed,
    rngCounter: 0,
  };

  setupDeck(state, deckMultiplier);

  if (useTraits) {
    startTraitSelection(state);
  } else if (variantMode !== "none") {
    state.phase = "variant_selection";
  } else {
    startGamePlay(state);
  }

  return state;
}

function setupDeck(state, deckMultiplier) {
  const pool = buildCardPool(deckMultiplier);
  const startDiscard = [];
  const rest = [];
  for (const suit of SUITS) {
    const values = valuesFor(suit);
    const minValue = Math.min(...values);
    for (const cardId of Object.keys(pool)) {
      const card = pool[cardId];
      if (card.suit !== suit) continue;
      if (card.value === minValue && !startDiscard.some((id) => pool[id].suit === suit)) {
        startDiscard.push(cardId);
      } else {
        rest.push(cardId);
      }
    }
  }
  state.discardPile = startDiscard;
  state.drawPile = shuffle(state, rest);
  logAction(state, { type: "setup_deck", discardCount: startDiscard.length, drawCount: state.drawPile.length });
}

function startTraitSelection(state) {
  state.phase = "trait_selection";
  const shuffled = shuffle(state, allTraitIds());
  state.traitOffers = {};
  let cursor = 0;
  for (const player of state.players) {
    state.traitOffers[player.playerId] = [shuffled[cursor], shuffled[cursor + 1]];
    cursor += 2;
  }
  state.pendingDecision = {
    type: "trait_select",
    playerId: state.players[0].playerId,
    options: state.traitOffers[state.players[0].playerId],
  };
}

export function startGamePlay(state) {
  state.phase = "turn_start";
  state.currentPlayerIndex = randomInt(state, state.players.length);
  syncCurrentPlayerFlags(state);
  logAction(state, { type: "start_player_chosen", playerId: state.players[state.currentPlayerIndex].playerId });
}

export function syncCurrentPlayerFlags(state) {
  for (const p of state.players) p.isCurrentPlayer = p.seatIndex === state.currentPlayerIndex;
}

export function currentPlayer(state) {
  return state.players[state.currentPlayerIndex];
}

export function getPlayer(state, playerId) {
  const p = state.players.find((pl) => pl.playerId === playerId);
  if (!p) throw new Error("알 수 없는 플레이어: " + playerId);
  return p;
}

export function logAction(state, entry) {
  state.actionLog.push({ ...entry, t: state.actionLog.length });
}
