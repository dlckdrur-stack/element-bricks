import data from '../data/resonance.json';
import { getProfile, commitProfile } from './save.js';
import { isCleared } from './tiers.js';

/**
 * 원소 각인 + 공명석 (메이플 큐브식). 다이아 클리어 시 해금. 수치는 data/resonance.json
 * - 각인 6개(속성별) 중 slots 개를 장착 → 빌드 컨셉에 맞춰 교체
 * - 공명석(재화 cost) 1회 = 등급 상승 판정(보장 횟수 포함) + 잠재 3줄 새로 뽑기. multi = 더 비싸게 3세트 중 고르기
 * - 줄마다 낮은 확률로 "이탈" (한 등급 위 수치, 레전더리는 그 너머)
 * - 결과는 바로 적용하지 않고 "유지 / 새 옵션 중 하나" 를 고름 (예상 데미지 비교)
 */
export const resData = data;
const G = data.grades;

function state() {
  const p = getProfile();
  if (!p.resonance) {
    const engr = {};
    for (const el of data.elements) engr[el] = { grade: 'rare', lines: [], pity: 0 };
    p.resonance = { engr, equip: [], pending: null };
  }
  if (p.resonance.equip.length > data.slots) p.resonance.equip.length = data.slots; // 장착 칸이 줄었으면 앞에서부터
  return p.resonance;
}

export const isUnlocked = () => isCleared(data.unlockTier);
export const engraving = (el) => state().engr[el];
export const equipped = () => state().equip;
/** 돌린 결과 (예전 저장의 { el, lines } 도 choices 1개로 맞춤) */
export function pending() {
  const p = state().pending;
  if (p && !p.choices) { p.choices = [p.lines]; delete p.lines; }
  return p;
}

/** 장착/해제 (최대 slots 개) */
export function toggleEquip(el) {
  const s = state();
  const i = s.equip.indexOf(el);
  if (i >= 0) s.equip.splice(i, 1);
  else if (s.equip.length < data.slots) s.equip.push(el);
  else return false;
  commitProfile();
  return true;
}

const lower = (g) => G[Math.max(0, G.indexOf(g) - 1)];

/** 한 등급에서 나올 수 있는 옵션과 확률 (줄 제한 반영) — 확률표 공개에도 사용 */
export function optionOdds(grade, used = {}) {
  const list = data.options.filter((o) => o.values[grade] !== undefined && (used[o.id] ?? 0) < (o.maxLines ?? 3));
  const sum = list.reduce((a, o) => a + o.weight, 0);
  return list.map((o) => ({ id: o.id, value: o.values[grade], chance: o.weight / sum }));
}

/** 한 줄 뽑기. outlier.chance 확률로 "이탈": 한 등급 위 수치 (레전더리면 레전더리 × beyondMul) */
function rollLine(grade, used, rng) {
  const odds = optionOdds(grade, used);
  let x = rng();
  const o = odds.find((c) => (x -= c.chance) <= 0) ?? odds[odds.length - 1];
  if (rng() >= data.outlier.chance) return { id: o.id, grade, value: o.value };
  const next = G[G.indexOf(grade) + 1];
  const opt = data.options.find((c) => c.id === o.id);
  if (next && opt.values[next] !== undefined) return { id: o.id, grade: next, value: opt.values[next], outlier: true };
  return { id: o.id, grade, value: Math.round(o.value * data.outlier.beyondMul * 1000) / 1000, outlier: true, beyond: true };
}

/** 잠재 3줄 뽑기: 첫 줄 = 현재 등급, 둘째·셋째 줄은 확률로 한 단계 아래 */
export function rollLines(grade, rng = Math.random) {
  const used = {};
  return data.lineSameGrade.map((p) => {
    const g = rng() < p ? grade : lower(grade);
    const line = rollLine(g, used, rng);
    used[line.id] = (used[line.id] ?? 0) + 1;
    return line;
  });
}

/** 공명석 1회 (multi = 재화를 더 쓰고 3개 보기). 결과는 pending.choices 에 보관 (고르기 전까지) */
export const stoneCost = (multi) => (multi ? data.multi.cost : data.cost);
export function useStone(el, multi = false, rng = Math.random) {
  const p = getProfile();
  const s = state();
  const cost = stoneCost(multi);
  if (!isUnlocked() || p.currency < cost || s.pending) return null;
  p.currency -= cost;
  const e = s.engr[el];
  let grade = e.grade;
  const up = data.upgrade.find((u) => u.from === grade);
  if (up) {
    e.pity++;
    if (rng() < up.rate || e.pity >= up.pity) { grade = G[G.indexOf(grade) + 1]; e.pity = 0; }
  }
  e.grade = grade; // 등급 상승은 바로 확정 (옵션만 고름)
  s.pending = { el, choices: Array.from({ length: multi ? data.multi.count : 1 }, () => rollLines(grade, rng)) };
  commitProfile();
  return s.pending;
}

/** 유지(-1) / choices[i] 로 변경 */
export function resolve(i) {
  const s = state();
  const p = pending();
  if (!p) return;
  if (i >= 0 && p.choices[i]) s.engr[p.el].lines = p.choices[i];
  s.pending = null;
  commitProfile();
}

/** 줄 목록 → 옵션별 합계 */
export function sumLines(lines) {
  const out = {};
  for (const l of lines) out[l.id] = (out[l.id] ?? 0) + l.value;
  return out;
}

/** 예상 데미지 증가율 (이 각인 하나 기준, 근사) */
export function estimate(lines) {
  const e = data.estimate;
  const o = sumLines(lines);
  const crit = (1 + (e.baseCritChance + (o.critChance ?? 0)) * (e.baseCritDmg + (o.critDmg ?? 0) - 1))
    / (1 + e.baseCritChance * (e.baseCritDmg - 1));
  const mul = (1 + (o.ballDmg ?? 0)) * (1 + (o.allDmg ?? 0)) * crit
    * (1 + (o.elemEffect ?? 0) * e.elemShare) * (1 + (o.eliteDmg ?? 0) * e.eliteShare) * (1 + (o.ignoreDef ?? 0) * e.defShare)
    * (1 + (o.maxHpDmg ?? 0) * e.maxHpPerPct) * (1 + (o.ballSpeed ?? 0) * e.speedShare);
  return mul - 1;
}

/** 장착한 각인들의 합계 (판에 적용) */
export function equippedBonus() {
  if (!isUnlocked()) return { total: {}, elem: {} };
  const total = {};
  const elem = {};
  for (const el of state().equip) {
    const o = sumLines(state().engr[el].lines);
    for (const k in o) total[k] = (total[k] ?? 0) + o[k];
    if (o.elemEffect) elem[el] = o.elemEffect;
  }
  return { total, elem };
}
