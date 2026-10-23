// #region CELL 1: 路由管理與畫面切換控制
let activeChessGame = null;

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
}

function showChessModeMenu() {
  hideAllViews();
  modeMenuSection.classList.remove('hidden');
  btnBackMenu.classList.remove('hidden');
}

function showOnlineLobby() {
  hideAllViews();
  onlineLobbySection.classList.remove('hidden');
  btnBackMenu.classList.remove('hidden');
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

  if (!activeChessGame) {
    const { initChessGame } = await import('./chinese-chess/game.js');
    activeChessGame = initChessGame();
  } else {
    activeChessGame.restart();
  }
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
    showChessModeMenu();
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

