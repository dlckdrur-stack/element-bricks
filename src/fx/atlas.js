/**
 * 이미지 파일 없이 입자 그림을 코드로 그려 텍스처 한 장('fx')에 모은다.
 * 모든 프레임은 64×64, 흰색으로 그리고 tint 로 색을 입힌다(가산 혼합과 함께 사용).
 * 프레임: glow(빛 원) core(공 중심) ember(불티) star(별) shard(파편) line(선) ring(링) box(블록 테두리)
 */
export const FRAME = 64;
const NAMES = ['glow', 'core', 'ember', 'star', 'shard', 'line', 'ring', 'box'];

export function makeFxAtlas(scene) {
  if (scene.textures.exists('fx')) return;
  const S = FRAME;
  const tex = scene.textures.createCanvas('fx', S * NAMES.length, S);
  const ctx = tex.getContext();
  NAMES.forEach((name, i) => {
    ctx.save();
    ctx.translate(i * S, 0);
    DRAW[name](ctx, S);
    ctx.restore();
    tex.add(name, 0, i * S, 0, S, S);
  });
  tex.refresh();
}

function radial(ctx, x, y, r, stops) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [t, a] of stops) g.addColorStop(t, `rgba(255,255,255,${a})`);
  return g;
}

const DRAW = {
  glow(ctx, S) {
    const h = S / 2;
    ctx.fillStyle = radial(ctx, h, h, h, [[0, 1], [0.25, 0.75], [0.55, 0.25], [1, 0]]);
    ctx.fillRect(0, 0, S, S);
  },
  core(ctx, S) {
    const h = S / 2;
    ctx.fillStyle = radial(ctx, h, h, h - 1, [[0, 1], [0.86, 1], [1, 0]]);
    ctx.beginPath(); ctx.arc(h, h, h - 1, 0, Math.PI * 2); ctx.fill();
  },
  ember(ctx, S) {
    const h = S / 2;
    ctx.save();
    ctx.translate(h, h);
    ctx.scale(1, 0.32); // 가로로 긴 불티 (stretch 로 진행 방향 정렬)
    ctx.fillStyle = radial(ctx, 0, 0, h, [[0, 1], [0.3, 0.85], [0.7, 0.2], [1, 0]]);
    ctx.beginPath(); ctx.arc(0, 0, h, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },
  star(ctx, S) {
    const h = S / 2;
    ctx.fillStyle = radial(ctx, h, h, h * 0.45, [[0, 0.9], [1, 0]]);
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const r = k % 2 === 0 ? h - 2 : h * 0.16;
      const a = (k * Math.PI) / 4 - Math.PI / 2;
      ctx.lineTo(h + Math.cos(a) * r, h + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
  },
  shard(ctx, S) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(S * 0.18, S * 0.3);
    ctx.lineTo(S * 0.86, S * 0.16);
    ctx.lineTo(S * 0.7, S * 0.62);
    ctx.lineTo(S * 0.32, S * 0.84);
    ctx.closePath(); ctx.fill();
  },
  line(ctx, S) {
    const g = ctx.createLinearGradient(0, 0, S, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, S / 2 - 2, S, 4);
  },
  ring(ctx, S) {
    const h = S / 2;
    ctx.fillStyle = radial(ctx, h, h, h, [[0, 0], [0.7, 0], [0.84, 1], [0.92, 0.5], [1, 0]]);
    ctx.fillRect(0, 0, S, S);
  },
  box(ctx, S) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    const r = 6;
    const p = 2;
    const w = S - p * 2;
    ctx.beginPath();
    ctx.moveTo(p + r, p);
    ctx.arcTo(p + w, p, p + w, p + w, r);
    ctx.arcTo(p + w, p + w, p, p + w, r);
    ctx.arcTo(p, p + w, p, p, r);
    ctx.arcTo(p, p, p + w, p, r);
    ctx.closePath(); ctx.stroke();
  },
};
