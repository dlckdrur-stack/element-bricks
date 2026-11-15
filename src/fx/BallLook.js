import Phaser from 'phaser';
import { hex, mix } from '../core/color.js';
import { FRAME } from './atlas.js';

const ADD = Phaser.BlendModes.ADD;
const HALF = FRAME / 2;
const R2D = 180 / Math.PI;

/**
 * 공 겉모습: 메인 원소 색 공(disc) + 하얀 심지(hot) + 속성색 빛(aura, 일렁임 없음) + 튀는 불티 + 꼬리 잔상.
 * 뇌격 관통이 있으면 전기 갑옷 스파크가 계속 튐(링 테두리는 없음).
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
      aura: s.add.image(0, 0, 'fx', 'glow').setBlendMode(ADD).setDepth(19), // 속성색 빛 (일렁임 없음)
      core: s.add.image(0, 0, 'fx', 'disc').setDepth(20),                   // 메인 원소 색 공
      hot: s.add.image(0, 0, 'fx', 'core').setDepth(21),                    // 하얀 심지
      r: 9,
    };
  }

  layers(v) { return [v.aura, v.core, v.hot]; }

  hide(v) { for (const o of this.layers(v)) o.setVisible(false); }

  setVisible(v, on) {
    for (const o of this.layers(v)) o.setVisible(on);
  }

  /** 속성·크기 반영 (발사 때와 증강을 고른 직후) */
  dress(v, r) {
    const bfx = this.state.ballFx;
    v.r = r;
    this.setVisible(v, true);
    v.aura.setTint(bfx ? bfx.color : this.defaultColor);
    v.core.setScale((r * 2 * this.c.core.scale) / (FRAME - 3)).setTint(bfx ? mix(0xffffff, bfx.color, this.c.core.tint) : 0xffffff);
    v.hot.setScale((r * 2 * this.c.core.hot) / (FRAME - 3)).setTint(0xffffff);
    this.animate(v);
    return v;
  }

  place(v, x, y) {
    v.aura.setPosition(x, y);
    v.core.setPosition(x, y);
    v.hot.setPosition(x, y);
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

  /** 매 프레임: 속성 빛 크기 (흔들림 없이 또렷하게) */
  animate(v) {
    const bfx = this.state.ballFx;
    const a = this.c.aura;
    const size = (v.r * a.scale * (bfx?.auraScale ?? 1) * (1 + this.growth) * (1 + this.flare)) / HALF;
    v.aura.setScale(size).setAlpha(bfx ? a.alpha : a.defaultAlpha);
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
