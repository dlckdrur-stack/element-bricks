import { EV } from '../core/events.js';
import { strike, cx, cy, nearest, isBallHit } from './helpers.js';
import { explode, addBurn } from './fire.js';

/**
 * 🤝 듀오 증강 (불+번개 9종). 만렙 확장 레벨(11·12)에서만, 내 핵심 조합에 맞는 것만 나온다.
 * 원칙: 한 속성의 효과가 다른 속성의 효과를 발동시킨다. 수치는 data/augments/duo.json
 */
const fromRail = (s) => s?.aug === 'lightning_railgun';
const fromChain = (s) => s?.aug === 'lightning_chain';
const fromPierce = (s) => isBallHit(s) && s.pierce;

export function stats(aug, s) {
  if (aug.def.id === 'duo_meteorPierce') s.pierce += aug.v.extraPierce;
}

export const handlers = {
  /** 뇌폭: 연쇄 번개가 튄 블록에서 폭발 */
  duo_thunderBlast(api, aug) {
    api.bus.on(EV.AFTER_HIT, ({ cell, source }) => { if (fromChain(source)) explode(api, cell.col, cell.row, aug.v.dmgPct, 1); });
  },
  /** 폭렬 레일: 레일건이 맞힌 블록마다 폭발 */
  duo_railBlast(api, aug) {
    api.bus.on(EV.AFTER_HIT, ({ cell, source }) => { if (fromRail(source)) explode(api, cell.col, cell.row, aug.v.dmgPct, 1); });
  },
  /** 관통 폭뢰: 관통할 때마다 그 블록에서 폭발 */
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
  /** 작열 관통: 관통한 블록에 화상, 화상 블록은 관통 피해 증가 */
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
  /** 유성 관통: 관통 +2, 관통한 블록에 불꽃 */
  duo_meteorPierce(api, aug) {
    api.bus.on(EV.AFTER_HIT, ({ cell, source, killed }) => {
      if (!fromPierce(source) || killed) return;
      api.fx.elementHit(cx(api, cell), cy(api, cell), 'fire', `m${cell.col},${cell.row}`);
      strike(api, cell, aug.v.dmgPct, { type: 'fire', aug: 'duo_meteorPierce' });
    });
  },
};
