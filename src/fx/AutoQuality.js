/**
 * 자동 품질 조절: lowSec 동안 lowFps 미만이면 한 단계 내리고,
 * recoverSec 동안 recoverFps 이상이면 한 단계 올린다(사용자가 고른 품질까지만).
 * 판 안에서만 바뀌고 저장하지 않는다.
 */
export class AutoQuality {
  constructor(fx, qualities, cfg, { enabled, ceiling }) {
    this.fx = fx;
    this.qs = qualities;
    this.cfg = cfg;
    this.enabled = enabled;
    this.max = Math.max(0, qualities.indexOf(ceiling));
    this.low = 0;
    this.good = 0;
  }

  get index() { return Math.max(0, this.qs.indexOf(this.fx.quality)); }

  /** dt: 실제 시간(초), fps: 최근 평균 */
  update(dt, fps) {
    if (!this.enabled) return;
    const c = this.cfg;
    this.low = fps < c.lowFps ? this.low + dt : 0;
    this.good = fps >= c.recoverFps ? this.good + dt : 0;
    const i = this.index;
    if (this.low >= c.lowSec && i > 0) {
      this.fx.setQuality(this.qs[i - 1]);
      this.low = 0;
      this.good = 0;
    } else if (this.good >= c.recoverSec && i < this.max) {
      this.fx.setQuality(this.qs[i + 1]);
      this.good = 0;
    }
  }
}
