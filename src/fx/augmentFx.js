import Phaser from 'phaser';
import cfg from '../data/fx/augfx.json';
import { hex } from '../core/color.js';

const ADD = Phaser.BlendModes.ADD;
const DEG = Math.PI / 180;
const colors = new Map();
const col = (s) => {
  if (!colors.has(s)) colors.set(s, hex(s));
  return colors.get(s);
};

/**
 * 증강별 이펙트 (색놀이가 아닌 모양으로 구분). Fx 에 메서드로 붙는다 (this = Fx). 수치는 data/fx/augfx.json
 *   burst      그 자리에서 터짐 (불꽃·베기·얼음 깨짐·바위 부서짐·잎)
 *   bolt       하늘에서 내리꽂는 번개 (흰 중심 + 노란 줄기 + 푸른 빛 + 갈래)
 *   projectile 칼날·고드름·바위가 날아와 박힌 뒤 arrive 레시피
 *   whip       아래에서 덩굴이 채찍처럼 뻗어 감 → arrive
 * 증강마다 byAug, 없으면 속성별 byElement. "none" = 그 증강이 이미 자기 큰 연출을 그림.
 */
export const augment = {
  /** 증강 피해 1회 (helpers.strike 에서). 같은 칸은 한 프레임 1번 */
  augFx(source, x, y, key) {
    const name = cfg.byAug[source?.aug] ?? cfg.byElement[source?.type];
    if (!name || name === 'none' || !this.once(`a${key}`)) return;
    this.recipe(name, x, y);
  },

  recipe(name, x, y) {
    const r = cfg.recipes[name];
    if (!r) return;
    if (r.type === 'burst') this.augBurst(r, x, y);
    else if (r.type === 'bolt') this.augBolt(r, x, y);
    else if (r.type === 'projectile') this.augProjectile(r, x, y);
    else if (r.type === 'whip') this.augWhip(r, x, y);
  },

  augBurst(r, x, y) {
    for (const sp of r.sprites ?? []) {
      const rot = sp.randRot ? Math.random() * Math.PI : (sp.rot ?? 0) * DEG;
      const c = sp.hot ? col(r.hot) : col(sp.tint ?? r.color);
      this.sprites.play(sp, x, y, c, { priority: 1, rot, w: sp.w, h: sp.h });
    }
    for (const p of r.particles ?? []) this.p.emit(p, x, y, col(r.color));
    if (r.shake) this.juice.shake(r.shake);
  },

  augBolt(r, x, y) {
    const x0 = x + (Math.random() - 0.5) * r.jitterX;
    this.lines.bolt(x0, y - r.height, x, y, col(r.color), r.bolt);
    this.augBurst(r, x, y);
  },

  /** 출발점: side = 무작위 방향 dist 만큼 떨어진 곳, top = 위, below = 아래 */
  origin(r, x, y) {
    if (r.from === 'top') return [x + (Math.random() - 0.5) * cfg.jitterTop, y - r.dist];
    if (r.from === 'below') return [x + (Math.random() - 0.5) * cfg.jitterBelow, y + r.dist];
    const a = Math.random() * Math.PI * 2;
    return [x + Math.cos(a) * r.dist, y + Math.sin(a) * r.dist];
  },

  augProjectile(r, x, y) {
    this.projectiles ??= [];
    const live = this.projectiles.filter((p) => p.active).length;
    const arrive = () => this.recipe(r.arrive, x, y);
    if (live >= cfg.maxProjectiles) { arrive(); return; } // 예산 초과면 도착 연출만
    let img = this.projectiles.find((p) => !p.active);
    if (!img) {
      img = this.scene.add.image(0, 0, 'fx', r.frame).setBlendMode(ADD).setDepth(cfg.projDepth);
      this.projectiles.push(img);
    }
    const [x0, y0] = this.origin(r, x, y);
    const size = r.size * this.size;
    img.setActive(true).setVisible(true).setBlendMode(r.blend === 'normal' ? Phaser.BlendModes.NORMAL : ADD).setFrame(r.frame).setTint(col(r.tint === 'color' ? r.color : r.hot)).setPosition(x0, y0)
      .setDisplaySize(size, size * (r.frame === 'blade' ? cfg.bladeAspect : 1)).setRotation(Math.atan2(y - y0, x - x0)).setAlpha(1);
    let n = 0;
    this.scene.tweens.add({
      targets: img, x, y, duration: r.time * 1000, ease: 'Quad.easeIn',
      angle: r.spin ? img.angle + r.spin * cfg.spinDeg : img.angle,
      onUpdate: () => { if (r.trail && n++ % 2 === 0) this.p.emit(r.trail, img.x, img.y, col(r.color)); },
      onComplete: () => { img.setActive(false).setVisible(false); arrive(); },
    });
  },

  augWhip(r, x, y) {
    const [x0, y0] = this.origin(r, x, y);
    this.lines.bolt(x0, y0, x, y, col(r.color), r.bolt);
    this.recipe(r.arrive, x, y);
  },
};
