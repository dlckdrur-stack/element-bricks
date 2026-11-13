import fireData from '../data/augments/fire.json';
import lightningData from '../data/augments/lightning.json';
import draftCfg from '../data/draft.json';
import balance from '../data/balance.json';
import { fxCfg } from '../fx/config.js';
import { EV } from '../core/events.js';
import { hex } from '../core/color.js';
import * as fire from './fire.js';
import * as lightning from './lightning.js';

// 속성 추가 시: data/augments/{el}.json + augments/{el}.js 를 여기 등록
const ELEMENT_DATA = [fireData, lightningData];
const MODULES = { fire, lightning };

/**
 * 보유 증강·메인/서브 속성·수치 계산.
 * aug = { def, grade, v, state }  v = 등급·속성 보너스가 반영된 현재 수치 (재계산 시 같은 객체를 갱신)
 * api = { scene, bus, grid, state, fx, theme, mgr }  ← 효과 코드(fire.js 등)가 받는 것
 */
export class AugmentManager {
  constructor(api) {
    this.api = api;
    api.mgr = this;
    this.defs = new Map();
    this.elements = {};
    for (const el of ELEMENT_DATA) {
      this.elements[el.element] = { color: hex(el.color), aura: hex(el.auraColor) };
      for (const a of el.augments) {
        this.defs.set(a.id, { gradeKeys: [], bonusKeys: [], intKeys: [], ...a, element: el.element });
      }
    }
    this.owned = new Map();
    this.main = null;
    this.sub = null;
    this.noPrism = 0; // 프리즘 천장 카운터
    this.recompute();
  }

  has(id) { return this.owned.has(id); }

  /** 보유 증강 수치. 없으면 fallback */
  val(id, key, fallback = 0) {
    const a = this.owned.get(id);
    return a ? a.v[key] : fallback;
  }

  /** 아직 게임에 없는 기능(재화·특수 블록)이 필요한 증강은 선택지에서 제외 */
  isAvailable(def) {
    return !def.feature || draftCfg.features[def.feature] === true;
  }

  elementStatus(element) {
    if (element && element === this.main) return 'main';
    if (element && element === this.sub) return 'sub';
    return null;
  }

  /** 등급 배율 + (메인·서브면) 속성 보너스를 반영한 수치 */
  valuesFor(def, grade, bonusOn) {
    const mul = grade ? draftCfg.grades[grade].mul : 1;
    const out = {};
    for (const k in def.values) {
      let x = def.values[k];
      if (def.gradeKeys.includes(k)) x *= mul;
      if (bonusOn && def.bonusKeys.includes(k)) x *= 1 + draftCfg.elementBonus;
      if (def.intKeys.includes(k)) x = Math.round(x);
      out[k] = x;
    }
    return out;
  }

  add(id, grade = null) {
    const def = this.defs.get(id);
    if (!def || this.owned.has(id)) return null;
    if (def.tier === 'core') {
      if (!this.main) this.main = def.element;
      else if (!this.sub && def.element !== this.main) this.sub = def.element;
    }
    const aug = { def, grade, v: {}, state: {} };
    this.owned.set(id, aug);
    this.recompute();
    MODULES[def.element].handlers[id]?.(this.api, aug);
    this.api.bus.emit(EV.AUGMENT, { aug });
    return aug;
  }

  recompute() {
    for (const aug of this.owned.values()) {
      const bonusOn = this.elementStatus(aug.def.element) !== null;
      Object.assign(aug.v, this.valuesFor(aug.def, aug.grade, bonusOn));
    }
    const s = { ...balance.stats };
    for (const aug of this.owned.values()) MODULES[aug.def.element].stats?.(aug, s, this);
    this.api.state.stats = s;
  }

  /** 공 겉모습: 메인 속성 색 불꽃 + 보유 증강별 변화(fx default.json 의 ball.mods) */
  get ballFx() {
    if (!this.main) return null;
    const look = {
      color: this.elements[this.main].aura, trail: fxCfg.ball.elementTrail,
      armorColor: this.color('lightning'),
    };
    for (const id in fxCfg.ball.mods) if (this.has(id)) Object.assign(look, fxCfg.ball.mods[id]);
    return look;
  }

  color(element) { return this.elements[element]?.color ?? 0xffffff; }
}
