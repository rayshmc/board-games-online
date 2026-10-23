// #region CELL 1: CONTROLLER INIT & OVERLAY TIMING (1.2S)
import { getInitialBoard, isValidMoveStrict, isInCheck, getAllLegalMoves, RED, BLACK } from './rules.js';
import { BoardRenderer } from './board.js';
import { sounds } from './audio.js';

class GameController {
  constructor() {
    this.canvas = document.getElementById('chess-board');
    this.renderer = new BoardRenderer(this.canvas);
    this.turnIndicator = document.getElementById('turn-indicator');
    
    this.board = getInitialBoard();
    this.turn = RED;
    this.selected = null;
    this.lastMove = null;
    this.history = [];
    this.isGameOver = false;

    this.overlayText = null;
    this.overlayAlpha = 0;
    this.overlayTimer = null;

    this.init();
  }

  init() {
    window.addEventListener('resize', () => this.render());
    this.canvas.addEventListener('click', (e) => this.handleClick(e));

    document.getElementById('btn-restart').addEventListener('click', () => this.restart());
    document.getElementById('btn-undo').addEventListener('click', () => this.undo());

    this.renderer.resize();
    this.render();
  }

  restart() {
    this.board = getInitialBoard();
    this.turn = RED;
    this.selected = null;
    this.lastMove = null;
    this.history = [];
    this.isGameOver = false;
    this.clearOverlay();
    this.updateStatus();
    this.render();
  }

  undo() {
    if (this.history.length === 0) return;
    const lastState = this.history.pop();
    this.board = lastState.board;
    this.turn = lastState.turn;
    this.lastMove = lastState.lastMove;
    this.selected = null;
    this.isGameOver = false;
    this.clearOverlay();
    this.updateStatus();
    this.render();
  }

  clearOverlay() {
    if (this.overlayTimer) clearInterval(this.overlayTimer);
    this.overlayText = null;
    this.overlayAlpha = 0;
  }

  triggerOverlay(title, subtitle = null) {
    this.clearOverlay();
    this.overlayText = { title, subtitle };
    this.overlayAlpha = 1.0;

    setTimeout(() => {
      this.overlayTimer = setInterval(() => {
        this.overlayAlpha -= 0.1;
        if (this.overlayAlpha <= 0) {
          this.overlayAlpha = 0;
          this.overlayText = null;
          clearInterval(this.overlayTimer);
        }
        this.render();
      }, 50);
    }, 700);
  }
// #endregion

// #region CELL 2: INPUT HANDLING & MOVE EXECUTION WITH CAPTURE SOUND
  handleClick(e) {
    if (this.isGameOver) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const cell = this.renderer.getCellFromPoint(x, y);
    if (!cell) return;

    const { row, col } = cell;
    const piece = this.board[row][col];

    if (this.selected) {
      if (this.selected.row === row && this.selected.col === col) {
        this.selected = null;
      } else if (piece && piece.startsWith(this.turn)) {
        this.selected = { row, col };
      } else if (isValidMoveStrict(this.board, this.selected.row, this.selected.col, row, col, this.turn)) {
        this.makeMove(this.selected, { row, col });
      }
    } else if (piece && piece.startsWith(this.turn)) {
      this.selected = { row, col };
    }

    this.render();
  }

  makeMove(from, to) {
    this.history.push({
      board: JSON.parse(JSON.stringify(this.board)),
      turn: this.turn,
      lastMove: this.lastMove
    });

    const targetPiece = this.board[to.row][to.col];
    const piece = this.board[from.row][from.col];

    // 判斷是吃子還是普通走棋
    if (targetPiece) {
      sounds.playCapture();
    } else {
      sounds.playMove ();
    }

    this.board[to.row][to.col] = piece;
    this.board[from.row][from.col] = null;

    this.lastMove = { from, to };
    this.selected = null;
    this.turn = this.turn === RED ? BLACK : RED;

    this.checkGameState();
    this.render();
  }
// #endregion

// #region CELL 3: GAME STATUS EVALUATION & UI RENDERING
  checkGameState() {
    const checking = isInCheck(this.board, this.turn);
    const legalMoves = getAllLegalMoves(this.board, this.turn);

    if (legalMoves.length === 0) {
      this.isGameOver = true;
      const winner = this.turn === RED ? '黑方' : '紅方';

      if (checking) {
        this.updateStatus(`絕殺！${winner}獲勝！`, 'winner');
        this.triggerOverlay('絕殺！');
      } else {
        this.updateStatus(`困斃！${winner}獲勝！`, 'winner');
        this.triggerOverlay('困斃！');
      }
      // 播放獲勝勝利音效
      sounds.playWin();

    } else if (checking) {
      const attacker = this.turn === RED ? '黑方' : '紅方';
      const defender = this.turn === RED ? '紅方' : '黑方';
      
      this.updateStatus(`⚠️ ${attacker}叫將，${defender}須應將！`, 'check');
      this.triggerOverlay('將軍！');
      
      // 播放將軍提示音效
      sounds.playCheck();
    } else {
      this.updateStatus();
    }
  }

  updateStatus(customMsg = null, type = null) {
    if (customMsg) {
      this.turnIndicator.textContent = customMsg;
      this.turnIndicator.className = type === 'check' ? 'turn check' : 'turn winner';
      return;
    }

    if (this.turn === RED) {
      this.turnIndicator.className = 'turn red';
      this.turnIndicator.textContent = "紅方走棋";
    } else {
      this.turnIndicator.className = 'turn black';
      this.turnIndicator.textContent = "黑方走棋";
    }
  }

  getKingPos(color) {
    const target = `${color}_k`;
    for (let r = 0; r < 10; r++) {
      for (let c = 3; c <= 5; c++) {
        if (this.board[r][c] === target) return { row: r, col: c };
      }
    }
    return null;
  }

  render() {
    this.renderer.resize();
    const inCheck = isInCheck(this.board, this.turn);
    const kingPos = inCheck ? this.getKingPos(this.turn) : null;
    this.renderer.draw(
      this.board, 
      this.selected, 
      this.lastMove, 
      kingPos, 
      this.overlayText, 
      this.overlayAlpha,
      this.isGameOver
    );
  }
}

export function initChessGame() {
  return new GameController();
}
// #endregion