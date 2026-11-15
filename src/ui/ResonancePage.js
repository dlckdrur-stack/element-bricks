import layout from '../data/layout.json';
import theme from '../data/themes/neon.json';
import { hex } from '../core/color.js';
import {
  resData, isUnlocked, engraving, equipped, pending, toggleEquip, useStone, stoneCost, resolve, estimate, optionOdds,
} from '../meta/resonance.js';
import { makeButton, style, fmtNum, confirmDialog } from './widgets.js';
import { t } from './i18n.js';

const C = resData.screen;
const pct = (x) => Math.round(x * 1000) / 10;
const gColor = (g) => resData.gradeColors[g];
const MAX_BLOCKS = 1 + resData.multi.count; // 현재 + 새 옵션 최대 3개

/** 잠재 한 줄 문구 (이탈이면 앞에 표시) */
function lineText(l, el) {
  return (l.outlier ? t('res.outlier') : '') + t(`res.opt.${l.id}`, { n: pct(l.value), el: t(`element.${el}`) });
}
const lineColor = (l) => (l.beyond ? resData.outlier.color : gColor(l.grade));

/**
 * 강화 화면의 "공명석" 탭 (메이플 큐브식). 다이아 클리어 전에는 잠김.
 * 위: 각인 6개 목록(등급·예상 데미지·장착 버튼) / 아래: 고른 각인의 잠재 3줄 + 공명석 1회 · 3개 보기
 * 돌린 뒤: 현재 옵션 + 새 옵션(1~3개)을 위아래로, 누르면 그 옵션으로 변경 / "현재 옵션 유지"
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
    // 비교 블록: 0 = 현재, 1~3 = 새 옵션 (누르면 변경)
    this.blocks = Array.from({ length: MAX_BLOCKS }, (_, i) => {
      const y = C.blockTop + i * (C.blockH + C.blockGap);
      const bg = s.add.rectangle(W / 2, y + C.blockH / 2, C.blockW, C.blockH, hex(theme.cardBackground), 0.92).setStrokeStyle(1.5, hex(theme.hudText), 0.3);
      if (i > 0) bg.setInteractive({ useHandCursor: true }).on('pointerup', () => this.choose(i - 1));
      const head = T(W / 2, y + 18, fs.small + 1, theme.hudText, true);
      const lines = [0, 1, 2].map((j) => T(W / 2, y + 44 + j * 22, fs.small, theme.text));
      this.root.add(bg);
      this.root.sendToBack(bg);
      return { bg, head, lines };
    });
    this.hint = T(W / 2, C.hintY, fs.small, theme.textDim);
    this.roll1 = makeButton(s, W / 2 - C.rollGap / 2, C.rollY, '', { w: C.rollW2, h: C.rollH, color: theme.buttonPrimary, size: fs.cardDesc, onClick: () => this.useStone(false) });
    this.roll3 = makeButton(s, W / 2 + C.rollGap / 2, C.rollY, '', { w: C.rollW2, h: C.rollH, color: theme.currency, size: fs.cardDesc, onClick: () => this.useStone(true) });
    this.prob = makeButton(s, W / 2, C.probY, t('res.prob'), { w: C.rollW * 0.6, h: 40, size: fs.small, color: theme.hudText, onClick: () => this.showOdds() });
    this.keep = makeButton(s, W / 2, C.keepY, t('res.keepNow'), { w: C.choiceW * 1.4, h: C.choiceH, color: theme.hudText, onClick: () => this.choose(-1) });
    this.root.add([this.roll1, this.roll3, this.prob, this.keep]);
    this.buttons.push(this.roll1, this.roll3, this.prob, this.keep);
    this.refresh();
  }

  setVisible(on) {
    this.root.setVisible(on);
    this.visible = on;
    for (const b of this.buttons) b.bg.input.enabled = on && b.visible;
    for (const r of this.rows ?? []) r.hit.input.enabled = on && r.hit.visible;
    for (const b of this.blocks ?? []) if (b.bg.input) b.bg.input.enabled = on && b.bg.visible;
  }

  refresh() {
    if (!this.rows) return;
    const eq = equipped();
    const p = pending();
    const comparing = !!p;
    for (const r of this.rows) {
      const e = engraving(r.el);
      r.name.setText(`${t(`element.${r.el}`)} · ${t(`res.grade.${e.grade}`)}`).setColor(gColor(e.grade));
      r.est.setText(e.lines.length ? `+${pct(estimate(e.lines))}%` : '');
      const on = eq.includes(r.el);
      r.btn.label.setText(t(on ? 'res.unequip' : 'res.equip', { n: eq.length, max: resData.slots }));
      r.btn.bg.setFillStyle(hex(theme.button), on ? 0.5 : 0.1);
      r.hit.setStrokeStyle(r.el === this.sel ? 2 : 0, hex(gColor(e.grade)));
      for (const o of [r.hit, r.name, r.est, r.btn]) o.setVisible(!comparing); // 비교 중엔 목록을 감추고 블록을 크게
    }
    const e = engraving(this.sel);
    const up = resData.upgrade.find((u) => u.from === e.grade);
    this.title.setText(t('res.title', { el: t(`element.${this.sel}`), g: t(`res.grade.${e.grade}`) })
      + (up ? t('res.pity', { n: e.pity, max: up.pity }) : '')).setColor(gColor(e.grade));
    const fill = (list, lines, el) => list.forEach((o, i) => {
      const l = lines[i];
      o.setText(l ? lineText(l, el) : (i === 0 && !lines.length ? t('res.empty') : '')).setColor(l ? lineColor(l) : theme.hudText);
    });
    for (const o of [this.title, ...this.cur, this.curEst, this.roll1, this.roll3, this.prob]) o.setVisible(!comparing);
    for (const o of [this.keep, this.hint]) o.setVisible(comparing);
    this.blocks.forEach((b, i) => {
      const lines = !comparing ? null : i === 0 ? engraving(p.el).lines : p.choices[i - 1];
      const on = !!lines;
      for (const o of [b.bg, b.head, ...b.lines]) o.setVisible(on);
      if (!on) return;
      const est = estimate(lines);
      const base = estimate(engraving(p.el).lines);
      if (i === 0) b.head.setText(`${t('res.current')} · ${t('res.est', { n: pct(est) })}`).setColor(theme.hudText);
      else {
        const d = est - base;
        b.head.setText(`${t('res.pick', { i, n: pct(est) })}  ${t(d >= 0 ? 'res.up' : 'res.down', { n: pct(Math.abs(d)) })}`).setColor(d >= 0 ? theme.currencySoft : theme.danger);
      }
      fill(b.lines, lines, p.el);
    });
    if (comparing) this.hint.setText(t('res.tapHint'));
    else {
      fill(this.cur, e.lines, this.sel);
      this.curEst.setText(e.lines.length ? t('res.est', { n: pct(estimate(e.lines)) }) : '');
      this.roll1.label.setText(t('res.use1', { n: fmtNum(stoneCost(false)) }));
      this.roll3.label.setText(t('res.use3', { n: fmtNum(stoneCost(true)) }));
      this.roll1.setEnabled(this.scene.profile.currency >= stoneCost(false));
      this.roll3.setEnabled(this.scene.profile.currency >= stoneCost(true));
    }
    if (this.visible !== undefined) this.setVisible(this.visible);
  }

  useStone(multi) {
    const before = engraving(this.sel).grade;
    const p = useStone(this.sel, multi);
    if (!p) return;
    const fx = this.scene.fx;
    const x = layout.width / 2;
    const after = engraving(this.sel).grade;
    fx.p.emit('cardSparkle', x, C.blockTop + C.blockH, hex(gColor(after)));
    if (after !== before) { // 등급 상승!
      fx.p.emit('prismStar', x, C.blockTop, hex(gColor(after)));
      fx.juice.flash('prism');
      fx.juice.shake('mid');
    }
    if (p.choices.some((lines) => lines.some((l) => l.outlier))) fx.juice.flash('white'); // 이탈!
    this.onChange();
  }

  choose(i) {
    resolve(i);
    this.onChange();
  }

  /** 확률표 공개 (등급 상승 + 이 각인 등급의 옵션 확률 + 이탈) */
  showOdds() {
    const g = engraving(this.sel).grade;
    const up = resData.upgrade.map((u) => t('res.oddsUp', { a: t(`res.grade.${u.from}`), r: pct(u.rate), p: u.pity })).join('\n');
    const opts = optionOdds(g).map((o) => `${lineText({ id: o.id, value: o.value }, this.sel)}  ${pct(o.chance)}%`).join('\n');
    const out = t('res.oddsOutlier', { n: pct(resData.outlier.chance) });
    confirmDialog(this.scene, `${up}\n${out}\n\n${t('res.oddsLines', { g: t(`res.grade.${g}`) })}\n${opts}`, () => {}, { raw: true, okOnly: true });
  }
}
