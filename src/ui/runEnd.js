import { EV } from '../core/events.js';
import { commitProfile } from '../meta/save.js';
import { clearRun } from '../meta/runSave.js';
import { markCleared, tierOrder } from '../meta/tiers.js';
import { showResult } from './ResultView.js';
import { goTo } from './widgets.js';
import { t } from './i18n.js';
import { submit as submitRank } from '../net/ranking.js';

/**
 * 판 끝내기 (GameScene 에 붙는 메서드). 게임오버와 티어 클리어(승리) 둘 다 여기서.
 * 재화는 연출 전에 바로 저장한다.
 */
export const runEnd = {
  gameOver() { this.finishRun(false); },

  victory() { this.finishRun(true); },

  finishRun(won) {
    const s = this.state;
    if (s.phase === 'over') return; // 한 번만
    const p = this.saveData;
    s.phase = 'over';
    clearRun();
    this.aim.disable();
    this.placeLauncher(false);
    this.hud.showHint(false);

    if (!this.tier.stages) p.bestStage = Math.max(p.bestStage, s.stage); // 최고 기록은 챌린저만
    p.tierBest = { ...p.tierBest, [this.tier.id]: Math.max(p.tierBest?.[this.tier.id] ?? 0, s.stage) };
    const clear = won ? markCleared(this.tier.id) : { first: false, reward: null, bonus: 0 };
    const w = this.wallet;
    const info = {
      stage: s.stage, best: p.tierBest[this.tier.id], newBest: !this.tier.stages && s.stage > this.startBest, showBest: !this.tier.stages,
      total: w.total + clear.bonus, bonusPct: w.bonusPct, won,
      clearBonus: clear.bonus, unlocked: clear.reward ? t(`tier.unlocked.${clear.reward}`) : null,
    };
    p.currency += info.total;
    commitProfile();
    this.bus.emit(EV.GAME_OVER, info);
    submitRank({ tier: this.tier.id, stage: s.stage, won }); // 네트워크는 판 종료 때만

    const next = tierOrder[this.tier.index + 1];
    showResult(this, info, {
      onRetry: () => goTo(this, 'Game', { resume: false, tier: this.tier.id }),
      onMenu: () => goTo(this, 'Menu'),
      onNext: won && next ? () => goTo(this, 'Game', { resume: false, tier: next }) : null,
    });
  },
};
