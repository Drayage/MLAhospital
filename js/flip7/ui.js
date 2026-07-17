// 컨트롤러 — 번호표 뽑기 엔진과 화면을 잇는다. 규칙 로직은 절대 여기 두지 않는다.
import { createFlip7Game, currentPlayer } from "./state.js";
import { getLegalActions, applyAction } from "./actions.js";
import { quitFlip7Game } from "./engine.js";
import { chooseFlip7AiAction } from "./ai.js";
import { saveFlip7Game, loadFlip7Game, clearFlip7Game } from "./storage.js";
import { getCard, ACTION_DESCRIPTIONS } from "./cards.js";
import { playSfx, startBgm, stopBgm } from "../audio.js";
import { HOSPITAL } from "../palettes.js";
import { flip7SetupScreenHtml, flip7NameFieldsHtml, flip7BoardHtml, flip7RoundSummaryHtml, flip7GameOverHtml, flip7RevealHtml } from "./render.js";

let game = null;
let aiTimer = null;
let roundTimer = null;
let revealTimer = null;
let pendingReveal = null; // 카드 한 장이 열리는 순간을 "천천히 확인"하게 하는 리빌 단계

const AI_THINK_DELAY_MS = 1100;
const ROUND_SUMMARY_AUTO_MS = 4200;
const REVEAL_QUICK_MS = 700; // 평범한 번호표/보너스 카드 — 뒤집는 연출만 보여주고 바로 진행
const REVEAL_NOTABLE_MS = 2800; // 중복(버스트)/7종 완성/특수권 카드 — 내용을 읽을 시간을 준다

const gameArea = () => document.getElementById("game-area");

export function startApp() {
  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("change", onChange);

  // "게임 방법" 버튼은 index.html이 기본으로 동물병원 규칙 모달을 열게 연결해뒀다 —
  // 번호표 뽑기가 실제로 시작되면 이 버튼을 이 게임의 규칙 모달로 다시 연결한다.
  const rulesBtn = document.getElementById("rules-btn");
  if (rulesBtn) rulesBtn.onclick = () => document.getElementById("f7-rules-modal").showModal();

  const saved = loadFlip7Game();
  if (saved && saved.phase && saved.phase !== "game_over") {
    game = saved;
    startBgm(HOSPITAL, "main");
    render();
    return;
  }
  render();
}

function currentActor() {
  if (!game) return null;
  if (game.pendingDecision) return game.players.find((p) => p.playerId === game.pendingDecision.playerId);
  if (game.phase === "playing") return game.players[game.currentPlayerIndex];
  return null;
}

function render() {
  if (pendingReveal) {
    gameArea().innerHTML = flip7RevealHtml(pendingReveal);
    renderActionBar();
    return;
  }
  if (!game) {
    gameArea().innerHTML = flip7SetupScreenHtml();
    regenNameFields();
    renderActionBar();
    return;
  }
  if (game.phase === "round_over") {
    gameArea().innerHTML = flip7RoundSummaryHtml(game);
    renderActionBar();
    scheduleRoundAutoContinue();
    return;
  }
  if (game.phase === "game_over") {
    gameArea().innerHTML = flip7GameOverHtml(game);
    stopBgm();
    clearFlip7Game();
    renderActionBar();
    return;
  }
  gameArea().innerHTML = flip7BoardHtml(game);
  renderActionBar();
  scheduleAiIfNeeded();
}

function renderActionBar() {
  const primary = document.getElementById("action-bar-primary");
  const surrenderBtn = document.getElementById("surrender-btn");
  primary.innerHTML = "";
  surrenderBtn.hidden = true; // 번호표 뽑기는 화면 안의 "그만두기" 링크를 쓴다

  if (pendingReveal || !game || game.phase !== "playing") return;

  const actor = currentActor();
  if (actor && actor.isAI) {
    const pill = document.createElement("span");
    pill.className = "mla-pill mla-pill-soft";
    pill.textContent = `🤖 ${actor.displayName}님이 고민 중...`;
    primary.appendChild(pill);
    return;
  }
  if (game.pendingDecision) return; // 대상 선택은 본문의 버튼으로

  const legal = getLegalActions(game);
  const hitBtn = document.createElement("button");
  hitBtn.textContent = "번호표 뽑기";
  hitBtn.setAttribute("data-action", "f7-hit");
  hitBtn.disabled = !legal.some((a) => a.type === "HIT");

  const stayBtn = document.createElement("button");
  stayBtn.textContent = "여기서 마감";
  stayBtn.className = "mla-bank-btn";
  stayBtn.setAttribute("data-action", "f7-stay");
  stayBtn.disabled = !legal.some((a) => a.type === "STAY");

  primary.appendChild(hitBtn);
  primary.appendChild(stayBtn);
}

function regenNameFields() {
  const countSelect = document.getElementById("mla-f7-player-count");
  if (!countSelect) return;
  document.getElementById("mla-f7-name-fields").innerHTML = flip7NameFieldsHtml(Number(countSelect.value));
}

function onSubmit(e) {
  const form = e.target.closest("#mla-f7-setup-form");
  if (!form) return;
  e.preventDefault();
  const data = new FormData(form);
  const playerCount = Number(data.get("playerCount"));
  const playerNames = data.getAll("playerName").map((s) => s.trim() || "플레이어").slice(0, playerCount);
  const aiIndexes = new Set(data.getAll("playerIsAI").map(Number));
  const aiFlags = playerNames.map((_, i) => aiIndexes.has(i));
  startBgm(HOSPITAL, "main");
  game = createFlip7Game({ playerNames, aiFlags });
  persistAndRender();
}

function onClick(e) {
  const countSelect = e.target.closest("#mla-f7-player-count");
  if (countSelect) return; // change 이벤트에서 처리

  const actionBtn = e.target.closest("[data-action]");
  if (!actionBtn) return;
  const action = actionBtn.getAttribute("data-action");

  if (action === "f7-dismiss-reveal") {
    dismissReveal();
    return;
  }
  if (pendingReveal) return; // 리빌 중엔 다른 행동을 막는다(탭하면 f7-dismiss-reveal로 넘어감)

  if (action === "f7-hit") {
    commitAction({ type: "HIT" });
  } else if (action === "f7-stay") {
    commitAction({ type: "STAY" });
  } else if (action === "f7-decide") {
    commitAction({ type: "DECIDE", value: actionBtn.getAttribute("data-target-player-id") });
  } else if (action === "f7-continue") {
    clearTimeout(roundTimer);
    commitAction({ type: "CONTINUE" });
  } else if (action === "f7-quit") {
    if (window.confirm("지금까지 쌓은 총점으로 게임을 바로 끝낼까요?")) {
      clearTimeout(aiTimer);
      clearTimeout(roundTimer);
      clearTimeout(revealTimer);
      quitFlip7Game(game);
      playSfx(HOSPITAL, "win");
      persistAndRender();
    }
  } else if (action === "f7-new-game") {
    clearTimeout(aiTimer);
    clearTimeout(roundTimer);
    clearTimeout(revealTimer);
    game = null;
    clearFlip7Game();
    render();
  }
}

function onChange(e) {
  if (e.target && e.target.id === "mla-f7-player-count") regenNameFields();
}

function commitAction(action) {
  // HIT은 카드 한 장을 새로 연다 — 곧장 최종 상태를 그리지 않고 리빌 단계를 거친다.
  const isHit = action.type === "HIT";
  const actor = isHit ? currentPlayer(game) : null;
  const actorId = actor ? actor.playerId : null;
  const cardsBefore = actor ? actor.roundCards.slice() : null;
  const logLenBefore = game.actionLog.length;

  try {
    applyAction(game, action);
  } catch (err) {
    console.error(err);
    playSfx(HOSPITAL, "error");
    return;
  }

  if (isHit) {
    const newEntries = game.actionLog.slice(logLenBefore);
    startReveal(actorId, cardsBefore, newEntries);
    return;
  }
  feedbackFor(game.actionLog[game.actionLog.length - 1]);
  persistAndRender();
}

function feedbackFor(lastEntry) {
  if (!lastEntry) return;
  if (lastEntry.type === "bust") playSfx(HOSPITAL, "error");
  else if (lastEntry.type === "flip7") playSfx(HOSPITAL, "crown");
  else if (game.phase === "game_over") playSfx(HOSPITAL, "win");
  else if (lastEntry.type === "round_end") playSfx(HOSPITAL, "confirm");
  else playSfx(HOSPITAL, "tap");
}

// 이번 HIT으로 실제 무슨 일이 있었는지(로그 diff)를 사람이 읽을 문구로 바꿔 리빌 단계를 연다.
// 평범한 번호표/보너스 카드는 뒤집는 연출만 짧게 보여주고, 중복(버스트)/7종 완성/특수권
// 카드처럼 극적이거나 설명이 필요한 경우엔 더 오래 머물며 탭으로도 넘길 수 있게 한다.
function startReveal(actorId, cardsBefore, newEntries) {
  const drawnEntry = newEntries.find((e) => e.type === "card_drawn");
  if (!drawnEntry) {
    persistAndRender();
    return;
  }
  const cardId = drawnEntry.cardId;
  const card = getCard(cardId);
  const actorName = (game.players.find((p) => p.playerId === actorId) || {}).displayName || "";

  const bustEntry = newEntries.find((e) => e.type === "bust");
  const flip7Entry = newEntries.find((e) => e.type === "flip7");
  const scUsedEntry = newEntries.find((e) => e.type === "second_chance_used");
  const freezeEntry = newEntries.find((e) => e.type === "freeze");
  const flipThreeEntry = newEntries.find((e) => e.type === "flip_three");
  const scGivenEntry = newEntries.find((e) => e.type === "second_chance_given");
  const scDiscardedEntry = newEntries.find((e) => e.type === "second_chance_discarded");
  const scGainedEntry = newEntries.find((e) => e.type === "second_chance_gained");

  let message;
  let tone;
  let notable;
  let lostCards = null;
  let sfx = "tap";

  if (bustEntry) {
    tone = "bust";
    notable = true;
    sfx = "error";
    lostCards = [...cardsBefore, cardId];
    message = "번호 중복! 이번 라운드에 접수한 번호표를 모두 잃었어요.";
  } else if (flip7Entry) {
    tone = "flip7";
    notable = true;
    sfx = "crown";
    message = "서로 다른 번호 7종 완성! +15점 보너스와 함께 라운드가 즉시 끝나요.";
  } else if (scUsedEntry) {
    tone = "second-chance";
    notable = true;
    sfx = "confirm";
    message = "번호가 중복됐지만 재접수권으로 무효화했어요! 계속 접수할 수 있어요.";
  } else if (card.kind === "action") {
    tone = "action";
    notable = true;
    sfx = "tap";
    const desc = ACTION_DESCRIPTIONS[card.actionType];
    let outcome = "";
    if (freezeEntry) {
      const t = game.players.find((p) => p.playerId === freezeEntry.targetPlayerId);
      outcome = freezeEntry.targetPlayerId === actorId ? " 본인에게 사용해 이번 라운드를 마감했어요." : ` ${t ? t.displayName : ""}님을 마감시켰어요.`;
    } else if (flipThreeEntry) {
      const t = game.players.find((p) => p.playerId === flipThreeEntry.targetPlayerId);
      outcome = flipThreeEntry.targetPlayerId === actorId ? " 본인에게 사용해 3연속 강제 접수를 시작해요." : ` ${t ? t.displayName : ""}님에게 강제 접수를 걸었어요.`;
    } else if (scGivenEntry) {
      // second_chance_given은 이미 보유 중인 사람이 또 뽑았을 때만 나오고, 항상 "아직
      // 없는 다른 사람"에게 넘어간다(eligible 필터가 본인을 제외하므로 자기 자신일 수 없음).
      const t = game.players.find((p) => p.playerId === scGivenEntry.targetPlayerId);
      outcome = ` 이미 갖고 있어서 ${t ? t.displayName : ""}님에게 넘겼어요.`;
    } else if (scDiscardedEntry) {
      outcome = " 이미 다들 갖고 있어 그대로 귀가 더미로 갔어요.";
    } else if (scGainedEntry) {
      outcome = " 보유 중이에요 — 다음 중복을 한 번 막아줘요.";
    }
    message = `${desc}${outcome}`;
  } else if (card.kind === "modifier") {
    tone = "modifier";
    notable = false;
    message = card.modType === "x2" ? "VIP 진료권 획득! 이번 라운드 숫자 합계를 2배로 계산해요." : `빠른 접수권 +${card.amount} 획득!`;
  } else {
    tone = "number";
    notable = false;
    message = `번호표 ${card.value} 접수!`;
  }

  playSfx(HOSPITAL, sfx);
  pendingReveal = { actorId, actorName, cardId, message, tone, notable, lostCards };
  render();
  clearTimeout(revealTimer);
  revealTimer = setTimeout(dismissReveal, notable ? REVEAL_NOTABLE_MS : REVEAL_QUICK_MS);
}

function dismissReveal() {
  clearTimeout(revealTimer);
  if (!pendingReveal) return;
  pendingReveal = null;
  persistAndRender();
}

function scheduleAiIfNeeded() {
  clearTimeout(aiTimer);
  if (!game || game.phase !== "playing") return;
  const actor = currentActor();
  if (!actor || !actor.isAI) return;
  aiTimer = setTimeout(() => {
    if (pendingReveal || !game || game.phase !== "playing") return;
    const action = chooseFlip7AiAction(game);
    if (action) commitAction(action);
  }, AI_THINK_DELAY_MS);
}

function scheduleRoundAutoContinue() {
  clearTimeout(roundTimer);
  roundTimer = setTimeout(() => {
    if (pendingReveal || !game || game.phase !== "round_over") return;
    commitAction({ type: "CONTINUE" });
  }, ROUND_SUMMARY_AUTO_MS);
}

function persistAndRender() {
  if (game && game.phase !== "game_over") saveFlip7Game(game);
  render();
}
