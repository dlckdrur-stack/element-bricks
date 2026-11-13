import Phaser from 'phaser';
import layout from './data/layout.json';
import theme from './data/themes/neon.json';
import { GameScene } from './ui/GameScene.js';

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
  scene: [GameScene],
});

if (import.meta.env.DEV) window.__game = game; // 개발용 디버그 접근

