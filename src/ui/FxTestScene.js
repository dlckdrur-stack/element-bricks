import Phaser from 'phaser';
import balance from '../data/balance.json';
import layout from '../data/layout.json';
import theme from '../data/themes/neon.json';
import draftCfg from '../data/draft.json';
import testCfg from '../data/fx/test.json';
import { fxCfg } from '../fx/config.js';
import { EV, GameEvents } from '../core/events.js';
import { Grid } from '../core/Grid.js';
import { hex } from '../core/color.js';
import { Fx } from '../fx/Fx.js';
import { BallLook } from '../fx/BallLook.js';
import { AugmentManager } from '../augments/AugmentManager.js';
import { buildChoices } from '../augments/draft.js';
import { Hud } from './Hud.js';
import { showAugmentPick } from './AugmentPickView.js';
import { actions, BUTTONS } from './fxTestActions.js';
import { t } from './i18n.js';

const STEP = 1 / balance.physics.stepHz;

/**
 * 개발 모드 전용 이펙트 테스트 화면. 주소 뒤에 ?fxtest 를 붙여 연다.
 * 버튼으로 레일건·폭발·연쇄 번개·카드 선택·구슬 획득 등을 바로 재생하고,
 * 이펙트 품질(낮음~최고)과 크기(50~150%)를 바꿔 볼 수 있다.
 */
export class FxTestScene extends Phaser.Scene {
  constructor() { super('FxTest'); }

  create() {
    this.T = testCfg;
    this.theme = theme;
    this.balance = balance;
    this.cameras.main.setBackgroundColor(theme.background);
    this.fx = new Fx(this, fxCfg, { fontFamily: theme.fontFamily });
    this.bus = new GameEvents();
    this.state = {
      stage: 1, damage: this.T.startDamage, ballCount: 1, phase: 'test', launchX: layout.width / 2,
      speed: 1, stats: { ...balance.stats }, ballFx: null,
    };
    const deps = { scene: this, bus: this.bus, layout, theme, balance, fxCfg, state: this.state };
    this.grid = new Grid(this, deps);
    this.hud = new Hud(this, deps);
    this.hud.showHint(false);
    this.mgr = new AugmentManager({ bus: new GameEvents(), state: { stats: {} } });
    this.colors = { fire: this.mgr.color('fire'), lightning: this.mgr.color('lightning') };

    this.look = new BallLook(this, fxCfg, this.fx, this.state);
    this.ballR = layout.ballRadius;
    this.ball = { x: layout.width / 2, y: this.T.ball.y, vx: 0, vy: -1, age: 0, view: this.look.make() };
    this.look.dress(this.ball.view, this.ballR);
    this.lookIndex = 0;
    this.burnOn = false;
    this.busy = false;
    this.simT = 0;
    this.acc = 0;
    this.statT = 0;

    this.fx.burnAmbient(() => (this.burnOn ? this.grid.blocks().map((b) => ({
      x: this.grid.centerX(b.col), y: this.grid.centerY(b.row),
    })) : []), this.colors.fire);
    this.bind();
    this.refill();
    this.buildPanel();
    this.events.once('shutdown', () => this.bus.removeAllListeners());
  }

  bind() {
    const { bus, fx, grid } = this;
    const cx = (c) => grid.centerX(c.col);
    const cy = (c) => grid.centerY(c.row);
    bus.on(EV.AFTER_HIT, ({ cell, damage, source }) => {
      fx.hit(cx(cell), cy(cell), cell.color, {
        key: `${cell.col},${cell.row}`, amount: damage, crit: !!source?.crit, ball: source?.type === 'ball',
      });
    });
    bus.on(EV.KILL, ({ cell }) => {
      const b = grid.bounds(cell);
      fx.blockBreak(cx(cell), cy(cell), b.w, b.h, cell.color);
    });
    bus.on(EV.ORB_COLLECT, (ctx) => {
      fx.orbCollect(cx(ctx.cell), cy(ctx.cell), ctx.cell.color, t('orb.label', { n: ctx.gain }));
      this.hud.popDamage(fxCfg.combat.orb.hudPop);
      this.look.flareUp('orb');
      this.time.delayedCall(0, () => this.refreshHud());
    });
  }

  refreshHud() {
    this.hud.setInfo({ stage: this.state.stage, damage: this.state.damage, best: 0 });
    this.hud.setLevel(1, 0, false, this.state.ballFx?.color);
  }

  /** 블록·구슬을 다시 깜 */
  refill() {
    const g = this.grid;
    g.forEachCell((c) => g.remove(c, true));
    const [lo, hi] = this.T.blockHp;
    g.setRefHp(hi);
    for (let row = 0; row < this.T.blockRows; row++) {
      for (let col = 0; col < g.cols; col++) {
        const hp = Math.round(lo + Math.random() * (hi - lo));
        const cell = { kind: 'block', col, row, hp, maxHp: hp, view: null };
        g.cells[row][col] = cell;
        g.showBlock(cell);
        if (this.burnOn) { cell.labelColor = theme.burnLabel; g.refreshBlock(cell); }
      }
    }
    this.placeOrbs();
    this.refreshHud();
  }

  /** 블록 아래 줄에 구슬 몇 개 */
  placeOrbs() {
    const g = this.grid;
    const row = this.T.blockRows;
    const free = [];
    for (let col = 0; col < g.cols; col++) if (!g.cells[row][col]) free.push(col);
    free.sort(() => Math.random() - 0.5);
    let have = g.cells[row].filter((c) => c && c.kind === 'orb').length;
    for (const col of free) {
      if (have >= this.T.orbCount) break;
      const cell = { kind: 'orb', col, row, view: null };
      g.cells[row][col] = cell;
      g.showOrb(cell);
      g.fadeIn(cell);
      have++;
    }
  }

  openCards(kind, grade) {
    if (this.busy) return;
    this.busy = true;
    const mgr = new AugmentManager({ bus: new GameEvents(), state: { stats: {} } });
    let options;
    if (kind === 'main') options = buildChoices('main', 1, mgr).options;
    else {
      options = [...mgr.defs.values()].filter((d) => d.tier !== 'core' && mgr.isAvailable(d))
        .sort(() => Math.random() - 0.5).slice(0, draftCfg.choices);
    }
    const deps = {
      layout, theme, draftCfg, mgr, fx: this.fx, fxCfg, look: this.look,
      ballPos: () => ({ x: this.ball.x, y: this.ball.y }),
    };
    showAugmentPick(this, deps, { kind, grade, options }, this.T.panel.pickLevel, {
      onPick: (def) => {
        this.state.ballFx = {
          color: mgr.elements[def.element].aura, trail: fxCfg.ball.elementTrail, armorColor: this.colors.lightning,
        };
        this.look.dress(this.ball.view, this.ballR);
        this.refreshHud();
      },
      onDone: () => { this.busy = false; },
    });
  }

  // ---------- 버튼 ----------
  button(x, y, w, label, onClick) {
    const P = this.T.panel;
    const C = this.T.colors;
    const bg = this.add.rectangle(x, y, w, P.btnH, hex(C.button)).setStrokeStyle(2, hex(C.stroke), 0.6)
      .setDepth(50).setInteractive({ useHandCursor: true });
    const txt = this.add.text(x, y, label, {
      fontFamily: theme.fontFamily, fontSize: `${P.fontSize}px`, fontStyle: 'bold', color: C.buttonText,
    }).setOrigin(0.5).setDepth(51);
    bg.on('pointerdown', () => bg.setScale(0.95));
    bg.on('pointerout', () => bg.setScale(1));
    bg.on('pointerup', () => { bg.setScale(1); if (!this.busy) onClick(); });
    return { bg, txt, on: (v) => bg.setFillStyle(hex(v ? C.buttonOn : C.button)) };
  }

  buildPanel() {
    const P = this.T.panel;
    const W = layout.width;
    const colX = (i, n = P.cols) => W / 2 + (i - (n - 1) / 2) * (P.btnW + P.gap);
    this.stats = this.add.text(W / 2, P.statsY, '', {
      fontFamily: theme.fontFamily, fontSize: `${layout.fontSize.small}px`, color: theme.hudText,
    }).setOrigin(0.5).setDepth(50);

    BUTTONS.forEach((key, i) => {
      const b = this.button(colX(i % P.cols), P.top + Math.floor(i / P.cols) * P.rowH, P.btnW, t(`fxtest.${key}`), () => {
        const r = actions[key](this);
        if (key === 'look') b.txt.setText(t(`fxtest.lookName.${r}`));
      });
    });

    let row = P.top + Math.ceil(BUTTONS.length / P.cols) * P.rowH;
    this.qButtons = fxCfg.qualities.map((q, i) => {
      const b = this.button(colX(i), row, P.btnW, t(`fxtest.q.${q}`), () => this.setQuality(q));
      b.q = q;
      return b;
    });
    this.setQuality(this.fx.quality);

    row += P.rowH;
    const R = fxCfg.sizeRange;
    const sizeBtn = this.button(colX(1), row, P.btnW, '', () => {});
    const showSize = () => sizeBtn.txt.setText(t('fxtest.size', { n: Math.round(this.fx.size * 100) }));
    const step = (d) => {
      this.fx.setSize(Phaser.Math.Clamp(this.fx.size + d, R.min, R.max));
      showSize();
    };
    this.button(colX(0), row, P.btnW, t('fxtest.minus'), () => step(-R.step));
    this.button(colX(2), row, P.btnW, t('fxtest.plus'), () => step(R.step));
    this.button(colX(3), row, P.btnW, t('fxtest.back'), () => this.scene.start('Game'));
    showSize();
  }

  setQuality(q) {
    this.fx.setQuality(q);
    for (const b of this.qButtons) b.on(b.q === q);
  }

  // ---------- 루프 ----------
  update(_time, delta) {
    const dt = Math.min(delta, 100) / 1000;
    this.fx.update(dt);
    this.look.update(dt);

    // 공이 8자로 떠다니며 꼬리·불티를 보여줌 (히트스톱·슬로모션 반영)
    const B = this.T.ball;
    const b = this.ball;
    this.acc += dt * this.fx.juice.timeScale;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.simT += STEP;
      const nx = layout.width / 2 + Math.sin(this.simT * B.speed) * B.ampX;
      const ny = B.y + Math.sin(this.simT * B.speedY) * B.ampY;
      b.vx = nx - b.x;
      b.vy = ny - b.y;
      b.x = nx;
      b.y = ny;
      b.age++;
      this.look.tick(b);
    }
    this.look.place(b.view, b.x, b.y);
    this.look.animate(b.view);

    this.statT += dt;
    if (this.statT > 0.25) {
      this.statT = 0;
      const fx = this.fx;
      this.stats.setText(t('fxtest.stats', {
        fps: Math.round(this.game.loop.actualFps), p: fx.p.count, s: fx.sprites.count, l: fx.lines.count,
      }));
    }
  }
}
