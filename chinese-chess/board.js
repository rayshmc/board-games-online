// #region CELL 1: 字體對應與渲染器初始化
const CHAR_MAP = {
  'r_k': '帥', 'r_a': '仕', 'r_b': '相', 'r_n': '傌', 'r_r': '俥', 'r_c': '砲', 'r_p': '兵',
  'b_k': '將', 'b_a': '士', 'b_b': '象', 'b_n': '馬', 'b_r': '車', 'b_c': '炮', 'b_p': '卒'
};

export class BoardRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.padding = 0;
    this.cellSize = 0;
    this.lastBoard = null;
    this.lastOpts = null;

    // Keep the canvas correctly sized even if it was laid out while hidden
    // (e.g. an online game view that is only un-hidden right before init).
    if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
      this._ro = new ResizeObserver(() => this._redrawLast());
      this._ro.observe(canvas.parentElement);
    }
  }

  _redrawLast() {
    if (!this.lastBoard) return;
    this.resize();
    this.draw(
      this.lastBoard,
      this.lastOpts.selected,
      this.lastOpts.lastMove,
      this.lastOpts.checkingKingPos,
      this.lastOpts.overlayText,
            this.lastOpts.overlayAlpha,
      this.lastOpts.isGameOver,
      this.lastOpts.isFlipped
    );
  }

  // Release the ResizeObserver so a discarded renderer (e.g. the previous
  // controller after switching between local and online play) stops redrawing
  // the shared canvas.
  destroy() {
    if (this._ro) {
      this._ro.disconnect();
      this._ro = null;
    }
    this.lastBoard = null;
    this.lastOpts = null;
  }

  resize() {
    const parent = this.canvas.parentElement;
    let width = parent ? parent.getBoundingClientRect().width : 0;
    // Fall back to an explicit width if the container has not been laid out yet.
    if (!width) {
      width = this.canvas.clientWidth || 0;
    }
    // Last resort: if the container is hidden/unmeasured (0), use a sane
    // default so the board is never blank/collapsed. A ResizeObserver tick
    // will correct the size once the element gets real dimensions.
    let usedFallback = false;
    if (!width) {
      width = 360;
      usedFallback = true;
    }

    const dpr = window.devicePixelRatio || 1;
    const height = width * (10 / 9);

    // Reset any previous transform before applying DPR scale, otherwise
    // repeated resize() calls (invoked every render) compound the scale.
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.scale(dpr, dpr);

    this.cssWidth = width;
    this.cssHeight = height;
    this.padding = width * 0.08;
    this.cellSize = (width - this.padding * 2) / 8;
    return !usedFallback;
  }

  // 支援根據當前執子方自動旋轉棋盤座標
  getCoords(row, col, isFlipped) {
    const actualRow = isFlipped ? 9 - row : row;
    const actualCol = isFlipped ? 8 - col : col;
    return {
      x: this.padding + actualCol * this.cellSize,
      y: this.padding + actualRow * this.cellSize
    };
  }

  getCellFromPoint(x, y, isFlipped) {
    const col = Math.round((x - this.padding) / this.cellSize);
    const row = Math.round((y - this.padding) / this.cellSize);
    if (row >= 0 && row < 10 && col >= 0 && col < 9) {
      return {
        row: isFlipped ? 9 - row : row,
        col: isFlipped ? 8 - col : col
      };
    }
    return null;
  }
// #endregion

// #region CELL 2: 繪製調度與高亮顯示
    draw(board, selected, lastMove, checkingKingPos = null, overlayText = null, overlayAlpha = 0, isGameOver = false, isFlipped = false) {
    // Remember the latest state so a later ResizeObserver tick can redraw it.
    this.lastBoard = board;
    this.lastOpts = { selected, lastMove, checkingKingPos, overlayText, overlayAlpha, isGameOver, isFlipped };

    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.width / dpr;
    const height = this.canvas.height / dpr;

    if (!width || !height) return; // not laid out yet

    this.ctx.clearRect(0, 0, width, height);
    this.drawGrid(isFlipped);

    if (lastMove) {
      this.highlightCell(lastMove.from, 'rgba(255, 235, 59, 0.35)', isFlipped);
      this.highlightCell(lastMove.to, 'rgba(255, 235, 59, 0.5)', isFlipped);
    }

    if (checkingKingPos) {
      this.highlightCell(checkingKingPos, 'rgba(244, 67, 54, 0.65)', isFlipped);
    }

    if (selected) {
      this.drawSelectionRing(selected, isFlipped);
    }

    this.drawPieces(board, isFlipped);

    if (overlayText && overlayAlpha > 0) {
      this.drawOnBoardOverlay(width, height, overlayText, overlayAlpha, isGameOver);
    }
  }

  highlightCell(cell, color, isFlipped) {
    const { x, y } = this.getCoords(cell.row, cell.col, isFlipped);
    this.ctx.beginPath();
    this.ctx.arc(x, y, this.cellSize * 0.44, 0, Math.PI * 2);
    this.ctx.fillStyle = color;
    this.ctx.fill();
  }

  drawSelectionRing(cell, isFlipped) {
    const { x, y } = this.getCoords(cell.row, cell.col, isFlipped);
    this.ctx.beginPath();
    this.ctx.arc(x, y, this.cellSize * 0.46, 0, Math.PI * 2);
    this.ctx.strokeStyle = '#4caf50';
    this.ctx.lineWidth = 4;
    this.ctx.stroke();
  }
// #endregion

// #region CELL 3: 棋盤網格與棋子繪製
  drawGrid(isFlipped) {
    const ctx = this.ctx;
    ctx.strokeStyle = '#5c4033';
    ctx.lineWidth = 2;

    for (let r = 0; r < 10; r++) {
      const p1 = this.getCoords(r, 0, isFlipped);
      const p2 = this.getCoords(r, 8, isFlipped);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    for (let c = 0; c < 9; c++) {
      const p1 = this.getCoords(0, c, isFlipped);
      const p2 = this.getCoords(4, c, isFlipped);
      const p3 = this.getCoords(5, c, isFlipped);
      const p4 = this.getCoords(9, c, isFlipped);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.stroke();
    }

    this.drawLine(0, 3, 2, 5, isFlipped); 
    this.drawLine(0, 5, 2, 3, isFlipped);
    this.drawLine(7, 3, 9, 5, isFlipped); 
    this.drawLine(7, 5, 9, 3, isFlipped);

            ctx.font = `bold ${this.cellSize * 0.45}px sans-serif`;
    ctx.fillStyle = '#5c4033';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // The river band sits between logical rows 4 and 5. In screen space it is
    // always centered at row 4.5 regardless of board orientation, so compute
    // the Y directly (creating fragile flip-dependent offsets caused the text
    // to be drawn outside the river on the flipped/black board).
    const riverCenterY = this.padding + 4.5 * this.cellSize;
    const leftCol = this.getCoords(0, 2, isFlipped);   // x honours horizontal flip
    const rightCol = this.getCoords(0, 6, isFlipped);
    ctx.fillText('楚 河', leftCol.x, riverCenterY);
    ctx.fillText('漢 界', rightCol.x, riverCenterY);
  }

  drawLine(r1, c1, r2, c2, isFlipped) {
    const p1 = this.getCoords(r1, c1, isFlipped);
    const p2 = this.getCoords(r2, c2, isFlipped);
    this.ctx.beginPath();
    this.ctx.moveTo(p1.x, p1.y);
    this.ctx.lineTo(p2.x, p2.y);
    this.ctx.stroke();
  }

  drawPieces(board, isFlipped) {
    const radius = this.cellSize * 0.4;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const piece = board[r][c];
        if (!piece) continue;

        const { x, y } = this.getCoords(r, c, isFlipped);
        const isRed = piece.startsWith('r');

        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fillStyle = '#fbe9e7';
        this.ctx.fill();
        this.ctx.lineWidth = 3;
        this.ctx.strokeStyle = isRed ? '#d32f2f' : '#212121';
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(x, y, radius * 0.82, 0, Math.PI * 2);
        this.ctx.lineWidth = 1;
        this.ctx.stroke();

        this.ctx.font = `bold ${radius * 1.1}px "Kaiti SC", "KaiTi", sans-serif`;
        this.ctx.fillStyle = isRed ? '#d32f2f' : '#212121';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(CHAR_MAP[piece], x, y);
      }
    }
  }
// #endregion

// #region CELL 4: 彈窗提示覆蓋層繪製
    drawOnBoardOverlay(width, height, text, alpha, isGameOver = false) {
    const ctx = this.ctx;
    ctx.save();
    
    if (isGameOver) {
      const boxWidth = width * 0.72;
      const boxHeight = this.cellSize * 2.2;
      const boxX = (width - boxWidth) / 2;
      const boxY = (height - boxHeight) / 2;

      ctx.fillStyle = `rgba(33, 33, 33, ${0.92 * alpha})`;
      ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

      ctx.strokeStyle = `rgba(255, 215, 0, ${alpha})`;
      ctx.lineWidth = 4;
      ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

      // Title (e.g. 認輸投降 / 絕殺！). If there is a subtitle, nudge the title
      // up a little to leave room for it.
      const hasSubtitle = !!(text.subtitle);
      const titleY = hasSubtitle ? height / 2 - this.cellSize * 0.42 : height / 2;

      ctx.font = `bold ${this.cellSize * 0.9}px "Kaiti SC", "KaiTi", sans-serif`;
      ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text.title, width / 2, titleY);

      if (hasSubtitle) {
        ctx.font = `bold ${this.cellSize * 0.5}px "Kaiti SC", "KaiTi", sans-serif`;
        ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * alpha})`;
        ctx.fillText(text.subtitle, width / 2, height / 2 + this.cellSize * 0.42);
      }

    } else {
      const bannerHeight = this.cellSize * 1.2;
      const bannerY = (height - bannerHeight) / 2;
      
      ctx.fillStyle = `rgba(211, 47, 47, ${0.85 * alpha})`;
      ctx.fillRect(0, bannerY, width, bannerHeight);

      ctx.strokeStyle = `rgba(255, 215, 0, ${alpha})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(0, bannerY, width, bannerHeight);

      ctx.font = `bold ${this.cellSize * 0.75}px "Kaiti SC", "KaiTi", sans-serif`;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text.title, width / 2, height / 2);
    }

    ctx.restore();
  }
}
// #endregion