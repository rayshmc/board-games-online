// #region CELL 1: CONSTANTS & INITIAL BOARD SETUP
export const RED = 'r';
export const BLACK = 'b';

export function getInitialBoard() {
  return [
    ['b_r', 'b_n', 'b_b', 'b_a', 'b_k', 'b_a', 'b_b', 'b_n', 'b_r'],
    [ null,  null,  null,  null,  null,  null,  null,  null,  null ],
    [ null, 'b_c',  null,  null,  null,  null,  null, 'b_c',  null ],
    ['b_p',  null, 'b_p',  null, 'b_p',  null, 'b_p',  null, 'b_p'],
    [ null,  null,  null,  null,  null,  null,  null,  null,  null ],
    // ---------------------- RIVER ----------------------
    [ null,  null,  null,  null,  null,  null,  null,  null,  null ],
    ['r_p',  null, 'r_p',  null, 'r_p',  null, 'r_p',  null, 'r_p'],
    [ null, 'r_c',  null,  null,  null,  null,  null, 'r_c',  null ],
    [ null,  null,  null,  null,  null,  null,  null,  null,  null ],
    ['r_r', 'r_n', 'r_b', 'r_a', 'r_k', 'r_a', 'r_b', 'r_n', 'r_r']
  ];
}
// #endregion

// #region CELL 2: BASIC PIECE MOVEMENT VALIDATION
export function isValidMoveBasic(board, fromRow, fromCol, toRow, toCol, turn) {
  const piece = board[fromRow][fromCol];
  if (!piece) return false;

  const [color, type] = piece.split('_');
  if (color !== turn) return false;

  const target = board[toRow][toCol];
  if (target && target.startsWith(color)) return false;

  const dx = toCol - fromCol;
  const dy = toRow - fromRow;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  switch (type) {
    case 'k':
      if (!isInPalace(toRow, toCol, color)) return false;
      return absDx + absDy === 1;

    case 'a':
      if (!isInPalace(toRow, toCol, color)) return false;
      return absDx === 1 && absDy === 1;

    case 'b':
      if (color === RED && toRow < 5) return false;
      if (color === BLACK && toRow > 4) return false;
      if (absDx === 2 && absDy === 2) {
        const eyeRow = fromRow + dy / 2;
        const eyeCol = fromCol + dx / 2;
        return !board[eyeRow][eyeCol];
      }
      return false;

    case 'n':
      if ((absDx === 1 && absDy === 2) || (absDx === 2 && absDy === 1)) {
        const legRow = absDy === 2 ? fromRow + dy / 2 : fromRow;
        const legCol = absDx === 2 ? fromCol + dx / 2 : fromCol;
        return !board[legRow][legCol];
      }
      return false;

    case 'r':
      if (dx !== 0 && dy !== 0) return false;
      return countPiecesBetween(board, fromRow, fromCol, toRow, toCol) === 0;

    case 'c':
      if (dx !== 0 && dy !== 0) return false;
      const count = countPiecesBetween(board, fromRow, fromCol, toRow, toCol);
      return target ? count === 1 : count === 0;

    case 'p':
      const forward = color === RED ? -1 : 1;
      if (dy === forward && dx === 0) return true;
      const crossedRiver = color === RED ? fromRow <= 4 : fromRow >= 5;
      if (crossedRiver && dy === 0 && absDx === 1) return true;
      return false;
  }
  return false;
}

function isInPalace(row, col, color) {
  if (col < 3 || col > 5) return false;
  return color === RED ? row >= 7 && row <= 9 : row >= 0 && row <= 2;
}

function countPiecesBetween(board, r1, c1, r2, c2) {
  let count = 0;
  const dr = Math.sign(r2 - r1);
  const dc = Math.sign(c2 - c1);
  let currR = r1 + dr;
  let currC = c1 + dc;

  while (currR !== r2 || currC !== c2) {
    if (board[currR][currC]) count++;
    currR += dr;
    currC += dc;
  }
  return count;
}
// #endregion

// #region CELL 3: CHECK, CHECKMATE & STALEMATE LOGIC
export function isFlyingGeneral(board) {
  let redK = null, blackK = null;
  for (let r = 0; r < 10; r++) {
    for (let c = 3; c <= 5; c++) {
      if (board[r][c] === 'r_k') redK = { r, c };
      if (board[r][c] === 'b_k') blackK = { r, c };
    }
  }
  if (redK && blackK && redK.c === blackK.c) {
    return countPiecesBetween(board, redK.r, redK.c, blackK.r, blackK.c) === 0;
  }
  return false;
}

function findKing(board, color) {
  const target = `${color}_k`;
  for (let r = 0; r < 10; r++) {
    for (let c = 3; c <= 5; c++) {
      if (board[r][c] === target) return { r, c };
    }
  }
  return null;
}

export function isInCheck(board, color) {
  const kingPos = findKing(board, color);
  if (!kingPos) return false;

  const opponentColor = color === RED ? BLACK : RED;
  if (isFlyingGeneral(board)) return true;

  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const piece = board[r][c];
      if (piece && piece.startsWith(opponentColor)) {
        if (isValidMoveBasic(board, r, c, kingPos.r, kingPos.c, opponentColor)) {
          return true;
        }
      }
    }
  }
  return false;
}

export function isValidMoveStrict(board, fromR, fromC, toR, toC, turn) {
  if (!isValidMoveBasic(board, fromR, fromC, toR, toC, turn)) return false;

  const tempBoard = board.map(row => [...row]);
  tempBoard[toR][toC] = tempBoard[fromR][fromC];
  tempBoard[fromR][fromC] = null;

  if (isInCheck(tempBoard, turn)) return false;
  return true;
}

export function getAllLegalMoves(board, turn) {
  const moves = [];
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const piece = board[r][c];
      if (piece && piece.startsWith(turn)) {
        for (let tr = 0; tr < 10; tr++) {
          for (let tc = 0; tc < 9; tc++) {
            if (isValidMoveStrict(board, r, c, tr, tc, turn)) {
              moves.push({ from: { row: r, col: c }, to: { row: tr, col: tc } });
            }
          }
        }
      }
    }
  }
  return moves;
}
// #endregion