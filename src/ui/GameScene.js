import Phaser from 'phaser';
import balance from '../data/balance.json';
import layout from '../data/layout.json';
import theme from '../data/themes/neon.json';
import fxCfg from '../data/fx/default.json';
import levelsCfg from '../data/levels.json';
import draftCfg from '../data/draft.json';
import { EV, GameEvents } from '../core/events.js';
import { Grid } from '../core/Grid.js';
import { BallSystem } from '../core/BallSystem.js';
import { Leveling } from '../core/Leveling.js';
import { buildStageRow, stageHp } from '../core/stageLayout.js';
import { hex } from '../core/color.js';
import { ParticleFx } from '../fx/ParticleFx.js';
import { AugmentManager } from '../augments/AugmentManager.js';
import { buildChoices } from '../augments/draft.js';
import { loadSave, writeSave } from '../meta/save.js';
import { AimInput } from './AimInput.js';
import { Hud } from './Hud.js';
import { showGameOver } from './GameOverView.js';
import { showAugmentPick } from './AugmentPickView.js';

const STEP_MS = 1000 / balance.physics.stepHz;

/**
 * 무한 모드 한 판.
 * 턴 흐름: aim → fire → (공 전부 귀환) → turnEnd → 다음 턴
 * 레벨업이 생기면 aim/fire 중 언제든 'pick' 으로 멈추고 증강 선택 후 원래 단계로 복귀.
 */
export class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  create() {
    this.makeTextures();
    this.cameras.main.setBackgroundColor(theme.background);
    const g = fxCfg.glow;
    if (g.enabled && this.renderer.type === Phaser.WEBGL) {
      this.cameras.main.postFX.addBloom(0xffffff, 1, 1, g.blurStrength, g.strength, g.steps);
    }

    this.bus = new GameEvents();
    this.saveData = loadSave();
    this.startBest = this.saveData.bestStage; // 신기록 판정용
    this.state = {
      stage: 0,
      damage: balance.ball.startDamage,
      ballCount: balance.ball.startCount,
      phase: 'aim',
      launchX: layout.width / 2,
      speed: 1,
      turnMs: 0,
      stats: { ...balance.stats },
      ballFx: null,
    };

    const deps = { scene: this, bus: this.bus, layout, theme, balance, fxCfg, state: this.state };
    this.fx = new ParticleFx(this, fxCfg);
    this.grid = new Grid(this, deps);
    this.augments = new AugmentManager({ ...deps, grid: this.grid, fx: this.fx });
    this.balls = new BallSystem(this, { ...deps, grid: this.grid, fx: this.fx });
    this.leveling = new Leveling(this.bus, levelsCfg, this.state);
    this.hud = new Hud(this, deps);
    this.aim = new AimInput(this, { ...deps, onFire: (a) => this.fire(a) });

    this.add.rectangle(layout.width / 2, layout.floorY + 1, layout.width, 2, hex(theme.floor), 0.8).setDepth(5);
    this.launcher = {
      aura: this.add.image(0, 0, 'spark').setBlendMode(Phaser.BlendModes.ADD).setDepth(20),
      sprite: this.add.image(0, 0, 'ball').setDepth(21),
    };

    this.bindEvents();
    this.events.once('shutdown', () => this.bus.removeAllListeners());

    this.acc = 0;
    this.fpsTimer = 0;
    this.leveling.start(); // 레벨 1 → 메인 속성 선택 (첫 프레임에 열림)
    this.nextTurn();
  }

  /** 이미지 파일 없이 텍스처를 코드로 한 번만 그림 */
  makeTextures() {
    if (this.textures.exists('ball')) return;
    const r = layout.ballRadius;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(hex(theme.ball), 1).fillCircle(r, r, r);
    g.generateTexture('ball', r * 2, r * 2);
    g.clear();
    for (let i = 8; i >= 1; i--) g.fillStyle(0xffffff, 0.14).fillCircle(8, 8, i);
    g.generateTexture('spark', 16, 16);
    g.destroy();
  }

  bindEvents() {
    const { bus, fx, grid } = this;
    const cx = (c) => grid.centerX(c.col);
    const cy = (c) => grid.centerY(c.row);
    bus.on(EV.AFTER_HIT, ({ cell, source }) => {
      if (source?.type === 'ball') fx.emit('blockHit', cx(cell), cy(cell), cell.color);
    });
    bus.on(EV.KILL, ({ cell }) => { fx.emit('blockBreak', cx(cell), cy(cell), cell.color); this.hudDirty = true; });
    bus.on(EV.ORB_COLLECT, ({ cell }) => { fx.emit('orb', cx(cell), cy(cell), cell.color); this.hudDirty = true; });
  }

  // ---------- 턴 ----------
  nextTurn() {
    const s = this.state;
    const next = s.stage + 1;
    this.grid.shiftDown();
    this.grid.placeRow(buildStageRow(next, this.grid.cols));
    this.grid.setRefHp(stageHp(next) * balance.blocks.doubleMultiplier);
    if (this.grid.reachedBottom()) { this.gameOver(); return; }

    s.stage = next;
    s.phase = 'aim';
    s.speed = 1;
    s.turnMs = 0;
    this.enterAim();
    this.hud.showHint(s.stage === 1);
    this.hud.setSpeed(1);
    this.bus.emit(EV.TURN_START, { stage: s.stage });
    this.refreshHud();
  }

  enterAim() {
    this.balls.applyStats();
    this.placeLauncher(true);
    this.aim.enable(this.state.launchX, this.balls.launchY);
  }

  fire(angle) {
    const s = this.state;
    s.phase = 'fire';
    s.turnMs = 0;
    this.acc = 0;
    this.aim.disable();
    this.hud.showHint(false);
    this.placeLauncher(false);
    this.balls.launch(s.launchX, angle, s.ballCount);
  }

  endTurn() {
    const s = this.state;
    s.phase = 'end';
    s.launchX = this.balls.nextLaunchX;
    this.bus.emit(EV.TURN_END, { stage: s.stage });
    if (s.stage > this.saveData.bestStage) {
      this.saveData.bestStage = s.stage;
      writeSave(this.saveData); // 저장은 턴 끝에 한 번
    }
    this.nextTurn();
  }

  gameOver() {
    const s = this.state;
    s.phase = 'over';
    this.aim.disable();
    this.placeLauncher(false);
    this.hud.showHint(false);
    const best = Math.max(this.saveData.bestStage, s.stage);
    this.saveData.bestStage = best;
    writeSave(this.saveData);
    const info = { stage: s.stage, best, newBest: s.stage > this.startBest };
    this.bus.emit(EV.GAME_OVER, info);
    showGameOver(this, { layout, theme, balance }, info, () => this.scene.restart());
  }

  // ---------- 증강 선택 ----------
  openPick() {
    const s = this.state;
    const level = this.leveling.pending.shift();
    const kind = this.leveling.kindFor(level);
    const choice = buildChoices(kind, level, this.augments);
    if (!choice.options.length) return; // 고를 게 없으면 건너뜀

    this.resumePhase = s.phase;
    s.phase = 'pick';
    this.aim.disable();
    this.hud.showHint(false);
    const deps = { layout, theme, draftCfg, mgr: this.augments };
    showAugmentPick(this, deps, choice, level, (def) => {
      this.augments.add(def.id, choice.grade);
      s.ballFx = this.augments.ballFx;
      s.phase = this.resumePhase;
      this.acc = 0;
      if (s.phase === 'aim') {
        this.enterAim();
        this.hud.showHint(s.stage === 1);
      }
      this.refreshHud();
    });
  }

  placeLauncher(visible) {
    const x = this.state.launchX;
    const y = this.balls.launchY;
    const { sprite, aura } = this.launcher;
    this.balls.dress(this.launcher);
    sprite.setVisible(visible).setPosition(x, y);
    aura.setVisible(visible && !!this.state.ballFx).setPosition(x, y);
    this.hud.setBallCount(x, y + this.balls.r + 4, this.state.ballCount, visible);
  }

  refreshHud() {
    const s = this.state;
    this.hudDirty = false;
    this.hud.setInfo({
      stage: s.stage,
      damage: s.damage,
      best: Math.max(this.saveData.bestStage, s.stage),
    });
    const lv = this.leveling;
    const color = s.ballFx ? s.ballFx.color : undefined;
    this.hud.setLevel(lv.level, lv.progress, lv.isMax, color);
  }

  // ---------- 루프 ----------
  update(_time, delta) {
    const dt = Math.min(delta, 100);
    this.fx.update(dt / 1000);

    const s = this.state;
    if (this.leveling.pending.length && (s.phase === 'aim' || s.phase === 'fire')) this.openPick();

    if (s.phase === 'fire') {
      s.turnMs += dt;
      const t = balance.turn;
      const speed = s.turnMs > t.autoSpeedAfterSec * 1000 ? t.autoSpeedMultiplier : 1;
      if (speed !== s.speed) { s.speed = speed; this.hud.setSpeed(speed); }

      // 고정 스텝. 배속은 계산만 여러 번 돌리고 그리기는 1번. 레벨업 시 그 자리에서 멈춤.
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP_MS && n < balance.physics.maxStepsPerFrame && !this.leveling.pending.length) {
        for (let k = 0; k < s.speed; k++) this.balls.step();
        this.acc -= STEP_MS;
        n++;
      }
      if (n === balance.physics.maxStepsPerFrame) this.acc = 0;
      this.balls.sync();
      if (this.balls.isDone()) this.endTurn();
    }
    if (this.hudDirty) this.refreshHud();

    this.fpsTimer += delta;
    if (this.fpsTimer > 500) {
      this.fpsTimer = 0;
      this.hud.setFps(this.game.loop.actualFps, this.fx.count);
    }
  }
}
