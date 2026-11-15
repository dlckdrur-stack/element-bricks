import { EV } from '../core/events.js';
import { strike, cx, cy, nearest, randomBlocks, isBallHit, ultimateGauge, later } from './helpers.js';
import { stageHp } from '../core/stageLayout.js';
import { t } from '../ui/i18n.js';

/** 🌑 어둠 증강 (골드 티어 클리어 시 해금). 수치는 data/augments/dark.json, 여기는 효과만. */

const SRC = (aug, extra) => ({ type: 'dark', aug, ...extra });

export function stats(aug, s) {
  if (aug.def.id === 'dark_eclipse' && aug.state.buff > 0) s.critChance += aug.v.critBuffPct; // 일월식 후 치명타 버프
}

const slash = (api, b) => api.fx.elementHit(cx(api, b), cy(api, b), 'dark', `d${b.col},${b.row}`);
const highest = (api) => api.grid.blocks().sort((a, b) => b.hp - a.hp)[0];
/** 화면 좌표 → 가장 가까운 블록 n개 */
const nearPoint = (api, x, y, n) => nearest(api, {
  col: Math.floor(x / api.grid.cellW), row: Math.floor((y - api.grid.top) / api.grid.cellH),
}, n);

function blackhole(api, col, row, size, pct, lowHpPct, extra) {
  const g = api.grid;
  const x = (col + size / 2) * g.cellW;
  const y = g.top + (row + size / 2) * g.cellH;
  api.fx.blackhole(x, y, api.mgr.color('dark'), size / 2);
  for (let r = row; r < row + size; r++) {
    for (let c = col; c < col + size; c++) {
      const b = g.blockAt(c, r);
      if (b) strike(api, b, pct * (1 + lowHpPct * (1 - b.hp / b.maxHp)), SRC('dark_blackhole', extra));
    }
  }
}

function setLabel(api, cell, color) {
  cell.labelColor = color;
  api.grid.refreshBlock(cell);
}

export const handlers = {
  /** 각성 「일월식」: 치명타 need 번마다. 체력 execPct 이하 처형, 나머지 스테이지 체력 × hitPct, 이후 buffTurns 턴 치명타 확률 ↑ */
  dark_eclipse(api, aug) {
    api.bus.on(EV.TURN_START, () => {
      if (aug.state.buff > 0 && --aug.state.buff === 0) api.mgr.recompute();
    });
    ultimateGauge(api, aug, EV.AFTER_HIT, ({ source }) => !!source?.crit, () => {
      const c = api.fx.cfg.ult.eclipse;
      api.fx.eclipseStart(t('aug.dark_eclipse.name'), t('ult.sub'));
      later(api, c.startDelay, () => {
        api.fx.eclipseFinale();
        const dmg = stageHp(api.state.stage) * aug.v.hitPct;
        for (const b of api.grid.blocks()) {
          if (!b.boss && b.hp <= b.maxHp * aug.v.execPct) {
            api.fx.eclipseExec(cx(api, b), cy(api, b));
            api.grid.damage(b, b.hp + 1, SRC('dark_eclipse', { ult: true }));
          } else api.grid.damage(b, dmg, SRC('dark_eclipse', { ult: true }));
        }
        aug.state.buff = aug.v.buffTurns;
        api.mgr.recompute();
      });
      return c.startDelay + c.finaleTime;
    });
  },

  /** 그림자 분신: 턴 첫 발사 때 공 개수의 ratio 만큼(최소 min) 분신, hits 번 맞히면 소멸 */
  dark_clone(api, aug) {
    let launched = false;
    api.bus.on(EV.TURN_START, () => { launched = false; });
    api.bus.on(EV.LAUNCH, ({ ball }) => {
      if (launched) return;
      launched = true;
      const n = Math.max(aug.v.min, Math.round(api.state.ballCount * aug.v.ratio)) + api.mgr.val('dark_legion', 'extra', 0);
      for (let i = 0; i < n; i++) {
        const ang = (i % 2 ? 1 : -1) * (8 + 6 * Math.floor(i / 2));
        api.scene.balls.spawnExtra(ball, ang, aug.v.dmgPct, aug.v.hits, 'shadow', api.mgr.color('dark'));
      }
    });
  },

  /** 거울상: 분신이 사라질 때 그 자리에서 칼날 폭발 */
  dark_mirror(api, aug) {
    api.bus.on(EV.EXTRA_GONE, ({ ball }) => {
      if (ball.extra !== 'shadow') return;
      for (const b of nearPoint(api, ball.x, ball.y, 3)) { slash(api, b); strike(api, b, aug.v.dmgPct, SRC('dark_mirror')); }
    });
  },

  /** 블랙홀: every 타마다 맞힌 자리에 size×size 블랙홀 */
  dark_blackhole(api, aug) {
    aug.state.hits = 0;
    api.bus.on(EV.AFTER_HIT, ({ cell, source }) => {
      if (!isBallHit(source) || ++aug.state.hits < aug.v.every) return;
      aug.state.hits = 0;
      const size = aug.v.size + api.mgr.val('dark_horizon', 'extraSize', 0);
      const low = api.mgr.val('dark_horizon', 'lowHpPct', 0);
      const col = Math.max(0, Math.min(api.grid.cols - size, cell.col - Math.floor(size / 2)));
      const row = Math.max(0, cell.row - Math.floor(size / 2));
      blackhole(api, col, row, size, aug.v.dmgPct, low);
      const sing = api.mgr.owned.get('dark_singularity');
      if (sing) later(api, sing.v.delay, () => blackhole(api, col, row, size, sing.v.dmgPct, low, { echo: true }));
    });
  },

  /** 그림자 칼날: 공 타격마다 칼날 count 회 추가 */
  dark_blade(api, aug) {
    api.bus.on(EV.AFTER_HIT, ({ cell, source, killed }) => {
      if (!isBallHit(source) || killed) return;
      const n = aug.v.count + api.mgr.val('dark_shadowstep', 'extraBlades', 0);
      for (let i = 0; i < n && !cell.dead; i++) { slash(api, cell); strike(api, cell, aug.v.dmgPct, SRC('dark_blade')); }
    });
  },

  /** 피의 칼날: 칼날이 블록을 깨면 가까운 블록으로 칼날이 튐 */
  dark_bloodBlade(api, aug) {
    api.bus.on(EV.KILL, ({ cell, source }) => {
      if (source?.aug !== 'dark_blade') return;
      const [b] = nearest(api, cell, 1);
      if (!b) return;
      const pct = api.mgr.val('dark_blade', 'dmgPct');
      for (let i = 0; i < aug.v.blades && !b.dead; i++) { slash(api, b); strike(api, b, pct, SRC('dark_bloodBlade')); }
    });
  },

  /** 암습: 어둠 효과도 치명타 (확률 = 치명타 확률 + critChancePct) */
  dark_ambush(api, aug) {
    api.bus.on(EV.HIT, (ctx) => {
      const s = ctx.source;
      if (s?.type !== 'dark' || s.crit || s.ult) return;
      if (Math.random() < api.state.stats.critChance + aug.v.critChancePct) {
        s.crit = true;
        ctx.damage *= api.state.stats.critDamage;
      }
    });
  },

  /** 처형: 체력 thresholdPct 이하가 되면 즉시 처치 (엘리트는 eliteThresholdPct, 보스 제외) */
  dark_execute(api, aug) {
    api.bus.on(EV.AFTER_HIT, ({ cell, source, killed }) => {
      if (killed || cell.boss || source?.aug === 'dark_execute') return;
      const th = cell.elite ? aug.v.eliteThresholdPct : aug.v.thresholdPct;
      if (cell.hp > cell.maxHp * th) return;
      slash(api, cell);
      api.grid.damage(cell, cell.hp + 1, SRC('dark_execute'));
    });
  },

  /** 표식: 매 턴 체력이 가장 높은 블록이 받는 피해 +bonusPct */
  dark_mark(api, aug) {
    let marked = null;
    api.bus.on(EV.TURN_START, () => {
      if (marked && !marked.dead) setLabel(api, marked, null);
      marked = highest(api);
      if (marked && !marked.boss) setLabel(api, marked, api.theme.accent);
    });
    api.bus.on(EV.HIT, (ctx) => { if (ctx.cell === marked) ctx.damage *= 1 + aug.v.bonusPct; });
  },

  /** 흡혼: 어둠 효과로 every 개 처치할 때마다 공 데미지 +gain */
  dark_soulDrain(api, aug) {
    aug.state.kills = 0;
    api.bus.on(EV.KILL, ({ source }) => {
      if (source?.type !== 'dark' || ++aug.state.kills < aug.v.every) return;
      aug.state.kills = 0;
      api.state.damage += aug.v.gain;
      api.scene.look.flareUp('orb');
    });
  },

  /** 공허 전이: 깨고 남은 초과 피해를 가장 가까운 블록으로 */
  dark_void(api, aug) {
    api.bus.on(EV.KILL, ({ cell, source, overkill }) => {
      if (overkill <= 0 || source?.aug === 'dark_void') return;
      const [b] = nearest(api, cell, 1);
      if (!b) return;
      api.fx.chain(cx(api, cell), cy(api, cell), cx(api, b), cy(api, b), api.mgr.color('dark'));
      api.grid.damage(b, overkill * aug.v.transferPct, SRC('dark_void'));
    });
  },

  /** 저주: 공에 맞은 블록은 그 턴 동안 받는 모든 피해 +dmgPct */
  dark_curse(api, aug) {
    api.bus.on(EV.AFTER_HIT, ({ cell, source }) => { if (isBallHit(source)) cell.cursed = api.state.stage; });
    api.bus.on(EV.HIT, (ctx) => { if (ctx.cell.cursed === api.state.stage) ctx.damage *= 1 + aug.v.dmgPct; });
  },

  /** 밤의 장막: 턴 시작 시 무작위 블록 count 개를 그림자로 덮음. 공에 맞으면 터져 주변 dmgPct */
  dark_nightfall(api, aug) {
    api.bus.on(EV.TURN_START, () => {
      for (const b of randomBlocks(api, aug.v.count)) { b.shadowed = true; setLabel(api, b, '#c99bff'); }
    });
    api.bus.on(EV.AFTER_HIT, ({ cell, source }) => {
      if (!cell.shadowed || !isBallHit(source)) return;
      cell.shadowed = false;
      if (!cell.dead) setLabel(api, cell, null);
      api.fx.blackhole(cx(api, cell), cy(api, cell), api.mgr.color('dark'), 0.7);
      for (const b of api.grid.around(cell.col, cell.row, 1)) strike(api, b, aug.v.dmgPct, SRC('dark_nightfall'));
    });
  },

  /** 사신의 낫: 블록을 깰 때마다 다음 공 타격 +stackPct (최대 maxStacks 중첩) */
  dark_reaper(api, aug) {
    aug.state.stacks = 0;
    api.bus.on(EV.KILL, () => { aug.state.stacks = Math.min(aug.v.maxStacks, aug.state.stacks + 1); });
    api.bus.on(EV.HIT, (ctx) => {
      if (!isBallHit(ctx.source) || !aug.state.stacks) return;
      ctx.damage *= 1 + aug.v.stackPct * aug.state.stacks;
      aug.state.stacks = 0;
      slash(api, ctx.cell);
    });
  },

  /** 그림자 벽: 공이 벽에 튕길 때 가장 가까운 블록에 그림자 칼날 */
  dark_shadowWall(api, aug) {
    api.bus.on(EV.WALL_BOUNCE, ({ ball }) => {
      const [b] = nearPoint(api, ball.x, ball.y, 1);
      if (!b) return;
      api.fx.chain(ball.x, ball.y, cx(api, b), cy(api, b), api.mgr.color('dark'));
      slash(api, b);
      strike(api, b, aug.v.dmgPct, SRC('dark_shadowWall'));
    });
  },

  /** 심연: 한 턴에 kills 개 이상 깨면 턴 끝에 맨 아래 줄의 체력 thresholdPct 이하 블록 처형 */
  dark_abyss(api, aug) {
    aug.state.kills = 0;
    api.bus.on(EV.TURN_START, () => { aug.state.kills = 0; });
    api.bus.on(EV.KILL, () => { aug.state.kills++; });
    api.bus.on(EV.TURN_END, () => {
      if (aug.state.kills < aug.v.kills) return;
      for (const b of api.grid.lowestRow()) {
        if (b.hp > b.maxHp * aug.v.thresholdPct) continue;
        api.fx.blackhole(cx(api, b), cy(api, b), api.mgr.color('dark'), 0.6);
        api.grid.damage(b, b.hp + 1, SRC('dark_abyss'));
      }
    });
  },

  /** 망령: 공으로 깬 블록 자리에 망령이 남아 다음 턴 시작 시 가장 가까운 블록으로 날아감 */
  dark_wraith(api, aug) {
    let ghosts = [];
    api.bus.on(EV.KILL, ({ cell, source }) => { if (isBallHit(source)) ghosts.push({ col: cell.col, row: cell.row + 1 }); });
    api.bus.on(EV.TURN_START, () => {
      for (const gh of ghosts) {
        const [b] = nearest(api, gh, 1);
        if (!b) continue;
        api.fx.chain(api.grid.centerX(gh.col), api.grid.centerY(gh.row), cx(api, b), cy(api, b), api.mgr.color('dark'));
        strike(api, b, aug.v.dmgPct, SRC('dark_wraith'));
      }
      ghosts = [];
    });
  },
};
