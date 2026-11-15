import { EV } from '../core/events.js';
import { strike, cx, cy, nearest, randomBlocks, isBallHit, later, wallOk } from './helpers.js';
import { stageHp } from '../core/stageLayout.js';
import { t } from '../ui/i18n.js';

/**
 * ❄️ 얼음 증강 (처음부터). 수치는 data/augments/ice.json, 여기는 효과만.
 * 얼음 상태: cell.frozen = 남은 턴 (시안색). 턴 끝마다 1씩 줄고 0이 되면 onThaw. 보스는 얼지 않음.
 * 하강을 막는 건 빙하기·절대영도뿐 (grid.halt).
 */
const SRC = (aug, extra) => ({ type: 'ice', aug, ...extra });
const isFrozen = (c) => c.frozen > 0;
const iceHit = (api, b) => api.fx.elementHit(cx(api, b), cy(api, b), 'ice', `i${b.col},${b.row}`);

/** 얼림 (혹한이면 +턴). 녹는 처리는 판마다 한 번만 등록 */
export function freeze(api, cell, turns) {
  if (!cell || cell.dead || cell.boss) return;
  cell.frozen = Math.max(cell.frozen ?? 0, turns + api.mgr.val('ice_deepCold', 'extraTurns', 0));
  api.grid.refreshBlock(cell);
  if (api.iceTick) return;
  api.iceTick = true;
  api.bus.on(EV.TURN_END, () => {
    for (const b of api.grid.blocks()) {
      if (!isFrozen(b)) continue;
      if (--b.frozen === 0) api.bus.emit(EV.THAW, { cell: b });
      api.grid.refreshBlock(b);
    }
  });
}

/** 최대 체력 비율 피해 (보스는 스테이지 체력 기준) */
function maxHpHit(api, b, pct, src) {
  api.grid.damage(b, (b.boss ? stageHp(api.state.stage) : b.maxHp) * pct, src);
}

/** 얼음창: 블록이 가장 많은 열을 아래에서 위로 관통 */
function spear(api, aug, col) {
  const g = api.grid;
  const list = g.blocks().filter((b) => b.col === col && !b.boss).sort((a, b) => b.row - a.row);
  if (!list.length) return;
  const x = g.centerX(col);
  const bottom = g.top + g.rows * g.cellH;
  api.fx.railgun(`ice${col}`, x, bottom, x, g.top, api.mgr.color('ice'), list.map((b) => ({ x, y: cy(api, b) })));
  const lance = api.mgr.val('ice_glacialLance', 'bonusPct', 0);
  for (const b of list) {
    strike(api, b, aug.v.dmgPct * (isFrozen(b) ? 1 + lance : 1), SRC('ice_spear'));
    freeze(api, b, 1);
  }
}

export const handlers = {
  /** 각성 「절대영도」: 블록이 바닥 rows 줄 안에 들어온 턴 시작 시 반드시 발동 (발동 후 cooldown 턴 대기) */
  ice_absoluteZero(api, aug) {
    aug.state.count = 0;
    let wait = 0;
    api.bus.on(EV.HIT, (ctx) => { if (ctx.cell.deepFreeze && isFrozen(ctx.cell)) ctx.damage *= 1 + aug.v.bonusPct; });
    api.bus.on(EV.TURN_START, () => {
      if (wait > 0) { wait--; return; }
      const low = Math.max(-1, ...api.grid.blocks().filter((b) => !b.boss).map((b) => b.row));
      if (low < api.grid.rows - aug.v.rows) return;
      wait = aug.v.cooldown;
      const c = api.fx.cfg.ult.absoluteZero;
      api.fx.ultGeneric('absoluteZero', t('aug.ice_absoluteZero.name'), t('ult.sub'));
      api.grid.halt = Math.max(api.grid.halt, aug.v.haltTurns);
      later(api, c.startDelay, () => {
        api.fx.ultFinale('absoluteZero', api.scene.scale.width / 2, api.grid.centerY(api.grid.rows - 2));
        const dmg = stageHp(api.state.stage) * aug.v.hitPct;
        for (const b of api.grid.blocks()) {
          api.fx.ultCell('absoluteZero', cx(api, b), cy(api, b));
          b.deepFreeze = true;
          freeze(api, b, aug.v.freezeTurns);
          api.grid.damage(b, dmg, SRC('ice_absoluteZero', { ult: true }));
        }
      });
    });
  },

  /** 빙하기: 스테이지×hitsPerStage 타(최소 minHits) 충전 → 다음 턴 하강 정지 + 맨 아래 rows 줄 얼림 + 최대 체력 피해 */
  ice_glacier(api, aug) {
    aug.state.hits = 0;
    let cool = false;
    api.bus.on(EV.TURN_START, () => { cool = false; });
    api.bus.on(EV.AFTER_HIT, ({ source }) => {
      if (!isBallHit(source) || cool) return;
      const need = Math.max(aug.v.minHits, api.state.stage * aug.v.hitsPerStage) * (1 - api.mgr.val('ice_permafrost', 'reducePct', 0));
      if (++aug.state.hits < need) return;
      aug.state.hits = 0;
      cool = true; // 연속 발동 불가
      api.grid.halt = Math.max(api.grid.halt, 1);
      const low = Math.max(0, ...api.grid.blocks().map((b) => b.row));
      api.fx.juice.flash('white');
      api.fx.juice.shake('big');
      for (const b of api.grid.blocks().filter((x) => x.row > low - aug.v.rows && !x.boss)) {
        iceHit(api, b);
        freeze(api, b, aug.v.turns);
        maxHpHit(api, b, aug.v.maxHpPct, SRC('ice_glacier'));
      }
      const heart = api.mgr.owned.get('ice_coldHeart');
      if (heart) for (const b of api.grid.blocks()) strike(api, b, heart.v.dmgPct, SRC('ice_coldHeart'));
    });
  },

  /** 동결 파쇄: 같은 블록을 hits 번 맞히면 turns 턴 얼림, 얼어 있는 블록 공 타격 +bonusPct */
  ice_shatter(api, aug) {
    api.bus.on(EV.HIT, (ctx) => { if (isBallHit(ctx.source) && isFrozen(ctx.cell)) ctx.damage *= 1 + aug.v.bonusPct; });
    api.bus.on(EV.AFTER_HIT, ({ cell, source, killed }) => {
      if (!isBallHit(source) || killed) return;
      const need = Math.max(1, aug.v.hits - api.mgr.val('ice_flashFreeze', 'hitsReduce', 0));
      cell.iceHits = (cell.iceHits ?? 0) + 1;
      if (cell.iceHits < need) return;
      cell.iceHits = 0;
      iceHit(api, cell);
      freeze(api, cell, aug.v.turns);
    });
  },

  /** 수정 파편: 얼어 있는 블록이 공에 맞으면 주변 1칸에 파편 */
  ice_crystal(api, aug) {
    api.bus.on(EV.AFTER_HIT, ({ cell, source }) => {
      if (!isBallHit(source) || !isFrozen(cell)) return;
      for (const b of api.grid.around(cell.col, cell.row, 1)) strike(api, b, aug.v.dmgPct, SRC('ice_crystal'));
    });
  },

  /** 얼음창: every 턴마다 블록이 가장 많은 열(+빙창 세례 개수)을 관통, 맞은 블록 얼림 */
  ice_spear(api, aug) {
    aug.state.turns = 0;
    api.bus.on(EV.TURN_START, () => {
      if (++aug.state.turns % aug.v.every) return;
      const n = 1 + api.mgr.val('ice_spearRain', 'extra', 0);
      const byCol = {};
      for (const b of api.grid.blocks()) if (!b.boss) byCol[b.col] = (byCol[b.col] ?? 0) + 1;
      const cols = Object.keys(byCol).sort((a, b) => byCol[b] - byCol[a]).slice(0, n);
      for (const col of cols) spear(api, aug, Number(col));
    });
  },

  /** 동상: 얼어 있는 블록이 받는 모든 피해 +dmgPct */
  ice_frostbite(api, aug) {
    api.bus.on(EV.HIT, (ctx) => { if (isFrozen(ctx.cell)) ctx.damage *= 1 + aug.v.dmgPct; });
  },

  /** 산산조각: 얼어 있는 블록이 깨지면 주변에 파편 */
  ice_shards(api, aug) {
    api.bus.on(EV.KILL, ({ cell }) => {
      if (!isFrozen(cell)) return;
      iceHit(api, cell);
      for (const b of api.grid.around(cell.col, cell.row, 1)) strike(api, b, aug.v.dmgPct, SRC('ice_shards'));
    });
  },

  /** 혹한: 얼림 +1턴(freeze 에서), 공 타격 시 chancePct 확률로 즉시 1턴 얼림 */
  ice_deepCold(api, aug) {
    api.bus.on(EV.AFTER_HIT, ({ cell, source, killed }) => {
      if (isBallHit(source) && !killed && Math.random() < aug.v.chancePct) freeze(api, cell, 1);
    });
  },

  /** 최후의 방벽: 바닥 바로 위 두 줄의 블록에 데미지 +dmgPct */
  ice_lastStand(api, aug) {
    api.bus.on(EV.HIT, (ctx) => { if (ctx.cell.row >= api.grid.rows - 2) ctx.damage *= 1 + aug.v.dmgPct; });
  },

  /** 한파: 턴 시작 시 무작위 count 개 블록에 서리 (1턴 얼림 + dmgPct) */
  ice_coldSnap(api, aug) {
    api.bus.on(EV.TURN_START, () => {
      for (const b of randomBlocks(api, aug.v.count)) { iceHit(api, b); freeze(api, b, 1); strike(api, b, aug.v.dmgPct, SRC('ice_coldSnap')); }
    });
  },

  /** 눈사태: 블록 kills 개를 깰 때마다 위 2줄 전체에 눈사태 + 얼림 */
  ice_avalanche(api, aug) {
    aug.state.kills = 0;
    api.bus.on(EV.KILL, ({ source }) => {
      if (source?.aug === 'ice_avalanche' || ++aug.state.kills < aug.v.kills) return;
      aug.state.kills = 0;
      const top = Math.min(...api.grid.blocks().map((b) => b.row));
      api.fx.juice.shake('mid');
      for (const b of api.grid.blocks().filter((x) => x.row <= top + 1 && !x.boss)) {
        iceHit(api, b);
        freeze(api, b, 1);
        strike(api, b, aug.v.dmgPct, SRC('ice_avalanche'));
      }
    });
  },

  /** 얼음 거울: 얼어 있는 블록에 공이 맞으면 가장 가까운 블록으로 냉기가 반사 */
  ice_mirrorIce(api, aug) {
    api.bus.on(EV.AFTER_HIT, ({ cell, source }) => {
      if (!isBallHit(source) || !isFrozen(cell)) return;
      const [b] = nearest(api, cell, 1);
      if (!b) return;
      api.fx.chain(cx(api, cell), cy(api, cell), cx(api, b), cy(api, b), api.mgr.color('ice'));
      strike(api, b, aug.v.dmgPct, SRC('ice_mirrorIce'));
    });
  },

  /** 눈보라: every 턴마다 모든 블록에 dmgPct + 1턴 얼림 */
  ice_blizzard(api, aug) {
    aug.state.turns = 0;
    api.bus.on(EV.TURN_START, () => {
      if (++aug.state.turns % aug.v.every) return;
      for (const b of api.grid.blocks()) { iceHit(api, b); freeze(api, b, 1); strike(api, b, aug.v.dmgPct, SRC('ice_blizzard')); }
    });
  },

  /** 고드름: 공이 천장에 튕길 때 그 열 맨 위 블록에 고드름 (공 1개당 maxPerBall 번) */
  ice_icicle(api, aug) {
    api.bus.on(EV.WALL_BOUNCE, ({ ball, side }) => {
      if (side !== 'top' || !wallOk(ball, aug)) return;
      const col = Math.floor(ball.x / api.grid.cellW);
      const [b] = api.grid.blocks().filter((x) => x.col === col).sort((a, c) => a.row - c.row);
      if (!b) return;
      api.fx.bolt(cx(api, b), api.grid.top, cy(api, b), api.mgr.color('ice'));
      freeze(api, b, 1);
      strike(api, b, aug.v.dmgPct, SRC('ice_icicle'));
    });
  },

  /** 냉기 축적: 얼어 있는 블록 1개당 공 데미지 +perPct (최대 maxPct) */
  ice_chillAura(api, aug) {
    api.bus.on(EV.HIT, (ctx) => {
      if (!isBallHit(ctx.source)) return;
      const n = api.grid.blocks().filter(isFrozen).length;
      ctx.damage *= 1 + Math.min(aug.v.maxPct, aug.v.perPct * n);
    });
  },

  /** 해빙 폭발: 얼음이 녹는 순간 그 블록에 dmgPct */
  ice_thaw(api, aug) {
    api.bus.on(EV.THAW, ({ cell }) => {
      if (cell.dead) return;
      iceHit(api, cell);
      strike(api, cell, aug.v.dmgPct, SRC('ice_thaw'));
    });
  },
};
