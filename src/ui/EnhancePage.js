import Phaser from 'phaser';
import layout from '../data/layout.json';
import theme from '../data/themes/neon.json';
import { hex } from '../core/color.js';
import {
  enhanceData, isUnlocked, level, isMax, dmgMul, nextInfo, ticketFor, ticketCount, buyTicket, tryEnhance,
} from '../meta/enhance.js';
import { makeButton, style, fmtNum } from './widgets.js';
import { t } from './i18n.js';

const C = enhanceData.screen;
const F = enhanceData.fx;
const ADD = Phaser.BlendModes.ADD;
const pct = (x) => Math.round(x * 100);
const mulTxt = (m) => m.toFixed(2);

/** 강에 따른 빛 색: 흰빛 → 금빛(goldFrom) → 프리즘(prismFrom) */
const glowColor = (lv) => hex(lv >= F.glow.prismFrom ? F.glow.prism : lv >= F.glow.goldFrom ? F.glow.gold : F.glow.base);

/**
 * 강화 화면의 "공 강화" 탭 (던파식). 플래티넘 클리어 전에는 잠김.
 * 공 데미지 배율을 크게 보여주고, 다음 강의 배율·확률·비용·방지권을 한눈에.
 */
export class EnhancePage {
  constructor(scene, { onChange }) {
    this.scene = scene;
    this.onChange = onChange;
    this.useTicket = true;
    const W = layout.width;
    const fs = layout.fontSize;
    const s = scene;
    this.root = s.add.container(0, 0);
    if (!isUnlocked()) {
      this.root.add([
        s.add.text(W / 2, C.ballY, '🔒', style(fs.title * 1.4)).setOrigin(0.5),
        s.add.text(W / 2, C.dmgY, t('enhance.locked'), style(fs.cardDesc, theme.hudText)).setOrigin(0.5),
      ]);
      this.buttons = [];
      return;
    }
    this.glow = s.add.image(W / 2, C.ballY, 'fx', 'glow').setBlendMode(ADD);
    this.ball = s.add.image(W / 2, C.ballY, 'fx', 'disc').setDisplaySize(C.ballR * 2, C.ballR * 2);
    this.lvT = s.add.text(W / 2, C.levelY, '', { ...style(C.levelSize, '#05050c', true) }).setOrigin(0.5);
    this.dmgT = s.add.text(W / 2, C.dmgY, '', style(fs.body, theme.currency, true)).setOrigin(0.5);
    this.nextT = s.add.text(W / 2, C.nextY, '', style(fs.cardDesc, theme.text)).setOrigin(0.5);
    this.rateT = s.add.text(W / 2, C.rateY, '', style(fs.cardDesc - 2, theme.hudText)).setOrigin(0.5);
    this.costT = s.add.text(W / 2, C.costY, '', style(fs.cardDesc + 2, theme.currency, true)).setOrigin(0.5);
    this.ticketT = s.add.text(30, C.ticketY, '', style(fs.cardDesc - 2, theme.text)).setOrigin(0, 0.5);
    this.buyBtn = makeButton(s, W - 30 - C.buyW / 2, C.ticketY, '', {
      w: C.buyW, h: C.buyH, size: fs.small, color: theme.currency, onClick: () => this.buy(),
    });
    this.toggle = makeButton(s, W / 2, C.toggleY, '', {
      w: C.buttonW, h: C.buyH, size: fs.small + 1, color: theme.hudText, onClick: () => { this.useTicket = !this.useTicket; this.refresh(); },
    });
    this.go = makeButton(s, W / 2, C.buttonY, t('enhance.go'), {
      w: C.buttonW, h: C.buttonH, color: theme.buttonPrimary, onClick: () => this.enhance(),
    });
    this.resultT = s.add.text(W / 2, C.resultY, '', style(C.resultSize, theme.text, true)).setOrigin(0.5).setAlpha(0);
    this.root.add([this.glow, this.ball, this.lvT, this.dmgT, this.nextT, this.rateT, this.costT, this.ticketT,
      this.buyBtn, this.toggle, this.go, this.resultT]);
    this.buttons = [this.buyBtn, this.toggle, this.go];
    this.pulse = 0;
    s.events.on('update', (_t, d) => this.tick(d / 1000));
    this.refresh();
  }

  setVisible(on) {
    this.root.setVisible(on);
    for (const b of this.buttons) b.bg.input.enabled = on;
  }

  tick(dt) {
    if (!this.glow || !this.root.visible) return;
    this.pulse += dt * 3;
    const lv = level();
    const r = C.ballR * (F.glow.sizeBase + lv * F.glow.sizePerLevel) * (1 + 0.06 * Math.sin(this.pulse));
    this.glow.setDisplaySize(r * 2, r * 2).setAlpha(0.5 + Math.min(0.5, lv * 0.025));
  }

  refresh() {
    if (!this.glow) return;
    const lv = level();
    this.glow.setTint(glowColor(lv));
    this.ball.setTint(0xffffff);
    this.lvT.setText(`+${lv}`);
    this.dmgT.setText(t('enhance.dmg', { m: mulTxt(dmgMul(lv)), p: pct(dmgMul(lv) - 1) }));
    const n = nextInfo(lv);
    const tk = ticketFor(lv);
    if (!n) {
      this.nextT.setText(t('enhance.max'));
      for (const o of [this.rateT, this.costT, this.ticketT]) o.setText('');
      this.go.setEnabled(false);
      this.buyBtn.setVisible(false);
      this.toggle.setVisible(false);
      return;
    }
    this.nextT.setText(t('enhance.next', { a: lv, b: lv + 1, m1: mulTxt(n.mulFrom), m2: mulTxt(n.mulTo), d: mulTxt(n.mulTo - n.mulFrom) }));
    this.rateT.setText(n.reset ? t('enhance.rateReset', { s: pct(n.rate), f: pct(n.fail), r: pct(n.reset) }) : t('enhance.rate', { s: pct(n.rate), f: pct(n.fail) }));
    this.costT.setText(t('meta.currency', { n: fmtNum(n.cost) }));
    this.go.setEnabled(this.scene.profile.currency >= n.cost);
    this.buyBtn.setVisible(!!tk);
    this.toggle.setVisible(!!tk && n.reset > 0);
    this.ticketT.setText(tk ? t('enhance.ticket', { a: tk.from, b: tk.to, n: ticketCount(tk.id) }) : '');
    if (tk) {
      this.buyBtn.label.setText(t('enhance.buy', { n: fmtNum(tk.price) }));
      this.buyBtn.setEnabled(this.scene.profile.currency >= tk.price);
      this.toggle.label.setText(t(this.useTicket ? 'enhance.useOn' : 'enhance.useOff'));
    }
  }

  buy() {
    const tk = ticketFor();
    if (tk && buyTicket(tk.id)) this.scene.fx.p.emit('cardSparkle', this.buyBtn.x, this.buyBtn.y, hex(theme.currency));
    this.onChange();
  }

  enhance() {
    const r = tryEnhance(this.useTicket);
    if (!r.ok) return;
    const fx = this.scene.fx;
    const x = layout.width / 2;
    const y = C.ballY;
    const show = (key, color) => {
      this.resultT.setText(t(key, { n: r.to })).setColor(color).setAlpha(1).setScale(1.6);
      this.scene.tweens.killTweensOf(this.resultT);
      this.scene.tweens.add({ targets: this.resultT, scale: 1, duration: 260, ease: 'Back.easeOut' });
      this.scene.tweens.add({ targets: this.resultT, alpha: 0, delay: 900, duration: 400 });
    };
    if (r.result === 'success') {
      show('enhance.success', theme.currency);
      fx.sprites.play(F.successRing, x, y, glowColor(r.to), { priority: 2 });
      fx.p.emit('prismStar', x, y, glowColor(r.to));
      fx.juice.flash('white');
      fx.juice.shake('mid');
    } else if (r.result === 'reset') {
      show('enhance.reset', theme.danger);
      fx.p.emit('shard', x, y, hex(theme.danger));
      fx.p.emit('iceShatter', x, y, 0xffffff);
      fx.juice.flash('hell');
      fx.juice.shake('huge');
    } else if (r.result === 'saved') {
      show('enhance.saved', F.savedColor);
      fx.sprites.play(F.savedRing, x, y, hex(F.savedColor), { priority: 2 });
      fx.juice.shake('small');
    } else {
      show('enhance.fail', theme.hudText);
      fx.juice.shake('small');
    }
    this.onChange();
  }
}
