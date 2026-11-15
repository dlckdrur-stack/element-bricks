import { EV } from '../core/events.js';

/**
 * 개척 보너스: 모든 핵심 증강을 고루 쓰게 만드는 장치. 기록은 프로필(폰)에만.
 *   profile.pioneer[id] 없음  → 한 번도 안 고름 → first(+200%)
 *   판이 끝날 때 그 판에서 고른 핵심 = 0, 안 고른 핵심 = +perRun (최대 max)
 * 레벨 1에서 고른 핵심의 보너스만큼 그 판 재화가 늘어난다(다른 재화 보너스와 더함).
 */
export class Pioneer {
  constructor(bus, profile, coreIds, cfg) {
    this.store = profile.pioneer;
    this.ids = coreIds;
    this.cfg = cfg;
    this.picked = new Set();
    bus.on(EV.AUGMENT, ({ aug }) => { if (aug.def.tier === 'core') this.picked.add(aug.def.id); });
  }

  bonusFor(id) {
    const e = this.store[id];
    return e ? e.bonus : this.cfg.first;
  }

  /** 판 끝: 고른 것 0, 안 고른 것(한 번이라도 고른 적 있는 것만) +perRun */
  settle() {
    const c = this.cfg;
    for (const id of this.ids) {
      if (this.picked.has(id)) this.store[id] = { bonus: 0 };
      else if (this.store[id]) this.store[id].bonus = Math.min(c.max, Math.round((this.store[id].bonus + c.perRun) * 100) / 100);
    }
  }
}
