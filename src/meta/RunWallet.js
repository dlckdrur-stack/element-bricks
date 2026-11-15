import { EV } from '../core/events.js';

/**
 * 한 판에서 버는 재화.
 * 블록 1개 = 기본 체력(스테이지 숫자) × perBaseHp × (1 + 증강 currencyBonus)
 * 판이 끝날 때 bonusPct(영구 강화·개척 보너스 합계)를 한 번에 더한다.
 */
export class RunWallet {
  constructor(bus, cfg, earned = 0) {
    this.cfg = cfg;
    this.earned = earned; // 보너스 적용 전 (소수 유지)
    this.bonusPct = 0;    // 0.6 = +60%. 영구 강화·개척 보너스를 모두 더한 값
    bus.on(EV.LOOT, (ctx) => {
      const base = ctx.cell.base ?? 0;
      this.earned += base * cfg.perBaseHp * (1 + ctx.currencyBonus);
    });
  }

  /** 보너스까지 반영한 최종 재화 */
  get total() {
    return Math.floor(this.earned * (1 + this.bonusPct));
  }
}
