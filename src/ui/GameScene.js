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
import { Elites } from '../core/elites.js';
import { buildStageRow, stageHp, setStageMods, setPowerLevel } from '../core/stageLayout.js';
import { hex } from '../core/color.js';
import { Fx } from '../fx/Fx.js';
import { AugmentManager } from '../augments/AugmentManager.js';
import { getProfile, commitProfile } from '../meta/save.js';
import { loadRun, saveRun, restoreRun, clearRun } from '../meta/runSave.js';
import { AimInput } from './AimInput.js';
import { Hud } from './Hud.js';
import { RunWallet } from '../meta/RunWallet.js';
import { fadeIn } from './widgets.js';
import { t } from './i18n.js';
import { pickFlow } from './pickFlow.js';
import { runEnd } from './runEnd.js';
import { bossFlow } from './bossFlow.js';
import { getTier } from '../meta/tiers.js';
import { applyFxSettings, getSettings, settingsCfg } from '../meta/settings.js';
import { AutoQuality } from '../fx/AutoQuality.js';
import { setupRun } from '../meta/runSetup.js';
import { Pioneer } from '../meta/pioneer.js';
import { hookResonance } from '../meta/resonanceHooks.js';
import { DamageStats } from '../meta/dmgStats.js';

const STEP_MS = 1000 / balance.physics.stepHz;

/**
 * 무한 모드 한 판.
 * 턴 흐름: aim → fire → (공 전부 귀환) → turnEnd → 다음 턴
 * 레벨업이 생기면 aim/fire 중 언제든 'pick' 으로 멈추고 증강 선택 후 원래 단계로 복귀.
 */
export class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  /** data.resume = true 면 저장된 판을 이어서, data.tier = 난이도 티어 */
  init(data) {
    this.resume = !!data?.resume;
    this.tierId = data?.tier;
    this.boss = null; // 씬을 다시 시작해도 이전 판의 보스가 남지 않게
  }

  create() {
    fadeIn(this);
    this.fx = new Fx(this, fxCfg, { fontFamily: theme.fontFamily }); // 입자 텍스처·글로우(화면 1곳)도 여기서
    applyFxSettings(this.fx);
    const opt = getSettings();
    this.showFps = opt.showFps;
    this.autoQ = new AutoQuality(this.fx, fxCfg.qualities, settingsCfg.autoQuality, { enabled: opt.autoQuality, ceiling: opt.quality });

    this.bus = new GameEvents();
    this.saveData = getProfile();
    const run = this.resume ? loadRun() : null;
    this.tier = getTier(run?.tier ?? this.tierId ?? 'bronze');
    setStageMods(this.tier); // 티어별 블록 체력·개수
    this.startBest = this.saveData.tierBest?.[this.tier.id] ?? 0; // 신기록 판정용 (티어별)
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
    this.dmgStats = new DamageStats(this.bus); // 일시정지 화면의 피해 비율
    hookResonance(this.bus, this.state, meta.res); // 각인: 모든 피해·속성 효과·엘리트·방어 무시·구슬
    this.elites = new Elites({ ...deps, grid: this.grid, fx: this.fx, mgr: this.augments }); // Leveling 보다 먼저 (처치 경험치)
    this.leveling = new Leveling(this.bus, levelsCfg, this.state, meta.bonus);
    this.bus.on(EV.LEVEL_UP, ({ level }) => setPowerLevel(level)); // 성장한 만큼 블록 체력도
    this.wallet = new RunWallet(this.bus, balance.currency);
    this.wallet.tierMul = this.tier.currencyMul;
    this.wallet.bonusPct = meta.bonus.currencyPct; // 재화 200% 카드는 레벨 1 선택 때 더함
    this.pioneer = new Pioneer(balance.pioneer); // 레벨 1 카드 중 1장만 재화 200%
    this.hud = new Hud(this, deps);
    this.aim = new AimInput(this, { ...deps, onFire: (a) => this.fire(a) });

    this.add.rectangle(layout.width / 2, layout.floorY + 1, layout.width, 2, hex(theme.floor), 0.8).setDepth(5);
    this.look = this.balls.look;
    this.launcher = this.look.make();

    this.bindEvents();
    this.events.once('shutdown', () => this.bus.removeAllListeners());

    this.acc = 0;
    this.fpsTimer = 0;
    if (run) {
      restoreRun(this, run);
      setPowerLevel(this.leveling.level);
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
      const key = `${cell.col},${cell.row}`;
      const ball = source?.type === 'ball';
      fx.hit(cx(cell), cy(cell), cell.color, { key, amount: damage, crit: !!source?.crit, ball });
      if (ball && this.augments.main) fx.elementHit(cx(cell), cy(cell), this.augments.main, key);
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
    const bossNow = this.isBossStage(next); // 보스 스테이지: 새 줄 대신 보스
    const g = this.grid;
    if (g.halt > 0) g.halt--; // 하강 정지 턴: 블록도 안 내려오고 새 줄도 없음
    else {
      g.shiftDown();
      if (!bossNow) g.placeRow(buildStageRow(next, g.cols));
    }
    g.held = g.held.map((h) => Math.max(0, h - 1)); // 덩굴 속박 턴 감소
    this.grid.setRefHp(stageHp(next) * balance.blocks.doubleMultiplier);
    if (this.grid.reachedBottom()) { this.gameOver(); return; }

    s.stage = next;
    if (bossNow) this.startBoss();
    this.bus.emit(EV.TURN_START, { stage: s.stage });
    this.beginAim();
    if (!this.boss) saveRun(this); // 판 중간 저장: 턴 끝(새 줄이 내려온 직후)에 한 번, 바뀐 것만
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
    if (!this.tier.stages && s.stage > this.saveData.bestStage) { // 최고 기록은 챌린저(무한)만
      this.saveData.bestStage = s.stage;
      commitProfile(); // 저장은 턴 끝에 한 번
    }
    if (this.bossEndTurn()) return; // 보스전: 클리어·패배·다음 보스 턴
    this.nextTurn();
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
      tier: this.tier,
      damage: s.damage,
      best: Math.max(this.startBest, s.stage),
    });
    const lv = this.leveling;
    const color = s.ballFx ? s.ballFx.color : undefined;
    this.hud.setLevel(lv.level, lv.progress, lv.isMax, color);
    this.refreshUlt();
    const m = this.augments;
    this.hud.setFocus(m.roleText(t), m.main ? `#${m.color(m.main).toString(16).padStart(6, '0')}` : null);
  }

  /** 필살기 게이지 배지 (타격 수 게이지는 자주 바뀌어서 0.5초마다도 갱신) */
  refreshUlt() {
    const ults = [...this.augments.owned.values()].filter((a) => a.def.tier === 'awaken')
      .map((a) => ({ name: t(`aug.${a.def.id}.name`), n: a.state.count ?? 0, max: a.v.need, cd: a.state.cd ?? 0 }));
    this.hud.setUlt(ults, theme);
  }

  // ---------- 루프 ----------
  update(_time, delta) {
    const dt = Math.min(delta, 100);
    this.fx.update(dt / 1000);
    this.look.update(dt / 1000);
    this.boss?.update(dt / 1000);
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
    if (this.wallet.total !== this.shownEarned) this.hud.setEarned((this.shownEarned = this.wallet.total));

    const fps = this.game.loop.actualFps;
    this.autoQ.update(delta / 1000, fps);
    this.fpsTimer += delta;
    if (this.fpsTimer > 500) {
      this.fpsTimer = 0;
      this.hud.setFps(this.showFps, fps, this.fx.count, this.fx.quality);
      this.refreshUlt();
    }
  }
}

Object.assign(GameScene.prototype, pickFlow, runEnd, bossFlow); // openPick · ballPos · gameOver · victory · 보스전
