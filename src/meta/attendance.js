import data from '../data/attendance.json';
import { getProfile, commitProfile } from './save.js';

/**
 * 출석 체크 (오프라인, 폰 현지 날짜 기준). 하루 1번, cycleDays(28일=4주)가 지나면 처음부터.
 * profile.attend = { start: 주기 시작 날짜 번호, claimed: 받은 날 수, last: 마지막으로 받은 날짜 번호 }
 */
export const attendData = data;

/** 오늘의 날짜 번호 (현지 시간 자정 기준) */
export function today() {
  return Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
}

function state() {
  const p = getProfile();
  const d = today();
  if (!p.attend || d - p.attend.start >= data.cycleDays) p.attend = { start: d, claimed: 0, last: -1 }; // 4주마다 초기화
  return p.attend;
}

/** n일째(1부터) 보상 */
export function rewardFor(n) {
  return data.big[String(n)] ?? data.daily[Math.min(data.daily.length - 1, Math.floor((n - 1) / 7))];
}

export const claimed = () => state().claimed;
export const daysLeft = () => data.cycleDays - (today() - state().start);
export const canClaim = () => { const s = state(); return s.last !== today() && s.claimed < data.cycleDays; };

/** 오늘 출석 → 받은 재화 (이미 받았으면 0) */
export function claim() {
  if (!canClaim()) return 0;
  const s = state();
  s.claimed++;
  s.last = today();
  const n = rewardFor(s.claimed);
  getProfile().currency += n;
  commitProfile();
  return n;
}
