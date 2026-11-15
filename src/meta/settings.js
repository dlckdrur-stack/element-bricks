import cfg from '../data/settings.json';
import { getProfile, commitProfile } from './save.js';

export const settingsCfg = cfg;

/** 현재 환경설정 (저장값 + 기본값) */
export function getSettings() {
  const p = getProfile();
  p.settings = { ...cfg.defaults, ...p.settings };
  return p.settings;
}

/** 하나 바꾸고 바로 저장 (판 밖의 설정 화면에서만 호출) */
export function setSetting(key, value) {
  getSettings()[key] = value;
  commitProfile();
}

/** 환경설정 → 이펙트 엔진에 적용 */
export function applyFxSettings(fx) {
  const s = getSettings();
  fx.setQuality(s.quality);
  fx.setSize(s.size);
  fx.juice.shakeEnabled = s.shake;
  fx.juice.flashEnabled = s.flash;
  fx.nums.mode = s.numbers;
}
