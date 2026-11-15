import Phaser from 'phaser';
import layout from '../data/layout.json';
import theme from '../data/themes/neon.json';
import screens from '../data/screens.json';
import { makePanel, fadeIn, style } from './widgets.js';
import { t } from './i18n.js';

/** "준비 중" 화면. key 와 제목 문구 키를 받아 여러 화면(상점 등)에 재사용 */
export class ComingSoonScene extends Phaser.Scene {
  constructor(key, titleKey) {
    super(key);
    this.titleKey = titleKey;
  }

  create() {
    fadeIn(this);
    makePanel(this, this.titleKey);
    this.add.text(layout.width / 2, screens.panel.bodyY, t('common.comingSoon'),
      style(layout.fontSize.body, theme.hudText, true)).setOrigin(0.5);
  }
}

export class ShopScene extends ComingSoonScene {
  constructor() { super('Shop', 'shop.title'); }
}
