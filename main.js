// #region CELL 1: 路由管理與畫面切換控制
let activeChessGame = null;
// Separate handle for the local (hotseat) controller so it can be torn down
// even after `activeChessGame` has been taken over by an online controller.
let localChessGame = null;

const menuSection = document.getElementById('game-menu');
const modeMenuSection = document.getElementById('chess-mode-menu');
const onlineLobbySection = document.getElementById('view-online-lobby');
const chessSection = document.getElementById('view-chinese-chess');
const roomSection = document.getElementById('view-room-room');
const goSection = document.getElementById('view-go');
const btnBackMenu = document.getElementById('btn-back-menu');

function hideAllViews() {
  [menuSection, modeMenuSection, onlineLobbySection, chessSection, roomSection, goSection].forEach(sec => {
    if (sec) sec.classList.add('hidden');
  });
}

function showMainLobby() {
  hideAllViews();
  menuSection.classList.remove('hidden');
  btnBackMenu.classList.add('hidden');
  document.body.classList.remove('online-chess');
}

function showChessModeMenu() {
  hideAllViews();
  modeMenuSection.classList.remove('hidden');
  btnBackMenu.classList.remove('hidden');
  document.body.classList.remove('online-chess');
}

function showOnlineLobby() {
  hideAllViews();
  onlineLobbySection.classList.remove('hidden');
  btnBackMenu.classList.remove('hidden');
  document.body.classList.remove('online-chess');
}

function showRoomView() {
  hideAllViews();
  if (roomSection) roomSection.classList.remove('hidden');
  btnBackMenu.classList.remove('hidden');
}
// #endregion

// #region CELL 2: 啟動象棋本機雙人與線上大廳初始化
async function launchChineseChessLocalPvP() {
  hideAllViews();
  chessSection.classList.remove('hidden');
  btnBackMenu.classList.remove('hidden');

  // Local hotseat is not an online board: drop the online-only layout class.
  document.body.classList.remove('online-chess');

        // Hide online-only UI (player names + move record) when playing locally.
    const nameBar = document.getElementById('player-name-bar');
    const recPanel = document.getElementById('move-record-panel');
    const specBanner = document.getElementById('spectator-banner');
    const sideColumn = document.getElementById('online-side-column');
    if (nameBar) nameBar.classList.add('hidden');
    if (recPanel) recPanel.classList.add('hidden');
    if (specBanner) specBanner.classList.add('hidden');
    // Spectator list + chat room only exist for online matches.
    if (sideColumn) sideColumn.classList.add('hidden');

    // 認輸 / 和棋 only exist for online games.
    ['btn-surrender', 'btn-draw'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });

    // Clear any leftover online button handlers / disabled state so local play
    // isn't blocked or double-triggered after an online session.
    ['btn-restart', 'btn-undo', 'btn-surrender', 'btn-draw'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.onclick = null; el.disabled = false; }
    });

  // If the previous game was an ONLINE controller, tear it down and start a
  // fresh local controller (the online one locks input to a single colour).
  if (activeChessGame && activeChessGame.roomId) {
    if (typeof window.__teardownOnlineChess === 'function') {
      try { window.__teardownOnlineChess(); } catch (e) { /* ignore */ }
    }
    window.__teardownOnlineChess = null;
    activeChessGame = null;
  }

  // Dispose any previous LOCAL controller first: online mode clone-replaces the
  // action buttons, so a stale controller would keep a dead listener (and its
  // canvas click handler would fight the new one).
  if (localChessGame) {
    try { localChessGame.teardown(); } catch (e) { /* ignore */ }
    localChessGame = null;
    activeChessGame = null;
  }

  const { initChessGame } = await import('./chinese-chess/game.js');
  localChessGame = initChessGame();
  activeChessGame = localChessGame;
}
// #endregion

// #region CELL 3: 事件綁定與路由監聽
document.querySelectorAll('.game-card').forEach(card => {
  card.addEventListener('click', () => {
    if (card.dataset.game === 'chinese-chess') {
      showChessModeMenu();
    }
  });
});

document.querySelectorAll('.mode-card').forEach(card => {
  card.addEventListener('click', () => {
    const modeType = card.dataset.mode;
    if (modeType === 'local-pvp') {
      launchChineseChessLocalPvP();
    } else if (modeType === 'online-pvp') {
      showOnlineLobby();
      import('./chinese-chess/online.js').then(module => module.initOnlineLobby());
    }
  });
});

btnBackMenu.addEventListener('click', () => {
  if (roomSection && !roomSection.classList.contains('hidden')) {
    // Leaving an online room view: release seat / delete empty room, then lobby.
    const hook = window.__leaveOnlineRoom;
    if (typeof hook === 'function') hook();
    showOnlineLobby();
  } else if (!onlineLobbySection.classList.contains('hidden')) {
    showChessModeMenu();
  } else if (!chessSection.classList.contains('hidden')) {
    // An ONLINE board: "返回" goes back to the room browser (lobby list)
    // instead of the mode menu. Leaving mid-game releases the seat and marks
    // the room waiting again, exactly like the in-room 返回 button does.
    if (activeChessGame && activeChessGame.roomId) {
      if (typeof window.__teardownOnlineChess === 'function') {
        try { window.__teardownOnlineChess(); } catch (e) { /* ignore */ }
      }
      window.__teardownOnlineChess = null;
      activeChessGame = null;
      const hook = window.__leaveOnlineRoom;
      if (typeof hook === 'function') hook();
      showOnlineLobby();
    } else {
      // Local hotseat keeps the original behaviour.
      showChessModeMenu();
    }
  } else {
    showMainLobby();
  }
});

document.getElementById('btn-home').addEventListener('click', () => {
  if (roomSection && !roomSection.classList.contains('hidden')) {
    const hook = window.__leaveOnlineRoom;
    if (typeof hook === 'function') hook();
  }
  showMainLobby();
});
// #endregion

// #region CELL 4: 對外路由 API 供線上模組使用
// online.js needs to switch views and start the online game without a full reload.
export function showRoomRoute() {
  showRoomView();
}

export function returnToOnlineLobby() {
  showOnlineLobby();
}

export async function launchOnlineChess(roomData, userId, role) {
  // If a previous online game controller is still alive (e.g. a rematch started
  // very quickly after the last game ended), tear it down first so we don't
  // stack duplicate Firebase listeners on the same room.
  if (typeof window.__teardownOnlineChess === 'function') {
    try { window.__teardownOnlineChess(); } catch (e) { /* ignore */ }
    window.__teardownOnlineChess = null;
  }

  // The local hotseat controller shares the same canvas / buttons, so dispose
  // it before the online controller attaches its own listeners.
  if (localChessGame) {
    try { localChessGame.teardown(); } catch (e) { /* ignore */ }
    localChessGame = null;
  }

  hideAllViews();
  chessSection.classList.remove('hidden');
  btnBackMenu.classList.remove('hidden');

  const { initOnlineChessGame } = await import('./chinese-chess/game.js');
  activeChessGame = initOnlineChessGame(roomData, userId, role);
  return activeChessGame;
}

// Expose navigation on window so online.js can switch views synchronously and
// reliably (avoids depending on dynamic re-import of this entry module, which
// can fail silently in some dev-server setups). online.js calls these directly.
window.__showRoomRoute = showRoomRoute;
window.__returnToOnlineLobby = returnToOnlineLobby;
window.__showOnlineLobby = showOnlineLobby;
window.__showChessModeMenu = showChessModeMenu;
window.__launchOnlineChess = launchOnlineChess;
// #endregion

