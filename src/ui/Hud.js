import { t } from './i18n.js';
import { hex } from '../core/color.js';

/** 상단 정보·발사대 공 개수·FPS·배속·조준 안내 */
export class Hud {
  constructor(scene, { layout, theme }) {
    const f = theme.fontFamily;
    const fs = layout.fontSize;
    const big = { fontFamily: f, fontSize: `${fs.hud}px`, fontStyle: 'bold', color: theme.text };
    const sub = { fontFamily: f, fontSize: `${fs.hud}px`, fontStyle: 'bold', color: theme.hudText };
    const small = { fontFamily: f, fontSize: `${fs.small}px`, color: theme.hudText };
    const W = layout.width;
    const midY = layout.hudHeight / 2;

    scene.add.rectangle(W / 2, midY, W, layout.hudHeight, hex(theme.hudBackground)).setDepth(39);
    scene.add.rectangle(W / 2, layout.hudHeight, W, 2, hex(theme.floor), 0.35).setDepth(39);

    this.stage = scene.add.text(16, midY, '', big).setOrigin(0, 0.5).setDepth(40);
    this.damage = scene.add.text(W / 2, midY, '', { ...big, color: theme.orb }).setOrigin(0.5).setDepth(40);
    this.best = scene.add.text(W - 16, midY, '', sub).setOrigin(1, 0.5).setDepth(40);
    this.fps = scene.add.text(8, layout.height - 8, '', small).setOrigin(0, 1).setDepth(40);
    this.speed = scene.add.text(W - 8, layout.height - 8, '', { ...small, color: theme.accent }).setOrigin(1, 1).setDepth(40);
    this.hint = scene.add.text(W / 2, layout.floorY + 40, t('hint.aim'), small).setOrigin(0.5).setDepth(40);
    this.ballCount = scene.add.text(0, 0, '', small).setOrigin(0.5, 0).setDepth(40);
  }

  setInfo({ stage, damage, best }) {
    this.stage.setText(t('hud.stage', { n: stage }));
    this.damage.setText(t('hud.damage', { n: damage }));
    this.best.setText(t('hud.best', { n: best }));
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
