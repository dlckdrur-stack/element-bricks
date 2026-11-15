import Phaser from 'phaser';
import layout from '../data/layout.json';
import theme from '../data/themes/neon.json';
import screens from '../data/screens.json';
import { hex } from '../core/color.js';
import { applyFxSettings, getSettings } from '../meta/settings.js';
import { makeButton, style, styleD } from './widgets.js';
import { showPauseStats } from './PauseStats.js';
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
    this.add.text(W / 2, P.titleY, t('pause.title'), styleD(layout.fontSize.title * 0.62, theme.textSoft)).setOrigin(0.5).setShadow(0, 0, theme.titleGlow, 8, false, true);
    showPauseStats(this, P, this.gameScene());
    const items = [
      { key: 'pause.resume', color: theme.buttonPrimary, go: () => this.resume() },
      { key: 'pause.settings', color: theme.button, go: () => this.openSettings() },
      { key: 'pause.menu', color: theme.hudText, go: () => this.toMenu() },
    ];
    items.forEach((it, i) => makeButton(this, W / 2, P.buttonsY + i * (P.buttonH + P.gap), t(it.key), {
      w: P.buttonW, h: P.buttonH, color: it.color, onClick: it.go,
    }));
    this.add.text(W / 2, P.noteY, t('pause.note'), { ...style(layout.fontSize.small - 2, theme.textDim), align: 'center' }).setOrigin(0.5);
    this.input.keyboard?.on('keydown-ESC', () => this.resume());
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
