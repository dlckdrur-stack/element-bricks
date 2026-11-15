import { t } from './i18n.js';
import { hex } from '../core/color.js';
import { UiOverlay } from './UiOverlay.js';
import { makePickCard } from './PickCard.js';
import { levelUpText, awakenCutin } from './Cutin.js';
import { makeButton } from './widgets.js';

const ms = (s) => s * 1000;

/**
 * 증강 선택 화면 + 연출 (수치는 data/fx/ui.json).
 *  등장: 화면 어두워짐·배경 흐림 → "LEVEL UP" → 카드 3장이 아래에서 차례로 날아와 뒤집힘 (프리즘이면 번쩍 + 별)
 *  선택: 고른 카드가 가운데로 커지며 빛 폭발, 나머지는 흩어짐 → 카드가 공으로 빨려 들어가고 공 불꽃이 타오름
 *  레벨 1 메인 속성: 이어서 "각성" (하얀 번쩍 → 공에 속성 불꽃 폭발 → 속성 이름 컷인 1초)
 *
 * deps = { layout, theme, draftCfg, mgr, fx, fxCfg, look(BallLook), ballPos() → {x,y} }
 * cb   = { onPick(def): 증강 적용, onDone(): 연출이 끝나 게임 재개, onReroll(): 리롤로 닫힘 }
 */
export function showAugmentPick(scene, deps, choice, level, cb) {
  const { layout, theme, draftCfg, mgr, fx, fxCfg } = deps;
  const U = fxCfg.ui;
  const C = U.cards;
  const S = C.select;
  const LV = U.levelUp;
  const L = layout.pick;
  const W = layout.width;
  const f = theme.fontFamily;
  const ov = new UiOverlay(scene, { cfg: LV, fxCfg, quality: fx.quality, size: fx.size });

  const dim = ov.add(scene.add.rectangle(W / 2, layout.height / 2, W, layout.height, hex(theme.overlay))
    .setAlpha(0).setDepth(60).setInteractive());
  scene.tweens.add({ targets: dim, alpha: LV.dimAlpha, duration: ms(LV.dimTime) });

  if (choice.kind !== 'main') {
    levelUpText(scene, ov, LV.text, t('fx.levelUp'), f);
    fx.juice.sound('levelUp');
  }

  // 제목·설명
  const gradeName = choice.grade ? t(`grade.${choice.grade}`) : '';
  const gradeColor = choice.grade ? draftCfg.grades[choice.grade].color : theme.text;
  const title = choice.kind === 'graded' ? t('pick.title.graded', { n: level }) : t(`pick.title.${choice.kind}`);
  const sub = choice.kind === 'graded' ? t('pick.sub.graded', { grade: gradeName }) : t(`pick.sub.${choice.kind}`);
  const heads = [
    ov.add(scene.add.text(W / 2, L.titleY, title, {
      fontFamily: f, fontSize: `${layout.fontSize.title * 0.75}px`, fontStyle: 'bold', color: gradeColor,
    }).setOrigin(0.5).setDepth(61)),
    ov.add(scene.add.text(W / 2, L.subY, sub, { fontFamily: f, fontSize: `${layout.fontSize.cardDesc}px`, color: theme.hudText })
      .setOrigin(0.5).setDepth(61)),
  ];
  for (const h of heads) h.setAlpha(0);
  scene.tweens.add({ targets: heads, alpha: 1, delay: ms(LV.titleDelay), duration: ms(LV.titleFadeTime) });

  // 카드: 아래에서 차례로 날아와 뒤집힘
  let ready = false;
  let flipped = 0;
  let absorbing = null;
  const fit = fitCards(L, choice.options.length); // 선택지 추가(4~5장)면 카드를 낮게
  const lay = { ...layout, pick: { ...L, cardH: fit.h } };
  const cards = choice.options.map((def, i) => {
    const homeY = fit.top + i * (fit.h + fit.gap) + fit.h / 2;
    const card = makePickCard({
      scene, ov, def, choice, mgr, layout: lay, theme, draftCfg, cfg: C, x: W / 2, y: homeY + C.flyFrom, pioneer: deps.pioneer,
    });
    card.homeY = homeY;
    card.index = i;
    card.root.setDepth(65);
    return card;
  });
  ov.tickers.push((dt) => {
    for (const c of cards) c.tick(dt);
    if (absorbing) ov.p.emit(S.trail, absorbing.root.x, absorbing.root.y, absorbing.borderColor);
  });

  function allFlipped() {
    if (choice.grade === 'prism') {
      const P = C.prism;
      fx.juice.flash(P.appearFlash, ov.cam);
      fx.juice.shake(P.appearShake, ov.cam);
      fx.juice.sound(P.sound);
      for (const c of cards) ov.p.emit(P.appearStars, c.root.x, c.root.y, c.borderColor);
    }
    scene.time.delayedCall(draftCfg.cardInputDelayMs, () => {
      ready = true;
      if (deps.rerolls > 0) showReroll();
    });
  }

  // 리롤(영구 강화): 카드를 흩어 버리고 같은 레벨 선택을 새로 뽑는다
  function showReroll() {
    const btn = ov.add(makeButton(scene, W / 2, L.rerollY, t('pick.reroll', { n: deps.rerolls }), {
      w: L.rerollW, h: L.rerollH, size: layout.fontSize.cardDesc, color: theme.hudText, depth: 66,
      onClick: () => {
        if (!ready) return;
        ready = false;
        btn.setEnabled(false);
        for (const c of cards) c.root.disableInteractive();
        scene.tweens.add({ targets: [...heads, ...cards.map((c) => c.root), btn], alpha: 0, duration: ms(S.scatterTime) });
        scene.time.delayedCall(ms(S.scatterTime), () => { ov.close(); cb.onReroll(); });
      },
    }).setAlpha(0));
    scene.tweens.add({ targets: btn, alpha: 1, duration: ms(LV.titleFadeTime) });
  }

  cards.forEach((card, i) => {
    scene.tweens.add({
      targets: card.root, y: card.homeY, delay: ms(C.startDelay + i * C.stagger), duration: ms(C.flyTime), ease: 'Back.easeOut',
      onComplete: () => scene.time.delayedCall(ms(C.flipDelay), () => {
        fx.juice.sound('cardFlip');
        card.flip(() => { if (++flipped === cards.length) allFlipped(); });
      }),
    });
    const r = card.root;
    r.setInteractive({ useHandCursor: true });
    r.on('pointerover', (p) => ready && card.press(p.x));
    r.on('pointerdown', (p) => ready && card.press(p.x));
    r.on('pointerout', () => ready && card.release());
    r.on('pointerup', () => pick(card));
  });

  function pick(card) {
    if (!ready) return;
    ready = false;
    fx.juice.sound(S.sound);
    for (const c of cards) c.root.disableInteractive();
    scene.tweens.add({ targets: heads, alpha: 0, duration: ms(S.scatterTime) });
    for (const o of cards) {
      if (o === card) continue;
      const dir = o.index < card.index ? -1 : 1;
      scene.tweens.add({
        targets: o.root, x: o.root.x + dir * S.scatterDist, y: o.root.y + dir * S.scatterDist * 0.25,
        angle: dir * S.scatterAngle, alpha: 0, scale: 0.8, duration: ms(S.scatterTime), ease: 'Quad.easeIn',
      });
    }
    scene.tweens.add({
      targets: card.root, x: W / 2, y: S.centerY, scale: S.scale, angle: 0, duration: ms(S.centerTime), ease: 'Back.easeOut',
      onComplete: () => {
        burst(card);
        scene.time.delayedCall(ms(S.hold), () => absorb(card));
      },
    });
  }

  function burst(card) {
    const { x, y } = card.root;
    ov.sprites.play(S.burstRing, x, y, card.borderColor);
    ov.sprites.play(S.burstGlow, x, y, card.borderColor);
    ov.p.emit(S.stars, x, y, card.borderColor);
    ov.p.emit(S.stars, x, y, 0xffffff, { mul: 0.5 });
  }

  function absorb(card) {
    const target = deps.ballPos();
    absorbing = card;
    scene.tweens.add({ targets: dim, alpha: LV.dimAlpha * 0.4, duration: ms(S.absorbTime) });
    scene.tweens.add({
      targets: card.root, x: target.x, y: target.y, scale: S.absorbScale, alpha: 0.4, angle: 25,
      duration: ms(S.absorbTime), ease: 'Cubic.easeIn',
      onComplete: () => finish(card),
    });
  }

  function finish(card) {
    absorbing = null;
    ov.close();
    cb.onPick(card.def);
    const pos = deps.ballPos();
    fx.sprites.play(S.arriveRing, pos.x, pos.y, card.color);
    fx.p.emit(S.arriveFlame, pos.x, pos.y, card.color);
    deps.look.flareUp('pick');
    if (choice.kind === 'main') awaken(card, pos);
    else cb.onDone();
  }

  function awaken(card, pos) {
    const A = U.awaken;
    const el = card.def.element;
    fx.juice.flash(A.flash);
    fx.juice.hitstop(A.hitstop);
    fx.juice.shake(A.shake);
    fx.juice.sound(A.sound);
    for (const name of A.burst) fx.p.emit(name, pos.x, pos.y, card.color);
    fx.sprites.play(A.ring, pos.x, pos.y, card.color);
    fx.sprites.play(A.ring2, pos.x, pos.y, card.color);
    deps.look.flareUp('awaken');
    const name = t(`element.${el}`);
    awakenCutin(scene, A.cutin, {
      title: t('fx.awaken', { name }), sub: t('fx.awakenSub', { name }), color: card.color, fontFamily: f,
    }, cb.onDone);
  }
}

/** 카드 n장이 화면에 들어가도록 위치·높이 계산 (3장 이하는 기본 배치) */
function fitCards(L, n) {
  if (n <= 3) return { top: L.cardTop, h: L.cardH, gap: L.cardGap };
  const h = Math.min(L.cardH, (L.fitBottom - L.fitTop - L.fitGap * (n - 1)) / n);
  return { top: L.fitTop, h, gap: L.fitGap };
}
