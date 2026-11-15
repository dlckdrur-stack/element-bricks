import Phaser from 'phaser';
import layout from '../data/layout.json';
import theme from '../data/themes/neon.json';
import screens from '../data/screens.json';
import { fxCfg } from '../fx/config.js';
import { getSettings, setSetting, settingsCfg } from '../meta/settings.js';
import { resetAll } from '../meta/save.js';
import { RUN_KEY } from '../meta/runSave.js';
import { makeButton, makePanel, fadeIn, confirmDialog, style } from './widgets.js';
import { t } from './i18n.js';

/** 다음 값으로 (끝이면 처음으로) */
const next = (list, v) => list[(list.indexOf(v) + 1) % list.length];

function sizeSteps() {
  const r = fxCfg.sizeRange;
  const out = [];
  for (let v = r.min; v <= r.max + 1e-6; v += r.step) out.push(Math.round(v * 100) / 100);
  return out;
}

const onOff = (v) => t(v ? 'settings.on' : 'settings.off');

/**
 * 환경설정 (기본): 이펙트 품질·크기, 자동 품질 조절, 화면 흔들림, 번쩍임, 데미지 숫자, FPS 표시, 데이터 초기화.
 * 값 버튼을 누를 때마다 다음 값으로 바뀌고 바로 저장된다.
 */
export class SettingsScene extends Phaser.Scene {
  constructor() { super('Settings'); }

  create() {
    fadeIn(this);
    makePanel(this, 'settings.title');
    const c = screens.settings;
    const sizes = sizeSteps();
    const rows = [
      { key: 'quality', cycle: (v) => next(fxCfg.qualities, v), show: (v) => t(`settings.q.${v}`) },
      { key: 'size', cycle: (v) => next(sizes, v), show: (v) => `${Math.round(v * 100)}%` },
      { key: 'autoQuality', cycle: (v) => !v, show: onOff },
      { key: 'shake', cycle: (v) => !v, show: onOff },
      { key: 'flash', cycle: (v) => !v, show: onOff },
      { key: 'numbers', cycle: (v) => next(settingsCfg.numbersModes, v), show: (v) => t(`settings.n.${v}`) },
      { key: 'showFps', cycle: (v) => !v, show: onOff },
    ];
    rows.forEach((row, i) => this.makeRow(row, c.top + i * c.rowH));

    makeButton(this, layout.width / 2, c.resetY, t('settings.reset'), {
      w: screens.panel.backW, h: screens.panel.backH, color: theme.danger,
      onClick: () => confirmDialog(this, 'settings.resetConfirm', () => {
        resetAll([RUN_KEY]);
        this.scene.restart();
      }),
    });
  }

  makeRow(row, y) {
    const c = screens.settings;
    const fs = layout.fontSize;
    this.add.text(c.labelX, y, t(`settings.${row.key}`), style(fs.cardName * 0.8, theme.text)).setOrigin(0, 0.5);
    const btn = makeButton(this, c.valueX - c.valueW / 2, y, row.show(getSettings()[row.key]), {
      w: c.valueW, h: c.valueH, size: fs.cardDesc + 2,
      onClick: () => {
        const v = row.cycle(getSettings()[row.key]);
        setSetting(row.key, v);
        btn.label.setText(row.show(v));
      },
    });
  }
}
