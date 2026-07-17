// 번호표 뽑기(flip7) headless 시뮬레이터 — 랜덤 정책으로 여러 판을 돌려 교착/무한루프를 감지한다.
// 사용법: node scripts/simulate-flip7.mjs [판수]
import { createFlip7Game } from "../js/flip7/state.js";
import { getLegalActions, applyAction } from "../js/flip7/actions.js";

const GAMES = Number(process.argv[2]) || 200;
const MAX_STEPS = 20000;

function randomPolicy(state, legal, stepRng) {
  // HIT/STAY 중엔 살짝 STAY 쪽으로 치우쳐서(항상 풀뽑기만 하면 라운드가 비정상적으로
  // 길어질 수 있어) 현실적인 판 길이를 흉내낸다.
  const stay = legal.find((a) => a.type === "STAY");
  if (stay && stepRng() < 0.35) return stay;
  return legal[Math.floor(stepRng() * legal.length)];
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let deadlocks = 0;
let totalSteps = 0;
let maxRoundsSeen = 0;
const winCounts = {};

for (let g = 0; g < GAMES; g++) {
  const rng = mulberry32(g * 7919 + 13);
  const playerCount = 2 + Math.floor(rng() * 5); // 2~6
  const playerNames = Array.from({ length: playerCount }, (_, i) => `P${i}`);
  const state = createFlip7Game({ playerNames, seed: g * 1000 + 1 });

  let steps = 0;
  let stuck = false;
  while (state.phase !== "game_over") {
    steps++;
    totalSteps++;
    if (steps > MAX_STEPS) {
      stuck = true;
      break;
    }
    const legal = getLegalActions(state);
    if (legal.length === 0) {
      stuck = true;
      break;
    }
    const action = randomPolicy(state, legal, rng);
    try {
      applyAction(state, action);
    } catch (err) {
      console.error(`게임 ${g} 스텝 ${steps}에서 에러:`, err.message);
      stuck = true;
      break;
    }
  }
  if (stuck) {
    deadlocks++;
    console.error(`게임 ${g}: 교착/무한루프 의심 (steps=${steps}, phase=${state.phase})`);
  } else {
    maxRoundsSeen = Math.max(maxRoundsSeen, state.round);
    const key = state.winnerIds.length;
    winCounts[key] = (winCounts[key] || 0) + 1;
  }
}

console.log("── 번호표 뽑기 시뮬 결과 ──");
console.log(`판수: ${GAMES}, 교착: ${deadlocks}, 평균 스텝: ${(totalSteps / GAMES).toFixed(1)}, 최장 라운드수: ${maxRoundsSeen}`);
console.log("승자 수 분포(1=단독승, 2+=동점 다수승):", winCounts);
process.exit(deadlocks > 0 ? 1 : 0);
