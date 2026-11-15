import Phaser from 'phaser';
import layout from '../data/layout.json';
import theme from '../data/themes/neon.json';
import { fxCfg } from '../fx/config.js';
import { Fx } from '../fx/Fx.js';
import { hex } from '../core/color.js';
import { getProfile } from '../meta/save.js';
import { attendData, rewardFor, claimed, canClaim, claim, daysLeft } from '../meta/attendance.js';
import { makeButton, makePanel, makeCorner, fadeIn, style, styleD, fmtShort } from './widgets.js';
import { t } from './i18n.js';

const C = attendData.screen;

/** 출석 체크: 28칸(7×4) 달력, 7일마다 큰 보상, 오늘 받기 버튼 */
export class AttendanceScene extends Phaser.Scene {
  constructor() { super('Attendance'); }

  create() {
    fadeIn(this);
    this.fx = new Fx(this, fxCfg, { fontFamily: theme.fontFamily });
    this.profile = getProfile();
    makePanel(this, 'attend.title');
    this.corner = makeCorner(this, this.profile);
    const W = layout.width;
    const left = W / 2 - (C.cols * C.cellW + (C.cols - 1) * C.gap) / 2;
    this.cells = [];
    for (let i = 0; i < attendData.cycleDays; i++) {
      const n = i + 1;
      const x = left + (i % C.cols) * (C.cellW + C.gap) + C.cellW / 2;
      const y = C.top + Math.floor(i / C.cols) * (C.cellH + C.gap) + C.cellH / 2;
      const big = attendData.big[String(n)] !== undefined;
      const color = hex(big ? C.bigColor : theme.hudText);
      const box = this.add.rectangle(x, y, C.cellW, C.cellH, hex(theme.cardBackground), 0.9).setStrokeStyle(big ? 3 : 1.5, color, big ? 0.9 : 0.4);
      const day = this.add.text(x, y - C.cellH / 2 + 14, t('attend.day', { n }), style(C.daySize, theme.textDim)).setOrigin(0.5);
      const icon = this.add.text(x, y + 2, big ? '🎁' : '💰', style(big ? 24 : 18)).setOrigin(0.5);
      const amt = this.add.text(x, y + C.cellH / 2 - 14, fmtShort(rewardFor(n)), styleD(C.rewardSize, big ? C.bigColor : theme.currencySoft)).setOrigin(0.5);
      const check = this.add.text(x, y, '✓', styleD(40, theme.button)).setOrigin(0.5).setVisible(false);
      this.cells.push({ box, day, icon, amt, check, x, y });
    }
    this.btn = makeButton(this, W / 2, C.claimY, '', { w: C.claimW, h: C.claimH, color: theme.buttonPrimary, onClick: () => this.take() });
    this.info = this.add.text(W / 2, C.infoY, '', { ...style(layout.fontSize.small, theme.textDim), align: 'center' }).setOrigin(0.5);
    this.refresh();
  }

  refresh() {
    const done = claimed();
    const can = canClaim();
    this.cells.forEach((c, i) => {
      const got = i < done;
      for (const o of [c.day, c.icon, c.amt]) o.setAlpha(got ? C.doneAlpha : 1);
      c.check.setVisible(got);
      c.box.setFillStyle(hex(i === done && can ? theme.buttonPrimary : theme.cardBackground), i === done && can ? 0.35 : 0.9);
    });
    this.btn.label.setText(t(can ? 'attend.claim' : 'attend.done'));
    this.btn.setEnabled(can);
    this.info.setText(t('attend.info', { n: done, max: attendData.cycleDays, d: daysLeft() }));
  }

  take() {
    const i = claimed();
    const n = claim();
    if (!n) return;
    const c = this.cells[i];
    this.fx.p.emit('cardSparkle', c.x, c.y, hex(theme.currency));
    this.fx.juice.flash('white');
    this.tweens.add({ targets: [c.box, c.icon], scale: 1.2, duration: 140, yoyo: true });
    this.corner.refresh(this.profile);
    this.refresh();
  }

  update(_t, delta) { this.fx.update(Math.min(delta, 100) / 1000); }
}
