import Phaser from 'phaser';
import { Pool } from '../core/Pool.js';
import { hex } from '../core/color.js';
import { FRAME } from './atlas.js';

const EASE = {
  out: (t) => 1 - (1 - t) * (1 - t) * (1 - t),
  in: (t) => t * t,
  linear: (t) => t,
};

/**
 * 한 번 커졌다 사라지는 스프라이트(충격파 링·빛 번쩍·블록 테두리).
 * spec = { frame, color?, from, to, life, alpha, ease }  from/to 는 64px 기준 배율.
 * 예산: spriteBudget[quality]. 큰 연출(priority 2)은 상한의 1.5배까지 유지.
 */
export class SpriteFx {
  constructor(scene, cfg, opts = {}) {
    this.cfg = cfg;
    this.live = [];
    this.size = cfg.size ?? 1;
    this.pool = new Pool(() => {
      const s = scene.add.image(0, 0, 'fx', 'ring').setBlendMode(Phaser.BlendModes.ADD).setDepth(opts.depth ?? 31);
      opts.onCreate?.(s);
      return s;
    }, (s) => s.setVisible(false));
    this.opts = opts;
    this.setQuality(opts.quality ?? cfg.quality);
  }

  setQuality(q) { this.cap = this.opts.budget ?? this.cfg.spriteBudget[q] ?? 48; }
  setSize(s) { this.size = s; }
  get count() { return this.live.length; }

  /** o: { w, h (기준 표시 크기 px, 기본 64), priority, scale } */
  play(spec, x, y, color, o = {}) {
    if (!spec) return null;
    const pr = o.priority ?? 2;
    const limit = pr >= 2 ? this.cap * 1.5 : this.cap;
    if (this.live.length >= limit) return null;
    const sz = (o.scale ?? 1) * (o.w ? 1 : this.size);
    const s = this.pool.get().setVisible(true).setFrame(spec.frame ?? 'ring').setPosition(x, y)
      .setTint(spec.color ? hex(spec.color) : color).setAlpha(spec.alpha ?? 1).setRotation(o.rot ?? 0);
    const e = {
      s, t: 0, life: spec.life ?? 0.2, from: spec.from ?? 1, to: spec.to ?? 2, a: spec.alpha ?? 1,
      ease: EASE[spec.ease] ?? EASE.out, w: (o.w ?? FRAME) * sz, h: (o.h ?? FRAME) * sz,
    };
    this.apply(e, 0);
    this.live.push(e);
    return e;
  }

  apply(e, k) {
    const m = e.from + (e.to - e.from) * e.ease(k);
    e.s.setDisplaySize(e.w * m, e.h * m).setAlpha(e.a * (1 - k));
  }

  update(dt) {
    const live = this.live;
    for (let i = live.length - 1; i >= 0; i--) {
      const e = live[i];
      e.t += dt;
      if (e.t >= e.life) {
        this.pool.release(e.s);
        live[i] = live[live.length - 1];
        live.pop();
        continue;
      }
      this.apply(e, e.t / e.life);
    }
  }

  destroy() {
    for (const e of this.live) e.s.destroy();
    for (const s of this.pool.free) s.destroy();
    this.live = [];
    this.pool.free = [];
  }
}
