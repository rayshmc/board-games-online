// #region CELL 1: 遊戲控制器初始化與狀態管理
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
    this.overlayStartTimeout = null;
    this.overlayInterval = null;

    this.init();
  }

  init() {
    window.addEventListener('resize', () => this.render());
    this.canvas.addEventListener('click', (e) => this.handleClick(e));

    this.attachLocalActionHandlers();

    this.renderer.resize();
    this.render();
  }

  // Local (hotseat) controls. Online mode overrides these via initOnlineActions().
  attachLocalActionHandlers() {
    const btnRestart = document.getElementById('btn-restart');
    const btnUndo = document.getElementById('btn-undo');
    if (btnRestart) btnRestart.addEventListener('click', () => this.restart());
    if (btnUndo) btnUndo.addEventListener('click', () => this.undo());
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
    if (this.overlayStartTimeout) clearTimeout(this.overlayStartTimeout);
    if (this.overlayInterval) clearInterval(this.overlayInterval);
    this.overlayStartTimeout = null;
    this.overlayInterval = null;
    this.overlayText = null;
    this.overlayAlpha = 0;
  }

    triggerOverlay(title, subtitle = null, options = {}) {
    // options:
    //   startDelay (ms)  – how long the text stays fully visible before fading
    //   fadeDuration (ms)– how long the fade-out takes
    //   steps (int)      – number of fade steps (smoothness)
    //   persist (bool)   – if true, never fade (e.g. final result the player
    //                      should read at their own pace)
    this.clearOverlay();
    this.overlayText = { title, subtitle };
    this.overlayAlpha = 1.0;

    const startDelay = options.startDelay != null ? options.startDelay : 1600;
    const fadeDuration = options.fadeDuration != null ? options.fadeDuration : 900;
    const steps = options.steps != null ? options.steps : 30;
    const persist = !!options.persist;

    // Draw the fully-opaque overlay immediately (not after a delay).
    this.render();

    if (persist) {
      // Keep it on screen; a later clearOverlay()/restart will remove it.
      return;
    }

    const stepMs = Math.max(16, Math.round(fadeDuration / steps));
    const decrement = 1 / steps;

    this.overlayStartTimeout = setTimeout(() => {
      this.overlayInterval = setInterval(() => {
        this.overlayAlpha -= decrement;
        if (this.overlayAlpha <= 0) {
          this.overlayAlpha = 0;
          this.overlayText = null;
          clearInterval(this.overlayInterval);
          this.overlayInterval = null;
        }
        this.render();
      }, stepMs);
    }, startDelay);
  }
// #endregion

// #region CELL 2: 點擊互動與走子邏輯
  handleClick(e) {
    if (this.isGameOver) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 根據當前執子方判定是否翻轉棋盤來計算點擊格子
    const isFlipped = (this.turn === BLACK);
    const cell = this.renderer.getCellFromPoint(x, y, isFlipped);
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

    if (targetPiece) {
      sounds.playCapture();
    } else {
      sounds.playMove();
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

// #region CELL 3: 狀態判定與畫面渲染
    checkGameState() {
    const checking = isInCheck(this.board, this.turn);
    const legalMoves = getAllLegalMoves(this.board, this.turn);

    if (legalMoves.length === 0) {
      this.isGameOver = true;
      // Winner color code is the OPPOSITE of the side to move (they have no moves).
      const winnerColor = this.turn === RED ? BLACK : RED;
      const winner = winnerColor === RED ? '紅方' : '黑方';
      // Delegate presentation/termination to a hook so online mode can also
      // persist the result and return players to the room.
      this.onTerminal({ winnerColor, winner, reason: checking ? 'checkmate' : 'stalemate', checking });
    } else if (checking) {
      const attacker = this.turn === RED ? '黑方' : '紅方';
      const defender = this.turn === RED ? '紅方' : '黑方';

      this.updateStatus(`${attacker}叫將，${defender}須應將！`, 'check');
      this.triggerOverlay('將軍！', null, { startDelay: 1200, fadeDuration: 1000 });
      sounds.playCheck();
    } else {
      this.updateStatus();
    }
  }

  // Default (local / hotseat) terminal handling: just show the result overlay.
  // Online mode overrides this to also write the result to Firebase.
  onTerminal({ winner, reason, checking }) {
    if (reason === 'stalemate') {
      this.updateStatus(`困斃！${winner}獲勝！`, 'winner');
      this.triggerOverlay('困斃！', `${winner}勝出`, { persist: true });
    } else {
      this.updateStatus(`絕殺！${winner}獲勝！`, 'winner');
      this.triggerOverlay('絕殺！', `${winner}勝出`, { persist: true });
    }
    sounds.playWin();
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
    
    // 當輪到黑方時自動將棋盤旋轉翻轉180度
    const isFlipped = (this.turn === BLACK);

    this.renderer.draw(
      this.board, 
      this.selected, 
      this.lastMove, 
      kingPos, 
      this.overlayText, 
      this.overlayAlpha,
      this.isGameOver,
      isFlipped
    );
  }
}

export function initChessGame() {
  return new GameController();
}
// #endregion

// #region CELL 4: 線上對局控制器 (修復棋盤空白、強制首幀渲染與即時同步)
import { getDatabase, ref, set, update, remove, get, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Firebase drops `null` array/holes and turns arrays into objects with string
// keys. When a board written with `set()` is read back it is a sparse object,
// which breaks `board[row][col]` access. Rebuild it into a proper 10x9 array.
function normalizeBoard(rawBoard) {
  const empty = getInitialBoard();
  if (!rawBoard) return empty;

  const result = [];
  for (let r = 0; r < 10; r++) {
    const row = [];
    const srcRow = rawBoard[r] !== undefined ? rawBoard[r] : (rawBoard[String(r)] || {});
    for (let c = 0; c < 9; c++) {
      let v = srcRow[c] !== undefined ? srcRow[c] : srcRow[String(c)];
      row.push(v == null ? null : v);
    }
    result.push(row);
  }
  return result;
}

// Firebase stores arrays as objects with string keys and drops nulls, so a
// history array echoed back can be a sparse object. Rebuild it into a proper
// ordered array of snapshots (each with a normalized board).
function normalizeHistory(rawHistory) {
  if (!rawHistory) return [];
  const list = [];
  // Object-with-numeric-keys form.
  if (!Array.isArray(rawHistory) && typeof rawHistory === 'object') {
    Object.keys(rawHistory)
      .map(k => ({ k, idx: Number(k) }))
      .filter(e => !Number.isNaN(e.idx))
      .sort((a, b) => a.idx - b.idx)
      .forEach(e => list.push(rawHistory[e.k]));
  } else if (Array.isArray(rawHistory)) {
    rawHistory.forEach(v => { if (v) list.push(v); });
  }
  return list
    .filter(s => s && s.board)
    .map(s => ({
      board: normalizeBoard(s.board),
      turn: s.turn,
      lastMove: s.lastMove || null,
      moveCount: s.moveCount || 0
    }));
}

// A lightweight, non-blocking toast for short feedback messages ("已發送請求…").
// Avoids stacking blocking window.alert() dialogs on top of confirmation boxes,
// which is jarring during a live game.
function showToast(message, durationMs = 2600) {
  let host = document.getElementById('game-toast');
  if (!host) {
    host = document.createElement('div');
    host.id = 'game-toast';
    host.className = 'game-toast';
    document.body.appendChild(host);
  }
  host.textContent = message;
  host.classList.add('show');
  if (showToast._timer) clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => host.classList.remove('show'), durationMs);
}

export function initOnlineChessGame(roomData, userId, role) {
  class OnlineGameController extends GameController {
    constructor(room, uid, playerRole) {
      super();
      // roomData is the room object passed in; roomId must be supplied explicitly.
      this.roomId = (room && (room.roomId || room.id)) || (roomData && roomData.roomId) || null;
      this.userId = uid;

      if (!this.roomId) {
        console.error('initOnlineChessGame: roomId 缺失，無法同步線上對局。');
      }

      if (room.redPlayer && room.redPlayer.id === this.userId) {
        this.role = 'red';
      } else if (room.blackPlayer && room.blackPlayer.id === this.userId) {
        this.role = 'black';
      } else {
        this.role = playerRole || 'spectator';
      }

      this.isFixedFlipped = (this.role === 'black');

      // 1. 強制確保 DOM 畫布存在並設置尺寸
      this.canvas = document.getElementById('chess-board');
      this.ctx = this.canvas.getContext('2d');

      // 2. 立即進行首幀渲染（避免黑屏/空白）
      this.render();

      // 3. 視圖剛顯示時版面可能尚未完成 reflow，下一次動畫幀再渲染一次，
      //    確保棋盤量到正確寬度（否則 canvas 會是 0x0 而空白）。
      requestAnimationFrame(() => this.render());
      setTimeout(() => this.render(), 60);

      // 4. 綁定即時資料庫同步
      this.initRealtimeSync();
      this.initOnlineActions();
    }

        initRealtimeSync() {
          const db = getDatabase();
          const gameStateRef = ref(db, `rooms/${this.roomId}/gameState`);
          this._unsubscribers = this._unsubscribers || [];

          const unsubState = onValue(gameStateRef, (snapshot) => {
        if (snapshot.exists()) {
          const state = snapshot.val();
          // Rebuild the board into a proper 2D array (Firebase drops nulls).
          this.board = normalizeBoard(state.board);
          if (state.turn) this.turn = state.turn;
                    this.lastMove = state.lastMove || null;
                    this.moveCount = state.moveCount || 0;
                    // Keep local undo history in sync with what is stored online.
                    this._stateHistory = normalizeHistory(state.history);

                                        // Reflect a shared result (win/lose/draw) so BOTH players AND
          // spectators see the same ending, then return everyone to the room.
          if (state.result) {
            this.applySharedResult(state.result);
          } else {
            this.checkGameState();
          }
          this.render();
        } else if (!this.stateWritten) {
          // 若無對局資料，由紅方或房主初始化寫入預設棋盤
          if (this.role === 'red' || this.role === 'host') {
            this.stateWritten = true;
            set(gameStateRef, {
              board: this.board,
              turn: this.turn,
              lastMove: null,
              moveCount: 0
            }).catch(err => console.error('初始化線上棋盤失敗：', err));
          }
        }
            }, (err) => {
        console.error('讀取線上對局狀態失敗（可能是讀取規則限制）：', err);
      });
      this._unsubscribers.push(unsubState);

      // Watch for incoming undo/restart/draw requests from the opponent.
      this.initRequestWatcher();

      // Allow online.js to tear this controller down when returning to the room.
      window.__teardownOnlineChess = () => this.teardown();
    }

        makeMove(from, to) {
      // Snapshot the pre-move state and keep a history stack so an accepted
      // undo can roll back to a well-defined earlier position (online undo
      // must revert the requester's own move AND the opponent's reply).
      const snapshot = {
        board: JSON.parse(JSON.stringify(this.board)),
        turn: this.turn,
        lastMove: this.lastMove || null,
        moveCount: this.moveCount || 0
      };
      const history = Array.isArray(this._stateHistory) ? this._stateHistory.slice() : [];
      history.push(snapshot);
      // Cap to avoid unbounded growth; 60 plies (~30 moves each) is plenty.
      if (history.length > 60) history.shift();
      this._stateHistory = history;

      super.makeMove(from, to);

      this.moveCount = (this.moveCount || 0) + 1;

            const db = getDatabase();
      const gameStateRef = ref(db, `rooms/${this.roomId}/gameState`);
      const payload = {
        board: this.board,
        turn: this.turn,
        lastMove: this.lastMove,
        moveCount: this.moveCount,
        history
      };
      // If this move ended the game, persist the result in the SAME write so it
      // is never clobbered by a later set().
      if (this._pendingResult) {
        payload.result = this._pendingResult;
      }
      set(gameStateRef, payload);

      // Now that the final position + result are committed, schedule the return
      // to the room (only the side that ended the game has _pendingResult set;
      // the other side picks the result up via onValue → applySharedResult).
      if (this._pendingResult && !this._resultRecorded) {
        this._resultRecorded = true;
        this.finishOnlineGame();
      }
    }

    // Shared result model: gameState.result = { winner:'r'|'b', reason, outcome:'reason' }
    // or the string 'draw'. Writing it here makes win/lose/draw visible to the
    // opponent AND spectators, and lets every client converge.
    writeResult(result) {
      const gameStateRef = ref(getDatabase(), `rooms/${this.roomId}/gameState`);
      // Merge (not overwrite) so the current board snapshot is preserved.
      return update(gameStateRef, { result }).catch(err => console.error('寫入對局結果失敗：', err));
    }

        // Called by the base checkGameState when a side has no legal moves.
    // NOTE: this runs *inside* super.makeMove(), before our own gameState write,
    // so we stash the result and let makeMove() persist it together with the
    // final board snapshot (avoids a race where a later set() wipes the result).
    onTerminal({ winnerColor, winner, reason }) {
      if (this._resultRecorded) return;
      this._pendingResult = { winner: winnerColor, reason };
      this.updateStatus(`${reason === 'stalemate' ? '困斃' : '絕殺'}！${winner}獲勝！`, 'winner');
      this.triggerOverlay(reason === 'stalemate' ? '困斃！' : '絕殺！', `${winner}勝出`, { persist: true });
      sounds.playWin();
    }

        // Render a result that came from Firebase (opponent's move, resignation, or
    // agreed draw). Called for players and spectators alike. Idempotent: only
    // the first time we see a result do we show it and schedule the return.
    applySharedResult(result) {
      if (!result) return;
      const resultKey = typeof result === 'string' ? result : `${result.winner}:${result.reason}`;
      if (this._appliedResultKey === resultKey) {
        // Already showing this exact result; keep the overlay drawn.
        this.isGameOver = true;
        return;
      }
      this._appliedResultKey = resultKey;
      this._resultRecorded = true;
      this.isGameOver = true;

      let title, subtitle;
      if (result === 'draw' || result.outcome === 'draw' || result.reason === 'draw') {
        title = '和棋';
        subtitle = '雙方同意';
        this.updateStatus('雙方和棋', 'winner');
      } else {
        const winnerColor = result.winner;
        const winner = winnerColor === RED ? '紅方' : '黑方';
        if (result.reason === 'resign') {
          title = '認輸投降';
        } else if (result.reason === 'stalemate') {
          title = '困斃！';
        } else {
          title = '絕殺！';
        }
        subtitle = `${winner}勝出`;
        this.updateStatus(`${title} ${winner}獲勝！`, 'winner');
      }

      this.clearOverlay();
      this.overlayText = { title, subtitle };
      this.overlayAlpha = 1.0;
      sounds.playWin();
      this.render();
      this.finishOnlineGame();
    }

    // After a result is shown, give the players a few seconds to read it, then
    // return everyone to the room (which resets seats + board for a rematch).
    finishOnlineGame() {
      if (this._finishScheduled) return;
      this._finishScheduled = true;
      setTimeout(() => {
        if (typeof window.__onOnlineGameEnded === 'function') {
          window.__onOnlineGameEnded(this.roomId);
        } else if (typeof window.__returnToOnlineLobby === 'function') {
          window.__returnToOnlineLobby();
        }
      }, 2600);
    }

    // Detach all Firebase listeners so a finished board can be safely discarded
    // when we return to the room view.
    teardown() {
      if (this._unsubscribers) {
        this._unsubscribers.forEach(fn => { try { fn(); } catch (e) {} });
        this._unsubscribers = [];
      }
      this.clearOverlay();
    }

    // ----- Request protocol (undo / restart / draw) -------------------------
    // A player writes rooms/{roomId}/request = { type, fromId, fromName,
    // status:'pending', ts }. The opponent sees it and either accepts (the
    // acceptor performs the state change, then flips status) or declines.
    // The sender watches status to show accurate feedback.
        initRequestWatcher() {
      const db = getDatabase();
      const requestRef = ref(db, `rooms/${this.roomId}/request`);
      this._unsubscribers = this._unsubscribers || [];

      const unsubReq = onValue(requestRef, (snap) => {
        if (!snap.exists()) {
          this._requestShownFor = null;
          return;
        }
        const req = snap.val();
        if (!req || !req.type) return;

        const isMine = req.fromId === this.userId;

        if (isMine) {
          // Sender side: react to the outcome decided by the opponent.
          if (req.status === 'accepted') {
            showToast('對手同意了你的請求。');
          } else if (req.status === 'declined') {
            showToast('對手拒絕了你的請求。');
          }
          // Clear the finished request node shortly after, whoever we are,
          // once it is no longer pending.
          if (req.status && req.status !== 'pending') {
            this.scheduleRequestCleanup(req.ts);
          }
          return;
        }

        // Receiver side: show the prompt when a NEW pending request arrives.
        if (req.status !== 'pending') {
          this.scheduleRequestCleanup(req.ts);
          return;
        }
                if (this._requestShownFor === req.ts) return; // already showing this one
        this._requestShownFor = req.ts;
        this.showRequestPrompt(req);
      }, (err) => {
        console.error('讀取對手指令請求失敗：', err);
      });
      this._unsubscribers.push(unsubReq);
    }

    scheduleRequestCleanup(ts) {
      if (this._cleanupScheduledFor === ts) return;
      this._cleanupScheduledFor = ts;
      setTimeout(() => {
        remove(ref(getDatabase(), `rooms/${this.roomId}/request`)).catch(() => {});
        this._requestShownFor = null;
        this._cleanupScheduledFor = null;
      }, 1500);
    }

    showRequestPrompt(req) {
      const modal = document.getElementById('request-modal');
      const titleEl = document.getElementById('request-title');
      const msgEl = document.getElementById('request-message');
      const btnAccept = document.getElementById('btn-request-accept');
      const btnDecline = document.getElementById('btn-request-decline');
      if (!modal || !btnAccept || !btnDecline) return;

      const labels = {
        undo: { title: '對手請求悔棋', msg: `${req.fromName || '對手'} 請求悔棋，是否同意？` },
        restart: { title: '對手請求重開', msg: `${req.fromName || '對手'} 請求重新開始本局，是否同意？` },
        draw: { title: '對手請求和棋', msg: `${req.fromName || '對手'} 請求此局和棋，是否同意？` }
      };
      const info = labels[req.type] || { title: '對手請求', msg: '對手向你發出了一個請求。' };
      if (titleEl) titleEl.textContent = info.title;
      if (msgEl) msgEl.textContent = info.msg;

      // Replace buttons to avoid stacked handlers.
      const freshAccept = btnAccept.cloneNode(true);
      const freshDecline = btnDecline.cloneNode(true);
      btnAccept.parentNode.replaceChild(freshAccept, btnAccept);
      btnDecline.parentNode.replaceChild(freshDecline, btnDecline);

      modal.classList.remove('hidden');

      const close = () => { modal.classList.add('hidden'); };

      freshAccept.onclick = () => {
        close();
        this.handleAcceptRequest(req);
      };
      freshDecline.onclick = () => {
        close();
        this.handleDeclineRequest(req);
      };
    }

    setRequestStatus(req, status) {
      const db = getDatabase();
      return update(ref(db, `rooms/${this.roomId}/request`), {
        status,
        respondedBy: this.userId,
        respondedAt: Date.now()
      }).catch(err => console.error('更新請求狀態失敗：', err));
    }

    handleDeclineRequest(req) {
      this.setRequestStatus(req, 'declined');
      // The watcher on both sides will clean the node up.
    }

    handleAcceptRequest(req) {
      const db = getDatabase();
      const gameStateRef = ref(db, `rooms/${this.roomId}/gameState`);

            if (req.type === 'undo') {
        get(gameStateRef).then(snap => {
          if (!snap.exists()) return;
          const state = snap.val();
          const history = normalizeHistory(state.history);

          // The requester's color (fromColor). We roll the position back until
          // it is the requester's turn again — normally two plies (their move
          // + the opponent's reply), but only one if the opponent hasn't
          // replied yet.
          const requesterColor = req.fromColor || (req.fromId === this.userId ? (this.role === 'red' ? 'r' : 'b') : null);

          if (history.length === 0) {
            this.setRequestStatus(req, 'declined');
            showToast('目前沒有可悔棋的紀錄。');
            return;
          }

          // Pop snapshots from the end until the resulting turn equals the
          // requester's color (and we've popped at least one). Each popped
          // entry is a state we can restore.
          let restored = null;
          const working = history.slice();
          while (working.length > 0) {
            const candidate = working.pop();
            restored = candidate;
            if (!requesterColor || candidate.turn === requesterColor) {
              break;
            }
          }

          if (!restored) {
            this.setRequestStatus(req, 'declined');
            showToast('目前沒有可悔棋的紀錄。');
            return;
          }

          set(gameStateRef, {
            board: restored.board,
            turn: restored.turn,
            lastMove: restored.lastMove || null,
            moveCount: restored.moveCount || 0,
            history: working
          }).then(() => this.setRequestStatus(req, 'accepted'))
            .catch(err => console.error('悔棋套用失敗：', err));
        }).catch(err => console.error('讀取對局狀態失敗：', err));

            } else if (req.type === 'restart') {
        const fresh = getInitialBoard();
        set(gameStateRef, {
          board: fresh,
          turn: RED,
          lastMove: null,
          moveCount: 0,
          history: []
        }).then(() => this.setRequestStatus(req, 'accepted'))
          .catch(err => console.error('重開套用失敗：', err));

      } else if (req.type === 'draw') {
        get(gameStateRef).then(snap => {
          const state = snap.exists() ? snap.val() : {};
          set(gameStateRef, {
            board: state.board || this.board,
            turn: state.turn || this.turn,
            lastMove: state.lastMove || null,
            moveCount: state.moveCount || 0,
            result: 'draw'
          }).then(() => this.setRequestStatus(req, 'accepted'))
            .catch(err => console.error('和棋套用失敗：', err));
        }).catch(err => console.error('讀取對局狀態失敗：', err));
      }
    }

        // Called by an action button: write a pending request for the opponent.
    sendRequest(type) {
      const db = getDatabase();
      const requestRef = ref(db, `rooms/${this.roomId}/request`);
      set(requestRef, {
        type,
        fromId: this.userId,
        fromName: this.role === 'red' ? '紅方' : (this.role === 'black' ? '黑方' : '對手'),
        // Color code of the requester (r/b) so undo can roll back to THEIR turn.
        fromColor: this.role === 'red' ? 'r' : (this.role === 'black' ? 'b' : null),
        status: 'pending',
        ts: Date.now()
      }).catch(err => {
        console.error('發送請求失敗：', err);
        showToast('請求發送失敗，請確認 Firebase 寫入規則。');
      });
    }

        initOnlineActions() {
      const btnRestart = document.getElementById('btn-restart');
      const btnUndo = document.getElementById('btn-undo');
      const btnSurrender = document.getElementById('btn-surrender');
      const btnDraw = document.getElementById('btn-draw');

      // super() already attached local hotseat handlers via addEventListener.
      // Clone-replace them to drop those listeners so online mode does not
      // also run the local restart()/undo() logic.
      const stripListeners = (el) => {
        if (!el) return null;
        const clone = el.cloneNode(true);
        el.parentNode.replaceChild(clone, el);
        return clone;
      };
      const restartEl = stripListeners(btnRestart);
      const undoEl = stripListeners(btnUndo);
      const surrenderEl = stripListeners(btnSurrender);

      if (this.role === 'spectator') {
        if (restartEl) restartEl.disabled = true;
        if (undoEl) undoEl.disabled = true;
        if (surrenderEl) surrenderEl.disabled = true;
        if (btnDraw) btnDraw.disabled = true;
        return;
      }

            if (restartEl) restartEl.onclick = () => {
        if (this.isGameOver) { showToast('本局已結束，即將回到對局桌。'); return; }
        if (confirm('確定要向對手發送「請求重開」嗎？')) {
          this.sendRequest('restart');
          showToast('已發送重開請求，等待對手確認…');
        }
      };

      if (undoEl) undoEl.onclick = () => {
        if (this.isGameOver) { showToast('本局已結束，無法悔棋。'); return; }
        if ((this.moveCount || 0) === 0) {
          showToast('目前沒有可以悔棋的紀錄！');
          return;
        }
        if (confirm('確定要向對手發送「請求悔棋」嗎？')) {
          this.sendRequest('undo');
          showToast('已發送悔棋請求，等待對手同意…');
        }
      };

            if (surrenderEl) surrenderEl.onclick = () => {
        if (this.isGameOver) {
          showToast('本局已結束。');
          return;
        }
        if (confirm('確定要直接「認輸投降」放棄本局嗎？此動作無法復原。')) {
          // The resigner loses; the winner is the opposite side.
          const winnerColor = this.role === 'red' ? BLACK : RED;
          this._resultRecorded = true;
          this.isGameOver = true;
          // Write the result so the OPPONENT and SPECTATORS see it too.
          this.writeResult({ winner: winnerColor, reason: 'resign' });
          this.finishOnlineGame();
        }
      };

      btnDraw.onclick = () => {
        if (this.isGameOver) { showToast('本局已結束。'); return; }
        if (confirm('確定要向對手發送「請求和棋」嗎？')) {
          this.sendRequest('draw');
          showToast('已發送和棋請求，等待對手回覆…');
        }
      };
    }

    handleClick(e) {
      if (this.isGameOver) return;
      if (this.role === 'spectator') return;

      const currentTurnColor = this.turn; 
      const myColorCode = (this.role === 'red') ? 'r' : 'b';

      if (currentTurnColor !== myColorCode) {
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const cell = this.renderer.getCellFromPoint(x, y, this.isFixedFlipped);
      if (!cell) return;

      const { row, col } = cell;
      const piece = this.board[row][col];

      if (this.selected) {
        if (this.selected.row === row && this.selected.col === col) {
          this.selected = null;
        } else if (piece && piece.startsWith(myColorCode)) {
          this.selected = { row, col };
        } else if (isValidMoveStrict(this.board, this.selected.row, this.selected.col, row, col, this.turn)) {
          this.makeMove(this.selected, { row, col });
        }
      } else if (piece && piece.startsWith(myColorCode)) {
        this.selected = { row, col };
      }

      this.render();
    }

        render() {
      if (!this.renderer) return;
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
        this.isGameOver, 
        this.isFixedFlipped
      );

      // One-time diagnostic so a blank board can be traced precisely.
      if (!this._diagLogged) {
        this._diagLogged = true;
        const parent = this.canvas.parentElement;
        console.log('[online-board] diag', {
          role: this.role,
          roomId: this.roomId,
          canvasW: this.canvas.width,
          canvasH: this.canvas.height,
          parentW: parent ? parent.getBoundingClientRect().width : null,
          boardRows: Array.isArray(this.board) ? this.board.length : typeof this.board,
          boardRow0: this.board && this.board[0],
          viewVisible: !this.canvas.closest('.view-section.hidden')
        });
      }
    }
  }

  return new OnlineGameController(roomData, userId, role);
}
// #endregion