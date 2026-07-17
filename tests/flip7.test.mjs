// 번호표 뽑기(flip7) 엔진 테스트 — 실행: node --test tests/flip7.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { createFlip7Game, currentPlayer } from "../js/flip7/state.js";
import { getLegalActions, applyAction } from "../js/flip7/actions.js";
import { quitFlip7Game } from "../js/flip7/engine.js";
import { buildDeck, getCard, computeCardsScore, NUMBER_VALUES } from "../js/flip7/cards.js";

function freshState(opts = {}) {
  return createFlip7Game({ playerNames: ["A", "B", "C"], seed: 42, ...opts });
}

// deck.pop()이 "다음에 뽑힐 카드"이므로, 먼저 뽑힐 카드가 배열 끝에 오도록 뒤집어 넣는다.
function setDeck(state, topFirstCardIds) {
  state.deck = topFirstCardIds.slice().reverse();
}

test("1. 덱은 정확히 94장이고 카드 구성이 원작과 같다", () => {
  const deck = buildDeck();
  assert.equal(deck.length, 94);
  const byKind = { number: 0, modifier: 0, action: 0 };
  for (const cid of deck) byKind[getCard(cid).kind]++;
  assert.equal(byKind.number, 79); // 0,1은 1장씩 + 2~12는 숫자만큼
  assert.equal(byKind.modifier, 6); // +2/+4/+6/+8/+10/x2
  assert.equal(byKind.action, 9); // freeze/flip_three/second_chance 3장씩
  for (const n of NUMBER_VALUES) {
    const count = deck.filter((cid) => getCard(cid).kind === "number" && getCard(cid).value === n).length;
    assert.equal(count, n <= 1 ? 1 : n, `숫자 ${n} 장수`);
  }
});

test("2. 번호표를 뽑으면 내 턴이 그대로 유지된다(연속 히트 가능)", () => {
  const state = freshState();
  setDeck(state, ["num-3-0", "num-5-0"]);
  const before = state.currentPlayerIndex;
  applyAction(state, { type: "HIT" });
  assert.equal(state.currentPlayerIndex, before);
  assert.deepEqual(getLegalActions(state).map((a) => a.type).sort(), ["HIT", "STAY"]);
  applyAction(state, { type: "HIT" });
  assert.equal(state.currentPlayerIndex, before);
  assert.equal(currentPlayer(state).roundCards.length, 2);
});

test("3. 같은 번호가 다시 나오면(세컨찬스 없이) 버스트하고 다음 사람에게 넘어간다", () => {
  const state = freshState();
  setDeck(state, ["num-3-0", "num-3-1"]);
  applyAction(state, { type: "HIT" });
  const busted = currentPlayer(state);
  applyAction(state, { type: "HIT" });
  assert.equal(state.players.find((p) => p.playerId === busted.playerId).roundStatus, "busted");
  assert.equal(state.players.find((p) => p.playerId === busted.playerId).roundCards.length, 0);
  assert.notEqual(state.currentPlayerIndex, state.players.findIndex((p) => p.playerId === busted.playerId));
});

test("4. 재접수권(second chance)이 있으면 중복을 한 번 무효로 하고 계속 진행한다", () => {
  const state = freshState();
  setDeck(state, ["act-second-0", "num-3-0", "num-3-1", "num-9-0"]);
  applyAction(state, { type: "HIT" }); // second chance 획득
  const actor = currentPlayer(state);
  assert.equal(actor.secondChanceCardId, "act-second-0");
  applyAction(state, { type: "HIT" }); // num-3
  applyAction(state, { type: "HIT" }); // num-3 중복 -> 세컨찬스로 무효화
  assert.equal(currentPlayer(state).playerId, actor.playerId); // 여전히 내 턴
  assert.equal(currentPlayer(state).secondChanceCardId, null); // 소모됨
  assert.equal(currentPlayer(state).roundStatus, "active"); // 버스트 안 함
  applyAction(state, { type: "HIT" }); // num-9 정상 획득
  assert.equal(currentPlayer(state).roundCards.length, 2); // num-3, num-9
});

test("5. 보너스 카드(+N/x2)는 버스트 판정 없이 그대로 쌓인다", () => {
  const state = freshState();
  setDeck(state, ["mod-plus4", "mod-x2", "mod-plus4"]);
  applyAction(state, { type: "HIT" });
  applyAction(state, { type: "HIT" });
  applyAction(state, { type: "HIT" }); // +4가 두 번 나와도 보너스 카드는 중복 검사 대상이 아님
  assert.equal(currentPlayer(state).roundCards.length, 3);
  assert.equal(currentPlayer(state).roundStatus, "active");
});

test("6. 서로 다른 번호 7장을 모으면 즉시 라운드가 끝나고 +15 보너스를 받는다", () => {
  const state = freshState({ playerNames: ["A", "B"] });
  const nums = [1, 2, 3, 4, 5, 6, 7].map((n) => `num-${n}-0`);
  setDeck(state, nums);
  for (let i = 0; i < 7; i++) applyAction(state, { type: "HIT" });
  assert.equal(state.phase, "round_over");
  const flipper = state.lastRoundSummary.entries.find((e) => e.flipped7);
  assert.ok(flipper);
  assert.equal(flipper.roundScore, 1 + 2 + 3 + 4 + 5 + 6 + 7 + 15);
});

test("7. 조기 마감권을 나에게 쓰면 내 턴이 즉시 끝나고 다음 사람으로 넘어간다", () => {
  const state = freshState();
  setDeck(state, ["num-5-0", "act-freeze-0"]);
  applyAction(state, { type: "HIT" });
  const actor = currentPlayer(state);
  applyAction(state, { type: "HIT" }); // freeze 획득 -> 대상 선택
  assert.equal(state.pendingDecision.type, "choose_freeze_target");
  applyAction(state, { type: "DECIDE", value: actor.playerId }); // 자기 자신 지정
  assert.equal(state.players.find((p) => p.playerId === actor.playerId).roundStatus, "frozen");
  assert.notEqual(currentPlayer(state).playerId, actor.playerId);
});

test("8. 조기 마감권을 남에게 쓰면 내 턴은 그대로 이어진다", () => {
  const state = freshState();
  setDeck(state, ["act-freeze-0", "num-5-0"]);
  const actor = currentPlayer(state);
  applyAction(state, { type: "HIT" }); // freeze 획득
  const otherId = state.players.find((p) => p.playerId !== actor.playerId).playerId;
  applyAction(state, { type: "DECIDE", value: otherId });
  assert.equal(state.players.find((p) => p.playerId === otherId).roundStatus, "frozen");
  assert.equal(currentPlayer(state).playerId, actor.playerId); // 여전히 내 턴
  applyAction(state, { type: "HIT" }); // 계속 뽑을 수 있어야 함
  assert.equal(currentPlayer(state).roundCards.length, 1);
});

test("9. 응급 호출을 남에게 쓰면 그 사람이 3번 강제로 뽑고, 그 뒤 원래 사람에게 돌아온다", () => {
  const state = freshState({ playerNames: ["A", "B"] });
  setDeck(state, ["act-flip3-0", "num-1-0", "num-2-0", "num-3-0", "num-9-0"]);
  const actor = currentPlayer(state);
  applyAction(state, { type: "HIT" }); // flip_three 획득 -> 대상 선택(2명뿐이라 자동일 수도 있음)
  const target = state.players.find((p) => p.playerId !== actor.playerId);
  if (state.pendingDecision) {
    applyAction(state, { type: "DECIDE", value: target.playerId });
  }
  assert.equal(currentPlayer(state).playerId, target.playerId);
  assert.equal(currentPlayer(state).forcedHitsLeft, 3);
  // 강제 구간 중엔 STAY가 불가능하다.
  assert.deepEqual(getLegalActions(state), [{ type: "HIT" }]);
  applyAction(state, { type: "HIT" }); // num-1
  assert.equal(currentPlayer(state).forcedHitsLeft, 2);
  applyAction(state, { type: "HIT" }); // num-2
  applyAction(state, { type: "HIT" }); // num-3 -> 강제 3번 완료
  assert.equal(currentPlayer(state).forcedHitsLeft, 0);
  assert.equal(currentPlayer(state).playerId, target.playerId); // 강제가 끝나도 아직은 그 사람 턴(선택권 보유)
  const legalAfter = getLegalActions(state).map((a) => a.type).sort();
  assert.deepEqual(legalAfter, ["HIT", "STAY"]);
  applyAction(state, { type: "STAY" }); // 이제 멈추면 actor에게 되돌아간다
  assert.equal(currentPlayer(state).playerId, actor.playerId);
});

test("10. 응급 호출로 강제 접수 중 버스트하면 곧장 원래 사람에게 돌아온다", () => {
  const state = freshState({ playerNames: ["A", "B"] });
  setDeck(state, ["act-flip3-0", "num-1-0", "num-1-1"]); // 강제 접수 2번째에 중복 -> 버스트
  const actor = currentPlayer(state);
  applyAction(state, { type: "HIT" });
  const target = state.players.find((p) => p.playerId !== actor.playerId);
  if (state.pendingDecision) applyAction(state, { type: "DECIDE", value: target.playerId });
  applyAction(state, { type: "HIT" }); // num-1 획득
  applyAction(state, { type: "HIT" }); // num-1 중복 -> 버스트, 강제 시퀀스 중단
  assert.equal(state.players.find((p) => p.playerId === target.playerId).roundStatus, "busted");
  assert.equal(currentPlayer(state).playerId, actor.playerId); // 곧장 actor에게 복귀
});

test("11. 재접수권을 이미 갖고 있는데 또 뽑으면, 아직 없는 다른 사람에게 넘긴다", () => {
  const state = freshState({ playerNames: ["A", "B", "C"] });
  setDeck(state, ["act-second-0", "act-second-1"]);
  applyAction(state, { type: "HIT" }); // 첫 세컨찬스
  const actor = currentPlayer(state);
  applyAction(state, { type: "HIT" }); // 이미 있는데 또 뽑음 -> 다른 두 명 중 하나에게 넘겨야 함
  assert.equal(state.pendingDecision.type, "give_second_chance");
  const targetId = state.pendingDecision.options[0];
  applyAction(state, { type: "DECIDE", value: targetId });
  assert.equal(state.players.find((p) => p.playerId === targetId).secondChanceCardId, "act-second-1");
  assert.equal(currentPlayer(state).playerId, actor.playerId); // 내 턴은 안 끊긴다
});

test("12. 점수 계산: 숫자 합 x2 배수 적용 후 고정 보너스를 더한다", () => {
  const cards = ["num-3-0", "num-5-0", "mod-x2", "mod-plus4"];
  // (3+5)*2 + 4 = 20
  assert.equal(computeCardsScore(cards), 20);
});

test("13. 모두가 멈추거나 터지면 라운드가 끝나고 다음 라운드로 넘어갈 수 있다", () => {
  const state = freshState({ playerNames: ["A", "B"] });
  setDeck(state, ["num-3-0", "num-4-0"]);
  applyAction(state, { type: "HIT" });
  applyAction(state, { type: "STAY" });
  applyAction(state, { type: "HIT" });
  applyAction(state, { type: "STAY" });
  assert.equal(state.phase, "round_over");
  assert.equal(getLegalActions(state).length, 1);
  assert.equal(getLegalActions(state)[0].type, "CONTINUE");
  applyAction(state, { type: "CONTINUE" });
  assert.equal(state.phase, "playing");
  assert.equal(state.round, 2);
  assert.equal(state.players.every((p) => p.roundStatus === "active"), true);
});

test("14. 200점을 단독으로 넘기면 그 사람이 즉시 우승한다", () => {
  const state = freshState({ playerNames: ["A", "B"] });
  state.players[0].totalScore = 190;
  setDeck(state, ["num-12-0"]);
  applyAction(state, { type: "HIT" });
  applyAction(state, { type: "STAY" }); // A: 190 + 12 = 202
  applyAction(state, { type: "STAY" }); // B: 그대로
  assert.equal(state.phase, "game_over");
  assert.deepEqual(state.winnerIds, ["p0"]);
});

test("15. 아무도 목표점수에 못 미치면 재대결 트리거 없이 다음 라운드로 넘어간다", () => {
  const state = freshState({ playerNames: ["A", "B", "C"] });
  state.players[0].totalScore = 100;
  state.players[1].totalScore = 90;
  state.players[2].totalScore = 50;
  setDeck(state, ["num-5-0", "num-1-0"]);
  applyAction(state, { type: "HIT" }); // A: num-5
  applyAction(state, { type: "STAY" });
  applyAction(state, { type: "HIT" }); // B: num-1
  applyAction(state, { type: "STAY" });
  applyAction(state, { type: "STAY" }); // C
  applyAction(state, { type: "CONTINUE" });
  assert.equal(state.phase, "playing");
  assert.equal(state.players.every((p) => p.inGame), true);
});

test("15b. 정확히 동점으로 200을 넘기면 그 둘만 inGame으로 남는다", () => {
  const state = freshState({ playerNames: ["A", "B", "C"] });
  state.players[0].totalScore = 195;
  state.players[1].totalScore = 190;
  state.players[2].totalScore = 50;
  setDeck(state, ["num-5-0", "num-10-0"]);
  applyAction(state, { type: "HIT" }); // A: +5 = 200
  applyAction(state, { type: "STAY" });
  applyAction(state, { type: "HIT" }); // B: +10 = 200
  applyAction(state, { type: "STAY" });
  applyAction(state, { type: "STAY" }); // C: 그대로 50
  assert.equal(state.phase, "round_over");
  const contenders = state.players.filter((p) => p.inGame);
  assert.deepEqual(contenders.map((p) => p.playerId).sort(), ["p0", "p1"]);
  assert.equal(state.players.find((p) => p.playerId === "p2").inGame, false);
});

test("16. 시드가 같으면 덱 순서가 항상 같다(결정적 셔플)", () => {
  const a = freshState({ seed: 777 });
  const b = freshState({ seed: 777 });
  assert.deepEqual(a.deck, b.deck);
});

test("17. 그만두기는 현재 총점 최고자를 즉시 승자로 확정한다", () => {
  const state = freshState({ playerNames: ["A", "B"] });
  state.players[0].totalScore = 80;
  state.players[1].totalScore = 50;
  quitFlip7Game(state);
  assert.equal(state.phase, "game_over");
  assert.deepEqual(state.winnerIds, ["p0"]);
});
