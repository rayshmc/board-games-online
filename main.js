// #region CELL 1: DOM ELEMENTS & ROUTER STATE
let activeChessGame = null;

const menuSection = document.getElementById('game-menu');
const chessSection = document.getElementById('view-chinese-chess');
const goSection = document.getElementById('view-go');
const btnBackMenu = document.getElementById('btn-back-menu');

function showMenu() {
  menuSection.classList.remove('hidden');
  chessSection.classList.add('hidden');
  goSection.classList.add('hidden');
  btnBackMenu.classList.add('hidden');
}
// #endregion

// #region CELL 2: GAME LAUNCHER & DYNAMIC MODULE LOADING
async function launchChineseChess() {
  menuSection.classList.add('hidden');
  chessSection.classList.remove('hidden');
  btnBackMenu.classList.remove('hidden');

  if (!activeChessGame) {
    const { initChessGame } = await import('./chinese-chess/game.js');
    activeChessGame = initChessGame();
  } else {
    activeChessGame.render();
  }
}
// #endregion

// #region CELL 3: EVENT LISTENERS & INITIALIZATION
document.querySelectorAll('.game-card').forEach(card => {
  card.addEventListener('click', () => {
    const gameType = card.dataset.game;
    if (gameType === 'chinese-chess') {
      launchChineseChess();
    }
  });
});

btnBackMenu.addEventListener('click', showMenu);
document.getElementById('btn-home').addEventListener('click', showMenu);
// #endregion