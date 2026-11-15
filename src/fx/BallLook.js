import Phaser from 'phaser';
import { hex } from '../core/color.js';
import { FRAME } from './atlas.js';

const ADD = Phaser.BlendModes.ADD;
const HALF = FRAME / 2;
const R2D = 180 / Math.PI;

/**
 * 공 겉모습 4겹: 밝은 흰 중심(core+rim 테두리+halo) + 속성색 글로우(aura) + 튀는 불티 + 꼬리 잔상.
 * 뇌격 관통이 있으면 전기 갑옷(armor) 링이 하나 더.
 * state.ballFx = AugmentManager.ballFx ({ color, trail, auraScale, spark, armor, armorColor … })
 * 수치는 default.json 의 ball.
 */
export class BallLook {
  constructor(scene, fxCfg, fx, state) {
    this.scene = scene;
    this.c = fxCfg.ball;
    this.fx = fx;
    this.state = state;
    this.flareAmt = 0;
    this.flareT = 0;
    this.flareMax = 1;
    this.defaultColor = hex(this.c.aura.defaultColor);
  }

  make() {
    const s = this.scene;
    return {
      aura: s.add.image(0, 0, 'fx', 'glow').setBlendMode(ADD).setDepth(19),
      armor: s.add.image(0, 0, 'fx', 'ring').setBlendMode(ADD).setDepth(19.5),
      core: s.add.image(0, 0, 'fx', 'core').setDepth(20),
      rim: s.add.image(0, 0, 'fx', 'ring').setDepth(20.2), // 또렷한 테두리 (가산 혼합 아님)
      halo: s.add.image(0, 0, 'fx', 'glow').setBlendMode(ADD).setDepth(20.5),
      r: 9,
    };
  }

  layers(v) { return [v.aura, v.armor, v.core, v.rim, v.halo]; }

  hide(v) { for (const o of this.layers(v)) o.setVisible(false); }

  setVisible(v, on) {
    const bfx = this.state.ballFx;
    v.core.setVisible(on);
    v.rim.setVisible(on);
    v.halo.setVisible(on);
    v.aura.setVisible(on);
    v.armor.setVisible(on && !!bfx?.armor);
  }

  /** 속성·크기 반영 (발사 때와 증강을 고른 직후) */
  dress(v, r) {
    const bfx = this.state.ballFx;
    v.r = r;
    this.setVisible(v, true);
    v.aura.setTint(bfx ? bfx.color : this.defaultColor);
    if (bfx?.armor) v.armor.setTint(bfx.armorColor);
    v.core.setScale((r * 2 * this.c.core.scale) / (FRAME - 2));
    const rim = this.c.rim;
    v.rim.setTint(bfx ? bfx.color : this.defaultColor).setAlpha(rim.alpha)
      .setScale((r * rim.radius) / (rim.peak * HALF));
    v.halo.setScale((r * this.c.coreHalo.scale) / HALF).setAlpha(this.c.coreHalo.alpha);
    this.animate(v);
    return v;
  }

  place(v, x, y) {
    v.aura.setPosition(x, y);
    v.armor.setPosition(x, y);
    v.core.setPosition(x, y);
    v.rim.setPosition(x, y);
    v.halo.setPosition(x, y);
  }

  /** 구슬을 먹을수록 커지는 불꽃 */
  get growth() {
    const g = this.c.growth;
    return Math.min(g.max, Math.max(0, this.state.damage - 1) * g.perDamage);
  }

  get flare() {
    return this.flareT > 0 ? this.flareAmt * (this.flareT / this.flareMax) : 0;
  }

  /** 불꽃이 한 번 크게 타오름. name = ball.flare 의 키 (orb·pick·awaken) */
  flareUp(name) {
    const f = this.c.flare[name];
    if (!f) return;
    this.flareAmt = Math.max(this.flare, f.scale - 1);
    this.flareT = f.time;
    this.flareMax = f.time;
  }

  /** 매 프레임: 오라 일렁임·갑옷 지지직 */
  animate(v) {
    const bfx = this.state.ballFx;
    const a = this.c.aura;
    const fl = 1 - a.flicker * Math.random();
    const size = (v.r * a.scale * (bfx?.auraScale ?? 1) * (1 + this.growth) * (1 + this.flare)) / HALF;
    v.aura.setScale(size * (0.94 + 0.12 * Math.random())).setAlpha((bfx ? a.alpha : a.defaultAlpha) * fl);
    if (bfx?.armor) {
      const ar = this.c.armor;
      v.armor.setScale((v.r * ar.scale) / HALF * (0.92 + 0.16 * Math.random()))
        .setRotation(Math.random() * 6.28).setAlpha(ar.alpha * (1 - ar.flicker * Math.random()));
    }
  }

  /** 고정 스텝마다: 꼬리 잔상·불티 */
  tick(b) {
    const bfx = this.state.ballFx;
    const c = this.c;
    const color = bfx ? bfx.color : 0xffffff;
    const trail = bfx ? bfx.trail : c.trail;
    if (b.age % (bfx?.trailEverySteps ?? c.trailEverySteps) === 0) this.fx.emit(trail, b.x, b.y, color);
    if (b.age % (bfx?.sparkEverySteps ?? c.sparkEverySteps) === 0) {
      this.fx.emit(bfx?.spark ?? c.spark, b.x, b.y, bfx ? color : this.defaultColor, { dir: Math.atan2(-b.vy, -b.vx) * R2D });
    }
    if (bfx?.armor && b.age % c.armor.sparkEverySteps === 0) this.fx.emit(c.armor.spark, b.x, b.y, bfx.armorColor);
  }

  update(dt) {
    if (this.flareT > 0) this.flareT = Math.max(0, this.flareT - dt);
  }
}
