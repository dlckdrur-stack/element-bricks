import Phaser from 'phaser';
import { ParticleFx } from '../fx/ParticleFx.js';
import { SpriteFx } from '../fx/SpriteFx.js';

/**
 * 증강 선택 같은 전면 화면용 겹 화면.
 * - UI 전용 카메라를 하나 더 두고, 게임 화면(메인 카메라)만 흐리게(blur) 만든다.
 *   own(obj) 한 오브젝트만 UI 카메라에 보이고, 나머지는 전부 메인 카메라에만 보인다.
 * - 카드 연출용 입자·스프라이트를 따로 가진다(닫을 때 정리).
 * - 글로우(블룸)는 여전히 메인 카메라 한 곳에만 있다.
 */
export class UiOverlay {
  constructor(scene, { cfg, fxCfg, quality, size }) {
    this.scene = scene;
    this.main = scene.cameras.main;
    const { width, height } = scene.scale;
    this.cam = scene.cameras.add(0, 0, width, height);
    this.cam.ignore(scene.children.list.slice());
    this.onAdded = (go) => { go.cameraFilter |= this.cam.id; };
    scene.events.on('addedtoscene', this.onAdded);

    const b = cfg.blur;
    this.blur = null;
    if (scene.renderer.type === Phaser.WEBGL && !b.offQualities.includes(quality)) {
      this.blur = this.main.postFX.addBlur(b.quality, b.x, b.y, 0, 0xffffff, b.steps);
      scene.tweens.add({ targets: this.blur, strength: b.strength, duration: b.time * 1000 });
    }

    const own = (o) => this.own(o);
    this.p = new ParticleFx(scene, fxCfg, { depth: 75, onCreate: own, quality });
    this.sprites = new SpriteFx(scene, fxCfg, { depth: 76, onCreate: own, quality });
    this.p.setSize(size);
    this.sprites.setSize(size);
    this.tickers = [];
    this.objs = [];
    this.tick = (_t, delta) => {
      const dt = delta / 1000;
      this.p.update(dt);
      this.sprites.update(dt);
      for (const fn of this.tickers) fn(dt);
    };
    scene.events.on('update', this.tick);
  }

  /** UI 카메라에만 보이게 (컨테이너면 자식까지). destroy 대상에 등록 */
  own(go, track = false) {
    go.cameraFilter &= ~this.cam.id;
    this.main.ignore(go);
    if (go.list) for (const ch of go.list) this.own(ch);
    if (track) this.objs.push(go);
    return go;
  }

  /** own + 닫을 때 같이 지움 */
  add(go) { return this.own(go, true); }

  close() {
    const s = this.scene;
    s.events.off('addedtoscene', this.onAdded);
    s.events.off('update', this.tick);
    if (this.blur) {
      s.tweens.killTweensOf(this.blur);
      this.main.postFX.remove(this.blur);
    }
    for (const o of this.objs) o.destroy();
    this.p.destroy();
    this.sprites.destroy();
    s.cameras.remove(this.cam);
  }
}
