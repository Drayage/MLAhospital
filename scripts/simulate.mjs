// headless 시뮬레이터 — N판 자동 진행 + 교착 감지 워치독.
// AI/밸런스/턴 흐름을 수정할 때는 이 시뮬 통과를 기준으로 삼는다.
// (game-baserule 스타터 킷 패턴: uritichu 1000판 시뮬의 일반화)
//
// 사용법: node scripts/simulate.mjs [판수]
import { createGame } from "../js/engine/state.js";
import { stepGame, isGameOver, getResult } from "../js/engine.js";

const GAMES = Number(process.argv[2] || 500);
const MAX_STEPS = 5000; // 이 스텝을 넘으면 교착으로 판정

function seededRandom(seed) {
  // mulberry32 — 재현 가능한 판을 위해 seed 기반 RNG 사용 (Math.random 직접 사용 금지)
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLAYER_NAME_SETS = [
  ["복동", "나비"],
  ["복동", "나비", "초코"],
  ["복동", "나비", "초코", "몽이"],
];
const VARIANT_MODES = ["none", "random", "manual"];

function createSimGame(i) {
  const rng = seededRandom(i);
  const playerNames = PLAYER_NAME_SETS[Math.floor(rng() * PLAYER_NAME_SETS.length)];
  const useTraits = rng() < 0.5;
  const variantMode = VARIANT_MODES[Math.floor(rng() * VARIANT_MODES.length)];
  const seed = Math.floor(rng() * 0xffffffff);
  const game = createGame({ playerNames, useTraits, variantMode, seed });
  // 수동 변형/특기 선택 단계도 게임 자체 RNG(stepGame)로 무작위 진행시킨다.
  return game;
}

const stats = { games: 0, deadlocks: 0, totalTurns: 0, wins: {}, deadlockSeeds: [] };

for (let i = 0; i < GAMES; i++) {
  const game = createSimGame(i);
  let steps = 0;
  let dead = false;
  while (!isGameOver(game)) {
    stepGame(game);
    if (++steps > MAX_STEPS) {
      dead = true;
      break;
    }
  }
  stats.games++;
  if (dead) {
    stats.deadlocks++;
    stats.deadlockSeeds.push(i);
    if (stats.deadlockSeeds.length <= 3) {
      console.error(
        `⚠ 교착 감지 seed=${i} — 같은 seed로 재현 가능. phase=${game.phase} pendingDecision=${JSON.stringify(game.pendingDecision)}`
      );
    }
  } else {
    const r = getResult(game);
    stats.totalTurns += r.turns || steps;
    stats.wins[r.winner] = (stats.wins[r.winner] || 0) + 1;
  }
}

console.log("── 우리집 동물병원 시뮬 결과 ──");
console.log(`판수: ${stats.games}, 교착: ${stats.deadlocks}${stats.deadlocks ? " ← 0이어야 함!" : ""}`);
console.log(`평균 스텝: ${(stats.totalTurns / Math.max(1, stats.games - stats.deadlocks)).toFixed(1)}`);
console.log("승률 상위 10:", Object.fromEntries(Object.entries(stats.wins).sort((a, b) => b[1] - a[1]).slice(0, 10)));
if (stats.deadlockSeeds.length) console.log("교착 seed 목록:", stats.deadlockSeeds.slice(0, 20));
process.exit(stats.deadlocks ? 1 : 0);
