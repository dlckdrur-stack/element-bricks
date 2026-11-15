import Phaser from 'phaser';
import cfg from '../data/bosses.json';
import { EV } from './events.js';
import { hex } from './color.js';
import { stageHp, stageBase } from './stageLayout.js';
import { patterns, patternsFor } from './bossPatterns.js';
import { awakenCutin } from '../ui/Cutin.js';
import { t } from '../ui/i18n.js';

const ADD = Phaser.BlendModes.ADD;
const V = cfg.view;

/**
 * 보스 블록 (3×2칸, 격자 밖). grid.boss 로 등록되어 공·증강·필살기가 일반 블록처럼 때린다.
 * kind='block' + boss=true 라서 grid.damage 를 그대로 쓰고, 화면 표시는 자기 컨테이너(ui).
 * 패턴(bossPatterns.js)의 조건을 맞추면 피해 ×bonus, 보호막이면 0.
 * turnsLeft 턴 안에 못 깨면 패배.
 */
export class Boss {
  constructor(scene, { grid, bus, fx, state, theme, tier, rng = Math.random, onDefeat }) {
    this.onDefeat = onDefeat;
    this.kind = 'block';
    this.boss = true;
    this.scene = scene;
    this.grid = grid;
    this.fx = fx;
    this.theme = theme;
    this.tier = tier;
    this.rng = rng;
    const tc = cfg.tiers[tier.id];
    this.variant = tc.variants ? tc.variants[Math.floor(rng() * tc.variants.length)] : tc; // 골드는 두 보스 중 무작위
    this.nameKey = `boss.name.${this.variant.name ?? tier.id}`;
    this.size = { ...cfg.size, ...this.variant.size }; // 티어별 크기 (반사의 거울은 1칸)
    this.cols = this.size.cols;
    this.rows = this.size.rows;
    const stage = state.stage;
    const extra = tier.stages ? 0 : Math.max(0, stage / cfg.challengerEvery - 1) * cfg.challengerGrowth;
    this.maxHp = Math.ceil(stageHp(stage) * cfg.hpMul[tier.id] * (1 + extra));
    this.hp = this.maxHp;
    this.base = stageBase(stage) * cfg.currencyMul; // 깨면 재화 (블록 기본 체력 기준)
    this.colorHex = tier.color;
    this.color = hex(tier.color);
    this.turnsLeft = this.variant.turns ?? cfg.turns;
    this.dead = false;
    this.names = patternsFor(tier.id, rng, this.variant);
    this.list = this.names.map((n) => patterns[n]);
    this.g = {
      grid, state, fx, rng, now: () => scene.time.now / 1000, stageHp: () => stageHp(state.stage),
    };
    this.makeView();
    this.moveTo(this.size.col, this.size.row, false);
    this.clearArea();
    grid.boss = this;
    for (const p of this.list) p.spawn?.(this, this.g);
    if (this.splitsLeft) this.base = Math.ceil(this.base / (this.splitsLeft + 1)); // 분열마다 나눠서 지급
    this.refresh(); // 약점 등 패턴 상태 반영
    this.bind(bus);
    this.intro();
  }

  // ---------- 위치 ----------
  moveTo(col, row, fx = true) {
    const g = this.grid;
    if (fx && this.ui) this.fx.sprites.play(cfg.fx.teleportRing, this.x + this.w / 2, this.y + this.h / 2, this.color, { priority: 2 });
    this.x = col * g.cellW + g.pad;
    this.y = g.top + row * g.cellH + g.pad;
    this.w = this.cols * g.cellW - g.pad * 2;
    this.h = this.rows * g.cellH - g.pad * 2;
    this.col = col + 1;  // 증강이 쓰는 기준 칸 (가운데 열, 아래 줄)
    this.row = row + this.rows - 1;
    this.ui.setPosition(this.x + this.w / 2, this.y + this.h / 2);
    if (fx) this.fx.sprites.play(cfg.fx.teleportRing, this.x + this.w / 2, this.y + this.h / 2, this.color, { priority: 2 });
  }

  /** 등장할 때 보스 자리의 블록은 흡수 */
  clearArea() {
    const c0 = this.size.col;
    const below = this.variant.clearBelow ?? 0; // 브론즈: 보스 아래 줄을 비워 길을 열어 줌
    for (let r = this.size.row; r < Math.min(this.grid.rows, this.size.row + this.rows + below); r++) {
      for (let c = c0; c < c0 + this.cols; c++) {
        const cell = this.grid.cells[r][c];
        if (cell) { cell.dead = true; this.grid.remove(cell, true); }
      }
    }
  }

  // ---------- 화면 ----------
  makeView() {
    const s = this.scene;
    const g = this.grid;
    const w = this.cols * g.cellW - g.pad * 2;
    const h = this.rows * g.cellH - g.pad * 2;
    const f = this.theme.fontFamily;
    this.glow = s.add.image(0, 0, 'fx', 'glow').setBlendMode(ADD).setTint(this.color)
      .setDisplaySize(w * V.glowScale, h * V.glowScale * 1.4).setAlpha(V.glowAlpha);
    this.rect = s.add.rectangle(0, 0, w, h, this.color, V.fillAlpha).setStrokeStyle(V.stroke, this.color);
    this.nameT = s.add.text(0, -h / 2 + V.pad + 6, t(this.nameKey), {
      fontFamily: f, fontSize: `${V.nameSize}px`, fontStyle: 'bold', color: this.colorHex,
    }).setOrigin(0.5, 0).setVisible(this.rows > 1); // 작은 보스는 이름 생략 (컷인·안내에 나옴)
    const small = this.rows < 2;
    this.hpT = s.add.text(0, small ? -2 : 6, '', {
      fontFamily: f, fontSize: `${small ? V.hpSizeSmall : V.hpSize}px`, fontStyle: 'bold', color: this.theme.text, stroke: '#05050c', strokeThickness: 4,
    }).setOrigin(0.5);
    this.barBack = s.add.rectangle(0, h / 2 - V.pad - V.barH / 2, w - V.pad * 2, V.barH, 0x000000, 0.6);
    this.bar = s.add.rectangle(-(w - V.pad * 2) / 2, h / 2 - V.pad - V.barH / 2, w - V.pad * 2, V.barH, this.color).setOrigin(0, 0.5);
    this.weakBar = s.add.rectangle(0, 0, 10, 10, hex(cfg.weakSide.color)).setBlendMode(ADD).setVisible(false);
    this.shieldRect = s.add.rectangle(0, 0, w + 10, h + 10).setStrokeStyle(4, hex(V.shieldColor)).setVisible(false);
    this.ui = s.add.container(0, 0, [this.glow, this.rect, this.weakBar, this.shieldRect, this.nameT, this.hpT, this.barBack, this.bar])
      .setDepth(V.depth);
    this.hint = s.add.text(s.scale.width / 2, V.hintY, '', {
      fontFamily: f, fontSize: `${V.hintSize}px`, fontStyle: 'bold', color: this.colorHex, align: 'center',
    }).setOrigin(0.5).setDepth(41);
    this.pulse = 0;
    this.refresh();
  }

  refresh() {
    this.hpT.setText(String(Math.ceil(Math.max(0, this.hp))));
    this.bar.scaleX = Math.max(0, this.hp / this.maxHp);
    const hints = this.names.map((n) => t(`boss.hint.${n}`)).join(' · ');
    const splits = this.splitsLeft ? ` · ${t('boss.splits', { n: this.splitsLeft })}` : '';
    this.hint.setText(`${hints}${splits}\n${t('boss.turns', { n: this.turnsLeft, max: this.variant.turns ?? cfg.turns })}`);
    this.placeWeak();
  }

  placeWeak() {
    const on = !!this.weak;
    this.weakBar.setVisible(on);
    if (!on) return;
    const w = this.w;
    const h = this.h;
    const bw = cfg.weakSide.barW;
    const pos = { top: [0, -h / 2, w, bw], bottom: [0, h / 2, w, bw], left: [-w / 2, 0, bw, h], right: [w / 2, 0, bw, h] }[this.weak];
    this.weakBar.setPosition(pos[0], pos[1]).setSize(pos[2], pos[3]).setDisplaySize(pos[2], pos[3]);
  }

  intro() {
    const s = this.scene;
    this.ui.setScale(0.2).setAlpha(0);
    s.tweens.add({ targets: this.ui, scale: 1, alpha: 1, duration: 420, ease: 'Back.easeOut' });
    this.fx.juice.flash(cfg.fx.introFlash);
    this.fx.juice.shake(cfg.fx.introShake);
    awakenCutin(s, this.fx.cfg.ult.cutin, {
      title: t(this.nameKey), sub: this.names.map((n) => t(`boss.hint.${n}`)).join(' · '),
      color: this.color, fontFamily: this.theme.fontFamily,
    });
  }

  // ---------- 전투 ----------
  bind(bus) {
    bus.on(EV.HIT, (ctx) => {
      if (ctx.cell !== this) return;
      if (this.list.some((p) => p.guard?.(this, this.g))) { ctx.damage = 0; return; } // 보호막
      if (this.list.some((p) => p.bonus?.(this, ctx.source ?? {}, this.g))) {
        ctx.damage *= cfg.bonus;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        this.fx.sprites.play(cfg.fx.bonusRing, cx, cy, hex(cfg.weakSide.color), { priority: 2 });
        this.fx.p.emit(cfg.fx.bonusStar, cx, cy, hex(cfg.weakSide.color));
      }
    });
    bus.on(EV.AFTER_HIT, ({ cell }) => {
      if (cell !== this || this.dead) return;
      this.refresh();
      this.rect.setFillStyle(0xffffff, 0.6);
      this.scene.time.delayedCall(50, () => this.rect.setFillStyle(this.color, V.fillAlpha));
    });
    bus.on(EV.KILL, ({ cell }) => { if (cell === this) this.die(); });
  }

  /** 보스 턴 (턴 시작): 남은 턴 감소, 패턴 진행 */
  turn() {
    this.turnsLeft--;
    for (const p of this.list) p.turn?.(this, this.g);
    this.refresh();
  }

  update(dt) {
    if (this.dead) return;
    for (const p of this.list) p.update?.(this, this.g, dt);
    this.pulse += dt * 4;
    this.glow.setAlpha(V.glowAlpha * (0.8 + 0.2 * Math.sin(this.pulse)));
    if (this.weak) this.weakBar.setAlpha(0.6 + 0.4 * Math.sin(this.pulse * 2));
    const guarded = this.list.some((p) => p.guard?.(this, this.g));
    this.shieldRect.setVisible(guarded).setAlpha(0.5 + 0.5 * Math.sin(this.pulse * 1.5));
  }

  die() {
    if (this.splitsLeft > 0) { this.split(); return; }
    this.dead = true;
    this.onDefeat?.();
    const c = cfg.fx;
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    this.fx.sprites.play(c.deathRing, cx, cy, this.color, { priority: 2 });
    this.fx.sprites.play(c.deathCore, cx, cy, 0xffffff, { priority: 2 });
    for (const n of c.deathBurst) this.fx.p.emit(n, cx, cy, this.color);
    this.fx.juice.flash(c.deathFlash);
    this.fx.juice.shake(c.deathShake);
    this.fx.juice.hitstop(c.deathHitstop);
    this.hint.setText(t('boss.down'));
    this.scene.tweens.add({ targets: this.ui, scale: 1.4, alpha: 0, duration: 500, onComplete: () => this.ui.destroy() });
  }

  /** 분열: 한 단계 작아져서 무작위 위치에 체력 hpPct 로 다시, 주변에 작은 블록 */
  split() {
    const c = cfg.split;
    const g = this.grid;
    const x0 = this.x + this.w / 2;
    const y0 = this.y + this.h / 2;
    this.fx.p.emit('shard', x0, y0, this.color);
    this.fx.sprites.play(cfg.fx.bonusRing, x0, y0, this.color, { priority: 2 });
    this.fx.juice.shake('big');
    this.splitsLeft--;
    const [cols, rows] = c.sizes[c.sizes.length - 1 - this.splitsLeft];
    this.cols = cols;
    this.rows = rows;
    this.dead = false;
    this.maxHp = Math.ceil(this.maxHp * c.hpPct);
    this.hp = this.maxHp;
    this.ui.destroy();
    this.hint.destroy();
    this.makeView();
    const col = Math.floor(this.rng() * (g.cols - cols + 1));
    const row = Math.floor(this.rng() * (c.maxRow + 1));
    this.moveTo(col, row, true);
    const spots = [];
    for (let r = row; r < Math.min(g.rows - 1, row + rows + 1); r++) for (let cc = 0; cc < g.cols; cc++) if (!g.cells[r][cc] && (cc < col || cc >= col + cols || r >= row + rows)) spots.push([cc, r]);
    for (let i = 0; i < c.spawn && spots.length; i++) {
      const [sc, sr] = spots.splice(Math.floor(this.rng() * spots.length), 1)[0];
      g.placeAt(sc, sr, { kind: 'block', hp: Math.ceil(this.g.stageHp() * c.spawnHpMul), double: false, base: 0 });
    }
    this.refresh();
  }

  destroy() {
    if (this.grid.boss === this) this.grid.boss = null;
    if (this.ui.active) this.ui.destroy();
    this.hint.destroy();
  }
}
