import { EV } from '../core/events.js';
import { commitProfile } from './save.js';
import { quests } from './quests.js';

/**
 * 판 안에서 일일 퀘스트 진행을 올림. 저장은 턴 끝에 한 번 (바뀐 게 있을 때만).
 * stages 스테이지 진행 · kills 블록 처치 · crits 치명타 · boss 보스 처치 · ult 각성 필살기
 * mainEl 그 원소를 메인으로 스테이지 n 도달 · useAug 그 증강을 고르고 스테이지 n 도달
 */
export function hookQuests(bus, scene) {
  const s = quests();
  const by = (type) => s.list.filter((q) => q.type === type && !q.claimed && q.progress < q.n);
  let dirty = false;
  const bump = (type, n = 1) => { for (const q of by(type)) { q.progress = Math.min(q.n, q.progress + n); dirty = true; } };

  bus.on(EV.KILL, ({ cell }) => { bump('kills'); if (cell?.boss) bump('boss'); });
  bus.on(EV.AFTER_HIT, ({ source }) => { if (source?.type === 'ball' && source.crit) bump('crits'); });
  const ultStart = scene.fx.ultStart.bind(scene.fx); // 각성 필살기는 모두 ultStart 로 시작
  scene.fx.ultStart = (...a) => { bump('ult'); return ultStart(...a); };
  bus.on(EV.TURN_END, ({ stage }) => {
    bump('stages');
    const m = scene.augments;
    for (const q of by('mainEl')) if (m.main === q.el) { q.progress = Math.min(q.n, Math.max(q.progress, stage)); dirty = true; }
    for (const q of by('useAug')) if (m.has(q.aug)) { q.progress = Math.min(q.n, Math.max(q.progress, stage)); dirty = true; }
    if (dirty) { commitProfile(); dirty = false; }
  });
  bus.on(EV.GAME_OVER, () => { if (dirty) { commitProfile(); dirty = false; } });
}
