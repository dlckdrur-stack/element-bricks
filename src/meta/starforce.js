import data from '../data/starforce.json';
import { getProfile, commitProfile } from './save.js';
import { ticketFor, ticketCount, spendTicket } from './enhance.js';

/**
 * 성좌 강화 (챌린저 100스테이지 이후 재화 소각). 수치는 data/starforce.json
 * 강화: 성공 +1단계 / 실패 = 유지 / 붕괴(15단계~) = destroyTo 단계로. 공 강화 방지권 1장으로 붕괴를 막음.
 * 효과: 단계마다 모든 피해 +dmg (15단계부터 더 큼) → runSetup 에서 각인 allDmg 에 더함
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
/** 이 단계에서 쓰는 방지권 (공 강화 구간표 그대로) */
export const ticketHere = (s = star()) => (canProtect(s) ? ticketFor(s) : null);
export const ticketsHere = (s = star()) => { const tk = ticketHere(s); return tk ? ticketCount(tk.id) : 0; };

export function costFor(s = star()) {
  const c = data.cost;
  return Math.round((c.base * c.growth ** s) / c.round) * c.round;
}

/** 이번 강화 확률 { success, destroy, fail } */
export function odds(s = star()) {
  const success = data.success[s] ?? 0;
  const destroy = data.destroy[s] ?? 0;
  return { success, destroy, fail: Math.max(0, 1 - success - destroy) };
}

/** 강화 1회 → 'success' | 'fail' | 'destroy' | 'saved'(방지권으로 막음) (재화 부족·최대면 null) */
export function tryStar(useTicket, rng = Math.random) {
  const p = getProfile();
  const st = state();
  if (!isUnlocked() || isMax()) return null;
  const cost = costFor(st.star);
  if (p.currency < cost) return null;
  p.currency -= cost;
  const o = odds(st.star);
  const x = rng();
  let result = 'fail';
  const tk = ticketHere(st.star);
  if (x < o.success) { st.star++; result = 'success'; } else if (x < o.success + o.destroy && useTicket && tk && spendTicket(tk.id)) {
    result = 'saved';
  } else if (x < o.success + o.destroy) {
    st.star = data.destroyTo;
    st.destroyed++;
    result = 'destroy';
  }
  st.best = Math.max(st.best, st.star);
  commitProfile();
  return result;
}
