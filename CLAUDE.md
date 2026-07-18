# 우리집 동물병원 — 카드 게임 2종을 담은 PWA

바닐라 JS / PWA / GitHub Pages 배포. **게임이 2개** 들어있다 — `js/app.js`가 최상위
진입점으로 둘 중 무엇을 할지 고르게 한다(진행 중 저장 게임이 있으면 그 게임으로 곧장 재입장):

1. **우리집 동물병원** — Dead Man's Draw 규칙 기반. 로컬 한 기기 돌려가며 플레이(hotseat,
   2~4명) + 온라인(각자 기기, Firebase RTDB).
2. **번호표 뽑기** — Flip Seven 규칙 기반(원작 그대로). 로컬 hotseat(2~6명) + AI. 온라인
   멀티플레이는 아직 없음(범위 밖으로 명시적으로 제외).

두 게임은 완전히 독립된 엔진/UI/저장 슬롯을 쓴다(아래 파일 지도 참조) — 하나를 고치다가
다른 하나를 건드릴 일이 구조적으로 없다.

## 파일 지도

<!-- 파일당 500~800줄 이내로 유지. 데이터(카드/특기/변형규칙)는 로직과 분리해
     js/data/*.js에 둘 것 — 콘텐츠 수정 요청이 데이터 파일만 읽고 끝나게. -->
- `js/app.js` — **최상위 진입점**(index.html이 이걸 불러 startApp() 호출). 두 게임 중
  저장된 진행 중 게임이 있으면 그 컨트롤러로 바로 들어가고, 없으면 게임 선택 화면을
  보여준다. 실제 선택된 게임의 `ui.js`만 동적 `import()`한다.

### 우리집 동물병원 (Dead Man's Draw 기반)
- `js/data/animals.js` — 환자(동물) 10종 정의 (이름/아이콘/설명) — **콘텐츠 수정은 여기**
- `js/data/cards.js` — 카드 60장 생성/조회 (`deckMultiplier`로 카드 2배 확장 — 파티 모드가 씀)
- `js/data/traits.js` — 수의사 특기 17종 (효과 훅 포함)
- `js/data/variants.js` — 오늘의 병원 규칙 6종 (효과 훅 포함)
- `js/engine/state.js` — 게임 상태 생성/설정 (명세 5장)
- `js/engine/queue.js` — 카드 공개 처리 순서 (추가→중복확인→능력→연쇄), 이벤트 큐
- `js/engine/abilities.js` — 동물별 능력 (거북이/원숭이/강아지/두더지/부엉이/고양이/토끼 등)
- `js/engine/bust.js` — 진료실 대소동 처리
- `js/engine/bank.js` — 진료 마치기(뱅킹) + 볼빵빵 햄스터 조합
- `js/engine/turn.js` — 턴 종료/전환, 즉사 변형 체크
- `js/engine/scoring.js` — 점수 계산/승자 결정 (동점 처리 포함)
- `js/engine/actions.js` — 공개 행동 API: `getLegalActions(state)` / `applyAction(state, action)`
- `js/engine.js` — 위 엔진 모듈들의 배럴 (UI·시뮬레이터가 쓰는 단일 진입점)
- `js/ui.js` — 컨트롤러 (이벤트 위임, 엔진 호출, 저장/사운드 트리거, AI 턴 자동 진행) — 규칙 로직 없음
- `js/ui/render.js` — 순수 렌더 함수 (상태 → HTML 문자열), 대소동 리빌 화면·카드 플립 포함
- `js/ai.js` — AI 상대 정책 (`getLegalActions`가 만든 선택지 중에서만 고름, 규칙 로직 없음)
- `js/palettes.js` — 사운드 팔레트 (`HOSPITAL`: 말랑 파스텔 + 병원 종소리)
- `js/storage.js` — 새로고침 복원 + 온라인 재입장 정보(`saveRejoin`/`loadRejoin`)
- `js/net.js` — Firebase RTDB 원시 I/O (방 생성/참가/seq 가드 쓰기/구독) — `js/ui.js`에서
  실제 온라인 플레이를 시도할 때만 동적 `import()`되어, 로컬 hotseat만 쓰는 사람은
  네트워크(gstatic.com 등)에 전혀 의존하지 않는다
- `js/online.js` — 온라인 오케스트레이션(좌석 배정/내 차례 판정/행동 전송) — DOM은 모름,
  `js/net.js`처럼 순수 데이터 계층
- `sw.js` — PWA 캐시 (network-first + CACHE_VERSION + controllerchange 1회 reload,
  두 게임 파일을 모두 PRECACHE에 올린다)
- `tests/engine.test.mjs` — `node:test` 기반 엔진 필수 테스트 (명세 22장 25개 케이스)
- `scripts/simulate.mjs` — headless 시뮬레이터 (랜덤 정책, 교착 감지)

### 번호표 뽑기 (Flip Seven 기반) — `js/flip7/`

동물병원 엔진과 턴 구조 자체가 달라(한 라운드 안에서 전원이 순서대로 딱 한 장씩만 뽑고
넘기는 라운드로빈 — 계속 뽑으려면 자기 차례가 다시 와야 한다) 완전히 독립된 엔진으로
분리했다. 시드 RNG(`js/engine/rng.js`)만 그대로 재사용한다(state에 seed/rngCounter만
요구하는 범용 유틸이라 게임 간 공유해도 안전).

- `js/flip7/cards.js` — 94장 덱 구성(번호표 0~12 + 보너스/특수권), `getCard`는 카드 ID에서
  직접 파싱(고정 풀 조회 방식이 아님 — 동물병원 `getCard`가 겪었던 deckMultiplier 버그를
  같은 함정에 안 빠지려고 처음부터 피함), `cardDisplay`로 병원 접수 테마 아이콘/라벨 제공,
  `numberColor`로 숫자마다 다른 색(0~12 고른 간격 hue) 부여, `ACTION_DESCRIPTIONS`로
  특수권 카드가 열릴 때 보여줄 능력 설명 텍스트 제공
- `js/flip7/state.js` — `createFlip7Game`, `isActive`/`activePlayers` 등 조회 헬퍼
- `js/flip7/engine.js` — 규칙 엔진 본체. `currentPlayerIndex`는 항상 "지금 결정을 내리는
  사람". 한 턴엔 카드 한 장만 뽑는다 — `finishHit`이 HIT 처리 끝에 매번 불려서, 강제
  접수(`forcedHitsLeft`)가 남아있지 않으면 곧장 다음 활성 플레이어에게 순서를 넘긴다(이
  원칙이 있어야 응급 호출의 "강제 3연속"이 실제로 의미를 가짐). 응급 호출(flip_three)로
  남에게 순서를 강제로 넘기면 원래 자리를 `state.resumeStack`에 쌓아두고, 그 사람의 강제
  3번이 다 끝나면(원작 룰 문서로 100% 확증 못한 지점 — `applyActionTarget` 주석 참고)
  `resumeOrAdvance`가 스택을 되짚어 원래 순서로 복귀한다(재귀 대신 스택 — 응급 호출이
  응급 호출을 부르는 중첩도 자연 처리). 자기 자신을 조기 마감권으로 얼리면 강제 접수
  잔여분과 무관하게 무조건 그 자리에서 끝난다(`finishHit`을 거치지 않고 직접
  `resumeOrAdvance`) — 안 그러면 얼어붙은(비활성) 사람이 `currentPlayerIndex`에 계속
  남아있는 채로 멈추는 실제 교착 버그가 났던 지점이다.
- `js/flip7/actions.js` — 공개 행동 API: `getLegalActions(state)` / `applyAction(state, action)`
  (`HIT`/`STAY`/`DECIDE`/`CONTINUE`) — 동물병원과 동일한 설계
- `js/flip7/ai.js` — `chooseFlip7AiAction(state)`: 카드 카운팅(공개된 남의 접수대 + 귀가
  더미로 "이미 나온 장수"를 빼서) 기반 버스트 확률 추정으로 HIT/STAY 판단, 조기 마감권/
  응급 호출/재접수권 대상도 위험도 기반으로 고름
- `js/flip7/render.js` — 순수 렌더 함수. `flipCardHtml`은 동물병원과 같은
  `.mla-flip-outer`/`.mla-flip-inner` 3D 뒤집기 CSS 클래스를 재사용한다. 리빌은 별도
  화면이 아니라 `flip7BoardHtml(state, {reveal})`이 그 플레이어의 카드 줄 안에서
  카드를 뒤집고 바로 밑에 한 줄 메시지를 보여주는 방식(팝업 없음) — 보드 나머지
  (헤더/다른 플레이어/그만두기 링크)는 그대로 다 보인다
- `js/flip7/ui.js` — 컨트롤러 (규칙 로직 없음, 동물병원 `js/ui.js`와 같은 이벤트 위임
  패턴) — 온라인 없음, `#action-bar-primary`/`#surrender-btn` 등 index.html의 공용 DOM을
  동물병원 컨트롤러와 공유하지만 한 페이지 로드당 둘 중 하나만 로드되므로 리스너 충돌 없음.
  `pendingReveal`이 동물병원의 `pendingBust`와 같은 역할 — HIT마다 `commitAction`이
  로그 diff로 무슨 일이 있었는지 판단해 리빌 단계를 연다: 평범한 번호표/보너스는 짧게(뒤집는
  연출만), 중복(버스트)/7종 완성/특수권 카드(능력 설명 포함)는 길게(탭 또는 자동 타이머로 진행)
  머문다. 리빌 중엔 다른 행동을 막고, 타이머(`aiTimer`/`roundTimer`/`revealTimer`)는
  그만두기·새 게임 전환마다 반드시 정리한다(정리 누락으로 null 상태를 건드리는 실제 버그가
  났던 지점)
- `js/flip7/storage.js` — 새로고침 복원(동물병원과 저장 슬롯 분리 — `mlahospital_flip7_save`)
- `tests/flip7.test.mjs` — `node:test` 기반 규칙 테스트(덱 구성/버스트/세컨찬스/조기
  마감권/응급 호출 중첩·복귀/점수 계산/200점 동점 재대결 등)
- `scripts/simulate-flip7.mjs` — headless 시뮬레이터 (랜덤 정책, 교착 감지)

## 명령어

- 로컬 서버: `python3 -m http.server`
- 테스트: `node --test tests/engine.test.mjs tests/flip7.test.mjs`
- 시뮬(동물병원): `node scripts/simulate.mjs [판수]`
- 시뮬(번호표 뽑기): `node scripts/simulate-flip7.mjs [판수]`
- 아이콘 재생성: `node tools/gen-icons.js`

## 게임 규칙 요약

원작 Dead Man's Draw의 "같은 종류 카드가 다시 나오면 대소동" 푸시 유어 럭 구조를
동물병원 접수 테마로 재구성. 10종 동물(거북이/원숭이/강아지/햄스터/아몬드/두더지/
부엉이/고양이/공작/토끼) × 6장(공작은 4~9, 나머지는 2~7) = 60장.
전체 명세는 이 프로젝트를 만들 때 사용자가 제공한 스펙 문서 기준 (README 없음,
명세는 대화 로그 참조 — 규칙 상세는 `js/data/*.js`와 `js/engine/*.js`의 주석/구조가
곧 스펙 요약이다).

## 엔진 설계 원칙

- 카드가 진료 줄에 들어올 때마다: 추가 → 중복 확인 → (중복이면 대소동, 아니면 능력 발동)
  → 능력이 새 카드를 추가하면 다시 같은 처리. 재귀 대신 `state.effectQueue`
  이벤트 큐로 처리한다 (`js/engine/queue.js`의 `runQueue`).
- 플레이어 입력이 필요한 시점(원숭이/강아지/두더지/부엉이/고양이 선택, 특기/변형규칙
  선택)은 `state.pendingDecision`에 담아 큐 처리를 멈추고, `applyAction`의
  `DECIDE` 액션으로 재개한다. 옵션이 1개뿐이면 자동 실행(불필요한 탭 제거).
- 수의사 특기/오늘의 병원 규칙은 기본 엔진 함수를 고쳐 쓰지 않고, 정해진 확장
  지점(예: `traitEffect(player, "dogDestination")`, `variant.bustDestination`)을
  엔진이 명시적으로 조회하는 방식으로 얹는다. 새 특기/규칙을 추가할 때 엔진 코드를
  건드릴 필요가 없어야 한다.
- 무작위성은 전부 `state.seed` + `state.rngCounter` 기반 시드 RNG(`js/engine/rng.js`)를
  통과한다 — `Math.random()` 직접 호출 금지. 이래야 상태가 완전히 직렬화 가능하고
  (미래 온라인 동기화 대비) 시뮬/테스트가 재현 가능하다.
- 엔진(js/engine*, js/data*)은 DOM을 전혀 모른다. `js/ui.js`만 DOM을 만진다.
- 대소동은 `applyAction` 안에서 `actionLog`에 `type:"bust"` 항목으로 즉시 기록된다. UI는 이 로그
  항목으로 "화면을 멈추고" 어떤 카드 때문에 터졌는지 보여준 뒤(`bustRevealHtml`, 탭 또는 자동
  타이머로 진행) 다음 상태를 렌더한다 — 엔진 자체는 절대 멈추지 않고 동기적으로 끝까지 처리한다.
- AI 플레이어는 `js/ai.js`의 `chooseAiAction(state)`가 `getLegalActions`의 결과 중에서만 고르고,
  `js/ui.js`가 사람의 클릭과 동일한 `applyAction` 경로(`commitAction`)로 적용한다. 새 특기/변형규칙을
  추가해도 AI가 자동으로 그 규칙이 만든 선택지를 인식한다(엔진이 만든 옵션만 보므로).

## 규칙 (스타터 킷 공통)

- 처음부터 포함: 상대경로, network-first SW, 새로고침 복원, PWA 매니페스트
  (나중에 얹으면 매번 같은 버그가 났다 — game-baserule 저장소 참조)
- 게임 로직/턴 흐름을 수정하면 그 게임의 `node --test`(`tests/engine.test.mjs` 또는
  `tests/flip7.test.mjs`)와 headless 시뮬레이터(교착 0)를 통과시키는 것을 기준으로 삼는다.
- UI 문자열/새 CSS 클래스는 `mla-` 프리픽스로 구체적 이름 사용 (일반명 충돌 전례)
- 코드를 고친 커밋마다 `js/app-config.js`의 `APP_VERSION`과 `sw.js`의
  `CACHE_VERSION`을 함께 bump할 것
- 커밋 전 검증·SW·모바일 레이아웃: `game-kit` 플러그인의 `webgame-ship` 스킬 참조
  (온라인 멀티플레이(`js/net.js`/`js/online.js`) 관련 작업은 `firebase-online` 스킬도 참조)

## 온라인 멀티플레이

`game-baserule/starter/js/net.js`를 이식해 구현됨 (`js/net.js`). 핵심 설계:

- DB 경로는 항상 `games/mlahospital/rooms/{code}` 아래로만 쓴다. 이 Firebase
  프로젝트는 여러 게임이 공유하고, 실제 배포된 규칙(`{"games": {".read": true,
  ".write": true}}`)이 "games" 서브트리만 열어두므로 **절대 이 경로 밖에 쓰면
  안 된다** — 원본 game-baserule의 기본 경로(`${APP_ID}_rooms/`)와 다르다는 점에 주의.
- 온라인 게임은 사람 + AI 좌석을 함께 지원한다. AI 좌석은 호스트가 로비에서
  추가/제거하며(`online.addAiPlayer`/`removePlayer`), 실제 턴 계산은 **호스트의
  클라이언트만** 담당한다(`js/ui.js`의 `scheduleAiIfNeeded`가 `online.isHost(room)`로
  확인) — 여러 접속자가 같은 AI 행동을 동시에 중복 전송하는 걸 막는 가장 단순한
  방법이지만, 호스트가 자리를 비우면 그 사이엔 AI 턴이 멈춘다는 트레이드오프가 있다.
- 방 생성/참가 → 로비(`phase:"lobby"`, 호스트가 특기/변형규칙/특수모드/AI 좌석 설정) →
  호스트가 시작을 누르면 참가 순서(`joinedAt`)대로 좌석을 배정해 로컬
  `createGame()`으로 실제 엔진 state를 만들고(`aiFlags`는 각 참가자의 `isAI`를 그대로
  전달) 각 플레이어에 `netId`를 붙여 방에 씀(`phase:"playing"`).
- 턴마다: 내 차례인 클라이언트만 `applyAction`을 로컬로 계산해
  `writeState(code, seq, nextState)`로 seq 가드 쓰기 — 모든 클라이언트(행동을
  낸 사람 포함)는 `subscribeRoom`이 돌려주는 서버 확정 상태만 그린다(낙관적
  렌더 금지). RNG가 `state.seed`+`state.rngCounter` 기반 결정적 연산이라
  아무 클라이언트나 계산해도 같은 결과가 나온다.
- `js/ui.js`는 로컬/온라인 두 경로가 `game`(현재 렌더 중인 엔진 state)을 공유하도록
  설계되어 있다 — 온라인이면 `game`이 구독으로 받은 서버 상태의 미러일 뿐이라,
  `gameBoardHtml` 등 렌더 함수와 대소동/왕관/카드-연쇄 연출 로직을 그대로 재사용한다.
- Firebase config는 비밀이 아니라 `js/app-config.js`에 그대로 커밋되어 있다
  (보안은 database rules가 담당). **새 프로젝트를 만들지 말고** 항상 이 값을
  재사용할 것 — 다른 게임들과 프로젝트를 공유하기 때문.
