/**
 * 저장 (브라우저 저장소). 저장 데이터마다 버전 번호를 넣는다.
 *   profile: 재화·최고 기록·영구 강화·개척 보너스·환경설정 (판과 상관없이 남는 것)
 *   run    : 판 중간 저장 (이어하기) → runSave.js
 * 같은 내용이면 다시 쓰지 않는다(바뀐 것만 저장).
 */
const PROFILE_KEY = 'elementBricks.save';
export const VERSION = 2;

const defaults = () => ({
  version: VERSION,
  bestStage: 0,
  currency: 0,
  upgrades: {},  // { id: 단계 }
  pioneer: {},   // { 핵심 증강 id: { bonus, picked } }
  settings: {},  // 기본값과 다른 것만이 아니라 전부 (settings.js 가 기본값과 합침)
});

/** 버전이 다르면 여기서 이전 데이터를 옮긴다 */
function migrate(data) {
  if (!data || typeof data !== 'object') return defaults();
  // v1: { version:1, bestStage } → 그대로 합치면 됨
  return { ...defaults(), ...data, version: VERSION };
}

const last = new Map(); // key → 마지막으로 쓴 문자열

export function readKey(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) last.set(key, raw);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** 바뀐 경우에만 실제로 쓴다. 썼으면 true */
export function writeKey(key, data) {
  const raw = JSON.stringify({ ...data, version: VERSION });
  if (last.get(key) === raw) return false;
  try {
    localStorage.setItem(key, raw);
    last.set(key, raw);
    return true;
  } catch {
    return false; // 사생활 보호 모드 등에서 저장 불가 → 무시
  }
}

export function removeKey(key) {
  last.delete(key);
  try { localStorage.removeItem(key); } catch { /* 무시 */ }
}

let profile = null;

/** 프로필 (처음 한 번만 읽고 메모리에 둔다) */
export function getProfile() {
  if (!profile) profile = migrate(readKey(PROFILE_KEY));
  return profile;
}

/** 프로필 저장 (바뀐 경우에만) */
export function commitProfile() {
  return writeKey(PROFILE_KEY, getProfile());
}

/** 데이터 초기화: 프로필·판 저장 전부 */
export function resetAll(extraKeys = []) {
  removeKey(PROFILE_KEY);
  for (const k of extraKeys) removeKey(k);
  profile = defaults();
}
