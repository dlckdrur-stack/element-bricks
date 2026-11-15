import draftCfg from '../data/draft.json';

function sample(arr, n, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/** 행운 단계 표 + 프리즘 천장 */
export function rollGrade(mgr, rng = Math.random) {
  const rows = draftCfg.luckTable;
  const row = rows.find((r) => r.luck === (mgr.luck ?? draftCfg.luck)) ?? rows[0];
  let grade;
  if (mgr.noPrism >= row.pity) grade = 'prism';
  else {
    const x = rng();
    grade = x < row.prism ? 'prism' : x < row.prism + row.gold ? 'gold' : 'silver';
  }
  mgr.noPrism = grade === 'prism' ? 0 : mgr.noPrism + 1;
  return grade;
}

function categoryOf(def, mgr) {
  if (!def.element) return 'neutral';
  return mgr.elementStatus(def.element) ?? 'other';
}

function weightsFor(level) {
  let w = draftCfg.categoryWeights[0];
  for (const x of draftCfg.categoryWeights) if (level >= x.fromLevel) w = x;
  return w;
}

/**
 * 레벨에 맞는 선택지.
 * kind 'main'  : 모든 속성 핵심 중 3개 (등급 없음)
 * kind 'sub'   : 메인이 아닌 속성의 핵심 중 3개 (등급 없음)
 * kind 'graded': 등급 1개를 뽑고, 같은 등급으로 일반 증강 3개 (메인·서브 최소 1개 보장, 각성 조건이면 각성 1장 확정)
 * @returns {{ kind, grade, options: def[] }}
 */
export function buildChoices(kind, level, mgr, rng = Math.random) {
  const n = Math.min(draftCfg.maxChoices, mgr.choices ?? draftCfg.choices);
  const all = [...mgr.defs.values()].filter((d) => mgr.isAvailable(d) && !mgr.has(d.id));

  if (kind === 'main' || kind === 'sub') {
    const cores = all.filter((d) => d.tier === 'core' && (kind === 'main' || d.element !== mgr.main));
    return { kind, grade: null, options: sample(cores, n, rng) };
  }

  const pool = all.filter((d) => d.tier !== 'core' && d.tier !== 'awaken' && (!d.requires || mgr.has(d.requires)));
  if (!pool.length) return { kind, grade: null, options: [] };
  const grade = rollGrade(mgr, rng);

  const byCat = { main: [], sub: [], other: [], neutral: [] };
  for (const d of pool) byCat[categoryOf(d, mgr)].push(d);
  const weights = weightsFor(level);
  const picked = [];

  while (picked.length < n) {
    const cats = Object.keys(byCat).filter((c) => byCat[c].length && weights[c] > 0);
    const fallback = Object.keys(byCat).filter((c) => byCat[c].length);
    const use = cats.length ? cats : fallback;
    if (!use.length) break;
    const total = use.reduce((s, c) => s + (weights[c] || 1), 0);
    let x = rng() * total;
    let cat = use[use.length - 1];
    for (const c of use) { x -= weights[c] || 1; if (x <= 0) { cat = c; break; } }
    const list = byCat[cat];
    picked.push(list.splice(Math.floor(rng() * list.length), 1)[0]);
  }

  // 메인·서브 증강 최소 1개 보장
  const isMine = (d) => ['main', 'sub'].includes(categoryOf(d, mgr));
  const spare = [...byCat.main, ...byCat.sub];
  if (picked.length && !picked.some(isMine) && spare.length) {
    picked[picked.length - 1] = spare[Math.floor(rng() * spare.length)];
  }
  // 각성: 같은 속성 증강을 awakenNeed 개 이상 모으면 그 속성 각성 증강이 확정으로 1장
  const aw = awakenReady(mgr, all);
  if (aw && picked.length) picked[0] = aw;
  return { kind, grade, options: sample(picked, picked.length, rng) };
}

/** 조건을 채운 각성 증강 (아직 안 가진 것 중 첫 번째) */
export function awakenReady(mgr, available) {
  const count = {};
  for (const a of mgr.owned.values()) {
    if (a.def.tier !== 'awaken') count[a.def.element] = (count[a.def.element] ?? 0) + 1;
  }
  return available.find((d) => d.tier === 'awaken' && (count[d.element] ?? 0) >= draftCfg.awakenNeed) ?? null;
}
