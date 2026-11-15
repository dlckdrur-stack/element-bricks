import { EV } from '../core/events.js';
import balance from '../data/balance.json';
/** 증강 효과 공용 도우미. 효과 피해는 "공 데미지(구슬로 오른 값) × 비율" 기준. */

export function strike(api, cell, pct, source) {
  if (cell && !cell.dead) api.fx.augFx(source, cx(api, cell), cy(api, cell), `${cell.col},${cell.row}`); // 증강별 고유 이펙트
  return api.grid.damage(cell, api.state.damage * pct * balance.augmentDamageMul, source); // 증강 효과 전체 배율
}

export function cx(api, cell) { return api.grid.centerX(cell.col); }
export function cy(api, cell) { return api.grid.centerY(cell.row); }

/** cell 에서 가까운 블록 n개 (자기 자신 제외) */
export function nearest(api, cell, n) {
  const g = api.grid;
  const list = g.blocks().filter((b) => b !== cell);
  const d = (b) => ((b.col - cell.col) * g.cellW) ** 2 + ((b.row - cell.row) * g.cellH) ** 2;
  list.sort((a, b) => d(a) - d(b));
  return list.slice(0, n);
}

/** 서로 다른 무작위 블록 n개 */
export function randomBlocks(api, n) {
  const list = api.grid.blocks();
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, n);
}

export const isBallHit = (source) => source && source.type === 'ball';

/**
 * 각성(필살기) 발동 조건: 확률 없이 cooldown 턴마다 턴 시작 시 반드시 발동.
 * 남은 턴은 aug.state.turns (HUD 배지가 읽음). 피해는 스테이지 기본 체력 기준이라 후반에도 유지된다.
 */
export function ultimate(api, aug, fire) {
  aug.state.turns = 0;
  api.bus.on(EV.TURN_START, () => {
    aug.state.turns++;
    if (aug.state.turns < aug.v.cooldown) return;
    aug.state.turns = 0;
    fire();
  });
}

/**
 * 각성(필살기) 게이지: event 가 filter 를 통과할 때마다 +1, need 에 닿으면 반드시 발동 (확률 없음).
 * 속성마다 조건이 다르다 (불=블록 처치, 번개=공 타격 …). 필살기 자신의 피해는 게이지에 안 들어감.
 * 연출이 끝날 때까지(busy) 다시 발동하지 않음. HUD 배지는 aug.state.count / aug.v.need 를 읽음.
 */
export function ultimateGauge(api, aug, event, filter, fire) {
  aug.state.count = 0;
  aug.state.busy = false;
  api.bus.on(event, (ctx) => {
    if (aug.state.busy || ctx.source?.ult || !filter(ctx)) return;
    aug.state.count++;
    if (aug.state.count < aug.v.need) return;
    aug.state.count = 0;
    aug.state.busy = true;
    later(api, fire(), () => { aug.state.busy = false; });
  });
}

/** 벽 튕김 증강: 공 1개가 한 번 발사될 때 maxPerBall 번까지만 발동 (너무 강해서 상한) */
export function wallOk(ball, aug) {
  const k = `w_${aug.def.id}`;
  ball[k] = (ball[k] ?? 0) + 1;
  return ball[k] <= aug.v.maxPerBall;
}

/** sec 초 뒤 fn (씬이 바뀌면 자동 취소) */
export function later(api, sec, fn) {
  api.scene.time.delayedCall(sec * 1000, fn);
}
