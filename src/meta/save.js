const KEY = 'elementBricks.save';
const VERSION = 1;

const defaults = () => ({ version: VERSION, bestStage: 0 });

/** 버전이 다르면 여기서 이전 데이터를 옮긴다 */
function migrate(data) {
  if (!data || typeof data !== 'object') return defaults();
  return { ...defaults(), ...data, version: VERSION };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw)) : defaults();
  } catch {
    return defaults();
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, version: VERSION }));
  } catch {
    // 사생활 보호 모드 등에서 저장 불가 → 무시
  }
}
