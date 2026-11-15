import data from '../data/enhance.json';
import { getProfile, commitProfile } from './save.js';
import { isCleared } from './tiers.js';

/**
 * 공 강화 (던파식). 플래티넘 클리어 시 해금. 수치는 data/enhance.json
 *   결과: 성공(+1) · 실패(유지) · 초기화(+0, resetFrom 강부터)
 *   초기화 방지권: 구간별(12~14 / 15~17 / 18~20). 켜 두면 초기화가 나왔을 때만 1장 쓰고 실패(유지)로 바뀐다.
 * 공 데미지 배율 = 1 + levels[강].dmgPct (모든 판에 적용)
 */
export const enhanceData = data;

function state() {
  const p = getProfile();
  p.enhance ??= { level: 0, best: 0, tickets: {} };
  return p.enhance;
}

export const isUnlocked = () => isCleared(data.unlockTier);
export const level = () => state().level;
export const best = () => state().best;
export const isMax = () => level() >= data.maxLevel;

/** 강 → 공 데미지 배율 */
export const dmgMul = (lv = level()) => 1 + data.levels[lv].dmgPct;

/** 다음 강화(lv → lv+1) 정보 */
export function nextInfo(lv = level()) {
  const n = data.levels[lv + 1];
  if (!n) return null;
  return { rate: n.rate, reset: n.reset, fail: Math.max(0, 1 - n.rate - n.reset), cost: n.cost, mulFrom: dmgMul(lv), mulTo: dmgMul(lv + 1) };
}

/** 지금 강에서 쓰는 방지권 (구간) */
export const ticketFor = (lv = level()) => data.tickets.find((t) => lv >= t.from && lv <= t.to) ?? null; // 현재 강 기준 구간
export const ticketCount = (id) => state().tickets[id] ?? 0;

/** 방지권 1장 사용 (공 강화·성좌 강화 공용). 있으면 true */
export function spendTicket(id) {
  const s = state();
  if (!(s.tickets[id] > 0)) return false;
  s.tickets[id]--;
  commitProfile();
  return true;
}

export function buyTicket(id) {
  const t = data.tickets.find((x) => x.id === id);
  const p = getProfile();
  if (!t || p.currency < t.price) return false;
  p.currency -= t.price;
  state().tickets[id] = ticketCount(id) + 1;
  commitProfile();
  return true;
}

/**
 * 강화 1회. useTicket = 방지권 사용 켜짐.
 * @returns { ok:false, reason } | { ok:true, result:'success'|'fail'|'reset'|'saved', from, to }
 */
export function tryEnhance(useTicket, rng = Math.random) {
  const s = state();
  const p = getProfile();
  const info = nextInfo();
  if (!isUnlocked()) return { ok: false, reason: 'locked' };
  if (!info) return { ok: false, reason: 'max' };
  if (p.currency < info.cost) return { ok: false, reason: 'money' };
  p.currency -= info.cost;
  const from = s.level;
  const x = rng();
  let result = 'fail';
  if (x < info.rate) result = 'success';
  else if (x < info.rate + info.reset) result = 'reset';
  if (result === 'reset' && useTicket) {
    const t = ticketFor(from);
    if (t && ticketCount(t.id) > 0) { s.tickets[t.id]--; result = 'saved'; }
  }
  if (result === 'success') s.level++;
  if (result === 'reset') s.level = 0;
  s.best = Math.max(s.best, s.level);
  commitProfile(); // 강화는 판 밖에서만 → 바로 저장
  return { ok: true, result, from, to: s.level };
}
