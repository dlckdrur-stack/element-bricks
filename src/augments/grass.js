import { EV } from '../core/events.js';
import { strike, cx, cy, nearest, isBallHit, later } from './helpers.js';
import { stageHp } from '../core/stageLayout.js';
import { t } from '../ui/i18n.js';

/**
 * 🌿 풀 증강 (실버 클리어 시 해금). 수치는 data/augments/grass.json, 여기는 효과만.
 * 풀의 "회복"은 위험한 블록을 덩굴로 묶어 그 열을 멈추는 것 (grid.held).
 */
const SRC = (aug, extra) => ({ type: 'grass', aug, ...extra });
const leaf = (api, b) => api.fx.elementHit(cx(api, b), cy(api, b), 'grass', `g${b.col},${b.row}`);
const blocks = (api) => api.grid.blocks().filter((b) => !b.boss);
const OTHER = ['fire', 'lightning', 'dark', 'ice', 'earth'];

export function stats(aug, s) {
  if (aug.def.id === 'grass_growth' && aug.state.grow) {
    s.ballScale += aug.state.grow;
    s.ballDamageMul *= 1 + aug.state.grow * aug.v.dmgShare; // 커진 만큼 데미지 (절반 이하)
  }
}

/**
 * 풀의 공 데미지 보너스(나무·새싹·광합성·무럭무럭)는 곱하지 않고 더한 뒤 한 번만 곱한다.
 * (곱으로 겹치면 풀 빌드만 수 배가 되어 밸런스가 무너짐)
 */
function ballBonus(api, key, fn) {
  if (!api.grassBonus) {
    api.grassBonus = new Map();
    api.bus.on(EV.HIT, (ctx) => {
      if (!isBallHit(ctx.source)) return;
      let sum = 0;
      for (const f of api.grassBonus.values()) sum += f();
      if (sum) ctx.damage *= 1 + sum;
    });
  }
  api.grassBonus.set(key, fn);
}

/** 묶기: 그 블록의 열을 turns 턴 멈춤 + 최대 체력 비율 피해 */
function bind(api, b, turns, pct, src) {
  api.grid.held[b.col] = Math.max(api.grid.held[b.col], turns);
  leaf(api, b);
  if (pct) api.grid.damage(b, b.maxHp * pct, src);
}

/** 씨앗·꽃 (격자 밖 표시). 줄과 함께 한 칸씩 내려감 */
function makeGarden(api, aug) {
  const g = api.grid;
  const list = [];
  const color = api.mgr.color('grass');
  const view = (f) => {
    f.img ??= api.scene.add.image(0, 0, 'fx', 'star').setDepth(12).setTint(color);
    const open = f.age >= f.bloomAt;
    f.img.setPosition(g.centerX(f.col), g.centerY(f.row)).setScale(open ? 0.7 : 0.3).setAlpha(open ? 1 : 0.6);
  };
  api.bus.on(EV.KILL, ({ cell, source }) => {
    if (!isBallHit(source) || list.some((f) => f.col === cell.col && f.row === cell.row)) return;
    const f = { col: cell.col, row: cell.row, age: 0, bloomAt: Math.max(0, aug.v.bloomTurns - api.mgr.val('grass_bloom', 'reduce', 0)) };
    list.push(f);
    view(f);
  });
  api.bus.on(EV.TURN_START, () => {
    for (let i = list.length - 1; i >= 0; i--) {
      const f = list[i];
      f.age++;
      if (g.halt === 0) f.row++;
      if (f.row >= g.rows || f.age > aug.v.lifeTurns) { f.img?.destroy(); list.splice(i, 1); } else view(f);
    }
  });
  // 꽃에 닿은 공은 그 발사 동안 +bonusPct (공마다 한 번)
  api.fx.addTicker(() => {
    const r2 = (g.cellW * 0.45) ** 2;
    for (const b of api.scene.balls.active) {
      if (b.bloomed) continue;
      for (const f of list) {
        if (f.age < f.bloomAt) continue;
        if ((b.x - g.centerX(f.col)) ** 2 + (b.y - g.centerY(f.row)) ** 2 > r2) continue;
        b.bloomed = true;
        b.mul *= 1 + aug.v.bonusPct;
        api.fx.p.emit('leafBurst', b.x, b.y, color);
        break;
      }
    }
  });
  return list;
}

export const handlers = {
  /** 각성 「세계수」: need 턴마다 턴 시작 시 반드시. 모든 블록 다음 턴 속박 + dmgPct, buffTurns 턴 동안 블록이 받는 모든 피해 +buffPct */
  grass_worldTree(api, aug) {
    aug.state.count = 0;
    aug.state.buff = 0;
    api.bus.on(EV.HIT, (ctx) => { if (aug.state.buff > 0) ctx.damage *= 1 + aug.v.buffPct; });
    api.bus.on(EV.TURN_START, () => {
      if (aug.state.buff > 0) aug.state.buff--;
      if (++aug.state.count < aug.v.need) return;
      aug.state.count = 0;
      const c = api.fx.cfg.ult.worldTree;
      api.fx.ultGeneric('worldTree', t('aug.grass_worldTree.name'), t('ult.sub'));
      api.grid.halt = Math.max(api.grid.halt, aug.v.holdTurns);
      aug.state.buff = aug.v.buffTurns;
      later(api, c.startDelay, () => {
        const g = api.grid;
        api.fx.ultFinale('worldTree', api.scene.scale.width / 2, g.top + g.rows * g.cellH);
        const dmg = stageHp(api.state.stage) * aug.v.dmgPct;
        for (const b of g.blocks()) {
          api.fx.ultCell('worldTree', cx(api, b), cy(api, b));
          g.damage(b, dmg, SRC('grass_worldTree', { ult: true }));
        }
      });
    });
  },

  /** 덩굴 속박: 스테이지×hitsPerStage 타(최소 minHits)마다 가장 아래 블록 count 개를 turns 턴 묶음 + 최대 체력 피해 */
  grass_vine(api, aug) {
    aug.state.hits = 0;
    api.bus.on(EV.AFTER_HIT, ({ source }) => {
      if (!isBallHit(source)) return;
      if (++aug.state.hits < Math.max(aug.v.minHits, api.state.stage * aug.v.hitsPerStage)) return;
      aug.state.hits = 0;
      const n = aug.v.count + api.mgr.val('grass_deepRoots', 'extra', 0);
      const wild = api.mgr.val('grass_wildGrowth', 'dmgPct', 0);
      for (const b of blocks(api).sort((a, c) => c.row - a.row).slice(0, n)) {
        bind(api, b, aug.v.turns, aug.v.maxHpPct, SRC('grass_vine'));
        if (wild) for (const x of api.grid.around(b.col, b.row, 1)) strike(api, x, wild, SRC('grass_wildGrowth'));
      }
    });
  },

  /** 씨앗: 공으로 깬 자리에 씨앗 → bloomTurns 턴 뒤 꽃, 꽃에 닿은 공 +bonusPct */
  grass_seed(api, aug) {
    const garden = makeGarden(api, aug);
    const pollen = () => api.mgr.owned.get('grass_pollen');
    api.bus.on(EV.TURN_START, () => {
      const p = pollen();
      if (!p) return;
      for (const f of garden) {
        if (f.age < f.bloomAt) continue;
        for (const b of nearest(api, f, p.v.count)) {
          api.fx.chain(api.grid.centerX(f.col), api.grid.centerY(f.row), cx(api, b), cy(api, b), api.mgr.color('grass'));
          strike(api, b, p.v.dmgPct, SRC('grass_pollen'));
        }
      }
    });
  },

  /** 생명의 나무: 매 턴 공 데미지 +perPct 누적 (최대 maxPct). 고목이면 더 빠르게, 수관이면 증강 효과에도 */
  grass_tree(api, aug) {
    aug.state.stack = 0;
    api.bus.on(EV.TURN_START, () => {
      const old = api.mgr.owned.get('grass_ancient')?.v;
      aug.state.stack = Math.min(old?.maxPct ?? aug.v.maxPct, aug.state.stack + (old?.perPct ?? aug.v.perPct));
    });
    ballBonus(api, 'tree', () => aug.state.stack);
    api.bus.on(EV.HIT, (ctx) => {
      if (!isBallHit(ctx.source)) ctx.damage *= 1 + aug.state.stack * api.mgr.val('grass_canopy', 'sharePct', 0);
    });
  },

  /** 공생: 풀이 아닌 속성 효과 피해 +dmgPct */
  grass_symbiosis(api, aug) {
    api.bus.on(EV.HIT, (ctx) => { if (OTHER.includes(ctx.source?.type)) ctx.damage *= 1 + aug.v.dmgPct; });
  },

  /** 새싹의 축복: 레벨업할 때마다 공 데미지 +perLevelPct */
  grass_sprout(api, aug) {
    aug.state.n = 0;
    api.bus.on(EV.LEVEL_UP, () => { aug.state.n++; });
    ballBonus(api, 'sprout', () => aug.v.perLevelPct * aug.state.n);
  },

  /** 광합성: 이번 턴 깬 블록 1개당 다음 턴 공 데미지 +perKillPct (최대 maxPct) */
  grass_photosynthesis(api, aug) {
    let kills = 0;
    let bonus = 0;
    api.bus.on(EV.KILL, () => { kills++; });
    api.bus.on(EV.TURN_START, () => { bonus = Math.min(aug.v.maxPct, kills * aug.v.perKillPct); kills = 0; });
    ballBonus(api, 'photo', () => bonus);
  },

  /** 풍요: 재화 +currencyPct, 경험치 +xpPct */
  grass_abundance(api, aug) {
    api.bus.on(EV.KILL, (ctx) => {
      ctx.currencyBonus += aug.v.currencyPct;
      ctx.xp = (ctx.xp ?? 1) * (1 + aug.v.xpPct);
    });
  },

  /** 무럭무럭: 공이 맞힐 때마다 공 크기 +perHitPct (최대 maxPct), 커질수록 데미지도. 그 판 동안 유지 */
  grass_growth(api, aug) {
    aug.state.grow = 0;
    api.bus.on(EV.AFTER_HIT, ({ source }) => {
      if (isBallHit(source)) aug.state.grow = Math.min(aug.v.maxPct, aug.state.grow + aug.v.perHitPct);
    });
    api.bus.on(EV.TURN_END, () => api.mgr.recompute()); // 다음 발사부터 커진 공
  },

  /** 가시덤불: 묶인 열의 블록이 맞으면 가시가 주변 1칸에 dmgPct */
  grass_thorns(api, aug) {
    api.bus.on(EV.AFTER_HIT, ({ cell, source }) => {
      if (!isBallHit(source) || !(api.grid.held[cell.col] > 0)) return;
      for (const b of api.grid.around(cell.col, cell.row, 1)) { leaf(api, b); strike(api, b, aug.v.dmgPct, SRC('grass_thorns')); }
    });
  },

  /** 웃자람: every 턴마다 맨 아래 줄에 뿌리가 솟아 dmgPct + 1턴 묶음 */
  grass_overgrowth(api, aug) {
    aug.state.turns = 0;
    api.bus.on(EV.TURN_START, () => {
      if (++aug.state.turns % aug.v.every) return;
      for (const b of api.grid.lowestRow()) { bind(api, b, 1, 0); strike(api, b, aug.v.dmgPct, SRC('grass_overgrowth')); }
    });
  },

  /** 흡수: 블록 every 개를 깰 때마다 공 데미지 +gain */
  grass_leech(api, aug) {
    aug.state.kills = 0;
    api.bus.on(EV.KILL, () => {
      if (++aug.state.kills < aug.v.every) return;
      aug.state.kills = 0;
      api.state.damage += aug.v.gain;
      api.scene.look.flareUp('orb');
    });
  },

  /** 열매: 블록 kills 개를 깰 때마다 그 자리에 데미지 구슬 */
  grass_fruit(api, aug) {
    aug.state.kills = 0;
    api.bus.on(EV.KILL, ({ cell }) => {
      if (++aug.state.kills < aug.v.kills || cell.boss || api.grid.cells[cell.row][cell.col]) return;
      aug.state.kills = 0;
      api.grid.placeAt(cell.col, cell.row, { kind: 'orb' });
    });
  },

  /** 아침 이슬: 턴 시작 시 체력이 가장 낮은 블록 count 개에 dmgPct */
  grass_dew(api, aug) {
    api.bus.on(EV.TURN_START, () => {
      for (const b of blocks(api).sort((a, c) => a.hp - c.hp).slice(0, aug.v.count)) { leaf(api, b); strike(api, b, aug.v.dmgPct, SRC('grass_dew')); }
    });
  },

  /** 포자: 블록이 깨지면 주변 1칸에 dmgPct, 다음 턴 시작에도 한 번 더 */
  grass_spore(api, aug) {
    let spots = [];
    const burst = (col, row) => { for (const b of api.grid.around(col, row, 1)) strike(api, b, aug.v.dmgPct, SRC('grass_spore')); };
    api.bus.on(EV.KILL, ({ cell, source }) => {
      if (source?.aug === 'grass_spore') return;
      burst(cell.col, cell.row);
      spots.push({ col: cell.col, row: cell.row + 1 });
    });
    api.bus.on(EV.TURN_START, () => { for (const s of spots) burst(s.col, s.row); spots = []; });
  },
};
