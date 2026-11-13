import { t } from './i18n.js';
import { hex } from '../core/color.js';

/** 상단 정보(스테이지·데미지·최고·레벨·경험치 바)·발사대 공 개수·FPS·배속·조준 안내 */
export class Hud {
  constructor(scene, { layout, theme }) {
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
  }

  setInfo({ stage, damage, best }) {
    this.stage.setText(t('hud.stage', { n: stage }));
    this.damage.setText(t('hud.damage', { n: Math.round(damage * 10) / 10 }));
    this.best.setText(t('hud.best', { n: best }));
  }

  setLevel(level, progress, isMax, color) {
    this.level.setText(t(isMax ? 'hud.levelMax' : 'hud.level', { n: level }));
    this.bar.scaleX = progress;
    if (color !== undefined) this.bar.setFillStyle(color);
  }

  setFps(fps, particles) {
    this.fps.setText(t('hud.fps', { n: Math.round(fps), p: particles }));
  }

  setSpeed(mult) {
    this.speed.setText(mult > 1 ? t('hud.speed', { n: mult }) : '');
  }

  showHint(v) { this.hint.setVisible(v); }

  setBallCount(x, y, n, visible) {
    this.ballCount.setVisible(visible).setPosition(x, y).setText(t('hud.ballCount', { n }));
  }
}
