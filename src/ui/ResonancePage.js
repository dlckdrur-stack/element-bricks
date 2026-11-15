import layout from '../data/layout.json';
import theme from '../data/themes/neon.json';
import { hex } from '../core/color.js';
import {
  resData, isUnlocked, engraving, equipped, pending, toggleEquip, useStone, resolve, estimate, optionOdds,
} from '../meta/resonance.js';
import { makeButton, style, fmtNum, confirmDialog } from './widgets.js';
import { t } from './i18n.js';

const C = resData.screen;
const pct = (x) => Math.round(x * 1000) / 10;
const gColor = (g) => resData.gradeColors[g];

/** 잠재 한 줄 문구 */
function lineText(l, el) {
  return t(`res.opt.${l.id}`, { n: pct(l.value), el: t(`element.${el}`) });
}

/**
 * 강화 화면의 "공명석" 탭 (메이플 큐브식). 다이아 클리어 전에는 잠김.
 * 위: 각인 6개 목록(등급·예상 데미지·장착 버튼) / 아래: 고른 각인의 잠재 3줄 + 공명석 사용
 * 돌린 뒤: 현재 옵션과 새 옵션을 나란히, 예상 데미지 비교 → 유지 / 변경
 */
export class ResonancePage {
  constructor(scene, { onChange }) {
    this.scene = scene;
    this.onChange = onChange;
    this.sel = pending()?.el ?? resData.elements[0];
    const s = scene;
    const fs = layout.fontSize;
    const W = layout.width;
    this.root = s.add.container(0, 0);
    this.buttons = [];
    if (!isUnlocked()) {
      this.root.add([
        s.add.text(W / 2, 360, '🔒', style(fs.title * 1.4)).setOrigin(0.5),
        s.add.text(W / 2, 450, t('upgrade.resonance.lock2'), style(fs.cardDesc, theme.hudText)).setOrigin(0.5),
      ]);
      return;
    }
    this.rows = resData.elements.map((el, i) => {
      const y = C.listTop + i * C.rowH;
      const hit = s.add.rectangle(W / 2 - 60, y, W - 150, C.rowH - 4, hex(theme.cardBackground), 0.6).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => { if (!pending()) { this.sel = el; this.refresh(); } });
      const name = s.add.text(C.nameX, y, '', style(fs.cardDesc, theme.text, true)).setOrigin(0, 0.5);
      const est = s.add.text(C.equipX - C.equipW / 2 - 12, y, '', style(fs.small, theme.currency)).setOrigin(1, 0.5);
      const btn = makeButton(s, C.equipX, y, '', { w: C.equipW, h: C.equipH, size: fs.small, onClick: () => { toggleEquip(el); this.onChange(); } });
      this.root.add([hit, name, est, btn]);
      this.buttons.push(btn);
      return { el, hit, name, est, btn };
    });
    const T = (x, y, sz, color, bold) => { const o = s.add.text(x, y, '', style(sz, color, bold)).setOrigin(0.5); this.root.add(o); return o; };
    this.title = T(W / 2, C.detailY, fs.cardDesc + 2, theme.text, true);
    this.cur = [0, 1, 2].map((i) => T(W / 2, C.detailY + 34 + i * C.lineGap, fs.cardDesc - 1, theme.text));
    this.curEst = T(W / 2, C.detailY + 34 + 3 * C.lineGap, fs.cardDesc, theme.currency, true);
    this.left = [0, 1, 2].map((i) => T(C.keepX, C.compareY + 60 + i * C.lineGap, fs.small, theme.text));
    this.right = [0, 1, 2].map((i) => T(C.changeX, C.compareY + 60 + i * C.lineGap, fs.small, theme.text));
    this.leftHead = T(C.keepX, C.compareY + 24, fs.cardDesc - 2, theme.hudText, true);
    this.rightHead = T(C.changeX, C.compareY + 24, fs.cardDesc - 2, theme.currency, true);
    this.leftEst = T(C.keepX, C.compareY + 60 + 3 * C.lineGap + 6, fs.cardDesc - 2, theme.hudText, true);
    this.rightEst = T(C.changeX, C.compareY + 60 + 3 * C.lineGap + 6, fs.cardDesc - 2, theme.currency, true);
    this.diff = T(W / 2, C.choiceY - 52, fs.cardDesc, theme.text, true);
    this.roll = makeButton(s, W / 2, C.rollY, '', { w: C.rollW, h: C.rollH, color: theme.buttonPrimary, onClick: () => this.useStone() });
    this.prob = makeButton(s, W / 2, C.probY, t('res.prob'), { w: C.rollW * 0.6, h: 40, size: fs.small, color: theme.hudText, onClick: () => this.showOdds() });
    this.keep = makeButton(s, C.keepX, C.choiceY, t('res.keep'), { w: C.choiceW, h: C.choiceH, color: theme.hudText, onClick: () => this.choose(false) });
    this.change = makeButton(s, C.changeX, C.choiceY, t('res.change'), { w: C.choiceW, h: C.choiceH, color: theme.currency, onClick: () => this.choose(true) });
    this.root.add([this.roll, this.prob, this.keep, this.change]);
    this.buttons.push(this.roll, this.prob, this.keep, this.change);
    this.refresh();
  }

  setVisible(on) {
    this.root.setVisible(on);
    this.visible = on;
    for (const b of this.buttons) b.bg.input.enabled = on && b.visible;
    for (const r of this.rows ?? []) r.hit.input.enabled = on;
  }

  refresh() {
    if (!this.rows) return;
    const eq = equipped();
    const p = pending();
    for (const r of this.rows) {
      const e = engraving(r.el);
      r.name.setText(`${t(`element.${r.el}`)} · ${t(`res.grade.${e.grade}`)}`).setColor(gColor(e.grade));
      r.est.setText(e.lines.length ? `+${pct(estimate(e.lines))}%` : '');
      const on = eq.includes(r.el);
      r.btn.label.setText(t(on ? 'res.unequip' : 'res.equip', { n: eq.length, max: resData.slots }));
      r.btn.bg.setFillStyle(hex(theme.button), on ? 0.5 : 0.1);
      r.hit.setStrokeStyle(r.el === this.sel ? 2 : 0, hex(gColor(e.grade)));
    }
    const e = engraving(this.sel);
    const up = resData.upgrade.find((u) => u.from === e.grade);
    this.title.setText(t('res.title', { el: t(`element.${this.sel}`), g: t(`res.grade.${e.grade}`) })
      + (up ? t('res.pity', { n: e.pity, max: up.pity }) : '')).setColor(gColor(e.grade));
    const show = (list, lines, el) => list.forEach((o, i) => {
      const l = lines[i];
      o.setText(l ? lineText(l, el) : (i === 0 && !lines.length ? t('res.empty') : '')).setColor(l ? gColor(l.grade) : theme.hudText);
    });
    const comparing = !!p;
    for (const o of [...this.cur, this.curEst, this.roll, this.prob]) o.setVisible(!comparing);
    for (const o of [...this.left, ...this.right, this.leftHead, this.rightHead, this.leftEst, this.rightEst, this.diff, this.keep, this.change]) o.setVisible(comparing);
    if (comparing) {
      const old = engraving(p.el).lines;
      const a = estimate(old);
      const b = estimate(p.lines);
      this.leftHead.setText(t('res.current'));
      this.rightHead.setText(t('res.new'));
      show(this.left, old, p.el);
      show(this.right, p.lines, p.el);
      this.leftEst.setText(t('res.est', { n: pct(a) }));
      this.rightEst.setText(t('res.est', { n: pct(b) }));
      const d = b - a;
      this.diff.setText(t(d >= 0 ? 'res.up' : 'res.down', { n: pct(Math.abs(d)) })).setColor(d >= 0 ? theme.currency : theme.danger);
    } else {
      show(this.cur, e.lines, this.sel);
      this.curEst.setText(e.lines.length ? t('res.est', { n: pct(estimate(e.lines)) }) : '');
      this.roll.label.setText(t('res.use', { n: fmtNum(resData.cost) }));
      this.roll.setEnabled(this.scene.profile.currency >= resData.cost);
    }
    if (this.visible !== undefined) this.setVisible(this.visible);
  }

  useStone() {
    const before = engraving(this.sel).grade;
    const p = useStone(this.sel);
    if (!p) return;
    const fx = this.scene.fx;
    const x = layout.width / 2;
    fx.p.emit('cardSparkle', x, C.compareY, hex(gColor(engraving(this.sel).grade)));
    if (engraving(this.sel).grade !== before) { // 등급 상승!
      fx.p.emit('prismStar', x, C.compareY, hex(gColor(engraving(this.sel).grade)));
      fx.juice.flash('prism');
      fx.juice.shake('mid');
    }
    this.onChange();
  }

  choose(change) {
    resolve(change);
    this.onChange();
  }

  /** 확률표 공개 (등급 상승 + 이 각인 등급의 옵션 확률) */
  showOdds() {
    const g = engraving(this.sel).grade;
    const up = resData.upgrade.map((u) => t('res.oddsUp', { a: t(`res.grade.${u.from}`), r: pct(u.rate), p: u.pity })).join('\n');
    const opts = optionOdds(g).map((o) => `${lineText({ id: o.id, value: o.value }, this.sel)}  ${pct(o.chance)}%`).join('\n');
    confirmDialog(this.scene, `${up}\n\n${t('res.oddsLines', { g: t(`res.grade.${g}`) })}\n${opts}`, () => {}, { raw: true, okOnly: true });
  }
}
