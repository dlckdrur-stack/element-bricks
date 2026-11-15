import cfg from '../data/elites.json';
import { EV } from './events.js';
import { hex } from './color.js';
import { stageHp } from './stageLayout.js';

/**
 * 엘리트 블록 5종 (stageLayout 이 티어 확률로 만들고, 여기서 행동).
 *   거인 체력 5배 · 소환사 매 턴 졸개 2개 · 재생 매 턴 20% 회복(화상이면 못 함)
 *   강철 받는 피해 -50%(뇌전 투과면 무시) · 질주 매 턴 한 줄 더 내려옴
 * 깨면 경험치 +10, 재화 3배.
 */
export class Elites {
  constructor({ bus, grid, fx, state, mgr }) {
    this.grid = grid;
    this.fx = fx;
    this.state = state;
    this.mgr = mgr;
    this.color = hex(cfg.color);
    bus.on(EV.HIT, (ctx) => {
      if (ctx.cell.elite !== 'steel') return;
      if (ctx.source?.type === 'lightning' && mgr.has('lightning_conductive')) return;
      ctx.damage *= cfg.types.steel.dmgMul;
    });
    bus.on(EV.KILL, (ctx) => {
      if (!ctx.cell.elite) return;
      ctx.xp = cfg.xp;
      ctx.currencyBonus += cfg.currencyMul - 1;
    });
    bus.on(EV.TURN_START, () => this.turn());
  }

  list() { return this.grid.blocks().filter((b) => b.elite && !b.boss); }

  turn() {
    for (const e of this.list()) {
      const t = cfg.types[e.elite];
      if (e.elite === 'regen' && !e.burn) this.heal(e, t);
      if (e.elite === 'summoner') this.summon(e, t);
      if (e.elite === 'runner') this.run(e);
    }
  }

  pos(c) { return [this.grid.centerX(c.col), this.grid.centerY(c.row)]; }

  heal(e, t) {
    if (e.hp >= e.maxHp) return;
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * t.healPct);
    this.grid.refreshBlock(e);
    this.fx.p.emit(cfg.fx.heal, ...this.pos(e), 0x5dff7a);
  }

  summon(e, t) {
    const g = this.grid;
    const spots = [[-1, 0], [1, 0], [0, 1], [-1, 1], [1, 1]]
      .map(([dc, dr]) => [e.col + dc, e.row + dr])
      .filter(([c, r]) => c >= 0 && c < g.cols && r >= 0 && r < g.rows - 1 && !g.cells[r][c]);
    for (const [c, r] of spots.slice(0, t.minions)) {
      g.placeAt(c, r, { kind: 'block', hp: Math.max(1, Math.ceil(stageHp(this.state.stage) * t.minionHpMul)), double: false, base: 0 });
    }
    this.fx.p.emit(cfg.fx.summon, ...this.pos(e), this.color);
  }

  /** 질주: 아래 칸이 비어 있으면 한 줄 더 내려옴 */
  run(e) {
    const g = this.grid;
    const r = e.row + 1;
    if (r >= g.rows || g.cells[r][e.col]) return;
    g.cells[e.row][e.col] = null;
    e.row = r;
    g.cells[r][e.col] = e;
    g.moveView(e);
    this.fx.sprites.play(cfg.fx.ring, ...this.pos(e), this.color, { priority: 1 });
  }
}
