import Phaser from 'phaser';
import layout from '../data/layout.json';
import theme from '../data/themes/neon.json';
import { hex } from '../core/color.js';
import { getProfile } from '../meta/save.js';
import { clearRun } from '../meta/runSave.js';
import { tierOrder, tierScreen as C, getTier, isOpen, isCleared, isInfinite } from '../meta/tiers.js';
import { makePanel, makeCorner, goTo, fadeIn, style } from './widgets.js';
import { t } from './i18n.js';

/**
 * 티어(난이도) 선택. 브론즈 → … → 챌린저. 앞 티어를 깨야 열린다.
 * 각 줄: 이름, 스테이지 수·체력 배율·재화 배율, 클리어 표시, 클리어 보상(또는 잠금 조건)
 */
export class TierScene extends Phaser.Scene {
  constructor() { super('Tier'); }

  create() {
    fadeIn(this);
    makePanel(this, 'tier.title');
    makeCorner(this, getProfile());
    tierOrder.forEach((id, i) => this.makeRow(getTier(id), C.top + i * C.rowH));
  }

  makeRow(tier, y) {
    const W = layout.width;
    const open = isOpen(tier.id);
    const cleared = isCleared(tier.id);
    const color = hex(tier.color);
    const left = (W - C.rowW) / 2 + C.padX;
    const bg = this.add.rectangle(W / 2, y, C.rowW, C.rowInnerH, hex(theme.cardBackground), open ? 1 : 0.5)
      .setStrokeStyle(open ? 3 : 1, open ? color : hex(theme.locked));
    const name = this.add.text(left, y - 22, t(`tier.${tier.id}`), style(C.nameSize, open ? tier.color : theme.locked, true))
      .setOrigin(0, 0.5);
    const stages = isInfinite(tier) ? t('tier.infinite') : t('tier.stages', { n: tier.stages });
    const info = t('tier.info', { stages, hp: tier.hpMul }) + (tier.recommendEnhance ? t('tier.recommend', { n: tier.recommendEnhance }) : '');
    this.add.text(left, y + 6, info, style(C.infoSize, open ? theme.text : theme.locked)).setOrigin(0, 0.5);
    const rewardKey = !open ? 'tier.locked' : tier.unlock ? `tier.reward.${tier.unlock}` : 'tier.reward.none';
    this.add.text(left, y + 30, t(rewardKey), style(C.infoSize - 1, open ? theme.currency : theme.locked)).setOrigin(0, 0.5);
    const best = getProfile().tierBest?.[tier.id];
    const mark = !open ? '🔒' : cleared ? t('tier.cleared') : best ? t('tier.best', { n: best }) : '';
    this.add.text(W - left, y - 22, mark, style(C.infoSize + 2, cleared ? tier.color : theme.hudText, true)).setOrigin(1, 0.5);
    if (!open) { name.setAlpha(0.7); return; }

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.tweens.add({ targets: bg, scaleX: 0.97, scaleY: 0.94, duration: 70 }));
    bg.on('pointerout', () => bg.setScale(1));
    bg.on('pointerup', () => {
      bg.setScale(1);
      clearRun();
      goTo(this, 'Game', { resume: false, tier: tier.id });
    });
  }
}
