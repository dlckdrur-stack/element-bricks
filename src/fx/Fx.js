import Phaser from 'phaser';
import { makeFxAtlas } from './atlas.js';
import { ParticleFx } from './ParticleFx.js';
import { SpriteFx } from './SpriteFx.js';
import { LineFx } from './LineFx.js';
import { Juice } from './Juice.js';
import { DamageNumbers } from './DamageNumbers.js';
import { combat } from './combatFx.js';
import { ultimate } from './ultimateFx.js';
import { augment } from './augmentFx.js';

/**
 * 이펙트 엔진 하나 (씬마다 1개). 속성별 차이는 data/fx/*.json 프리셋으로만.
 *   p       입자 (예산·우선순위)
 *   sprites 충격파 링·번쩍임
 *   lines   번개선·레일건 빔·충전 링·집중선
 *   juice   히트스톱·흔들림·화면 번쩍임·슬로모션
 *   nums    데미지 숫자
 * 전투 연출 레시피(explosion, railgun …)는 combatFx.js 에서 이 클래스에 붙는다.
 * 글로우(블룸)는 메인 카메라 한 곳에만.
 */
export class Fx {
  constructor(scene, cfg, { fontFamily }) {
    makeFxAtlas(scene);
    this.scene = scene;
    this.cfg = cfg;
    this.p = new ParticleFx(scene, cfg);
    this.sprites = new SpriteFx(scene, cfg);
    this.lines = new LineFx(scene, cfg);
    this.juice = new Juice(scene, cfg.juice);
    this.nums = new DamageNumbers(scene, cfg.numbers, fontFamily);
    this.tickers = [];
    this.fontFamily = fontFamily;
    this.keys = new Set();
    this.bloom = null;
    this.quality = cfg.quality;
    this.size = cfg.size;
    this.setupGlow();
    this.setQuality(cfg.quality);
    this.setSize(cfg.size);
  }

  get count() { return this.p.count; }

  /** 예전 API 호환: 입자 바로 찍기 */
  emit(name, x, y, color, o) { this.p.emit(name, x, y, color, o); }
  line(...a) { this.p.line(...a); }

  /** 합치기 규칙: 같은 key 는 한 프레임에 한 번만 true */
  once(key) {
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    return true;
  }

  /** 매 프레임 호출되는 지속 연출(화상 불꽃 등). fn(dt) 가 false 를 돌려주면 제거 */
  addTicker(fn) { this.tickers.push(fn); }

  setupGlow() {
    const g = this.cfg.glow;
    if (this.scene.renderer.type !== Phaser.WEBGL) return;
    this.bloom = this.scene.cameras.main.postFX.addBloom(0xffffff, 1, 1, g.blurStrength, g.strength, g.steps);
  }

  setQuality(q) {
    this.quality = q;
    this.p.setQuality(q);
    this.sprites.setQuality(q);
    this.lines.setQuality(q);
    if (this.bloom) this.bloom.active = !this.cfg.glow.offQualities.includes(q);
  }

  setSize(s) {
    this.size = s;
    this.p.setSize(s);
    this.sprites.setSize(s);
    this.lines.setSize(s);
    this.nums.setSize(Math.sqrt(s));
  }

  /** dt: 실제 시간(초). 히트스톱 중에는 이펙트도 거의 멈춤 */
  update(dt) {
    this.keys.clear();
    this.juice.update(dt);
    const d = this.juice.frozen ? dt * this.cfg.juice.frozenFxScale : dt;
    this.p.update(d);
    this.sprites.update(d);
    this.lines.update(d);
    this.nums.update(d);
    let n = 0;
    for (const t of this.tickers) if (t(d) !== false) this.tickers[n++] = t;
    this.tickers.length = n;
  }
}

Object.assign(Fx.prototype, combat, ultimate, augment);
