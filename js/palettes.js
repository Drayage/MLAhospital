// 우리집 동물병원 전용 사운드 팔레트.
// 정체성: "말랑 파스텔" + "따뜻한 병원 종소리". 금속성/날카로운 고역 금지, 부드러운 어택 위주.
// 확인(confirm) 계열은 접수처의 작은 안내벨(딩동) 느낌을 낸다.
export const HOSPITAL = {
  name: "우리집 동물병원 (말랑 파스텔 + 병원 종소리)",
  sfx: {
    // 탭: 말랑한 젤리를 살짝 누르는 느낌의 짧고 둥근 블립
    tap: [{ t: "tone", wave: "triangle", freq: 480, freqEnd: 560, dur: 0.08, gain: 0.35, attack: 0.015, lp: 2200 }],

    // 확인/접수: 접수처 안내벨 — 완전4도 두 음이 살짝 겹치며 울리는 "딩동"
    confirm: [
      { t: "tone", wave: "sine", freq: 587, dur: 0.22, gain: 0.4, attack: 0.008, lp: 3200 },
      { t: "tone", wave: "sine", freq: 784, dur: 0.28, gain: 0.32, attack: 0.07, lp: 3200 },
      { t: "tone", wave: "triangle", freq: 1174, dur: 0.16, gain: 0.08, attack: 0.09, lp: 3600 },
    ],

    // 대소동(오류): 놀란 듯 둔탁하게 가라앉는 두 음 — 날카롭지 않게 로우패스를 낮게
    error: [
      { t: "tone", wave: "triangle", freq: 300, freqEnd: 210, dur: 0.16, gain: 0.32, attack: 0.01, lp: 1100 },
      { t: "tone", wave: "sine", freq: 220, freqEnd: 140, dur: 0.26, gain: 0.3, attack: 0.05, lp: 900 },
    ],

    // 승리: 밝고 따뜻한 4음 아르페지오 + 마지막 종소리 잔향
    win: [
      { t: "tone", wave: "triangle", freq: 523, dur: 0.16, gain: 0.32, attack: 0.01, lp: 2800 },
      { t: "tone", wave: "triangle", freq: 659, dur: 0.16, gain: 0.32, attack: 0.14, lp: 2800 },
      { t: "tone", wave: "triangle", freq: 784, dur: 0.2, gain: 0.32, attack: 0.28, lp: 2800 },
      { t: "tone", wave: "sine", freq: 1047, dur: 0.6, gain: 0.28, attack: 0.44, lp: 3200 },
      { t: "tone", wave: "sine", freq: 1568, dur: 0.5, gain: 0.12, attack: 0.46, lp: 3600 },
    ],
  },
  bgm: {
    main: {
      tempo: 84,
      loopBeats: 16,
      inst: { wave: "triangle", gain: 0.18, attack: 0.04, lp: 1800 },
      // 따뜻하고 느긋한 대기실 멜로디 (장조, 잔잔한 도약 없이 스텝 위주)
      notes: [
        [0, 349, 1.5], [1.5, 392, 0.5], [2, 440, 1], [3, 392, 1],
        [4, 349, 1.5], [5.5, 294, 0.5], [6, 330, 2],
        [8, 440, 1.5], [9.5, 392, 0.5], [10, 349, 1], [11, 330, 1],
        [12, 294, 1.5], [13.5, 330, 0.5], [14, 349, 2],
      ],
    },
  },
};

export const ALL_PALETTES = { HOSPITAL };
