import Phaser from 'phaser';
import layout from '../data/layout.json';
import theme from '../data/themes/neon.json';
import screens from '../data/screens.json';
import { getProfile } from '../meta/save.js';
import { getTier } from '../meta/tiers.js';
import { pendingCount, isOnlineReady, flush } from '../net/ranking.js';
import { makePanel, fadeIn, style } from './widgets.js';
import { t } from './i18n.js';

/**
 * 랭킹 화면 (오프라인 우선): 내 챌린저 최고 기록 + 온라인 업로드 대기 수.
 * 온라인 랭킹 서버가 설정돼 있으면(VITE_RANK_URL) 이 화면에서 대기열을 올린다.
 */
export class RankingScene extends Phaser.Scene {
  constructor() { super('Ranking'); }

  create() {
    fadeIn(this);
    makePanel(this, 'rank.title');
    const W = layout.width;
    const fs = layout.fontSize;
    const p = getProfile();
    const C = screens.ranking;
    this.add.text(W / 2, C.headY, t('rank.mine'), style(fs.cardDesc + 2, theme.accent, true)).setOrigin(0.5);
    const tier = getTier('challenger'); // 랭킹은 챌린저(무한)만
    const best = p.tierBest?.challenger;
    this.add.text(W / 2, C.top, t('tier.challenger'), style(fs.body, tier.color, true)).setOrigin(0.5);
    this.add.text(W / 2, C.top + C.rowH, best ? t('rank.stage', { n: best }) : '-', style(fs.title * 0.8, theme.text, true)).setOrigin(0.5);
    const status = this.add.text(W / 2, C.statusY, '', { ...style(fs.small + 1, theme.hudText), align: 'center' }).setOrigin(0.5);
    const show = () => status.setText(isOnlineReady()
      ? t('rank.pending', { n: pendingCount() })
      : t('rank.offline', { n: pendingCount() }));
    show();
    flush().then(show); // 네트워크는 판 종료와 랭킹 화면에서만
  }
}
