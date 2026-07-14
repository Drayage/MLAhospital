// 컨트롤러 — 게임 엔진과 화면을 잇는다. 규칙 로직은 절대 여기 두지 않는다.
import { createGame } from "./engine/state.js";
import { getLegalActions, applyAction } from "./engine/actions.js";
import { saveGame, loadGame, clearGame } from "./storage.js";
import { playSfx, startBgm } from "./audio.js";
import { HOSPITAL } from "./palettes.js";
import { ANIMALS } from "./data/animals.js";
import { getCard } from "./data/cards.js";
import { chooseAiAction } from "./ai.js";
import {
  setupScreenHtml,
  nameFieldsHtml,
  traitSelectionHtml,
  variantSelectionHtml,
  veilHtml,
  gameBoardHtml,
  gameOverHtml,
} from "./ui/render.js";

let game = null;
let revealedGateKey = null;
let pendingBust = null; // 대소동이 나면 진료 줄 자리에서 어떤 카드 때문인지 잠깐 보여준다
let aiTimer = null;
let bustTimer = null;

const AI_THINK_DELAY_MS = 1300; // 사람처럼 살짝 고민하는 느낌
const BUST_AUTO_DISMISS_MS = 2600;

const gameArea = () => document.getElementById("game-area");
const actionBar = () => document.getElementById("action-bar");

export function startApp() {
  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("change", onChange);

  const saved = loadGame();
  if (saved && saved.phase && saved.phase !== "game_over") {
    game = saved;
  }
  render();
}

// 현재 결정을 내려야 하는 플레이어 ID (변형규칙 선택처럼 특정 플레이어에게 속하지 않으면 null)
function currentActorId() {
  if (!game) return null;
  if (game.phase === "trait_selection" && game.pendingDecision) return game.pendingDecision.playerId;
  if (game.phase === "variant_selection") return null;
  if (game.pendingDecision) return game.pendingDecision.playerId;
  if (game.phase === "turn_start" || game.phase === "waiting_for_choice") {
    return game.players[game.currentPlayerIndex].playerId;
  }
  return null;
}

function currentActor() {
  const id = currentActorId();
  return id ? game.players.find((p) => p.playerId === id) : null;
}

// AI 차례에는 다른 사람에게 숨길 정보가 없으므로(감출 대상이 없음) 가림막을 생략한다.
function currentGateKey() {
  if (!game) return null;
  const actor = currentActor();
  if (actor && actor.isAI) return null;

  if (game.phase === "trait_selection" && game.pendingDecision) {
    return "trait:" + game.pendingDecision.playerId;
  }
  if (game.pendingDecision && game.pendingDecision.type === "owl_choose") {
    return "owl:" + game.pendingDecision.playerId + ":" + game.pendingDecision.previewCardIds.join(",");
  }
  return null;
}

function render() {
  if (!game) {
    gameArea().innerHTML = setupScreenHtml();
    regenNameFields();
    renderActionBar();
    return;
  }

  // 대소동은 화면을 통째로 바꾸지 않고, 보드 안 진료 줄 자리에서 그대로 보여준다.
  if (pendingBust) {
    gameArea().innerHTML = gameBoardHtml(game, { bustInfo: pendingBust });
    renderActionBar();
    scheduleBustAutoDismiss();
    return;
  }

  const gateKey = currentGateKey();
  if (gateKey && revealedGateKey !== gateKey) {
    const label = game.phase === "trait_selection" ? "특기를 선택할 차례예요" : "부엉이가 카드를 확인했어요";
    gameArea().innerHTML = veilHtml(label);
    renderActionBar();
    return;
  }

  if (game.phase === "trait_selection") {
    gameArea().innerHTML = traitSelectionHtml(game);
  } else if (game.phase === "variant_selection") {
    gameArea().innerHTML = variantSelectionHtml(game);
  } else if (game.phase === "game_over") {
    gameArea().innerHTML = gameOverHtml(game);
    clearGame();
  } else {
    gameArea().innerHTML = gameBoardHtml(game);
  }
  renderActionBar();
  scheduleAiIfNeeded();
}

function renderActionBar() {
  const bar = actionBar();
  const rulesBtn = document.getElementById("rules-btn");
  bar.querySelectorAll("[data-mla-main]").forEach((el) => el.remove());

  if (!game || pendingBust) return;
  if (game.phase === "game_over" || game.phase === "trait_selection" || game.phase === "variant_selection") return;
  if (currentGateKey() && revealedGateKey !== currentGateKey()) return;

  const actor = currentActor();
  if (actor && actor.isAI) {
    const thinking = document.createElement("span");
    thinking.className = "mla-pill mla-pill-soft";
    thinking.setAttribute("data-mla-main", "1");
    thinking.textContent = `🤖 ${actor.displayName}님이 고민 중...`;
    bar.insertBefore(thinking, rulesBtn);
    return;
  }

  const legal = getLegalActions(game);
  const canDraw = legal.some((a) => a.type === "DRAW");
  const canBank = legal.some((a) => a.type === "BANK");

  const drawBtn = document.createElement("button");
  drawBtn.textContent = game.playArea.length === 0 ? "진료 시작하기" : "환자 더 받기";
  drawBtn.setAttribute("data-mla-main", "1");
  drawBtn.setAttribute("data-action", "draw");
  drawBtn.disabled = !canDraw;

  const bankBtn = document.createElement("button");
  bankBtn.textContent = "진료 마치기";
  bankBtn.className = "mla-bank-btn";
  bankBtn.setAttribute("data-mla-main", "1");
  bankBtn.setAttribute("data-action", "bank");
  bankBtn.disabled = !canBank;

  bar.insertBefore(drawBtn, rulesBtn);
  bar.insertBefore(bankBtn, rulesBtn);
}

function regenNameFields() {
  const countSelect = document.getElementById("mla-player-count");
  if (!countSelect) return;
  document.getElementById("mla-name-fields").innerHTML = nameFieldsHtml(Number(countSelect.value));
}

function onChange(e) {
  if (e.target && e.target.id === "mla-player-count") regenNameFields();
}

function onSubmit(e) {
  const form = e.target.closest("#mla-setup-form");
  if (!form) return;
  e.preventDefault();
  const data = new FormData(form);
  const playerCount = Number(data.get("playerCount"));
  const playerNames = data.getAll("playerName").map((s) => s.trim() || "플레이어").slice(0, playerCount);
  const aiIndexes = new Set(data.getAll("playerIsAI").map(Number));
  const aiFlags = playerNames.map((_, i) => aiIndexes.has(i));
  startBgm(HOSPITAL, "main");
  game = createGame({
    playerNames,
    aiFlags,
    useTraits: data.get("useTraits") === "on",
    variantMode: data.get("variantMode") || "none",
  });
  revealedGateKey = null;
  pendingBust = null;
  persistAndRender();
}

function onClick(e) {
  const actionBtn = e.target.closest("[data-action]");
  if (actionBtn) {
    handleActionClick(actionBtn);
    return;
  }
  // 능력 버튼이 아니면: 카드(내 것이든 남의 것이든, 빈 칸이든)를 탭했을 때 한 줄 설명을 보여준다.
  const infoEl = e.target.closest("[data-info-suit]");
  if (infoEl) {
    playSfx(HOSPITAL, "tap");
    const playerCard = infoEl.closest("[data-player-id]");
    showAbilityInfo(infoEl.getAttribute("data-info-suit"), playerCard ? playerCard.getAttribute("data-player-id") : null);
  }
}

function handleActionClick(btn) {
  const action = btn.getAttribute("data-action");

  if (action === "reveal-gate") {
    revealedGateKey = currentGateKey();
    playSfx(HOSPITAL, "tap");
    render();
    return;
  }
  if (action === "dismiss-bust") {
    dismissBust();
    return;
  }
  if (action === "new-game") {
    clearTimeout(aiTimer);
    clearTimeout(bustTimer);
    game = null;
    revealedGateKey = null;
    pendingBust = null;
    clearGame();
    render();
    return;
  }
  if (btn.closest("#mla-setup-form")) return; // submit이 처리

  if (!game || pendingBust) return;

  let engineAction = null;
  if (action === "draw") engineAction = { type: "DRAW" };
  else if (action === "bank") engineAction = { type: "BANK" };
  else if (action === "select-trait") engineAction = { type: "SELECT_TRAIT", traitId: btn.getAttribute("data-trait-id") };
  else if (action === "select-variant") engineAction = { type: "SELECT_VARIANT", variantId: btn.getAttribute("data-variant-id") };
  else if (action === "confirm-variant") engineAction = { type: "CONFIRM_VARIANT" };
  else if (action === "decide") engineAction = { type: "DECIDE", value: JSON.parse(btn.getAttribute("data-value")) };
  if (!engineAction) return;

  commitAction(engineAction);
}

// 사람이 누른 행동이든 AI가 고른 행동이든 같은 경로로 처리한다.
function commitAction(engineAction) {
  const logLenBefore = game.actionLog.length;
  try {
    applyAction(game, engineAction);
  } catch (err) {
    console.error(err);
    playSfx(HOSPITAL, "error");
    return;
  }

  const newEntries = game.actionLog.slice(logLenBefore);
  const bustEntry = newEntries.find((entry) => entry.type === "bust");
  const bankEntry = newEntries.find((entry) => entry.type === "bank");
  feedbackFor(engineAction, bustEntry, bankEntry);
  revealedGateKey = null;
  if (bustEntry) pendingBust = bustEntry;
  persistAndRender();
}

function feedbackFor(action, bustEntry, bankEntry) {
  if (bustEntry) {
    // 진료 줄 안에서 바로 보여주므로(흔들림+배지) 별도 토스트는 생략한다.
    playSfx(HOSPITAL, "error");
  } else if (bankEntry) {
    playSfx(HOSPITAL, "confirm");
    // 볼빵빵(햄스터+아몬드) 보너스가 실제로 발동했는지 눈에 보이게 알려준다.
    if (bankEntry.hasCombo) {
      showToast(`🐹🥜 볼빵빵 보너스! 카드 ${bankEntry.bonusCards.length}장을 추가로 받았어요!`);
    } else {
      showToast("✅ 진료를 마쳤어요");
    }
  } else if (game.phase === "game_over") {
    playSfx(HOSPITAL, "win");
  } else {
    playSfx(HOSPITAL, "tap");
  }
}

function scheduleBustAutoDismiss() {
  clearTimeout(bustTimer);
  bustTimer = setTimeout(dismissBust, BUST_AUTO_DISMISS_MS);
}

// 귀가하는 카드들을 살짝 날아가듯 사라지게 한 뒤(순수 DOM 트릭) 다음 상태를 렌더한다.
function dismissBust() {
  clearTimeout(bustTimer);
  if (!pendingBust) return;
  const lostEls = document.querySelectorAll('[data-bust-card="lost"]');
  lostEls.forEach((el) => el.classList.add("mla-card-leaving"));
  const wait = lostEls.length ? 260 : 0;
  setTimeout(() => {
    pendingBust = null;
    render();
  }, wait);
}

// 현재 결정권자가 AI면 잠시 후 스스로 행동을 골라 진행한다 (사람처럼 약간의 텀을 둔다).
function scheduleAiIfNeeded() {
  clearTimeout(aiTimer);
  if (!game || pendingBust || game.phase === "game_over") return;
  const actor = currentActor();
  if (!actor || !actor.isAI) return;
  aiTimer = setTimeout(() => {
    const action = chooseAiAction(game);
    if (action) commitAction(action);
  }, AI_THINK_DELAY_MS);
}

function showToast(msg) {
  const el = document.getElementById("mla-toast");
  if (!el) return;
  el.classList.remove("mla-toast-info");
  el.textContent = msg;
  el.classList.add("mla-show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("mla-show"), 1600);
}

// suit 능력 설명 + (입원실 카드라면) 그 스택에 실제로 쌓여있는 숫자들도 함께 보여준다.
// "×2" 배지가 어떤 숫자들로 쌓여있는지 궁금할 때를 위한 것.
function showAbilityInfo(suit, playerId) {
  const animal = ANIMALS[suit];
  if (!animal) return;
  const el = document.getElementById("mla-toast");
  if (!el) return;

  let stackNote = "";
  if (playerId && game) {
    const player = game.players.find((p) => p.playerId === playerId);
    const stack = player && player.hospitalStacks[suit];
    if (stack && stack.length > 0) {
      const values = stack.map((cid) => getCard(cid).value).sort((a, b) => b - a);
      stackNote = stack.length > 1 ? ` (보유: ${values.join(", ")} → 최고 ${values[0]}점 반영)` : ` (보유: ${values[0]})`;
    }
  }

  el.textContent = `${animal.icon} ${animal.name} — ${animal.description}${stackNote}`;
  el.classList.add("mla-show", "mla-toast-info");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("mla-show", "mla-toast-info"), 3200);
}

function persistAndRender() {
  if (game && game.phase !== "game_over") saveGame(game);
  render();
}
