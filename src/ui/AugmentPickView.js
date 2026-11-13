import { t } from './i18n.js';
import { hex } from '../core/color.js';

/** 표시용 수치: 키가 Pct 로 끝나면 % 숫자로 */
function displayValues(v) {
  const out = {};
  for (const k in v) {
    const x = v[k];
    out[k] = k.endsWith('Pct') ? Math.round(x * 100) : Math.round(x * 10) / 10;
  }
  return out;
}

/**
 * 증강 선택 오버레이. 카드 3장(세로 배치) 중 1장을 누르면 onPick(def).
 * choice = buildChoices() 결과, level = 현재 레벨
 */
export function showAugmentPick(scene, deps, choice, level, onPick) {
  const { layout, theme, draftCfg, mgr } = deps;
  const L = layout.pick;
  const fs = layout.fontSize;
  const f = theme.fontFamily;
  const W = layout.width;
  const D = 60;
  const objs = [];
  const add = (o) => { objs.push(o); return o.setDepth(D); };

  add(scene.add.rectangle(W / 2, layout.height / 2, W, layout.height, hex(theme.overlay), 0.86).setInteractive());

  const gradeName = choice.grade ? t(`grade.${choice.grade}`) : '';
  const gradeColor = choice.grade ? draftCfg.grades[choice.grade].color : theme.text;
  const title = choice.kind === 'graded' ? t('pick.title.graded', { n: level }) : t(`pick.title.${choice.kind}`);
  const sub = choice.kind === 'graded' ? t('pick.sub.graded', { grade: gradeName }) : t(`pick.sub.${choice.kind}`);
  add(scene.add.text(W / 2, L.titleY, title, {
    fontFamily: f, fontSize: `${fs.title * 0.75}px`, fontStyle: 'bold', color: gradeColor,
  }).setOrigin(0.5));
  add(scene.add.text(W / 2, L.subY, sub, { fontFamily: f, fontSize: `${fs.cardDesc}px`, color: theme.hudText })
    .setOrigin(0.5));

  let ready = false;
  scene.time.delayedCall(draftCfg.cardInputDelayMs, () => { ready = true; });

  choice.options.forEach((def, i) => {
    const y = L.cardTop + i * (L.cardH + L.cardGap) + L.cardH / 2;
    const elColor = mgr.color(def.element);
    // 이 카드를 고르면 메인/서브가 되는지 → 보너스 반영 수치로 미리 보여줌
    const status = choice.kind === 'main' ? 'main' : choice.kind === 'sub' ? 'sub' : mgr.elementStatus(def.element);
    const v = displayValues(mgr.valuesFor(def, choice.grade, status !== null));

    const card = add(scene.add.rectangle(W / 2, y, L.cardW, L.cardH, hex(theme.cardBackground))
      .setStrokeStyle(3, choice.grade ? hex(gradeColor) : elColor));
    add(scene.add.rectangle(W / 2 - L.cardW / 2 + 5, y, 6, L.cardH - 16, elColor));

    const left = W / 2 - L.cardW / 2 + 22;
    const top = y - L.cardH / 2 + 14;
    const tags = [t(`element.${def.element}`), t(`tier.${def.tier}`)];
    if (def.requires) tags.push(t('pick.requires', { name: t(`aug.${def.requires}.name`) }));
    if (gradeName) tags.push(gradeName);
    add(scene.add.text(left, top, tags.join(' · '), {
      fontFamily: f, fontSize: `${fs.cardTag}px`, color: '#' + elColor.toString(16).padStart(6, '0'),
    }));
    if (status) {
      add(scene.add.text(W / 2 + L.cardW / 2 - 14, top, t(`pick.tag.${status}`, { n: Math.round(draftCfg.elementBonus * 100) }), {
        fontFamily: f, fontSize: `${fs.cardTag}px`, color: theme.orb,
      }).setOrigin(1, 0));
    }
    add(scene.add.text(left, top + 26, t(`aug.${def.id}.name`), {
      fontFamily: f, fontSize: `${fs.cardName}px`, fontStyle: 'bold', color: theme.text,
    }));
    add(scene.add.text(left, top + 68, t(`aug.${def.id}.desc`, v), {
      fontFamily: f, fontSize: `${fs.cardDesc}px`, color: theme.hudText,
      wordWrap: { width: L.cardW - 44, useAdvancedWrap: true }, lineSpacing: 4,
    }));

    card.setInteractive({ useHandCursor: true });
    card.on('pointerup', () => {
      if (!ready) return;
      ready = false;
      for (const o of objs) o.destroy();
      onPick(def);
    });
  });
}
