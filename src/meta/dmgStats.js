import { EV } from '../core/events.js';

/**
 * 이번 판 피해 집계 (일시정지 화면의 "피해 비율"). 공 타격 / 증강별 / 필살기별.
 * key: 'ball' 또는 증강 id (없으면 효과 속성)
 */
export class DamageStats {
  constructor(bus) {
    this.map = new Map();
    this.total = 0;
    bus.on(EV.AFTER_HIT, ({ damage, source }) => {
      if (!(damage > 0)) return;
      const key = source?.type === 'ball' ? 'ball' : source?.aug ?? source?.type ?? 'etc';
      this.map.set(key, (this.map.get(key) ?? 0) + damage);
      this.total += damage;
    });
  }

  /** 큰 순서로 n 개: [{ key, dmg, share }] */
  top(n) {
    return [...this.map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([key, dmg]) => ({ key, dmg, share: this.total ? dmg / this.total : 0 }));
  }
}
