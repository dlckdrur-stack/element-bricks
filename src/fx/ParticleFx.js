import Phaser from 'phaser';
import { Pool } from '../core/Pool.js';

const rand = (a, b) => a + Math.random() * (b - a);
const range = (v, d) => (Array.isArray(v) ? rand(v[0], v[1]) : v ?? d);
const D2R = Math.PI / 180;

/**
 * 예산 기반 파티클. 프리셋은 data/fx/particles.json.
 * - 동시 입자 상한 = budget[quality] (opts.budget 로 따로 줄 수 있음: 카드 화면용)
 * - 우선순위별 상한: priority 0(꼬리)·1(타격)·2(폭발·큰 연출) 순으로 먼저 잘림
 * - 한 프레임 생성 수 상한 spawnPerFrame[quality]
 * - 입자 수는 countMul[quality], 크기·속도는 size(50~150%) 배율
 */
export class ParticleFx {
  constructor(scene, cfg, opts = {}) {
    this.cfg = cfg;
    this.presets = cfg.presets;
    this.opts = opts;
    this.live = [];
    this.spawned = 0;
    this.size = cfg.size ?? 1;
    this.pool = new Pool(() => {
      const s = scene.add.image(0, 0, 'fx', 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(opts.depth ?? 30);
      opts.onCreate?.(s);
      return s;
    }, (s) => s.setVisible(false));
    this.setQuality(opts.quality ?? cfg.quality);
  }

  setQuality(q) {
    const c = this.cfg;
    this.quality = q;
    this.budget = this.opts.budget ?? c.budget[q] ?? c.budget.mid;
    this.caps = c.priorityCaps.map((f) => Math.floor(f * this.budget));
    this.countMul = c.countMul[q] ?? 1;
    this.perFrame = c.spawnPerFrame[q] ?? 80;
  }

  setSize(s) { this.size = s; }

  get count() { return this.live.length; }

  /** 품질 배율을 적용한 개수 (소수점은 확률로) */
  countFor(p, mul = 1) {
    const n = range(p.count, 1) * this.countMul * mul;
    const whole = Math.floor(n);
    return whole + (Math.random() < n - whole ? 1 : 0);
  }

  /**
   * opts: { dir: 각도 범위를 돌릴 기준(도), mul: 개수 배율, scale: 크기 배율 }
   */
  emit(name, x, y, color, o) {
    const p = this.presets[name];
    if (!p) return;
    const cap = this.caps[p.priority] ?? this.budget;
    const n = this.countFor(p, o?.mul);
    const sz = this.size * (o?.scale ?? 1);
    const rot = (o?.dir ?? 0) * D2R;
    for (let i = 0; i < n; i++) {
      if (this.live.length >= cap || this.spawned >= this.perFrame) return;
      const a = p.angle ? rand(p.angle[0], p.angle[1]) * D2R + rot : Math.random() * Math.PI * 2;
      const sp = rand(p.speed[0], p.speed[1]) * sz;
      const life = rand(p.life[0], p.life[1]);
      const scale = rand(p.scale[0], p.scale[1]) * sz;
      const j = (p.jitter ?? 0) * sz;
      const px = j ? x + (Math.random() * 2 - 1) * j : x;
      const py = j ? y + (Math.random() * 2 - 1) * j : y;
      const alpha = p.alpha ?? 1;
      const s = this.pool.get().setVisible(true).setFrame(p.frame ?? 'glow').setPosition(px, py)
        .setTint(color).setAlpha(alpha).setScale(scale).setRotation(p.stretch ? a : Math.random() * 6.28);
      this.live.push({
        s, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, scale, alpha,
        end: p.scaleEnd ?? 0.4, drag: p.drag ?? 0, g: (p.gravity ?? 0) * sz,
        spin: p.spin ? (Math.random() * 2 - 1) * p.spin : 0, stretch: p.stretch ?? 0,
      });
      this.spawned++;
    }
  }

  /** 선분을 따라 입자를 찍음 (연쇄 번개·레일건). jitter: 수직 방향 흔들림(px) */
  line(name, x0, y0, x1, y1, color, spacing, jitter = 0) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const nx = -dy / len;
    const ny = dx / len;
    const steps = Math.max(1, Math.floor(len / (spacing * this.size)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const j = jitter ? (Math.random() * 2 - 1) * jitter : 0;
      this.emit(name, x0 + dx * t + nx * j, y0 + dy * t + ny * j, color);
    }
  }

  /** 매 프레임 1회 (dt: 초) */
  update(dt) {
    this.spawned = 0;
    const live = this.live;
    for (let i = live.length - 1; i >= 0; i--) {
      const q = live[i];
      q.life -= dt;
      if (q.life <= 0) {
        this.pool.release(q.s);
        live[i] = live[live.length - 1];
        live.pop();
        continue;
      }
      const k = Math.max(0, 1 - q.drag * dt);
      q.vy += q.g * dt;
      q.vx *= k; q.vy *= k;
      const t = q.life / q.max;
      const s = q.s;
      s.x += q.vx * dt;
      s.y += q.vy * dt;
      const sc = q.scale * (q.end + (1 - q.end) * t);
      s.setAlpha(q.alpha * t);
      if (q.stretch) {
        const v = Math.hypot(q.vx, q.vy);
        s.setRotation(Math.atan2(q.vy, q.vx)).setScale(sc * (1 + q.stretch * Math.min(1, v / 250)), sc);
      } else {
        s.setScale(sc);
        if (q.spin) s.rotation += q.spin * dt;
      }
    }
  }

  /** 카드 화면처럼 잠깐 쓰는 인스턴스 정리 */
  destroy() {
    for (const q of this.live) q.s.destroy();
    for (const s of this.pool.free) s.destroy();
    this.live = [];
    this.pool.free = [];
  }
}
