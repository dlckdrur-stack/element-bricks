import fireData from '../data/augments/fire.json';
import lightningData from '../data/augments/lightning.json';
import { hex } from '../core/color.js';
import { BallLook } from '../fx/BallLook.js';

const ELEMENTS = { fire: fireData, lightning: lightningData };
const STEP = 1 / 60;

/** 메인 메뉴 배경: 속성 불꽃 공 하나가 화면 안을 천천히 튕긴다 (게임과 같은 4겹 공 모양) */
export class MenuBall {
  constructor(scene, fx, fxCfg, cfg, { width, height }) {
    const el = ELEMENTS[cfg.element] ?? fireData;
    this.state = { damage: 1, ballFx: { color: hex(el.auraColor), trail: fxCfg.ball.elementTrail } };
    this.look = new BallLook(scene, fxCfg, fx, this.state);
    this.view = this.look.dress(this.look.make(), cfg.radius);
    const m = cfg.margin;
    this.box = { x0: m, y0: m, x1: width - m, y1: height - m };
    const a = Math.random() * Math.PI * 2;
    this.b = {
      x: width / 2, y: height * 0.7, vx: Math.cos(a) * cfg.speed, vy: Math.sin(a) * cfg.speed, age: 0,
    };
    this.acc = 0;
  }

  step() {
    const b = this.b;
    const k = this.box;
    b.x += b.vx;
    b.y += b.vy;
    if (b.x < k.x0 || b.x > k.x1) { b.vx = -b.vx; b.x = Math.min(k.x1, Math.max(k.x0, b.x)); }
    if (b.y < k.y0 || b.y > k.y1) { b.vy = -b.vy; b.y = Math.min(k.y1, Math.max(k.y0, b.y)); }
    b.age++;
    this.look.tick(b);
  }

  /** 고정 스텝(60Hz) */
  update(dt) {
    this.acc += dt;
    while (this.acc >= STEP) { this.step(); this.acc -= STEP; }
    this.look.update(dt);
    this.look.place(this.view, this.b.x, this.b.y);
    this.look.animate(this.view);
  }
}
