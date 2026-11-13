import { EV } from './events.js';
import { Pool } from './Pool.js';
import { hex } from './color.js';

/**
 * 7열 격자. 칸 = null | cell
 * cell: { kind:'block'|'orb', col, row, hp, maxHp, double, color, view }
 * 충돌 검사는 query()로 공 근처 칸만 본다.
 */
export class Grid {
  constructor(scene, { bus, layout, theme, balance }) {
    this.scene = scene;
    this.bus = bus;
    this.theme = theme;
    this.anim = balance.anim;
    this.cols = layout.cols;
    this.rows = layout.rows;
    this.top = layout.hudHeight;
    this.cellW = layout.width / this.cols;
    this.cellH = (layout.floorY - layout.hudHeight) / this.rows;
    this.pad = layout.blockPad;
    this.orbR = balance.orb.radius;
    this.colors = theme.blockColors.map(hex);
    this.refHp = 1;
    this.cells = Array.from({ length: this.rows }, () => new Array(this.cols).fill(null));

    const fontStyle = {
      fontFamily: theme.fontFamily, fontSize: `${layout.fontSize.block}px`,
      fontStyle: 'bold', color: theme.text,
    };
    this.blockPool = new Pool(() => ({
      rect: scene.add.rectangle(0, 0, this.cellW - this.pad * 2, this.cellH - this.pad * 2).setDepth(10),
      label: scene.add.text(0, 0, '', fontStyle).setOrigin(0.5).setDepth(11),
    }), (v) => { v.rect.setVisible(false); v.label.setVisible(false); });
    this.orbPool = new Pool(
      () => scene.add.circle(0, 0, this.orbR).setDepth(12),
      (o) => o.setVisible(false),
    );
  }

  // ---------- 좌표 ----------
  centerX(col) { return (col + 0.5) * this.cellW; }
  centerY(row) { return this.top + (row + 0.5) * this.cellH; }

  /** 블록 충돌 사각형 (표시와 동일, 패딩 포함) */
  bounds(cell) {
    return {
      x: cell.col * this.cellW + this.pad,
      y: this.top + cell.row * this.cellH + this.pad,
      w: this.cellW - this.pad * 2,
      h: this.cellH - this.pad * 2,
    };
  }

  /** 사각 영역에 걸친 칸만 순회 */
  query(x0, y0, x1, y1, cb) {
    const c0 = Math.max(0, Math.floor(x0 / this.cellW));
    const c1 = Math.min(this.cols - 1, Math.floor(x1 / this.cellW));
    const r0 = Math.max(0, Math.floor((y0 - this.top) / this.cellH));
    const r1 = Math.min(this.rows - 1, Math.floor((y1 - this.top) / this.cellH));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = this.cells[r][c];
        if (cell) cb(cell);
      }
    }
  }

  forEachCell(cb) {
    for (const row of this.cells) for (const cell of row) if (cell) cb(cell);
  }

  // ---------- 생성·하강 ----------
  /** buildStageRow() 결과를 맨 윗줄에 배치 */
  placeRow(defs) {
    defs.forEach((def, col) => {
      if (!def) return;
      const cell = { ...def, col, row: 0, maxHp: def.hp ?? 0, view: null };
      this.cells[0][col] = cell;
      if (cell.kind === 'block') this.showBlock(cell);
      else this.showOrb(cell);
      this.fadeIn(cell);
    });
  }

  /** 전체 1줄 하강. 맨 아랫줄의 구슬은 사라진다(블록은 그 전에 게임오버). */
  shiftDown() {
    for (let r = this.rows - 1; r >= 0; r--) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.cells[r][c];
        if (!cell) continue;
        this.cells[r][c] = null;
        if (r === this.rows - 1) { this.remove(cell, false); continue; }
        cell.row = r + 1;
        this.cells[r + 1][c] = cell;
        this.moveView(cell);
      }
    }
  }

  reachedBottom() {
    return this.cells[this.rows - 1].some((c) => c && c.kind === 'block');
  }

  // ---------- 피해 ----------
  /**
   * 모든 피해는 여기로. onHit 리스너가 ctx.damage 를 바꿀 수 있다.
   * @returns 실제로 들어간 피해
   */
  damage(cell, amount, source) {
    if (!cell || cell.kind !== 'block' || cell.dead) return 0;
    const ctx = { cell, damage: amount, source };
    this.bus.emit(EV.HIT, ctx);
    const dmg = Math.max(0, ctx.damage);
    cell.hp -= dmg;
    if (cell.hp <= 0.0001) {
      cell.dead = true;
      this.bus.emit(EV.KILL, { cell, source, overkill: -cell.hp });
      this.remove(cell, true);
    } else {
      this.refreshBlock(cell);
    }
    return dmg;
  }

  collectOrb(cell, ball, gain) {
    if (cell.kind !== 'orb' || cell.dead) return;
    cell.dead = true;
    const ctx = { cell, ball, gain };
    this.bus.emit(EV.ORB_COLLECT, ctx);
    this.remove(cell, true);
    return ctx.gain;
  }

  remove(cell, fromGrid) {
    if (fromGrid && this.cells[cell.row][cell.col] === cell) this.cells[cell.row][cell.col] = null;
    if (!cell.view) return;
    this.scene.tweens.killTweensOf(this.viewTargets(cell));
    if (cell.kind === 'block') this.blockPool.release(cell.view);
    else this.orbPool.release(cell.view);
    cell.view = null;
  }

  // ---------- 표시 ----------
  /** 색 기준 체력 (턴마다 스테이지 체력×2로 갱신) */
  setRefHp(v) {
    this.refHp = Math.max(1, v);
    this.forEachCell((c) => c.kind === 'block' && this.refreshBlock(c));
  }

  colorFor(hp) {
    const t = Math.min(1, hp / this.refHp);
    return this.colors[Math.min(this.colors.length - 1, Math.floor(t * this.colors.length))];
  }

  showBlock(cell) {
    const v = this.blockPool.get();
    cell.view = v;
    v.rect.setVisible(true).setAlpha(1).setScale(1);
    v.label.setVisible(true).setAlpha(1);
    v.rect.setPosition(this.centerX(cell.col), this.centerY(cell.row));
    v.label.setPosition(v.rect.x, v.rect.y);
    this.refreshBlock(cell);
  }

  refreshBlock(cell) {
    const v = cell.view;
    if (!v) return;
    cell.color = this.colorFor(cell.hp);
    v.rect.setFillStyle(cell.color, this.theme.blockFillAlpha);
    v.rect.setStrokeStyle(this.theme.blockStroke, cell.color, 1);
    v.label.setText(String(Math.ceil(cell.hp)));
  }

  showOrb(cell) {
    const o = this.orbPool.get();
    cell.view = o;
    cell.color = hex(this.theme.orb);
    o.setVisible(true).setAlpha(1).setScale(1);
    o.setFillStyle(cell.color, 0.25).setStrokeStyle(3, cell.color, 1);
    o.setPosition(this.centerX(cell.col), this.centerY(cell.row));
  }

  viewTargets(cell) {
    if (!cell.view) return [];
    return cell.kind === 'block' ? [cell.view.rect, cell.view.label] : [cell.view];
  }

  moveView(cell) {
    const targets = this.viewTargets(cell);
    if (!targets.length) return;
    this.scene.tweens.add({
      targets, y: this.centerY(cell.row), duration: this.anim.shiftMs, ease: 'Quad.easeOut',
    });
  }

  fadeIn(cell) {
    const targets = this.viewTargets(cell);
    for (const t of targets) t.setAlpha(0);
    this.scene.tweens.add({ targets, alpha: 1, duration: this.anim.shiftMs * 1.5 });
  }
}
