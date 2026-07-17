// 순수 렌더 함수 — 상태를 HTML 문자열로 바꾸기만 한다. 규칙 로직 없음.
import { getCard, cardDisplay, computeCardsScore, FLIP_TARGET, numberColor } from "./cards.js";

const STATUS_LABEL = {
  active: "접수 중",
  stayed: "마감",
  busted: "번호 중복!",
  frozen: "조기 마감",
  flipped7: "7종 완성!",
  out: "구경 중",
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function flip7NameFieldsHtml(count) {
  let html = "";
  for (let i = 0; i < count; i++) {
    html += `
      <div class="mla-setup-field" style="display:flex; align-items:center; gap:6px;">
        <input type="text" name="playerName" placeholder="플레이어 ${i + 1}" maxlength="10" style="flex:1;" />
        <label class="mla-ai-toggle" title="AI로 설정"><input type="checkbox" name="playerIsAI" value="${i}" /> 🤖</label>
      </div>`;
  }
  return html;
}

export function flip7SetupScreenHtml() {
  return `
    <button type="button" class="mla-inline-link" data-action="back-to-game-choice">← 게임 선택으로</button>
    <h2>🎫 번호표 뽑기</h2>
    <p class="mla-muted">대기실에서 번호표를 뽑다가, 같은 번호가 다시 나오면 그날 접수는 없던 일이 돼요. 서로 다른 번호 7장을 모으면 즉시 큰 보너스!</p>
    <form id="mla-f7-setup-form">
      <div class="mla-setup-field">
        <label for="mla-f7-player-count">인원수</label>
        <select id="mla-f7-player-count" name="playerCount">
          ${[2, 3, 4, 5, 6].map((n) => `<option value="${n}"${n === 2 ? " selected" : ""}>${n}명</option>`).join("")}
        </select>
      </div>
      <div id="mla-f7-name-fields">${flip7NameFieldsHtml(2)}</div>
      <button type="submit" style="width:100%; padding:12px; border-radius:12px; border:0; background:var(--accent); color:var(--accent-ink); font-weight:800; font-size:16px;">시작하기</button>
    </form>`;
}

// 번호표(숫자) 카드는 값마다 다른 색으로 테두리/숫자를 칠해서 한눈에 구분되게 한다.
function numberStyleAttrs(card) {
  if (card.kind !== "number") return "";
  const c = numberColor(card.value);
  return ` style="border-color:${c}; box-shadow:0 0 0 2px ${c} inset, var(--shadow);"`;
}
function numberValueStyle(card) {
  return card.kind === "number" ? ` style="color:${numberColor(card.value)};"` : "";
}

function cardChip(cardId) {
  const d = cardDisplay(cardId);
  const card = getCard(cardId);
  return `<span class="mla-suit-card"${numberStyleAttrs(card)} title="${esc(d.label)}"><span class="mla-icon">${d.icon}</span><span class="mla-value"${numberValueStyle(card)}>${esc(d.sub)}</span></span>`;
}

// 카드 한 장이 새로 열리는 순간의 3D 플립 연출 — 우리집 동물병원과 같은 CSS 클래스를 재사용한다.
function flipCardHtml(cardId) {
  const d = cardDisplay(cardId);
  const card = getCard(cardId);
  const faceInner = `<div class="mla-icon">${d.icon}</div><div class="mla-value"${numberValueStyle(card)}>${esc(d.sub)}</div>`;
  return `<div class="mla-flip-outer">
    <div class="mla-flip-inner" style="animation-duration:0.5s;animation-delay:0.12s;">
      <div class="mla-flip-face mla-flip-back">🎫</div>
      <div class="mla-flip-face mla-flip-front mla-suit-card"${numberStyleAttrs(card)}>${faceInner}</div>
    </div>
  </div>`;
}

// HIT 한 번의 결과를 "천천히 확인"할 수 있도록 전체 화면을 잠깐 대신하는 리빌 패널.
// reveal: { actorName, cardId, message, tone, notable, lostCards }
export function flip7RevealHtml(reveal) {
  const flashClass = reveal.tone === "bust" ? " mla-bust-flash" : "";
  const messageClass = reveal.tone === "bust" ? "mla-bust-banner" : "mla-decision-banner";
  const lostHtml =
    reveal.lostCards && reveal.lostCards.length > 0
      ? `<div class="mla-row" style="margin-top:8px; justify-content:center;">${reveal.lostCards.map(cardChip).join("")}</div>
         <div class="mla-muted mla-center" style="margin-top:4px;">위 카드를 모두 귀가 더미로 보냈어요</div>`
      : "";
  const hint = reveal.notable ? `<div class="mla-muted mla-center" style="margin-top:12px;">탭하면 계속</div>` : "";
  return `
    <div class="mla-panel mla-center${flashClass}" data-action="f7-dismiss-reveal" style="min-height:280px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer;">
      <div class="mla-muted">${esc(reveal.actorName)}</div>
      <div style="margin:10px 0;">${flipCardHtml(reveal.cardId)}</div>
      <div class="${messageClass}" style="max-width:300px;">${esc(reveal.message)}</div>
      ${lostHtml}
      ${hint}
    </div>`;
}

function playerStatusPillClass(status) {
  if (status === "busted") return "mla-pill mla-pill-warn";
  if (status === "flipped7") return "mla-pill";
  return "mla-pill mla-pill-soft";
}

function decisionBannerHtml(state) {
  const d = state.pendingDecision;
  if (!d) return "";
  const actor = state.players.find((p) => p.playerId === d.playerId);
  const verb = d.type === "choose_freeze_target" ? "조기 마감권을 누구에게 쓸까요?" : d.type === "choose_flip_three_target" ? "응급 호출을 누구에게 보낼까요?" : "재접수권을 누구에게 줄까요?";
  if (actor.isAI) {
    return `<div class="mla-decision-banner">🤖 ${esc(actor.displayName)}님이 ${verb} 고민 중...</div>`;
  }
  const choices = d.options
    .map((pid) => {
      const p = state.players.find((pl) => pl.playerId === pid);
      const label = pid === actor.playerId ? `${esc(p.displayName)} (나)` : esc(p.displayName);
      const scoreNote = p.roundCards.length > 0 ? ` — 이번 라운드 ${computeCardsScore(p.roundCards)}점` : "";
      return `<button type="button" class="mla-choice-btn" data-action="f7-decide" data-target-player-id="${pid}">${label}${scoreNote}</button>`;
    })
    .join("");
  return `<div class="mla-decision-banner">${esc(actor.displayName)}님, ${verb}</div>${choices}`;
}

function playerCardHtml(state, player, isCurrent) {
  const classes = ["mla-player-card"];
  if (isCurrent) classes.push("mla-current");
  const uniqueCount = player.roundCards.filter((cid) => getCard(cid).kind === "number").length;
  const roundScore = player.roundCards.length > 0 ? computeCardsScore(player.roundCards) : 0;
  const forcedNote = player.forcedHitsLeft > 0 ? ` <span class="mla-pill mla-pill-warn">응급 호출 남은 ${player.forcedHitsLeft}회</span>` : "";
  const secondChanceNote = player.secondChanceCardId ? ` <span class="mla-pill mla-pill-soft">🎟️ 재접수권 보유</span>` : "";
  const cardsHtml = player.roundCards.length > 0 ? player.roundCards.map(cardChip).join("") : `<span class="mla-muted">아직 받은 번호표 없음</span>`;
  return `
    <div class="${classes.join(" ")}" data-player-id="${player.playerId}">
      <div class="mla-player-head">
        <span>${player.isAI ? "🤖 " : ""}${esc(player.displayName)}${isCurrent ? " ▶" : ""}</span>
        <span class="${playerStatusPillClass(player.roundStatus)}">${STATUS_LABEL[player.roundStatus] || player.roundStatus}</span>
      </div>
      <div class="mla-muted">총점 ${player.totalScore}점${player.roundCards.length > 0 ? ` · 이번 라운드 ${roundScore}점 (번호 ${uniqueCount}/${FLIP_TARGET}종)` : ""}</div>
      ${forcedNote}${secondChanceNote}
      <div class="mla-row" style="margin-top:6px;">${cardsHtml}</div>
    </div>`;
}

export function flip7BoardHtml(state) {
  const currentId = state.players[state.currentPlayerIndex]?.playerId;
  const playersHtml = state.players.map((p) => playerCardHtml(state, p, p.playerId === currentId && p.roundStatus === "active")).join("");
  return `
    <div class="mla-panel mla-center">
      <div class="mla-pill">라운드 ${state.round}</div>
      <div class="mla-pill mla-pill-soft">목표 ${state.targetScore}점</div>
      <div class="mla-pill mla-pill-soft">대기실 덱 ${state.deck.length}장</div>
    </div>
    ${decisionBannerHtml(state)}
    ${playersHtml}
    <button type="button" class="mla-inline-link" data-action="f7-quit">🏳️ 그만두기(지금까지 총점으로 즉시 종료)</button>`;
}

export function flip7RoundSummaryHtml(state) {
  const summary = state.lastRoundSummary;
  const rows = summary.entries
    .map((e) => {
      const player = state.players.find((p) => p.playerId === e.playerId);
      let note;
      if (e.skipped) note = "구경 중";
      else if (e.busted) note = "번호 중복! +0점";
      else if (e.flipped7) note = `7종 완성! +${e.roundScore}점 (보너스 포함)`;
      else note = `+${e.roundScore}점`;
      return `<div class="mla-player-card"><div class="mla-player-head"><span>${player.isAI ? "🤖 " : ""}${esc(player.displayName)}</span><span class="mla-pill mla-pill-soft">${note}</span></div><div class="mla-muted">이번 라운드 누적 총점: ${player.totalScore}점</div></div>`;
    })
    .join("");
  return `
    <div class="mla-panel mla-center"><h3>라운드 ${summary.round} 결과</h3></div>
    ${rows}
    <button type="button" class="mla-choice-btn" data-action="f7-continue" style="text-align:center; font-weight:800; background:var(--accent); border-color:var(--accent-strong);">다음 라운드 시작 →</button>`;
}

export function flip7GameOverHtml(state) {
  const winners = state.players.filter((p) => state.winnerIds.includes(p.playerId));
  const sorted = state.players.slice().sort((a, b) => b.totalScore - a.totalScore);
  const winnerNames = winners.map((w) => esc(w.displayName)).join(", ");
  const rows = sorted
    .map((p) => {
      const isWinner = state.winnerIds.includes(p.playerId);
      return `<div class="mla-player-card${isWinner ? " mla-winner-card" : ""}"><div class="mla-player-head"><span>${isWinner ? '<span class="mla-trophy-bounce">🏆</span> ' : ""}${p.isAI ? "🤖 " : ""}${esc(p.displayName)}</span><span class="mla-pill">${p.totalScore}점</span></div></div>`;
    })
    .join("");
  return `
    <div class="mla-panel mla-victory-panel mla-center">
      <h2><span class="mla-trophy-bounce">🏆</span> ${esc(winnerNames)}${winners.length > 1 ? "님들" : "님"} 접수 완료!</h2>
    </div>
    ${rows}
    <button type="button" class="mla-choice-btn" data-action="f7-new-game" style="text-align:center; font-weight:800;">새 게임</button>
    <button type="button" class="mla-inline-link" data-action="back-to-game-choice">← 게임 선택으로</button>`;
}
