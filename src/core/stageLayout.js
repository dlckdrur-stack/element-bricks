import balance from '../data/balance.json';

/** 후반 체력 배율 (기획서: 1~30 ×1, 31~60 직선 증가해 60에서 ×3, 61~ ×3×1.1^(s−60)) */
export function hpMultiplier(stage, s = balance.hpScale) {
  if (stage <= s.flatUntil) return 1;
  if (stage <= s.rampUntil) {
    const t = (stage - s.flatUntil) / (s.rampUntil - s.flatUntil);
    return 1 + (s.rampTarget - 1) * t;
  }
  return s.rampTarget * Math.pow(s.lateGrowth, stage - s.rampUntil);
}

/** 스테이지 기본 체력 (재화 계산에는 배율 없는 stage 를 쓸 것) */
export function stageHp(stage) {
  return Math.max(1, Math.round(stage * hpMultiplier(stage)));
}

function tierFor(stage, tiers) {
  let tier = tiers[0];
  for (const t of tiers) if (stage >= t.from) tier = t;
  return tier;
}

function randInt(min, max, rng) {
  return min + Math.floor(rng() * (max - min + 1));
}

function shuffled(n, rng) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 스테이지 → 새로 생길 맨 윗줄 구성. 스테이지별 블록 구성은 이 함수 하나에서만 정한다.
 * 보스 스테이지·특수 블록·런 모드 테이블은 나중에 여기서 분기하면 된다.
 *
 * @returns {Array<null | {kind:'block', hp:number, double:boolean} | {kind:'orb'}>} 길이 = cols
 */
export function buildStageRow(stage, cols, rng = Math.random) {
  const cfg = balance.blocks;
  const tier = tierFor(stage, cfg.countByStage);
  const count = Math.min(cols - 1, randInt(tier.min, tier.max, rng)); // 구슬 자리 1칸은 남김
  const order = shuffled(cols, rng);
  const hp = stageHp(stage);
  const row = new Array(cols).fill(null);

  for (let i = 0; i < count; i++) {
    const double = rng() < cfg.doubleChance;
    // base = 기본 체력(스테이지 숫자). 깨면 이만큼 재화
    row[order[i]] = { kind: 'block', hp: double ? hp * cfg.doubleMultiplier : hp, double, base: stage };
  }
  if (rng() < balance.orb.chance) row[order[count]] = { kind: 'orb' };
  return row;
}
