// 엔진 자동 테스트 — 명세 22장 필수 테스트 케이스 기반.
// 실행: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";

import { createGame, currentPlayer } from "../js/engine/state.js";
import { getLegalActions, applyAction } from "../js/engine/actions.js";
import { endTurnAndAdvance } from "../js/engine/turn.js";
import { computeScore, finishGame } from "../js/engine/scoring.js";
import { totalHospitalCardCount } from "../js/engine/hospital.js";
import { CARD_POOL } from "../js/data/cards.js";
import { PEACOCK_VALUES } from "../js/data/animals.js";

function freshState(opts = {}) {
  return createGame({ playerNames: ["A", "B", "C"], useTraits: false, variantMode: "none", seed: 42, ...opts });
}

// drawPile.pop()이 맨 위 카드이므로, "먼저 뽑힐 카드가 배열 끝에 오도록" 뒤집어 넣는다.
function setDrawPile(state, topFirstCardIds) {
  state.drawPile = topFirstCardIds.slice().reverse();
}

function opponentOf(state, player) {
  return state.players.find((p) => p.playerId !== player.playerId);
}

test("1. 첫 공개 카드가 정상적으로 진료 줄에 들어간다", () => {
  const state = freshState();
  setDrawPile(state, ["cat-3"]);
  applyAction(state, { type: "DRAW" });
  assert.deepEqual(state.playArea, ["cat-3"]);
  assert.equal(state.phase, "waiting_for_choice");
});

test("2. 서로 다른 카드 3장을 확보한다", () => {
  const state = freshState();
  const player = currentPlayer(state);
  setDrawPile(state, ["cat-3", "dog-4", "peacock-6"]);
  applyAction(state, { type: "DRAW" });
  applyAction(state, { type: "DRAW" });
  applyAction(state, { type: "DRAW" });
  assert.equal(state.playArea.length, 3);
  applyAction(state, { type: "BANK" });
  assert.deepEqual(player.hospitalStacks.cat, ["cat-3"]);
  assert.deepEqual(player.hospitalStacks.dog, ["dog-4"]);
  assert.deepEqual(player.hospitalStacks.peacock, ["peacock-6"]);
});

test("3. 거북이->부엉이->강아지 뒤 부엉이 중복 시 마지막 카드 능력 없이 즉시 대소동", () => {
  const state = freshState();
  setDrawPile(state, ["turtle-4", "owl-2", "dog-3", "owl-5"]);
  applyAction(state, { type: "DRAW" }); // turtle-4
  applyAction(state, { type: "DRAW" }); // owl-2 -> 다음 카드(dog-3) 미리보기
  assert.equal(state.pendingDecision.type, "owl_choose");
  assert.deepEqual(state.pendingDecision.previewCardIds, ["dog-3"]);
  applyAction(state, { type: "DECIDE", value: { action: "take", cardId: "dog-3" } });
  assert.equal(state.pendingDecision, null);
  assert.deepEqual(state.playArea, ["turtle-4", "owl-2", "dog-3"]);

  applyAction(state, { type: "DRAW" }); // owl-5 -> 중복(owl) -> 대소동, 능력 미발동
  assert.equal(state.pendingDecision, null); // 두 번째 부엉이 능력이 열리지 않았어야 함
  assert.equal(state.playArea.length, 0);
  const bust = state.actionLog.filter((e) => e.type === "bust").pop();
  assert.ok(bust);
  assert.deepEqual(bust.lostCardIds.sort(), ["dog-3", "owl-2", "owl-5", "turtle-4"].sort());
});

test("4. 거북이 이전 카드만 보호된다", () => {
  const state = freshState();
  const player = currentPlayer(state);
  setDrawPile(state, ["cat-2", "owl-3", "turtle-4", "dog-5", "dog-6"]);
  applyAction(state, { type: "DRAW" }); // cat-2
  applyAction(state, { type: "DRAW" }); // owl-3 -> 다음 카드(turtle-4) 미리보기
  applyAction(state, { type: "DECIDE", value: { action: "take", cardId: "turtle-4" } }); // turtle-4 -> cat-2,owl-3 보호
  assert.deepEqual(state.protectedCardIds.sort(), ["cat-2", "owl-3"].sort());
  applyAction(state, { type: "DRAW" }); // dog-5
  applyAction(state, { type: "DRAW" }); // dog-6 중복 -> 대소동

  assert.deepEqual(player.hospitalStacks.cat, ["cat-2"]);
  assert.deepEqual(player.hospitalStacks.owl, ["owl-3"]);
  assert.equal(player.hospitalStacks.turtle.length, 0);
  assert.ok(state.discardPile.includes("turtle-4"));
  assert.ok(state.discardPile.includes("dog-5"));
  assert.ok(state.discardPile.includes("dog-6"));
});

test("5. 원숭이가 입원실 카드의 능력을 다시 발동한다", () => {
  const state = freshState();
  const player = currentPlayer(state);
  const opponent = opponentOf(state, player);
  player.hospitalStacks.dog.push("dog-5");
  opponent.hospitalStacks.cat.push("cat-4");
  setDrawPile(state, ["monkey-2"]);
  applyAction(state, { type: "DRAW" });
  assert.equal(player.hospitalStacks.dog.length, 0); // 원숭이가 데려감
  assert.ok(state.playArea.includes("dog-5"));
  assert.equal(opponent.hospitalStacks.cat.length, 0); // 강아지 능력 재발동으로 제거됨
  assert.ok(state.discardPile.includes("cat-4"));
});

test("6. 원숭이가 중복 카드를 추가하여 대소동을 일으킨다", () => {
  const state = freshState();
  const player = currentPlayer(state);
  player.hospitalStacks.dog.push("dog-6");
  setDrawPile(state, ["dog-3", "monkey-2"]);
  applyAction(state, { type: "DRAW" }); // dog-3
  applyAction(state, { type: "DRAW" }); // monkey-2 -> dog-6 재투입 -> dog 중복 -> 대소동
  assert.equal(state.playArea.length, 0);
  assert.equal(player.hospitalStacks.dog.length, 0);
  assert.deepEqual(state.discardPile.slice(-3).sort(), ["dog-3", "dog-6", "monkey-2"].sort());
});

test("7. 강아지가 상대 스택 맨 위(최댓값) 카드만 제거한다", () => {
  const state = freshState();
  const player = currentPlayer(state);
  const opponent = opponentOf(state, player);
  opponent.hospitalStacks.cat.push("cat-2", "cat-6");
  setDrawPile(state, ["dog-3"]);
  applyAction(state, { type: "DRAW" });
  assert.deepEqual(opponent.hospitalStacks.cat, ["cat-2"]);
  assert.ok(state.discardPile.includes("cat-6"));
});

test("8. 햄스터+아몬드 조합은 성공적으로 진료를 마칠 때만 발동한다", () => {
  const state = freshState();
  const player = currentPlayer(state);
  setDrawPile(state, ["hamster-3", "almond-4"]);
  applyAction(state, { type: "DRAW" });
  applyAction(state, { type: "DRAW" });
  applyAction(state, { type: "BANK" });
  assert.equal(totalHospitalCardCount(player), 4); // 확보 2장 + 보너스 2장
});

test("9. 대소동이면 햄스터+아몬드가 있어도 조합이 발동하지 않는다", () => {
  const state = freshState();
  const player = currentPlayer(state);
  setDrawPile(state, ["hamster-3", "almond-4", "hamster-5"]);
  applyAction(state, { type: "DRAW" });
  applyAction(state, { type: "DRAW" });
  applyAction(state, { type: "DRAW" }); // hamster 중복 -> 대소동
  assert.equal(totalHospitalCardCount(player), 0);
});

test("10/11. 두더지가 귀가 더미에서 고른 카드도 능력을 발동한다", () => {
  const state = freshState();
  state.discardPile = ["dog-2", "cat-2", "owl-2"];
  setDrawPile(state, ["mole-3", "cat-7"]);
  applyAction(state, { type: "DRAW" }); // mole-3 -> 귀가 더미 3장 공개
  assert.equal(state.pendingDecision.type, "mole_choose_card");
  assert.deepEqual(state.pendingDecision.options.slice().sort(), ["cat-2", "dog-2", "owl-2"].sort());

  applyAction(state, { type: "DECIDE", value: "owl-2" }); // owl-2 선택 -> 진료줄 진입 -> 능력 발동
  assert.deepEqual(state.discardPile.slice().sort(), ["cat-2", "dog-2"].sort()); // 나머지 반환
  assert.equal(state.pendingDecision.type, "owl_choose"); // 두더지로 들어온 owl의 능력이 실제로 발동
  assert.deepEqual(state.pendingDecision.previewCardIds, ["cat-7"]);
});

test("12. 부엉이가 다음 카드를 보고 진료를 마친다 (미리 본 카드는 덱에 남는다)", () => {
  const state = freshState();
  const player = currentPlayer(state);
  setDrawPile(state, ["owl-2", "cat-5"]);
  applyAction(state, { type: "DRAW" }); // owl-2 -> cat-5 미리보기
  assert.deepEqual(state.pendingDecision.previewCardIds, ["cat-5"]);
  applyAction(state, { type: "DECIDE", value: { action: "bank" } });
  assert.deepEqual(player.hospitalStacks.owl, ["owl-2"]);
  assert.deepEqual(state.drawPile, ["cat-5"]); // 미리 본 카드는 그대로 덱 위에 남음
});

test("13. 부엉이가 확인한 카드를 접수해 중복이 발생한다", () => {
  const state = freshState();
  setDrawPile(state, ["turtle-2", "owl-3", "owl-5"]);
  applyAction(state, { type: "DRAW" }); // turtle-2
  applyAction(state, { type: "DRAW" }); // owl-3 -> owl-5 미리보기
  applyAction(state, { type: "DECIDE", value: { action: "take", cardId: "owl-5" } }); // 중복 -> 대소동
  assert.equal(state.playArea.length, 0);
  assert.equal(state.pendingDecision, null);
});

test("14. 고양이는 내 입원실에 없는 종류만 가져올 수 있다", () => {
  const state = freshState();
  const player = currentPlayer(state);
  const opponent = opponentOf(state, player);
  // 훔쳐올 대상 종류(hamster, 능력 없음)는 진료 줄 카드(cat)와 달라야 진료 줄 자체 중복을 피하고,
  // 연쇄 능력이 없어야 다른 스택을 건드리지 않는다.
  player.hospitalStacks.turtle.push("turtle-2");
  opponent.hospitalStacks.turtle.push("turtle-5");
  opponent.hospitalStacks.hamster.push("hamster-4");
  setDrawPile(state, ["cat-2"]);
  applyAction(state, { type: "DRAW" });
  assert.ok(state.playArea.includes("hamster-4"));
  assert.deepEqual(opponent.hospitalStacks.turtle, ["turtle-5"]); // 거북이는 제한으로 인해 그대로
  assert.equal(opponent.hospitalStacks.hamster.length, 0);
});

test("15. 토끼가 정확히 2장의 추가 카드를 요구한다", () => {
  const state = freshState();
  setDrawPile(state, ["rabbit-2"]);
  applyAction(state, { type: "DRAW" });
  assert.equal(state.requiredExtraDraws, 2);
});

test("16. 능력으로 추가된 카드도 토끼 카운트에 포함된다", () => {
  const state = freshState();
  const player = currentPlayer(state);
  player.hospitalStacks.dog.push("dog-5");
  setDrawPile(state, ["rabbit-2", "monkey-3"]);
  applyAction(state, { type: "DRAW" }); // rabbit-2 -> requiredExtraDraws = 2
  assert.equal(state.requiredExtraDraws, 2);
  applyAction(state, { type: "DRAW" }); // monkey-3 (-1=1) -> dog-5 재투입 (-1=0)
  assert.equal(state.requiredExtraDraws, 0);
});

test("17. 공작 카드 숫자가 4~9로 생성된다", () => {
  const peacockValues = Object.values(CARD_POOL)
    .filter((c) => c.suit === "peacock")
    .map((c) => c.value)
    .sort((a, b) => a - b);
  assert.deepEqual(peacockValues, PEACOCK_VALUES.slice().sort((a, b) => a - b));
});

test("18. 덱 마지막 카드가 처리된 뒤 게임이 종료되고 다음 턴이 없다", () => {
  const state = freshState();
  const startIndex = state.currentPlayerIndex;
  setDrawPile(state, ["peacock-7"]);
  applyAction(state, { type: "DRAW" });
  assert.equal(state.drawPile.length, 0);
  applyAction(state, { type: "BANK" });
  assert.equal(state.phase, "game_over");
  assert.equal(state.currentPlayerIndex, startIndex); // 다음 플레이어에게 턴이 넘어가지 않음
  assert.ok(state.winnerIds.length >= 1);
});

test("19. 종류별 가장 높은 카드만 점수에 포함된다", () => {
  const state = freshState();
  const player = currentPlayer(state);
  player.hospitalStacks.cat.push("cat-2", "cat-4", "cat-7");
  assert.equal(computeScore(state, player), 7);
});

test("20. 동점이면 전체 보유 카드 수를 비교한다", () => {
  const state = freshState({ playerNames: ["A", "B"] });
  const [p1, p2] = state.players;
  p1.hospitalStacks.cat.push("cat-7");
  p2.hospitalStacks.cat.push("cat-7"); // 서로 다른 플레이어가 동일 카드ID를 갖는 상황은 실제로는 없지만 점수 비교 로직만 검증
  p2.hospitalStacks.dog.push("dog-2"); // p2가 카드 수는 더 많음
  finishGame(state);
  assert.deepEqual(state.winnerIds, [p2.playerId]);
});

test("21. 숫자 중복 변형: 종류가 아닌 숫자로 대소동을 판정한다", () => {
  const state = freshState({ variantMode: "manual" });
  applyAction(state, { type: "SELECT_VARIANT", variantId: "duplicate_by_number" });
  setDrawPile(state, ["cat-4", "dog-4"]); // 종류는 다르지만 숫자가 같음
  applyAction(state, { type: "DRAW" });
  applyAction(state, { type: "DRAW" });
  assert.equal(state.playArea.length, 0); // 대소동
});

test("21b. 숫자 중복 변형: 같은 종류라도 숫자가 다르면 대소동이 아니다", () => {
  const state = freshState({ variantMode: "manual" });
  applyAction(state, { type: "SELECT_VARIANT", variantId: "duplicate_by_number" });
  setDrawPile(state, ["cat-4", "cat-5"]);
  applyAction(state, { type: "DRAW" });
  applyAction(state, { type: "DRAW" });
  assert.equal(state.playArea.length, 2); // 대소동 아님
});

test("22. 전체 카드 득점 변형에서는 모든 숫자를 합산한다", () => {
  const state = freshState({ variantMode: "manual" });
  applyAction(state, { type: "SELECT_VARIANT", variantId: "score_all_cards" });
  const player = currentPlayer(state);
  player.hospitalStacks.cat.push("cat-2", "cat-4");
  assert.equal(computeScore(state, player), 6);
});

test("23. 50점 즉시 승리 변형이 정상 작동한다", () => {
  const state = freshState({ variantMode: "manual" });
  applyAction(state, { type: "SELECT_VARIANT", variantId: "sudden_death_50" });
  const player = currentPlayer(state);
  for (const suit of ["turtle", "monkey", "dog", "hamster", "almond", "mole", "owl", "cat"]) {
    player.hospitalStacks[suit].push(`${suit}-7`);
  }
  assert.ok(computeScore(state, player) >= 50);
  endTurnAndAdvance(state);
  assert.equal(state.phase, "game_over");
  assert.deepEqual(state.winnerIds, [player.playerId]);
});

test("24. 60점 미만 승리 변형이 정상 작동한다", () => {
  const state = freshState({ playerNames: ["A", "B", "C"], variantMode: "manual" });
  applyAction(state, { type: "SELECT_VARIANT", variantId: "stay_below_60" });
  const [p1, p2, p3] = state.players;
  p1.hospitalStacks.peacock.push("peacock-9");
  p1.hospitalStacks.cat.push("cat-7");
  p1.hospitalStacks.dog.push("dog-7");
  p1.hospitalStacks.turtle.push("turtle-7");
  p1.hospitalStacks.monkey.push("monkey-7");
  p1.hospitalStacks.hamster.push("hamster-7"); // 44... 필요시 더 추가
  p1.hospitalStacks.almond.push("almond-7");
  p1.hospitalStacks.mole.push("mole-7");
  p1.hospitalStacks.owl.push("owl-7"); // 합계 65 -> 60 이상, 탈락 대상
  p2.hospitalStacks.cat.push("cat-6"); // 6점, 60 미만
  finishGame(state);
  assert.ok(computeScore(state, p1) >= 60);
  assert.equal(state.winnerIds.includes(p1.playerId), false);
  assert.deepEqual(state.winnerIds, [p2.playerId]);
});

test("25. 수의사 특기(원숭이 조련사)로 원숭이가 카드 2장을 순서대로 데려온다", () => {
  const state = freshState();
  const player = currentPlayer(state);
  player.traitId = "captains_hook";
  player.hospitalStacks.dog.push("dog-5");
  player.hospitalStacks.cat.push("cat-4");
  setDrawPile(state, ["monkey-2"]);
  applyAction(state, { type: "DRAW" });
  assert.equal(state.pendingDecision.type, "monkey_choose_card");
  assert.equal(state.pendingDecision.remaining, 2); // 2장까지 선택 가능
  applyAction(state, { type: "DECIDE", value: "dog-5" });
  // 남은 후보(cat-4)가 하나뿐이므로 두 번째 선택은 자동으로 이어져 진행된다.
  assert.ok(state.playArea.includes("dog-5"));
  assert.ok(state.playArea.includes("cat-4"));
  assert.equal(player.hospitalStacks.dog.length, 0);
  assert.equal(player.hospitalStacks.cat.length, 0);
});

// ── 원작 특기 17종 재구현 검증 (실제 Dead Man's Draw 특성 카드 매핑) ──────────

test("26. 토끼 행동 전문가: 다른 플레이어가 토끼를 내면 4장, 본인에겐 적용 안됨", () => {
  const state = freshState();
  const player = currentPlayer(state);
  const opponent = opponentOf(state, player);
  opponent.traitId = "beastmaster";
  setDrawPile(state, ["rabbit-3"]);
  applyAction(state, { type: "DRAW" });
  assert.equal(state.requiredExtraDraws, 4);
});

test("26b. 토끼 행동 전문가 본인이 토끼를 내면 기본 2장 그대로", () => {
  const state = freshState();
  const player = currentPlayer(state);
  player.traitId = "beastmaster";
  setDrawPile(state, ["rabbit-3"]);
  applyAction(state, { type: "DRAW" });
  assert.equal(state.requiredExtraDraws, 2);
});

test("27. 공작 애호가: 공작을 접수하면 즉시 입원하고 진료 줄에서 빠진다", () => {
  const state = freshState();
  const player = currentPlayer(state);
  player.traitId = "casanova";
  setDrawPile(state, ["peacock-6"]);
  applyAction(state, { type: "DRAW" });
  assert.equal(state.playArea.length, 0);
  assert.deepEqual(player.hospitalStacks.peacock, ["peacock-6"]);
});

test("28. 확장형 거북이 보호대: 거북이+다음 2장 보호, 대소동 유발 카드는 예외", () => {
  const state = freshState({ playerNames: ["A", "B", "C"] });
  const current = currentPlayer(state);
  const holder = state.players.find((p) => p.playerId !== current.playerId); // 제3자가 보유해도 전역 적용
  holder.traitId = "safe_harbor";
  setDrawPile(state, ["turtle-3", "dog-4", "cat-4", "dog-5"]);
  applyAction(state, { type: "DRAW" }); // turtle-3
  applyAction(state, { type: "DRAW" }); // dog-4 (보호 카운트다운 2→1)
  applyAction(state, { type: "DRAW" }); // cat-4 (카운트다운 1→0)
  applyAction(state, { type: "DRAW" }); // dog-5 중복 → 대소동
  assert.equal(state.playArea.length, 0);
  assert.deepEqual(current.hospitalStacks.turtle, ["turtle-3"]);
  assert.deepEqual(current.hospitalStacks.dog, ["dog-4"]);
  assert.deepEqual(current.hospitalStacks.cat, ["cat-4"]);
  assert.ok(state.discardPile.includes("dog-5")); // 유발 카드는 보호 대상이라도 획득 못함
});

test("29. 강아지 공포증: 상대를 공격하지 못하고 공격자가 대신 카드를 잃는다", () => {
  const state = freshState({ playerNames: ["A", "B"] });
  const player = currentPlayer(state);
  const opponent = opponentOf(state, player);
  opponent.traitId = "misfire";
  opponent.hospitalStacks.cat.push("cat-4");
  player.hospitalStacks.hamster.push("hamster-3");
  setDrawPile(state, ["dog-3"]);
  applyAction(state, { type: "DRAW" });
  assert.deepEqual(opponent.hospitalStacks.cat, ["cat-4"]); // 상대 카드는 그대로
  assert.equal(player.hospitalStacks.hamster.length, 0); // 공격자 자신이 잃음
  assert.ok(state.discardPile.includes("hamster-3"));
});

test("30. 부엉이 영상 판독가: 3장을 순서대로 보여주지만 첫 장만 접수 가능", () => {
  const state = freshState();
  const player = currentPlayer(state);
  player.traitId = "mystic";
  setDrawPile(state, ["owl-3", "cat-5", "dog-4", "turtle-3"]);
  applyAction(state, { type: "DRAW" });
  assert.deepEqual(state.pendingDecision.previewCardIds, ["cat-5", "dog-4", "turtle-3"]);
  const legal = getLegalActions(state);
  const takeable = legal.filter((a) => a.type === "DECIDE" && a.value.action === "take").map((a) => a.value.cardId);
  assert.deepEqual(takeable, ["cat-5"]);
  assert.throws(() => applyAction(state, { type: "DECIDE", value: { action: "take", cardId: "dog-4" } }));
});

test("31. 간식 가로채기: 조합 완성 시 귀가 더미 대신 지정한 상대 병원에서 가져온다", () => {
  const state = freshState({ playerNames: ["A", "B", "C"] });
  const current = currentPlayer(state);
  const targets = state.players.filter((p) => p.playerId !== current.playerId);
  targets[0].traitId = "plunderer"; // 제3자가 보유해도 전역 적용
  targets[1].hospitalStacks.cat.push("cat-2", "cat-5");
  targets[1].hospitalStacks.dog.push("dog-3");
  const discardBefore = state.discardPile.length;
  setDrawPile(state, ["hamster-3", "almond-4"]);
  applyAction(state, { type: "DRAW" });
  applyAction(state, { type: "DRAW" });
  applyAction(state, { type: "BANK" });
  assert.equal(state.pendingDecision.type, "plunder_choose_target");
  assert.deepEqual(
    state.pendingDecision.options.slice().sort(),
    [targets[0].playerId, targets[1].playerId].sort()
  );
  applyAction(state, { type: "DECIDE", value: targets[1].playerId });
  assert.equal(state.discardPile.length, discardBefore); // 귀가 더미에서는 안 가져옴
  assert.equal(totalHospitalCardCount(targets[1]), 1); // 3장 중 2장(보너스 수)을 털림
  assert.equal(totalHospitalCardCount(current), 4); // 은행한 2장 + 약탈한 2장
});

test("32. 옆 병원 당직자: 특기 선택 시 대상 지정 단계가 추가된다", () => {
  const state = freshState({ useTraits: true });
  const firstPlayerId = state.pendingDecision.playerId;
  state.traitOffers[firstPlayerId] = ["harbor_watch", "swordsman"];
  state.pendingDecision.options = ["harbor_watch", "swordsman"];
  applyAction(state, { type: "SELECT_TRAIT", traitId: "harbor_watch" });
  assert.equal(state.pendingDecision.type, "harbor_watch_target");
  assert.ok(!state.pendingDecision.options.includes(firstPlayerId)); // 자기 자신은 대상에서 제외
  const targetId = state.pendingDecision.options[0];
  applyAction(state, { type: "SELECT_HARBOR_TARGET", targetPlayerId: targetId });
  const holder = state.players.find((p) => p.playerId === firstPlayerId);
  assert.equal(holder.traitId, "harbor_watch");
  assert.equal(holder.harborWatchTargetId, targetId);
});

test("33. 옆 병원 당직자: 지정한 대상이 대소동을 내면 그 카드들이 내 병원으로", () => {
  const state = freshState({ playerNames: ["A", "B", "C"] });
  const target = currentPlayer(state);
  const holder = state.players.find((p) => p.playerId !== target.playerId);
  holder.traitId = "harbor_watch";
  holder.harborWatchTargetId = target.playerId;
  setDrawPile(state, ["dog-4", "dog-5"]);
  applyAction(state, { type: "DRAW" });
  applyAction(state, { type: "DRAW" }); // 중복 → 대소동
  assert.deepEqual(holder.hospitalStacks.dog.slice().sort(), ["dog-4", "dog-5"].sort());
  assert.equal(state.discardPile.includes("dog-4"), false);
  assert.equal(state.discardPile.includes("dog-5"), false);
});

test("34. 공작 품평 전문가: 공작 카드 점수 +5", () => {
  const state = freshState();
  const player = currentPlayer(state);
  player.traitId = "golden_scales";
  player.hospitalStacks.peacock.push("peacock-6");
  assert.equal(computeScore(state, player), 11);
});
