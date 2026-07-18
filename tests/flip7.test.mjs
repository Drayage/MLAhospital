// 번호표 뽑기(flip7) 엔진 테스트 — 실행: node --test tests/flip7.test.mjs
//
// 핵심 규칙: 한 턴에 카드는 딱 한 장만 뽑는다(라운드로빈) — HIT 한 번이 끝나면(버스트/
// 강제접수 제외) 곧장 다음 활성 플레이어에게 순서가 넘어간다. 같은 사람이 계속 뽑으려면
// 다른 사람들 차례가 다 지나고 자기 차례가 다시 와야 한다.
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

test("2. 평범한 번호표를 뽑으면(한 턴에 한 장) 곧장 다음 사람에게 순서가 넘어간다", () => {
  const state = freshState({ playerNames: ["A", "B"] });
  setDeck(state, ["num-3-0", "num-5-0"]);
  const aId = currentPlayer(state).playerId;
  applyAction(state, { type: "HIT" });
  assert.notEqual(currentPlayer(state).playerId, aId);
  assert.equal(state.players.find((p) => p.playerId === aId).roundCards.length, 1);
  // A는 자기 턴에서 STAY도 선택 가능했어야 한다(강제 상태가 아니므로) — 지금은 B 차례.
});

test("3. 같은 번호가 다시 나오면(세컨찬스 없이) 버스트하고 다음 사람에게 넘어간다", () => {
  const state = freshState({ playerNames: ["A", "B"] });
  setDeck(state, ["num-3-0", "num-9-0", "num-3-1"]);
  const aId = currentPlayer(state).playerId;
  applyAction(state, { type: "HIT" }); // A: num-3, turn -> B
  applyAction(state, { type: "HIT" }); // B: num-9, turn -> A
  assert.equal(currentPlayer(state).playerId, aId);
  applyAction(state, { type: "HIT" }); // A: num-3 중복 -> 버스트
  const a = state.players.find((p) => p.playerId === aId);
  assert.equal(a.roundStatus, "busted");
  assert.equal(a.roundCards.length, 0);
  assert.notEqual(currentPlayer(state).playerId, aId); // B에게 넘어간다
});

test("4. 재접수권이 있으면 중복을 한 번 무효로 하지만, 그래도 그 턴은 끝나 다음 사람에게 넘어간다", () => {
  const state = freshState({ playerNames: ["A", "B"] });
  setDeck(state, ["act-second-0", "num-3-0", "num-3-1", "num-9-0"]);
  applyAction(state, { type: "HIT" }); // A: 재접수권 획득, turn -> B
  const aId = state.players[0].playerId;
  applyAction(state, { type: "STAY" }); // B는 마감(비활성) -> 이후 계속 A 차례로 돌아온다
  applyAction(state, { type: "HIT" }); // A: num-3
  applyAction(state, { type: "HIT" }); // A: num-3 중복 -> 재접수권으로 무효화
  const a = state.players.find((p) => p.playerId === aId);
  assert.equal(a.secondChanceCardId, null); // 소모됨
  assert.equal(a.roundStatus, "active"); // 버스트 안 함
  assert.equal(a.roundCards.length, 1); // num-3 하나만(무효화된 중복분은 안 쌓임)
  applyAction(state, { type: "HIT" }); // A: num-9 정상 획득
  assert.equal(a.roundCards.length, 2);
});

test("5. 보너스 카드(+N/x2)는 버스트 판정 없이 쌓이고, 매번 다음 사람에게 넘어간다", () => {
  const state = freshState({ playerNames: ["A", "B"] });
  setDeck(state, ["mod-plus4", "mod-x2", "mod-plus4"]);
  const aId = currentPlayer(state).playerId;
  applyAction(state, { type: "HIT" }); // A: +4, turn -> B
  assert.notEqual(currentPlayer(state).playerId, aId);
  applyAction(state, { type: "STAY" }); // B 마감 -> 이후 A 차례로만 돌아온다
  applyAction(state, { type: "HIT" }); // A: x2
  applyAction(state, { type: "HIT" }); // A: +4 (같은 종류의 보너스가 또 나와도 무방)
  const a = state.players.find((p) => p.playerId === aId);
  assert.equal(a.roundCards.length, 3);
  assert.equal(a.roundStatus, "active");
});

test("6. 서로 다른 번호 7장을 모으면 즉시 라운드가 끝나고 +15 보너스를 받는다", () => {
  const state = freshState({ playerNames: ["A", "B"] });
  const nums = [1, 2, 3, 4, 5, 6, 7].map((n) => `num-${n}-0`);
  setDeck(state, nums);
  applyAction(state, { type: "HIT" }); // A: 1, turn -> B
  applyAction(state, { type: "STAY" }); // B 마감 -> 이후 A 차례로만 돌아온다
  for (let i = 0; i < 6; i++) applyAction(state, { type: "HIT" }); // A: 2..7
  assert.equal(state.phase, "round_over");
  const flipper = state.lastRoundSummary.entries.find((e) => e.flipped7);
  assert.ok(flipper);
  assert.equal(flipper.roundScore, 1 + 2 + 3 + 4 + 5 + 6 + 7 + 15);
});

test("7. 조기 마감권을 나에게 쓰면 내 턴이 즉시 끝나고 다음 사람으로 넘어간다", () => {
  const state = freshState();
  setDeck(state, ["num-5-0", "act-freeze-0"]);
  applyAction(state, { type: "HIT" }); // 첫 번째 플레이어: num-5, turn 넘어감
  const actor = currentPlayer(state); // 지금 차례인 두 번째 플레이어
  applyAction(state, { type: "HIT" }); // freeze 획득 -> 대상 선택
  assert.equal(state.pendingDecision.type, "choose_freeze_target");
  applyAction(state, { type: "DECIDE", value: actor.playerId }); // 자기 자신 지정
  assert.equal(state.players.find((p) => p.playerId === actor.playerId).roundStatus, "frozen");
  assert.notEqual(currentPlayer(state).playerId, actor.playerId);
});

test("8. 조기 마감권을 남에게 써도 이번 턴(카드 한 장)은 끝나 다음 사람에게 넘어간다", () => {
  const state = freshState({ playerNames: ["A", "B", "C"] });
  setDeck(state, ["act-freeze-0"]);
  const aId = currentPlayer(state).playerId;
  applyAction(state, { type: "HIT" }); // freeze 획득 -> 대상 선택(3명이라 자동 아님)
  const otherId = state.pendingDecision.options.find((pid) => pid !== aId);
  applyAction(state, { type: "DECIDE", value: otherId });
  assert.equal(state.players.find((p) => p.playerId === otherId).roundStatus, "frozen");
  // 예전 구현은 "남을 얼리면 내 턴이 계속된다"였는데, 실제 룰은 카드 한 장을 뽑아 처리하면
  // 무조건 다음 사람으로 넘어간다(응급 호출로 강제된 경우만 예외) — 그래야 응급 호출이
  // "정상적으로는 불가능한 3연속"이라는 의미를 갖는다.
  assert.notEqual(currentPlayer(state).playerId, aId);
});

test("9. 응급 호출로 순서를 건너뛰어도, 강제 3번이 끝나면 원래 순서(A 다음 B)로 정상 복귀한다", () => {
  const state = freshState({ playerNames: ["A", "B", "C"] });
  setDeck(state, ["act-flip3-0", "num-1-0", "num-2-0", "num-3-0"]);
  const [aId, bId, cId] = state.players.map((p) => p.playerId);
  applyAction(state, { type: "HIT" }); // A: 응급 호출 획득 -> 대상 선택
  applyAction(state, { type: "DECIDE", value: cId }); // 순서상 다음인 B를 건너뛰고 C를 지정
  assert.equal(currentPlayer(state).playerId, cId);
  assert.equal(currentPlayer(state).forcedHitsLeft, 3);
  assert.deepEqual(getLegalActions(state), [{ type: "HIT" }]); // 강제 구간엔 STAY 불가
  applyAction(state, { type: "HIT" }); // C: num-1
  assert.equal(currentPlayer(state).forcedHitsLeft, 2);
  applyAction(state, { type: "HIT" }); // C: num-2
  applyAction(state, { type: "HIT" }); // C: num-3 -> 강제 3번 완료
  // 강제가 끝났다고 C에게 보너스 턴이 생기는 게 아니라, 원래 순서(A 다음 B)로 돌아간다.
  assert.equal(currentPlayer(state).playerId, bId);
});

test("10. 응급 호출 강제 접수 중 버스트해도 원래 순서(A 다음 B)로 정상 복귀한다", () => {
  const state = freshState({ playerNames: ["A", "B", "C"] });
  setDeck(state, ["act-flip3-0", "num-1-0", "num-1-1"]); // 강제 접수 2번째에 중복 -> 버스트
  const [aId, bId, cId] = state.players.map((p) => p.playerId);
  applyAction(state, { type: "HIT" }); // A: 응급 호출 획득
  applyAction(state, { type: "DECIDE", value: cId }); // C 지정(B를 건너뜀)
  applyAction(state, { type: "HIT" }); // C: num-1
  applyAction(state, { type: "HIT" }); // C: num-1 중복 -> 버스트, 강제 시퀀스 중단
  assert.equal(state.players.find((p) => p.playerId === cId).roundStatus, "busted");
  assert.equal(currentPlayer(state).playerId, bId); // C도 A도 아니라 원래 순서상 다음인 B
});

test("11. 재접수권을 이미 갖고 있는데 또 뽑으면 다른 사람에게 넘기고, 그 턴도 끝난다", () => {
  const state = freshState({ playerNames: ["A", "B", "C"] });
  setDeck(state, ["act-second-0", "num-9-0", "num-8-0", "act-second-1"]);
  applyAction(state, { type: "HIT" }); // A: 첫 재접수권, turn -> B
  const aId = state.players[0].playerId;
  applyAction(state, { type: "HIT" }); // B: num-9, turn -> C
  applyAction(state, { type: "HIT" }); // C: num-8, turn -> A
  assert.equal(currentPlayer(state).playerId, aId);
  applyAction(state, { type: "HIT" }); // A: 또 재접수권 -> 아직 없는 다른 사람에게 넘겨야 함
  assert.equal(state.pendingDecision.type, "give_second_chance");
  const targetId = state.pendingDecision.options[0];
  applyAction(state, { type: "DECIDE", value: targetId });
  assert.equal(state.players.find((p) => p.playerId === targetId).secondChanceCardId, "act-second-1");
  assert.notEqual(currentPlayer(state).playerId, aId); // A의 턴도 끝나 다음 사람에게 넘어간다
});

test("12. 점수 계산: 숫자 합 x2 배수 적용 후 고정 보너스를 더한다", () => {
  const cards = ["num-3-0", "num-5-0", "mod-x2", "mod-plus4"];
  // (3+5)*2 + 4 = 20
  assert.equal(computeCardsScore(cards), 20);
});

test("13. 모두가 멈추면 라운드가 끝나고 다음 라운드로 넘어갈 수 있다", () => {
  const state = freshState({ playerNames: ["A", "B"] });
  applyAction(state, { type: "STAY" }); // A 마감
  applyAction(state, { type: "STAY" }); // B 마감 -> 전원 종료, 라운드 끝
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
  applyAction(state, { type: "HIT" }); // A: +12 = 202, turn -> B
  applyAction(state, { type: "STAY" }); // B 그대로, turn -> A(B는 비활성이라 A만 남음)
  applyAction(state, { type: "STAY" }); // A 마감 -> 라운드 종료, 202점 단독 최고
  assert.equal(state.phase, "game_over");
  assert.deepEqual(state.winnerIds, ["p0"]);
});

test("15. 아무도 목표점수에 못 미치면 재대결 트리거 없이 다음 라운드로 넘어간다", () => {
  const state = freshState({ playerNames: ["A", "B", "C"] });
  state.players[0].totalScore = 100;
  state.players[1].totalScore = 90;
  state.players[2].totalScore = 50;
  applyAction(state, { type: "STAY" });
  applyAction(state, { type: "STAY" });
  applyAction(state, { type: "STAY" });
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
  applyAction(state, { type: "HIT" }); // A: +5, turn -> B
  applyAction(state, { type: "HIT" }); // B: +10, turn -> C
  applyAction(state, { type: "STAY" }); // C 그대로, turn -> A
  applyAction(state, { type: "STAY" }); // A 마감: 195+5=200, turn -> B
  applyAction(state, { type: "STAY" }); // B 마감: 190+10=200 -> 전원 종료
  assert.equal(state.phase, "round_over");
  const contenders = state.players.filter((p) => p.inGame);
  assert.deepEqual(contenders.map((p) => p.playerId).sort(), ["p0", "p1"]);
  assert.equal(state.players.find((p) => p.playerId === "p2").inGame, false);
});

test("18. 강제 접수 중에 조기 마감권으로 자기 자신을 얼리면 강제 잔여분과 무관하게 즉시 끝난다", () => {
  const state = freshState({ playerNames: ["A", "B", "C"] });
  setDeck(state, ["act-flip3-0", "act-freeze-0"]);
  const [, bId, cId] = state.players.map((p) => p.playerId);
  applyAction(state, { type: "HIT" }); // A: 응급 호출 획득
  applyAction(state, { type: "DECIDE", value: cId }); // C를 지정(B를 건너뜀)
  assert.equal(currentPlayer(state).playerId, cId);
  assert.equal(currentPlayer(state).forcedHitsLeft, 3);
  applyAction(state, { type: "HIT" }); // C: 강제 접수 중 조기 마감권 획득 -> 대상 선택
  applyAction(state, { type: "DECIDE", value: cId }); // 자기 자신 지정
  const c = state.players.find((p) => p.playerId === cId);
  assert.equal(c.roundStatus, "frozen");
  // 얼어붙었으니 강제로 남은 2번이 있었어도 그 자리에서 완전히 끝나고, 원래 순서상
  // 다음인 B에게 넘어간다(이 부분이 예전엔 버그로 C에게 영원히 멈춰 있었다).
  assert.notEqual(currentPlayer(state).playerId, cId);
  assert.equal(currentPlayer(state).playerId, bId);
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
