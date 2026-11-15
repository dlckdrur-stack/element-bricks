import { t } from './i18n.js';
import { hex } from '../core/color.js';

/** 상단 정보(스테이지·데미지·최고·레벨·경험치 바)·발사대 공 개수·FPS·배속·조준 안내 */
export class Hud {
  constructor(scene, { layout, theme, fxCfg }) {
    this.scene = scene;
    const f = theme.fontFamily;
    const fs = layout.fontSize;
    const h = layout.hud;
    const big = { fontFamily: f, fontSize: `${fs.hud}px`, fontStyle: 'bold', color: theme.text };
    const sub = { fontFamily: f, fontSize: `${fs.hud}px`, fontStyle: 'bold', color: theme.hudText };
    const small = { fontFamily: f, fontSize: `${fs.small}px`, color: theme.hudText };
    const W = layout.width;
    const D = 40;

    scene.add.rectangle(W / 2, layout.hudHeight / 2, W, layout.hudHeight, hex(theme.hudBackground)).setDepth(D - 1);
    scene.add.rectangle(W / 2, layout.hudHeight, W, 2, hex(theme.floor), 0.35).setDepth(D - 1);

    this.stage = scene.add.text(16, h.row1Y, '', big).setOrigin(0, 0.5).setDepth(D);
    this.damage = scene.add.text(W / 2, h.row1Y, '', { ...big, color: theme.orb }).setOrigin(0.5).setDepth(D);
    this.best = scene.add.text(W - 16, h.row1Y, '', sub).setOrigin(1, 0.5).setDepth(D);

    // 레벨 + 경험치 바
    this.level = scene.add.text(16, h.row2Y, '', { ...small, fontStyle: 'bold', color: theme.text })
      .setOrigin(0, 0.5).setDepth(D);
    this.barX = h.barX;
    this.barW = W - h.barX - 16;
    scene.add.rectangle(this.barX, h.row2Y, this.barW, h.barH, hex(theme.xpBarBack))
      .setOrigin(0, 0.5).setDepth(D);
    this.bar = scene.add.rectangle(this.barX, h.row2Y, this.barW, h.barH, hex(theme.xpBar))
      .setOrigin(0, 0.5).setDepth(D + 1);
    this.bar.scaleX = 0;

    this.fps = scene.add.text(8, layout.height - 8, '', small).setOrigin(0, 1).setDepth(D);
    this.speed = scene.add.text(W - 8, layout.height - 8, '', { ...small, color: theme.accent }).setOrigin(1, 1).setDepth(D);
    this.hint = scene.add.text(W / 2, layout.floorY + 40, t('hint.aim'), small).setOrigin(0.5).setDepth(D);
    this.ballCount = scene.add.text(0, 0, '', small).setOrigin(0.5, 0).setDepth(D);
    const ub = fxCfg.ult.badge; // 필살기 남은 턴 배지
    this.ultCfg = ub;
    this.ult = scene.add.text(ub.x, ub.y, '', { ...small, fontSize: `${ub.fontSize}px`, fontStyle: 'bold' })
      .setOrigin(0, 0.5).setDepth(D);
  }

  setInfo({ stage, damage, best }) {
    this.stage.setText(t('hud.stage', { n: stage }));
    this.damage.setText(t('hud.damage', { n: Math.round(damage * 10) / 10 }));
    this.best.setText(t('hud.best', { n: best }));
  }

  /** 구슬을 먹었을 때 공 데미지 숫자가 통 튀며 커졌다 돌아옴. c = { scale, time(ms) } */
  popDamage(c) {
    const d = this.damage;
    this.scene.tweens.killTweensOf(d);
    d.setScale(1);
    this.scene.tweens.add({ targets: d, scale: c.scale, duration: c.time, yoyo: true, ease: 'Back.easeOut' });
  }

  setLevel(level, progress, isMax, color) {
    this.level.setText(t(isMax ? 'hud.levelMax' : 'hud.level', { n: level }));
    this.bar.scaleX = progress;
    if (color !== undefined) this.bar.setFillStyle(color);
  }

  /** 필살기 배지. list = [{ name, turns, max }] — 다음 턴 발동이면 크게·노랗게 */
  setUlt(list, theme) {
    if (!list.length) { this.ult.setText(''); return; }
    const ready = list.some((u) => u.turns >= u.max - 1);
    this.ult.setText(list.map((u) => (u.turns >= u.max - 1
      ? t('ult.ready', { name: u.name })
      : t('ult.badge', { name: u.name, n: u.turns, max: u.max }))).join('   '));
    this.ult.setColor(ready ? theme.currency : theme.hudText);
    this.ult.setScale(ready ? this.ultCfg.readyScale : 1);
  }

  /** 개발용 FPS 표시 (환경설정에서 켜고 끔) */
  setFps(on, fps, particles, quality) {
    this.fps.setVisible(on);
    if (on) this.fps.setText(t('hud.fps', { n: Math.round(fps), p: particles, q: t(`settings.q.${quality}`) }));
  }

  setSpeed(mult) {
    this.speed.setText(mult > 1 ? t('hud.speed', { n: mult }) : '');
  }

  showHint(v) { this.hint.setVisible(v); }

  setBallCount(x, y, n, visible) {
    this.ballCount.setVisible(visible).setPosition(x, y).setText(t('hud.ballCount', { n }));
  }
}
