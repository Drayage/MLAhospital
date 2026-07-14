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

// opts.flip: 뒷면 상태로 나타났다가 실제 얼굴로 뒤집히는 연출 (카드 공개 순간의 긴장감용).
export function cardHtml(cardId, opts = {}) {
  const card = getCard(cardId);
  const animal = ANIMALS[card.suit];
  const cls = ["mla-suit-card"];
  if (opts.protected) cls.push("mla-protected");
  if (opts.ghost) cls.push("mla-ghost");
  const badge = opts.badge ? `<span class="mla-badge">${esc(opts.badge)}</span>` : "";
  const faceInner = `${badge}<div class="mla-icon">${animal.icon}</div><div class="mla-value">${card.value}</div>`;

  if (opts.flip) {
    return `<div class="mla-flip-outer">
      <div class="mla-flip-inner">
        <div class="mla-flip-face mla-flip-back">🐾</div>
        <div class="mla-flip-face mla-flip-front ${cls.join(" ")}" title="${esc(animal.name)} ${card.value}">${faceInner}</div>
      </div>
    </div>`;
  }
  return `<div class="${cls.join(" ")}" title="${esc(animal.name)} ${card.value}">${faceInner}</div>`;
}

function emptySuitSlotHtml(suit) {
  const animal = ANIMALS[suit];
  return `<div class="mla-suit-card mla-ghost" title="${esc(animal.name)} 없음">
    <div class="mla-icon">${animal.icon}</div>
    <div class="mla-value">-</div>
  </div>`;
}

export function hospitalHtml(player, { showAll = true } = {}) {
  return SUITS.map((suit) => {
    const stack = player.hospitalStacks[suit];
    if (!stack || stack.length === 0) return showAll ? emptySuitSlotHtml(suit) : "";
    const topId = getTopCardId(stack);
    const badge = stack.length > 1 ? `×${stack.length}` : "";
    return cardHtml(topId, { badge });
  }).join("");
}

export function playerPanelHtml(state, player) {
  const isTurn = player.isCurrentPlayer;
  const score = computeScore(state, player);
  const traitName = player.traitId ? TRAITS[player.traitId].name : null;
  return `<div class="mla-player-card ${isTurn ? "mla-current" : ""}" data-player-id="${player.playerId}">
    <div class="mla-player-head">
      <span>${isTurn ? "▶ " : ""}${player.isAI ? "🤖 " : ""}${esc(player.displayName)}</span>
      <span class="mla-pill mla-pill-soft">점수 ${score}</span>
    </div>
    ${traitName ? `<div class="mla-muted">특기: ${esc(traitName)}</div>` : ""}
    <div class="mla-row">${hospitalHtml(player)}</div>
  </div>`;
}

export function setupScreenHtml() {
  return `
  <div class="mla-panel">
    <h1 style="font-size:22px">🏥 우리집 동물병원</h1>
    <p class="mla-muted">가족 단위 환자를 접수하는 푸시 유어 럭 카드 게임</p>
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
    <div id="mla-name-fields"></div>
    <div class="mla-setup-field">
      <label><input type="checkbox" name="useTraits" /> 수의사 특기 사용 (각자 특기 1개 선택)</label>
    </div>
    <div class="mla-setup-field">
      <label>오늘의 병원 규칙</label>
      <select name="variantMode">
        <option value="none" selected>사용 안 함 (기본 규칙)</option>
        <option value="random">무작위로 1개 적용</option>
        <option value="manual">직접 선택</option>
      </select>
    </div>
    <button type="submit" data-action="start-game" style="width:100%; padding:14px; border:0; border-radius:12px; background:var(--accent-strong); color:#fff; font-size:16px; font-weight:800;">진료 시작</button>
  </form>`;
}

export function nameFieldsHtml(count) {
  const defaults = ["복동", "나비", "초코", "몽이"];
  let html = "";
  for (let i = 0; i < count; i++) {
    html += `<div class="mla-setup-field">
      <label>플레이어 ${i + 1} 이름</label>
      <div class="mla-row" style="align-items:center; flex-wrap:nowrap; gap:8px;">
        <input type="text" name="playerName" maxlength="10" value="${esc(defaults[i])}" style="flex:1" />
        <label class="mla-ai-toggle">
          <input type="checkbox" name="playerIsAI" value="${i}" /> 🤖 AI
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
      return `<div class="mla-trait-card">
        <h4>${esc(t.name)} <span class="mla-muted">(${esc(ANIMALS[t.affectedSuit].name)})</span></h4>
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

export function veilHtml(label) {
  return `<div class="mla-hidden-veil">
    <p>🙈 <b>${esc(label)}</b></p>
    <p class="mla-muted">다른 분은 화면을 보지 말아주세요.</p>
    <button class="mla-choice-btn" data-action="reveal-gate" style="text-align:center;font-weight:700;">탭해서 확인하기</button>
  </div>`;
}

function statusBarHtml(state) {
  const player = state.players[state.currentPlayerIndex];
  const variant = state.activeVariantId ? VARIANTS[state.activeVariantId] : null;
  return `<div class="mla-panel">
    <div class="mla-row" style="justify-content:space-between; align-items:center;">
      <span class="mla-pill">${esc(player.displayName)}님 진료 중</span>
      <span class="mla-muted">대기실 덱 ${state.drawPile.length}장 · 귀가 더미 ${state.discardPile.length}장</span>
    </div>
    ${variant ? `<div class="mla-muted" style="margin-top:6px">오늘의 규칙: <b>${esc(variant.name)}</b> — ${esc(variant.description)}</div>` : ""}
    ${
      state.requiredExtraDraws > 0
        ? `<div class="mla-pill mla-pill-warn" style="margin-top:6px">🐰 토끼 가족이 몰려왔습니다! 환자를 ${state.requiredExtraDraws}가족 더 접수해야 합니다.</div>`
        : ""
    }
  </div>`;
}

function playAreaHtml(state) {
  if (state.playArea.length === 0) {
    return `<div class="mla-panel"><h3>현재 진료 줄</h3><p class="mla-muted">아직 접수한 환자가 없어요.</p></div>`;
  }
  const protectedSet = new Set(state.protectedCardIds);
  const lastIdx = state.playArea.length - 1;
  const cards = state.playArea
    .map((cid, i) => cardHtml(cid, { protected: protectedSet.has(cid), flip: i === lastIdx }))
    .join("");
  return `<div class="mla-panel">
    <h3>현재 진료 줄</h3>
    <div class="mla-row">${cards}</div>
    ${state.protectedCardIds.length ? `<p class="mla-muted">🛡️ 초록 테두리 카드는 거북이가 보호하고 있어요.</p>` : ""}
  </div>`;
}

function decisionHtml(state) {
  const d = state.pendingDecision;
  if (!d) return "";
  switch (d.type) {
    case "monkey_choose_card":
      return decisionWrap(
        "🐵 원숭이 능력 — 입원실에서 데려올 카드를 고르세요",
        d.options.map((cid) => `<button class="mla-choice-btn" data-action="decide" data-value='${JSON.stringify(cid)}'>${cardLabel(cid)}</button>`).join("")
      );
    case "dog_choose_target":
      return decisionWrap(
        "🐶 강아지 능력 — 어느 병원의 어떤 종류를 귀가시킬까요?",
        d.options
          .map((opt) => {
            const opp = state.players.find((p) => p.playerId === opt.opponentId);
            return `<button class="mla-choice-btn" data-action="decide" data-value='${JSON.stringify(opt)}'>${esc(opp.displayName)}님의 ${esc(ANIMALS[opt.suit].name)}</button>`;
          })
          .join("")
      );
    case "cat_choose_target":
      return decisionWrap(
        "🐱 고양이 능력 — 어느 병원의 어떤 종류를 데려올까요?",
        d.options
          .map((opt) => {
            const opp = state.players.find((p) => p.playerId === opt.opponentId);
            return `<button class="mla-choice-btn" data-action="decide" data-value='${JSON.stringify(opt)}'>${esc(opp.displayName)}님의 ${esc(ANIMALS[opt.suit].name)}</button>`;
          })
          .join("")
      );
    case "mole_choose_card":
      return decisionWrap(
        "🦔 두더지 능력 — 귀가 더미에서 접수할 카드를 고르세요",
        `<div class="mla-row">${d.options.map((cid) => cardHtml(cid, { flip: true })).join("")}</div>` +
          d.options.map((cid) => `<button class="mla-choice-btn" data-action="decide" data-value='${JSON.stringify(cid)}'>${cardLabel(cid)} 접수하기</button>`).join("")
      );
    case "owl_choose": {
      const preview = d.previewCardIds.map((cid) => cardHtml(cid, { flip: true })).join("");
      const takeButtons = d.previewCardIds
        .map((cid) => `<button class="mla-choice-btn" data-action="decide" data-value='${JSON.stringify({ action: "take", cardId: cid })}'>${cardLabel(cid)} 접수하기</button>`)
        .join("");
      const bankButton = d.canBank
        ? `<button class="mla-choice-btn" data-action="decide" data-value='${JSON.stringify({ action: "bank" })}'>지금 진료 마치기</button>`
        : `<p class="mla-muted">토끼 강제 접수 중에는 지금 진료를 마칠 수 없어요.</p>`;
      return decisionWrap("🦉 부엉이 능력 — 다음 카드를 몰래 확인했어요", `<div class="mla-row">${preview}</div>${takeButtons}${bankButton}`);
    }
    default:
      return "";
  }
}

function decisionWrap(title, body) {
  return `<div class="mla-panel" style="border-color:var(--accent-strong)">
    <h3>${title}</h3>
    ${body}
  </div>`;
}

export function cardLabel(cardId) {
  const card = getCard(cardId);
  return `${ANIMALS[card.suit].icon} ${esc(ANIMALS[card.suit].name)} ${card.value}`;
}

// 대소동 발생 시 화면을 멈추고 어떤 카드 때문에 터졌는지 보여주는 전용 화면.
export function bustRevealHtml(state, bustEntry) {
  const player = state.players.find((p) => p.playerId === bustEntry.playerId);
  const protectedIds = bustEntry.protectedCardIds || [];
  const lostIds = bustEntry.lostCardIds || [];
  const orderedIds = [...protectedIds, ...lostIds];
  const cards = orderedIds
    .map((cid) =>
      cardHtml(cid, {
        protected: protectedIds.includes(cid),
        badge: cid === bustEntry.triggeringCardId ? "!" : "",
      })
    )
    .join("");
  return `<div class="mla-panel mla-center mla-bust-panel">
      <h2>😱 진료실 대소동!</h2>
      <p>${player.isAI ? "🤖 " : ""}${esc(player.displayName)}님의 진료 줄에 <b>${cardLabel(bustEntry.triggeringCardId)}</b>가 겹쳐서 대소동이 났어요!</p>
    </div>
    <div class="mla-panel">
      <div class="mla-row">${cards}</div>
      ${
        protectedIds.length
          ? `<p class="mla-muted">🛡️ 초록 테두리 = 거북이 등으로 보호되어 입원 · 나머지는 귀가 더미로</p>`
          : `<p class="mla-muted">이번엔 보호된 카드가 없어서 전부 귀가 더미로 갔어요.</p>`
      }
    </div>
    <button class="mla-choice-btn" data-action="dismiss-bust" style="text-align:center;font-weight:700;">계속하기</button>`;
}

export function gameBoardHtml(state) {
  const others = state.players.filter((p) => !p.isCurrentPlayer);
  const me = state.players.find((p) => p.isCurrentPlayer);
  return `
    ${statusBarHtml(state)}
    ${playAreaHtml(state)}
    ${decisionHtml(state)}
    <div class="mla-panel"><h3>입원실</h3>${playerPanelHtml(state, me)}${others.map((p) => playerPanelHtml(state, p)).join("")}</div>
  `;
}

export function gameOverHtml(state) {
  const ranked = state.players.slice().sort((a, b) => b.score - a.score);
  const winners = new Set(state.winnerIds);
  const rows = ranked
    .map((p) => {
      const isWinner = winners.has(p.playerId);
      return `<div class="mla-player-card ${isWinner ? "mla-current" : ""}">
        <div class="mla-player-head">
          <span>${isWinner ? "🏆 " : ""}${esc(p.displayName)}</span>
          <span class="mla-pill">${p.score}점</span>
        </div>
        <div class="mla-muted">보유 카드 ${totalHospitalCardCount(p)}장${p.traitId ? " · 특기: " + esc(TRAITS[p.traitId].name) : ""}</div>
        <div class="mla-row">${hospitalHtml(p, { showAll: false }) || '<span class="mla-muted">확보한 환자가 없어요</span>'}</div>
      </div>`;
    })
    .join("");
  const winnerNames = ranked.filter((p) => winners.has(p.playerId)).map((p) => p.displayName).join(", ");
  return `<div class="mla-panel mla-center">
      <h2>🎉 오늘의 진료 종료!</h2>
      <p>${state.winnerIds.length > 1 ? "공동 우승" : "우승"}: <b>${esc(winnerNames)}</b></p>
    </div>
    ${rows}
    <button class="mla-choice-btn" data-action="new-game" style="text-align:center;font-weight:700;margin-top:10px;">새 게임 시작</button>`;
}
