import { readKey, writeKey, removeKey, VERSION } from './save.js';

/**
 * 판 중간 저장 (이어하기). 턴이 끝나 새 줄이 내려온 직후 한 번, 바뀐 경우에만 쓴다.
 * 저장하는 것: 스테이지·공·데미지·발사 위치·레벨/경험치/대기 중인 선택·보유 증강(고른 순서)·격자·번 재화.
 * 화상 같은 블록별 증강 상태와 충전 카운터는 저장하지 않는다(이어하면 초기화).
 */
export const RUN_KEY = 'elementBricks.run';

export function loadRun() {
  const r = readKey(RUN_KEY);
  return r && r.version === VERSION && r.stage > 0 ? r : null;
}

export function hasRun() { return loadRun() !== null; }

export function clearRun() { removeKey(RUN_KEY); }

/** GameScene → 저장 데이터 */
export function saveRun(g) {
  const s = g.state;
  const lv = g.leveling;
  const mgr = g.augments;
  writeKey(RUN_KEY, {
    tier: g.tier.id,
    stage: s.stage,
    damage: s.damage,
    ballCount: s.ballCount,
    launchX: s.launchX,
    level: lv.level,
    xp: lv.xp,
    pending: lv.pending.slice(),
    augs: [...mgr.owned.values()].map((a) => ({ id: a.def.id, grade: a.grade })),
    noPrism: mgr.noPrism,
    earned: g.wallet.earned,
    bonusPct: g.wallet.bonusPct,
    rerolls: s.rerolls,
    startBest: g.startBest,
    cells: g.grid.snapshot(),
  });
}

/** 저장 데이터 → GameScene (시스템을 다 만든 뒤, 첫 턴 대신 호출) */
export function restoreRun(g, r) {
  const s = g.state;
  for (const a of r.augs) g.augments.add(a.id, a.grade); // 고른 순서대로 → 메인·서브 속성도 그대로
  g.augments.noPrism = r.noPrism;
  s.ballFx = g.augments.ballFx;
  Object.assign(s, { stage: r.stage, damage: r.damage, ballCount: r.ballCount, launchX: r.launchX });
  const lv = g.leveling;
  lv.level = r.level;
  lv.xp = r.xp;
  lv.pending = r.pending.slice();
  g.wallet.earned = r.earned;
  g.wallet.bonusPct = r.bonusPct ?? g.wallet.bonusPct;
  s.rerolls = r.rerolls ?? s.rerolls;
  g.startBest = r.startBest;
  g.grid.restore(r.cells);
}
