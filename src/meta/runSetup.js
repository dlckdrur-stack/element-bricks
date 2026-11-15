import { runBonuses } from './upgrades.js';

/**
 * 판 시작 시 영구 강화를 게임 수치에 반영.
 * 반환: { bonus, baseStats, ballCount, rerolls }
 */
export function setupRun(balance) {
  const bonus = runBonuses();
  const b = balance.stats;
  const baseStats = {
    ...b,
    critChance: b.critChance + bonus.critChance,
    critDamage: b.critDamage + bonus.critDamage,
    ballDamageMul: b.ballDamageMul * bonus.damageMul,
  };
  const ballCount = Math.min(balance.ball.maxStartCount, balance.ball.startCount + bonus.balls);
  return { bonus, baseStats, ballCount, rerolls: bonus.rerolls };
}
