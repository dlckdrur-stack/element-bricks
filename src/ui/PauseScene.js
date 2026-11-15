import Phaser from 'phaser';
import layout from '../data/layout.json';
import theme from '../data/themes/neon.json';
import screens from '../data/screens.json';
import { hex } from '../core/color.js';
import { applyFxSettings, getSettings } from '../meta/settings.js';
import { makeButton, style, fmtShort } from './widgets.js';
import { t } from './i18n.js';

/**
 * 일시정지 (게임 위에 겹쳐 뜨는 장면). 게임 장면은 pause 상태로 멈춰 있다.
 * 계속하기 · 환경설정(돌아오면 바로 적용) · 메인으로(마지막 턴 시작 시점까지 저장돼 있어 이어하기 가능)
 */
export class PauseScene extends Phaser.Scene {
  constructor() { super('Pause'); }

  create() {
    const P = screens.pause;
    const W = layout.width;
    const H = layout.height;
    this.add.rectangle(W / 2, H / 2, W, H, hex(theme.overlay), P.dim).setInteractive();
    this.add.text(W / 2, P.titleY, t('pause.title'), style(layout.fontSize.title * 0.75, theme.text, true)).setOrigin(0.5);
    this.showStats(P);
    const items = [
      { key: 'pause.resume', color: theme.buttonPrimary, go: () => this.resume() },
      { key: 'pause.settings', color: theme.button, go: () => this.openSettings() },
      { key: 'pause.menu', color: theme.hudText, go: () => this.toMenu() },
    ];
    items.forEach((it, i) => makeButton(this, W / 2, P.buttonsY + i * (P.buttonH + P.gap), t(it.key), {
      w: P.buttonW, h: P.buttonH, color: it.color, onClick: it.go,
    }));
    this.add.text(W / 2, P.noteY, t('pause.note'), { ...style(layout.fontSize.small, theme.hudText), align: 'center' }).setOrigin(0.5);
    this.input.keyboard?.on('keydown-ESC', () => this.resume());
  }

  /** 이번 판 피해 비율 (막대) + 보유 증강 목록 */
  showStats(P) {
    const g = this.gameScene();
    const fs = layout.fontSize;
    const mgr = g.augments;
    const left = layout.width / 2 - P.augW / 2;
    this.add.text(left, P.statsHeadY, t('pause.dmgHead'), style(fs.cardDesc, theme.accent, true)).setOrigin(0, 0.5);
    this.add.text(left + P.augW, P.statsHeadY, t('pause.dmgTotal', { n: fmtShort(g.dmgStats.total) }), style(fs.cardDesc, theme.currency, true)).setOrigin(1, 0.5);
    const rows = g.dmgStats.top(P.rows);
    if (!rows.length) this.add.text(layout.width / 2, P.statsTop + 20, t('pause.noDmg'), style(fs.small, theme.hudText)).setOrigin(0.5);
    rows.forEach((r, i) => {
      const y = P.statsTop + i * P.rowH;
      const def = mgr.defs.get(r.key);
      const name = r.key === 'ball' ? t('pause.ball') : def ? t(`aug.${r.key}.name`) : t(`element.${r.key}`);
      const color = def ? mgr.color(def.element) : 0xffffff;
      this.add.text(P.barX - 12, y, name, style(fs.small, theme.text)).setOrigin(1, 0.5);
      this.add.rectangle(P.barX, y, P.barW, P.barH, 0x000000, 0.5).setOrigin(0, 0.5);
      this.add.rectangle(P.barX, y, Math.max(2, P.barW * r.share), P.barH, color).setOrigin(0, 0.5);
      this.add.text(P.barX + P.barW + 8, y, t('pause.dmgRow', { n: fmtShort(r.dmg), p: Math.round(r.share * 1000) / 10 }), style(fs.small, theme.hudText)).setOrigin(0, 0.5);
    });
    const owned = [...mgr.owned.values()].map((a) => t(`aug.${a.def.id}.name`) + (a.grade ? `(${t(`grade.${a.grade}`)})` : ''));
    const cnt = mgr.pickCounts();
    const caps = mgr.caps;
    this.add.text(left, P.augHeadY, t('pause.augHead', { n: owned.length, m: cnt.main, mm: caps.main, s: cnt.sub, sm: caps.sub }), style(fs.cardDesc, theme.accent, true)).setOrigin(0, 0.5);
    this.add.text(layout.width / 2, P.augY, owned.join('  ·  ') || t('pause.noAug'), {
      ...style(fs.small, theme.text), align: 'center', wordWrap: { width: P.augW, useAdvancedWrap: true }, lineSpacing: 4,
    }).setOrigin(0.5, 0);
    this.add.text(layout.width / 2, P.statsTop + P.rows * P.rowH + 4, mgr.roleText(t), style(fs.small, theme.currency, true)).setOrigin(0.5);
  }

  gameScene() { return this.scene.get('Game'); } // (this.game 은 Phaser 예약어)

  resume() {
    const g = this.gameScene();
    applyFxSettings(g.fx); // 환경설정에서 바꾼 것 바로 반영
    const s = getSettings();
    g.showFps = s.showFps;
    g.autoQ.enabled = s.autoQuality;
    this.scene.stop();
    this.scene.resume('Game');
  }

  openSettings() {
    this.scene.sleep();
    this.scene.launch('Settings', { from: 'Pause' });
  }

  toMenu() {
    this.scene.stop('Game');
    this.scene.start('Menu');
  }
}
