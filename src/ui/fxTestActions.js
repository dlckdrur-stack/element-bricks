import { fxCfg } from '../fx/config.js';
import { t } from './i18n.js';

/**
 * 이펙트 테스트 화면의 버튼 동작. s = FxTestScene.
 * 실제 게임과 같은 경로(grid.damage → 이벤트 → fx)로 숫자·파편까지 확인한다.
 */
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pos = (s, c) => ({ x: s.grid.centerX(c.col), y: s.grid.centerY(c.row) });
const hit = (s, c, amount = s.T.hitDamage, crit = false) => s.grid.damage(c, amount, { type: 'ball', crit });
const later = (s, sec, fn) => s.time.delayedCall(sec * 1000, fn);

function randomBlock(s) {
  const list = s.grid.blocks();
  if (!list.length) s.refill();
  return pick(s.grid.blocks());
}

function nearest(s, cell, n) {
  const g = s.grid;
  const d = (b) => ((b.col - cell.col) * g.cellW) ** 2 + ((b.row - cell.row) * g.cellH) ** 2;
  return g.blocks().filter((b) => b !== cell).sort((a, b) => d(a) - d(b)).slice(0, n);
}

function fireRail(s) {
  const b = s.ball;
  const a = ((-90 + rand(-s.T.railSpreadDeg, s.T.railSpreadDeg)) * Math.PI) / 180;
  const { cells, endX, endY } = s.grid.lineBlocks(b.x, b.y, Math.cos(a), Math.sin(a));
  s.fx.railgun('test', b.x, b.y, endX, endY, s.colors.lightning, cells.map((c) => pos(s, c)));
  for (const c of cells) hit(s, c);
}

function explodeAt(s, cell, depth) {
  const { x, y } = pos(s, cell);
  s.fx.explosion(x, y, s.colors.fire, depth);
  for (const b of s.grid.around(cell.col, cell.row, 1)) hit(s, b);
}

const LOOKS = ['none', 'fire', 'fireball', 'lightning', 'armor'];

/** 공 겉모습을 속성별로 바꿔 보기 */
export function lookFor(s, name) {
  const m = fxCfg.ball.mods;
  const base = (el) => ({ color: s.mgr.elements[el].aura, trail: fxCfg.ball.elementTrail, armorColor: s.colors.lightning });
  switch (name) {
    case 'fire': return base('fire');
    case 'fireball': return { ...base('fire'), ...m.fire_fireball };
    case 'lightning': return base('lightning');
    case 'armor': return { ...base('lightning'), ...m.lightning_pierce };
    default: return null;
  }
}

export const actions = {
  railgun: (s) => fireRail(s),

  railCharge(s) {
    const n = s.T.chargeHits;
    for (let i = 1; i < n; i++) {
      later(s, i * s.T.chargeInterval, () => {
        s.fx.emit('blockHit', s.ball.x, s.ball.y, s.colors.lightning);
        s.fx.railCharge('test', s.ball, s.ballR, i / n, s.colors.lightning);
      });
    }
    later(s, n * s.T.chargeInterval, () => fireRail(s));
  },

  explosion: (s) => explodeAt(s, randomBlock(s), 0),

  chainExplosion(s) {
    const c = randomBlock(s);
    const around = s.grid.around(c.col, c.row, 1).slice(0, 2);
    explodeAt(s, c, 0);
    later(s, s.T.chainExplosionDelay, () => around.forEach((b) => !b.dead && explodeAt(s, b, 1)));
  },

  chain(s) {
    const c = randomBlock(s);
    const p0 = pos(s, c);
    hit(s, c);
    for (const b of nearest(s, c, s.T.chainTargets)) {
      const p1 = pos(s, b);
      s.fx.chain(p0.x, p0.y, p1.x, p1.y, s.colors.lightning);
      hit(s, b);
    }
  },

  bolt(s) {
    const list = s.grid.blocks().sort(() => Math.random() - 0.5).slice(0, s.T.boltCount);
    for (const c of list) {
      const p = pos(s, c);
      s.fx.bolt(p.x, s.grid.top, p.y, s.colors.lightning);
      hit(s, c);
    }
  },

  pierce(s) {
    const b = s.ball;
    const { cells } = s.grid.lineBlocks(b.x, b.y, 0, -1);
    cells.slice(-s.T.pierceCount).reverse().forEach((c, i) => later(s, i * s.T.pierceInterval, () => {
      const p = pos(s, c);
      s.fx.pierce(p.x, p.y + s.grid.cellH / 2, s.colors.lightning);
      hit(s, c);
    }));
  },

  break(s) {
    const c = randomBlock(s);
    hit(s, c, c.hp, true);
  },

  orb(s) {
    let orbs = [];
    s.grid.forEachCell((c) => { if (c.kind === 'orb') orbs.push(c); });
    if (!orbs.length) { s.placeOrbs(); orbs = []; s.grid.forEachCell((c) => { if (c.kind === 'orb') orbs.push(c); }); }
    const o = pick(orbs);
    if (!o) return;
    const gain = s.grid.collectOrb(o, s.ball, s.balance.orb.damageGain);
    if (gain) s.state.damage += gain;
    later(s, s.T.orbCollectDelay, () => s.placeOrbs());
  },

  burn(s) {
    s.burnOn = !s.burnOn;
    for (const b of s.grid.blocks()) {
      b.labelColor = s.burnOn ? s.theme.burnLabel : null;
      s.grid.refreshBlock(b);
    }
  },

  look(s) {
    s.lookIndex = (s.lookIndex + 1) % LOOKS.length;
    s.state.ballFx = lookFor(s, LOOKS[s.lookIndex]);
    s.look.dress(s.ball.view, s.ballR);
    s.look.flareUp('orb');
    return LOOKS[s.lookIndex];
  },

  refill: (s) => s.refill(),
  cardSilver: (s) => s.openCards('graded', 'silver'),
  cardGold: (s) => s.openCards('graded', 'gold'),
  cardPrism: (s) => s.openCards('graded', 'prism'),
  awaken: (s) => s.openCards('main', null),

  // 각성 필살기 (게임과 같은 연출, 피해는 테스트용 고정값)
  purgatory: (s) => {
    const c = fxCfg.ult.purgatory;
    s.fx.purgatoryStart(t('aug.fire_purgatory.name'), t('ult.sub'));
    for (let w = 0; w < 3; w++) {
      later(s, c.startDelay + w * c.waveGap, () => {
        const blocks = s.grid.blocks();
        const maxRow = Math.max(0, ...blocks.map((b) => b.row));
        s.fx.purgatoryWave();
        for (const b of blocks) {
          later(s, (maxRow - b.row) * c.rowDelay, () => {
            if (b.dead) return;
            const p = pos(s, b);
            s.fx.hellPillar(p.x, p.y);
            hit(s, b);
          });
        }
      });
    }
    later(s, c.startDelay + 3 * c.waveGap, () => s.fx.purgatoryFinale(s.grid.centerY(3)));
  },
  judgment: (s) => {
    const c = fxCfg.ult.judgment;
    s.fx.judgmentStart(t('aug.lightning_judgment.name'), t('ult.sub'));
    s.grid.blocks().sort((a, b) => b.hp - a.hp).slice(0, 8).forEach((b, i) => later(s, c.startDelay + i * c.boltGap, () => {
      if (b.dead) return;
      const p = pos(s, b);
      s.fx.judgmentBolt(p.x, 0, p.y, i);
      hit(s, b);
      for (const n of nearest(s, b, 2)) {
        const q = pos(s, n);
        s.fx.chain(p.x, p.y, q.x, q.y, s.colors.lightning);
      }
    }));
    later(s, c.startDelay + 8 * c.boltGap, () => s.fx.judgmentFinale(s.grid.top + s.grid.rows * s.grid.cellH));
  },
  eclipse: (s) => {
    const c = fxCfg.ult.eclipse;
    s.fx.eclipseStart(t('aug.dark_eclipse.name'), t('ult.sub'));
    later(s, c.startDelay, () => {
      s.fx.eclipseFinale();
      for (const b of s.grid.blocks()) { const p = pos(s, b); s.fx.eclipseExec(p.x, p.y); hit(s, b); }
    });
  },
};

/** 버튼 배치 순서 (키 = actions 이름 = 문구 fxtest.{키}) */
export const BUTTONS = [
  'railgun', 'railCharge', 'explosion', 'chainExplosion',
  'chain', 'bolt', 'pierce', 'break',
  'orb', 'burn', 'look', 'refill',
  'cardSilver', 'cardGold', 'cardPrism', 'awaken',
  'purgatory', 'judgment', 'eclipse',
];
