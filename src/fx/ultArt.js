import Phaser from 'phaser';
import cfg from '../data/fx/ultArt.json';
import { hex } from '../core/color.js';

const ADD = Phaser.BlendModes.ADD;
const D = cfg.depth;
const rnd = (a, b) => a + Math.random() * (b - a);

/**
 * 각성 필살기의 "그림" 연출 (컷인·입자 위에 덧그림). 수치는 data/fx/ultArt.json
 *   eclipse 개기일식(달이 해를 가리고 코로나) · judgment 뇌운에서 번개 · worldTree 세계수가 자람
 *   purgatory 거대 메테오 낙하 · greatQuake 화면 균열 · absoluteZero 화면이 얼었다가 산산조각
 */
export function playUltArt(fx, name) {
  const c = cfg[name];
  if (c && ART[name]) ART[name](fx, fx.scene, c);
}

const img = (s, frame, x, y, size, color, alpha = 1, blend = ADD) => s.add.image(x, y, 'fx', frame)
  .setTint(hex(color)).setDisplaySize(size, size).setAlpha(alpha).setBlendMode(blend).setDepth(D);

/** 잠시 보여준 뒤 사라지고 정리 */
function fadeOut(s, objs, delay, dur) {
  s.tweens.add({ targets: objs, alpha: 0, delay: delay * 1000, duration: dur * 1000, onComplete: () => objs.forEach((o) => o.destroy()) });
}

const ART = {
  eclipse(fx, s, c) {
    const x = s.scale.width / 2;
    const y = c.y;
    const rays = s.add.container(x, y).setDepth(D).setAlpha(0);
    for (let i = 0; i < c.rays; i++) {
      const ray = s.add.image(0, 0, 'fx', 'streak').setTint(hex(i % 2 ? c.corona : c.coronaOuter)).setBlendMode(ADD)
        .setDisplaySize(c.rayLen * rnd(0.7, 1.1), 22).setRotation((i / c.rays) * Math.PI * 2);
      rays.add(ray);
    }
    const outer = img(s, 'glow', x, y, c.r * 6, c.coronaOuter, 0);
    const inner = img(s, 'glow', x, y, c.r * 3.6, c.corona, 0);
    const ring = img(s, 'ring', x, y, c.r * 2.5, '#ffffff', 0);
    const sun = img(s, 'disc', x, y, c.r * 2, c.sun, 1, Phaser.BlendModes.NORMAL).setDepth(D + 1);
    const moon = s.add.circle(x + c.r * 2.6, y, c.r * 1.02, hex(c.moon)).setDepth(D + 2);
    const diamond = img(s, 'star', x - c.r * 0.72, y - c.r * 0.72, 90, '#ffffff', 0).setDepth(D + 3);
    s.tweens.add({
      targets: moon, x, duration: c.cover * 1000, ease: 'Sine.easeOut',
      onComplete: () => { // 개기일식: 코로나가 번지고 다이아몬드 링이 반짝
        s.tweens.add({ targets: [outer, inner, ring, rays], alpha: 1, duration: 220 });
        s.tweens.add({ targets: diamond, alpha: { from: 1, to: 0 }, scale: { from: 1.6, to: 0.4 }, duration: 500 });
        s.tweens.add({ targets: rays, angle: c.spinDeg, duration: (c.hold + c.fade) * 1000 });
      },
    });
    fadeOut(s, [outer, inner, ring, rays, sun, moon, diamond], c.cover + c.hold, c.fade);
  },

  judgment(fx, s, c) {
    const W = s.scale.width;
    const H = s.scale.height;
    const cloud = s.add.container(0, 0).setDepth(D + 1).setAlpha(0);
    const g = s.add.graphics();
    const puffs = [];
    for (let i = 0; i < c.puffs; i++) puffs.push([rnd(-30, W + 30), rnd(c.top, c.bottom), rnd(c.rMin, c.rMax)]);
    g.fillStyle(hex(c.cloud), 1);
    for (const [x, y, r] of puffs) g.fillCircle(x, y, r);
    g.fillStyle(hex(c.cloudLight), 0.55);
    for (const [x, y, r] of puffs) g.fillCircle(x - r * 0.15, y - r * 0.25, r * 0.6);
    cloud.add(g);
    const flashes = [];
    for (let i = 0; i < c.flashes; i++) {
      const f = s.add.image(rnd(40, W - 40), rnd(c.top + 20, c.bottom), 'fx', 'glow').setTint(hex(c.flash)).setBlendMode(ADD)
        .setDisplaySize(rnd(140, 220), rnd(80, 120)).setAlpha(0);
      cloud.add(f);
      flashes.push(f);
    }
    s.tweens.add({ targets: cloud, alpha: 1, duration: c.fadeIn * 1000 });
    const bolt = fx.cfg.ult.judgment.bolt;
    fx.timed(c.boltTime, c.boltEvery, () => { // 구름 속이 번쩍이며 아래로 낙뢰
      const f = flashes[Math.floor(Math.random() * flashes.length)];
      f.setAlpha(1);
      s.tweens.add({ targets: f, alpha: 0, duration: 160 });
      if (Math.random() < 0.6) fx.lines.bolt(f.x, c.bottom, f.x + rnd(-80, 80), rnd(H * 0.45, H * 0.85), hex(c.boltColor), bolt);
    });
    fadeOut(s, [cloud], c.fadeIn + c.hold, c.fade);
  },

  worldTree(fx, s, c) {
    const W = s.scale.width;
    const by = s.scale.height - c.floorOffset;
    const tree = s.add.container(W / 2, by).setDepth(D).setScale(1, 0);
    const g = s.add.graphics();
    g.fillStyle(hex(c.trunk), 1); // 줄기: 아래가 넓고 위로 갈수록 가늘게
    g.fillPoints([{ x: -c.baseW / 2, y: 0 }, { x: c.baseW / 2, y: 0 }, { x: c.topW / 2, y: -c.height }, { x: -c.topW / 2, y: -c.height }], true);
    g.fillStyle(hex(c.trunkLight), 0.6);
    g.fillPoints([{ x: -c.baseW / 6, y: 0 }, { x: c.baseW / 10, y: 0 }, { x: 2, y: -c.height }, { x: -4, y: -c.height }], true);
    g.lineStyle(10, hex(c.trunk), 1); // 가지와 뿌리
    for (let i = 0; i < c.branches; i++) {
      const y0 = -c.height * rnd(0.45, 0.95);
      const side = i % 2 ? 1 : -1;
      g.beginPath(); g.moveTo(0, y0); g.lineTo(side * rnd(70, 170), y0 - rnd(60, 130)); g.strokePath();
    }
    for (const side of [-1, 1]) { g.beginPath(); g.moveTo(side * c.baseW * 0.3, -10); g.lineTo(side * c.baseW * 1.4, 12); g.strokePath(); }
    tree.add(g);
    for (let i = 0; i < c.blobs; i++) { // 잎 덩어리 (진한 초록 + 밝은 빛)
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random());
      const x = Math.cos(a) * c.canopyRx * d;
      const y = -c.height + Math.sin(a) * c.canopyRy * d;
      tree.add(s.add.image(x, y, 'fx', 'glow').setTint(hex(i % 3 ? c.leaf : c.leaf2)).setDisplaySize(rnd(110, 170), rnd(90, 140)).setAlpha(0.95));
    }
    for (let i = 0; i < 8; i++) {
      tree.add(s.add.image(rnd(-c.canopyRx, c.canopyRx) * 0.7, -c.height + rnd(-c.canopyRy, c.canopyRy) * 0.6, 'fx', 'glow')
        .setTint(hex(c.glow)).setBlendMode(ADD).setDisplaySize(80, 80).setAlpha(0.6));
    }
    s.tweens.add({ targets: tree, scaleY: 1, duration: c.grow * 1000, ease: 'Back.easeOut' });
    fx.timed(c.grow + c.hold, 0.08, () => fx.p.emit('leafBurst', W / 2 + rnd(-c.canopyRx, c.canopyRx), by - c.height + rnd(-80, 80), hex(c.leaf)));
    fadeOut(s, [tree], c.grow + c.hold, c.fade);
  },

  purgatory(fx, s, c) {
    const W = s.scale.width;
    const x1 = W / 2;
    const y1 = c.targetY;
    const x0 = W + 160;
    const y0 = -220;
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const m = s.add.container(x0, y0).setDepth(D + 1).setRotation(ang);
    for (let i = 0; i < c.tail; i++) { // 꼬리 불길 (진행 반대쪽으로 길게)
      const f = s.add.image(-c.tailH / 2 + 20, rnd(-20, 20), 'fx', 'flame').setTint(hex(i % 2 ? c.rim : c.hot))
        .setDisplaySize(c.tailW * rnd(0.6, 1), c.tailH * rnd(0.7, 1)).setRotation(-Math.PI / 2).setAlpha(0.9);
      if (i % 2 === 0) f.setBlendMode(ADD);
      m.add(f);
    }
    m.add(s.add.image(0, 0, 'fx', 'glow').setTint(hex(c.rim)).setBlendMode(ADD).setDisplaySize(c.rock * 2.4, c.rock * 2.4));
    m.add(s.add.image(0, 0, 'fx', 'rock').setTint(hex(c.rockColor)).setDisplaySize(c.rock, c.rock));
    m.add(s.add.image(0, 0, 'fx', 'glow').setTint(hex(c.hot)).setBlendMode(ADD).setDisplaySize(c.rock * 0.9, c.rock * 0.9).setAlpha(0.7));
    let n = 0;
    s.tweens.add({
      targets: m, x: x1, y: y1, duration: c.fall * 1000, ease: 'Quad.easeIn',
      onUpdate: () => { if (n++ % 2 === 0) { fx.p.emit(c.trail, m.x, m.y, hex(c.rim)); fx.p.emit(c.smoke, m.x, m.y, hex(c.rim)); } },
      onComplete: () => { // 착탄: 거대한 폭발
        m.destroy();
        fx.explosion(x1, y1, hex(c.rim), 1);
        fx.juice.flash('white');
        fx.juice.shake('big');
        const boom = img(s, 'glow', x1, y1, 120, c.hot);
        s.tweens.add({ targets: boom, displayWidth: 900, displayHeight: 900, alpha: 0, duration: 600, onComplete: () => boom.destroy() });
      },
    });
  },

  greatQuake(fx, s, c) {
    const W = s.scale.width;
    const H = s.scale.height;
    const ox = W / 2;
    const oy = H * c.originY;
    const paths = [];
    const grow = (x, y, a, segs) => {
      const pts = [[x, y]];
      for (let i = 0; i < segs; i++) {
        a += (rnd(-1, 1) * c.jitterDeg * Math.PI) / 180;
        const len = rnd(c.segMin, c.segMax);
        x += Math.cos(a) * len;
        y += Math.sin(a) * len;
        pts.push([x, y]);
        if (Math.random() < c.branchChance && segs > 3) grow(x, y, a + rnd(-0.9, 0.9), Math.floor(segs / 2));
      }
      paths.push(pts);
    };
    for (let i = 0; i < c.cracks; i++) grow(ox, oy, (i / c.cracks) * Math.PI * 2 + rnd(-0.2, 0.2), c.segs);
    const dark = s.add.graphics().setDepth(D);
    const glow = s.add.graphics().setDepth(D).setBlendMode(ADD);
    let step = 0;
    const total = c.segMax;
    const draw = () => { // 금이 중심에서 바깥으로 쩍쩍 번짐
      step++;
      dark.clear(); glow.clear();
      dark.lineStyle(c.outerW, hex(c.dark), 0.95);
      glow.lineStyle(c.innerW, hex(c.glow), 1);
      for (const pts of paths) {
        const n = Math.min(pts.length, step + 1);
        for (const gr of [dark, glow]) {
          gr.beginPath(); gr.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < n; i++) gr.lineTo(pts[i][0], pts[i][1]);
          gr.strokePath();
        }
        if (step < pts.length && Math.random() < 0.4) fx.p.emit(c.dust, pts[step][0], pts[step][1], hex(c.glow));
      }
      return step < total;
    };
    fx.timed(c.reveal, c.reveal / c.segs, draw);
    fadeOut(s, [dark, glow], c.reveal + c.hold, c.fade);
  },

  absoluteZero(fx, s, c) {
    const W = s.scale.width;
    const H = s.scale.height;
    const frost = s.add.rectangle(W / 2, H / 2, W, H, hex(c.frost), 1).setDepth(D).setAlpha(0);
    s.tweens.add({ targets: frost, alpha: c.frostAlpha, duration: c.freeze * 1000 });
    const crystals = [];
    for (let i = 0; i < c.crystals; i++) { // 화면 가장자리부터 얼음 결정이 자라남
      const edge = i % 4;
      const x = edge === 0 ? rnd(0, 70) : edge === 1 ? rnd(W - 70, W) : rnd(0, W);
      const y = edge === 2 ? rnd(0, 90) : edge === 3 ? rnd(H - 120, H) : rnd(0, H);
      const cr = s.add.image(x, y, 'fx', i % 3 ? 'shard' : 'star').setTint(hex(i % 2 ? c.ice : c.ice2))
        .setRotation(Math.random() * Math.PI * 2).setDepth(D + 1).setDisplaySize(1, 1);
      const size = rnd(40, 110);
      s.tweens.add({ targets: cr, displayWidth: size, displayHeight: size, duration: c.freeze * 1000, delay: rnd(0, 200), ease: 'Back.easeOut' });
      crystals.push(cr);
    }
    s.time.delayedCall(c.shatterAt * 1000, () => { // 모든 것이 산산조각
      fx.juice.flash('white');
      fx.juice.shake('big');
      for (const cr of crystals) {
        const a = Math.atan2(cr.y - H / 2, cr.x - W / 2);
        s.tweens.add({
          targets: cr, x: cr.x + Math.cos(a) * c.flyDist, y: cr.y + Math.sin(a) * c.flyDist, angle: cr.angle + rnd(-360, 360), alpha: 0,
          duration: c.fly * 1000, ease: 'Quad.easeOut', onComplete: () => cr.destroy(),
        });
      }
      for (let i = 0; i < c.shardBursts; i++) fx.p.emit(c.shards, rnd(40, W - 40), rnd(120, H - 160), hex(c.ice2));
      s.tweens.add({ targets: frost, alpha: 0, duration: c.fly * 1000, onComplete: () => frost.destroy() });
    });
  },
};
