import Phaser from 'phaser';
import balance from '../data/balance.json';
import layout from '../data/layout.json';
import theme from '../data/themes/neon.json';
import { fxCfg } from '../fx/config.js';
import levelsCfg from '../data/levels.json';
import { EV, GameEvents } from '../core/events.js';
import { Grid } from '../core/Grid.js';
import { BallSystem } from '../core/BallSystem.js';
import { Leveling } from '../core/Leveling.js';
import { buildStageRow, stageHp } from '../core/stageLayout.js';
import { hex } from '../core/color.js';
import { Fx } from '../fx/Fx.js';
import { AugmentManager } from '../augments/AugmentManager.js';
import { getProfile, commitProfile } from '../meta/save.js';
import { loadRun, saveRun, restoreRun, clearRun } from '../meta/runSave.js';
import { AimInput } from './AimInput.js';
import { Hud } from './Hud.js';
import { showResult } from './ResultView.js';
import { RunWallet } from '../meta/RunWallet.js';
import { goTo, fadeIn } from './widgets.js';
import { t } from './i18n.js';
import { pickFlow } from './pickFlow.js';
import { applyFxSettings, getSettings, settingsCfg } from '../meta/settings.js';
import { AutoQuality } from '../fx/AutoQuality.js';
import { setupRun } from '../meta/runSetup.js';
import { Pioneer } from '../meta/pioneer.js';

const STEP_MS = 1000 / balance.physics.stepHz;

/**
 * 무한 모드 한 판.
 * 턴 흐름: aim → fire → (공 전부 귀환) → turnEnd → 다음 턴
 * 레벨업이 생기면 aim/fire 중 언제든 'pick' 으로 멈추고 증강 선택 후 원래 단계로 복귀.
 */
export class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  /** data.resume = true 면 저장된 판을 이어서 */
  init(data) { this.resume = !!data?.resume; }

  create() {
    fadeIn(this);
    this.fx = new Fx(this, fxCfg, { fontFamily: theme.fontFamily }); // 입자 텍스처·글로우(화면 1곳)도 여기서
    applyFxSettings(this.fx);
    const opt = getSettings();
    this.showFps = opt.showFps;
    this.autoQ = new AutoQuality(this.fx, fxCfg.qualities, settingsCfg.autoQuality, { enabled: opt.autoQuality, ceiling: opt.quality });

    this.bus = new GameEvents();
    this.saveData = getProfile();
    this.startBest = this.saveData.bestStage; // 신기록 판정용
    const meta = setupRun(balance); // 영구 강화 반영
    this.state = {
      stage: 0,
      damage: balance.ball.startDamage,
      ballCount: meta.ballCount,
      rerolls: meta.rerolls,
      phase: 'aim',
      launchX: layout.width / 2,
      speed: 1,
      turnMs: 0,
      stats: { ...meta.baseStats },
      ballFx: null,
    };

    const deps = {
      scene: this, bus: this.bus, layout, theme, balance, fxCfg, state: this.state, bonus: meta.bonus, baseStats: meta.baseStats,
    };
    this.grid = new Grid(this, deps);
    this.augments = new AugmentManager({ ...deps, grid: this.grid, fx: this.fx });
    this.balls = new BallSystem(this, { ...deps, grid: this.grid, fx: this.fx });
    this.leveling = new Leveling(this.bus, levelsCfg, this.state, meta.bonus);
    this.wallet = new RunWallet(this.bus, balance.currency);
    this.wallet.bonusPct = meta.bonus.currencyPct; // 개척 보너스는 레벨 1 선택 때 더함
    const cores = [...this.augments.defs.values()].filter((d) => d.tier === 'core').map((d) => d.id);
    this.pioneer = new Pioneer(this.bus, this.saveData, cores, balance.pioneer);
    this.hud = new Hud(this, deps);
    this.aim = new AimInput(this, { ...deps, onFire: (a) => this.fire(a) });

    this.add.rectangle(layout.width / 2, layout.floorY + 1, layout.width, 2, hex(theme.floor), 0.8).setDepth(5);
    this.look = this.balls.look;
    this.launcher = this.look.make();

    this.bindEvents();
    this.events.once('shutdown', () => this.bus.removeAllListeners());

    this.acc = 0;
    this.fpsTimer = 0;
    const run = this.resume ? loadRun() : null;
    if (run) {
      restoreRun(this, run);
      this.grid.setRefHp(stageHp(run.stage) * balance.blocks.doubleMultiplier);
      this.beginAim();
    } else {
      clearRun();
      this.leveling.start(); // 레벨 1 → 메인 속성 선택 (첫 프레임에 열림)
      this.nextTurn();
    }
  }

  bindEvents() {
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
      this.hudDirty = true;
    });
    bus.on(EV.ORB_COLLECT, (ctx) => {
      const { cell } = ctx;
      fx.orbCollect(cx(cell), cy(cell), cell.color, t('orb.label', { n: ctx.gain }));
      this.hud.popDamage(fxCfg.combat.orb.hudPop);
      this.look.flareUp('orb');
      this.hudDirty = true;
    });
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
    this.bus.emit(EV.TURN_START, { stage: s.stage });
    this.beginAim();
    saveRun(this); // 판 중간 저장: 턴 끝(새 줄이 내려온 직후)에 한 번, 바뀐 것만
  }

  beginAim() {
    const s = this.state;
    s.phase = 'aim';
    s.speed = 1;
    s.turnMs = 0;
    this.enterAim();
    this.hud.showHint(s.stage === 1);
    this.hud.setSpeed(1);
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
      commitProfile(); // 저장은 턴 끝에 한 번
    }
    this.nextTurn();
  }

  gameOver() {
    const s = this.state;
    s.phase = 'over';
    clearRun();
    this.aim.disable();
    this.placeLauncher(false);
    this.hud.showHint(false);
    const best = Math.max(this.saveData.bestStage, s.stage);
    this.saveData.bestStage = best;
    commitProfile();
    const w = this.wallet;
    const info = { stage: s.stage, best, newBest: s.stage > this.startBest, total: w.total, bonusPct: w.bonusPct };
    this.saveData.currency += info.total; // 재화는 연출 전에 바로 저장
    this.pioneer.settle();
    commitProfile();
    this.bus.emit(EV.GAME_OVER, info);
    showResult(this, info, {
      onRetry: () => goTo(this, 'Game', { resume: false }),
      onMenu: () => goTo(this, 'Menu'),
    });
  }

  placeLauncher(visible) {
    const x = this.state.launchX;
    const y = this.balls.launchY;
    this.balls.dress(this.launcher);
    this.look.place(this.launcher, x, y);
    this.look.setVisible(this.launcher, visible);
    this.launcherOn = visible;
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
    const ults = [...this.augments.owned.values()].filter((a) => a.def.tier === 'awaken')
      .map((a) => ({ name: t(`aug.${a.def.id}.name`), turns: a.state.turns ?? 0, max: a.v.cooldown }));
    this.hud.setUlt(ults, theme);
  }

  // ---------- 루프 ----------
  update(_time, delta) {
    const dt = Math.min(delta, 100);
    this.fx.update(dt / 1000);
    this.look.update(dt / 1000);
    if (this.launcherOn) this.look.animate(this.launcher);

    const s = this.state;
    if (this.leveling.pending.length && (s.phase === 'aim' || s.phase === 'fire')) this.openPick();

    // 레벨업 직후 슬로모션 동안은 선택 화면 뒤에서 공이 느리게 계속 움직임
    const juice = this.fx.juice;
    const slowPick = s.phase === 'pick' && this.resumePhase === 'fire' && juice.slowActive;
    if (s.phase === 'fire' || slowPick) {
      if (s.phase === 'fire') {
        s.turnMs += dt;
        const tc = balance.turn;
        const speed = s.turnMs > tc.autoSpeedAfterSec * 1000 ? tc.autoSpeedMultiplier : 1;
        if (speed !== s.speed) { s.speed = speed; this.hud.setSpeed(speed); }
      }

      // 고정 스텝. 배속은 계산만 여러 번 돌리고 그리기는 1번. 히트스톱이면 멈춤, 슬로모션이면 느리게.
      // 레벨업이 생기면 그 자리에서 멈추고(다음 프레임에 선택 화면 + 슬로모션).
      this.acc += dt * juice.timeScale;
      let n = 0;
      while (this.acc >= STEP_MS && n < balance.physics.maxStepsPerFrame && (slowPick || !this.leveling.pending.length)) {
        for (let k = 0; k < s.speed; k++) this.balls.step();
        this.acc -= STEP_MS;
        n++;
      }
      if (n === balance.physics.maxStepsPerFrame) this.acc = 0;
      this.balls.sync();
      if (s.phase === 'fire' && this.balls.isDone()) this.endTurn();
    }
    if (this.hudDirty) this.refreshHud();

    const fps = this.game.loop.actualFps;
    this.autoQ.update(delta / 1000, fps);
    this.fpsTimer += delta;
    if (this.fpsTimer > 500) {
      this.fpsTimer = 0;
      this.hud.setFps(this.showFps, fps, this.fx.count, this.fx.quality);
    }
  }
}

Object.assign(GameScene.prototype, pickFlow); // openPick · ballPos
