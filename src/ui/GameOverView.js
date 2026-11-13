import { t } from './i18n.js';
import { hex } from '../core/color.js';

/** 게임오버 오버레이. delay 후 화면을 누르면 onRetry() */
export function showGameOver(scene, { layout, theme, balance }, { stage, best, newBest }, onRetry) {
  const W = layout.width;
  const H = layout.height;
  const f = theme.fontFamily;
  const fs = layout.fontSize;
  const D = 50;

  scene.add.rectangle(W / 2, H / 2, W, H, hex(theme.background), 0.82).setDepth(D);
  const title = scene.add.text(W / 2, H * 0.36, t('gameover.title'), {
    fontFamily: f, fontSize: `${fs.title}px`, fontStyle: 'bold', color: theme.accent,
  }).setOrigin(0.5).setDepth(D + 1);
  const body = { fontFamily: f, fontSize: `${fs.body}px`, color: theme.text };
  scene.add.text(W / 2, H * 0.46, t('gameover.stage', { n: stage }), body).setOrigin(0.5).setDepth(D + 1);
  scene.add.text(W / 2, H * 0.52, t('gameover.best', { n: best }), { ...body, color: theme.hudText })
    .setOrigin(0.5).setDepth(D + 1);
  if (newBest) {
    scene.add.text(W / 2, H * 0.58, t('gameover.newBest'), { ...body, color: theme.orb, fontStyle: 'bold' })
      .setOrigin(0.5).setDepth(D + 1);
  }
  const retry = scene.add.text(W / 2, H * 0.7, t('gameover.retry'), { ...body, color: theme.hudText })
    .setOrigin(0.5).setDepth(D + 1).setAlpha(0);

  title.setScale(0.6);
  scene.tweens.add({ targets: title, scale: 1, duration: 400, ease: 'Back.easeOut' });
  scene.time.delayedCall(balance.anim.gameOverInputDelayMs, () => {
    scene.tweens.add({ targets: retry, alpha: 1, duration: 300, yoyo: true, repeat: -1, hold: 500 });
    scene.input.once('pointerup', onRetry);
  });
}
