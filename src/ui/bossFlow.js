import cfg from '../data/bosses.json';
import theme from '../data/themes/neon.json';
import { EV } from '../core/events.js';
import { Boss } from '../core/Boss.js';

/**
 * 보스 스테이지 흐름 (GameScene 에 붙는 메서드).
 * 티어 마지막 스테이지(챌린저는 100마다)에 새 줄 대신 보스가 나온다.
 * 보스가 나온 뒤 turns 번 쏘는 안에 깨야 한다: 깨면 클리어(챌린저는 계속), 못 깨면 패배.
 * 보스전 동안에는 새 줄이 안 내려오고 남은 블록만 한 칸씩 내려온다. 보스전 중에는 판 저장을 하지 않는다
 * (이어하면 보스 직전 턴부터).
 */
export const bossFlow = {
  isBossStage(stage) {
    return this.tier.stages ? stage === this.tier.stages : stage % cfg.challengerEvery === 0;
  },

  startBoss() {
    const { grid, bus, fx, state, tier } = this;
    this.boss = new Boss(this, { grid, bus, fx, state, theme, tier });
  },

  /** endTurn 에서 호출. 보스전이면 처리하고 true */
  bossEndTurn() {
    const b = this.boss;
    if (!b) return false;
    if (b.dead) {
      b.destroy();
      this.boss = null;
      if (this.tier.stages) { this.victory(); return true; }
      return false; // 챌린저: 다음 스테이지로 계속
    }
    if (b.turnsLeft <= 1) { this.gameOver(); return true; } // 제한 턴 초과
    this.grid.shiftDown();
    if (this.grid.reachedBottom()) { this.gameOver(); return true; }
    b.turn();
    this.bus.emit(EV.TURN_START, { stage: this.state.stage });
    this.beginAim();
    return true;
  },
};
