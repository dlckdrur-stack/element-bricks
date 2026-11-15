import { EV } from '../core/events.js';

/**
 * 장착한 각인 잠재 능력 중 "이벤트로 붙는 것"을 판에 연결.
 * (공 데미지·치명타·경험치·재화는 runSetup 에서 기본 능력치로 반영)
 *   allDmg 모든 피해 · elemEffect 그 각인 속성의 증강 효과 · eliteDmg 엘리트·보스
 *   ignoreDef 방패·강철 감소 무시 (state.ignoreDef → elites.js) · orbEff 구슬 상승량
 */
export function hookResonance(bus, state, res) {
  const o = res.total;
  state.ignoreDef = o.ignoreDef ?? 0;
  bus.on(EV.HIT, (ctx) => {
    if (o.allDmg) ctx.damage *= 1 + o.allDmg;
    const el = ctx.source?.type;
    if (res.elem[el]) ctx.damage *= 1 + res.elem[el];
    if (o.eliteDmg && (ctx.cell.elite || ctx.cell.boss)) ctx.damage *= 1 + o.eliteDmg;
  });
  if (o.orbEff) bus.on(EV.ORB_COLLECT, (ctx) => { ctx.gain *= 1 + o.orbEff; });
}
