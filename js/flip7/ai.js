// 번호표 뽑기 AI — getLegalActions가 만든 선택지 중에서만 고른다(규칙 로직 없음).
import { getCard, computeCardsScore, FLIP_TARGET } from "./cards.js";
import { getLegalActions } from "./actions.js";
import { currentPlayer, activePlayers } from "./state.js";
import { nextRandom } from "../engine/rng.js";

// 번호 n이 대기실 덱(state.deck, 아직 안 뽑힌 카드)에 몇 장 남아있는지 — 다른 플레이어의
// 접수대(모두에게 공개돼 있음)와 귀가 더미까지 세어서 "이미 나온 장수"를 빼는 카드 카운팅.
function remainingCopies(state, value) {
  const total = value <= 1 ? 1 : value;
  let seen = 0;
  for (const p of state.players) {
    for (const cid of p.roundCards) {
      const c = getCard(cid);
      if (c.kind === "number" && c.value === value) seen++;
    }
  }
  for (const cid of state.discard) {
    const c = getCard(cid);
    if (c.kind === "number" && c.value === value) seen++;
  }
  return Math.max(0, total - seen);
}

function bustProbability(state, player) {
  if (state.deck.length === 0) return 0;
  const heldValues = player.roundCards.filter((cid) => getCard(cid).kind === "number").map((cid) => getCard(cid).value);
  if (heldValues.length === 0) return 0;
  const dangerous = heldValues.reduce((sum, v) => sum + remainingCopies(state, v), 0);
  return Math.min(1, dangerous / state.deck.length);
}

function leaderScore(state) {
  return Math.max(...state.players.filter((p) => p.inGame).map((p) => p.totalScore));
}

function shouldHit(state, player) {
  if (player.forcedHitsLeft > 0) return true;
  const uniqueCount = player.roundCards.filter((cid) => getCard(cid).kind === "number").length;
  if (uniqueCount === 0) return true; // 아무것도 없으면 일단 한 장은 봐야 한다
  const risk = bustProbability(state, player);
  // 6장째(마지막 한 장만 더 모으면 번호표 7종 완성 보너스)면 훨씬 과감해진다.
  const closeToFlip7 = uniqueCount >= FLIP_TARGET - 1 ? 0.3 : 0;
  const currentValue = computeCardsScore(player.roundCards);
  const caution = Math.min(0.5, currentValue / 40);
  const behindBias = Math.max(0, (leaderScore(state) - player.totalScore) / 400);
  const continueChance = Math.max(0.05, Math.min(0.97, 0.72 - risk * 1.6 - caution + closeToFlip7 + behindBias));
  return nextRandom(state) < continueChance;
}

function chooseFreezeTarget(state, actor, options) {
  // 내 위험도가 이미 높거나 지금 멈추는 게 나은 상황이면 나 자신을 얼려 안전하게 마감한다.
  const myRisk = bustProbability(state, actor);
  if (actor.roundCards.length > 0 && (myRisk > 0.35 || !shouldHit(state, actor))) {
    return actor.playerId;
  }
  // 아니면 지금 라운드 점수가 가장 높은 상대를 얼려서 더 못 불리게 막는다.
  let best = options[0];
  let bestValue = -1;
  for (const pid of options) {
    const p = state.players.find((pl) => pl.playerId === pid);
    const value = computeCardsScore(p.roundCards);
    if (value > bestValue) {
      bestValue = value;
      best = pid;
    }
  }
  return best;
}

function chooseFlipThreeTarget(state, actor, options) {
  // 이미 숫자를 꽤 모아서(터질 위험이 큰) 상대에게 강제로 3연속 뽑게 하면 터뜨릴 확률이 높다.
  const others = options.filter((pid) => pid !== actor.playerId);
  let best = null;
  let bestRisk = -1;
  for (const pid of others) {
    const p = state.players.find((pl) => pl.playerId === pid);
    const risk = bustProbability(state, p);
    if (risk > bestRisk) {
      bestRisk = risk;
      best = pid;
    }
  }
  // 마땅히 위험한 상대가 없으면 나 자신에게 써서 번호표 7종을 빠르게 노린다.
  if (best && bestRisk > 0.3) return best;
  return actor.playerId;
}

function chooseSecondChanceRecipient(state, options) {
  // 지금 가장 위험한(버스트 확률이 높은) 사람에게 줘야 실제로 도움이 된다.
  let best = options[0];
  let bestRisk = -1;
  for (const pid of options) {
    const p = state.players.find((pl) => pl.playerId === pid);
    const risk = bustProbability(state, p);
    if (risk > bestRisk) {
      bestRisk = risk;
      best = pid;
    }
  }
  return best;
}

export function chooseFlip7AiAction(state) {
  const legal = getLegalActions(state);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0];

  if (state.pendingDecision) {
    const d = state.pendingDecision;
    const actor = state.players.find((p) => p.playerId === d.playerId);
    let target;
    if (d.type === "choose_freeze_target") target = chooseFreezeTarget(state, actor, d.options);
    else if (d.type === "choose_flip_three_target") target = chooseFlipThreeTarget(state, actor, d.options);
    else target = chooseSecondChanceRecipient(state, d.options);
    return { type: "DECIDE", value: target };
  }

  const player = currentPlayer(state);
  return shouldHit(state, player) ? { type: "HIT" } : { type: "STAY" };
}

// activePlayers는 render/ui 쪽에서도 쓰기 편하게 재노출.
export { activePlayers };
