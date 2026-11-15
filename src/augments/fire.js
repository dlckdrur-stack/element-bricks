import { EV } from '../core/events.js';
import { strike, cx, cy, isBallHit, ultimateGauge, later, wallOk } from './helpers.js';
import { stageHp } from '../core/stageLayout.js';
import { t } from '../ui/i18n.js';

/** 🔥 불 증강. 수치는 data/augments/fire.json, 여기는 효과만. */

const SRC = (aug, extra) => ({ type: 'fire', aug, ...extra });

/** 상시 능력치 (보유·재계산 시 호출) */
export function stats(aug, s) {
  const v = aug.v;
  switch (aug.def.id) {
    case 'fire_fireball':
      s.ballDamageMul += v.dmgPct;
      s.ballScale += v.sizePct;
      break;
    case 'fire_scorch': // 불덩이 = 모든 공 타격
      s.critChance += v.critChancePct;
      s.critDamage += v.critDamagePct;
      break;
    default:
  }
}

export function explode(api, col, row, pct, depth) {
  const color = api.mgr.color('fire');
  api.fx.explosion(api.grid.centerX(col), api.grid.centerY(row), color, depth, `${col},${row},${depth}`);
  for (const b of api.grid.around(col, row, 1)) {
    strike(api, b, pct, SRC('fire_explosion', { depth }));
  }
}

export function addBurn(api, cell, stacks) {
  if (!cell || cell.dead) return;
  const v = api.mgr.owned.get('fire_burn')?.v;
  if (!v) return;
  const prev = cell.burn ? cell.burn.stacks : 0;
  cell.burn = { stacks: Math.min(v.maxStacks, prev + stacks), turns: v.turns };
  cell.labelColor = api.theme.burnLabel;
  api.grid.refreshBlock(cell);
}

export const handlers = {
  /**
   * 각성 필살기 「연옥」: 블록을 need 개 깰 때마다 반드시 발동.
   * 모든 블록 아래에서 불기둥(아래 줄부터) waves 연타 → 화면 중앙 대폭발. 피해 = 스테이지 체력 × wavePct
   */
  fire_purgatory(api, aug) {
    ultimateGauge(api, aug, EV.KILL, () => true, () => {
      const c = api.fx.cfg.ult.purgatory;
      api.fx.purgatoryStart(t('aug.fire_purgatory.name'), t('ult.sub'));
      for (let w = 0; w < aug.v.waves; w++) {
        later(api, c.startDelay + w * c.waveGap, () => {
          const dmg = stageHp(api.state.stage) * aug.v.wavePct;
          const blocks = api.grid.blocks();
          const maxRow = Math.max(0, ...blocks.map((b) => b.row));
          api.fx.purgatoryWave(w);
          for (const b of blocks) {
            later(api, (maxRow - b.row) * c.rowDelay, () => {
              if (b.dead) return;
              api.fx.hellPillar(cx(api, b), cy(api, b));
              api.grid.damage(b, dmg, SRC('fire_purgatory', { ult: true }));
            });
          }
        });
      }
      const end = c.startDelay + aug.v.waves * c.waveGap;
      later(api, end, () => api.fx.purgatoryFinale(api.grid.centerY(Math.floor(api.grid.rows / 3))));
      return end + c.finaleTime;
    });
  },

  fire_explosion(api, aug) {
    api.bus.on(EV.AFTER_HIT, ({ cell, source }) => {
      if (isBallHit(source)) explode(api, cell.col, cell.row, aug.v.dmgPct, 0);
    });
  },

  fire_chainExplosion(api, aug) {
    api.bus.on(EV.KILL, ({ cell, source }) => {
      if (source?.aug !== 'fire_explosion' || source.depth !== 0) return;
      const base = api.mgr.val('fire_explosion', 'dmgPct');
      explode(api, cell.col, cell.row, base * aug.v.powerPct, 1);
    });
  },

  fire_burn(api) {
    const color = api.mgr.color('fire');
    // 화상 블록 위에 작은 불꽃이 계속 일렁임
    api.fx.burnAmbient(() => api.grid.blocks().filter((b) => b.burn).map((b) => ({ x: cx(api, b), y: cy(api, b) })), color);
    api.bus.on(EV.AFTER_HIT, ({ cell, source, killed }) => {
      if (isBallHit(source) && !killed) addBurn(api, cell, 1);
    });
    api.bus.on(EV.TURN_END, () => {
      const v = api.mgr.owned.get('fire_burn').v;
      for (const b of api.grid.blocks()) {
        if (!b.burn) continue;
        const { stacks } = b.burn;
        b.burn.turns--;
        if (b.burn.turns <= 0) { b.burn = null; b.labelColor = null; }
        api.fx.burnTick(cx(api, b), cy(api, b), color);
        strike(api, b, v.dmgPct * stacks, SRC('fire_burn')); // 살아남으면 표시도 갱신됨
      }
    });
  },

  fire_wildfire(api, aug) {
    api.bus.on(EV.KILL, ({ cell }) => {
      if (!cell.burn) return;
      for (const b of api.grid.around(cell.col, cell.row, 1)) addBurn(api, b, aug.v.spreadStacks);
    });
  },

  fire_overheat(api, aug) {
    aug.state.hits = 0;
    api.bus.on(EV.HIT, (ctx) => { ctx.damage *= 1 + aug.v.perHitPct * aug.state.hits; });
    api.bus.on(EV.AFTER_HIT, ({ source }) => { if (isBallHit(source)) aug.state.hits++; });
    api.bus.on(EV.TURN_END, () => { aug.state.hits = 0; });
  },

  fire_giantHunt(api, aug) {
    api.bus.on(EV.HIT, (ctx) => {
      const c = ctx.cell;
      if (c.elite || c.special || c.shield) ctx.damage *= 1 + aug.v.dmgPct; // 엘리트·보물·분열·방패·보호막
    });
  },

  fire_flameReturn(api, aug) {
    const color = api.mgr.color('fire');
    api.bus.on(EV.BALL_RETURN, ({ last }) => {
      if (!last) return;
      for (const b of api.grid.lowestRow()) {
        api.fx.explosion(cx(api, b), cy(api, b), color);
        strike(api, b, aug.v.dmgPct, SRC('fire_flameReturn'));
      }
    });
  },

  fire_emberHarvest(api, aug) {
    api.bus.on(EV.KILL, (ctx) => {
      if (ctx.source?.type === 'fire') ctx.currencyBonus += aug.v.currencyPct;
    });
  },

  // ---------- 추가 증강 10종 ----------
  /** 운석 낙하: 턴 시작 시 체력이 가장 높은 블록에 운석, 3×3 폭발 */
  fire_meteor(api, aug) {
    const color = api.mgr.color('fire');
    api.bus.on(EV.TURN_START, () => {
      const [b] = api.grid.blocks().sort((a, c) => c.hp - a.hp);
      if (!b) return;
      api.fx.lines.bolt(cx(api, b) + 40, api.grid.top, cx(api, b), cy(api, b), color, api.fx.cfg.combat.bolt);
      api.fx.explosion(cx(api, b), cy(api, b), color, 1);
      for (const t of [b, ...api.grid.around(b.col, b.row, 1)]) strike(api, t, aug.v.dmgPct, SRC('fire_meteor'));
    });
  },

  /** 불사조: 매 턴 처음 돌아온 공이 불사조가 되어 다시 날아오름 (피해 mulPct) */
  fire_phoenix(api, aug) {
    api.bus.on(EV.BALL_RETURN, ({ ball, first }) => {
      if (!first) return;
      const up = { x: ball.x, y: ball.y, vx: 0, vy: -1 };
      api.scene.balls.spawnExtra(up, (Math.random() - 0.5) * 60, aug.v.mulPct, undefined, 'phoenix', api.mgr.color('fire'));
      api.fx.explosion(ball.x, ball.y - 10, api.mgr.color('fire'));
    });
  },

  /** 화염 장벽: 공이 벽에 튕길 때 그 줄의 블록 전체에 불꽃 */
  fire_flameWall(api, aug) {
    api.bus.on(EV.WALL_BOUNCE, ({ ball }) => {
      if (!wallOk(ball, aug)) return;
      const row = Math.floor((ball.y - api.grid.top) / api.grid.cellH);
      if (row < 0 || row >= api.grid.rows) return;
      for (const b of api.grid.cells[row].filter((c) => c && c.kind === 'block')) {
        api.fx.elementHit(cx(api, b), cy(api, b), 'fire', `w${b.col},${b.row}`);
        strike(api, b, aug.v.dmgPct, SRC('fire_flameWall'));
      }
    });
  },

  /** 열파: every 턴마다 턴 시작 시 맨 아래 rows 줄에 열파 */
  fire_heatwave(api, aug) {
    aug.state.turns = 0;
    api.bus.on(EV.TURN_START, () => {
      if (++aug.state.turns % aug.v.every) return;
      const bottom = Math.max(0, ...api.grid.blocks().map((b) => b.row));
      for (const b of api.grid.blocks().filter((c) => c.row > bottom - aug.v.rows && !c.boss)) {
        api.fx.hellPillar(cx(api, b), cy(api, b));
        strike(api, b, aug.v.dmgPct, SRC('fire_heatwave'));
      }
    });
  },

  /** 화산 분출: 블록 kills 개를 깰 때마다 블록이 있는 무작위 열 전체가 분출 */
  fire_volcano(api, aug) {
    aug.state.kills = 0;
    api.bus.on(EV.KILL, ({ source }) => {
      if (source?.aug === 'fire_volcano' || ++aug.state.kills < aug.v.kills) return;
      aug.state.kills = 0;
      const cols = [...new Set(api.grid.blocks().map((b) => b.col))];
      const col = cols[Math.floor(Math.random() * cols.length)];
      for (const b of api.grid.blocks().filter((c) => c.col === col)) {
        api.fx.hellPillar(cx(api, b), cy(api, b));
        strike(api, b, aug.v.dmgPct, SRC('fire_volcano'));
      }
    });
  },

  /** 불쏘시개: 화상 중첩 1개당 공 타격 피해 +perStackPct */
  fire_kindling(api, aug) {
    api.bus.on(EV.HIT, (ctx) => {
      if (isBallHit(ctx.source) && ctx.cell.burn) ctx.damage *= 1 + aug.v.perStackPct * ctx.cell.burn.stacks;
    });
  },

  /** 네이팜: 폭발로 깬 자리가 불바다가 되어 다음 턴 시작 시 주변 3×3 */
  fire_napalm(api, aug) {
    let spots = [];
    api.bus.on(EV.KILL, ({ cell, source }) => { if (source?.aug === 'fire_explosion') spots.push({ col: cell.col, row: cell.row + 1 }); });
    api.bus.on(EV.TURN_START, () => {
      for (const s of spots) {
        api.fx.explosion(api.grid.centerX(s.col), api.grid.centerY(s.row), api.mgr.color('fire'), 0, `n${s.col},${s.row}`);
        for (const b of api.grid.around(s.col, s.row, 1)) strike(api, b, aug.v.dmgPct, SRC('fire_napalm'));
      }
      spots = [];
    });
  },

  /** 혜성: 불덩이 공이 벽에 튕길 때마다 벽 근처 블록 폭발 */
  fire_comet(api, aug) {
    api.bus.on(EV.WALL_BOUNCE, ({ ball }) => {
      if (!wallOk(ball, aug)) return;
      const g = api.grid;
      const r = g.cellW * 1.2;
      const hit = [];
      g.query(ball.x - r, ball.y - r, ball.x + r, ball.y + r, (c) => { if (c.kind === 'block') hit.push(c); });
      if (!hit.length) return;
      api.fx.explosion(ball.x, ball.y, api.mgr.color('fire'));
      for (const b of hit) strike(api, b, aug.v.dmgPct, SRC('fire_comet'));
    });
  },

  /** 잿불 소용돌이: 한 공이 같은 블록을 연달아 hits 번 맞히면 그 블록이 폭발 */
  fire_ashVortex(api, aug) {
    api.bus.on(EV.AFTER_HIT, ({ cell, source, killed }) => {
      if (!isBallHit(source)) return;
      const b = source.ball;
      b.ashN = b.ashCell === cell ? (b.ashN ?? 0) + 1 : 1;
      b.ashCell = cell;
      if (killed || b.ashN < aug.v.hits) return;
      b.ashN = 0;
      api.fx.explosion(cx(api, cell), cy(api, cell), api.mgr.color('fire'), 1);
      strike(api, cell, aug.v.dmgPct, SRC('fire_ashVortex'));
    });
  },

  /** 태양 불꽃: 데미지 구슬을 먹을 때마다 화면의 모든 블록에 불꽃 */
  fire_sunfire(api, aug) {
    api.bus.on(EV.ORB_COLLECT, () => {
      for (const b of api.grid.blocks()) {
        api.fx.p.emit('fireHitEmber', cx(api, b), cy(api, b), api.mgr.color('fire'));
        strike(api, b, aug.v.dmgPct, SRC('fire_sunfire'));
      }
    });
  },
};
