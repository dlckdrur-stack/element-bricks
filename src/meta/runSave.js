import { readKey, removeKey, VERSION } from './save.js';

/** 판 중간 저장 (이어하기). 턴이 끝날 때마다 한 번 */
export const RUN_KEY = 'elementBricks.run';

export function loadRun() {
  const r = readKey(RUN_KEY);
  return r && r.version === VERSION && r.stage > 0 ? r : null;
}

export function hasRun() { return loadRun() !== null; }

export function clearRun() { removeKey(RUN_KEY); }
