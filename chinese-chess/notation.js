// #region CELL 1: 中式記譜法 (Traditional Chinese chess notation)
// Converts a move (board + from/to) into standard Chinese chess notation, e.g.
//   炮二平五, 馬8進7, 車一進三, 前馬退三.
//
// Board coordinates: row 0..9 (row 0 = Black's home rank), col 0..8
// (col 0 = the left edge as displayed with Black on top).
//   - Red files are numbered 一..九 from Red's right to left  => file = 9 - col
//   - Black files are numbered 1..9 from Black's right to left => file = col + 1
// Movement words are from the mover's own perspective (進 = forward).

const RED_DIGITS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const BLACK_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

// Piece display characters (match the board renderer).
const NAMES = {
  r_k: '帥', r_a: '仕', r_b: '相', r_n: '傌', r_r: '俥', r_c: '砲', r_p: '兵',
  b_k: '將', b_a: '士', b_b: '象', b_n: '馬', b_r: '車', b_c: '炮', b_p: '卒'
};

function digit(side, n) {
  const arr = side === 'r' ? RED_DIGITS : BLACK_DIGITS;
  return arr[n - 1] || String(n);
}

// File number (1..9) of a column, from the perspective of `side`.
function fileNum(col, side) {
  return side === 'r' ? (9 - col) : (col + 1);
}

// Build the disambiguation prefix (前 / 後 / 中) when two or more pieces of the
// SAME type and side share the same file. Returns '' when no prefix is needed
// (in which case the caller includes the starting file number in the name).
function disambiguation(board, piece, fromRow, fromCol, side) {
  // Find all same-type pieces of this side on the same column.
  const rowsSameFile = [];
  for (let r = 0; r < 10; r++) {
    if (board[r][fromCol] === piece) rowsSameFile.push(r);
  }
  if (rowsSameFile.length < 2) return '';

  rowsSameFile.sort((a, b) => a - b);
  // "Front" is the piece nearest the opponent: smallest row for Red, largest
  // row for Black.
  if (side === 'r') {
    const frontRow = rowsSameFile[0];
    const backRow = rowsSameFile[rowsSameFile.length - 1];
    if (fromRow === frontRow) return '前';
    if (fromRow === backRow) return '後';
    return '中';
  } else {
    const frontRow = rowsSameFile[rowsSameFile.length - 1];
    const backRow = rowsSameFile[0];
    if (fromRow === frontRow) return '前';
    if (fromRow === backRow) return '後';
    return '中';
  }
}

export function moveToNotation(board, from, to) {
  const piece = board[from.row][from.col];
  if (!piece) return '';
  const side = piece[0];       // 'r' or 'b'
  const type = piece[2];       // 'k','a','b','n','r','c','p'
  const name = NAMES[piece] || '';

  const dr = to.row - from.row;
  const dc = to.col - from.col;

  // Direction word.
  let dirWord;
  if (dr === 0) {
    dirWord = '平';
  } else {
    const forward = side === 'r' ? (dr < 0) : (dr > 0);
    dirWord = forward ? '進' : '退';
  }

  // Trailing number.
  let tail;
  const toFile = fileNum(to.col, side);
  if (dr === 0) {
    // Horizontal move -> destination file.
    tail = digit(side, toFile);
  } else {
    // Straight-line movers (車/炮/將帥/兵卒) moving vertically report the NUMBER
    // OF STEPS; everything else reports the destination FILE.
    const straight = (type === 'r' || type === 'c' || type === 'k' || type === 'p');
    if (straight && dc === 0) {
      tail = digit(side, Math.abs(dr));
    } else {
      tail = digit(side, toFile);
    }
  }

  // Leading part: either "前馬" style (ambiguous file) or "炮二" style.
  const prefix = disambiguation(board, piece, from.row, from.col, side);
  const head = prefix
    ? (prefix + name)
    : (name + digit(side, fileNum(from.col, side)));

  return head + dirWord + tail;
}
// #endregion
