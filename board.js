// #region CELL 1: CHAR MAP & SETUP
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
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);

    this.padding = rect.width * 0.08;
    this.cellSize = (rect.width - this.padding * 2) / 8;
  }

  getCoords(row, col) {
    return {
      x: this.padding + col * this.cellSize,
      y: this.padding + row * this.cellSize
    };
  }

  getCellFromPoint(x, y) {
    const col = Math.round((x - this.padding) / this.cellSize);
    const row = Math.round((y - this.padding) / this.cellSize);
    if (row >= 0 && row < 10 && col >= 0 && col < 9) {
      return { row, col };
    }
    return null;
  }
// #endregion

// #region CELL 2: MAIN DRAW DISPATCHER & HIGHLIGHTS
  draw(board, selected, lastMove, checkingKingPos = null, overlayText = null, overlayAlpha = 0, isGameOver = false) {
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);

    this.ctx.clearRect(0, 0, width, height);
    this.drawGrid();

    if (lastMove) {
      this.highlightCell(lastMove.from, 'rgba(255, 235, 59, 0.35)');
      this.highlightCell(lastMove.to, 'rgba(255, 235, 59, 0.5)');
    }

    if (checkingKingPos) {
      this.highlightCell(checkingKingPos, 'rgba(244, 67, 54, 0.65)');
    }

    if (selected) {
      this.drawSelectionRing(selected);
    }

    this.drawPieces(board);

    // 繪製中央彈窗或警示橫幅
    if (overlayText && overlayAlpha > 0) {
      this.drawOnBoardOverlay(width, height, overlayText, overlayAlpha, isGameOver);
    }
  }

  highlightCell(cell, color) {
    const { x, y } = this.getCoords(cell.row, cell.col);
    this.ctx.beginPath();
    this.ctx.arc(x, y, this.cellSize * 0.44, 0, Math.PI * 2);
    this.ctx.fillStyle = color;
    this.ctx.fill();
  }

  drawSelectionRing(cell) {
    const { x, y } = this.getCoords(cell.row, cell.col);
    this.ctx.beginPath();
    this.ctx.arc(x, y, this.cellSize * 0.46, 0, Math.PI * 2);
    this.ctx.strokeStyle = '#4caf50';
    this.ctx.lineWidth = 4;
    this.ctx.stroke();
  }
// #endregion

// #region CELL 3: BOARD GRID & PIECES RENDERING
  drawGrid() {
    const ctx = this.ctx;
    ctx.strokeStyle = '#5c4033';
    ctx.lineWidth = 2;

    for (let r = 0; r < 10; r++) {
      const p1 = this.getCoords(r, 0);
      const p2 = this.getCoords(r, 8);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    for (let c = 0; c < 9; c++) {
      const p1 = this.getCoords(0, c);
      const p2 = this.getCoords(4, c);
      const p3 = this.getCoords(5, c);
      const p4 = this.getCoords(9, c);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.stroke();
    }

    this.drawLine(0, 3, 2, 5); this.drawLine(0, 5, 2, 3);
    this.drawLine(7, 3, 9, 5); this.drawLine(7, 5, 9, 3);

    ctx.font = `bold ${this.cellSize * 0.45}px sans-serif`;
    ctx.fillStyle = '#5c4033';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const riverY = this.padding + 4.5 * this.cellSize;
    ctx.fillText('楚 河', this.padding + 2 * this.cellSize, riverY);
    ctx.fillText('漢 界', this.padding + 6 * this.cellSize, riverY);
  }

  drawLine(r1, c1, r2, c2) {
    const p1 = this.getCoords(r1, c1);
    const p2 = this.getCoords(r2, c2);
    this.ctx.beginPath();
    this.ctx.moveTo(p1.x, p1.y);
    this.ctx.lineTo(p2.x, p2.y);
    this.ctx.stroke();
  }

  drawPieces(board) {
    const radius = this.cellSize * 0.4;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const piece = board[r][c];
        if (!piece) continue;

        const { x, y } = this.getCoords(r, c);
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

// #region CELL 4: ON-BOARD OVERLAY & GAMEOVER POPUP (1.2S TEMPORARY)
  drawOnBoardOverlay(width, height, text, alpha, isGameOver = false) {
    const ctx = this.ctx;
    ctx.save();
    
    if (isGameOver) {
      // 絕殺 / 困斃 專屬勝負對話框 (Pop-up Box) - 只純粹顯示「絕殺！」或「困斃！」
      const boxWidth = width * 0.65;
      const boxHeight = this.cellSize * 1.8;
      const boxX = (width - boxWidth) / 2;
      const boxY = (height - boxHeight) / 2;

      // 彈窗背景與金邊框
      ctx.fillStyle = `rgba(33, 33, 33, ${0.92 * alpha})`;
      ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

      ctx.strokeStyle = `rgba(255, 215, 0, ${alpha})`;
      ctx.lineWidth = 4;
      ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

      // 純粹顯示「絕殺！」大字
      ctx.font = `bold ${this.cellSize * 0.9}px "Kaiti SC", "KaiTi", sans-serif`;
      ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text.title, width / 2, height / 2);

    } else {
      // 普通叫將（將軍！）橫幅
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