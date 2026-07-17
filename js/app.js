// 최상위 진입점 — 어떤 게임(우리집 동물병원 / 번호표 뽑기)을 할지 고른다.
// 진행 중인 저장 게임이 있으면 그 게임으로 곧장 들어가고, 없으면 선택 화면을 보여준다.
// 로컬 hotseat만 즐기는 사람은 온라인 관련 모듈(js/net.js 등)에 전혀 의존하지 않도록,
// 실제로 선택된 게임의 컨트롤러만 동적 import한다.
import { loadGame, loadRejoin } from "./storage.js";
import { loadFlip7Game } from "./flip7/storage.js";

const gameArea = () => document.getElementById("game-area");

export async function startApp() {
  // 어느 화면에서든(각 게임의 "← 게임 선택으로" 버튼) 눌리면 그냥 새로고침 —
  // 진행 중인 저장 게임이 없는 시점에만 노출되는 버튼이라 안전하다.
  document.addEventListener("click", (e) => {
    if (e.target.closest('[data-action="back-to-game-choice"]')) location.reload();
  });

  const hospitalSave = loadGame();
  if ((hospitalSave && hospitalSave.phase && hospitalSave.phase !== "game_over") || loadRejoin()) {
    const { startApp: startHospital } = await import("./ui.js");
    return startHospital();
  }
  const flip7Save = loadFlip7Game();
  if (flip7Save && flip7Save.phase && flip7Save.phase !== "game_over") {
    const { startApp: startFlip7 } = await import("./flip7/ui.js");
    return startFlip7();
  }
  renderChooser();
}

function renderChooser() {
  gameArea().innerHTML = `
    <div class="mla-panel mla-center">
      <h1 style="font-size:22px">어떤 게임을 할까요?</h1>
    </div>
    <button type="button" class="mla-choice-btn" data-action="choose-hospital" style="padding:16px; font-weight:700;">🏥 우리집 동물병원<br><span class="mla-muted" style="font-weight:400">환자 카드를 접수하는 푸시 유어 럭 게임</span></button>
    <button type="button" class="mla-choice-btn" data-action="choose-flip7" style="padding:16px; font-weight:700; margin-top:10px;">🎫 번호표 뽑기<br><span class="mla-muted" style="font-weight:400">서로 다른 번호 7개를 모으는 푸시 유어 럭 게임 (원작: Flip Seven)</span></button>`;

  document.getElementById("action-bar-primary").innerHTML = "";
  document.getElementById("surrender-btn").hidden = true;

  gameArea().querySelector('[data-action="choose-hospital"]').addEventListener("click", async () => {
    const { startApp: startHospital } = await import("./ui.js");
    startHospital();
  });
  gameArea().querySelector('[data-action="choose-flip7"]').addEventListener("click", async () => {
    const { startApp: startFlip7 } = await import("./flip7/ui.js");
    startFlip7();
  });
}
