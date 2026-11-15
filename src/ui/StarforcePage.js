import layout from '../data/layout.json';
import theme from '../data/themes/neon.json';
import { hex } from '../core/color.js';
import { sfData, star, isUnlocked, isMax, dmgAt, canProtect, costFor, odds, tryStar, ticketHere, ticketsHere } from '../meta/starforce.js';
import { buyTicket } from '../meta/enhance.js';
import { makeButton, style, styleD, fmtNum } from './widgets.js';
import { t } from './i18n.js';

const C = sfData.screen;
const pct = (x) => Math.round(x * 1000) / 10;

/**
 * 강화 화면의 "성좌" 탭. 챌린저 100스테이지 전에는 잠김.
 * 별 20개 · 현재 단계와 효과 · 확률(성공/유지/붕괴) · 비용 · 방지권(공 강화와 공용) 사용·구매 · 강화 버튼
 */
export class StarforcePage {
  constructor(scene, { onChange }) {
    this.scene = scene;
    this.onChange = onChange;
    this.protect = true;
    const s = scene;
    const W = layout.width;
    const fs = layout.fontSize;
    this.root = s.add.container(0, 0);
    this.buttons = [];
    if (!isUnlocked()) {
      this.root.add([
        s.add.text(W / 2, C.lockY - 60, '★', style(fs.title * 1.4, theme.textDim)).setOrigin(0.5),
        s.add.text(W / 2, C.lockY, t('sf.locked', { n: sfData.unlockStage }), style(fs.cardDesc, theme.hudText)).setOrigin(0.5),
      ]);
      return;
    }
    const rowW = (C.perRow - 1) * C.starGap;
    this.stars = [];
    for (let i = 0; i < sfData.maxStar; i++) { // 5개씩 5줄
      const row = Math.floor(i / C.perRow);
      const col = i % C.perRow;
      const gx = W / 2 - rowW / 2 + col * C.starGap;
      const img = s.add.image(gx, C.starsTop + row * C.starGap, 'fx', 'star').setDisplaySize(C.starSize, C.starSize);
      this.stars.push(img);
    }
    this.starT = s.add.text(W / 2, C.starY, '', styleD(C.starTextSize, theme.currencySoft)).setOrigin(0.5);
    this.effT = s.add.text(W / 2, C.effY, '', style(fs.cardDesc, theme.text)).setOrigin(0.5);
    this.rateT = s.add.text(W / 2, C.rateY, '', style(fs.cardDesc - 2, theme.hudText)).setOrigin(0.5);
    this.costT = s.add.text(W / 2, C.costY, '', style(fs.cardDesc + 2, theme.currencySoft, true)).setOrigin(0.5);
    this.protBtn = makeButton(s, W / 2 - C.protectGap / 2, C.protectY, '', {
      w: C.protectW, h: C.protectH, size: fs.small, color: theme.hudText, onClick: () => { this.protect = !this.protect; this.refresh(); },
    });
    this.buyBtn = makeButton(s, W / 2 + C.protectGap / 2, C.protectY, '', {
      w: C.protectW, h: C.protectH, size: fs.small, color: theme.currency, onClick: () => { const tk = ticketHere(); if (tk && buyTicket(tk.id)) this.onChange(); },
    });
    this.go = makeButton(s, W / 2, C.goY, t('sf.go'), { w: C.buttonW, h: C.buttonH, color: theme.buttonPrimary, onClick: () => this.enhance() });
    this.resultT = s.add.text(W / 2, C.resultY, '', styleD(C.resultSize, theme.text)).setOrigin(0.5).setAlpha(0);
    this.root.add([...this.stars, this.starT, this.effT, this.rateT, this.costT, this.protBtn, this.buyBtn, this.go, this.resultT]);
    this.buttons = [this.protBtn, this.buyBtn, this.go];
    this.refresh();
  }

  setVisible(on) {
    this.root.setVisible(on);
    for (const b of this.buttons) b.bg.input.enabled = on;
    if (on) this.refresh();
  }

  refresh() {
    if (!this.stars) return;
    const s = star();
    this.stars.forEach((img, i) => img.setTint(hex(i < s ? C.on : C.off)));
    this.starT.setText(t('sf.star', { n: s }));
    if (isMax()) {
      this.effT.setText(t('sf.eff', { n: pct(dmgAt(s)) }));
      this.rateT.setText('');
      this.costT.setText(t('sf.max'));
      this.go.setEnabled(false);
    } else {
      this.effT.setText(t('sf.effNext', { n: pct(dmgAt(s)), m: pct(dmgAt(s + 1)) }));
      const o = odds(s);
      this.rateT.setText(t('sf.rate', { s: pct(o.success), f: pct(o.fail), d: pct(o.destroy) }));
      const cost = costFor(s);
      this.costT.setText(t('meta.currency', { n: fmtNum(cost) }));
      this.go.setEnabled(this.scene.profile.currency >= cost);
    }
    const tk = ticketHere(s);
    for (const b of [this.protBtn, this.buyBtn]) { b.setVisible(!!tk); b.bg.input.enabled = this.root.visible && !!tk; }
    this.protBtn.label.setText(t(this.protect ? 'sf.protectOn' : 'sf.protectOff', { n: ticketsHere(s) }));
    if (tk) {
      this.buyBtn.label.setText(t('sf.buy', { n: fmtNum(tk.price) }));
      this.buyBtn.setEnabled(this.scene.profile.currency >= tk.price);
    }
  }

  enhance() {
    const s = this.scene;
    const before = star();
    const r = tryStar(this.protect && canProtect(before));
    if (r === 'saved') s.fx.juice.flash('white');
    if (!r) return;
    const colors = { success: theme.currency, fail: theme.hudText, destroy: theme.danger, saved: theme.button };
    this.resultT.setText(t(`sf.${r}`)).setColor(colors[r]).setAlpha(1).setScale(1.4);
    s.tweens.killTweensOf(this.resultT);
    s.tweens.add({ targets: this.resultT, scale: 1, duration: 260, ease: 'Back.easeOut' });
    s.tweens.add({ targets: this.resultT, alpha: 0, delay: 900, duration: 400 });
    const img = this.stars[Math.min(before, this.stars.length - 1)];
    if (r === 'success') {
      s.fx.p.emit('cardSparkle', img.x, img.y, hex(C.on));
      s.tweens.add({ targets: img, scale: img.scale * 1.6, duration: 140, yoyo: true });
    } else if (r === 'destroy') {
      s.fx.juice.shake('big');
      s.fx.juice.flash('white');
    }
    this.onChange();
  }
}
