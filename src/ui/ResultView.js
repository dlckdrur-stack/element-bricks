import layout from '../data/layout.json';
import theme from '../data/themes/neon.json';
import screens from '../data/screens.json';
import { hex } from '../core/color.js';
import { makeButton, style, fmtNum } from './widgets.js';
import { t } from './i18n.js';

/**
 * 판 결과 화면: 도달 스테이지, 획득 재화(숫자가 차오름), 최고 기록·신기록, "다시 하기"/"메인으로".
 * info = { stage, best, newBest, total(보너스 반영 재화), bonusPct }
 */
export function showResult(scene, info, { onRetry, onMenu, onNext }) {
  const r = screens.result;
  const W = layout.width;
  const H = layout.height;
  const fs = layout.fontSize;
  const D = 50;
  const txt = (y, s, st) => scene.add.text(W / 2, y, s, st).setOrigin(0.5).setDepth(D + 1);

  scene.add.rectangle(W / 2, H / 2, W, H, hex(theme.background), 0.86).setDepth(D);
  const title = txt(r.titleY, t(info.won ? 'result.clear' : 'gameover.title'), style(fs.title, info.won ? theme.currency : theme.accent, true)).setScale(0.6);
  scene.tweens.add({ targets: title, scale: 1, duration: 400, ease: 'Back.easeOut' });

  txt(r.stageY, t('gameover.stage', { n: info.stage }), style(fs.body, theme.text, true));
  txt(r.currencyY - fs.body * 1.6, t('result.currency'), style(fs.cardDesc, theme.hudText));
  const money = txt(r.currencyY, t('meta.currency', { n: 0 }), style(fs.title * 0.75, theme.currency, true));
  if (info.clearBonus > 0) txt(r.currencyY + fs.title * 0.95, t('result.clearBonus', { n: fmtNum(info.clearBonus) }), style(fs.small, theme.currency, true));
  if (info.unlocked) { // 티어 첫 클리어 해금 알림: 번쩍이며 커짐
    const u = txt(r.unlockY, info.unlocked, style(fs.cardDesc + 2, theme.text, true)).setAlpha(0);
    scene.tweens.add({ targets: u, alpha: 1, scale: { from: 1.5, to: 1 }, duration: 400, delay: r.countDelayMs + r.countUpMs, ease: 'Back.easeOut' });
  }
  if (info.bonusPct > 0) {
    txt(r.currencyY + fs.title * 0.6, t('result.bonus', { n: Math.round(info.bonusPct * 100) }),
      style(fs.small, theme.currency));
  }
  txt(r.bestY, t('gameover.best', { n: info.best }), style(fs.body, theme.hudText));
  if (info.newBest) {
    const nb = txt(r.newBestY, t('gameover.newBest'), style(fs.body, theme.orb, true)).setAlpha(0);
    scene.tweens.add({ targets: nb, alpha: 1, scale: { from: 1.6, to: 1 }, duration: 350, delay: r.countDelayMs, ease: 'Back.easeOut' });
  }

  // 획득 재화가 0부터 차오르고, 다 차면 통 튄다
  scene.tweens.addCounter({
    from: 0, to: info.total, duration: info.total > 0 ? r.countUpMs : 1, delay: r.countDelayMs, ease: 'Cubic.easeOut',
    onUpdate: (tw) => money.setText(t('meta.currency', { n: fmtNum(tw.getValue()) })),
    onComplete: () => {
      money.setText(t('meta.currency', { n: fmtNum(info.total) }));
      scene.tweens.add({ targets: money, scale: r.countPopScale, duration: 120, yoyo: true, ease: 'Quad.easeOut' });
    },
  });

  const buttons = [
    makeButton(scene, W / 2 - r.buttonGapX / 2, r.buttonsY, t('result.retry'), {
      w: r.buttonW, h: r.buttonH, color: theme.buttonPrimary, depth: D + 2, onClick: onRetry,
    }),
    makeButton(scene, W / 2 + r.buttonGapX / 2, r.buttonsY, t('result.menu'), {
      w: r.buttonW, h: r.buttonH, color: theme.button, depth: D + 2, onClick: onMenu,
    }),
  ];
  if (onNext) {
    buttons.push(makeButton(scene, W / 2, r.buttonsY + r.buttonH + 20, t('result.nextTier'), {
      w: r.buttonW * 2, h: r.buttonH, color: theme.currency, depth: D + 2, onClick: onNext,
    }));
  }
  for (const b of buttons) b.setAlpha(0).setEnabled(false);
  scene.time.delayedCall(r.inputDelayMs, () => {
    for (const b of buttons) {
      b.setEnabled(true).setAlpha(0);
      scene.tweens.add({ targets: b, alpha: 1, duration: 250 });
    }
  });
}
