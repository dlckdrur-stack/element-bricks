import { runBonuses } from './upgrades.js';
import { dmgMul } from './enhance.js';
import { equippedBonus } from './resonance.js';
import { dmgAt as starforceDmg } from './starforce.js';

/**
 * 판 시작 시 영구 강화를 게임 수치에 반영.
 * 반환: { bonus, baseStats, ballCount, rerolls, res(각인) }
 */
export function setupRun(balance) {
  const bonus = runBonuses();
  const res = equippedBonus(); // 장착한 각인 잠재 능력
  const o = res.total;
  o.allDmg = (o.allDmg ?? 0) + starforceDmg(); // 성좌 강화: 모든 피해
  bonus.xpPct += o.xp ?? 0;
  bonus.currencyPct += o.currency ?? 0;
  bonus.speedMul *= 1 + (o.ballSpeed ?? 0); // 공 속도
  const b = balance.stats;
  const baseStats = {
    ...b,
    critChance: b.critChance + bonus.critChance + (o.critChance ?? 0),
    critDamage: b.critDamage + bonus.critDamage + (o.critDmg ?? 0),
    ballDamageMul: b.ballDamageMul * bonus.damageMul * dmgMul() * (1 + (o.ballDmg ?? 0)), // 공 강화 · 각인
  };
  const ballCount = Math.min(balance.ball.maxStartCount, balance.ball.startCount + bonus.balls);
  return { bonus, baseStats, ballCount, rerolls: bonus.rerolls, res };
}
