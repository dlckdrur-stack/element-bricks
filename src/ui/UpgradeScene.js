import Phaser from 'phaser';
import layout from '../data/layout.json';
import theme from '../data/themes/neon.json';
import upgData from '../data/upgrades.json';
import { fxCfg } from '../fx/config.js';
import { Fx } from '../fx/Fx.js';
import { hex } from '../core/color.js';
import { getProfile, commitProfile } from '../meta/save.js';
import { applyFxSettings } from '../meta/settings.js';
import { upgradeList, level, isMaxed, nextCost, effect, buy } from '../meta/upgrades.js';
import { makeButton, makePanel, makeCorner, fadeIn, style, fmtNum } from './widgets.js';
import { t } from './i18n.js';
import { EnhancePage } from './EnhancePage.js';
import { ResonancePage } from './ResonancePage.js';
import { StarforcePage } from './StarforcePage.js';
import { isFeatureUnlocked } from '../meta/tiers.js';

const C = upgData.screen;
const TABS = ['upgrade', 'enhance', 'resonance', 'starforce'];

/** 효과 숫자 표시용: pct → 15, count/level → 2 */
function effNum(u, v) {
  return u.fmt === 'pct' ? Math.round(v * 1000) / 10 : v;
}

/**
 * 강화 화면. 탭: 업그레이드(영구 강화 12종) / 공명석(100스테이지 전에는 잠김).
 * 각 줄: 이름, 현재 단계·효과, 다음 비용 구매 버튼. 사면 반짝임.
 */
export class UpgradeScene extends Phaser.Scene {
  constructor() { super('Upgrade'); }

  create() {
    fadeIn(this);
    this.fx = new Fx(this, fxCfg, { fontFamily: theme.fontFamily });
    applyFxSettings(this.fx);
    this.profile = getProfile();
    makePanel(this, 'upgrade.title');
    this.corner = makeCorner(this, this.profile);

    this.enhance = new EnhancePage(this, { onChange: () => this.refresh() });
    this.resonance = new ResonancePage(this, { onChange: () => this.refresh() });
    this.starforce = new StarforcePage(this, { onChange: () => this.refresh() });
    this.pages = { upgrade: this.makeUpgradePage(), enhance: this.enhance, resonance: this.resonance, starforce: this.starforce };
    const W = layout.width;
    this.tabs = TABS.map((key, i) => makeButton(this, W / 2 + (i - (TABS.length - 1) / 2) * C.tabGap, C.tabY,
      t(`upgrade.tab.${key}`), { w: C.tabW, h: C.tabH, size: layout.fontSize.cardDesc + 2, onClick: () => this.showTab(key) }));
    this.showTab('upgrade');

    if (import.meta.env.DEV) { // 개발용: 테스트 재화 넣기 (배포 빌드에는 없음)
      makeButton(this, C.devX, C.devY, t('upgrade.dev', { n: fmtNum(C.devAmount) }), {
        w: C.devW, h: C.devH, size: layout.fontSize.small, color: theme.danger,
        onClick: () => { this.profile.currency += C.devAmount; commitProfile(); this.refresh(); },
      });
    }
  }

  showTab(key) {
    TABS.forEach((k, i) => {
      this.pages[k].setVisible(k === key);
      this.tabs[i].bg.setFillStyle(hex(theme.button), k === key ? 0.45 : 0.1);
    });
    for (const r of this.rows) r.btn.bg.input.enabled = key === 'upgrade'; // 숨은 탭 버튼은 못 누르게
  }

  makeUpgradePage() {
    const page = this.add.container(0, 0);
    const fs = layout.fontSize;
    this.rows = upgradeList.map((u, i) => {
      const y = C.listTop + i * C.rowH;
      const name = this.add.text(C.nameX, y - 10, t(`upg.${u.id}.name`), style(fs.cardDesc, theme.text, true)).setOrigin(0, 0.5);
      const info = this.add.text(C.nameX, y + 12, '', style(fs.small - 1, theme.hudText)).setOrigin(0, 0.5);
      const btn = makeButton(this, C.buyX, y, '', {
        w: C.buyW, h: C.buyH, size: fs.small + 1, color: theme.currency, onClick: () => this.purchase(u, row),
      });
      const row = { u, y, name, info, btn };
      page.add([name, info, btn]);
      return row;
    });
    this.refresh();
    return page;
  }

  refresh() {
    this.corner.refresh(this.profile);
    this.enhance?.refresh();
    this.resonance?.refresh();
    this.starforce?.refresh();
    for (const r of this.rows ?? []) {
      const { u } = r;
      const lv = level(u.id);
      r.info.setText(t('upgrade.row', { lv, max: u.levels, eff: t(`upg.${u.id}.eff`, { n: effNum(u, effect(u.id)) }) }));
      if (isMaxed(u.id)) {
        r.btn.label.setText(t('upgrade.max'));
        r.btn.setEnabled(false);
      } else {
        const cost = nextCost(u.id);
        r.btn.label.setText(t('meta.currency', { n: fmtNum(cost) }));
        r.btn.setEnabled(this.profile.currency >= cost);
      }
    }
  }

  purchase(u, row) {
    if (!buy(u.id)) return;
    const x = C.buyX;
    const color = hex(theme.currency);
    this.fx.p.emit(C.sparkle, x, row.y, color);
    this.fx.p.emit(C.sparkleStar, C.nameX + 80, row.y, color);
    for (const o of [row.name, row.info]) {
      this.tweens.add({ targets: o, scale: C.popScale, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
    }
    this.tweens.add({ targets: this.corner.money, scale: C.popScale, duration: 110, yoyo: true });
    this.refresh();
  }

  update(_t, delta) {
    this.fx.update(Math.min(delta, 100) / 1000);
  }
}
