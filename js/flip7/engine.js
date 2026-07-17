// 번호표 뽑기 규칙 엔진 — 원작 Flip Seven 룰 그대로.
//
// 턴 구조가 우리집 동물병원과 완전히 달라(한 라운드 안에서 전원이 순서대로 "더 뽑기/멈추기"를
// 고르고, 멈추거나 터지거나 얼면 그 사람은 이번 라운드에서 빠진다) 별도 엔진으로 뒀다.
//
// currentPlayerIndex는 항상 "지금 결정을 내리는 사람"을 가리킨다. 응급 호출(flip_three)로
// 남에게 순서를 강제로 넘기면 원래 사람의 인덱스를 resumeStack에 쌓아두고, 그 사람이 강제
// 접수를 끝내거나 멈추거나 터지면 resumeOrAdvance가 스택을 되짚어 돌아온다 — 재귀 대신
// 스택을 쓰는 이유는 응급 호출이 응급 호출을 부르는 중첩 상황(뽑은 카드가 또 응급 호출)도
// 자연스럽게 처리하기 위해서다.
import { getCard, computeCardsScore, FLIP_TARGET, FLIP7_BONUS } from "./cards.js";
import { getPlayer, currentPlayer, isActive, activePlayers, logAction } from "./state.js";
import { shuffle } from "../engine/rng.js";

function drawCard(state) {
  if (state.deck.length === 0) {
    if (state.discard.length === 0) return null; // 이론상 94장을 다 들고 있는 극단적 경우의 방어
    state.deck = shuffle(state, state.discard);
    state.discard = [];
    logAction(state, { type: "reshuffle" });
  }
  return state.deck.pop();
}

export function doHit(state) {
  const player = currentPlayer(state);
  if (player.forcedHitsLeft > 0) player.forcedHitsLeft -= 1; // 응급 호출로 강제된 접수 하나 소모
  const cardId = drawCard(state);
  if (!cardId) {
    doStay(state);
    return;
  }
  logAction(state, { type: "card_drawn", playerId: player.playerId, cardId });
  const card = getCard(cardId);
  if (card.kind === "number") resolveNumberCard(state, player, cardId, card);
  else if (card.kind === "modifier") resolveModifierCard(state, player, cardId);
  else resolveActionCard(state, player, cardId, card);
}

function resolveNumberCard(state, player, cardId, card) {
  const isDuplicate = player.roundCards.some((cid) => {
    const c = getCard(cid);
    return c.kind === "number" && c.value === card.value;
  });
  if (isDuplicate) {
    if (player.secondChanceCardId) {
      const scId = player.secondChanceCardId;
      player.secondChanceCardId = null;
      state.discard.push(cardId, scId);
      logAction(state, { type: "second_chance_used", playerId: player.playerId, cancelledCardId: cardId });
      return; // 강제 시퀀스 중이면 다음 HIT에서 forcedHitsLeft가 계속 줄어든다 — 턴은 그대로 유지
    }
    bustPlayer(state, player, cardId);
    return;
  }

  player.roundCards.push(cardId);
  logAction(state, { type: "number_gained", playerId: player.playerId, cardId });
  const uniqueNumbers = player.roundCards.filter((cid) => getCard(cid).kind === "number").length;
  if (uniqueNumbers >= FLIP_TARGET) {
    player.roundStatus = "flipped7";
    logAction(state, { type: "flip7", playerId: player.playerId });
    endRound(state);
  }
}

function resolveModifierCard(state, player, cardId) {
  player.roundCards.push(cardId);
  logAction(state, { type: "modifier_gained", playerId: player.playerId, cardId });
}

function bustPlayer(state, player, triggeringCardId) {
  state.discard.push(...player.roundCards, triggeringCardId);
  player.roundCards = [];
  player.roundStatus = "busted";
  logAction(state, { type: "bust", playerId: player.playerId, cardId: triggeringCardId });
  resumeOrAdvance(state);
}

function resolveActionCard(state, player, cardId, card) {
  if (card.actionType === "second_chance") {
    resolveSecondChanceDraw(state, player, cardId);
    return;
  }
  state.discard.push(cardId); // 특수권 자체는 즉시 귀가 더미로(누구의 roundCards에도 안 남는다)
  const targets = activePlayers(state).map((p) => p.playerId);
  if (targets.length === 1) {
    applyActionTarget(state, player, card.actionType, targets[0]);
    return;
  }
  state.pendingDecision = {
    type: card.actionType === "freeze" ? "choose_freeze_target" : "choose_flip_three_target",
    playerId: player.playerId,
    options: targets,
  };
}

function resolveSecondChanceDraw(state, player, cardId) {
  if (!player.secondChanceCardId) {
    player.secondChanceCardId = cardId;
    logAction(state, { type: "second_chance_gained", playerId: player.playerId, cardId });
    return;
  }
  const eligible = activePlayers(state).filter((p) => p.playerId !== player.playerId && !p.secondChanceCardId);
  if (eligible.length === 0) {
    state.discard.push(cardId);
    logAction(state, { type: "second_chance_discarded", playerId: player.playerId, cardId });
    return;
  }
  if (eligible.length === 1) {
    eligible[0].secondChanceCardId = cardId;
    logAction(state, { type: "second_chance_given", playerId: player.playerId, targetPlayerId: eligible[0].playerId, cardId });
    return;
  }
  state.pendingDecision = { type: "give_second_chance", playerId: player.playerId, options: eligible.map((p) => p.playerId), cardId };
}

export function doStay(state) {
  const player = currentPlayer(state);
  player.roundStatus = "stayed";
  logAction(state, { type: "stay", playerId: player.playerId });
  resumeOrAdvance(state);
}

export function doDecide(state, targetPlayerId) {
  const decision = state.pendingDecision;
  const actor = getPlayer(state, decision.playerId);
  state.pendingDecision = null;
  if (decision.type === "give_second_chance") {
    const target = getPlayer(state, targetPlayerId);
    target.secondChanceCardId = decision.cardId;
    logAction(state, { type: "second_chance_given", playerId: actor.playerId, targetPlayerId: target.playerId, cardId: decision.cardId });
    return;
  }
  const actionType = decision.type === "choose_freeze_target" ? "freeze" : "flip_three";
  applyActionTarget(state, actor, actionType, targetPlayerId);
}

function applyActionTarget(state, actor, actionType, targetPlayerId) {
  const target = getPlayer(state, targetPlayerId);
  if (actionType === "freeze") {
    target.roundStatus = "frozen";
    logAction(state, { type: "freeze", playerId: actor.playerId, targetPlayerId: target.playerId });
    // 자기 자신을 얼렸으면 지금 턴(혹은 강제 시퀀스)이 그 자리에서 끝난 것 — 아니면 actor의
    // 턴은 그대로 이어지므로(currentPlayerIndex를 안 건드림) 손댈 게 없다.
    if (target.playerId === actor.playerId) resumeOrAdvance(state);
    return;
  }
  // flip_three: 대상은 3연속 강제 접수(중간에 멈출 수 없음). 자기 자신을 지정하면 지금
  // 턴에 그대로 이어붙고, 남을 지정하면 순서를 그 사람에게 강제로 넘긴 뒤(원래 자리는
  // resumeStack에 저장) 그 사람이 멈추거나(3번을 다 채운 뒤엔 STAY도 다시 가능해진다)
  // 터지거나 스스로를 얼리면 자동으로 actor에게 돌아온다. "강제 3번이 끝난 뒤에도 원하면
  // 계속 뽑을 수 있는가"는 원작 룰 문서로 100% 확증하지 못해, 더 자연스러운 쪽(강제 구간이
  // 끝나면 정상적인 본인 선택권을 되찾는다)으로 구현했다 — 다르게 알고 있다면 이 부분만
  // 고치면 된다.
  target.forcedHitsLeft += 3;
  logAction(state, { type: "flip_three", playerId: actor.playerId, targetPlayerId: target.playerId });
  if (target.playerId !== actor.playerId) {
    state.resumeStack.push(state.currentPlayerIndex);
    state.currentPlayerIndex = state.players.findIndex((p) => p.playerId === target.playerId);
  }
}

function resumeOrAdvance(state) {
  if (state.phase !== "playing") return; // 플립7 등으로 이미 라운드가 끝났으면 아무것도 안 함
  while (state.resumeStack.length > 0) {
    const idx = state.resumeStack.pop();
    if (isActive(state.players[idx])) {
      state.currentPlayerIndex = idx;
      return;
    }
    // 기다리던 사람이 그 사이 얼려지거나 터졌으면 건너뛰고 계속 스택을 되짚는다.
  }
  advanceToNextActive(state);
}

function advanceToNextActive(state) {
  if (activePlayers(state).length === 0) {
    endRound(state);
    return;
  }
  let idx = state.currentPlayerIndex;
  for (let step = 0; step < state.players.length; step++) {
    idx = (idx + 1) % state.players.length;
    if (isActive(state.players[idx])) {
      state.currentPlayerIndex = idx;
      return;
    }
  }
}

function endRound(state) {
  const entries = [];
  for (const player of state.players) {
    if (!player.inGame) {
      entries.push({ playerId: player.playerId, roundScore: 0, skipped: true });
      continue;
    }
    const busted = player.roundStatus === "busted";
    const flipped7 = player.roundStatus === "flipped7";
    const roundScore = busted ? 0 : computeCardsScore(player.roundCards) + (flipped7 ? FLIP7_BONUS : 0);
    player.totalScore += roundScore;
    entries.push({ playerId: player.playerId, roundScore, cards: player.roundCards.slice(), busted, flipped7 });
    state.discard.push(...player.roundCards);
    if (player.secondChanceCardId) {
      state.discard.push(player.secondChanceCardId);
      player.secondChanceCardId = null;
    }
    player.roundCards = [];
  }
  state.lastRoundSummary = { round: state.round, entries };
  state.pendingDecision = null;
  state.resumeStack = [];
  logAction(state, { type: "round_end", round: state.round });

  const contenders = state.players.filter((p) => p.inGame);
  const maxScore = Math.max(...contenders.map((p) => p.totalScore));
  if (maxScore >= state.targetScore) {
    const leaders = contenders.filter((p) => p.totalScore === maxScore);
    if (leaders.length === 1) {
      finishFlip7Game(state, [leaders[0].playerId]);
      return;
    }
    // 200점 이상 동점 — 원작 규칙대로 그 사람들만 남겨 재대결 라운드를 이어간다.
    for (const p of state.players) {
      if (!leaders.some((l) => l.playerId === p.playerId)) p.inGame = false;
    }
    logAction(state, { type: "tiebreak_round", playerIds: leaders.map((p) => p.playerId) });
  }
  state.phase = "round_over";
}

function finishFlip7Game(state, winnerIds) {
  state.phase = "game_over";
  state.pendingDecision = null;
  state.winnerIds = winnerIds;
  logAction(state, { type: "game_over", winnerIds });
}

// "다음 라운드 시작" — round_over 화면에서 사용자가 계속하기를 누르면 호출된다.
export function continueToNextRound(state) {
  state.round += 1;
  for (const player of state.players) {
    player.roundStatus = player.inGame ? "active" : "out";
    player.roundCards = [];
    player.secondChanceCardId = null;
    player.forcedHitsLeft = 0;
  }
  state.resumeStack = [];
  state.pendingDecision = null;

  let idx = state.roundStarterIndex;
  for (let step = 0; step < state.players.length; step++) {
    idx = (idx + 1) % state.players.length;
    if (state.players[idx].inGame) break;
  }
  state.roundStarterIndex = idx;
  state.currentPlayerIndex = idx;

  const contenderCount = state.players.filter((p) => p.inGame).length;
  if (state.deck.length < contenderCount * 3) {
    state.deck = shuffle(state, [...state.deck, ...state.discard]);
    state.discard = [];
  }
  state.phase = "playing";
}

// 그만두기 — 진행 중인 라운드는 버리고 지금까지의 총점만으로 즉시 승자를 정한다.
export function quitFlip7Game(state) {
  const contenders = state.players.filter((p) => p.inGame);
  const maxScore = Math.max(...contenders.map((p) => p.totalScore));
  const winnerIds = contenders.filter((p) => p.totalScore === maxScore).map((p) => p.playerId);
  finishFlip7Game(state, winnerIds);
}
