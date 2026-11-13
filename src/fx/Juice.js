/**
 * 손맛: 히트스톱·화면 흔들림·화면 번쩍임·슬로모션·효과음 자리.
 * 수치는 default.json 의 juice. 흔들림·번쩍임은 설정으로 끌 수 있음(빛 민감 사용자).
 */
export class Juice {
  constructor(scene, cfg) {
    this.scene = scene;
    this.cfg = cfg;
    this.stop = 0;
    this.cool = 0;
    this.slow = 0;
    this.slowScale = 1;
    this.shakeEnabled = cfg.shakeEnabled;
    this.flashEnabled = cfg.flashEnabled;
  }

  /** 히트스톱: 공 계산을 잠깐 멈춤. key = juice.hitstop 의 이름 */
  hitstop(key) {
    const sec = this.cfg.hitstop[key];
    if (!sec || this.cool > 0) return;
    this.stop = Math.max(this.stop, sec);
    this.cool = this.cfg.hitstopCooldown;
  }

  get frozen() { return this.stop > 0; }

  /** 슬로모션 (레벨업 순간) */
  slowmo(sec, scale) {
    this.slow = sec;
    this.slowScale = scale;
  }

  get slowActive() { return this.slow > 0; }

  /** 공 계산 시간 배율 (히트스톱이면 0) */
  get timeScale() {
    if (this.stop > 0) return 0;
    return this.slow > 0 ? this.slowScale : 1;
  }

  shake(level, cam = this.scene.cameras.main) {
    const s = this.cfg.shake[level];
    if (!s || !this.shakeEnabled) return;
    cam.shake(s[0], s[1], true);
  }

  flash(name, cam = this.scene.cameras.main) {
    const f = this.cfg.flash[name];
    if (!f || !this.flashEnabled) return;
    cam.flash(f[0], f[1], f[2], f[3], true);
  }

  /** 효과음 자리. 사운드 시스템이 생기면 여기서 재생 (키는 juice.sounds) */
  sound(name) {
    const key = this.cfg.sounds[name];
    if (!key) return;
    this.scene.events.emit('sfx', key);
  }

  /** 실제 시간 dt(초) */
  update(dt) {
    if (this.stop > 0) this.stop -= dt;
    if (this.cool > 0) this.cool -= dt;
    if (this.slow > 0) this.slow -= dt;
  }
}
