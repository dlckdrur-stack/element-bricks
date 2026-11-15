import Phaser from 'phaser';
import layout from './data/layout.json';
import theme from './data/themes/neon.json';
import { MenuScene } from './ui/MenuScene.js';
import { GameScene } from './ui/GameScene.js';
import { ShopScene } from './ui/ShopScene.js';
import { RankingScene } from './ui/RankingScene.js';
import { UpgradeScene } from './ui/UpgradeScene.js';
import { SettingsScene } from './ui/SettingsScene.js';
import { TierScene } from './ui/TierScene.js';

// 개발 모드에서만: 주소 뒤에 ?fxtest 를 붙이면 이펙트 테스트 화면으로 시작 (배포 빌드에는 포함되지 않음)
const fxTest = import.meta.env.DEV && new URLSearchParams(location.search).has('fxtest');
const scenes = { Menu: MenuScene, Tier: TierScene, Game: GameScene, Upgrade: UpgradeScene, Shop: ShopScene, Ranking: RankingScene, Settings: SettingsScene };

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: theme.background,
  width: layout.width,
  height: layout.height,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 1 },
  render: { antialias: true, powerPreference: 'high-performance' },
  fps: { target: 60 },
  scene: fxTest ? [] : Object.values(scenes),
});

if (import.meta.env.DEV) {
  window.__game = game; // 개발용 디버그 접근
  import('./ui/FxTestScene.js').then(({ FxTestScene }) => {
    if (fxTest) for (const k in scenes) game.scene.add(k, scenes[k], false);
    game.scene.add('FxTest', FxTestScene, fxTest);
  });
}
