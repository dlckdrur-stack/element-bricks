import data from '../data/starforce.json';
import { getProfile, commitProfile } from './save.js';

/**
 * 스타포스 (챌린저 100스테이지 이후 재화 소각). 수치는 data/starforce.json
 * 강화: 성공 +1성 / 실패 = 유지 / 파괴(15성~) = destroyTo 성으로. 15~17성은 2배 비용으로 파괴 방지.
 * 효과: 성마다 모든 피해 +dmg (15성부터 더 큼) → runSetup 에서 각인 allDmg 에 더함
 */
export const sfData = data;

function state() {
  const p = getProfile();
  p.starforce ??= { star: 0, best: 0, destroyed: 0 };
  return p.starforce;
}

export const star = () => state().star;
export const isUnlocked = () => (getProfile().tierBest?.challenger ?? 0) >= data.unlockStage;
export const isMax = () => star() >= data.maxStar;

/** s 성까지의 모든 피해 증가 합 */
export function dmgAt(s = star()) {
  const d = data.dmg;
  let sum = 0;
  for (let i = 0; i < s; i++) sum += i >= d.highFrom ? d.high : d.low;
  return sum;
}

export const canProtect = (s = star()) => s >= data.protect.from && s <= data.protect.to;

export function costFor(s = star(), protect = false) {
  const c = data.cost;
  const base = Math.round((c.base * c.growth ** s) / c.round) * c.round;
  return protect && canProtect(s) ? base * data.protect.costMul : base;
}

/** 이번 강화 확률 { success, destroy, fail } */
export function odds(s = star(), protect = false) {
  const success = data.success[s] ?? 0;
  const destroy = protect && canProtect(s) ? 0 : data.destroy[s] ?? 0;
  return { success, destroy, fail: Math.max(0, 1 - success - destroy) };
}

/** 강화 1회 → 'success' | 'fail' | 'destroy' (재화 부족·최대면 null) */
export function tryStar(protect, rng = Math.random) {
  const p = getProfile();
  const st = state();
  if (!isUnlocked() || isMax()) return null;
  const cost = costFor(st.star, protect);
  if (p.currency < cost) return null;
  p.currency -= cost;
  const o = odds(st.star, protect);
  const x = rng();
  let result = 'fail';
  if (x < o.success) { st.star++; result = 'success'; } else if (x < o.success + o.destroy) {
    st.star = data.destroyTo;
    st.destroyed++;
    result = 'destroy';
  }
  st.best = Math.max(st.best, st.star);
  commitProfile();
  return result;
}
