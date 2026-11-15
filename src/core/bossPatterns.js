import cfg from '../data/bosses.json';

/**
 * 보스 패턴. 각 패턴은 필요한 것만 가진다.
 *   spawn(boss, g)  등장할 때        turn(boss, g)  보스 턴마다(턴 시작)
 *   update(boss, g, dt) 매 프레임     bonus(boss, src) → 추가 피해 조건을 맞췄으면 true
 *   guard(boss, g) → true 면 피해 무효(보호막)
 * g = { grid, state, fx, now(), rng, stageHp() }
 * 공 정보: src.ball.walls(벽 튕긴 수), src.nx/ny(맞은 면의 바깥 방향)
 */
const isBall = (src) => src?.type === 'ball' && src.ball;

function sideOf(src) {
  const { nx = 0, ny = 0 } = src;
  if (ny > 0.5) return 'bottom';
  if (ny < -0.5) return 'top';
  if (nx < -0.5) return 'left';
  if (nx > 0.5) return 'right';
  return null;
}

export const patterns = {
  /** 약점 면: 빛나는 면으로 맞혀야 추가 피해. 턴마다 약점이 바뀜 */
  weakSide: {
    spawn(b) { b.weak = cfg.weakSide.sides[0]; },
    turn(b, g) {
      const sides = cfg.weakSide.sides.filter((s) => s !== b.weak);
      b.weak = sides[Math.floor(g.rng() * sides.length)];
    },
    bonus: (b, src) => isBall(src) && sideOf(src) === b.weak,
  },

  /** 반사: 벽을 need 번 이상 튕긴 공만 추가 피해 */
  bounce3: {
    bonus: (b, src) => isBall(src) && src.ball.walls >= cfg.bounce3.need,
  },

  /** 일직선: 벽을 한 번도 안 튕긴 공만 추가 피해 */
  straight: {
    bonus: (b, src) => isBall(src) && src.ball.walls === 0,
  },

  /** 소환: 등장할 때와 보스 턴마다 보스 아래 줄에 단단한 블록 */
  summon: {
    spawn(b, g) { patterns.summon.turn(b, g); },
    turn(b, g) {
      const c = cfg.summon;
      const free = [];
      for (let col = 0; col < g.grid.cols; col++) if (!g.grid.cells[c.row][col]) free.push(col);
      for (let i = 0; i < c.count && free.length; i++) {
        const col = free.splice(Math.floor(g.rng() * free.length), 1)[0];
        g.grid.placeAt(col, c.row, { kind: 'block', hp: Math.ceil(g.stageHp() * c.hpMul), double: false, base: 0 });
      }
    },
  },

  /** 회복: 보스 턴마다 최대 체력의 일부 회복 */
  heal: {
    turn(b) { b.hp = Math.min(b.maxHp, b.hp + b.maxHp * cfg.heal.pct); },
  },

  /** 순간이동: every 초마다 무작위 위치로. 이동 직후 window 초 안에 맞히면 추가 피해 */
  teleport: {
    spawn(b) { b.tpT = cfg.teleport.every; b.tpAt = -99; },
    update(b, g, dt) {
      b.tpT -= dt;
      if (b.tpT > 0) return;
      b.tpT = cfg.teleport.every;
      const col = Math.floor(g.rng() * (g.grid.cols - b.cols + 1));
      const row = Math.floor(g.rng() * (cfg.teleport.maxRow + 1));
      b.moveTo(col, row);
      b.tpAt = g.now();
    },
    bonus: (b, src, g) => isBall(src) && g.now() - b.tpAt <= cfg.teleport.window,
  },

  /** 분열: 깨질 때마다 작아져서 다른 자리에 다시 나타남 (sizes 개수 - 1 번). 분열할 때 작은 블록도 흩뿌림 */
  split: {
    spawn(b) { b.splitsLeft = cfg.split.sizes.length - 1; },
  },

  /** 보호막: 보호막 블록을 모두 깨면 본체 피해 ×bonus (남아 있으면 보통 피해). every 턴마다 빈 자리에 다시 생김 */
  shield: {
    spawn(b, g) { b.shieldTurn = 0; placeShields(g); },
    turn(b, g) {
      b.shieldTurn++;
      if (b.shieldTurn % cfg.shield.every === 0) placeShields(g);
    },
    shielded: (b, g) => g.grid.blocks().some((x) => x.shield && !x.dead),
    bonus: (b, src, g) => !g.grid.blocks().some((x) => x.shield && !x.dead),
  },
};

function placeShields(g) {
  for (const [col, row] of cfg.shield.cells) {
    if (g.grid.cells[row][col]) continue;
    g.grid.placeAt(col, row, {
      kind: 'block', hp: Math.ceil(g.stageHp() * cfg.shield.hpMul), double: false, base: 0, shield: true, labelColor: cfg.view.shieldColor,
    });
  }
}

/** 티어의 패턴 이름 목록 (챌린저는 pool 에서 random 개 무작위) */
export function patternsFor(tierId, rng, variant) {
  const t = cfg.tiers[tierId];
  if (!t.random) return (variant ?? t).patterns;
  const pool = [...t.pool];
  const out = [];
  for (let i = 0; i < t.random && pool.length; i++) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}
