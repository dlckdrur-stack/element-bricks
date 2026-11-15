import slash from '../data/fx/slash.json';

const TAU = Math.PI * 2;

/**
 * 전투 연출 레시피. Fx 에 메서드로 붙는다 (this = Fx).
 * 무엇을 몇 개·어떤 크기로 그릴지는 전부 data/fx/combat.json.
 */
export const combat = {
  /** 블록 타격: 불티(공 타격만, 칸당 프레임 1회) + 치명타 + 데미지 숫자(칸별 합산) */
  hit(x, y, color, { key, amount, crit, ball }) {
    const c = this.cfg.combat;
    if (ball && this.once(`h${key}`)) this.p.emit(c.blockHit.particles, x, y, color);
    if (crit) {
      this.p.emit(c.crit.particles, x, y, 0xffffff);
      if (this.once(`c${key}`)) { // 치명타: 짧은 노란 번쩍 (칸당 프레임 1회)
        const col = this.critColor ??= parseInt(c.crit.color.slice(1), 16);
        this.sprites.play(c.crit.flash, x, y, col);
        this.sprites.play(c.crit.star, x, y, col);
        this.playSet(slash.crit, x, y, col, 0xffffff, 2); // X자 큰 베기 + 사방 속도선
      }
      this.juice.shake(c.crit.shake);
      this.juice.hitstop(c.crit.hitstop);
    }
    this.nums.add(key, x, y - 6, amount, crit);
  },

  /**
   * 속성 타격: 공이 블록을 칠 때마다 메인 속성 손맛 (칸당 프레임 1회).
   * 불=작은 폭발, 번개=위에서 내려치는 낙뢰, 얼음=파편, 어둠=X자 베기, 땅=돌 부스러기, 풀=잎. 수치는 combat.json 의 elementHit
   */
  elementHit(x, y, element, key) {
    const e = this.cfg.combat.elementHit[element];
    if (!e || !this.once(`e${key}`)) return;
    const color = this.colorOf(e.color);
    const hot = this.colorOf(e.hot);
    if (e.bolt) this.lines.bolt(x + (Math.random() - 0.5) * e.bolt.jitterX, y - e.bolt.height, x, y, color, e.bolt);
    this.playSet(slash.common, x, y, color, hot); // 붓질 베기 + 속도선
    this.playSet(slash.byElement[element], x, y, color, hot);
    this.playSet(e.sprites, x, y, color, hot);
    for (const name of e.particles) this.p.emit(name, x, y, color);
    if (e.shake) this.juice.shake(e.shake);
  },

  /**
   * 스프라이트 묶음 재생. follow = 이번에 뽑은 방향 + rot, count = 여러 장(follow 면 고르게 펼침), randRot = 각자 무작위
   */
  playSet(list, x, y, color, hot, priority = 1) {
    if (!list) return;
    const base = Math.random() * TAU;
    for (const sp of list) {
      const n = sp.count ?? 1;
      for (let i = 0; i < n; i++) {
        const fixed = ((sp.rot ?? 0) * Math.PI) / 180;
        const rot = sp.randRot ? Math.random() * TAU : sp.follow ? base + fixed + (i * TAU) / n : fixed;
        this.sprites.play(sp, x, y, sp.hot ? hot : color, { priority, rot, w: sp.w, h: sp.h });
      }
    }
  },

  colorOf(hexStr) {
    this.colorCache ??= new Map();
    if (!this.colorCache.has(hexStr)) this.colorCache.set(hexStr, parseInt(hexStr.slice(1), 16));
    return this.colorCache.get(hexStr);
  },

  /** 블랙홀: 빨려 들어가는 고리 → 터지는 고리. size = 칸 크기 배율 */
  blackhole(x, y, color, size = 1) {
    const c = this.cfg.combat.blackhole;
    this.sprites.play(c.implode, x, y, color, { priority: 2, scale: size });
    this.sprites.play(c.core, x, y, color, { priority: 2, scale: size });
    for (const n of c.particles) this.p.emit(n, x, y, color);
    this.scene.time.delayedCall(c.burstDelay * 1000, () => {
      this.sprites.play(c.burst, x, y, color, { priority: 2, scale: size });
      this.p.emit(c.burstParticles, x, y, color);
      this.juice.shake(c.shake);
    });
  },

  /** 블록 파괴: 블록 색 파편 + 하얀 테두리 번쩍 */
  blockBreak(x, y, w, h, color) {
    const c = this.cfg.combat.blockBreak;
    this.p.emit(c.particles, x, y, color);
    this.sprites.play(c.outline, x, y, 0xffffff, { w, h });
    this.sprites.play(c.glow, x, y, color, { priority: 1 });
    this.playSet(slash.kill, x, y, color, 0xffffff); // 마무리 베기
  },

  /** 화염 폭발: 주황 충격파 + 솟는 불티 + 연기. depth>0 = 연쇄 폭발(더 세게 흔듦) */
  explosion(x, y, color, depth = 0, key = null) {
    if (key !== null && !this.once(`x${key}`)) return;
    const c = this.cfg.combat.explosion;
    this.sprites.play(c.ring, x, y, color);
    this.sprites.play(c.ring2, x, y, color, { priority: 1 });
    this.sprites.play(c.core, x, y, color, { priority: 1 });
    if (c.flash) this.sprites.play(c.flash, x, y, color, { priority: 1 }); // 하얀 섬광
    if (c.shock) this.sprites.play(c.shock, x, y, color, { priority: 1 }); // 충격파
    for (const name of c.particles) this.p.emit(name, x, y, color);
    this.juice.shake(depth ? c.chainShake : c.shake);
    this.juice.sound('explosion');
  },

  burnTick(x, y, color) {
    this.p.emit(this.cfg.combat.burn.tick, x, y, color);
  },

  /** 화상 블록 위 일렁이는 불꽃. points() → [{x,y}] 를 주기마다 물어봄 */
  burnAmbient(points, color) {
    const c = this.cfg.combat.burn;
    let acc = 0;
    this.addTicker((dt) => {
      acc += dt;
      if (acc < c.interval) return;
      acc = 0;
      for (const pt of points()) if (Math.random() < c.chance) this.p.emit(c.particle, pt.x, pt.y, color);
    });
  },

  /** 연쇄 번개: 블록 사이 지그재그 번개선 */
  chain(x0, y0, x1, y1, color) {
    const c = this.cfg.combat.chain;
    this.lines.bolt(x0, y0, x1, y1, color, c);
    this.p.emit(c.spark, x1, y1, color);
  },

  /** 낙뢰: 화면 위에서 블록까지 */
  bolt(x, yTop, y, color) {
    const c = this.cfg.combat.bolt;
    this.lines.bolt(x, yTop, x, y, color, c);
    this.p.emit(c.particles, x, y, color);
    this.sprites.play(c.ring, x, y, color, { priority: 1 });
  },

  /** 뇌격 관통: 블록을 뚫을 때마다 스파크 폭발 */
  pierce(x, y, color) {
    const c = this.cfg.combat.pierce;
    this.p.emit(c.particles, x, y, color);
    this.sprites.play(c.ring, x, y, color, { priority: 1 });
    this.sprites.play(c.core, x, y, color, { priority: 1 });
  },

  /** 레일건 충전 링 (progress 0~1). ball 은 {x,y} 를 가진 공, r 은 공 반지름 */
  railCharge(key, ball, r, progress, color) {
    this.lines.charge(key, ball, r, progress, color, this.cfg.combat.railCharge);
  },

  /** 레일건 발사. hits = 맞은 블록 중심 [{x,y}] */
  railgun(key, x0, y0, x1, y1, color, hits) {
    const c = this.cfg.combat.railgun;
    this.lines.clearCharge(key);
    this.sprites.play(this.cfg.combat.railCharge.full, x0, y0, color);
    this.juice.hitstop(c.hitstop);
    this.juice.flash(c.flash);
    this.juice.shake(c.shake);
    this.juice.sound(c.sound);
    this.lines.beam(x0, y0, x1, y1, color, c);
    this.lines.focus(c.focusLines);
    this.p.line(c.spark, x0, y0, x1, y1, color, c.sparkSpacing, 6);
    this.p.emit(c.muzzle.particles, x0, y0, color);
    this.sprites.play(c.muzzle.glow, x0, y0, color);
    for (const h of hits) {
      this.p.emit(c.hit.particles, h.x, h.y, color);
      this.sprites.play(c.hit.ring, h.x, h.y, color);
      this.sprites.play(c.hit.core, h.x, h.y, color, { priority: 1 });
    }
  },

  /** 데미지 구슬 획득: 빛 링 + 별 + "+1" 이 튀어 오름 */
  orbCollect(x, y, color, text) {
    const c = this.cfg.combat.orb;
    this.sprites.play(c.ring, x, y, color);
    this.sprites.play(c.core, x, y, color, { priority: 1 });
    this.p.emit(c.particles, x, y, color);
    this.nums.popText(x, y - 4, text, c.text);
    this.juice.sound(c.sound);
  },
};
