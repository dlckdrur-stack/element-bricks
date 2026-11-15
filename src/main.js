import Phaser from 'phaser';
import '@fontsource/orbitron/500.css';
import '@fontsource/orbitron/900.css';
import '@fontsource/black-han-sans/korean-400.css';
import '@fontsource/black-han-sans/latin-400.css';
import layout from './data/layout.json';
import theme from './data/themes/neon.json';
import { MenuScene } from './ui/MenuScene.js';
import { GameScene } from './ui/GameScene.js';
import { ShopScene } from './ui/ShopScene.js';
import { RankingScene } from './ui/RankingScene.js';
import { PauseScene } from './ui/PauseScene.js';
import { UpgradeScene } from './ui/UpgradeScene.js';
import { SettingsScene } from './ui/SettingsScene.js';
import { TierScene } from './ui/TierScene.js';
import { AttendanceScene } from './ui/AttendanceScene.js';

// 개발 모드에서만: 주소 뒤에 ?fxtest 를 붙이면 이펙트 테스트 화면으로 시작 (배포 빌드에는 포함되지 않음)
const fxTest = import.meta.env.DEV && new URLSearchParams(location.search).has('fxtest');
const scenes = { Menu: MenuScene, Tier: TierScene, Game: GameScene, Upgrade: UpgradeScene, Shop: ShopScene, Ranking: RankingScene, Pause: PauseScene, Settings: SettingsScene, Attendance: AttendanceScene };

/** 캔버스 글자는 글꼴이 늦게 오면 기본 글꼴로 굳으므로, 게임 시작 전에 글꼴을 먼저 불러온다 (최대 FONT_WAIT_MS) */
const FONT_WAIT_MS = 3000;
const fonts = Promise.all([
  document.fonts.load('900 40px Orbitron', 'HEXASHARD'),
  document.fonts.load('500 20px Orbitron', 'SIX'),
  document.fonts.load('40px "Black Han Sans"', '한글가ABC'),
]);
Promise.race([fonts, new Promise((r) => setTimeout(r, FONT_WAIT_MS))]).catch(() => {}).then(start);

function start() {
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
}
