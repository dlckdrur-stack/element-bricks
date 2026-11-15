import { EV } from '../core/events.js';
import { strike, cx, cy, isBallHit, ultimate, later } from './helpers.js';
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

function explode(api, col, row, pct, depth) {
  const color = api.mgr.color('fire');
  api.fx.explosion(api.grid.centerX(col), api.grid.centerY(row), color, depth, `${col},${row},${depth}`);
  for (const b of api.grid.around(col, row, 1)) {
    strike(api, b, pct, SRC('fire_explosion', { depth }));
  }
}

function addBurn(api, cell, stacks) {
  if (!cell || cell.dead) return;
  const v = api.mgr.owned.get('fire_burn')?.v;
  if (!v) return;
  const prev = cell.burn ? cell.burn.stacks : 0;
  cell.burn = { stacks: Math.min(v.maxStacks, prev + stacks), turns: v.turns };
  cell.labelColor = api.theme.burnLabel;
  api.grid.refreshBlock(cell);
}

export const handlers = {
  /** 각성 필살기 「연옥」: cooldown 턴마다 모든 블록 아래에서 불기둥이 솟구침 (아래 줄부터, waves 연타) */
  fire_purgatory(api, aug) {
    ultimate(api, aug, () => {
      const c = api.fx.cfg.ult.purgatory;
      api.fx.purgatoryStart(t('aug.fire_purgatory.name'), t('ult.sub'));
      for (let w = 0; w < aug.v.waves; w++) {
        later(api, c.startDelay + w * c.waveGap, () => {
          const dmg = stageHp(api.state.stage) * aug.v.wavePct;
          const blocks = api.grid.blocks();
          const maxRow = Math.max(0, ...blocks.map((b) => b.row));
          api.fx.purgatoryWave();
          for (const b of blocks) {
            later(api, (maxRow - b.row) * c.rowDelay, () => {
              if (b.dead) return;
              api.fx.hellPillar(cx(api, b), cy(api, b));
              api.grid.damage(b, dmg, SRC('fire_purgatory', { ult: true }));
            });
          }
        });
      }
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
      if (c.elite || c.treasure || c.shield) ctx.damage *= 1 + aug.v.dmgPct;
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
};
