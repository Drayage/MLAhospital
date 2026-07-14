/*
 * gen-icons.js — 외부 의존성 없이(node 내장 zlib만) PWA용 PNG 아이콘 생성.
 *   node tools/gen-icons.js
 * 루트에 icon-512.png / icon-192.png / icon-180.png 출력.
 *
 * 우리집 동물병원 모티프: "카드 게임"과 "동물병원"이라는 두 특징을 한 도상으로
 * 압축 — 카드 한 장 위에 발바닥(동물) + 십자가(병원)만 남긴 간소한 플랫 디자인.
 * 작은 크기(파비콘/홈화면)에서도 실루엣만으로 바로 읽히는 것을 최우선으로 함.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT = path.join(__dirname, "..");
const SS = 3; // 슈퍼샘플링 (부드러운 가장자리)

// ── 디자인 (512×512 좌표계) ──────────────────────────────────────
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const BG_TOP = hex("#ffddb0"), BG_BOT = hex("#ff9257");   // 배경 그라데이션 (사이트 테마)
const CARD_BORDER = hex("#e2823f");                       // 카드 테두리 (브랜드 포인트 컬러)
const CARD_FACE = hex("#fffaf3");                         // 카드 앞면
const PAW = hex("#6b4226");                                // 발바닥 (동물)
const CROSS = hex("#ef6a6a");                               // 십자가 (병원)

const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
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

// 반환: [r,g,b,a] — 카드 한 장 + 발바닥(동물) + 십자가(병원), 딱 세 요소로 압축한 디자인
function drawDesign(x, y) {
  if (!inRoundedSquare(x, y, 512, 110)) return [0, 0, 0, 0];
  let c = mix(BG_TOP, BG_BOT, y / 512); // 배경 그라데이션

  // 카드 한 장 (테두리 + 흰 앞면) — "카드 게임"임을 한눈에 보여준다
  if (inRoundedRect(x, y, 256, 262, 320, 400, 40)) c = CARD_BORDER;
  if (inRoundedRect(x, y, 256, 262, 288, 368, 30)) c = CARD_FACE;

  // 카드 위 발바닥 — 큰 발볼 + 발가락 4개, 군더더기 없는 실루엣
  if (inEllipse(x, y, 256, 318, 92, 78)) c = PAW;
  if (inCircle(x, y, 172, 210, 38)) c = PAW;
  if (inCircle(x, y, 222, 168, 42)) c = PAW;
  if (inCircle(x, y, 290, 168, 42)) c = PAW;
  if (inCircle(x, y, 340, 210, 38)) c = PAW;

  // 십자가 — 카드 하단에 살짝 겹쳐 "병원"임을 더한다
  if (inRoundedRect(x, y, 256, 428, 20, 68, 6)) c = CROSS;
  if (inRoundedRect(x, y, 256, 428, 68, 20, 6)) c = CROSS;

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
