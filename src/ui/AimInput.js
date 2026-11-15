import { hex } from '../core/color.js';

/**
 * 스와이프 조준: 화면 아무 곳이나 누르고 아래로 끌면 반대(위) 방향으로 조준선,
 * 손을 떼면 onFire(angle). 너무 짧게 끌었거나 아래를 향하면 취소.
 */
export class AimInput {
  constructor(scene, { layout, balance, theme, onFire }) {
    this.scene = scene;
    this.cfg = balance.aim;
    this.minAngle = (balance.ball.minAngleDeg * Math.PI) / 180;
    this.width = layout.width;
    this.top = layout.hudHeight;
    this.r = layout.ballRadius;
    this.onFire = onFire;
    this.color = hex(theme.aim);
    this.enabled = false;
    this.dragging = false;
    this.angle = null;
    this.origin = { x: layout.width / 2, y: layout.floorY - layout.ballRadius };
    this.gfx = scene.add.graphics().setDepth(25);

    scene.input.on('pointerdown', this.down, this);
    scene.input.on('pointermove', this.move, this);
    scene.input.on('pointerup', this.up, this);
    scene.input.on('pointerupoutside', this.up, this);
  }

  enable(x, y) {
    this.origin.x = x;
    this.origin.y = y;
    this.enabled = true;
    this.dragging = false;
    this.angle = null;
  }

  disable() {
    this.enabled = false;
    this.dragging = false;
    this.gfx.clear();
  }

  down(p) {
    if (!this.enabled) return;
    this.dragging = true;
    this.sx = p.x;
    this.sy = p.y;
    this.angle = null;
  }

  move(p) {
    if (!this.enabled || !this.dragging) return;
    const dx = this.sx - p.x;
    const dy = this.sy - p.y;
    if (Math.hypot(dx, dy) < this.cfg.minDragPx || dy > -this.cfg.minDragPx * 0.25) {
      this.angle = null;
      this.gfx.clear();
      return;
    }
    let a = Math.atan2(dy, dx); // (-π, 0) 위쪽
    a = Math.min(-this.minAngle, Math.max(-Math.PI + this.minAngle, a));
    this.angle = a;
    this.drawGuide(a);
  }

  up() {
    if (!this.enabled || !this.dragging) return;
    this.dragging = false;
    const a = this.angle;
    this.gfx.clear();
    if (a !== null) this.onFire(a);
  }

  /** 점선 조준선 (좌우 벽 반사 포함) */
  drawGuide(angle) {
    const g = this.gfx;
    g.clear();
    let x = this.origin.x;
    let y = this.origin.y;
    let vx = Math.cos(angle);
    const vy = Math.sin(angle);
    const gap = this.cfg.guideDotGap;
    const n = Math.floor(this.cfg.guideLength / gap);
    for (let i = 1; i <= n; i++) {
      x += vx * gap;
      y += vy * gap;
      if (x < this.r) { x = 2 * this.r - x; vx = -vx; }
      if (x > this.width - this.r) { x = 2 * (this.width - this.r) - x; vx = -vx; }
      if (y < this.top) break;
      g.fillStyle(this.color, 1 - (i / n) * 0.8);
      g.fillCircle(x, y, 4 - (i / n) * 2);
    }
  }
}
