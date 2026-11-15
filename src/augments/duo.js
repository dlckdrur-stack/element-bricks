import { EV } from '../core/events.js';
import { strike, cx, cy, nearest, isBallHit } from './helpers.js';
import { explode, addBurn } from './fire.js';
import { freeze } from './ice.js';
import { crack } from './earth.js';
import { bind } from './grass.js';
import duoData from '../data/augments/duo.json';

/**
 * 🤝 듀오 증강 (불+번개 9종). 만렙 확장 레벨(11·12)에서만, 내 핵심 조합에 맞는 것만 나온다.
 * 원칙: 한 속성의 효과가 다른 속성의 효과를 발동시킨다. 수치는 data/augments/duo.json
 */
const fromRail = (s) => s?.aug === 'lightning_railgun';
const fromChain = (s) => s?.aug === 'lightning_chain';
const fromPierce = (s) => s?.aug === 'lightning_pierce' && s.center; // 뇌격 방전 중심

export function stats() {}

export const handlers = {
  /** 뇌폭: 연쇄 번개가 튄 블록에서 폭발 */
  duo_thunderBlast(api, aug) {
    api.bus.on(EV.AFTER_HIT, ({ cell, source }) => { if (fromChain(source)) explode(api, cell.col, cell.row, aug.v.dmgPct, 1); });
  },
  /** 폭렬 레일: 레일건이 맞힌 블록마다 폭발 */
  duo_railBlast(api, aug) {
    api.bus.on(EV.AFTER_HIT, ({ cell, source }) => { if (fromRail(source)) explode(api, cell.col, cell.row, aug.v.dmgPct, 1); });
  },
  /** 방전 폭뢰: 뇌격 방전이 터진 블록에서 폭발 */
  duo_pierceBlast(api, aug) {
    api.bus.on(EV.AFTER_HIT, ({ cell, source }) => { if (fromPierce(source)) explode(api, cell.col, cell.row, aug.v.dmgPct, 1); });
  },
  /** 전도 화상: 연쇄 번개가 맞힌 블록에 화상 */
  duo_shockBurn(api, aug) {
    api.bus.on(EV.AFTER_HIT, ({ cell, source, killed }) => { if (fromChain(source) && !killed) addBurn(api, cell, aug.v.stacks); });
  },
  /** 열선: 레일건이 지나간 블록에 화상 */
  duo_heatRay(api, aug) {
    api.bus.on(EV.AFTER_HIT, ({ cell, source, killed }) => { if (fromRail(source) && !killed) addBurn(api, cell, aug.v.stacks); });
  },
  /** 작열 방전: 방전 맞은 블록에 화상, 화상 블록은 방전 피해 증가 */
  duo_searPierce(api, aug) {
    api.bus.on(EV.HIT, (ctx) => { if (fromPierce(ctx.source) && ctx.cell.burn) ctx.damage *= 1 + aug.v.burnBonusPct; });
    api.bus.on(EV.AFTER_HIT, ({ cell, source, killed }) => { if (fromPierce(source) && !killed) addBurn(api, cell, aug.v.stacks); });
  },
  /** 폭풍 불덩이: 불덩이 공 치명타 시 번개가 사방으로, 연쇄 번개 피해 증가 */
  duo_stormball(api, aug) {
    api.bus.on(EV.HIT, (ctx) => { if (fromChain(ctx.source)) ctx.damage *= 1 + aug.v.chainBonusPct; });
    api.bus.on(EV.AFTER_HIT, ({ cell, source }) => {
      if (!isBallHit(source) || !source.crit) return;
      for (const b of nearest(api, cell, aug.v.targets)) {
        api.fx.chain(cx(api, cell), cy(api, cell), cx(api, b), cy(api, b), api.mgr.color('lightning'));
        strike(api, b, aug.v.dmgPct, { type: 'lightning', aug: 'duo_stormball' });
      }
    });
  },
  /** 태양 레일: 레일건 피해 증가 + 맞힌 블록마다 불꽃 */
  duo_solarRail(api, aug) {
    api.bus.on(EV.HIT, (ctx) => { if (fromRail(ctx.source)) ctx.damage *= 1 + aug.v.railBonusPct; });
    api.bus.on(EV.AFTER_HIT, ({ cell, source }) => {
      if (fromRail(source)) api.fx.elementHit(cx(api, cell), cy(api, cell), 'fire', `s${cell.col},${cell.row}`);
    });
  },
  /** 유성 방전: 방전 맞은 블록에 불꽃 */
  duo_meteorPierce(api, aug) {
    api.bus.on(EV.AFTER_HIT, ({ cell, source, killed }) => {
      if (!fromPierce(source) || killed) return;
      api.fx.elementHit(cx(api, cell), cy(api, cell), 'fire', `m${cell.col},${cell.row}`);
      strike(api, cell, aug.v.dmgPct, { type: 'fire', aug: 'duo_meteorPierce' });
    });
  },
};

// ---------- 자동 생성 듀오 126종: "A 핵심 효과가 맞힌 블록에 B 핵심 효과" ----------
const TRIG = duoData.triggers;
const typeOf = (id) => id.split('_')[0];

/** A 핵심의 발동 조건을 이번 타격이 만족하는가 */
function triggered(tr, from, aug, cell, source) {
  if (!source || String(source.aug ?? '').startsWith('duo_')) return false; // 듀오끼리 연쇄 방지
  if (tr.aug) return source.aug === from;
  if (!isBallHit(source)) return false;
  if (tr.pierce && !source.pierce) return false;
  if (tr.center && !source.center) return false;
  if (tr.clone && source.ball.extra !== 'shadow') return false;
  if (tr.frozen && !(cell.frozen > 0)) return false;
  if (tr.cracks && (cell.cracks ?? 0) < tr.cracks) return false;
  if (tr.bloomed && !source.ball.bloomed) return false;
  if (tr.every) { aug.state.n = (aug.state.n ?? 0) + 1; if (aug.state.n % tr.every) return false; }
  return true;
}

/** B 핵심의 효과를 그 블록에서 터뜨림 */
function proc(api, aug, cell) {
  const v = aug.v;
  const src = { type: typeOf(aug.def.to), aug: aug.def.id };
  const x = cx(api, cell);
  const y = cy(api, cell);
  const g = api.grid;
  switch (aug.def.to) {
    case 'fire_explosion': explode(api, cell.col, cell.row, v.dmgPct, 1); break;
    case 'fire_burn': if (!cell.dead) addBurn(api, cell, v.stacks); break;
    case 'fire_fireball': if (!cell.dead) strike(api, cell, v.dmgPct, src); break;
    case 'lightning_chain':
    case 'grass_seed':
      for (const b of nearest(api, cell, v.targets)) {
        api.fx.chain(x, y, cx(api, b), cy(api, b), api.mgr.color(src.type));
        strike(api, b, v.dmgPct, src);
      }
      break;
    case 'lightning_railgun': if (!cell.dead) { api.fx.bolt(x, g.top, y, api.mgr.color('lightning')); strike(api, cell, v.dmgPct, src); } break;
    case 'lightning_pierce': for (const dr of [-1, 1]) { const b = g.blockAt(cell.col, cell.row + dr); if (b) strike(api, b, v.dmgPct, src); } break;
    case 'dark_clone':
      aug.state.c = (aug.state.c ?? 0) + 1;
      if (aug.state.c % v.every === 0) api.scene.balls.spawnExtra({ x, y, vx: 0, vy: -1 }, (Math.random() - 0.5) * 80, v.mulPct, v.hits, 'shadow', api.mgr.color('dark'));
      break;
    case 'dark_blackhole':
      api.fx.blackhole(x, y, api.mgr.color('dark'), 0.6);
      for (const b of g.around(cell.col, cell.row, 1)) strike(api, b, v.dmgPct, src);
      break;
    case 'dark_blade': for (let i = 0; i < v.count && !cell.dead; i++) strike(api, cell, v.dmgPct, src); break;
    case 'ice_glacier': if (!cell.dead && !cell.boss) { freeze(api, cell, v.turns); g.damage(cell, cell.maxHp * v.maxHpPct, src); } break;
    case 'ice_shatter': if (!cell.dead) { if (cell.frozen > 0) strike(api, cell, v.dmgPct, src); else freeze(api, cell, 1); } break;
    case 'ice_spear': if (!cell.dead) strike(api, cell, v.dmgPct, src); break;
    case 'earth_drill': { const b = g.blockAt(cell.col, cell.row + 1); if (b) strike(api, b, v.dmgPct, src); break; }
    case 'earth_crack': if (!cell.dead) crack(api, cell, v.cracks); break;
    case 'earth_quake': for (const b of g.blocks().filter((c) => c.col === cell.col && !c.boss)) strike(api, b, v.dmgPct, src); break;
    case 'grass_vine': if (!cell.boss) bind(api, cell, v.turns, 0); break;
    case 'grass_tree': {
      const tree = api.mgr.owned.get('grass_tree');
      if (tree) tree.state.stack = Math.min(tree.v.maxPct, (tree.state.stack ?? 0) + v.perPct);
      break;
    }
    default:
  }
}

/** 자동 생성 듀오 공용 처리 (AugmentManager 가 handlers 에 없을 때 부름). 같은 칸은 한 프레임 1번 */
export function generic(api, aug) {
  const tr = TRIG[aug.def.from];
  api.bus.on(EV.AFTER_HIT, ({ cell, source }) => {
    if (!tr || !triggered(tr, aug.def.from, aug, cell, source)) return;
    if (!api.fx.once(`d${aug.def.id}${cell.col},${cell.row}`)) return;
    proc(api, aug, cell);
  });
}
