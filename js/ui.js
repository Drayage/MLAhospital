// 컨트롤러 — 게임 엔진과 화면을 잇는다. 규칙 로직은 절대 여기 두지 않는다.
import { createGame } from "./engine/state.js";
import { getLegalActions, applyAction } from "./engine/actions.js";
import { finishGame } from "./engine/scoring.js";
import { saveGame, loadGame, clearGame, loadRejoin } from "./storage.js";
import { playSfx, startBgm, stopBgm } from "./audio.js";
import { HOSPITAL } from "./palettes.js";
import { ANIMALS } from "./data/animals.js";
import { getTrait } from "./data/traits.js";
import { getCard } from "./data/cards.js";
import { chooseAiAction } from "./ai.js";
import {
  modeChoiceHtml,
  setupScreenHtml,
  nameFieldsHtml,
  onlineEntryHtml,
  onlineLobbyHtml,
  traitSelectionHtml,
  harborTargetSelectionHtml,
  aiTraitWaitingHtml,
  variantSelectionHtml,
  gameBoardHtml,
  gameOverHtml,
} from "./ui/render.js";

let game = null;
let pendingBust = null; // 대소동이 나면 진료 줄 자리에서 어떤 카드 때문인지 잠깐 보여준다
let aiTimer = null;
let bustTimer = null;
let chainTimer = null;
let lastFlippedCardId = null; // 이미 뒤집기 연출을 보여준 카드 — 재렌더 때 또 뒤집지 않으려고 기록
let surrendered = false; // 항복으로 게임이 끝났는지 (게임오버 화면 문구 구분용)
let animating = false; // 카드 연쇄 진입을 한 장씩 보여주는 중 — 이 사이엔 새 행동을 막는다

// ── 온라인 모드 — js/online.js(과 그 아래 js/net.js/Firebase SDK)는 실제로 온라인을
// 쓸 때만 동적 import한다. 로컬 hotseat만 즐기는 사람은 네트워크(gstatic.com 등)에
// 전혀 의존하지 않는다(오프라인 PWA 원칙 유지) — 이게 game-baserule의 net.js를
// 상단에서 바로 정적 import하지 않은 이유다.
let screen = "mode-choice"; // "mode-choice" | "local-setup" | "online-entry" (game==null일 때만 의미 있음)
let online = null; // 동적 import된 js/online.js 모듈
let onlineModulePromise = null;
let onlineCode = null;
let onlineRoom = null;
let onlineEntryError = null;

const AI_THINK_DELAY_MS = 1300; // 사람처럼 살짝 고민하는 느낌
const BUST_AUTO_DISMISS_MS = 2600;

const gameArea = () => document.getElementById("game-area");

async function loadOnlineModule() {
  if (online) return online;
  if (!onlineModulePromise) {
    onlineModulePromise = import("./online.js").then((mod) => {
      mod.onRoomChange(handleIncomingRoom);
      online = mod;
      return mod;
    });
  }
  return onlineModulePromise;
}

export async function startApp() {
  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("change", onChange);

  const saved = loadGame();
  if (saved && saved.phase && saved.phase !== "game_over") {
    game = saved;
    // 새로고침으로 진행 중인 판을 이어할 때도 배경음이 다시 흘러나오게 한다
    // (원래는 "새 게임 시작" 제출 시에만 틀어서, 새로고침 후엔 무음이었음).
    startBgm(HOSPITAL, "main");
    render();
    return;
  }

  // 온라인 재입장 정보가 있을 때만 net.js를 불러온다 — 순수 로컬 플레이어는 영향 없음.
  if (loadRejoin()) {
    try {
      const net = await loadOnlineModule();
      const info = await net.attemptRejoin();
      if (info) {
        startBgm(HOSPITAL, "main");
        return; // 구독 콜백(handleIncomingRoom)이 곧 상태를 넣고 render()를 호출한다
      }
    } catch (err) {
      console.error("온라인 재입장 실패", err);
    }
  }
  render();
}

// 온라인 방 상태가 바뀔 때마다(구독 콜백) 호출된다. DOM은 여기서 만지지 않고
// game/onlineRoom만 갱신한 뒤 정해진 경로(render 또는 handleOutcome)로 넘긴다.
function handleIncomingRoom(room, code) {
  onlineRoom = room;
  onlineCode = code;
  if (!room) {
    render();
    return;
  }
  if (room.phase === "playing" && room.state) {
    applyIncomingState(room.state);
  } else {
    game = null;
    render();
  }
}

// 서버에서 확정된 새 상태를 받아 반영한다 — 내가 낸 행동이든 남이 낸 행동이든 경로가
// 같다(net.js 설계 원칙 4: 낙관적 렌더 금지, 서버 확정 상태만 그린다).
function applyIncomingState(newState) {
  if (!game) {
    game = newState;
    render();
    return;
  }
  const playAreaBefore = game.playArea.slice();
  const logLenBefore = game.actionLog.length;
  game = newState;
  handleOutcome(playAreaBefore, logLenBefore, null);
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

// 진료 줄의 마지막 카드가 "새로 나온" 카드인지 추적한다. 같은 카드가 계속 마지막 자리에
// 있는 채로 다른 이유(결정 처리 등)로 재렌더되면, 뒤집기 연출을 또 재생하지 않도록
// 그 카드 id를 반환해 억제한다(처음 나타날 땐 null을 반환해 정상적으로 뒤집힌다).
function computeFlipTarget() {
  if (!game || game.playArea.length === 0) {
    lastFlippedCardId = null;
    return null;
  }
  const currentLast = game.playArea[game.playArea.length - 1];
  if (currentLast === lastFlippedCardId) return currentLast;
  lastFlippedCardId = currentLast;
  return null;
}

function render() {
  // 온라인 대기실 — 게임이 아직 시작 전(phase:"lobby")이면 로비 화면을 보여준다.
  if (onlineCode && onlineRoom && onlineRoom.phase === "lobby") {
    gameArea().innerHTML = onlineLobbyHtml(onlineRoom, onlineCode, online.myId());
    renderActionBar();
    return;
  }

  if (!game) {
    if (screen === "online-entry") {
      gameArea().innerHTML = onlineEntryHtml({ error: onlineEntryError });
    } else if (screen === "local-setup") {
      gameArea().innerHTML = setupScreenHtml();
      regenNameFields();
    } else {
      gameArea().innerHTML = modeChoiceHtml();
    }
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

  const actor = currentActor();
  const myTurn = onlineCode ? online.isMyTurn(game) : true;
  if (game.phase === "trait_selection") {
    const decisionType = game.pendingDecision.type;
    if (actor && actor.isAI) {
      gameArea().innerHTML = aiTraitWaitingHtml(actor, decisionType);
    } else if (onlineCode && !myTurn) {
      gameArea().innerHTML = aiTraitWaitingHtml(actor, decisionType, { isAI: false });
    } else if (decisionType === "harbor_watch_target") {
      gameArea().innerHTML = harborTargetSelectionHtml(game);
    } else {
      gameArea().innerHTML = traitSelectionHtml(game);
    }
  } else if (game.phase === "variant_selection") {
    gameArea().innerHTML = variantSelectionHtml(game);
  } else if (game.phase === "game_over") {
    gameArea().innerHTML = gameOverHtml(game, { surrendered });
    stopBgm();
    if (!onlineCode) clearGame(); // 온라인 저장은 로컬 저장과 별개 — 지우면 안 됨
  } else {
    const suppressInteractive = !!(actor && actor.isAI) || (onlineCode && !myTurn);
    gameArea().innerHTML = gameBoardHtml(game, {
      aiThinking: suppressInteractive,
      alreadyFlippedCardId: computeFlipTarget(),
    });
  }
  renderActionBar();
  scheduleAiIfNeeded();
}

function renderActionBar() {
  const primary = document.getElementById("action-bar-primary");
  const surrenderBtn = document.getElementById("surrender-btn");
  primary.innerHTML = "";

  if (!game || pendingBust) {
    surrenderBtn.hidden = true;
    return;
  }
  if (game.phase === "game_over" || game.phase === "trait_selection" || game.phase === "variant_selection") {
    surrenderBtn.hidden = true;
    return;
  }

  // 항복은 누구 차례든(심지어 AI가 고민 중이거나 온라인에서 남의 차례일 때도) 바로
  // 게임을 끝낼 수 있어야 한다.
  surrenderBtn.hidden = false;

  const actor = currentActor();
  if (actor && actor.isAI) {
    const thinking = document.createElement("span");
    thinking.className = "mla-pill mla-pill-soft";
    thinking.textContent = `🤖 ${actor.displayName}님이 고민 중...`;
    primary.appendChild(thinking);
    return;
  }

  const myTurn = onlineCode ? online.isMyTurn(game) : true;
  if (onlineCode && !myTurn) {
    const waitPill = document.createElement("span");
    waitPill.className = "mla-pill mla-pill-soft";
    waitPill.textContent = `⏳ ${actor ? actor.displayName : ""}님 차례를 기다리는 중...`;
    primary.appendChild(waitPill);
    return;
  }

  const legal = getLegalActions(game);
  const canDraw = legal.some((a) => a.type === "DRAW");
  const canBank = legal.some((a) => a.type === "BANK");

  const drawBtn = document.createElement("button");
  drawBtn.textContent = game.playArea.length === 0 ? "진료 시작하기" : "환자 더 받기";
  drawBtn.setAttribute("data-action", "draw");
  drawBtn.disabled = !canDraw;

  const bankBtn = document.createElement("button");
  bankBtn.textContent = "진료 마치기";
  bankBtn.className = "mla-bank-btn";
  bankBtn.setAttribute("data-action", "bank");
  bankBtn.disabled = !canBank;

  primary.appendChild(drawBtn);
  primary.appendChild(bankBtn);
}

function regenNameFields() {
  const countSelect = document.getElementById("mla-player-count");
  if (!countSelect) return;
  document.getElementById("mla-name-fields").innerHTML = nameFieldsHtml(Number(countSelect.value));
}

function onChange(e) {
  if (!e.target) return;
  if (e.target.id === "mla-player-count") {
    regenNameFields();
    return;
  }
  if (e.target.closest("#mla-online-config-form")) {
    handleOnlineConfigChange(e.target.closest("#mla-online-config-form"));
  }
}

async function handleOnlineConfigChange(form) {
  if (!online || !onlineCode) return;
  const data = new FormData(form);
  const patch = {
    useTraits: data.get("cfg-useTraits") === "on",
    variantMode: data.get("cfg-variantMode") || "none",
    deckMultiplier: data.get("cfg-partyMode") === "on" ? 2 : 1,
    kingOfEr: data.get("cfg-kingOfEr") === "on",
    noAbilities: data.get("cfg-noAbilities") === "on",
  };
  try {
    await online.updateConfig(patch);
  } catch (err) {
    console.error(err);
  }
}

function onSubmit(e) {
  const setupForm = e.target.closest("#mla-setup-form");
  if (setupForm) {
    e.preventDefault();
    startLocalGame(new FormData(setupForm));
    return;
  }
  const onlineForm = e.target.closest("#mla-online-form");
  if (onlineForm) {
    e.preventDefault();
    handleOnlineEnter(new FormData(onlineForm));
  }
}

function startLocalGame(data) {
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
    deckMultiplier: data.get("partyMode") === "on" ? 2 : 1,
    kingOfEr: data.get("kingOfEr") === "on",
    noAbilities: data.get("noAbilities") === "on",
  });
  pendingBust = null;
  surrendered = false;
  persistAndRender();
}

async function handleOnlineEnter(data) {
  const displayName = (data.get("displayName") || "").trim() || "플레이어";
  const codeRaw = (data.get("roomCode") || "").trim().toUpperCase();
  onlineEntryError = null;

  let net;
  try {
    net = await loadOnlineModule();
  } catch (err) {
    // 모듈/Firebase SDK 자체를 못 불러온 경우(네트워크 문제) — 브라우저의 기술적인
    // 에러 문구 대신 사람이 이해할 수 있는 메시지를 보여준다.
    console.error(err);
    onlineEntryError = "온라인 접속에 실패했어요. 인터넷 연결을 확인하고 다시 시도해주세요.";
    render();
    return;
  }

  try {
    if (codeRaw) {
      await net.joinExistingRoom(codeRaw, displayName);
    } else {
      await net.hostCreateRoom(displayName);
    }
    startBgm(HOSPITAL, "main");
  } catch (err) {
    // 방을 못 찾음 등 net.js가 던지는 메시지는 이미 사람이 읽을 수 있는 한국어라 그대로 보여준다.
    console.error(err);
    onlineEntryError = err.message || "연결에 실패했어요. 다시 시도해주세요.";
    render();
  }
}

function onClick(e) {
  const actionBtn = e.target.closest("[data-action]");
  if (actionBtn) {
    handleActionClick(actionBtn);
    return;
  }
  // 특기 줄을 탭하면 그 특기의 설명을 보여준다 (능력 카드 탭 정보와 같은 자리/느낌).
  const traitEl = e.target.closest("[data-info-trait]");
  if (traitEl) {
    playSfx(HOSPITAL, "tap");
    showTraitInfo(traitEl.getAttribute("data-info-trait"));
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

async function handleActionClick(btn) {
  const action = btn.getAttribute("data-action");

  if (action === "choose-local") {
    screen = "local-setup";
    render();
    return;
  }
  if (action === "choose-online") {
    screen = "online-entry";
    onlineEntryError = null;
    render();
    return;
  }
  if (action === "back-to-mode-choice") {
    screen = "mode-choice";
    render();
    return;
  }
  if (action === "leave-online-room") {
    if (online) online.leaveOnlineGame();
    stopBgm();
    onlineCode = null;
    onlineRoom = null;
    game = null;
    screen = "mode-choice";
    render();
    return;
  }
  if (action === "copy-room-code") {
    const code = btn.getAttribute("data-code");
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(
        () => showToast("코드를 복사했어요"),
        () => {}
      );
    }
    return;
  }
  if (action === "online-start") {
    if (!online || !onlineRoom || animating) return;
    try {
      await online.hostStartGame(onlineRoom);
    } catch (err) {
      console.error(err);
      playSfx(HOSPITAL, "error");
    }
    return; // 구독 콜백이 곧 "playing" 상태를 넣어준다
  }

  if (action === "dismiss-bust") {
    dismissBust();
    return;
  }
  if (action === "new-game") {
    clearTimeout(aiTimer);
    clearTimeout(bustTimer);
    clearTimeout(chainTimer);
    animating = false;
    stopBgm();
    if (onlineCode && online) {
      try {
        await online.returnToLobby();
      } catch (err) {
        console.error(err);
      }
      game = null;
      render();
      return;
    }
    game = null;
    pendingBust = null;
    clearGame();
    render();
    return;
  }
  if (action === "surrender") {
    if (animating) return; // 카드 연쇄 진입 연출 중엔 새 행동을 막는다
    document.getElementById("surrender-modal").showModal();
    return;
  }
  if (action === "confirm-surrender") {
    document.getElementById("surrender-modal").close();
    await doSurrender();
    return;
  }
  if (btn.closest("#mla-setup-form") || btn.closest("#mla-online-form")) return; // submit이 처리

  if (!game || pendingBust || animating) return;

  let engineAction = null;
  if (action === "draw") engineAction = { type: "DRAW" };
  else if (action === "bank") engineAction = { type: "BANK" };
  else if (action === "select-trait") engineAction = { type: "SELECT_TRAIT", traitId: btn.getAttribute("data-trait-id") };
  else if (action === "select-harbor-target") engineAction = { type: "SELECT_HARBOR_TARGET", targetPlayerId: btn.getAttribute("data-target-player-id") };
  else if (action === "select-variant") engineAction = { type: "SELECT_VARIANT", variantId: btn.getAttribute("data-variant-id") };
  else if (action === "confirm-variant") engineAction = { type: "CONFIRM_VARIANT" };
  else if (action === "decide") engineAction = { type: "DECIDE", value: JSON.parse(btn.getAttribute("data-value")) };
  if (!engineAction) return;

  if (onlineCode) {
    dispatchOnlineAction(engineAction);
  } else {
    commitAction(engineAction);
  }
}

// 온라인 중 내 차례 행동 — 로컬에서 결정적으로 계산해 서버에 seq 가드로 써넣는다.
// 화면은 여기서 직접 바꾸지 않는다: subscribeRoom이 확정 상태를 돌려줄 때
// handleIncomingRoom → applyIncomingState 경로로만 갱신한다(낙관적 렌더 금지).
async function dispatchOnlineAction(engineAction) {
  if (!online || !onlineRoom) return;
  try {
    await online.sendAction(onlineRoom, engineAction);
  } catch (err) {
    console.error(err);
    playSfx(HOSPITAL, "error");
  }
}

// 사람이 누른 행동이든 AI가 고른 행동이든(로컬 한정) 같은 경로로 처리한다.
function commitAction(engineAction) {
  const playAreaBefore = game.playArea.slice(); // 이번 행동 전에 이미 진료 줄에 있던 카드들
  const logLenBefore = game.actionLog.length;
  try {
    applyAction(game, engineAction);
  } catch (err) {
    console.error(err);
    playSfx(HOSPITAL, "error");
    return;
  }
  handleOutcome(playAreaBefore, logLenBefore, engineAction);
}

// commitAction(로컬 mutation)과 applyIncomingState(온라인 통째 교체) 둘 다 이 지점부터
// 같은 후처리를 탄다: game은 이미 최종 상태다.
function handleOutcome(playAreaBefore, logLenBefore, engineAction) {
  const newEntries = game.actionLog.slice(logLenBefore);
  const bustEntry = newEntries.find((entry) => entry.type === "bust");
  const bankEntry = newEntries.find((entry) => entry.type === "bank");
  const crownEntry = newEntries.find((entry) => entry.type === "crown_awarded");
  const enteredCardIds = newEntries.filter((entry) => entry.type === "card_entered").map((entry) => entry.cardId);
  // 대소동을 일으킨 카드 자체는 "card_entered" 로그 없이 곧장 대소동으로 처리되므로
  // (handleEnterCard가 중복을 감지하면 로그를 남기지 않고 바로 resolveBust) 따로 붙여준다 —
  // 안 그러면 "고양이 뽑고 훔쳐온 카드가 바로 겹쳐서 터지는" 경우, 카드가 도합 2장 들어왔는데도
  // enteredCardIds 길이가 1로 보여서 아래 연쇄 연출이 건너뛰어진다.
  if (bustEntry) enteredCardIds.push(bustEntry.triggeringCardId);

  // 원숭이/고양이 능력이 선택지가 하나뿐이면 자동 실행되는데(불필요한 탭 제거), 그 결과로
  // 카드가 하나 더 진료 줄에 밀려 들어오는 경우가 있다 — 특히 그게 대소동으로 이어지면,
  // 엔진은 이 모든 걸 한 번의 행동으로 동기 처리하므로 화면도 한 번에 최종 결과(카드 2장 +
  // 대소동 리빌)로 점프해서 "카드 두 장이 동시에 나타난 것"처럼 보였다. 한 장씩 순서대로
  // 보여준 뒤에 최종 상태로 넘어가게 한다.
  if (enteredCardIds.length > 1) {
    animateChainedEntries(playAreaBefore, enteredCardIds, engineAction, bustEntry, bankEntry, crownEntry);
    return;
  }

  feedbackFor(engineAction, bustEntry, bankEntry, crownEntry);
  if (bustEntry) pendingBust = bustEntry;
  persistAndRender();
}

// 실제 game 객체는 이미 최종 상태로 바뀌어 있으므로 건드리지 않고, 화면에만 진료 줄이
// (이번 행동 전부터 있던 카드 + 새로 들어온 카드를) 한 장씩 자라나는 임시 스냅샷으로
// 순서대로 보여준다. 마지막 스텝을 보여준 뒤에야 진짜 persistAndRender()로 넘어가
// (대소동이면 그때 리빌 화면을 띄운다).
function animateChainedEntries(playAreaBefore, enteredCardIds, engineAction, bustEntry, bankEntry, crownEntry) {
  animating = true;
  let shown = 1;
  const step = () => {
    const partial = [...playAreaBefore, ...enteredCardIds.slice(0, shown)];
    const snapshot = {
      ...game,
      playArea: partial,
      pendingDecision: null,
      protectedCardIds: game.protectedCardIds.filter((cid) => partial.includes(cid)),
    };
    gameArea().innerHTML = gameBoardHtml(snapshot, { aiThinking: false });
    playSfx(HOSPITAL, "tap");
    if (shown < enteredCardIds.length) {
      shown++;
      chainTimer = setTimeout(step, 480);
      return;
    }
    // 마지막 카드까지 다 보여줬다 — 진짜 render()가 이 카드를 "또" 뒤집지 않도록
    // computeFlipTarget()이 이미 보여준 것으로 기억하게 해준다.
    lastFlippedCardId = enteredCardIds[enteredCardIds.length - 1];
    chainTimer = setTimeout(() => {
      animating = false;
      feedbackFor(engineAction, bustEntry, bankEntry, crownEntry);
      if (bustEntry) pendingBust = bustEntry;
      persistAndRender();
    }, 480);
  };
  step();
}

// 항복: 진행 중이던 진료 줄(아직 확보 안 한 카드)은 그대로 날리고, 지금까지 입원시킨
// 카드만으로 즉시 점수를 매겨 게임을 끝낸다 — 대기실 덱이 자연히 떨어졌을 때와 같은
// finishGame 경로를 그대로 재사용한다. 온라인이면 그 결과를 방에도 반영한다.
async function doSurrender() {
  if (!game || game.phase === "game_over") return;
  clearTimeout(aiTimer);
  clearTimeout(bustTimer);
  clearTimeout(chainTimer);
  animating = false;
  pendingBust = null;
  surrendered = true;

  if (onlineCode && online) {
    try {
      await online.surrenderOnline(onlineRoom);
    } catch (err) {
      console.error(err);
      playSfx(HOSPITAL, "error");
      return;
    }
    playSfx(HOSPITAL, "win");
    return; // 구독 콜백이 곧 game_over 상태를 넣어준다
  }

  finishGame(game);
  playSfx(HOSPITAL, "win");
  persistAndRender();
}

function feedbackFor(action, bustEntry, bankEntry, crownEntry) {
  // 왕관 획득은 극적인 순간이므로, 대소동/뱅킹과 겹치더라도(거북이 보호 카드만으로
  // 10종을 채운 채 대소동이 나는 등) 팡파르가 우선한다 — 화면(대소동 리빌 등)은
  // 그대로 진행되고 소리와 토스트만 왕관 쪽으로 바뀐다.
  if (crownEntry) {
    playSfx(HOSPITAL, "crown");
    const holder = game.players.find((p) => p.playerId === crownEntry.playerId);
    showToast(`👑 ${holder ? holder.displayName : ""}님이 응급실의 왕관을 차지했어요! (+10점)`, "crown");
  } else if (bustEntry) {
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
// 온라인 게임엔 AI 좌석이 없으므로(현재 지원 범위 밖) 이 함수는 자연히 no-op이 된다.
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

function showToast(msg, variant) {
  const el = document.getElementById("mla-toast");
  if (!el) return;
  el.classList.remove("mla-toast-info", "mla-toast-crown");
  if (variant) el.classList.add(`mla-toast-${variant}`);
  el.textContent = msg;
  el.classList.add("mla-show");
  clearTimeout(showToast._t);
  // 왕관 획득처럼 특별한 순간은 조금 더, 능력/특기 설명처럼 읽을 게 많은 것도 더 오래 보여준다.
  const duration = variant === "crown" ? 2600 : variant === "info" ? 3200 : 1600;
  showToast._t = setTimeout(() => el.classList.remove("mla-show"), duration);
}

// suit 능력 설명 + (입원실 카드라면) 그 스택에 실제로 쌓여있는 숫자들도 함께 보여준다.
// "×2" 배지가 어떤 숫자들로 쌓여있는지 궁금할 때를 위한 것.
function showAbilityInfo(suit, playerId) {
  const animal = ANIMALS[suit];
  if (!animal) return;

  let stackNote = "";
  if (playerId && game) {
    const player = game.players.find((p) => p.playerId === playerId);
    const stack = player && player.hospitalStacks[suit];
    if (stack && stack.length > 0) {
      const values = stack.map((cid) => getCard(cid).value).sort((a, b) => b - a);
      stackNote = stack.length > 1 ? ` (보유: ${values.join(", ")} → 최고 ${values[0]}점 반영)` : ` (보유: ${values[0]})`;
    }
  }

  showToast(`${animal.icon} ${animal.name} — ${animal.description}${stackNote}`, "info");
}

// 특기 줄을 탭했을 때 그 특기의 설명을 보여준다 (원작 특기 이름도 함께).
function showTraitInfo(traitId) {
  const trait = getTrait(traitId);
  if (!trait) return;
  showToast(`🩺 ${trait.name}(${trait.originalName}) — ${trait.description}`, "info");
}

function persistAndRender() {
  if (game && game.phase !== "game_over" && !onlineCode) saveGame(game);
  render();
}
