// 오디오 엔진 — 팔레트(음색·곡)와 분리된 공용 배관.
// 게임마다 다른 소리를 내려면 palettes.js에 게임 전용 팔레트를 만들 것 (엔진은 그대로).
// 포함된 교훈: iOS 첫 제스처 잠금해제, 볼륨 localStorage 저장,
// 크로스페이드 재진입 버그 수정(battleblock: current를 페이드 "시작 전에" 갱신).
import { APP_ID } from "./app-config.js";

let ctx = null, master, bgmBus, sfxBus;
const VOLKEY = APP_ID + "_vol";

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    bgmBus = ctx.createGain();
    sfxBus = ctx.createGain();
    bgmBus.connect(master);
    sfxBus.connect(master);
    master.connect(ctx.destination);
    const vol = loadVolumes();
    bgmBus.gain.value = vol.bgm;
    sfxBus.gain.value = vol.sfx;
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// iOS: 첫 사용자 제스처에서 AudioContext 잠금 해제 — 앱 시작 시 1회 호출
export function initAudio() {
  const unlock = () => ensureCtx();
  document.addEventListener("pointerdown", unlock, { once: true });
  document.addEventListener("keydown", unlock, { once: true });
}

function loadVolumes() {
  try {
    return { bgm: 0.5, sfx: 0.8, ...JSON.parse(localStorage.getItem(VOLKEY) || "{}") };
  } catch (e) {
    return { bgm: 0.5, sfx: 0.8 };
  }
}
export function setVolume(kind, v) {
  ensureCtx();
  (kind === "bgm" ? bgmBus : sfxBus).gain.value = v;
  const vol = loadVolumes();
  vol[kind] = v;
  localStorage.setItem(VOLKEY, JSON.stringify(vol));
}
export const getVolumes = loadVolumes;

// ── SFX: 팔레트의 선언적 레이어를 해석해 재생 ──────────────────────
// layer 종류:
//  {t:"tone", wave, freq, freqEnd?, dur, gain?, attack?, lp?}   — 오실레이터
//  {t:"noise", dur, gain?, lp?, hp?}                            — 노이즈(타격·바람)
export function playSfx(palette, name) {
  const layers = palette.sfx[name];
  if (!layers) return;
  const c = ensureCtx();
  const t0 = c.currentTime + 0.01;
  for (const l of layers) playLayer(c, l, t0, sfxBus);
}

function playLayer(c, l, t0, dest, when = 0) {
  const t = t0 + when;
  const g = c.createGain();
  const peak = l.gain ?? 0.5;
  const attack = l.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + l.dur);
  let head = g;
  if (l.lp) head = insertFilter(c, "lowpass", l.lp, g);
  if (l.hp) head = insertFilter(c, "highpass", l.hp, head);
  head.connect(dest);

  let src;
  if (l.t === "noise") {
    src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
  } else {
    src = c.createOscillator();
    src.type = l.wave || "sine";
    src.frequency.setValueAtTime(l.freq, t);
    if (l.freqEnd) src.frequency.exponentialRampToValueAtTime(l.freqEnd, t + l.dur);
  }
  src.connect(g);
  src.start(t);
  src.stop(t + l.dur + 0.05);
}

function insertFilter(c, type, freq, node) {
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  node.connect(f);
  return f;
}

let _noise = null;
function noiseBuffer(c) {
  if (!_noise) {
    _noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = _noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return _noise;
}

// ── BGM: 룩어헤드 스케줄러 + 크로스페이드 ─────────────────────────
// track: {tempo, loopBeats, notes:[[beat, freq, durBeats, layerOverride?], ...], inst:{...layer기본값}}
const bgm = { timer: 0, current: null, gain: null, beat: 0, nextTime: 0 };

export function startBgm(palette, name = "main", fade = 0.8) {
  const track = palette.bgm?.[name];
  if (!track) return;
  const c = ensureCtx();
  // ★ 재진입 버그 방지: 페이드를 걸기 "전에" current를 갱신한다.
  //   (페이드 중 current가 옛 값이면 인텐시티 전환 로직이 매 프레임 재시작을 유발)
  if (bgm.current && bgm.current.track === track) return; // 이미 재생 중
  const oldGain = bgm.gain;
  bgm.current = { palette, name, track };
  bgm.gain = c.createGain();
  bgm.gain.gain.setValueAtTime(0.0001, c.currentTime);
  bgm.gain.gain.exponentialRampToValueAtTime(1, c.currentTime + fade);
  bgm.gain.connect(bgmBus);
  if (oldGain) fadeOutAndDisconnect(c, oldGain, fade);
  bgm.beat = 0;
  bgm.nextTime = c.currentTime + 0.05;
  clearInterval(bgm.timer);
  bgm.timer = setInterval(scheduleAhead, 100);
}

export function stopBgm(fade = 0.5) {
  clearInterval(bgm.timer);
  bgm.timer = 0;
  bgm.current = null;
  if (bgm.gain && ctx) fadeOutAndDisconnect(ctx, bgm.gain, fade);
  bgm.gain = null;
}

function fadeOutAndDisconnect(c, gainNode, fade) {
  gainNode.gain.setValueAtTime(gainNode.gain.value, c.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + fade);
  setTimeout(() => gainNode.disconnect(), fade * 1000 + 100);
}

function scheduleAhead() {
  if (!bgm.current || !ctx) return;
  const { track } = bgm.current;
  const spb = 60 / track.tempo; // seconds per beat
  while (bgm.nextTime < ctx.currentTime + 0.35) {
    const loopBeat = bgm.beat % track.loopBeats;
    for (const [beat, freq, durBeats, over] of track.notes) {
      if (beat === loopBeat) {
        playLayer(
          ctx,
          { t: "tone", freq, dur: durBeats * spb, ...track.inst, ...(over || {}) },
          bgm.nextTime,
          bgm.gain
        );
      }
    }
    bgm.beat++;
    bgm.nextTime += spb;
  }
}
