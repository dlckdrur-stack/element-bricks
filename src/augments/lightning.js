import { EV } from '../core/events.js';
import { strike, cx, cy, nearest, randomBlocks, isBallHit } from './helpers.js';

/** ⚡ 번개 증강. 수치는 data/augments/lightning.json, 여기는 효과만. */

const SRC = (aug, extra) => ({ type: 'lightning', aug, ...extra });

export function stats(aug, s, mgr) {
  const v = aug.v;
  if (aug.def.id === 'lightning_pierce') {
    s.pierce += v.count + mgr.val('lightning_plasma', 'extraPierce', 0);
    s.pierceBonus += v.bonusPct;
    s.pierceRefillOnWall = v.refillOnWall;
  }
}

/** 낙뢰 한 방 (위에서 떨어지는 선 + 충격) */
function bolt(api, cell, pct, source) {
  const color = api.mgr.color('lightning');
  const x = cx(api, cell);
  const y = cy(api, cell);
  api.fx.line('chain', x, api.grid.top, x, y, color, api.fx.cfg.lineSpacing.chain * 2, 8);
  api.fx.emit('strike', x, y, color);
  strike(api, cell, pct, source);
}

export const handlers = {
  lightning_chain(api, aug) {
    const color = api.mgr.color('lightning');
    api.bus.on(EV.AFTER_HIT, ({ cell, source }) => {
      if (!isBallHit(source)) return;
      const n = aug.v.targets + api.mgr.val('lightning_overcharge', 'extraTargets', 0);
      const x0 = cx(api, cell);
      const y0 = cy(api, cell);
      for (const b of nearest(api, cell, n)) {
        api.fx.line('chain', x0, y0, cx(api, b), cy(api, b), color, api.fx.cfg.lineSpacing.chain, 6);
        strike(api, b, aug.v.dmgPct, SRC('lightning_chain'));
      }
    });
  },

  lightning_railgun(api, aug) {
    const st = aug.state;
    st.hits = 0;
    st.fired = 0;
    const color = api.mgr.color('lightning');
    api.bus.on(EV.TURN_START, () => { st.fired = 0; });
    api.bus.on(EV.AFTER_HIT, ({ source }) => {
      if (!isBallHit(source)) return;
      const need = Math.max(1, aug.v.hitsNeeded - api.mgr.val('lightning_fastCharge', 'hitsReduce', 0));
      if (++st.hits < need) return;
      st.hits = 0;
      if (st.fired >= aug.v.maxPerTurn) return;
      st.fired++;
      const b = source.ball;
      const { cells, endX, endY } = api.grid.lineBlocks(b.x, b.y, b.vx, b.vy);
      api.fx.line('rail', b.x, b.y, endX, endY, color, api.fx.cfg.lineSpacing.rail, 0);
      for (const c of cells) strike(api, c, aug.v.dmgPct, SRC('lightning_railgun'));
    });
  },

  // lightning_pierce: 공 관통은 stats() → BallSystem 에서 처리

  lightning_static(api, aug) {
    api.bus.on(EV.WALL_BOUNCE, () => {
      const [b] = randomBlocks(api, 1);
      if (b) bolt(api, b, aug.v.dmgPct, SRC('lightning_static'));
    });
  },

  lightning_storm(api, aug) {
    api.bus.on(EV.TURN_START, () => {
      for (const b of randomBlocks(api, aug.v.strikes)) bolt(api, b, aug.v.dmgPct, SRC('lightning_storm'));
    });
  },

  lightning_capacitor(api, aug) {
    aug.state.count = 0; // 턴을 넘어 누적
    api.bus.on(EV.AFTER_HIT, ({ source }) => {
      if (source?.type !== 'lightning' || source.capacitor) return;
      if (++aug.state.count < aug.v.every) return;
      aug.state.count = 0;
      for (const b of api.grid.blocks()) bolt(api, b, aug.v.dmgPct, SRC('lightning_capacitor', { capacitor: true }));
    });
  },

  lightning_conductive(api) {
    api.bus.on(EV.HIT, (ctx) => { if (ctx.source?.type === 'lightning') ctx.ignoreShield = true; });
  },
};
