import layout from '../data/layout.json';
import theme from '../data/themes/neon.json';
import draftCfg from '../data/draft.json';
import { fxCfg } from '../fx/config.js';
import { buildChoices } from '../augments/draft.js';
import { showAugmentPick } from './AugmentPickView.js';

/**
 * 레벨업 → 증강 선택 화면 흐름 (GameScene 에 붙는 메서드).
 * aim/fire 중 언제든 'pick' 으로 멈추고, 고른 뒤 원래 단계로 복귀.
 */
export const pickFlow = {
  openPick() {
    const s = this.state;
    const level = this.leveling.pending.shift();
    const kind = this.leveling.kindFor(level);
    const choice = buildChoices(kind, level, this.augments);
    if (!choice.options.length) return; // 고를 게 없으면 건너뜀

    this.resumePhase = s.phase;
    s.phase = 'pick';
    this.aim.disable();
    this.hud.showHint(false);
    if (this.resumePhase === 'fire') this.fx.juice.slowmo(fxCfg.ui.levelUp.slowmo.time, fxCfg.ui.levelUp.slowmo.scale);
    const deps = {
      layout, theme, draftCfg, mgr: this.augments, fx: this.fx, fxCfg, look: this.look,
      ballPos: () => this.ballPos(),
    };
    showAugmentPick(this, deps, choice, level, {
      onPick: (def) => { // 카드가 공에 닿는 순간: 증강 적용 → 공 불꽃이 바로 바뀜
        this.augments.add(def.id, choice.grade);
        s.ballFx = this.augments.ballFx;
        if (this.resumePhase === 'aim') {
          this.balls.applyStats();
          this.placeLauncher(true);
        } else this.balls.redressAll();
        this.refreshHud();
      },
      onDone: () => {
        s.phase = this.resumePhase;
        this.acc = 0;
        if (s.phase === 'aim') {
          this.enterAim();
          this.hud.showHint(s.stage === 1);
        }
        this.refreshHud();
      },
    });
  },

  /** 카드가 빨려 들어갈 공 위치: 조준 중이면 발사대, 날아다니는 중이면 첫 공 */
  ballPos() {
    const b = this.resumePhase === 'fire' ? this.balls.active[0] : null;
    return b ? { x: b.x, y: b.y } : { x: this.state.launchX, y: this.balls.launchY };
  },
};
