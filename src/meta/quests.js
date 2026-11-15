import data from '../data/quests.json';
import fire from '../data/augments/fire.json';
import lightning from '../data/augments/lightning.json';
import dark from '../data/augments/dark.json';
import ice from '../data/augments/ice.json';
import earth from '../data/augments/earth.json';
import grass from '../data/augments/grass.json';
import { getProfile, commitProfile } from './save.js';
import { isAugUnlocked } from './tiers.js';
import { today } from './attendance.js';

/**
 * 일일 퀘스트 (오프라인). 날짜 번호로 시드를 정해 그날 perDay 개를 뽑는다 → 하루 동안 같은 퀘스트.
 * profile.quests = { day, list: [{ type, n, reward, el?, aug?, progress, claimed }], bonus }
 * 진행은 판 안에서 questHooks.js 가 올린다.
 */
export const questData = data;

/** 날짜 시드 난수 (mulberry32) */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** 지금 쓸 수 있는(해금된) 핵심 증강 */
function cores() {
  const out = [];
  for (const el of [fire, lightning, dark, ice, earth, grass]) {
    for (const a of el.augments) if (a.tier === 'core' && isAugUnlocked({ ...a, element: el.element })) out.push({ id: a.id, element: el.element });
  }
  return out;
}

function generate(day) {
  const rng = seeded(day * 7919);
  const pool = [...data.templates];
  const list = [];
  const cs = cores();
  while (list.length < data.perDay && pool.length) {
    const sum = pool.reduce((s, q) => s + q.weight, 0);
    let x = rng() * sum;
    const i = Math.max(0, pool.findIndex((q) => (x -= q.weight) <= 0));
    const q = pool.splice(i, 1)[0];
    const n = Math.round(q.n[0] + rng() * (q.n[1] - q.n[0]));
    const pick = cs[Math.floor(rng() * cs.length)];
    const e = { type: q.id, n, reward: q.reward, progress: 0, claimed: false };
    if (q.id === 'mainEl') e.el = pick.element;
    if (q.id === 'useAug') e.aug = pick.id;
    list.push(e);
  }
  return { day, list, bonus: false };
}

/** 오늘의 퀘스트 (날짜가 바뀌면 새로) */
export function quests() {
  const p = getProfile();
  const d = today();
  if (!p.quests || p.quests.day !== d) p.quests = generate(d);
  return p.quests;
}

export const isDone = (q) => q.progress >= q.n;
export const canClaimAny = () => { const s = quests(); return s.list.some((q) => isDone(q) && !q.claimed) || canClaimBonus(); };
export const canClaimBonus = () => { const s = quests(); return !s.bonus && s.list.every((q) => q.claimed); };

/** 보상 받기 (i = 퀘스트 번호, 'bonus' = 모두 완료 보너스) → 받은 재화 */
export function claimQuest(i) {
  const s = quests();
  const p = getProfile();
  let n = 0;
  if (i === 'bonus') {
    if (!canClaimBonus()) return 0;
    s.bonus = true;
    n = data.allClearBonus;
  } else {
    const q = s.list[i];
    if (!q || q.claimed || !isDone(q)) return 0;
    q.claimed = true;
    n = q.reward;
  }
  p.currency += n;
  commitProfile();
  return n;
}
