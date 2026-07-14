// 시드 기반 난수 — 게임 상태에 seed(숫자)+rngCounter(호출 횟수)만 저장해
// 상태를 계속 JSON 직렬화 가능하게 유지한다 (명세 15/16장).
// mulberry32 알고리즘.
function mulberry32(a) {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// state.seed와 state.rngCounter를 기반으로 다음 난수를 뽑고 카운터를 증가시킨다.
export function nextRandom(state) {
  const combined = (state.seed ^ (state.rngCounter * 0x9e3779b1)) >>> 0;
  state.rngCounter += 1;
  return mulberry32(combined);
}

export function randomInt(state, maxExclusive) {
  return Math.floor(nextRandom(state) * maxExclusive);
}

// Fisher-Yates, state의 시드 RNG 사용. 원본 배열을 변형하지 않는다.
export function shuffle(state, array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(state, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 배열에서 무작위 인덱스 하나를 뽑아 [값, 나머지배열]로 반환.
export function pickRandom(state, array) {
  const idx = randomInt(state, array.length);
  const value = array[idx];
  const rest = array.slice(0, idx).concat(array.slice(idx + 1));
  return [value, rest];
}
