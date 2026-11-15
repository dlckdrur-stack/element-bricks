import balance from '../data/balance.json';
import elites from '../data/elites.json';
import { hex } from './color.js';

/** 스테이지 체력 배율: flatUntil 까지 ×1, rampUntil 까지 직선으로 ×rampTarget, 그 뒤 ×lateGrowth^(s−rampUntil) (수치는 balance.hpScale) */
export function hpMultiplier(stage, s = balance.hpScale) {
  if (stage <= s.flatUntil) return 1;
  if (stage <= s.rampUntil) {
    const t = (stage - s.flatUntil) / (s.rampUntil - s.flatUntil);
    return 1 + (s.rampTarget - 1) * t;
  }
  return s.rampTarget * Math.pow(s.lateGrowth, stage - s.rampUntil);
}

/** 판의 티어 난이도 (GameScene 이 판 시작 때 설정) */
let mods = { hpMul: 1, extraBlocks: 0, eliteChance: 0 };
let power = 1; // 내 레벨(= 고른 증강 수)만큼 블록도 단단해짐
export function setStageMods(m) {
  mods = { hpMul: m.hpMul ?? 1, extraBlocks: m.extraBlocks ?? 0, eliteChance: m.eliteChance ?? 0 };
  power = 1;
}

/** 레벨이 오를 때마다 새로 내려오는 블록 체력 +perLevel (영구 강화·공 강화는 반영하지 않음) */
export function setPowerLevel(level) {
  power = 1 + balance.hpScale.perLevel * Math.max(0, level - 1);
}

/** 특수 블록: 보물(체력 2배·재화 5배) · 분열(깨지면 둘로) · 방패(아래에서 맞으면 -50%) */
function makeSpecial(def, stage, rng) {
  for (const [name, sp] of Object.entries(elites.specials)) {
    if (stage >= sp.fromStage && rng() < sp.chance) {
      return { ...def, hp: Math.ceil(def.hp * sp.hpMul), special: name, icon: sp.icon, fixedColor: hex(sp.color) };
    }
  }
  return def;
}

/** 티어 확률로 블록을 엘리트로 (종류는 무작위, 체력 배율·아이콘·고정 색) */
function makeElite(def, stage, rng) {
  if (stage < elites.fromStage || !(rng() < mods.eliteChance)) return makeSpecial(def, stage, rng);
  const names = Object.keys(elites.types);
  const name = names[Math.floor(rng() * names.length)];
  const t = elites.types[name];
  return { ...def, hp: Math.ceil(def.hp * t.hpMul), elite: name, icon: t.icon, fixedColor: hex(elites.color) };
}

/** 스테이지 기본 체력 × 티어 배율 × 레벨 배율 (재화 계산에는 배율 없는 stage 를 쓸 것) */
export function stageHp(stage) {
  return Math.max(1, Math.round(stage * hpMultiplier(stage) * mods.hpMul * power));
}

function tierFor(stage, tiers) {
  let tier = tiers[0];
  for (const t of tiers) if (stage >= t.from) tier = t;
  return tier;
}

function randInt(min, max, rng) {
  return min + Math.floor(rng() * (max - min + 1));
}

function shuffled(n, rng) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 스테이지 → 새로 생길 맨 윗줄 구성. 스테이지별 블록 구성은 이 함수 하나에서만 정한다.
 * 보스 스테이지·특수 블록·런 모드 테이블은 나중에 여기서 분기하면 된다.
 *
 * @returns {Array<null | {kind:'block', hp:number, double:boolean} | {kind:'orb'}>} 길이 = cols
 */
export function buildStageRow(stage, cols, rng = Math.random) {
  const cfg = balance.blocks;
  const tier = tierFor(stage, cfg.countByStage);
  const count = Math.min(cols - 1, randInt(tier.min, tier.max, rng) + mods.extraBlocks); // 구슬 자리 1칸은 남김
  const order = shuffled(cols, rng);
  const hp = stageHp(stage);
  const row = new Array(cols).fill(null);

  for (let i = 0; i < count; i++) {
    const double = rng() < cfg.doubleChance;
    // base = 기본 체력(스테이지 숫자). 깨면 이만큼 재화
    row[order[i]] = makeElite({ kind: 'block', hp: double ? hp * cfg.doubleMultiplier : hp, double, base: stage }, stage, rng);
  }
  if (rng() < balance.orb.chance) row[order[count]] = { kind: 'orb' };
  return row;
}
