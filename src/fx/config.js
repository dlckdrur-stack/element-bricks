import core from '../data/fx/default.json';
import particles from '../data/fx/particles.json';
import combat from '../data/fx/combat.json';
import ui from '../data/fx/ui.json';

/**
 * 이펙트 설정 한 묶음. 수치는 전부 data/fx/*.json.
 * default.json(예산·품질·손맛·공) + particles.json(입자 프리셋) + combat.json(전투 연출) + ui.json(카드·각성·구슬)
 */
export const fxCfg = { ...core, presets: particles.presets, combat, ui };
