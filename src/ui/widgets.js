import screens from '../data/screens.json';
import layout from '../data/layout.json';
import theme from '../data/themes/neon.json';
import { hex } from '../core/color.js';
import { t } from './i18n.js';

/** 글자 모양 */
export function style(size, color = theme.text, bold = false) {
  return { fontFamily: theme.fontFamily, fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color };
}

/** 1234567 → "1,234,567" */
export function fmtNum(n) {
  return Math.floor(n).toLocaleString();
}

/**
 * 네온 버튼. 누르면 살짝 작아지고, 손을 떼면 onClick.
 * 반환값: container (.bg .label, setEnabled(bool))
 */
export function makeButton(scene, x, y, text, { w, h, color = theme.button, size = layout.fontSize.body, onClick, depth = 0 }) {
  const c = screens.button;
  const col = hex(color);
  const bg = scene.add.rectangle(0, 0, w, h, col, c.fill).setStrokeStyle(c.stroke, col);
  const label = scene.add.text(0, 0, text, style(size, theme.text, true)).setOrigin(0.5);
  const box = scene.add.container(x, y, [bg, label]).setDepth(depth);
  box.bg = bg;
  box.label = label;
  box.enabled = true;
  bg.setInteractive({ useHandCursor: true });
  bg.on('pointerdown', () => {
    if (!box.enabled) return;
    scene.tweens.add({ targets: box, scale: c.pressScale, duration: c.pressMs });
  });
  const reset = () => { scene.tweens.killTweensOf(box); box.setScale(1); };
  bg.on('pointerout', reset);
  bg.on('pointerup', () => {
    reset();
    if (box.enabled) onClick?.();
  });
  box.setEnabled = (on) => {
    box.enabled = on;
    box.setAlpha(on ? 1 : c.disabledAlpha);
    return box;
  };
  return box;
}

/** 화면 전환: 어둡게 사라졌다가 다음 씬 시작 */
export function goTo(scene, key, data) {
  if (scene.leaving) return;
  scene.leaving = true;
  scene.input.enabled = false;
  scene.cameras.main.fadeOut(screens.fadeMs, 0, 0, 0);
  scene.cameras.main.once('camerafadeoutcomplete', () => scene.scene.start(key, data));
}

/** 씬 시작 시 밝아지기 */
export function fadeIn(scene) {
  scene.leaving = false;
  scene.cameras.main.setBackgroundColor(theme.background);
  scene.cameras.main.fadeIn(screens.fadeMs, 0, 0, 0);
}

/** 위 제목 + 아래 "뒤로" 버튼이 있는 화면 틀 */
export function makePanel(scene, titleKey, backKey = 'Menu', onBack = null) {
  const p = screens.panel;
  const W = layout.width;
  scene.add.text(W / 2, p.titleY, t(titleKey), style(layout.fontSize.title * 0.7, theme.accent, true)).setOrigin(0.5);
  makeButton(scene, W / 2, p.backY, t('common.back'), {
    w: p.backW, h: p.backH, color: theme.hudText, onClick: () => (onBack ? onBack() : goTo(scene, backKey)),
  });
}

/** 구석 정보: 왼쪽 위 보유 재화, 오른쪽 위 최고 기록 */
export function makeCorner(scene, profile) {
  const c = screens.corner;
  const fs = layout.fontSize.hud;
  const money = scene.add.text(c.pad, c.y, t('meta.currency', { n: fmtNum(profile.currency) }),
    style(fs, theme.currency, true)).setOrigin(0, 0.5);
  const best = scene.add.text(layout.width - c.pad, c.y, t('hud.best', { n: profile.bestStage }),
    style(fs, theme.hudText, true)).setOrigin(1, 0.5);
  return { money, best, refresh: (p) => money.setText(t('meta.currency', { n: fmtNum(p.currency) })) };
}

/** 확인 창. onYes/onNo 후 스스로 닫힘. opts.raw = 문구 키 대신 글 그대로, opts.okOnly = 확인 버튼 하나(긴 안내용) */
export function confirmDialog(scene, msgKey, onYes, opts = {}) {
  const d = opts.okOnly ? { ...screens.dialog, ...screens.dialog.info } : screens.dialog;
  const W = layout.width;
  const H = layout.height;
  const D = 200;
  const parts = [];
  const close = () => parts.forEach((o) => o.destroy());
  const dim = scene.add.rectangle(W / 2, H / 2, W, H, hex(theme.overlay), d.dim).setDepth(D).setInteractive();
  const box = scene.add.rectangle(W / 2, H / 2, d.w, d.h, hex(theme.cardBackground))
    .setStrokeStyle(3, hex(theme.danger)).setDepth(D);
  const msg = scene.add.text(W / 2, H / 2 - d.h * 0.12, opts.raw ? msgKey : t(msgKey), {
    ...style(opts.okOnly ? layout.fontSize.small : layout.fontSize.cardDesc + 2), align: 'center', wordWrap: { width: d.w - 40 },
  }).setOrigin(0.5).setDepth(D);
  const by = H / 2 + d.h * (opts.okOnly ? 0.42 : 0.25);
  if (opts.okOnly) {
    const ok = makeButton(scene, W / 2, by, t('common.ok'), { w: d.buttonW, h: d.buttonH, color: theme.button, depth: D, onClick: () => { close(); onYes(); } });
    parts.push(dim, box, msg, ok);
    return;
  }
  const yes = makeButton(scene, W / 2 - d.buttonGapX / 2, by, t('common.yes'), {
    w: d.buttonW, h: d.buttonH, color: theme.danger, depth: D, onClick: () => { close(); onYes(); },
  });
  const no = makeButton(scene, W / 2 + d.buttonGapX / 2, by, t('common.no'), {
    w: d.buttonW, h: d.buttonH, color: theme.hudText, depth: D, onClick: close,
  });
  parts.push(dim, box, msg, yes, no);
}
