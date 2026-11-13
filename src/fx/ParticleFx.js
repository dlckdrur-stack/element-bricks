import Phaser from 'phaser';
import { Pool } from '../core/Pool.js';

const rand = (a, b) => a + Math.random() * (b - a);

/**
 * 예산 기반 파티클. 프리셋은 data/fx/*.json.
 * - 동시 입자 상한 = budget[quality]
 * - 우선순위별 상한: priority 0(꼬리)·1(타격)·2(파괴) 순으로 먼저 잘림
 * - 한 프레임 생성 수 상한 spawnPerFrame
 */
export class ParticleFx {
  constructor(scene, cfg) {
    this.cfg = cfg;
    this.live = [];
    this.spawned = 0;
    this.pool = new Pool(
      () => scene.add.image(0, 0, 'spark').setBlendMode(Phaser.BlendModes.ADD).setDepth(30),
      (s) => s.setVisible(false),
    );
    this.setQuality(cfg.quality);
  }

  setQuality(q) {
    this.budget = this.cfg.budget[q] ?? this.cfg.budget.mid;
    this.caps = this.cfg.priorityCaps.map((f) => Math.floor(f * this.budget));
  }

  get count() { return this.live.length; }

  emit(name, x, y, color) {
    const p = this.cfg.presets[name];
    if (!p) return;
    const cap = this.caps[p.priority] ?? this.budget;
    for (let i = 0; i < p.count; i++) {
      if (this.live.length >= cap || this.spawned >= this.cfg.spawnPerFrame) return;
      const a = Math.random() * Math.PI * 2;
      const sp = rand(p.speed[0], p.speed[1]);
      const life = rand(p.life[0], p.life[1]);
      const scale = rand(p.scale[0], p.scale[1]);
      const s = this.pool.get().setVisible(true).setPosition(x, y).setTint(color).setAlpha(1).setScale(scale);
      this.live.push({ s, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, scale, drag: p.drag });
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
    const steps = Math.max(1, Math.floor(len / spacing));
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
      q.vx *= k; q.vy *= k;
      const t = q.life / q.max;
      q.s.x += q.vx * dt;
      q.s.y += q.vy * dt;
      q.s.setAlpha(t).setScale(q.scale * (0.4 + 0.6 * t));
    }
  }
}
