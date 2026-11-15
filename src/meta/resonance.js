import data from '../data/resonance.json';
import { getProfile, commitProfile } from './save.js';
import { isCleared } from './tiers.js';

/**
 * 원소 각인 + 공명석 (메이플 큐브식). 다이아 클리어 시 해금. 수치는 data/resonance.json
 * - 각인 6개(속성별) 중 slots 개를 장착 → 빌드 컨셉에 맞춰 교체
 * - 공명석(재화 cost) 1회 = 등급 상승 판정(보장 횟수 포함) + 잠재 3줄 새로 뽑기
 * - 결과는 바로 적용하지 않고 "유지 / 변경" 중 고름 (예상 데미지 비교)
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
export const pending = () => state().pending;

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

function rollLine(grade, used, rng) {
  const odds = optionOdds(grade, used);
  let x = rng();
  for (const o of odds) { x -= o.chance; if (x <= 0) return { id: o.id, grade, value: o.value }; }
  const o = odds[odds.length - 1];
  return { id: o.id, grade, value: o.value };
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

/** 공명석 1회. 결과는 pending 에 보관 (유지/변경 선택 전까지) */
export function useStone(el, rng = Math.random) {
  const p = getProfile();
  const s = state();
  if (!isUnlocked() || p.currency < data.cost || s.pending) return null;
  p.currency -= data.cost;
  const e = s.engr[el];
  let grade = e.grade;
  const up = data.upgrade.find((u) => u.from === grade);
  if (up) {
    e.pity++;
    if (rng() < up.rate || e.pity >= up.pity) { grade = G[G.indexOf(grade) + 1]; e.pity = 0; }
  }
  e.grade = grade; // 등급 상승은 바로 확정 (옵션만 고름)
  s.pending = { el, lines: rollLines(grade, rng) };
  commitProfile();
  return s.pending;
}

/** 유지(false) / 변경(true) */
export function resolve(change) {
  const s = state();
  if (!s.pending) return;
  if (change) s.engr[s.pending.el].lines = s.pending.lines;
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
