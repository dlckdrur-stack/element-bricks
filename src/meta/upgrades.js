import data from '../data/upgrades.json';
import { getProfile, commitProfile } from './save.js';

/** 영구 강화. 수치는 data/upgrades.json (단계·증가율·첫 비용·단계당 효과) */
export const upgradeList = data.list;
const byId = Object.fromEntries(data.list.map((u) => [u.id, u]));

export function level(id) {
  return getProfile().upgrades[id] ?? 0;
}

export function isMaxed(id) {
  return level(id) >= byId[id].levels;
}

/** 다음 단계 비용 (첫 비용 × 증가율^현재 단계, costRound 단위 반올림) */
export function nextCost(id) {
  const u = byId[id];
  const r = data.costRound;
  return Math.round((u.cost * Math.pow(u.growth, level(id))) / r) * r;
}

/** 현재 효과 총량 (단계 × 단계당 효과) */
export function effect(id, lv = level(id)) {
  return lv * byId[id].per;
}

/** 구매. 성공하면 true (저장까지) */
export function buy(id) {
  const p = getProfile();
  if (isMaxed(id)) return false;
  const cost = nextCost(id);
  if (p.currency < cost) return false;
  p.currency -= cost;
  p.upgrades[id] = level(id) + 1;
  commitProfile();
  return true;
}

/**
 * 판 시작 시 적용할 보너스 묶음. 재화·경험치 보너스는 더해서 쓴다(곱하지 않음).
 */
export function runBonuses() {
  return {
    aimMul: 1 + effect('aim'),
    speedMul: 1 + effect('ballSpeed'),
    critDamage: effect('critDamage'),
    damageMul: 1 + effect('damage'),
    xpPct: effect('xp'),
    critChance: effect('critChance'),
    currencyPct: effect('currency'),
    rerolls: effect('reroll'),
    choices: effect('choices'),
    maxLevel: effect('maxLevel'),
    luck: effect('luck'),
    balls: effect('balls'),
  };
}
