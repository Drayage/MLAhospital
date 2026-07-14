/*
 * gen-icons.js — 외부 의존성 없이(node 내장 zlib만) PWA용 PNG 아이콘 생성.
 *   node tools/gen-icons.js
 * 루트에 icon-512.png / icon-192.png / icon-180.png 출력.
 *
 * 우리집 동물병원 모티프: 게임의 시그니처 규칙인 "볼빵빵"(햄스터+아몬드 조합
 * 보너스)에서 따온, 한쪽 볼에 아몬드를 문 통통한 햄스터 얼굴 + 병원 십자가 태그.
 * 흔한 "귀여운 동물 얼굴" 아이콘과 구분되는 이 게임만의 개성 포인트.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT = path.join(__dirname, "..");
const SS = 3; // 슈퍼샘플링 (부드러운 가장자리)

// ── 디자인 (512×512 좌표계) ──────────────────────────────────────
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const BG_TOP = hex("#fff3e6"), BG_BOT = hex("#ff9257");    // 이전보다 채도 높인 배경 그라데이션
const FUR = hex("#f2b866"), FUR_DARK = hex("#d99640");     // 햄스터 얼굴/귀 (골든 계열)
const CHEEK = hex("#ffcf8f");                              // 볼록한 볼주머니 (얼굴보다 밝게)
const MUZZLE = hex("#fff8ef"), LINE = hex("#5b3a22");       // 주둥이 패치 / 선
const BLUSH = hex("#f7a3a0");
const ALMOND = hex("#caa06a"), ALMOND_LINE = hex("#8f6f43"); // 볼에 문 아몬드
const TAG = hex("#ffffff"), CROSS = hex("#ef8e8e");         // 병원 십자가 목걸이

const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
// "︶" 모양 아크: 원 테두리 중 아래쪽 각도 범위만 (스크린 좌표: y 아래로 증가)
function inArc(x, y, cx, cy, r, t, a0, a1) {
  const d = Math.hypot(x - cx, y - cy);
  if (Math.abs(d - r) > t) return false;
  const a = Math.atan2(y - cy, x - cx); // -PI..PI, 0=오른쪽, PI/2=아래
  return a >= a0 && a <= a1;
}
function inRoundedSquare(x, y, size, rad) {
  const cx = Math.min(Math.max(x, rad), size - rad);
  const cy = Math.min(Math.max(y, rad), size - rad);
  return (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad;
}
function inEllipse(x, y, cx, cy, rx, ry) {
  return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
}
function inRoundedRect(x, y, cx, cy, w, h, rad) {
  const hw = w / 2 - rad, hh = h / 2 - rad;
  const dx = Math.max(Math.abs(x - cx) - hw, 0);
  const dy = Math.max(Math.abs(y - cy) - hh, 0);
  return dx * dx + dy * dy <= rad * rad;
}
// 두 점을 잇는 두꺼운 선분 안쪽인지 (수염용)
function inSegment(x, y, x1, y1, x2, y2, t) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let u = len2 === 0 ? 0 : ((x - x1) * dx + (y - y1) * dy) / len2;
  u = Math.min(Math.max(u, 0), 1);
  const px = x1 + u * dx, py = y1 + u * dy;
  return Math.hypot(x - px, y - py) <= t;
}

// 반환: [r,g,b,a] — 한쪽 볼에 아몬드를 문 통통한 햄스터 + 병원 십자가 태그
function drawDesign(x, y) {
  if (!inRoundedSquare(x, y, 512, 110)) return [0, 0, 0, 0];
  let c = mix(BG_TOP, BG_BOT, y / 512); // 배경 그라데이션

  // 둥근 귀 (얼굴 뒤쪽에 먼저 그림)
  if (inCircle(x, y, 172, 150, 44)) c = FUR_DARK;
  if (inCircle(x, y, 340, 150, 44)) c = FUR_DARK;
  if (inCircle(x, y, 172, 150, 24)) c = CHEEK;
  if (inCircle(x, y, 340, 150, 24)) c = CHEEK;

  if (inCircle(x, y, 256, 272, 138)) c = FUR;                 // 얼굴

  // 양볼: 왼쪽은 살짝, 오른쪽은 아몬드를 물어 더 빵빵하게 (좌우 비대칭 = 개성 포인트)
  if (inEllipse(x, y, 122, 306, 62, 56)) c = CHEEK;
  if (inEllipse(x, y, 398, 312, 82, 74)) c = CHEEK;
  if (inCircle(x, y, 112, 320, 18)) c = BLUSH;
  if (inCircle(x, y, 400, 328, 20)) c = BLUSH;

  if (inEllipse(x, y, 256, 322, 90, 74)) c = MUZZLE;          // 주둥이 패치

  // 수염 (한쪽엔 짧게, 아몬드를 문 쪽엔 위로 살짝 들려서 표정에 생동감)
  if (inSegment(x, y, 196, 312, 78, 298, 3.5)) c = LINE;
  if (inSegment(x, y, 196, 322, 74, 322, 3.5)) c = LINE;
  if (inSegment(x, y, 196, 332, 78, 346, 3.5)) c = LINE;
  if (inSegment(x, y, 322, 300, 420, 270, 3.5)) c = LINE;
  if (inSegment(x, y, 322, 312, 424, 300, 3.5)) c = LINE;

  // 눈: 아몬드를 문 쪽(오른쪽)은 만족스러운 윙크, 반대쪽은 초롱초롱 뜬 눈 —
  // "몰래 간식을 물고 있다 들킨" 장난기 있는 표정이 이 캐릭터만의 개성이 된다.
  const A0 = Math.PI * 0.12, A1 = Math.PI * 0.88;             // "︶" 모양 윙크 각도 범위
  if (inCircle(x, y, 214, 262, 17)) c = LINE;                 // 뜬 눈
  if (inCircle(x, y, 208, 256, 6)) c = MUZZLE;                // 눈 하이라이트
  if (inArc(x, y, 298, 262, 20, 6, A0, A1)) c = LINE;         // 윙크
  if (inCircle(x, y, 256, 300, 11)) c = LINE;                 // 코
  if (inArc(x, y, 238, 328, 15, 4.5, A0, A1)) c = LINE;       // 입 (한쪽으로 살짝 무너진 미소)
  if (inArc(x, y, 270, 324, 13, 4, A0, A1)) c = LINE;

  // 오른쪽 볼에 문 아몬드 — 이 게임의 시그니처 "볼빵빵" 조합을 상징, 입가에 걸쳐 살짝 삐져나오게
  if (inEllipse(x, y, 372, 332, 28, 18)) c = ALMOND;
  if (inRoundedRect(x, y, 372, 332, 3, 28, 1.5)) c = ALMOND_LINE;
  if (inCircle(x, y, 364, 326, 4)) c = MUZZLE;                // 아몬드 하이라이트

  // 병원 십자가 목걸이 (동그란 흰 태그 + 빨간 십자)
  if (inCircle(x, y, 256, 436, 42)) c = TAG;
  if (inRoundedRect(x, y, 256, 436, 42, 15, 4)) c = CROSS;
  if (inRoundedRect(x, y, 256, 436, 15, 42, 4)) c = CROSS;

  return [c[0], c[1], c[2], 255];
}

// ── PNG 인코딩 (RGBA, 필터 0, zlib) ──────────────────────────────
const crcTable = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function pngFromRGBA(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // 필터 없음
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── 래스터화: 슈퍼샘플링으로 디자인을 각 크기로 ─────────────────────
function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const scale = 512 / size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [cr, cg, cb, ca] = drawDesign(
            (px + (sx + 0.5) / SS) * scale,
            (py + (sy + 0.5) / SS) * scale
          );
          r += cr; g += cg; b += cb; a += ca;
        }
      }
      const n = SS * SS, i = (py * size + px) * 4;
      rgba[i] = r / n; rgba[i + 1] = g / n; rgba[i + 2] = b / n; rgba[i + 3] = a / n;
    }
  }
  return pngFromRGBA(size, size, rgba);
}

for (const size of [512, 192, 180]) {
  const file = path.join(OUT, `icon-${size}.png`);
  fs.writeFileSync(file, render(size));
  console.log("생성:", file);
}
