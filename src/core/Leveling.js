import { EV } from './events.js';

/**
 * 경험치·레벨. 블록 처치 1개 = xpPerBlock.
 * 레벨이 오르면 pending 에 레벨 번호가 쌓이고, 씬이 하나씩 꺼내 증강 선택 화면을 띄운다.
 * 만렙 이후에는 afterMaxXpPerDamage 마다 공 데미지 +afterMaxDamageGain.
 */
export class Leveling {
  constructor(bus, cfg, state, bonus = {}) {
    this.bus = bus;
    this.cfg = cfg;
    this.maxLevel = Math.min(cfg.maxLevelCap, cfg.maxLevel + (bonus.maxLevel ?? 0)); // 영구 강화: 만렙 확장
    this.xpMul = 1 + (bonus.xpPct ?? 0); // 영구 강화: 경험치 증가
    this.state = state;
    this.level = 0;
    this.xp = 0;
    this.pending = [];
    bus.on(EV.KILL, (ctx) => this.add((ctx.xp ?? cfg.xpPerBlock) * this.xpMul));
  }

  get isMax() { return this.level >= this.maxLevel; }

  /** 다음 레벨까지 필요 경험치 (만렙이면 데미지 보너스 주기) */
  get need() {
    if (this.isMax) return this.cfg.afterMaxXpPerDamage;
    return this.cfg.xpToNext[this.level - 1] ?? Infinity;
  }

  get progress() { return Math.min(1, this.xp / this.need); }

  /** 게임 시작 직후 레벨 1 (메인 속성 선택) */
  start() {
    this.level = 1;
    this.xp = 0;
    this.pending.push(1);
    this.bus.emit(EV.LEVEL_UP, { level: 1 });
  }

  add(n) {
    if (this.level < 1) return;
    this.xp += n;
    while (this.xp >= this.need) {
      this.xp -= this.need;
      if (this.isMax) {
        this.state.damage += this.cfg.afterMaxDamageGain;
        continue;
      }
      this.level++;
      this.pending.push(this.level);
      this.bus.emit(EV.LEVEL_UP, { level: this.level });
    }
  }

  /** 'main' | 'sub' | 'core' | 'duo' | 'awaken' | 'graded' (levels.json coreLevels) */
  kindFor(level) {
    return this.cfg.coreLevels[String(level)] ?? 'graded';
  }
}
