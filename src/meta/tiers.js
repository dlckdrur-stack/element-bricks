import data from '../data/tiers.json';
import { getProfile, commitProfile } from './save.js';

/**
 * 난이도 티어: 브론즈 → 실버 → 골드 → 플래티넘 → 다이아 → 챌린저.
 * 앞 티어를 깨야 다음 티어가 열리고, 티어를 처음 깨면 보상(증강·속성·각성·공명석)이 해금된다.
 * 수치는 data/tiers.json. 진행은 profile.tierCleared(깬 가장 높은 티어 번호, -1 = 없음)
 */
export const tierOrder = data.order;
export const tierScreen = data.screen;

export function getTier(id) {
  return { id, index: data.order.indexOf(id), ...data.list[id] };
}

export function clearedIndex() {
  return getProfile().tierCleared ?? -1;
}

export const isCleared = (id) => clearedIndex() >= data.order.indexOf(id);
export const isOpen = (id) => data.order.indexOf(id) <= clearedIndex() + 1;
export const isInfinite = (tier) => !tier.stages;

/** 지금까지 해금된 것 (깬 티어들의 보상 합) */
function unlocked() {
  const out = { augments: new Set(), elements: new Set(), tiers: new Set(), features: new Set() };
  data.order.forEach((id, i) => {
    if (i > clearedIndex()) return;
    const u = data.unlocks[data.list[id].unlock];
    if (!u) return;
    for (const a of u.augments ?? []) out.augments.add(a);
    if (u.element) out.elements.add(u.element);
    if (u.tier) out.tiers.add(u.tier);
    if (u.feature) out.features.add(u.feature);
  });
  return out;
}

/** 이 증강을 뽑을 수 있나 (잠긴 목록에 있으면 해당 티어 클리어 필요, 각성은 플래티넘 클리어 필요) */
export function isAugUnlocked(def) {
  const u = unlocked();
  for (const key in data.unlocks) {
    const x = data.unlocks[key];
    if (x.augments?.includes(def.id) && !u.augments.has(def.id)) return false;
    if (x.tier && def.tier === x.tier && !u.tiers.has(x.tier)) return false;
    if (x.element && def.element === x.element && !u.elements.has(x.element)) return false;
  }
  return true;
}

export const isFeatureUnlocked = (name) => unlocked().features.has(name);

/** 티어 클리어 기록. 처음 깬 거면 { first:true, reward:보상 키 } */
export function markCleared(id) {
  const p = getProfile();
  const i = data.order.indexOf(id);
  const first = i > clearedIndex();
  if (first) p.tierCleared = i;
  commitProfile();
  return { first, reward: first ? data.list[id].unlock : null, bonus: first ? data.list[id].clearBonus : 0 };
}
