import Phaser from 'phaser';
import layout from '../data/layout.json';
import theme from '../data/themes/neon.json';
import shop from '../data/shop.json';
import { fxCfg } from '../fx/config.js';
import { Fx } from '../fx/Fx.js';
import { hex } from '../core/color.js';
import { getProfile, commitProfile } from '../meta/save.js';
import { enhanceData, ticketCount, buyTicket } from '../meta/enhance.js';
import { purchase } from '../net/store.js';
import { makeButton, makePanel, makeCorner, fadeIn, style, fmtNum, confirmDialog } from './widgets.js';
import { t } from './i18n.js';

const C = shop.screen;
const base = shop.packs[0].amount / shop.packs[0].krw; // 가장 작은 패키지의 원당 재화 = 보너스 기준

/**
 * 상점: 재화 패키지(인앱 결제) · 광고 제거 · 초기화 방지권(재화).
 * 웹 버전은 결제가 없어서 "앱에서 구매" 안내만 (개발 모드에서는 테스트로 바로 지급).
 */
export class ShopScene extends Phaser.Scene {
  constructor() { super('Shop'); }

  create() {
    fadeIn(this);
    this.fx = new Fx(this, fxCfg, { fontFamily: theme.fontFamily });
    this.profile = getProfile();
    makePanel(this, 'shop.title');
    this.corner = makeCorner(this, this.profile);
    let y = C.top;
    y = this.header(t('shop.packs'), y);
    for (const p of shop.packs) { this.packRow(p, y); y += C.rowH; }
    y = this.header(t('shop.tickets'), y + C.gap);
    this.ticketRows = enhanceData.tickets.map((tk) => { const r = this.ticketRow(tk, y); y += C.rowH; return r; });
    y = this.header(t('shop.etc'), y + C.gap);
    this.noAdsRow(y);
  }

  header(text, y) {
    this.add.text(C.nameX, y, text, style(layout.fontSize.cardDesc, theme.accent, true)).setOrigin(0, 0.5);
    return y + C.headH;
  }

  name(text, sub, y, color = theme.text) {
    this.add.text(C.nameX, y - 9, text, style(layout.fontSize.cardDesc, color, true)).setOrigin(0, 0.5);
    if (sub) this.add.text(C.nameX, y + 13, sub, style(layout.fontSize.small - 1, theme.hudText)).setOrigin(0, 0.5);
  }

  packRow(p, y) {
    const bonus = Math.round((p.amount / p.krw / base - 1) * 100);
    const tag = p.tag ? ` ${t(`shop.tag.${p.tag}`)}` : '';
    this.name(t('meta.currency', { n: fmtNum(p.amount) }) + tag, bonus > 0 ? t('shop.bonus', { n: bonus }) : '', y, theme.currency);
    makeButton(this, C.buyX, y, t('shop.krw', { n: fmtNum(p.krw) }), {
      w: C.buyW, h: C.buyH, size: layout.fontSize.small + 1, color: theme.currency,
      onClick: () => this.buyReal(p.id, () => { this.profile.currency += p.amount; }),
    });
  }

  ticketRow(tk, y) {
    const label = this.add.text(C.nameX, y, '', style(layout.fontSize.cardDesc, theme.text, true)).setOrigin(0, 0.5);
    const btn = makeButton(this, C.buyX, y, t('meta.currency', { n: fmtNum(tk.price) }), {
      w: C.buyW, h: C.buyH, size: layout.fontSize.small + 1, color: theme.button,
      onClick: () => { if (buyTicket(tk.id)) this.sparkle(y); this.refresh(); },
    });
    const r = { tk, label, btn };
    this.refreshTicket(r);
    return r;
  }

  refreshTicket(r) {
    r.label.setText(t('shop.ticket', { a: r.tk.from, b: r.tk.to, n: ticketCount(r.tk.id) }));
    r.btn.setEnabled(this.profile.currency >= r.tk.price);
  }

  noAdsRow(y) {
    this.name(t('shop.noAds'), t('shop.noAdsSub'), y);
    const btn = makeButton(this, C.buyX, y, this.profile.noAds ? t('shop.owned') : t('shop.krw', { n: fmtNum(shop.noAds.krw) }), {
      w: C.buyW, h: C.buyH, size: layout.fontSize.small + 1, color: theme.button,
      onClick: () => this.buyReal(shop.noAds.id, () => { this.profile.noAds = true; btn.label.setText(t('shop.owned')); btn.setEnabled(false); }),
    });
    if (this.profile.noAds) btn.setEnabled(false);
  }

  /** 인앱 결제: 성공하면 지급 후 저장, 웹이면 앱 안내 */
  async buyReal(id, grant) {
    const r = await purchase(id);
    if (!r.ok) { confirmDialog(this, 'shop.appOnly', () => {}, { okOnly: true }); return; }
    grant();
    commitProfile();
    this.sparkle(layout.height / 2);
    this.refresh();
  }

  sparkle(y) {
    this.fx.p.emit('cardSparkle', C.buyX, y, hex(theme.currency));
    this.fx.p.emit('prismStar', layout.width / 2, y, hex(theme.currency));
  }

  refresh() {
    this.corner.refresh(this.profile);
    for (const r of this.ticketRows) this.refreshTicket(r);
  }

  update(_t, d) { this.fx.update(Math.min(d, 100) / 1000); }
}
