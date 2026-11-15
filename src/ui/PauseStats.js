import layout from '../data/layout.json';
import theme from '../data/themes/neon.json';
import { hex } from '../core/color.js';
import { style, styleD, fmtNum, fmtShort } from './widgets.js';
import { t } from './i18n.js';

/**
 * 일시정지 화면 내용: 윗줄(스테이지·레벨 / 이번 판 획득 재화) + 피해 카드 + 보유 증강 카드.
 * 글자는 밝기를 낮춘 textSoft·textDim 위주. 배치는 screens.json 의 pause.
 */
export function showPauseStats(scene, P, g) {
  const fs = layout.fontSize;
  const mgr = g.augments;
  const W = layout.width;
  const L = (W - P.cardW) / 2;
  const R = L + P.cardW;

  scene.add.text(L + 4, P.infoY, `${g.hud.stage.text}  ·  ${g.hud.level.text}`, styleD(fs.small + 2, theme.textSoft)).setOrigin(0, 0.5);
  scene.add.text(R - 4, P.infoY, t('pause.earned', { n: fmtNum(g.wallet.total) }), styleD(fs.small + 2, theme.currencySoft)).setOrigin(1, 0.5);

  // ---- 피해 카드
  card(scene, L, P.card1Top, P.cardW, P.card1H, P);
  const hy = P.card1Top + P.headY;
  scene.add.text(L + P.pad, hy, t('pause.dmgHead'), styleD(fs.cardDesc, theme.textSoft)).setOrigin(0, 0.5);
  scene.add.text(R - P.pad, hy, t('pause.dmgTotal', { n: fmtShort(g.dmgStats.total) }), styleD(fs.cardDesc, theme.currencySoft)).setOrigin(1, 0.5);
  const rows = g.dmgStats.top(P.rows);
  if (!rows.length) scene.add.text(W / 2, hy + P.rowTop, t('pause.noDmg'), style(fs.small, theme.textDim)).setOrigin(0.5);
  rows.forEach((r, i) => {
    const y = P.card1Top + P.rowTop + i * P.rowH;
    const def = mgr.defs.get(r.key);
    const name = r.key === 'ball' ? t('pause.ball') : def ? t(`aug.${r.key}.name`) : t(`element.${r.key}`);
    const color = def ? mgr.color(def.element) : 0xd0d6ee;
    const nameT = scene.add.text(L + P.pad, y, name, style(fs.small, theme.textSoft)).setOrigin(0, 0.5);
    if (nameT.width > P.nameW) nameT.setScale(P.nameW / nameT.width, 1);
    const bx = L + P.pad + P.nameW + 10;
    scene.add.rectangle(bx, y, P.barW, P.barH, 0xffffff, 0.06).setOrigin(0, 0.5);
    scene.add.rectangle(bx, y, Math.max(2, P.barW * r.share), P.barH, color, 0.85).setOrigin(0, 0.5);
    scene.add.text(R - P.pad - P.pctW, y, fmtShort(r.dmg), style(fs.small, theme.textSoft)).setOrigin(1, 0.5);
    scene.add.text(R - P.pad, y, `${(Math.round(r.share * 1000) / 10).toFixed(1)}%`, style(fs.small, theme.textDim)).setOrigin(1, 0.5);
  });

  // ---- 보유 증강 카드: 속성별 한 줄씩 (속성 이름은 그 속성 색)
  card(scene, L, P.card2Top, P.cardW, P.card2H, P);
  const owned = [...mgr.owned.values()];
  const cnt = mgr.pickCounts();
  const hy2 = P.card2Top + P.headY;
  scene.add.text(L + P.pad, hy2, t('pause.augHead', { n: owned.length }), styleD(fs.cardDesc, theme.textSoft)).setOrigin(0, 0.5);
  scene.add.text(R - P.pad, hy2, t('pause.caps', { m: cnt.main, mm: mgr.caps.main, s: cnt.sub, sm: mgr.caps.sub }), style(fs.small, theme.textDim)).setOrigin(1, 0.5);
  let y = hy2 + P.roleGap;
  const role = mgr.roleText(t);
  if (role) { scene.add.text(L + P.pad, y, role, style(fs.small, theme.currencySoft)).setOrigin(0, 0.5); y += P.lineGap; }
  if (!owned.length) scene.add.text(W / 2, y + 10, t('pause.noAug'), style(fs.small, theme.textDim)).setOrigin(0.5);
  const groups = new Map();
  for (const a of owned) {
    const key = a.def.tier === 'duo' ? 'duo' : a.def.element;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t(`aug.${a.def.id}.name`) + (a.grade ? ` (${t(`grade.${a.grade}`)})` : ''));
  }
  const bottom = P.card2Top + P.card2H - P.pad;
  for (const [el, names] of groups) {
    if (y > bottom) break;
    const tag = scene.add.text(L + P.pad, y - 8, el === 'duo' ? t('pause.duo') : t(`element.${el}`),
      style(fs.small + 1, `#${(el === 'duo' ? 0xe8e8f4 : mgr.color(el)).toString(16).padStart(6, '0')}`, true)).setOrigin(0, 0).setAlpha(0.9);
    const body = scene.add.text(L + P.pad + P.tagW, y - 8, names.join('  ·  '), {
      ...style(fs.small, theme.textSoft), wordWrap: { width: P.cardW - P.pad * 2 - P.tagW, useAdvancedWrap: true }, lineSpacing: 3,
    }).setOrigin(0, 0);
    y += Math.max(tag.height, body.height) + 6;
  }
}

function card(scene, x, y, w, h, P) {
  const g = scene.add.graphics();
  g.fillStyle(hex(theme.cardBackground), P.cardAlpha);
  g.fillRoundedRect(x, y, w, h, P.radius);
  g.lineStyle(1.5, hex(theme.hudText), P.cardStroke);
  g.strokeRoundedRect(x, y, w, h, P.radius);
  return g;
}
