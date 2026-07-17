// 컨트롤러 — 번호표 뽑기 엔진과 화면을 잇는다. 규칙 로직은 절대 여기 두지 않는다.
import { createFlip7Game } from "./state.js";
import { getLegalActions, applyAction } from "./actions.js";
import { quitFlip7Game } from "./engine.js";
import { chooseFlip7AiAction } from "./ai.js";
import { saveFlip7Game, loadFlip7Game, clearFlip7Game } from "./storage.js";
import { playSfx, startBgm, stopBgm } from "../audio.js";
import { HOSPITAL } from "../palettes.js";
import { flip7SetupScreenHtml, flip7NameFieldsHtml, flip7BoardHtml, flip7RoundSummaryHtml, flip7GameOverHtml } from "./render.js";

let game = null;
let aiTimer = null;
let roundTimer = null;

const AI_THINK_DELAY_MS = 1100;
const ROUND_SUMMARY_AUTO_MS = 4200;

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

  if (!game || game.phase !== "playing") return;

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
      quitFlip7Game(game);
      playSfx(HOSPITAL, "win");
      persistAndRender();
    }
  } else if (action === "f7-new-game") {
    clearTimeout(aiTimer);
    clearTimeout(roundTimer);
    game = null;
    clearFlip7Game();
    render();
  }
}

function onChange(e) {
  if (e.target && e.target.id === "mla-f7-player-count") regenNameFields();
}

function commitAction(action) {
  try {
    applyAction(game, action);
  } catch (err) {
    console.error(err);
    playSfx(HOSPITAL, "error");
    return;
  }
  feedbackFor(action);
  persistAndRender();
}

function feedbackFor(action) {
  const lastEntry = game.actionLog[game.actionLog.length - 1];
  if (!lastEntry) return;
  if (lastEntry.type === "bust") {
    playSfx(HOSPITAL, "error");
  } else if (lastEntry.type === "flip7") {
    playSfx(HOSPITAL, "crown");
  } else if (game.phase === "game_over") {
    playSfx(HOSPITAL, "win");
  } else if (lastEntry.type === "round_end") {
    playSfx(HOSPITAL, "confirm");
  } else {
    playSfx(HOSPITAL, "tap");
  }
}

function scheduleAiIfNeeded() {
  clearTimeout(aiTimer);
  if (!game || game.phase !== "playing") return;
  const actor = currentActor();
  if (!actor || !actor.isAI) return;
  aiTimer = setTimeout(() => {
    if (!game || game.phase !== "playing") return;
    const action = chooseFlip7AiAction(game);
    if (action) commitAction(action);
  }, AI_THINK_DELAY_MS);
}

function scheduleRoundAutoContinue() {
  clearTimeout(roundTimer);
  roundTimer = setTimeout(() => {
    if (!game || game.phase !== "round_over") return;
    commitAction({ type: "CONTINUE" });
  }, ROUND_SUMMARY_AUTO_MS);
}

function persistAndRender() {
  if (game && game.phase !== "game_over") saveFlip7Game(game);
  render();
}
