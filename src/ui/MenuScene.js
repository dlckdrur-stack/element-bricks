import Phaser from 'phaser';
import layout from '../data/layout.json';
import theme from '../data/themes/neon.json';
import screens from '../data/screens.json';
import { fxCfg } from '../fx/config.js';
import { Fx } from '../fx/Fx.js';
import { getProfile } from '../meta/save.js';
import { hasRun } from '../meta/runSave.js';
import { applyFxSettings } from '../meta/settings.js';
import { MenuBall } from './MenuBall.js';
import { makeButton, makeCorner, goTo, fadeIn } from './widgets.js';
import { makeMenuTitle } from './MenuTitle.js';
import { canClaim } from '../meta/attendance.js';
import { canClaimAny } from '../meta/quests.js';
import { hex } from '../core/color.js';
import { t } from './i18n.js';

/**
 * 첫 화면. 버튼: (이어하기) / 스테이지 시작 / 강화 / 상점 / 환경설정
 * 구석에 보유 재화·최고 기록, 배경에 불꽃 공이 천천히 튕긴다.
 */
export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    fadeIn(this);
    const m = screens.menu;
    const W = layout.width;
    this.fx = new Fx(this, fxCfg, { fontFamily: theme.fontFamily });
    applyFxSettings(this.fx);
    this.ball = new MenuBall(this, this.fx, fxCfg, m.bgBall, layout);

    const profile = getProfile();
    makeCorner(this, profile);
    const rb = screens.rankButton;
    makeButton(this, rb.x, rb.y, t('rank.icon'), { w: rb.w, h: rb.h, size: layout.fontSize.cardDesc, color: theme.currency, onClick: () => goTo(this, 'Ranking'), depth: 30 });
    // 출석 체크 · 일일 퀘스트 (받을 게 있으면 빨간 점)
    for (const [b, icon, scene, ready] of [[screens.attendButton, 'attend.icon', 'Attendance', canClaim()], [screens.questButton, 'quest.icon', 'Quest', canClaimAny()]]) {
      makeButton(this, b.x, b.y, t(icon), { w: b.w, h: b.h, size: layout.fontSize.cardDesc, color: theme.buttonPrimary, onClick: () => goTo(this, scene), depth: 30 });
      if (!ready) continue;
      const dot = this.add.circle(b.x + b.w / 2 - 4, b.y - b.h / 2 + 4, b.dot, hex(theme.danger)).setDepth(31);
      this.tweens.add({ targets: dot, scale: 1.3, duration: 500, yoyo: true, repeat: -1 });
    }
    makeMenuTitle(this, 30);

    const items = [];
    if (hasRun()) {
      items.push({ key: 'menu.continue', color: theme.buttonPrimary, go: () => goTo(this, 'Game', { resume: true }) });
    }
    items.push(
      { key: 'menu.start', go: () => goTo(this, 'Tier') },
      { key: 'menu.upgrade', go: () => goTo(this, 'Upgrade') },
      { key: 'menu.shop', go: () => goTo(this, 'Shop') },
      { key: 'menu.settings', color: theme.hudText, go: () => goTo(this, 'Settings') },
    );
    items.forEach((it, i) => {
      const y = m.buttonsY + i * (m.buttonH + m.buttonGap);
      const btn = makeButton(this, W / 2, y + m.introOffsetY, t(it.key), {
        w: m.buttonW, h: m.buttonH, color: it.color ?? theme.button, onClick: it.go, depth: 30,
      }).setAlpha(0);
      this.tweens.add({
        targets: btn, y, alpha: 1, duration: m.introMs, delay: i * m.introDelayMs, ease: 'Back.easeOut',
      });
    });
  }

  update(_time, delta) {
    const dt = Math.min(delta, 100) / 1000;
    this.fx.update(dt);
    this.ball.update(dt);
  }
}
