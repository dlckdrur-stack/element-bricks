import { EV } from '../core/events.js';
import { strike, cx, cy, randomBlocks, isBallHit, ultimateGauge, later } from './helpers.js';
import { stageHp } from '../core/stageLayout.js';
import { t } from '../ui/i18n.js';

/**
 * 🪨 땅 증강 (브론즈 클리어 시 해금). 수치는 data/augments/earth.json, 여기는 효과만.
 * 균열: cell.cracks 개수만큼 받는 모든 피해 +perPct. 관통(드릴)은 stats() → BallSystem.
 */
const SRC = (aug, extra) => ({ type: 'earth', aug, ...extra });
const rock = (api, b) => api.fx.elementHit(cx(api, b), cy(api, b), 'earth', `e${b.col},${b.row}`);
const blocks = (api) => api.grid.blocks().filter((b) => !b.boss);

export function stats(aug, s, mgr) {
  const v = aug.v;
  switch (aug.def.id) {
    case 'earth_drill': s.pierce += v.pierce + mgr.val('earth_steelDrill', 'extra', 0); break;
    case 'earth_bore': s.pierceBonus += v.bonusPct; break;
    case 'earth_weight': s.ballScale += v.sizePct; break;
    case 'earth_bedrock': s.ballScale += v.sizePct; s.ballDamageMul *= 1 + v.dmgPct; break;
    default:
  }
}

/** 균열 추가 (최대치까지) */
function crack(api, cell, n) {
  if (!cell || cell.dead) return;
  const v = api.mgr.owned.get('earth_crack')?.v;
  const max = (v?.max ?? 5) + api.mgr.val('earth_deepCrack', 'extraMax', 0);
  cell.cracks = Math.min(max, (cell.cracks ?? 0) + n);
}

/** 한 열의 블록 전부 */
const column = (api, col) => blocks(api).filter((b) => b.col === col);

export const handlers = {
  /** 각성 「대지진」: 벽 튕김 need 번마다. 블록이 많은 열 cols 개가 갈라지며 colPct, 나머지 otherPct, turns 턴 받는 피해 +vulnPct */
  earth_greatQuake(api, aug) {
    api.bus.on(EV.HIT, (ctx) => { if (ctx.cell.quaked > 0) ctx.damage *= 1 + aug.v.vulnPct; });
    api.bus.on(EV.TURN_END, () => { for (const b of api.grid.blocks()) if (b.quaked > 0) b.quaked--; });
    ultimateGauge(api, aug, EV.WALL_BOUNCE, () => true, () => {
      const c = api.fx.cfg.ult.greatQuake;
      api.fx.ultGeneric('greatQuake', t('aug.earth_greatQuake.name'), t('ult.sub'));
      later(api, c.startDelay, () => {
        const g = api.grid;
        api.fx.ultFinale('greatQuake', api.scene.scale.width / 2, g.top + g.rows * g.cellH);
        const byCol = {};
        for (const b of blocks(api)) byCol[b.col] = (byCol[b.col] ?? 0) + 1;
        const cols = Object.keys(byCol).sort((a, b) => byCol[b] - byCol[a]).slice(0, aug.v.cols).map(Number);
        const hp = stageHp(api.state.stage);
        for (const b of api.grid.blocks()) {
          const main = cols.includes(b.col);
          if (main) api.fx.ultCell('greatQuake', cx(api, b), cy(api, b));
          b.quaked = aug.v.turns;
          api.grid.damage(b, hp * (main ? aug.v.colPct : aug.v.otherPct), SRC('earth_greatQuake', { ult: true }));
        }
      });
      return c.startDelay + c.finaleTime;
    });
  },

  /** 균열: 공 타격마다 균열 +1(+균열 확장), 균열 1개당 받는 모든 피해 +perPct */
  earth_crack(api, aug) {
    api.bus.on(EV.HIT, (ctx) => { if (ctx.cell.cracks) ctx.damage *= 1 + aug.v.perPct * ctx.cell.cracks; });
    api.bus.on(EV.AFTER_HIT, ({ cell, source, killed }) => {
      if (isBallHit(source) && !killed) crack(api, cell, 1 + api.mgr.val('earth_fracture', 'extra', 0));
    });
  },

  /** 지진: 턴 끝에 맨 아래 줄(+여진) 전체에 공 데미지 × 공 개수 × ballPct */
  earth_quake(api, aug) {
    api.bus.on(EV.TURN_END, () => {
      const list = blocks(api);
      if (!list.length) return;
      const low = Math.max(...list.map((b) => b.row));
      const rows = aug.v.rows + api.mgr.val('earth_aftershock', 'extraRows', 0);
      const tremor = api.mgr.val('earth_tremor', 'dmgPct', 0);
      api.fx.juice.shake('mid');
      for (const b of list.filter((x) => x.row > low - rows)) {
        rock(api, b);
        strike(api, b, aug.v.ballPct * api.state.ballCount, SRC('earth_quake'));
        if (tremor) for (const up of column(api, b.col).filter((x) => x.row < b.row)) strike(api, up, tremor, SRC('earth_tremor'));
      }
    });
  },

  /** 바위 파편: 블록을 깨면 양옆에 파편 */
  earth_rubble(api, aug) {
    api.bus.on(EV.KILL, ({ cell, source }) => {
      if (source?.aug === 'earth_rubble') return;
      for (const dc of [-1, 1]) {
        const b = api.grid.blockAt(cell.col + dc, cell.row);
        if (b) { rock(api, b); strike(api, b, aug.v.dmgPct, SRC('earth_rubble')); }
      }
    });
  },

  /** 방패 분쇄: 땅 효과에 맞은 방패 블록·강철 엘리트는 그 특성을 영구히 잃음 */
  earth_shieldBreak(api) {
    api.bus.on(EV.AFTER_HIT, ({ cell, source, killed }) => {
      if (killed || source?.type !== 'earth') return;
      if (cell.special !== 'guard' && cell.elite !== 'steel') return;
      cell.special = cell.special === 'guard' ? null : cell.special;
      cell.elite = cell.elite === 'steel' ? null : cell.elite;
      if (!cell.elite && !cell.special) { cell.icon = null; cell.fixedColor = null; }
      rock(api, cell);
      api.grid.refreshBlock(cell);
    });
  },

  /** 침식: 모든 타격에 최대 체력의 maxHpPct 추가 (엘리트 절반, 보스는 스테이지 체력 기준) */
  earth_erosion(api, aug) {
    api.bus.on(EV.HIT, (ctx) => {
      const c = ctx.cell;
      const base = c.boss ? stageHp(api.state.stage) : c.maxHp * (c.elite ? 0.5 : 1);
      ctx.damage += base * aug.v.maxHpPct;
    });
  },

  /** 산사태: every 턴마다 블록이 가장 많은 열 전체에 dmgPct */
  earth_landslide(api, aug) {
    aug.state.turns = 0;
    api.bus.on(EV.TURN_START, () => {
      if (++aug.state.turns % aug.v.every) return;
      const byCol = {};
      for (const b of blocks(api)) byCol[b.col] = (byCol[b.col] ?? 0) + 1;
      const [col] = Object.keys(byCol).sort((a, b) => byCol[b] - byCol[a]);
      if (col === undefined) return;
      api.fx.juice.shake('mid');
      for (const b of column(api, Number(col))) { rock(api, b); strike(api, b, aug.v.dmgPct, SRC('earth_landslide')); }
    });
  },

  /** 바위 굴리기: 공 hits 타마다 맨 아래 줄을 바위가 왼쪽부터 굴러가며 dmgPct */
  earth_boulder(api, aug) {
    aug.state.hits = 0;
    api.bus.on(EV.AFTER_HIT, ({ source }) => {
      if (!isBallHit(source) || ++aug.state.hits < aug.v.hits) return;
      aug.state.hits = 0;
      api.grid.lowestRow().sort((a, b) => a.col - b.col).forEach((b, i) => later(api, i * 0.06, () => {
        if (b.dead) return;
        rock(api, b);
        strike(api, b, aug.v.dmgPct, SRC('earth_boulder'));
      }));
    });
  },

  /** 단층: 블록이 깨지면 바로 아래 블록에 균열 cracks + dmgPct */
  earth_fault(api, aug) {
    api.bus.on(EV.KILL, ({ cell }) => {
      const b = api.grid.blockAt(cell.col, cell.row + 1);
      if (!b) return;
      crack(api, b, aug.v.cracks);
      rock(api, b);
      strike(api, b, aug.v.dmgPct, SRC('earth_fault'));
    });
  },

  /** 자갈: 공이 돌아올 때마다 맨 아래 줄 무작위 count 개에 dmgPct */
  earth_gravel(api, aug) {
    api.bus.on(EV.BALL_RETURN, () => {
      const row = api.grid.lowestRow();
      for (let i = 0; i < aug.v.count && row.length; i++) {
        const b = row.splice(Math.floor(Math.random() * row.length), 1)[0];
        rock(api, b);
        strike(api, b, aug.v.dmgPct, SRC('earth_gravel'));
      }
    });
  },

  /** 지각 변동: 벽 튕김 every 번마다 모든 블록에 dmgPct */
  earth_seismic(api, aug) {
    aug.state.n = 0;
    api.bus.on(EV.WALL_BOUNCE, () => {
      if (++aug.state.n < aug.v.every) return;
      aug.state.n = 0;
      api.fx.juice.shake('big');
      for (const b of randomBlocks(api, 99)) { rock(api, b); strike(api, b, aug.v.dmgPct, SRC('earth_seismic')); }
    });
  },

  /** 정동석: 균열 cracks 개 이상인 블록을 깨면 재화 +currencyPct, 경험치 +xp */
  earth_geode(api, aug) {
    api.bus.on(EV.KILL, (ctx) => {
      if ((ctx.cell.cracks ?? 0) < aug.v.cracks) return;
      ctx.currencyBonus += aug.v.currencyPct;
      ctx.xp = (ctx.xp ?? 1) + aug.v.xp;
    });
  },
};
