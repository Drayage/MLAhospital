// 번호표 뽑기 상태 생성/조회 헬퍼. 우리집 동물병원 엔진과 완전히 분리된 별도 엔진이지만,
// 시드 RNG(js/engine/rng.js)는 상태에 seed/rngCounter만 요구하는 범용 유틸이라 그대로 재사용한다.
import { buildDeck } from "./cards.js";
import { shuffle } from "../engine/rng.js";

export function createFlip7Game(options) {
  const { playerNames, aiFlags = [], seed = Date.now() & 0xffffffff, targetScore = 200 } = options;
  if (!Array.isArray(playerNames) || playerNames.length < 2 || playerNames.length > 6) {
    throw new Error("플레이어는 2~6명이어야 합니다.");
  }

  const state = {
    gameId: "flip7-" + Math.floor(Math.random() * 1e9),
    mode: "flip7",
    phase: "playing", // "playing" | "round_over" | "game_over"
    targetScore,
    round: 1,
    roundStarterIndex: 0,
    currentPlayerIndex: 0,
    players: playerNames.map((name, i) => ({
      playerId: "p" + i,
      displayName: name,
      isAI: !!aiFlags[i],
      totalScore: 0,
      roundCards: [], // 이번 라운드에 접수한 번호표/보너스 카드
      secondChanceCardId: null,
      roundStatus: "active", // "active" | "stayed" | "busted" | "frozen" | "flipped7" | "out"
      forcedHitsLeft: 0, // 응급 호출로 강제된 남은 연속 접수 횟수
      inGame: true, // 200점 동점 재대결에서 탈락하면 false — 그 뒤로는 계속 구경만 함
    })),
    deck: [],
    discard: [],
    pendingDecision: null,
    resumeStack: [], // 응급 호출로 남에게 순서를 넘겼을 때, 돌아올 플레이어 인덱스를 쌓아둔다
    lastRoundSummary: null,
    actionLog: [],
    winnerIds: [],
    seed,
    rngCounter: 0,
  };

  state.deck = shuffle(state, buildDeck());
  return state;
}

export function getPlayer(state, playerId) {
  const player = state.players.find((p) => p.playerId === playerId);
  if (!player) throw new Error(`알 수 없는 플레이어: ${playerId}`);
  return player;
}

export function currentPlayer(state) {
  return state.players[state.currentPlayerIndex];
}

export function isActive(player) {
  return player.inGame && player.roundStatus === "active";
}

export function activePlayers(state) {
  return state.players.filter(isActive);
}

export function logAction(state, entry) {
  state.actionLog.push({ ...entry, seq: state.actionLog.length });
}
