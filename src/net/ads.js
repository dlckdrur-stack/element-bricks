import { getProfile } from '../meta/save.js';

/**
 * 광고 자리 (앱 단계에서 AdMob 등 플러그인을 붙인다). 오프라인이거나 웹이면 광고 없이 그냥 진행.
 *   showRewarded(placement) → Promise<{ ok }>   보상형 (부활 등)
 *   showInterstitial()      → Promise<void>      판 사이 전면 광고 (광고 제거 구매 시 안 나옴)
 */
export const adsRemoved = () => !!getProfile().noAds;

export function isAvailable() {
  return false; // 웹 버전: 광고 SDK 없음
}

export function showRewarded(placement) {
  return Promise.resolve({ ok: false, placement, reason: 'unavailable' });
}

export function showInterstitial() {
  return Promise.resolve();
}
