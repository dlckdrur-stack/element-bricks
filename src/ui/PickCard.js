import Phaser from 'phaser';
import { t } from './i18n.js';
import { hex } from '../core/color.js';

const ADD = Phaser.BlendModes.ADD;
const hsl = (h, s, l) => Phaser.Display.Color.HSLToColor(h, s, l).color;

/** 표시용 수치: 키가 Pct 로 끝나면 % 숫자로 */
function displayValues(v) {
  const out = {};
  for (const k in v) {
    const x = v[k];
    out[k] = k.endsWith('Pct') ? Math.round(x * 100) : Math.round(x * 10) / 10;
  }
  return out;
}

/** 글씨 높이가 maxH 를 넘으면 글자 크기를 1px씩 줄임 (min 까지) */
function fitText(txt, maxH, size, min) {
  let sz = size;
  while (txt.height > maxH && sz > min) {
    sz -= 1;
    txt.setFontSize(sz);
  }
}

/** 둥근 사각형 둘레 위의 점 (u: 0~1, 위쪽 왼편부터 시계방향) — 테두리 연출용 근사 */
function perim(u, w, h) {
  let d = (((u % 1) + 1) % 1) * 2 * (w + h);
  if (d < w) return [d - w / 2, -h / 2];
  d -= w;
  if (d < h) return [w / 2, d - h / 2];
  d -= h;
  if (d < w) return [w / 2 - d, h / 2];
  d -= w;
  return [-w / 2, h / 2 - d];
}

/**
 * 증강 카드 1장 (컨테이너). 뒷면으로 시작해 flip() 으로 앞면.
 * 테두리는 등급색으로 빛남: 실버=흰빛, 골드=금빛 반짝임이 둘레를 돎, 프리즘=무지개가 계속 흐름.
 * o = { scene, ov(UiOverlay), def, choice, mgr, layout, theme, draftCfg, cfg(ui.cards), x, y, pioneer?(id)→비율 }
 */
export function makePickCard(o) {
  const { scene, ov, def, choice, mgr, layout, theme, draftCfg, cfg } = o;
  const L = layout.pick;
  const fs = layout.fontSize;
  const f = theme.fontFamily;
  const W = L.cardW;
  const H = L.cardH;
  const grade = choice.grade ?? 'none';
  const elColor = mgr.color(def.element);
  const gradeColor = choice.grade ? hex(draftCfg.grades[choice.grade].color) : elColor;
  const borderColor = grade === 'silver' ? hex(cfg.silver.color) : gradeColor;

  const glow = scene.add.image(0, 0, 'fx', 'glow').setBlendMode(ADD).setTint(borderColor)
    .setDisplaySize((W + cfg.glowPad * 2) * 1.3, (H + cfg.glowPad * 2) * 1.6);

  // 뒷면
  const backRect = scene.add.rectangle(0, 0, W, H, hex(cfg.backColor)).setStrokeStyle(2, borderColor, 0.6);
  const backMark = scene.add.image(0, 0, 'fx', 'star').setTint(borderColor).setBlendMode(ADD)
    .setDisplaySize(cfg.backMarkSize * 2, cfg.backMarkSize * 2);
  const back = scene.add.container(0, 0, [backRect, backMark]);

  // 앞면 (이전 카드 내용과 같음)
  const subFocus = choice.kind === 'sub' && def.element === mgr.main; // 서브 자리에 메인 속성 = 집중
  const status = choice.kind === 'main' || subFocus ? 'main' : choice.kind === 'sub' ? 'sub' : mgr.elementStatus(def.element);
  const v = displayValues(mgr.valuesFor(def, choice.grade, status !== null));
  // 카드가 낮아지면(선택지 4~5장) 글씨도 같은 비율로 작게. 설명이 넘치면 들어갈 때까지 더 줄임
  const k = Math.max(cfg.text.minScale, Math.min(1, H / cfg.text.baseH));
  const px = (n) => `${Math.round(n * k)}px`;
  const left = -W / 2 + 22;
  const top = -H / 2 + 12 * k;
  const tags = [t(`element.${def.element}`), t(`tier.${def.tier}`)];
  if (def.requires) tags.push(t('pick.requires', { name: t(`aug.${def.requires}.name`) }));
  if (choice.grade) tags.push(t(`grade.${choice.grade}`));
  const parts = [
    scene.add.rectangle(0, 0, W, H, hex(theme.cardBackground)),
    scene.add.rectangle(-W / 2 + 5, 0, 6, H - 16, elColor),
    scene.add.text(left, top, tags.join(' · '), {
      fontFamily: f, fontSize: px(fs.cardTag), color: `#${elColor.toString(16).padStart(6, '0')}`,
    }),
    scene.add.text(left, top + 24 * k, t(`aug.${def.id}.name`), {
      fontFamily: f, fontSize: px(fs.cardName), fontStyle: 'bold', color: theme.text,
    }),
  ];
  const desc = scene.add.text(left, top + 62 * k, t(`aug.${def.id}.desc`, v), {
    fontFamily: f, fontSize: px(fs.cardDesc), color: theme.hudText,
    wordWrap: { width: W - 44, useAdvancedWrap: true }, lineSpacing: 3,
  });
  fitText(desc, H / 2 - cfg.text.padBottom - desc.y, Math.round(fs.cardDesc * k), cfg.text.minDesc);
  parts.push(desc);
  if (status) {
    parts.push(scene.add.text(W / 2 - 14, top, t(`pick.tag.${status}`, { n: Math.round(draftCfg.elementBonus * 100) }), {
      fontFamily: f, fontSize: px(fs.cardTag), color: theme.orb,
    }).setOrigin(1, 0));
  }
  if (o.pioneer) { // 개척 보너스 (레벨 1 카드): 그 판 재화 +N%
    const pct = Math.round(o.pioneer(def.id) * 100);
    parts.push(scene.add.text(W / 2 - 14, top + 28 * k, t('pick.pioneer', { n: pct }), {
      fontFamily: f, fontSize: px(fs.cardDesc + 2), fontStyle: 'bold', color: theme.currency,
    }).setOrigin(1, 0));
  }
  const front = scene.add.container(0, 0, parts).setVisible(false);
  const border = scene.add.graphics();
  const root = scene.add.container(o.x, o.y, [glow, back, front, border]).setSize(W, H);
  ov.add(root);

  let time = Math.random() * 3;
  let sparkleT = 0;
  const card = { root, def, grade, color: elColor, borderColor, flipped: false, hover: false };

  function drawBorder() {
    const g = border;
    const bw = cfg.borderWidth;
    g.clear();
    if (grade === 'prism') {
      const p = cfg.prism;
      for (let i = 0; i < p.segments; i++) {
        const u0 = i / p.segments;
        const [x0, y0] = perim(u0, W, H);
        const [x1, y1] = perim(u0 + 1 / p.segments, W, H);
        g.lineStyle(bw, hsl((u0 + time * p.hueSpeed) % 1, p.saturation, p.lightness), 1);
        g.lineBetween(x0, y0, x1, y1);
      }
      return;
    }
    g.lineStyle(bw, borderColor, 1).strokeRoundedRect(-W / 2, -H / 2, W, H, cfg.radius);
    if (grade === 'silver') {
      g.lineStyle(1.5, 0xffffff, cfg.silver.innerAlpha).strokeRoundedRect(-W / 2 + 5, -H / 2 + 5, W - 10, H - 10, cfg.radius - 4);
    }
    if (grade === 'gold') {
      const gd = cfg.gold;
      for (const off of [0, 0.5]) {
        const u = time * gd.glintSpeed + off;
        const n = 8;
        for (let k = 0; k < n; k++) {
          const [x0, y0] = perim(u - gd.glintLen * (k / n), W, H);
          const [x1, y1] = perim(u - gd.glintLen * ((k + 1) / n), W, H);
          g.lineStyle(gd.glintWidth * (1 - k / n), hex(gd.glintColor), 1 - k / n);
          g.lineBetween(x0, y0, x1, y1);
        }
      }
    }
  }

  card.tick = (dt) => {
    time += dt;
    drawBorder();
    const gp = cfg.glowPulse;
    const base = cfg.glowAlpha[grade] ?? cfg.glowAlpha.none;
    glow.setAlpha(base * (1 + gp.amount * Math.sin(time * gp.speed * Math.PI * 2)));
    if (grade === 'prism') glow.setTint(hsl((time * cfg.prism.hueSpeed) % 1, 1, 0.6));
    const every = grade === 'prism' ? cfg.prism.sparkleEvery : grade === 'gold' ? cfg.gold.sparkleEvery : 0;
    if (every && card.flipped && root.visible) {
      sparkleT += dt;
      if (sparkleT >= every) {
        sparkleT = 0;
        const [px, py] = perim(Math.random(), W, H);
        const c = grade === 'prism' ? hsl(Math.random(), 1, 0.7) : borderColor;
        ov.p.emit('cardSparkle', root.x + px * root.scaleX, root.y + py * root.scaleY, c);
      }
    }
  };

  /** 뒤집기: 가로로 접혔다가 앞면으로 펼침 */
  card.flip = (onDone) => {
    scene.tweens.add({
      targets: root, scaleX: 0, duration: cfg.flipTime * 1000, ease: 'Quad.easeIn',
      onComplete: () => {
        back.setVisible(false);
        front.setVisible(true);
        scene.tweens.add({
          targets: root, scaleX: 1, duration: cfg.flipTime * 1000, ease: 'Back.easeOut',
          onComplete: () => { card.flipped = true; onDone?.(); },
        });
      },
    });
  };

  /** 손가락을 대면 살짝 커지고 기울어짐 */
  card.press = (px) => {
    if (!card.flipped) return;
    const k = Phaser.Math.Clamp((px - root.x) / (W / 2), -1, 1);
    scene.tweens.add({ targets: root, scale: cfg.hoverScale, angle: cfg.tilt * k, duration: cfg.hoverTime * 1000 });
  };
  card.release = () => {
    if (!card.flipped) return;
    scene.tweens.add({ targets: root, scale: 1, angle: 0, duration: cfg.hoverTime * 1000 });
  };
  return card;
}
