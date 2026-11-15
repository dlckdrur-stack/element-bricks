import Phaser from 'phaser';
import { Pool } from '../core/Pool.js';
import { FRAME } from './atlas.js';

const ADD = Phaser.BlendModes.ADD;

/**
 * 데미지 구슬 표시: 동그라미 안에 "+1", 둥둥 떠 있고 바깥 빛(pulseFrame)이 맥박처럼 커졌다 작아짐.
 * 선 모양 테두리는 거슬려서 기본은 끔(stroke 0, pulseFrame glow).
 * root(격자 위치·하강 트윈용) > inner(둥둥) > glow·ring·body·label. 수치는 ui.json 의 orb.
 */
export class OrbLook {
  constructor(scene, { cfg, color, radius, label, fontFamily }) {
    this.scene = scene;
    this.cfg = cfg;
    this.color = color;
    this.r = radius;
    this.label = label;
    this.font = fontFamily;
    this.pool = new Pool(() => this.make(), (v) => this.hide(v));
  }

  make() {
    const s = this.scene;
    const c = this.cfg;
    const glow = s.add.image(0, 0, 'fx', 'glow').setBlendMode(ADD).setTint(this.color)
      .setAlpha(c.glowAlpha).setScale((this.r * 2 * c.glowScale) / FRAME * 2);
    const ring = s.add.image(0, 0, 'fx', c.pulseFrame).setBlendMode(ADD).setTint(this.color);
    const body = s.add.circle(0, 0, this.r).setFillStyle(this.color, c.bodyAlpha);
    if (c.stroke > 0) body.setStrokeStyle(c.stroke, this.color, 1);
    const label = s.add.text(0, 0, this.label, {
      fontFamily: this.font, fontSize: `${c.labelSize}px`, fontStyle: 'bold', color: c.labelColor,
    }).setOrigin(0.5);
    const inner = s.add.container(0, 0, [glow, ring, body, label]);
    const root = s.add.container(0, 0, [inner]).setDepth(12);
    const ringScale = (k) => ((this.r * 2) / FRAME) * 2 * k;
    const tweens = [
      s.tweens.add({
        targets: inner, y: { from: c.bobAmp, to: -c.bobAmp }, duration: c.bobTime,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      }),
      s.tweens.add({
        targets: ring, scale: { from: ringScale(c.ringFrom), to: ringScale(c.ringTo) },
        alpha: { from: c.ringAlphaFrom, to: c.ringAlphaTo }, duration: c.pulseTime,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      }),
    ];
    return { root, inner, tweens };
  }

  get() {
    const v = this.pool.get();
    v.root.setVisible(true).setAlpha(1).setScale(1);
    for (const t of v.tweens) t.resume();
    v.tweens[0].seek(Math.random() * this.cfg.bobTime); // 구슬마다 박자를 다르게
    return v;
  }

  hide(v) {
    v.root.setVisible(false);
    for (const t of v.tweens) t.pause();
  }

  release(v) { this.pool.release(v); }
}
