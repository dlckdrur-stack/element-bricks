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

function weightsFor(level, mgr) {
  let w = draftCfg.categoryWeights[0];
  for (const x of draftCfg.categoryWeights) if (level >= x.fromLevel) w = x;
  if (!mgr.sub) w = { ...w, main: w.main + w.sub, sub: 0 }; // 서브 없이 집중하면 메인 속성이 더 자주
  return w;
}

/**
 * 레벨에 맞는 선택지.
 * kind 'main'  : 모든 속성 핵심 중 3개 (등급 없음)
 * kind 'sub'   : 메인이 아닌 속성의 핵심 중 3개 (등급 없음, 메인 속성은 안 나옴)
 * kind 'core'  : 11·16레벨. 메인·서브 속성의 남은 핵심
 * kind 'duo'   : 17레벨. 내 핵심 조합의 듀오 (없으면 각성 → 등급)
 * kind 'awaken': 18레벨. 메인·서브 속성의 각성 (플래티넘 클리어 후, 없으면 듀오 → 등급)
 * kind 'graded': 등급 1개를 뽑고, 같은 등급으로 메인·서브 속성 일반 증강 (메인 최대 caps.main, 서브 최대 caps.sub 개까지)
 * @returns {{ kind, grade, options: def[] }}
 */
export function buildChoices(kind, level, mgr, rng = Math.random) {
  const n = Math.min(draftCfg.maxChoices, mgr.choices ?? draftCfg.choices);
  const all = [...mgr.defs.values()].filter((d) => mgr.isAvailable(d) && !mgr.has(d.id));

  if (kind === 'main') {
    return { kind, grade: null, options: sample(all.filter((d) => d.tier === 'core'), n, rng) };
  }
  if (kind === 'sub') { // 메인이 아닌 속성의 핵심만 (메인을 또 고를 수 없음)
    return { kind, grade: null, options: sample(all.filter((d) => d.tier === 'core' && d.element !== mgr.main), n, rng) };
  }
  const cnt = mgr.pickCounts();
  const room = { main: cnt.main < draftCfg.caps.main, sub: cnt.sub < draftCfg.caps.sub }; // 메인 10 · 서브 5 (핵심 포함), 다른 속성은 안 나옴

  const mine = (d) => d.element === mgr.main || d.element === mgr.sub;
  if (kind === 'core') { // 11·16레벨: 메인·서브 속성의 남은 핵심
    const cores = all.filter((d) => d.tier === 'core' && mine(d) && room[categoryOf(d, mgr)]);
    if (cores.length) return { kind, grade: null, options: sample(cores, n, rng) };
  }
  const duos = all.filter((d) => d.tier === 'duo' && (d.requiresAll ?? []).every((id) => mgr.has(id)));
  const awakens = all.filter((d) => d.tier === 'awaken' && mine(d));
  if (kind === 'duo' && duos.length) return { kind, grade: null, options: sample(duos, n, rng) }; // 17레벨: 듀오
  if ((kind === 'duo' || kind === 'awaken') && awakens.length) return { kind: 'awaken', grade: null, options: sample(awakens, n, rng) }; // 18레벨: 각성 (듀오가 없으면 17에도)
  if (kind === 'awaken' && duos.length) return { kind: 'duo', grade: null, options: sample(duos, n, rng) };
  // 고를 핵심·듀오·각성이 없으면 일반 등급 선택으로

  const pool = all.filter((d) => !['core', 'awaken', 'duo'].includes(d.tier) && (!d.requires || mgr.has(d.requires))
    && room[categoryOf(d, mgr)]);
  if (!pool.length) return { kind, grade: null, options: [] };
  const grade = rollGrade(mgr, rng);

  const byCat = { main: [], sub: [], other: [], neutral: [] };
  for (const d of pool) byCat[categoryOf(d, mgr)].push(d);
  const weights = weightsFor(level, mgr);
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
  return { kind, grade, options: sample(picked, picked.length, rng) };
}

