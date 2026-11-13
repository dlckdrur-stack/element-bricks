import { Pool } from '../core/Pool.js';

/** 1234 → "1.2K" */
function fmt(n) {
  if (n >= 1e6) return `${Math.round(n / 1e5) / 10}M`;
  if (n >= 1e4) return `${Math.round(n / 100) / 10}K`;
  if (n >= 10) return String(Math.round(n));
  return String(Math.round(n * 10) / 10);
}

/**
 * 데미지 숫자 팝업: 튀어오르며 커졌다(popScale) 작아지고 위로 사라짐.
 * - 같은 칸에 한 프레임 안 여러 타격 → 합산해서 1개 (합치기 규칙)
 * - 화면 최대 max 개, 넘치면 가장 오래된 것을 재사용
 * - mode: 'all' | 'big'(치명타만) | 'off'
 */
export class DamageNumbers {
  constructor(scene, cfg, fontFamily) {
    this.cfg = cfg;
    this.mode = cfg.mode;
    this.size = 1;
    this.live = [];
    this.pending = new Map();
    this.style = {
      fontFamily, fontSize: `${cfg.fontSize}px`, fontStyle: 'bold',
      color: cfg.color, stroke: cfg.stroke, strokeThickness: cfg.strokeWidth,
    };
    this.pool = new Pool(
      () => scene.add.text(0, 0, '', this.style).setOrigin(0.5).setDepth(cfg.depth),
      (t) => t.setVisible(false),
    );
  }

  setSize(s) { this.size = s; }

  add(key, x, y, amount, crit) {
    if (this.mode === 'off' || (this.mode === 'big' && !crit) || amount <= 0) return;
    const p = this.pending.get(key);
    if (p) { p.amount += amount; p.crit ||= crit; return; }
    this.pending.set(key, { x, y, amount, crit });
  }

  /** 아무 글자나 같은 방식으로 띄움 (구슬 "+1" 등). o: {fontSize, color, rise, life, popScale} */
  popText(x, y, text, o = {}) {
    const c = this.cfg;
    const fs = (o.fontSize ?? c.fontSize) * this.size;
    return this.spawn(x, y, text, o.color ?? c.color, fs, o.rise ?? c.rise, o.life ?? c.life, o.popScale ?? c.popScale);
  }

  spawn(x, y, text, color, fs, rise, life, pop) {
    let e;
    if (this.live.length >= this.cfg.max) e = this.live.shift();
    else e = { t: this.pool.get() };
    e.t.setVisible(true).setText(text).setColor(color).setFontSize(fs).setPosition(x, y).setAlpha(1).setScale(this.cfg.popFrom);
    Object.assign(e, { x, y, age: 0, life, rise: rise * this.size, pop });
    this.live.push(e);
    return e;
  }

  flush() {
    const c = this.cfg;
    for (const p of this.pending.values()) {
      const fs = (p.crit ? c.critFontSize : c.fontSize) * this.size;
      const x = p.x + (Math.random() * 2 - 1) * c.spreadX;
      this.spawn(x, p.y, fmt(p.amount), p.crit ? c.critColor : c.color, fs, c.rise, c.life, c.popScale);
    }
    this.pending.clear();
  }

  update(dt) {
    if (this.pending.size) this.flush();
    const c = this.cfg;
    const live = this.live;
    for (let i = live.length - 1; i >= 0; i--) {
      const e = live[i];
      e.age += dt;
      if (e.age >= e.life) {
        this.pool.release(e.t);
        live.splice(i, 1);
        continue;
      }
      const a = e.age;
      let s;
      if (a < c.popTime) s = c.popFrom + (e.pop - c.popFrom) * (a / c.popTime);
      else if (a < c.popTime + c.settleTime) s = e.pop + (1 - e.pop) * ((a - c.popTime) / c.settleTime);
      else s = 1;
      const k = a / e.life;
      const up = 1 - (1 - k) * (1 - k);
      e.t.setScale(s).setY(e.y - e.rise * up);
      e.t.setAlpha(k < c.fadeFrom ? 1 : 1 - (k - c.fadeFrom) / (1 - c.fadeFrom));
    }
  }
}
