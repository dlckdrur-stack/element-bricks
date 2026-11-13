import Phaser from 'phaser';
import { hex } from '../core/color.js';

const rand = (a, b) => a + Math.random() * (b - a);

/**
 * 선으로 그리는 연출을 Graphics 한 장(가산 혼합)에 매 프레임 다시 그린다.
 * - bolt  : 지그재그 번개선 (바깥 글로우 / 속성색 / 흰 중심 3겹, 깜빡임)
 * - beam  : 레일건 빔 (넓은 글로우 / 굵은 노랑 / 얇은 흰색, 가장자리 지지직, 끝에 가늘어지며 사라짐)
 * - charge: 공을 따라다니는 충전 링
 * - focus : 화면 가장자리 집중선
 * 번개선 개수 상한 lineBudget[quality]. 빔·집중선은 큰 연출이라 항상 유지.
 */
export class LineFx {
  constructor(scene, cfg) {
    this.cfg = cfg;
    this.g = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setDepth(32);
    this.W = scene.scale.width;
    this.H = scene.scale.height;
    this.items = [];
    this.charges = new Map();
    this.size = cfg.size ?? 1;
    this.setQuality(cfg.quality);
  }

  setQuality(q) { this.cap = this.cfg.lineBudget[q] ?? 20; }
  setSize(s) { this.size = s; }
  get count() { return this.items.length + this.charges.size; }

  bolt(x0, y0, x1, y1, color, c) {
    if (this.items.filter((i) => i.type === 'bolt').length >= this.cap) return;
    this.items.push({ type: 'bolt', x0, y0, x1, y1, color, c, t: 0, life: c.life, redraw: 0, pts: null, dim: false });
  }

  beam(x0, y0, x1, y1, color, c) {
    this.items.push({ type: 'beam', x0, y0, x1, y1, color, c, t: 0, life: c.hold + c.fade });
  }

  focus(c) {
    this.items.push({ type: 'focus', c, t: 0, life: c.life, redraw: 0, tris: null });
  }

  /** key 별 충전 링 하나. progress 0~1, target 은 {x,y} 를 가진 공 */
  charge(key, target, r, progress, color, c) {
    this.charges.set(key, { target, r, progress, color, c, t: 0 });
  }

  clearCharge(key) { this.charges.delete(key); }

  /** 끝점 사이 지그재그 점 (양 끝은 고정, 가운데일수록 크게 흔들림) */
  zigzag(x0, y0, x1, y1, segLen, jitter) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const n = Math.max(2, Math.ceil(len / (segLen * this.size)));
    const pts = [x0, y0];
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const j = (Math.random() * 2 - 1) * jitter * this.size * Math.sin(Math.PI * t);
      pts.push(x0 + dx * t + nx * j, y0 + dy * t + ny * j);
    }
    pts.push(x1, y1);
    return pts;
  }

  stroke(pts, w, color, a) {
    const g = this.g;
    g.lineStyle(w * this.size, color, a);
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.strokePath();
  }

  drawBolt(e, dt) {
    const c = e.c;
    e.redraw -= dt;
    if (!e.pts || e.redraw <= 0) {
      e.redraw = c.redraw;
      e.pts = this.zigzag(e.x0, e.y0, e.x1, e.y1, c.segLen, c.jitter);
      e.dim = Math.random() < c.dimChance;
    }
    const a = (e.dim ? c.dimAlpha : 1) * (1 - 0.5 * (e.t / e.life));
    this.stroke(e.pts, c.glowWidth, e.color, c.glowAlpha * a);
    this.stroke(e.pts, c.outerWidth, e.color, c.outerAlpha * a);
    this.stroke(e.pts, c.coreWidth, hex(c.coreColor), a);
  }

  drawBeam(e) {
    const c = e.c;
    const k = e.t < c.hold ? 1 : Math.max(0, 1 - (e.t - c.hold) / c.fade);
    const straight = [e.x0, e.y0, e.x1, e.y1];
    this.stroke(straight, c.outerWidth * k, hex(c.outerColor), c.outerAlpha * k);
    // 가장자리 지지직: 굵은 노랑을 두 번 흔들어 그림
    for (let p = 0; p < 2; p++) {
      this.stroke(this.zigzag(e.x0, e.y0, e.x1, e.y1, c.segLen, c.edgeJitter), c.midWidth * k, e.color, c.midAlpha * (0.6 + 0.4 * k));
    }
    this.stroke(straight, c.coreWidth * Math.max(0.35, k), hex(c.coreColor), 0.6 + 0.4 * k);
    if (e.t < c.hold + c.fade * 0.5) {
      for (let i = 0; i < c.crackles; i++) {
        const t = Math.random();
        const sx = e.x0 + (e.x1 - e.x0) * t;
        const sy = e.y0 + (e.y1 - e.y0) * t;
        const a = Math.random() * Math.PI * 2;
        const L = c.crackleLen * rand(0.5, 1) * this.size;
        const pts = this.zigzag(sx, sy, sx + Math.cos(a) * L, sy + Math.sin(a) * L, L / 4, c.crackleJitter);
        this.stroke(pts, 2, e.color, k);
      }
    }
  }

  drawFocus(e, dt) {
    const c = e.c;
    e.redraw -= dt;
    const cx = this.W / 2;
    const cy = this.H / 2;
    const R = Math.hypot(cx, cy);
    if (!e.tris || e.redraw <= 0) {
      e.redraw = c.redraw;
      e.tris = [];
      for (let i = 0; i < c.count; i++) {
        const a = Math.random() * Math.PI * 2;
        const r0 = R * c.inner * rand(1, 1.2);
        const w = c.width * rand(0.5, 1.3);
        const ox = -Math.sin(a) * w;
        const oy = Math.cos(a) * w;
        const bx = cx + Math.cos(a) * R * 1.05;
        const by = cy + Math.sin(a) * R * 1.05;
        e.tris.push([cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, bx + ox, by + oy, bx - ox, by - oy]);
      }
    }
    this.g.fillStyle(hex(c.color), c.alpha * (1 - e.t / e.life));
    for (const t of e.tris) this.g.fillTriangle(t[0], t[1], t[2], t[3], t[4], t[5]);
  }

  drawCharge(ch, dt) {
    const c = ch.c;
    ch.t += dt;
    const fade = Math.max(0, 1 - Math.max(0, ch.t - c.linger) / 0.25);
    if (fade <= 0) return false;
    const { x, y } = ch.target;
    const R = ch.r * c.radius;
    const g = this.g;
    const end = -Math.PI / 2 + Math.PI * 2 * ch.progress;
    g.lineStyle(c.width, ch.color, c.backAlpha * fade);
    g.strokeCircle(x, y, R);
    g.lineStyle(c.glowWidth, ch.color, c.glowAlpha * fade);
    g.beginPath(); g.arc(x, y, R, -Math.PI / 2, end, false); g.strokePath();
    g.lineStyle(c.width, ch.color, fade);
    g.beginPath(); g.arc(x, y, R, -Math.PI / 2, end, false); g.strokePath();
    g.fillStyle(0xffffff, fade);
    g.fillCircle(x + Math.cos(end) * R, y + Math.sin(end) * R, c.width * 0.9);
    return true;
  }

  update(dt) {
    this.g.clear();
    const items = this.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const e = items[i];
      e.t += dt;
      if (e.t >= e.life) { items[i] = items[items.length - 1]; items.pop(); continue; }
      if (e.type === 'bolt') this.drawBolt(e, dt);
      else if (e.type === 'beam') this.drawBeam(e);
      else this.drawFocus(e, dt);
    }
    for (const [key, ch] of this.charges) if (!this.drawCharge(ch, dt)) this.charges.delete(key);
  }
}
