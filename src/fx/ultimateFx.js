import { hex } from '../core/color.js';
import { awakenCutin } from '../ui/Cutin.js';

const ms = (s) => s * 1000;
const colorCache = new Map();
const col = (s) => {
  if (!colorCache.has(s)) colorCache.set(s, hex(s));
  return colorCache.get(s);
};

/**
 * 각성 필살기 연출. Fx 에 메서드로 붙는다 (this = Fx). 수치는 data/fx/ultimate.json.
 * 입자는 전부 우선순위 2(큰 연출) → 예산이 차도 끝까지 유지.
 */
export const ultimate = {
  /** 화면이 어두운 속성색으로 가라앉았다 돌아옴 (블록 위·이펙트 아래 → 불길·낙뢰가 더 튐) */
  screenTint(c) {
    const s = this.scene;
    const { width: W, height: H } = s.scale;
    const r = s.add.rectangle(W / 2, H / 2, W, H, col(c.tint), 1)
      .setDepth(this.cfg.ult.tintDepth).setAlpha(0);
    s.tweens.chain({
      targets: r,
      tweens: [
        { alpha: c.tintAlpha, duration: ms(c.tintIn) },
        { alpha: 0, delay: ms(c.tintHold), duration: ms(c.tintOut) },
      ],
      onComplete: () => r.destroy(),
    });
  },

  /** 필살기 시작 공통: 컷인 + 번쩍 + 히트스톱 + 강한 흔들림 + 화면 물들이기 */
  ultStart(c, title, sub, color) {
    this.juice.flash(c.flash);
    this.juice.hitstop(c.hitstop);
    this.juice.shake(c.shake);
    this.juice.sound('ultimate');
    this.screenTint(c);
    awakenCutin(this.scene, this.cfg.ult.cutin, { title, sub, color, fontFamily: this.fontFamily });
  },

  /** 일정 시간 동안 every 초마다 fn() */
  timed(sec, every, fn) {
    let left = sec;
    let acc = 0;
    this.addTicker((dt) => {
      left -= dt;
      acc += dt;
      while (acc >= every) { acc -= every; fn(); }
      return left > 0; // false → 제거
    });
  },

  // ---------- 🔥 연옥 ----------
  purgatoryStart(title, sub) {
    const c = this.cfg.ult.purgatory;
    const s = this.scene;
    const { width: W, height: H } = s.scale;
    this.ultStart(c, title, sub, col(c.color));
    // 하늘에서 불비가 쏟아지고, 바닥에서 거대한 불의 충격파
    this.timed(c.rainTime, c.rainEvery, () => this.p.emit(c.rain, Math.random() * W, -10, col(c.color)));
    this.sprites.play(c.floorWave, W / 2, H, col(c.color), { priority: 2 });
    this.sprites.play(c.floorWave, W / 2, H, col(c.hot), { priority: 2, scale: 0.6 });
  },

  /** 블록 아래에서 불기둥이 솟구침 */
  hellPillar(x, y) {
    const c = this.cfg.ult.purgatory;
    this.p.emit(c.pillar, x, y + 20, col(c.color));
    this.p.emit(c.flame, x, y, col(c.hot));
    this.p.emit(c.smoke, x, y - 30, col(c.color));
    this.sprites.play(c.pillarRing, x, y, col(c.color), { priority: 2 });
    this.sprites.play(c.pillarCore, x, y, col(c.hot), { priority: 2 });
  },

  purgatoryWave() {
    this.juice.shake(this.cfg.ult.purgatory.waveShake);
  },

  // ---------- ⚡ 뇌신의 심판 ----------
  judgmentStart(title, sub) {
    const c = this.cfg.ult.judgment;
    this.ultStart(c, title, sub, col(c.color));
  },

  /** 하늘에서 굵은 심판의 낙뢰 + 별 폭발. i = 몇 번째 낙뢰 (가끔 화면 번쩍) */
  judgmentBolt(x, yTop, y, i) {
    const c = this.cfg.ult.judgment;
    const color = col(c.color);
    this.lines.bolt(x, yTop, x, y, color, c.bolt);
    this.lines.bolt(x + (Math.random() - 0.5) * 30, yTop, x, y, color, c.bolt);
    this.sprites.play(c.ring, x, y, color, { priority: 2 });
    this.sprites.play(c.core, x, y, col(c.white), { priority: 2 });
    this.sprites.play(c.star, x, y, color, { priority: 2 });
    this.p.emit(c.spark, x, y, color);
    this.p.emit(c.arc, x, y, col(c.white));
    this.juice.shake(c.hitShake);
    if (i % c.skyFlashEvery === 0) this.juice.flash('white');
  },
};
