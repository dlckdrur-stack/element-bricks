import fireData from '../data/augments/fire.json';
import lightningData from '../data/augments/lightning.json';
import darkData from '../data/augments/dark.json';
import duoData from '../data/augments/duo.json';
import iceData from '../data/augments/ice.json';
import draftCfg from '../data/draft.json';
import balance from '../data/balance.json';
import { fxCfg } from '../fx/config.js';
import { EV } from '../core/events.js';
import { hex } from '../core/color.js';
import { isAugUnlocked } from '../meta/tiers.js';
import * as fire from './fire.js';
import * as lightning from './lightning.js';
import * as dark from './dark.js';
import * as duo from './duo.js';
import * as ice from './ice.js';

// 속성 추가 시: data/augments/{el}.json + augments/{el}.js 를 여기 등록
const ELEMENT_DATA = [fireData, lightningData, darkData, iceData, duoData];
const MODULES = { fire, lightning, dark, ice, duo };

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
    this.counts = {};  // 속성별 보유 증강 수 (속성 집중)
    this.pure = false; // 한 속성만 가졌는가
    // 속성 집중: 그 속성 효과(불·번개·어둠 피해)는 같은 속성 증강 수만큼 강해짐
    api.bus.on(EV.HIT, (ctx) => {
      const el = ctx.source?.type;
      if (this.counts[el]) ctx.damage *= 1 + this.focusPct(el);
    });
    this.luck = api.bonus?.luck ?? draftCfg.luck;               // 영구 강화: 행운 단계
    this.choices = draftCfg.choices + (api.bonus?.choices ?? 0); // 영구 강화: 선택지 추가
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
    return (!def.feature || draftCfg.features[def.feature] === true) && isAugUnlocked(def); // 티어 클리어 해금
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
    const s = { ...(this.api.baseStats ?? balance.stats) }; // 영구 강화가 반영된 기본 능력치
    for (const aug of this.owned.values()) MODULES[aug.def.element].stats?.(aug, s, this);
    this.counts = {};
    for (const aug of this.owned.values()) {
      if (aug.def.tier !== 'duo') this.counts[aug.def.element] = (this.counts[aug.def.element] ?? 0) + 1;
    }
    const els = Object.keys(this.counts);
    this.pure = els.length === 1;
    s.ballDamageMul *= 1 + this.purePct; // 순수: 공 데미지도 증가
    this.api.state.stats = s;
  }

  /** 속성 집중: 같은 속성 증강 1개당 그 속성 효과 +perAugPct (최대 maxPct) */
  focusPct(el) {
    const f = draftCfg.focus;
    return Math.min(f.maxPct, f.perAugPct * (this.counts[el] ?? 0));
  }

  /** 순수(한 속성만): 공 데미지 +purePerAugPct × 개수 (최대 pureMaxPct) */
  get purePct() {
    if (!this.pure) return 0;
    const f = draftCfg.focus;
    return Math.min(f.pureMaxPct, f.purePerAugPct * this.owned.size);
  }

  /** 공 겉모습: 메인 속성 색 불꽃 + 보유 증강별 변화(fx default.json 의 ball.mods) */
  get ballFx() {
    if (!this.main) return null;
    const look = {
      color: this.elements[this.main].aura, trail: fxCfg.ball.elementTrails[this.main] ?? fxCfg.ball.elementTrail,
      armorColor: this.color('lightning'),
    };
    for (const id in fxCfg.ball.mods) if (this.has(id)) Object.assign(look, fxCfg.ball.mods[id]);
    return look;
  }

  color(element) { return this.elements[element]?.color ?? 0xffffff; }
}
