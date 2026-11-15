import Phaser from 'phaser';
import layout from '../data/layout.json';
import theme from '../data/themes/neon.json';
import screens from '../data/screens.json';
import { hex } from '../core/color.js';
import { t } from './i18n.js';
import fire from '../data/augments/fire.json';
import lightning from '../data/augments/lightning.json';
import dark from '../data/augments/dark.json';
import ice from '../data/augments/ice.json';
import earth from '../data/augments/earth.json';
import grass from '../data/augments/grass.json';

const ELEMENT_COLORS = [fire, lightning, dark, ice, earth, grass].map((d) => d.color); // 게임 속 여섯 원소 색 그대로

const ADD = Phaser.BlendModes.ADD;

/**
 * 메인 화면 제목: 여섯 원소 색 구슬이 도는 육각형 고리 + 원소색 그라데이션 영문 제목 + 영문 부제.
 * 수치는 screens.json 의 menu.
 */
export function makeMenuTitle(scene, depth) {
  const m = screens.menu;
  const R = m.ring;
  const W = layout.width;
  const cx = W / 2;
  const cy = m.titleY;
  const colors = ELEMENT_COLORS.map(hex);

  // 천천히 도는 육각형 테두리 + 꼭짓점마다 원소 빛
  const ring = scene.add.container(cx, cy).setDepth(depth - 1);
  const g = scene.add.graphics();
  const pts = colors.map((_, i) => {
    const a = (i / colors.length) * Math.PI * 2 - Math.PI / 2;
    return [Math.cos(a) * R.hexR, Math.sin(a) * R.hexR];
  });
  g.lineStyle(2, 0xffffff, R.alpha * 0.5);
  g.strokePoints(pts.map(([x, y]) => ({ x, y })), true, true);
  ring.add(g);
  colors.forEach((c, i) => {
    const [x, y] = pts[i];
    ring.add(scene.add.image(x, y, 'fx', 'glow').setTint(c).setBlendMode(ADD).setDisplaySize(R.orb, R.orb).setAlpha(R.alpha));
    ring.add(scene.add.image(x, y, 'fx', 'disc').setTint(c).setDisplaySize(R.dot, R.dot)); // 원소 색 구슬
  });
  scene.tweens.add({ targets: ring, angle: 360, duration: R.spinSec * 1000, repeat: -1 });

  // 제목: 원소색 그라데이션 + 빛 번짐 + 천천히 숨쉬기
  const title = scene.add.text(cx, cy, t('menu.title'), {
    fontFamily: theme.titleFont, fontSize: `${m.titleSize}px`, fontStyle: '900', color: '#ffffff',
  }).setOrigin(0.5).setDepth(depth).setAlpha(m.titleAlpha).setShadow(0, 0, theme.titleGlow, m.titleGlow, false, true);
  const grd = title.context.createLinearGradient(0, 0, title.width, 0);
  ELEMENT_COLORS.forEach((c, i) => grd.addColorStop(i / (ELEMENT_COLORS.length - 1), c));
  title.setFill(grd);
  scene.tweens.add({ targets: title, scale: 1.03, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

  scene.add.text(cx, m.subtitleY, t('menu.subtitle'), {
    fontFamily: theme.titleFont, fontSize: `${m.subtitleSize}px`, fontStyle: '500', color: theme.textDim,
  }).setOrigin(0.5).setDepth(depth).setLetterSpacing(m.subtitleSpacing);
}
