import { EV } from '../core/events.js';
import { strike, cx, cy, nearest, randomBlocks, isBallHit, ultimateGauge, later, wallOk } from './helpers.js';
import { stageHp } from '../core/stageLayout.js';
import { t } from '../ui/i18n.js';

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
  api.fx.bolt(cx(api, cell), api.grid.top, cy(api, cell), api.mgr.color('lightning'));
  strike(api, cell, pct, source);
}

export const handlers = {
  /**
   * 각성 필살기 「뇌신」: 공이 블록을 need 번 칠 때마다 반드시, 그 자리에서 즉시 발동.
   * 하늘이 갈라지고 체력이 가장 높은 블록 targets 개에 굵은 낙뢰 + 주변 chains 개 연쇄 → 마지막에 하늘 전체 낙뢰
   */
  lightning_judgment(api, aug) {
    ultimateGauge(api, aug, EV.AFTER_HIT, ({ source }) => isBallHit(source), () => {
      const c = api.fx.cfg.ult.judgment;
      const color = api.mgr.color('lightning');
      api.fx.judgmentStart(t('aug.lightning_judgment.name'), t('ult.sub'));
      const targets = api.grid.blocks().sort((a, b) => b.hp - a.hp).slice(0, aug.v.targets);
      targets.forEach((b, i) => later(api, c.startDelay + i * c.boltGap, () => {
        if (b.dead) return;
        const x = cx(api, b);
        const y = cy(api, b);
        const hp = stageHp(api.state.stage);
        api.fx.judgmentBolt(x, 0, y, i); // 화면 맨 위(하늘)에서
        const near = nearest(api, b, aug.v.chains);
        api.grid.damage(b, hp * aug.v.hitPct, SRC('lightning_judgment', { ult: true }));
        later(api, c.chainDelay, () => {
          for (const n of near) {
            if (n.dead) continue;
            api.fx.chain(x, y, cx(api, n), cy(api, n), color);
            api.grid.damage(n, hp * aug.v.chainPct, SRC('lightning_judgment', { ult: true, chain: true }));
          }
        });
      }));
      const end = c.startDelay + targets.length * c.boltGap;
      later(api, end, () => api.fx.judgmentFinale(api.grid.top + api.grid.rows * api.grid.cellH)); // 바닥 선
      return end + c.finaleTime;
    });
  },

  lightning_chain(api, aug) {
    const color = api.mgr.color('lightning');
    api.bus.on(EV.AFTER_HIT, ({ cell, source }) => {
      if (!isBallHit(source)) return;
      const n = aug.v.targets + api.mgr.val('lightning_overcharge', 'extraTargets', 0);
      const x0 = cx(api, cell);
      const y0 = cy(api, cell);
      for (const b of nearest(api, cell, n)) {
        api.fx.chain(x0, y0, cx(api, b), cy(api, b), color);
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
      const b = source.ball;
      if (st.fired >= aug.v.maxPerTurn) { api.fx.lines.clearCharge(aug.def.id); return; }
      if (++st.hits < need) {
        // 충전 링: 맞힐 때마다 공 주위 링이 차오름
        api.fx.railCharge(aug.def.id, b, api.layout.ballRadius * api.state.stats.ballScale, st.hits / need, color);
        return;
      }
      st.hits = 0;
      st.fired++;
      const { cells, endX, endY } = api.grid.lineBlocks(b.x, b.y, b.vx, b.vy);
      const hits = cells.map((c) => ({ x: cx(api, c), y: cy(api, c) }));
      api.fx.railgun(aug.def.id, b.x, b.y, endX, endY, color, hits);
      for (const c of cells) strike(api, c, aug.v.dmgPct, SRC('lightning_railgun'));
    });
  },

  // lightning_pierce: 공 관통은 stats() → BallSystem 에서 처리. 여기는 관통 순간 스파크 폭발만
  lightning_pierce(api) {
    const color = api.mgr.color('lightning');
    api.bus.on(EV.AFTER_HIT, ({ source }) => {
      if (isBallHit(source) && source.pierce) api.fx.pierce(source.ball.x, source.ball.y, color);
    });
  },

  lightning_static(api, aug) {
    api.bus.on(EV.WALL_BOUNCE, ({ ball }) => {
      if (!wallOk(ball, aug)) return;
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

  /** 전도체: 번개 효과에 need 번 맞은 블록이 과충전 폭발 (주변 1칸 dmgPct). 번개는 방패·강철도 무시 (elites.js) */
  lightning_conductive(api, aug) {
    api.bus.on(EV.AFTER_HIT, ({ cell, source }) => {
      if (source?.type !== 'lightning' || source.aug === 'lightning_conductive' || cell.dead) return;
      cell.charge = (cell.charge ?? 0) + 1;
      if (cell.charge < aug.v.need) return;
      cell.charge = 0;
      api.fx.pierce(cx(api, cell), cy(api, cell), api.mgr.color('lightning'));
      for (const b of api.grid.around(cell.col, cell.row, 1)) {
        api.fx.chain(cx(api, cell), cy(api, cell), cx(api, b), cy(api, b), api.mgr.color('lightning'));
        strike(api, b, aug.v.dmgPct, SRC('lightning_conductive'));
      }
    });
  },

  // ---------- 추가 증강 10종 ----------
  /** 천둥 박수: 공이 천장에 튕길 때 그 열 전체로 낙뢰가 관통 */
  lightning_thunderclap(api, aug) {
    api.bus.on(EV.WALL_BOUNCE, ({ ball, side }) => {
      if (side !== 'top' || !wallOk(ball, aug)) return;
      const col = Math.floor(ball.x / api.grid.cellW);
      const list = api.grid.blocks().filter((b) => b.col === col);
      if (!list.length) return;
      const low = Math.max(...list.map((b) => b.row));
      api.fx.bolt(api.grid.centerX(col), api.grid.top, api.grid.centerY(low), api.mgr.color('lightning'));
      for (const b of list) strike(api, b, aug.v.dmgPct, SRC('lightning_thunderclap'));
    });
  },

  /** 과부하: 공 치명타가 터지면 주변 targets 개로 번개가 튐 */
  lightning_overload(api, aug) {
    api.bus.on(EV.AFTER_HIT, ({ cell, source }) => {
      if (!isBallHit(source) || !source.crit) return;
      for (const b of nearest(api, cell, aug.v.targets)) {
        api.fx.chain(cx(api, cell), cy(api, cell), cx(api, b), cy(api, b), api.mgr.color('lightning'));
        strike(api, b, aug.v.dmgPct, SRC('lightning_overload'));
      }
    });
  },

  /** 자기장: 매 턴 체력이 가장 높은 블록이 자석이 됨. 그 블록이 맞을 때마다 주변 블록에 전류 */
  lightning_magnet(api, aug) {
    let mag = null;
    api.bus.on(EV.TURN_START, () => { [mag] = api.grid.blocks().sort((a, b) => b.hp - a.hp); });
    api.bus.on(EV.AFTER_HIT, ({ cell, source }) => {
      if (cell !== mag || source?.aug === 'lightning_magnet') return;
      for (const b of api.grid.around(cell.col, cell.row, 1)) {
        api.fx.chain(cx(api, cell), cy(api, cell), cx(api, b), cy(api, b), api.mgr.color('lightning'));
        strike(api, b, aug.v.dmgPct, SRC('lightning_magnet'));
      }
    });
  },

  /** 구전(구형 번개): 매 턴 첫 공이 날아가는 동안 every 초마다 가장 가까운 블록에 번개 */
  lightning_ballLightning(api, aug) {
    let armed = false;
    api.bus.on(EV.TURN_START, () => { armed = true; });
    api.bus.on(EV.LAUNCH, ({ ball }) => {
      if (!armed) return;
      armed = false;
      let acc = 0;
      api.fx.addTicker((dt) => {
        if (!api.scene.balls.active.includes(ball)) return false;
        if ((acc += dt) < aug.v.every) return true;
        acc = 0;
        const g = api.grid;
        const [b] = nearest(api, { col: Math.floor(ball.x / g.cellW), row: Math.floor((ball.y - g.top) / g.cellH) }, 1);
        if (b) { api.fx.chain(ball.x, ball.y, cx(api, b), cy(api, b), api.mgr.color('lightning')); strike(api, b, aug.v.dmgPct, SRC('lightning_ballLightning')); }
        return true;
      });
    });
  },

  /** 연쇄 폭주: 연쇄 번개로 깬 블록에서 다시 번개가 튐 (1번) */
  lightning_chainKill(api, aug) {
    api.bus.on(EV.KILL, ({ cell, source }) => {
      if (source?.aug !== 'lightning_chain') return;
      for (const b of nearest(api, cell, aug.v.targets)) {
        api.fx.chain(cx(api, cell), cy(api, cell), cx(api, b), cy(api, b), api.mgr.color('lightning'));
        strike(api, b, aug.v.dmgPct, SRC('lightning_chainKill'));
      }
    });
  },

  /** 뇌우 레일: 레일건이 맞힌 블록마다 하늘에서 낙뢰가 꽂힘 */
  lightning_railThunder(api, aug) {
    api.bus.on(EV.AFTER_HIT, ({ cell, source, killed }) => {
      if (source?.aug === 'lightning_railgun' && !killed) bolt(api, cell, aug.v.dmgPct, SRC('lightning_railThunder'));
    });
  },

  /** 아크 관통: 관통할 때마다 관통한 블록에서 번개 targets 갈래 */
  lightning_arcPierce(api, aug) {
    api.bus.on(EV.AFTER_HIT, ({ cell, source }) => {
      if (!isBallHit(source) || !source.pierce) return;
      for (const b of nearest(api, cell, aug.v.targets)) {
        api.fx.chain(cx(api, cell), cy(api, cell), cx(api, b), cy(api, b), api.mgr.color('lightning'));
        strike(api, b, aug.v.dmgPct, SRC('lightning_arcPierce'));
      }
    });
  },

  /** 초전도: 공이 벽에 튕길 때마다 그 공의 피해 +perWallPct (최대 maxPct, 돌아오면 초기화) */
  lightning_superconductor(api, aug) {
    api.bus.on(EV.WALL_BOUNCE, ({ ball }) => {
      ball.baseMul ??= ball.mul;
      ball.sc = Math.min(aug.v.maxPct, (ball.sc ?? 0) + aug.v.perWallPct);
      ball.mul = ball.baseMul * (1 + ball.sc);
      api.fx.p.emit('boltHitArc', ball.x, ball.y, api.mgr.color('lightning'));
    });
  },

  /** 뇌성: 번개 효과도 치명타가 터지고, 번개 치명타 시 가까운 블록으로 한 갈래 더 (dmgPct) */
  lightning_resonance(api, aug) {
    api.bus.on(EV.HIT, (ctx) => {
      const s = ctx.source;
      if (s?.type !== 'lightning' || s.crit || s.ult) return;
      if (Math.random() < api.state.stats.critChance) { s.crit = true; ctx.damage *= api.state.stats.critDamage; }
    });
    api.bus.on(EV.AFTER_HIT, ({ cell, source }) => {
      if (source?.type !== 'lightning' || !source.crit || source.aug === 'lightning_resonance') return;
      const [b] = nearest(api, cell, 1);
      if (!b) return;
      api.fx.chain(cx(api, cell), cy(api, cell), cx(api, b), cy(api, b), api.mgr.color('lightning'));
      strike(api, b, aug.v.dmgPct, SRC('lightning_resonance'));
    });
  },

  /** 피뢰침: 턴 시작 시 바닥에서 rows 줄 안에 들어온 블록에 낙뢰 */
  lightning_lightningRod(api, aug) {
    api.bus.on(EV.TURN_START, () => {
      for (const b of api.grid.blocks().filter((c) => c.row >= api.grid.rows - aug.v.rows && !c.boss)) {
        bolt(api, b, aug.v.dmgPct, SRC('lightning_lightningRod'));
      }
    });
  },
};
