import Phaser from 'phaser';
import { EV } from './events.js';
import { Pool } from './Pool.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * 공 이동·반사. 물리 엔진 없이 고정 스텝(step() 1회 = 1/60초)으로 계산.
 * ball: { id, x, y, vx, vy, mul, age, pierce, pierceChain, passing[], view{sprite,aura} }
 * 능력치(state.stats): ballScale·ballDamageMul·crit·pierce 는 발사 시점에 반영.
 */
export class BallSystem {
  constructor(scene, { bus, grid, fx, layout, balance, state, fxCfg }) {
    this.scene = scene;
    this.bus = bus;
    this.grid = grid;
    this.fx = fx;
    this.state = state;
    this.cfg = balance.ball;
    this.auraCfg = fxCfg.aura;
    this.orbGain = balance.orb.damageGain;
    this.slideMs = balance.anim.returnSlideMs;
    this.baseR = layout.ballRadius;
    this.width = layout.width;
    this.top = layout.hudHeight;
    this.floor = layout.floorY;
    this.speed = this.cfg.speed;
    this.minVy = this.speed * Math.sin((this.cfg.minAngleDeg * Math.PI) / 180);

    this.pool = new Pool(() => ({
      aura: scene.add.image(0, 0, 'spark').setBlendMode(Phaser.BlendModes.ADD).setDepth(19),
      sprite: scene.add.image(0, 0, 'ball').setDepth(20),
    }), (v) => { v.sprite.setVisible(false); v.aura.setVisible(false); });
    this.active = [];
    this.queue = 0;
    this.timer = 0;
    this.nextId = 1;
    this.firstReturnX = null;
    this.originX = layout.width / 2;
    this.applyStats();
  }

  /** 공 크기 등 반영 (공이 날아다니지 않을 때만 호출) */
  applyStats() {
    const s = this.state.stats;
    this.scale = s.ballScale;
    this.r = this.baseR * s.ballScale;
    this.substeps = Math.max(1, Math.ceil(this.speed / (this.r * 0.8)));
  }

  get launchY() { return this.floor - this.r; }

  /** 발사 시작. angle: 라디안(위쪽이 음수) */
  launch(x, angle, count) {
    this.applyStats();
    this.originX = x;
    this.dirX = Math.cos(angle);
    this.dirY = Math.sin(angle);
    this.queue = Math.min(count, this.cfg.maxOnScreen);
    this.timer = 0;
    this.firstReturnX = null;
  }

  isDone() { return this.queue === 0 && this.active.length === 0; }

  get nextLaunchX() {
    const x = this.firstReturnX ?? this.originX;
    return clamp(x, this.r, this.width - this.r);
  }

  /** 고정 스텝 1회 */
  step() {
    if (this.queue > 0 && --this.timer <= 0) {
      this.spawn();
      this.queue--;
      this.timer = this.cfg.launchIntervalSteps;
    }
    const bfx = this.state.ballFx;
    const every = bfx ? this.auraCfg.trailEverySteps : this.cfg.trailEverySteps;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];
      b.age++;
      if (this.move(b)) {
        this.active[i] = this.active[this.active.length - 1];
        this.active.pop();
        this.returnBall(b);
      } else if (b.age % every === 0) {
        if (bfx) this.fx.emit(bfx.trail, b.x, b.y, bfx.color);
        else this.fx.emit('trail', b.x, b.y, 0xffffff);
      }
    }
  }

  /** 화면 표시 위치 동기화 (그리기는 프레임당 1번) */
  sync() {
    for (const b of this.active) {
      b.view.sprite.setPosition(b.x, b.y);
      b.view.aura.setPosition(b.x, b.y);
    }
  }

  /** 발사대·공 겉모습 (오라 = 메인 속성 색) */
  dress(view) {
    const bfx = this.state.ballFx;
    view.sprite.setVisible(true).setScale(this.scale);
    view.aura.setVisible(!!bfx);
    if (bfx) view.aura.setTint(bfx.color).setAlpha(this.auraCfg.alpha).setScale((this.r * this.auraCfg.scale) / 8);
    return view;
  }

  spawn() {
    const view = this.dress(this.pool.get());
    const s = this.state.stats;
    const b = {
      id: this.nextId++, x: this.originX, y: this.launchY,
      vx: this.dirX * this.speed, vy: this.dirY * this.speed, mul: 1, age: 0, view,
      pierce: s.pierce, pierceChain: 0, passing: [],
    };
    view.sprite.setPosition(b.x, b.y);
    view.aura.setPosition(b.x, b.y);
    this.active.push(b);
    this.bus.emit(EV.LAUNCH, { ball: b });
  }

  /** @returns true = 바닥으로 돌아옴 */
  move(b) {
    const r = this.r;
    const n = this.substeps;
    for (let s = 0; s < n; s++) {
      b.x += b.vx / n;
      b.y += b.vy / n;

      if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx); this.wall(b, 'left'); }
      else if (b.x > this.width - r) { b.x = this.width - r; b.vx = -Math.abs(b.vx); this.wall(b, 'right'); }
      if (b.y < this.top + r) { b.y = this.top + r; b.vy = Math.abs(b.vy); this.wall(b, 'top'); }
      if (b.vy > 0 && b.y >= this.launchY) { b.y = this.launchY; return true; }

      this.collideBlocks(b);
      this.collectOrbs(b);
    }
    return false;
  }

  wall(b, side) {
    this.fixAngle(b);
    const s = this.state.stats;
    if (s.pierceRefillOnWall) { b.pierce = s.pierce; b.pierceChain = 0; }
    this.fx.emit('wallBounce', b.x, b.y, 0xffffff);
    this.bus.emit(EV.WALL_BOUNCE, { ball: b, side });
  }

  /** 수평에 가까운 궤도를 막아 무한 왕복 방지 */
  fixAngle(b) {
    if (Math.abs(b.vy) >= this.minVy) return;
    b.vy = (b.vy >= 0 ? 1 : -1) * this.minVy;
    b.vx = (b.vx >= 0 ? 1 : -1) * Math.sqrt(this.speed * this.speed - b.vy * b.vy);
  }

  /** 공 타격 피해: 구슬 데미지 × 공 배율 × 치명타 × 관통 보너스 */
  hit(b, cell, extraMul) {
    const s = this.state.stats;
    const crit = Math.random() < s.critChance;
    const dmg = this.state.damage * s.ballDamageMul * b.mul * (crit ? s.critDamage : 1) * extraMul;
    if (crit) this.fx.emit('crit', b.x, b.y, 0xffffff);
    this.grid.damage(cell, dmg, { type: 'ball', ball: b, crit });
  }

  collideBlocks(b) {
    const r = this.r;
    const g = this.grid;
    let hit = null;
    let best = 0;
    let nx = 0;
    let ny = 0;
    const touching = [];

    g.query(b.x - r, b.y - r, b.x + r, b.y + r, (cell) => {
      if (cell.kind !== 'block') return;
      const { x, y, w, h } = g.bounds(cell);
      const cx = clamp(b.x, x, x + w);
      const cy = clamp(b.y, y, y + h);
      const dx = b.x - cx;
      const dy = b.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) return;
      touching.push(cell);
      if (b.passing.includes(cell)) return; // 관통 중인 블록은 무시

      if (b.pierce > 0) { // 관통: 튕기지 않고 피해만
        b.pierce--;
        b.pierceChain++;
        b.passing.push(cell);
        this.hit(b, cell, 1 + this.state.stats.pierceBonus * b.pierceChain);
        return;
      }

      let pen; let ux; let uy;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pen = r - d; ux = dx / d; uy = dy / d;
      } else { // 중심이 사각형 안: 가장 얕은 면으로 밀어냄
        const l = b.x - x; const rt = x + w - b.x; const t = b.y - y; const bt = y + h - b.y;
        const m = Math.min(l, rt, t, bt);
        pen = r + m;
        if (m === l) { ux = -1; uy = 0; } else if (m === rt) { ux = 1; uy = 0; }
        else if (m === t) { ux = 0; uy = -1; } else { ux = 0; uy = 1; }
      }
      // 이웃 블록 이음매에서 법선을 합쳐 평평한 면처럼 반사
      nx += ux * pen; ny += uy * pen;
      if (pen > best) { best = pen; hit = cell; }
    });
    if (b.passing.length) b.passing = b.passing.filter((c) => !c.dead && touching.includes(c));
    if (!hit) return;

    const len = Math.hypot(nx, ny) || 1;
    nx /= len; ny /= len;
    b.x += nx * best;
    b.y += ny * best;
    const dot = b.vx * nx + b.vy * ny;
    if (dot < 0) {
      b.vx -= 2 * dot * nx;
      b.vy -= 2 * dot * ny;
      const sp = Math.hypot(b.vx, b.vy) || 1; // 속도 크기 유지
      b.vx = (b.vx / sp) * this.speed;
      b.vy = (b.vy / sp) * this.speed;
    }
    this.fixAngle(b);
    this.hit(b, hit, 1);
  }

  collectOrbs(b) {
    const reach = this.r + this.grid.orbR;
    this.grid.query(b.x - reach, b.y - reach, b.x + reach, b.y + reach, (cell) => {
      if (cell.kind !== 'orb') return;
      const dx = b.x - this.grid.centerX(cell.col);
      const dy = b.y - this.grid.centerY(cell.row);
      if (dx * dx + dy * dy < reach * reach) {
        const gain = this.grid.collectOrb(cell, b, this.orbGain);
        if (gain) this.state.damage += gain;
      }
    });
  }

  returnBall(b) {
    const first = this.firstReturnX === null;
    if (first) this.firstReturnX = b.x;
    const last = this.isDone();
    this.bus.emit(EV.BALL_RETURN, { ball: b, first, last });
    const { sprite, aura } = b.view;
    sprite.setPosition(b.x, b.y);
    aura.setPosition(b.x, b.y);
    this.scene.tweens.add({
      targets: [sprite, aura], x: this.nextLaunchX, duration: this.slideMs,
      onComplete: () => this.pool.release(b.view),
    });
  }
}
