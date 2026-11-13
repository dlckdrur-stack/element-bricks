import Phaser from 'phaser';
import { hex } from '../core/color.js';

const ms = (s) => s * 1000;

/** "LEVEL UP" 글자가 크게 튀어나왔다가 위로 사라짐. ov = UiOverlay, c = ui.levelUp.text */
export function levelUpText(scene, ov, c, text, fontFamily) {
  const W = scene.scale.width;
  const txt = ov.add(scene.add.text(W / 2, c.y, text, {
    fontFamily, fontSize: `${c.fontSize}px`, fontStyle: 'bold', color: c.color,
    stroke: c.stroke, strokeThickness: c.strokeWidth,
  }).setOrigin(0.5).setDepth(72).setScale(c.popFrom));
  scene.tweens.chain({
    targets: txt,
    tweens: [
      { scale: c.popTo, duration: ms(c.popTime), ease: 'Back.easeOut' },
      { scale: 1, duration: ms(c.settleTime), ease: 'Quad.easeOut' },
      { y: c.y - c.rise, alpha: 0, delay: ms(c.hold), duration: ms(c.fadeTime), ease: 'Quad.easeIn' },
    ],
  });
  return txt;
}

/**
 * 각성 컷인: 화면을 가로지르는 띠 + 속성 이름이 미끄러져 들어왔다 나감 (메인 카메라, 블룸 받음).
 * c = ui.awaken.cutin. onDone 은 time 초 뒤.
 */
export function awakenCutin(scene, c, { title, sub, color, fontFamily }, onDone) {
  const W = scene.scale.width;
  const D = c.depth;
  const objs = [];
  const add = (o) => { objs.push(o); return o.setDepth(D); };
  const band = add(scene.add.rectangle(W / 2, c.y, W, c.bandH, hex(c.bandColor), c.bandAlpha).setScale(1, 0));
  const top = add(scene.add.rectangle(W / 2, c.y - c.bandH / 2, W, c.lineH, color).setBlendMode(Phaser.BlendModes.ADD).setScale(0, 1));
  const bot = add(scene.add.rectangle(W / 2, c.y + c.bandH / 2, W, c.lineH, color).setBlendMode(Phaser.BlendModes.ADD).setScale(0, 1));
  const name = add(scene.add.text(-W, c.y - 10, title, {
    fontFamily, fontSize: `${c.fontSize}px`, fontStyle: 'bold',
    color: `#${color.toString(16).padStart(6, '0')}`, stroke: c.nameStroke, strokeThickness: c.nameStrokeWidth,
  }).setOrigin(0.5));
  const subT = add(scene.add.text(W * 2, c.y + c.fontSize / 2 + 4, sub, {
    fontFamily, fontSize: `${c.subSize}px`, color: c.subColor,
  }).setOrigin(0.5));

  const slide = ms(c.slideTime);
  scene.tweens.add({ targets: band, scaleY: 1, duration: slide, ease: 'Quad.easeOut' });
  scene.tweens.add({ targets: [top, bot], scaleX: 1, duration: slide * 1.5, ease: 'Quad.easeOut' });
  scene.tweens.add({ targets: name, x: W / 2, duration: slide, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: subT, x: W / 2, duration: slide, delay: slide * 0.5, ease: 'Back.easeOut' });

  scene.time.delayedCall(ms(c.time) - slide, () => {
    scene.tweens.add({ targets: name, x: W * 2, duration: slide, ease: 'Quad.easeIn' });
    scene.tweens.add({ targets: subT, x: -W, duration: slide, ease: 'Quad.easeIn' });
    scene.tweens.add({ targets: [band, top, bot], alpha: 0, duration: slide });
  });
  scene.time.delayedCall(ms(c.time), () => {
    for (const o of objs) o.destroy();
    onDone?.();
  });
}
