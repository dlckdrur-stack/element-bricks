import Phaser from 'phaser';
import layout from '../data/layout.json';
import theme from '../data/themes/neon.json';
import { fxCfg } from '../fx/config.js';
import { Fx } from '../fx/Fx.js';
import { hex } from '../core/color.js';
import { getProfile } from '../meta/save.js';
import { questData, quests, isDone, claimQuest, canClaimBonus } from '../meta/quests.js';
import { makeButton, makePanel, makeCorner, fadeIn, style, fmtShort } from './widgets.js';
import { t } from './i18n.js';

const C = questData.screen;

/** 일일 퀘스트: 오늘의 퀘스트 3개 (진행 막대·보상·받기) + 모두 완료 보너스 */
export class QuestScene extends Phaser.Scene {
  constructor() { super('Quest'); }

  create() {
    fadeIn(this);
    this.fx = new Fx(this, fxCfg, { fontFamily: theme.fontFamily });
    this.profile = getProfile();
    makePanel(this, 'quest.title');
    this.corner = makeCorner(this, this.profile);
    const W = layout.width;
    const fs = layout.fontSize;
    const L = (W - C.cardW) / 2;
    this.cards = quests().list.map((q, i) => {
      const top = C.top + i * (C.cardH + C.cardGap);
      this.add.rectangle(W / 2, top + C.cardH / 2, C.cardW, C.cardH, hex(theme.cardBackground), 0.92).setStrokeStyle(1.5, hex(theme.hudText), 0.3);
      this.add.text(L + 16, top + 26, this.questText(q), { ...style(fs.cardDesc, theme.text, true), wordWrap: { width: C.cardW - 32 } }).setOrigin(0, 0.5);
      this.add.rectangle(L + 16, top + 72, C.barW, C.barH, 0xffffff, 0.08).setOrigin(0, 0.5);
      const bar = this.add.rectangle(L + 16, top + 72, C.barW, C.barH, hex(theme.button)).setOrigin(0, 0.5);
      const prog = this.add.text(L + 16 + C.barW + 10, top + 72, '', style(fs.small, theme.textDim)).setOrigin(0, 0.5);
      this.add.text(L + 16, top + 106, t('quest.reward', { n: fmtShort(q.reward) }), style(fs.small + 1, theme.currencySoft, true)).setOrigin(0, 0.5);
      const btn = makeButton(this, W / 2 + C.cardW / 2 - 16 - C.claimW / 2, top + 106, '', {
        w: C.claimW, h: C.claimH, size: fs.small + 1, color: theme.buttonPrimary, onClick: () => this.take(i, btn),
      });
      return { q, bar, prog, btn };
    });
    this.bonusBtn = makeButton(this, W / 2, C.bonusY, '', { w: C.cardW * 0.8, h: 62, color: theme.currency, onClick: () => this.take('bonus', this.bonusBtn) });
    this.add.text(W / 2, C.infoY, t('quest.info'), { ...style(fs.small, theme.textDim), align: 'center' }).setOrigin(0.5);
    this.refresh();
  }

  questText(q) {
    const name = q.aug ? t(`aug.${q.aug}.name`) : '';
    return t(`quest.${q.type}`, { n: q.n, el: q.el ? t(`element.${q.el}`) : '', aug: name });
  }

  refresh() {
    for (const c of this.cards) {
      const { q } = c;
      c.bar.scaleX = Math.min(1, q.progress / q.n);
      c.prog.setText(`${q.progress}/${q.n}`);
      c.btn.label.setText(t(q.claimed ? 'quest.claimed' : isDone(q) ? 'quest.claim' : 'quest.going'));
      c.btn.setEnabled(isDone(q) && !q.claimed);
    }
    const s = quests();
    this.bonusBtn.label.setText(t(s.bonus ? 'quest.bonusDone' : 'quest.bonus', { n: fmtShort(questData.allClearBonus) }));
    this.bonusBtn.setEnabled(canClaimBonus());
  }

  take(i, btn) {
    if (!claimQuest(i)) return;
    this.fx.p.emit('cardSparkle', btn.x, btn.y, hex(theme.currency));
    this.corner.refresh(this.profile);
    this.refresh();
  }

  update(_t, delta) { this.fx.update(Math.min(delta, 100) / 1000); }
}
