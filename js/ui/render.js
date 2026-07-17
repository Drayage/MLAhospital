// 순수 렌더 함수 모음 — 상태를 받아 HTML 문자열을 만든다. DOM 조작/이벤트는 js/ui.js에서 처리.
import { ANIMALS, SUITS } from "../data/animals.js";
import { TRAITS } from "../data/traits.js";
import { VARIANTS } from "../data/variants.js";
import { getCard } from "../data/cards.js";
import { getTopCardId, totalHospitalCardCount } from "../engine/hospital.js";
import { computeScore } from "../engine/scoring.js";

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// opts:
//  protected/ghost/dim — 카드 상태 스타일
//  badge — 우측 상단 배지 텍스트
//  flip/tension — 뒷면에서 앞면으로 뒤집히는 연출. tension이 클수록(진료 줄이 길수록) 천천히 뒤집힌다.
//  decideValue — 있으면 카드 자체가 버튼이 되어 탭하면 DECIDE 행동이 실행된다 (자연스러운 직접 선택)
//  lost/triggering — 대소동 연출용
export function cardHtml(cardId, opts = {}) {
  const card = getCard(cardId);
  const animal = ANIMALS[card.suit];
  const cls = ["mla-suit-card"];
  if (opts.protected) cls.push("mla-protected");
  if (opts.ghost) cls.push("mla-ghost");
  if (opts.dim) cls.push("mla-dim");
  if (opts.lost) cls.push("mla-bust-lost");
  if (opts.triggering) cls.push("mla-bust-trigger");
  // flip 카드가 아닐 때만 얼굴 자체에 셀렉터블 펄스(transform:scale)를 건다.
  // flip 카드의 얼굴은 뒤집기용 rotateY가 고정 transform으로 걸려 있어서, 같은 요소에
  // transform 애니메이션을 더 얹으면 rotateY가 지워져 카드가 안 보이는 버그가 생긴다
  // (실제로 두더지/부엉이 카드가 사라지는 버그의 원인이었음) — 대신 바깥 래퍼에 건다.
  if (opts.decideValue !== undefined && !opts.flip) cls.push("mla-selectable");

  const attrs = [`title="${esc(animal.name)} ${card.value} — ${esc(animal.description)}"`, `data-info-suit="${card.suit}"`];
  if (opts.decideValue !== undefined) attrs.push(`data-action="decide"`, `data-value='${esc(JSON.stringify(opts.decideValue))}'`);
  if (opts.lost) attrs.push(`data-bust-card="lost"`);

  const badgeText = opts.badge || (opts.triggering ? "!" : "");
  const badge = badgeText ? `<span class="mla-badge">${esc(badgeText)}</span>` : "";
  const faceInner = `${badge}<div class="mla-icon">${animal.icon}</div><div class="mla-value">${card.value}</div>`;
  const attrStr = attrs.join(" ");

  if (opts.flip) {
    const tension = Math.min(opts.tension || 0, 9);
    const dur = (0.42 + tension * 0.07).toFixed(2);
    const delay = (0.12 + tension * 0.045).toFixed(2);
    const outerCls = opts.decideValue !== undefined ? "mla-flip-outer mla-selectable-flip" : "mla-flip-outer";
    return `<div class="${outerCls}" ${attrStr}>
      <div class="mla-flip-inner" style="animation-duration:${dur}s;animation-delay:${delay}s;">
        <div class="mla-flip-face mla-flip-back">🐾</div>
        <div class="mla-flip-face mla-flip-front ${cls.join(" ")}">${faceInner}</div>
      </div>
    </div>`;
  }
  return `<div class="${cls.join(" ")}" ${attrStr}>${faceInner}</div>`;
}

function emptySuitSlotHtml(suit, opts = {}) {
  const animal = ANIMALS[suit];
  const cls = ["mla-suit-card", "mla-ghost"];
  if (opts.dim) cls.push("mla-dim");
  return `<div class="${cls.join(" ")}" data-info-suit="${suit}" title="${esc(animal.name)} — ${esc(animal.description)}">
    <div class="mla-icon">${animal.icon}</div>
    <div class="mla-value">-</div>
  </div>`;
}

// 지금 대기 중인 결정이 이 플레이어의 입원실 카드를 대상으로 하는지 계산.
// null이면 이 플레이어와 무관(평소처럼 렌더), Map이면 종류별로 탭 가능한 값이 담긴다.
// aiThinking이면 지금 결정권자가 AI라는 뜻이므로, 사람이 대신 누를 수 있는 것처럼
// 보이지 않도록 강조를 전부 끈다.
function computeSelectableForPlayer(state, player, aiThinking) {
  if (aiThinking) return null;
  const d = state.pendingDecision;
  if (!d) return null;
  if (d.type === "monkey_choose_card" && d.playerId === player.playerId) {
    const map = new Map();
    for (const cid of d.options) map.set(getCard(cid).suit, cid);
    return map;
  }
  if (d.type === "dog_choose_target" || d.type === "cat_choose_target") {
    const relevant = d.options.filter((opt) => opt.opponentId === player.playerId);
    if (relevant.length === 0) return null;
    const map = new Map();
    for (const opt of relevant) map.set(opt.suit, opt);
    return map;
  }
  return null;
}

export function hospitalHtml(player, { showAll = true, selectable = null } = {}) {
  return SUITS.map((suit) => {
    const stack = player.hospitalStacks[suit];
    const isTarget = !!(selectable && selectable.has(suit));
    const dim = !!selectable && !isTarget;
    if (!stack || stack.length === 0) {
      if (!showAll) return "";
      return emptySuitSlotHtml(suit, { dim });
    }
    const topId = getTopCardId(stack);
    const badge = stack.length > 1 ? `×${stack.length}` : "";
    return cardHtml(topId, { badge, dim, decideValue: isTarget ? selectable.get(suit) : undefined });
  }).join("");
}

export function playerPanelHtml(state, player, aiThinking) {
  const isTurn = player.isCurrentPlayer;
  const score = computeScore(state, player);
  const traitName = player.traitId ? TRAITS[player.traitId].name : null;
  const selectable = computeSelectableForPlayer(state, player, aiThinking);
  const hasCrown = state.mode.kingOfEr && state.crownHolderId === player.playerId;
  return `<div class="mla-player-card ${isTurn ? "mla-current" : ""} ${selectable ? "mla-decision-focus" : ""} ${hasCrown ? "mla-crowned" : ""}" data-player-id="${player.playerId}">
    <div class="mla-player-head">
      <span>${isTurn ? "▶ " : ""}${hasCrown ? '<span class="mla-crown-badge" title="응급실의 왕 — 왕관 보유 중 (+10점)">👑</span> ' : ""}${player.isAI ? "🤖 " : ""}${esc(player.displayName)}</span>
      <span class="mla-pill mla-pill-soft">점수 ${score}</span>
    </div>
    ${traitName ? `<div class="mla-muted mla-trait-line" data-info-trait="${player.traitId}">특기: <u>${esc(traitName)}</u></div>` : ""}
    <div class="mla-row">${hospitalHtml(player, { selectable })}</div>
  </div>`;
}

// 첫 화면: 한 기기로 같이(hotseat) vs 온라인으로 같이(다른 기기) 중 선택.
export function modeChoiceHtml() {
  return `
  <button type="button" class="mla-inline-link" data-action="back-to-game-choice">← 게임 선택으로</button>
  <div class="mla-panel mla-center">
    <h1 style="font-size:22px">🏥 우리집 동물병원</h1>
    <p class="mla-muted">가족 단위 환자를 접수하는 푸시 유어 럭 카드 게임</p>
  </div>
  <button type="button" data-action="choose-local" class="mla-choice-btn" style="text-align:center; font-weight:700; padding:16px;">📱 한 기기로 같이 하기<br><span class="mla-muted" style="font-weight:400">기기 하나를 돌려가며 플레이해요</span></button>
  <button type="button" data-action="choose-online" class="mla-choice-btn" style="text-align:center; font-weight:700; padding:16px; margin-top:10px;">🌐 온라인으로 같이 하기<br><span class="mla-muted" style="font-weight:400">각자 기기에서 방을 만들거나 코드로 참가해요</span></button>`;
}

function backLinkHtml() {
  return `<button type="button" data-action="back-to-mode-choice" class="mla-inline-link" style="margin-bottom:6px">◀ 다른 방식으로 플레이</button>`;
}

// 특기/특수모드/변형규칙 설정 필드 — 로컬 설정 폼과 온라인 호스트 로비에서 공용으로 쓴다.
function gameOptionFieldsHtml({ prefix = "" } = {}) {
  return `
    <div class="mla-setup-field">
      <label><input type="checkbox" name="${prefix}useTraits" /> 수의사 특기 사용 (각자 특기 1개 선택)</label>
    </div>
    <div class="mla-setup-field">
      <label>🎲 특수 모드 (여러 개 동시에 켤 수 있어요)</label>
      <label style="margin-top:6px"><input type="checkbox" name="${prefix}partyMode" /> 🎉 파티 모드 — 카드가 2배(120장)라 더 오래, 더 크게 쌓여요</label>
      <label style="margin-top:6px"><input type="checkbox" name="${prefix}kingOfEr" /> 👑 응급실의 왕 — 한 턴에 10종류를 모두 입원시키면 왕관(+10점)을 얻어요. 왕관은 하나뿐, 가장 최근 성공자가 가져가요</label>
      <label style="margin-top:6px"><input type="checkbox" name="${prefix}noAbilities" /> 😴 심심한 모드 — 동물 능력이 전부 사라지고 순수하게 숫자만 겨루는 게임이 돼요</label>
    </div>
    <div class="mla-setup-field">
      <label>오늘의 병원 규칙</label>
      <select name="${prefix}variantMode">
        <option value="none" selected>사용 안 함 (기본 규칙)</option>
        <option value="random">무작위로 1개 적용</option>
        <option value="manual">직접 선택</option>
      </select>
    </div>`;
}

export function setupScreenHtml() {
  return `
  ${backLinkHtml()}
  <div class="mla-panel">
    <h2 style="font-size:18px">📱 한 기기로 같이</h2>
    <p class="mla-muted">기기 하나를 돌려가며 플레이해요</p>
  </div>
  <form id="mla-setup-form">
    <div class="mla-setup-field">
      <label>플레이어 수 (2~4명)</label>
      <select name="playerCount" id="mla-player-count">
        <option value="2">2명</option>
        <option value="3" selected>3명</option>
        <option value="4">4명</option>
      </select>
    </div>
    <p class="mla-muted" style="margin:-4px 0 10px">🤖 체크하면 그 자리는 AI가 대신 플레이해요.</p>
    <div id="mla-name-fields"></div>
    ${gameOptionFieldsHtml()}
    <button type="submit" data-action="start-game" style="width:100%; padding:14px; border:0; border-radius:12px; background:var(--accent-strong); color:#fff; font-size:16px; font-weight:800;">진료 시작</button>
  </form>`;
}

// 온라인 진입: 이름 입력 + (방 코드 입력하면 참가, 비워두면 새 방 생성).
export function onlineEntryHtml({ error = null } = {}) {
  return `
  ${backLinkHtml()}
  <div class="mla-panel">
    <h2 style="font-size:18px">🌐 온라인으로 같이</h2>
    <p class="mla-muted">각자 기기에서 접속해요. 방을 만든 사람이 코드를 공유해주세요.</p>
  </div>
  ${error ? `<div class="mla-bust-banner">${esc(error)}</div>` : ""}
  <form id="mla-online-form">
    <div class="mla-setup-field">
      <label>내 이름</label>
      <input type="text" name="displayName" maxlength="10" value="복동" />
    </div>
    <div class="mla-setup-field">
      <label>방 코드 (참가할 때만 입력 — 새로 만들려면 비워두세요)</label>
      <input type="text" name="roomCode" maxlength="8" placeholder="예: AB3K7" style="text-transform:uppercase" />
    </div>
    <button type="submit" data-action="online-enter" style="width:100%; padding:14px; border:0; border-radius:12px; background:var(--accent-strong); color:#fff; font-size:16px; font-weight:800;">참가/방 만들기</button>
  </form>`;
}

// 온라인 대기실 — 방 코드/참가자 목록 + (호스트만) 설정과 시작 버튼.
export function onlineLobbyHtml(room, code, myId) {
  const isHost = room.hostId === myId;
  const players = Object.values(room.players || {}).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  const rows = players
    .map((p) => {
      const tags = [p.id === myId ? "나" : null, p.id === room.hostId ? "호스트" : null].filter(Boolean).join(" · ");
      const status = p.isAI ? "🤖" : p.online ? "🟢" : "⚪";
      // AI는 호스트가 언제든 뺄 수 있게 — 실제 사람은 스스로 나가는 것 외엔 뺄 방법을 주지 않는다.
      const removeBtn =
        isHost && p.isAI
          ? `<button type="button" data-action="online-remove-player" data-player-id="${esc(p.id)}" class="mla-inline-link" style="margin:0">빼기</button>`
          : "";
      return `<div class="mla-player-card">
        <div class="mla-player-head">
          <span>${status} ${esc(p.name)}${tags ? ` <span class="mla-muted">(${tags})</span>` : ""}</span>
          ${removeBtn}
        </div>
      </div>`;
    })
    .join("");
  const canStart = players.length >= 2 && players.length <= 4;
  const cfg = room.config || {};
  const aiControls = isHost
    ? `<button type="button" data-action="online-add-ai" class="mla-inline-link" ${players.length >= 4 ? "disabled" : ""}>🤖 AI 추가</button>`
    : "";
  const hostControls = isHost
    ? `<form id="mla-online-config-form">${gameOptionFieldsHtml({ prefix: "cfg-" })}</form>
       ${aiControls}
       <button type="button" data-action="online-start" class="mla-choice-btn" style="text-align:center;font-weight:800;background:var(--accent-strong);color:#fff;margin-top:8px;" ${canStart ? "" : "disabled"}>
         ${canStart ? "🚀 게임 시작" : `플레이어 2~4명이 모이면 시작할 수 있어요 (현재 ${players.length}명)`}
       </button>`
    : `<p class="mla-muted">
        특기 사용: ${cfg.useTraits ? "예" : "아니오"} · 파티 모드: ${cfg.deckMultiplier > 1 ? "예" : "아니오"} ·
        응급실의 왕: ${cfg.kingOfEr ? "예" : "아니오"} · 심심한 모드: ${cfg.noAbilities ? "예" : "아니오"}
      </p>
      <p class="mla-muted">호스트가 게임을 시작하길 기다리는 중...</p>`;
  return `
  <div class="mla-panel mla-center">
    <h2>🚪 대기실</h2>
    <p>방 코드: <b style="font-size:20px; letter-spacing:2px;">${esc(code)}</b></p>
    <button type="button" data-action="copy-room-code" data-code="${esc(code)}" class="mla-inline-link">코드 복사하기</button>
  </div>
  ${rows}
  <div class="mla-panel">${hostControls}</div>
  <button type="button" data-action="leave-online-room" class="mla-choice-btn" style="text-align:center;">방 나가기</button>`;
}

export function nameFieldsHtml(count) {
  const defaults = ["복동", "나비", "초코", "몽이"];
  let html = "";
  for (let i = 0; i < count; i++) {
    html += `<div class="mla-setup-field">
      <label>플레이어 ${i + 1} 이름</label>
      <div class="mla-row" style="align-items:center; flex-wrap:nowrap; gap:6px;">
        <input type="text" name="playerName" maxlength="10" value="${esc(defaults[i])}" style="width:calc(100% - 46px); min-width:0;" />
        <label class="mla-ai-toggle" title="AI가 대신 플레이">
          <input type="checkbox" name="playerIsAI" value="${i}" /> 🤖
        </label>
      </div>
    </div>`;
  }
  return html;
}

export function traitSelectionHtml(state) {
  const d = state.pendingDecision;
  const player = state.players.find((p) => p.playerId === d.playerId);
  const cards = d.options
    .map((traitId) => {
      const t = TRAITS[traitId];
      // 옆 병원 당직자처럼 특정 종류가 아니라 전체에 걸리는 특기는 affectedSuit가 없다.
      const suitLabel = t.affectedSuit ? ` <span class="mla-muted">(${esc(ANIMALS[t.affectedSuit].name)})</span>` : "";
      return `<div class="mla-trait-card">
        <h4>${esc(t.name)}${suitLabel}</h4>
        <p class="mla-muted" style="margin:0 0 8px">${esc(t.description)}</p>
        <button class="mla-choice-btn" data-action="select-trait" data-trait-id="${t.id}">이 특기를 선택</button>
      </div>`;
    })
    .join("");
  return `<div class="mla-panel mla-center">
      <h2>🩺 ${esc(player.displayName)}님의 특기 선택</h2>
      <p class="mla-muted">둘 중 하나를 골라주세요. 고르지 않은 카드는 이번 게임에서 제외됩니다.</p>
    </div>
    ${cards}`;
}

// 옆 병원 당직자(Davy Jones' Locker) 특기를 고른 사람이, 대소동 카드를 대신 받아갈
// 플레이어 한 명을 지정하는 화면. 특기 선택 화면 바로 뒤에 이어진다.
export function harborTargetSelectionHtml(state) {
  const d = state.pendingDecision;
  const player = state.players.find((p) => p.playerId === d.playerId);
  const options = d.options
    .map((pid) => {
      const target = state.players.find((p) => p.playerId === pid);
      return `<button class="mla-choice-btn" data-action="select-harbor-target" data-target-player-id="${pid}">${esc(target.displayName)}</button>`;
    })
    .join("");
  return `<div class="mla-panel mla-center">
      <h2>🏥 ${esc(player.displayName)}님의 옆 병원 지정</h2>
      <p class="mla-muted">누군가 대소동을 일으키면, 버려질 카드를 대신 내가 받아올 플레이어를 골라주세요.</p>
      ${options}
    </div>`;
}

// AI(또는 온라인에서 남의) 차례에는 사람이 대신 고를 수 있는 버튼을 보여주지 않고,
// 고르는 중이라고만 알려준다.
export function aiTraitWaitingHtml(player, decisionType, { isAI = true } = {}) {
  const label = decisionType === "harbor_watch_target" ? "옆 병원을 지정하고" : "특기를 고르고";
  const icon = isAI ? "🤖" : "⏳";
  return `<div class="mla-panel mla-center">
    <p style="font-size:15px">${icon} <b>${esc(player.displayName)}</b>님이 ${label} 있어요...</p>
  </div>`;
}

export function variantSelectionHtml(state) {
  if (state.mode.variantMode === "manual") {
    const options = Object.values(VARIANTS)
      .map(
        (v) => `<div class="mla-trait-card">
          <h4>${esc(v.name)}</h4>
          <p class="mla-muted" style="margin:0 0 8px">${esc(v.description)}</p>
          <button class="mla-choice-btn" data-action="select-variant" data-variant-id="${v.id}">이 규칙으로 진행</button>
        </div>`
      )
      .join("");
    return `<div class="mla-panel mla-center"><h2>📋 오늘의 병원 규칙 선택</h2></div>${options}`;
  }
  return `<div class="mla-panel mla-center">
    <h2>📋 오늘의 병원 규칙</h2>
    <p class="mla-muted">버튼을 눌러 오늘 적용될 규칙을 확인하세요.</p>
    <button class="mla-choice-btn" data-action="confirm-variant">규칙 확인하기</button>
  </div>`;
}

function activeSpecialModeLabels(state) {
  const labels = [];
  if (state.mode.deckMultiplier > 1) labels.push("🎉 파티 모드");
  if (state.mode.kingOfEr) labels.push("👑 응급실의 왕");
  if (state.mode.noAbilities) labels.push("😴 심심한 모드");
  return labels;
}

function statusBarHtml(state, bustInfo) {
  const player = bustInfo ? state.players.find((p) => p.playerId === bustInfo.playerId) : state.players[state.currentPlayerIndex];
  const variant = state.activeVariantId ? VARIANTS[state.activeVariantId] : null;
  const specialModes = activeSpecialModeLabels(state);
  return `<div class="mla-panel">
    <div class="mla-row" style="justify-content:space-between; align-items:center;">
      <span class="mla-pill ${bustInfo ? "mla-pill-warn" : ""}">${player.isAI ? "🤖 " : ""}${esc(player.displayName)}님 ${bustInfo ? "대소동 발생!" : "진료 중"}</span>
      <span class="mla-muted">대기실 덱 ${state.drawPile.length}장 · 귀가 더미 ${state.discardPile.length}장</span>
    </div>
    ${variant ? `<div class="mla-muted" style="margin-top:6px">오늘의 규칙: <b>${esc(variant.name)}</b> — ${esc(variant.description)}</div>` : ""}
    ${specialModes.length ? `<div class="mla-muted" style="margin-top:6px">특수 모드: <b>${specialModes.join(" · ")}</b></div>` : ""}
    ${
      !bustInfo && state.requiredExtraDraws > 0
        ? `<div class="mla-pill mla-pill-warn" style="margin-top:6px">🐰 토끼 가족이 몰려왔습니다! 환자를 ${state.requiredExtraDraws}가족 더 접수해야 합니다.</div>`
        : ""
    }
  </div>`;
}

// 원숭이/강아지/고양이는 입원실 카드를 직접 탭해 선택하므로, 여기서는 짧은 안내문만 보여준다.
function inlineDecisionBanner(state) {
  const d = state.pendingDecision;
  if (!d) return "";
  const messages = {
    monkey_choose_card: "🐵 원숭이 능력 — 아래 <b>내 입원실</b>에서 반짝이는 카드를 탭해 데려오세요.",
    dog_choose_target: "🐶 강아지 능력 — 아래 <b>상대 입원실</b>에서 반짝이는 카드를 탭해 귀가시키세요.",
    cat_choose_target: "🐱 고양이 능력 — 아래 <b>상대 입원실</b>에서 반짝이는 카드를 탭해 데려오세요.",
  };
  return messages[d.type] ? `<p class="mla-decision-banner">${messages[d.type]}</p>` : "";
}

// 두더지/부엉이는 진료 줄 밖(귀가 더미/대기실 덱)에서 카드를 꺼내오므로, 그 카드를 여기서 바로 보여주고
// 탭하면 선택되게 한다 (별도 팝업 없이 진료 줄의 자연스러운 연장처럼 보이게).
function inlineRevealRow(state) {
  const d = state.pendingDecision;
  if (!d) return "";
  const tension = state.playArea.length;
  if (d.type === "mole_choose_card") {
    const cards = d.options.map((cid) => cardHtml(cid, { flip: true, tension, decideValue: cid })).join("");
    return `<div class="mla-reveal-row">
      <p class="mla-decision-banner">🦔 두더지 능력 — 귀가 더미에서 나온 카드 중 하나를 탭해 접수하세요.</p>
      <div class="mla-row">${cards}</div>
    </div>`;
  }
  if (d.type === "owl_choose") {
    // 영상 판독 특기(Mystic): 3장을 미리 보여주지만, 순서를 어길 수 없어 맨 앞 카드만 탭할 수 있다.
    const cards = d.previewCardIds
      .map((cid, i) => {
        const selectable = !d.mysticMode || i === 0;
        return cardHtml(cid, { flip: true, tension, decideValue: selectable ? { action: "take", cardId: cid } : undefined });
      })
      .join("");
    const bankLine = d.canBank
      ? `<button class="mla-inline-link" data-action="decide" data-value='${esc(JSON.stringify({ action: "bank" }))}'>또는, 지금 바로 진료 마치기</button>`
      : `<p class="mla-muted">토끼 강제 접수 중에는 지금 진료를 마칠 수 없어요.</p>`;
    const mysticNote = d.mysticMode
      ? `<p class="mla-muted">🔮 영상 판독 특기 — 순서대로만 접수할 수 있어요. 맨 왼쪽 카드만 선택할 수 있습니다.</p>`
      : "";
    return `<div class="mla-reveal-row">
      <p class="mla-decision-banner">🦉 부엉이 능력 — 다음 카드를 몰래 확인했어요. 접수하려면 카드를 탭하세요.</p>
      <div class="mla-row">${cards}</div>
      ${mysticNote}
      ${bankLine}
    </div>`;
  }
  return "";
}

// 간식 가로채기 특기(Plunderer)가 있으면, 볼빵빵 보너스를 귀가 더미 대신 다른 플레이어의
// 병원에서 가져온다. 습격할 상대를 고르는 화면 — 진료 줄이 비어 있는 채로(방금 진료를
// 마쳤으므로) 그 자리를 대신 채운다.
function plunderTargetHtml(state) {
  const d = state.pendingDecision;
  const buttons = d.options
    .map((pid) => {
      const target = state.players.find((p) => p.playerId === pid);
      return `<button class="mla-choice-btn" data-action="decide" data-value='${esc(JSON.stringify(pid))}'>${esc(target.displayName)}의 병원 습격하기</button>`;
    })
    .join("");
  return `<p class="mla-decision-banner">🦝 간식 가로채기 특기 — 볼빵빵 보너스를 상대 병원에서 가져와요. 습격할 상대를 골라주세요.</p>${buttons}`;
}

function playAreaHtml(state, aiThinking, alreadyFlippedCardId) {
  if (state.playArea.length === 0) {
    // 간식 가로채기 특기의 습격 대상 선택은 진료 줄이 빈 채로(방금 진료를 마쳤으므로) 일어난다.
    const plundering = state.pendingDecision && state.pendingDecision.type === "plunder_choose_target";
    if (plundering && !aiThinking) {
      return `<div class="mla-panel"><h3>현재 진료 줄</h3>${plunderTargetHtml(state)}</div>`;
    }
    const aiPlunderNote = plundering && aiThinking ? `<p class="mla-muted">🤖 습격할 병원을 고르고 있어요...</p>` : "";
    return `<div class="mla-panel"><h3>현재 진료 줄</h3><p class="mla-muted">아직 접수한 환자가 없어요.</p>${aiPlunderNote}</div>`;
  }
  const protectedSet = new Set(state.protectedCardIds);
  const lastIdx = state.playArea.length - 1;
  // 마지막 카드라도, 이미 한 번 뒤집기 연출을 보여준 카드라면(다른 이유로 재렌더된 것뿐)
  // 다시 뒤집지 않는다 — 안 그러면 강아지/고양이 결정이 끝난 뒤 재렌더될 때 같은 카드가
  // "또" 뒤집히는 것처럼 보이는 버그가 있었음.
  const cards = state.playArea
    .map((cid, i) =>
      cardHtml(cid, {
        protected: protectedSet.has(cid),
        flip: i === lastIdx && cid !== alreadyFlippedCardId,
        tension: lastIdx,
      })
    )
    .join("");
  const lastCard = getCard(state.playArea[lastIdx]);
  const lastAnimal = ANIMALS[lastCard.suit];

  // AI 차례에는 사람이 대신 누를 수 있는 것처럼 보이는 인터랙티브 안내(반짝이는 카드,
  // "탭하세요" 문구)를 절대 보여주지 않는다 — 실제로 "특기 선택"에서 AI 차례인데도
  // 사람이 누를 수 있는 버튼이 그대로 떠 있던 버그가 있었음. 대신 고민 중이라고만 알려준다.
  const showInteractiveDecision = !!state.pendingDecision && !aiThinking;

  // 결정 안내문이 이미 같은 내용을 더 구체적으로 설명하는 경우에는 일반 능력 한 줄 설명을
  // 생략한다 (안 그러면 "강아지"가 두 번 나온 것처럼 중복되어 보이는 문제가 있었음).
  const abilityLine = showInteractiveDecision
    ? ""
    : `<p class="mla-ability-line">${lastAnimal.icon} <b>${esc(lastAnimal.name)}</b> — ${esc(lastAnimal.description)}</p>`;
  const aiNote =
    aiThinking && state.pendingDecision ? `<p class="mla-muted">🤖 다음 행동을 고민하고 있어요...</p>` : "";

  return `<div class="mla-panel">
    <h3>현재 진료 줄</h3>
    <div class="mla-row">${cards}</div>
    ${abilityLine}
    ${aiNote}
    ${state.protectedCardIds.length ? `<p class="mla-muted">🛡️ 초록 테두리 카드는 거북이가 보호하고 있어요.</p>` : ""}
    ${showInteractiveDecision ? inlineRevealRow(state) : ""}
    ${showInteractiveDecision ? inlineDecisionBanner(state) : ""}
  </div>`;
}

export function cardLabel(cardId) {
  const card = getCard(cardId);
  return `${ANIMALS[card.suit].icon} ${esc(ANIMALS[card.suit].name)} ${card.value}`;
}

// 대소동 순간의 진료 줄 — 화면을 통째로 바꾸지 않고 같은 자리에서 무엇이 터졌는지 보여준다.
function bustAreaHtml(state, bustInfo) {
  const player = state.players.find((p) => p.playerId === bustInfo.playerId);
  const protectedIds = bustInfo.protectedCardIds || [];
  const lostIds = bustInfo.lostCardIds || [];
  const cards = [...protectedIds, ...lostIds]
    .map((cid) =>
      cardHtml(cid, {
        protected: protectedIds.includes(cid),
        lost: lostIds.includes(cid),
        triggering: cid === bustInfo.triggeringCardId,
      })
    )
    .join("");
  return `<div class="mla-panel mla-bust-flash">
    <h3>현재 진료 줄</h3>
    <div class="mla-bust-banner">😱 ${cardLabel(bustInfo.triggeringCardId)}가 겹쳐서 대소동이 났어요!</div>
    <div class="mla-row">${cards}</div>
    <p class="mla-muted">
      ${protectedIds.length ? "🛡️ 초록 테두리는 보호되어 입원, " : ""}흐려진 카드는 귀가 더미로 갑니다.
    </p>
    <button class="mla-bust-continue" data-action="dismiss-bust">계속하기</button>
  </div>`;
}

export function gameBoardHtml(state, { bustInfo = null, aiThinking = false, alreadyFlippedCardId = null } = {}) {
  // 입원실 순서는 누구 차례인지와 무관하게 항상 고정한다: 내(1번 플레이어) 입원실이 맨 위,
  // 나머지는 자리(플레이) 순서대로. 차례가 바뀔 때마다 패널이 재배치되면 헷갈리기 때문.
  const [me, ...others] = state.players;
  const area = bustInfo ? bustAreaHtml(state, bustInfo) : playAreaHtml(state, aiThinking, alreadyFlippedCardId);
  const hint = state.mode.useTraits ? "카드나 특기를 탭하면 설명을 볼 수 있어요" : "카드를 탭하면 능력을 볼 수 있어요";
  return `
    ${statusBarHtml(state, bustInfo)}
    ${area}
    <div class="mla-panel"><h3>입원실 <span class="mla-muted" style="font-weight:400">(${hint})</span></h3>${playerPanelHtml(state, me, aiThinking)}${others.map((p) => playerPanelHtml(state, p, aiThinking)).join("")}</div>
  `;
}

export function gameOverHtml(state, { surrendered = false } = {}) {
  const ranked = state.players.slice().sort((a, b) => b.score - a.score);
  const winners = new Set(state.winnerIds);
  const rows = ranked
    .map((p) => {
      const isWinner = winners.has(p.playerId);
      const crownNote = state.mode.kingOfEr && state.crownHolderId === p.playerId ? " · 👑 왕관 +10점" : "";
      return `<div class="mla-player-card ${isWinner && !surrendered ? "mla-winner-card" : ""}">
        <div class="mla-player-head">
          <span>${isWinner ? (surrendered ? "🏆 " : '<span class="mla-trophy-bounce">🏆</span> ') : ""}${esc(p.displayName)}</span>
          <span class="mla-pill">${p.score}점</span>
        </div>
        <div class="mla-muted">보유 카드 ${totalHospitalCardCount(p)}장${p.traitId ? " · 특기: " + esc(TRAITS[p.traitId].name) : ""}${crownNote}</div>
        <div class="mla-row">${hospitalHtml(p, { showAll: false }) || '<span class="mla-muted">확보한 환자가 없어요</span>'}</div>
      </div>`;
    })
    .join("");
  const winnerNames = ranked.filter((p) => winners.has(p.playerId)).map((p) => p.displayName).join(", ");
  const heading = surrendered
    ? `<h2>🏳️ 항복으로 진료를 마쳤어요</h2><p class="mla-muted" style="margin:0 0 6px">그 시점까지의 점수로 결과를 매겼어요.</p>`
    : `<h2>🎉 오늘의 진료 종료!</h2>`;
  return `<div class="mla-panel mla-center ${surrendered ? "" : "mla-victory-panel"}">
      ${heading}
      <p>${state.winnerIds.length > 1 ? "공동 우승" : "우승"}: <b>${esc(winnerNames)}</b></p>
    </div>
    ${rows}
    <button class="mla-choice-btn" data-action="new-game" style="text-align:center;font-weight:700;margin-top:10px;">새 게임 시작</button>`;
}
