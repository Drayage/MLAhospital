/*
 * gen-icons.js — 외부 의존성 없이(node 내장 zlib만) PWA용 PNG 아이콘 생성.
 *   node tools/gen-icons.js
 * 루트에 icon-512.png / icon-192.png / icon-180.png 출력.
 *
 * 우리집 동물병원 모티프: 행복한 강아지 얼굴 + 작은 병원 십자가 목걸이.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT = path.join(__dirname, "..");
const SS = 3; // 슈퍼샘플링 (부드러운 가장자리)

// ── 디자인 (512×512 좌표계) ──────────────────────────────────────
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const BG_TOP = hex("#fff3e6"), BG_BOT = hex("#ffb37a");   // 사이트 테마와 맞춘 배경 그라데이션
const FUR = hex("#f0b27a"), FUR_DARK = hex("#d98c4a");    // 강아지 얼굴/귀
const CREAM = hex("#fff8ef"), LINE = hex("#6b4226");      // 얼굴 안쪽/선
const BLUSH = hex("#f7a8a0");
const TAG = hex("#ffffff"), CROSS = hex("#ef8e8e");       // 병원 십자가 목걸이

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

// 반환: [r,g,b,a] — 행복한 강아지 얼굴 + 병원 십자가 목걸이
function drawDesign(x, y) {
  if (!inRoundedSquare(x, y, 512, 110)) return [0, 0, 0, 0];
  let c = mix(BG_TOP, BG_BOT, y / 512); // 배경 그라데이션

  // 늘어진 귀 (타원, 얼굴 뒤쪽에 먼저 그림)
  if (inEllipse(x, y, 128, 220, 56, 92)) c = FUR_DARK;
  if (inEllipse(x, y, 384, 220, 56, 92)) c = FUR_DARK;

  if (inCircle(x, y, 256, 262, 150)) c = FUR;                // 얼굴
  if (inCircle(x, y, 256, 296, 104)) c = CREAM;              // 주둥이 안쪽
  if (inCircle(x, y, 158, 300, 26)) c = BLUSH;               // 볼터치
  if (inCircle(x, y, 354, 300, 26)) c = BLUSH;

  const A0 = Math.PI * 0.12, A1 = Math.PI * 0.88;            // "︶" 각도 범위 (행복한 눈)
  if (inArc(x, y, 196, 232, 22, 7, A0, A1)) c = LINE;
  if (inArc(x, y, 316, 232, 22, 7, A0, A1)) c = LINE;
  if (inCircle(x, y, 256, 300, 12)) c = LINE;                // 코
  if (inArc(x, y, 236, 322, 16, 5, A0, A1)) c = LINE;        // 입 (양쪽 스마일)
  if (inArc(x, y, 276, 322, 16, 5, A0, A1)) c = LINE;

  // 병원 십자가 목걸이 (동그란 흰 태그 + 빨간 십자)
  if (inCircle(x, y, 256, 430, 44)) c = TAG;
  if (inRoundedRect(x, y, 256, 430, 44, 16, 4)) c = CROSS;
  if (inRoundedRect(x, y, 256, 430, 16, 44, 4)) c = CROSS;

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
