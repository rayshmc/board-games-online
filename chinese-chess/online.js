// #region CELL 1: 線上大廳核心、分頁可見性偵測與唯一性驗證
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, get, push, remove, onValue, update, onDisconnect, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getInitialBoard, RED } from './rules.js';

const firebaseConfig = {
  databaseURL: "https://board-games-online-65a0c-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let currentUsername = '';
// Persist the user id across reloads so a returning player keeps the same id
// (otherwise old rooms they hosted look "ownerless" and get cleaned up).
let myUserId = getOrCreateUserId();
let currentRoomId = null;
let roomUnsubscribe = null;
let myRole = null;
let isTabActive = true;

// Identify the player. This MUST be unique per page load / tab. Storing it in
// localStorage shares one id across the whole profile, and even sessionStorage
// can be COPIED when a tab is duplicated — either way two tabs end up with the
// same id, which collapses the online-presence count to 1 and lets the same
// username slip through. Generating a fresh unique id on every page load makes
// two tabs always distinct online players. (Username is the real identity and
// is restored separately from localStorage.)
function getOrCreateUserId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return 'user_' + window.crypto.randomUUID();
  }
  return 'user_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
}

// Firebase keys cannot contain . # $ [ ] / — encode the username for use as a
// node key in the ownership registry.
function encodeName(name) {
  return encodeURIComponent(name).replace(/\./g, '%2E');
}

// Atomically claim a username so two players can never both hold the same one.
// Returns true if this client owns the name afterwards.
async function claimUsername(name) {
  const key = encodeName(name);
  const nameRef = ref(db, `taken_names/${key}`);
  try {
    const result = await runTransaction(nameRef, (current) => {
      // Empty / null => free to claim. Already mine => keep. Otherwise abort.
      if (current === null || current === undefined || current === '' || current === myUserId) {
        return myUserId;
      }
      return; // abort: taken by someone else
    });
    return result.committed && result.snapshot.val() === myUserId;
  } catch (err) {
    // If the write was denied by Firebase rules (e.g. taken_names not allowed),
    // fall back to a best-effort snapshot uniqueness check so the app is not
    // blocked. The atomic guarantee only applies when the node is writable.
    console.warn('使用者名稱原子註冊失敗，改用快照比對：', err);
    return fallbackNameIsUnique(name);
  }
}

// Best-effort uniqueness check against online_users (used only if the atomic
// registry is unavailable due to database rules).
async function fallbackNameIsUnique(name) {
  try {
    const snapshot = await get(ref(db, 'online_users'));
    if (!snapshot.exists()) return true;
    let unique = true;
    snapshot.forEach(child => {
      const userData = child.val();
      if (child.key !== myUserId && userData && userData.username === name) {
        unique = false;
      }
    });
    return unique;
  } catch (err) {
    console.error('使用者名稱比對失敗：', err);
    return true;
  }
}

// Is this username currently held by a *different* live player? Used before
// restoring a saved identity so we can warn the user up-front instead of
// silently pushing them back into the generic "pick a name" form.
async function isUsernameTakenOnline(name) {
  if (!name) return false;
  try {
    const snapshot = await get(ref(db, 'online_users'));
    if (!snapshot.exists()) return false;
    const now = Date.now();
    let taken = false;
    snapshot.forEach(child => {
      const user = child.val();
      if (child.key === myUserId || !user) return;
      if (user.username === name && now - (user.lastSeen || 0) < ONLINE_WINDOW_MS) {
        taken = true;
      }
    });
    return taken;
  } catch (err) {
    console.error('查詢線上名稱使用狀況失敗：', err);
    return false;
  }
}

async function releaseUsername(name) {
  if (!name) return;
  const key = encodeName(name);
  try {
    await runTransaction(ref(db, `taken_names/${key}`), (current) => {
      if (current === myUserId) return null; // release only if I own it
      return; // abort: not mine
    });
  } catch (err) {
    console.error('釋放使用者名稱失敗：', err);
  }
}

// Navigation helpers -------------------------------------------------------
// main.js exposes these on window once it has evaluated. Using the synchronous
// hooks makes view switching reliable and never fails silently; only fall back
// to a dynamic import (with a logged error) if the hooks are not present yet.
function navigate(hookName, fallbackExportName) {
  const hook = window[hookName];
  if (typeof hook === 'function') {
    hook();
    return;
  }
  import('./main.js')
    .then(m => {
      if (m && typeof m[fallbackExportName] === 'function') {
        m[fallbackExportName]();
      } else {
        console.error(`導覽失敗：找不到 ${hookName} 或 ${fallbackExportName}`);
      }
    })
    .catch(err => console.error(`導覽失敗 (${hookName})：`, err));
}

function goToRoomView() {
  navigate('__showRoomRoute', 'showRoomRoute');
}

document.addEventListener('visibilitychange', () => {
  isTabActive = !document.hidden;
  updatePresenceStatus();
});

export function initOnlineLobby() {
  const sessionModal = document.getElementById('session-modal');
  const usernameModal = document.getElementById('username-modal');
  const input = document.getElementById('username-input');
  const errorMsg = document.getElementById('username-error');
  const submitBtn = document.getElementById('btn-submit-username');
  const sessionTipText = document.getElementById('session-tip-text');

  // Already identified during this page load (came back to the lobby from a
  // room): skip the identity modals and just (re)attach the lobby listeners.
  if (currentUsername) {
    document.getElementById('current-username-display').textContent = currentUsername;
    registerOnlinePresence();
    initLobbyListeners();
    setupRoomActionButtons();
    return;
  }

  const savedSession = localStorage.getItem('chess_session');

  // The saved name is no longer ours: explain why and let the user pick a new
  // one instead of dropping them into a blank name prompt with no explanation.
  const warnRestoredNameUnavailable = (name) => {
    currentUsername = '';
    localStorage.removeItem('chess_session');
    sessionModal.classList.add('hidden');
    input.value = '';
    input.placeholder = '請輸入新的暱稱...';
    errorMsg.textContent = `上次使用的名稱「${name}」目前已有其他線上玩家使用，請建立新的名稱。`;
    errorMsg.classList.remove('hidden');
    usernameModal.classList.remove('hidden');
    input.focus();
  };

  if (savedSession) {
    const sessionData = JSON.parse(savedSession);
    sessionTipText.textContent = `是否要恢復上次的身分「${sessionData.username}」？`;
    sessionModal.classList.remove('hidden');

    const yesBtn = document.getElementById('btn-session-yes');
    yesBtn.onclick = async () => {
      // Ignore extra taps while the availability check is in flight.
      if (yesBtn.disabled) return;
      const savedName = sessionData.username;
      currentUsername = savedName;
      // NOTE: do NOT adopt sessionData.userId here. Each tab keeps its own
      // sessionStorage-scoped id; reusing the stored id across tabs would make
      // two tabs collide as the same online user. Identity is the username.

      // Warn the user if another player is live with this name right now, then
      // re-claim the name atomically as a second line of defence (it may still
      // be reserved by a stale claim). Either way they must pick a new name.
      const originalLabel = yesBtn.textContent;
      yesBtn.disabled = true;
      yesBtn.textContent = '檢查名稱中...';

      const takenByLivePlayer = await isUsernameTakenOnline(savedName);
      let ok = false;
      if (!takenByLivePlayer) {
        ok = await claimUsername(savedName);
        if (!ok) {
          // Nobody live is using the name, so the claim is probably only still
          // reserved by our own previous session (the server-side onDisconnect
          // cleanup can land a beat late after a reload). Retry once before
          // telling the user the name is gone.
          await new Promise(resolve => setTimeout(resolve, 800));
          ok = !(await isUsernameTakenOnline(savedName)) && await claimUsername(savedName);
        }
      }

      yesBtn.disabled = false;
      yesBtn.textContent = originalLabel;

      if (!ok) {
        warnRestoredNameUnavailable(savedName);
        return;
      }

      sessionModal.classList.add('hidden');
      errorMsg.classList.add('hidden');
      document.getElementById('current-username-display').textContent = currentUsername;
      registerOnlinePresence();
      initLobbyListeners();
    };

    document.getElementById('btn-session-no').onclick = () => {
      localStorage.removeItem('chess_session');
      sessionModal.classList.add('hidden');
      errorMsg.classList.add('hidden');
      usernameModal.classList.remove('hidden');
    };
  } else {
    usernameModal.classList.remove('hidden');
  }

  submitBtn.onclick = async () => {
    const name = input.value.trim();
    if (!name) return;

    // Atomically claim the name. This blocks two players from using the same
    // username even if they submit at nearly the same time.
    const ok = await claimUsername(name);
    if (!ok) {
      errorMsg.textContent = "此名稱已被線上其他人使用，請更換名稱";
      errorMsg.classList.remove('hidden');
      return;
    }

    currentUsername = name;
    localStorage.setItem('chess_session', JSON.stringify({ username: currentUsername, userId: myUserId }));

    errorMsg.classList.add('hidden');
    input.placeholder = '輸入暱稱...';
    usernameModal.classList.add('hidden');
    document.getElementById('current-username-display').textContent = currentUsername;

    registerOnlinePresence();
    initLobbyListeners();
  };

  document.getElementById('btn-change-username').onclick = async () => {
    const oldName = currentUsername;
    localStorage.removeItem('chess_session');
    currentUsername = '';
    input.value = '';
    input.placeholder = '輸入暱稱...';
    errorMsg.classList.add('hidden');
    usernameModal.classList.remove('hidden');
    // Free up the old name so it can be reused.
    await releaseUsername(oldName);
  };

  // Once the player starts typing a different name, drop the "name is taken"
  // warning so the form does not look like it is still rejecting them.
  if (!input.dataset.warningBound) {
    input.dataset.warningBound = '1';
    input.addEventListener('input', () => errorMsg.classList.add('hidden'));
  }

  document.getElementById('btn-create-room').onclick = () => {
    createNewRoom();
  };

  // Wire up the in-room action buttons (join red/black, leave). Anyone who does
  // not take a seat is treated as a spectator automatically.
  setupRoomActionButtons();
}

// Keep a single room listener so we can unsubscribe when leaving/re-entering.
function attachRoomListener(roomId) {
  if (roomUnsubscribe) {
    roomUnsubscribe();
    roomUnsubscribe = null;
  }
  const roomRef = ref(db, `rooms/${roomId}`);
  roomUnsubscribe = onValue(roomRef, (snap) => {
    if (!snap.exists()) {
      // Room was deleted / never existed (e.g. stale entry or host left):
      // clean up locally and bounce back to the lobby list.
      const wasCurrent = currentRoomId;
      handleLeaveRoom(true);
      if (wasCurrent) navigate('__returnToOnlineLobby', 'returnToOnlineLobby');
      return;
    }
    renderRoomView(roomId, snap.val());
  }, (err) => {
    console.error('讀取對局桌失敗（可能是 Firebase 讀取規則限制）：', err);
  });
}

function renderRoomView(roomId, room) {
  const titleEl = document.getElementById('room-title-display');
  const hostNameEl = document.getElementById('host-name-display');
  const guestNameEl = document.getElementById('guest-name-display');
  const hostStatusEl = document.getElementById('host-status');
  const guestStatusEl = document.getElementById('guest-status');
  const tipEl = document.getElementById('room-status-tip');
  const btnRed = document.getElementById('btn-join-red');
  const btnBlack = document.getElementById('btn-join-black');

  if (titleEl) titleEl.textContent = room.roomName || '對局桌';

  const red = room.redPlayer;
  const black = room.blackPlayer;

  if (hostNameEl) hostNameEl.textContent = red ? red.name : '等待加入';
  if (guestNameEl) guestNameEl.textContent = black ? black.name : '等待加入';
  if (hostStatusEl) {
    hostStatusEl.textContent = red ? '已入座' : '空位';
    hostStatusEl.className = 'opponent-status ' + (red ? 'online' : 'offline');
  }
  if (guestStatusEl) {
    guestStatusEl.textContent = black ? '已入座' : '空位';
    guestStatusEl.className = 'opponent-status ' + (black ? 'online' : 'offline');
  }

  // Disable a seat button if that seat is taken by someone else.
  if (btnRed) btnRed.disabled = !!(red && red.id !== myUserId);
  if (btnBlack) btnBlack.disabled = !!(black && black.id !== myUserId);

  // A match is only "live" when BOTH distinct players hold the two seats AND
  // the room is marked playing (i.e. a game is actually in progress). After a
  // game ends we clear the seats and reset the room to 'waiting', so this will
  // be false and we will NOT relaunch a new board by accident.
  const bothSeated = !!(red && black && red.id !== black.id);
  const matchLive = bothSeated && room.status === 'playing';
  if (tipEl) {
    tipEl.textContent = bothSeated
      ? '雙方已就座，開始對局！'
      : '請選擇您的陣營以開始對局...';
  }

  if (matchLive) {
    const mySeat = red.id === myUserId ? 'red' : (black.id === myUserId ? 'black' : 'spectator');
    startOnlineMatch(roomId, room, mySeat);
  } else {
    // Not in a live match: make sure the online game view is closed and we are
    // showing the room view (covers the post-game return-to-room transition).
    document.body.classList.remove('online-chess');
    if (window.__onlineMatchStarted) {
      window.__onlineMatchStarted = null;
      if (typeof window.__teardownOnlineChess === 'function') window.__teardownOnlineChess();
      if (typeof window.__showRoomRoute === 'function') window.__showRoomRoute();
    }
  }
}

async function startOnlineMatch(roomId, room, role) {
  // Guard against starting twice (renderRoomView can fire repeatedly).
  if (window.__onlineMatchStarted === roomId + ':' + role) return;
  window.__onlineMatchStarted = roomId + ':' + role;

  // Mark the page as online-chess so the wider layout (board + side record
  // panel) can scale up without squeezing the board on desktops.
  document.body.classList.add('online-chess');

  try {
    if (typeof window.__launchOnlineChess === 'function') {
      await window.__launchOnlineChess({ roomId, ...room }, myUserId, role);
    } else {
      const { launchOnlineChess } = await import('./main.js');
      await launchOnlineChess({ roomId, ...room }, myUserId, role);
    }
  } catch (err) {
    console.error('啟動線上對局失敗：', err);
    window.__onlineMatchStarted = null;
    document.body.classList.remove('online-chess');
  }
}

function setupRoomActionButtons() {
  const btnRed = document.getElementById('btn-join-red');
  const btnBlack = document.getElementById('btn-join-black');
  const btnLeave = document.getElementById('btn-leave-room');

  if (btnRed) btnRed.onclick = () => joinSeat('red');
  if (btnBlack) btnBlack.onclick = () => joinSeat('black');
  if (btnLeave) btnLeave.onclick = () => handleLeaveRoom();
}

// Reset a room after a game finishes: clear both seats, mark it waiting again,
// and reset the shared game state to a fresh board (no lingering result). This
// keeps players INSIDE the room so they can re-select a side and play again,
// instead of being forced back to the lobby. Spectators stay as spectators.
function resetRoomAfterGame(roomId) {
  if (!roomId) return;
  // The board is being closed: drop the online-only layout class so the lobby
  // and local games do not inherit the widened online board layout.
  document.body.classList.remove('online-chess');
  const roomRef = ref(db, `rooms/${roomId}`);
  update(roomRef, {
    redPlayer: null,
    blackPlayer: null,
    status: 'waiting',
    lastInteraction: Date.now()
  }).catch(err => console.error('重置對局桌失敗：', err));

  // Reset the shared board so a fresh game can begin cleanly.
  const fresh = getInitialBoard();
  set(ref(db, `rooms/${roomId}/gameState`), {
    board: fresh,
    turn: RED,
    lastMove: null,
    moveCount: 0,
    history: [],
    moves: []
  }).catch(err => console.error('重置棋盤失敗：', err));

  // Also drop any pending request so it can't leak into the next game.
  remove(ref(db, `rooms/${roomId}/request`)).catch(() => {});
}

// Called by the online chess controller when a game ends (win/lose/draw).
// It tears down the game view and returns everyone (players + spectators) to
// the room view where the seats have been cleared.
window.__onOnlineGameEnded = (roomId) => {
  resetRoomAfterGame(roomId);
  // renderRoomView (driven by the room listener) will see status !== 'playing'
  // and tear the board down / restore the room view for every client.
};

function joinSeat(color) {
  if (!currentRoomId) return;
  const seatKey = color === 'red' ? 'redPlayer' : 'blackPlayer';
  const otherSeatKey = color === 'red' ? 'blackPlayer' : 'redPlayer';
  const roomRef = ref(db, `rooms/${currentRoomId}`);

  get(roomRef).then(snap => {
    if (!snap.exists()) {
      alert('此對局桌已不存在。');
      handleLeaveRoom();
      return;
    }
    const room = snap.val();
    const targetSeat = room[seatKey];       // the seat I want
    const otherSeat = room[otherSeatKey];    // the opposite seat

    // If I already hold the target seat, there is nothing to do.
    if (targetSeat && targetSeat.id === myUserId) {
      return;
    }
    // If someone else already holds the target seat, it's unavailable.
    if (targetSeat && targetSeat.id !== myUserId) {
      alert('該座位已被其他玩家佔用。');
      return;
    }
    // Don't allow a different player with the same name as the opposite seat.
    if (otherSeat && otherSeat.id !== myUserId && otherSeat.name === currentUsername) {
      alert('此房間已有相同名稱的玩家，請更換名稱後再加入。');
      return;
    }

    // If I currently occupy the OPPOSITE seat, this is a side swap: vacate it
    // first so I never hold both seats at once.
    const updates = {
      [seatKey]: { id: myUserId, name: currentUsername },
      lastInteraction: Date.now()
    };
    if (otherSeat && otherSeat.id === myUserId) {
      updates[otherSeatKey] = null;
    }

    // After the move, a match is "playing" only if the opposite seat is held by
    // another player (not by me, and not empty).
    const opponentPresent = !!(otherSeat && otherSeat.id !== myUserId);
    updates.status = opponentPresent ? 'playing' : 'waiting';

    myRole = color;
    update(roomRef, updates).catch(err => {
      console.error('入座寫入失敗（可能是 Firebase 寫入規則限制）：', err);
      alert('入座失敗，請確認 Firebase 允許寫入 rooms。');
    });
  }).catch(err => {
    console.error('入座失敗：', err);
    alert('入座失敗，請稍後再試。');
  });
}

function handleLeaveRoom(skipNavigation = false) {
  stopRoomHeartbeat();
  document.body.classList.remove('online-chess');
  if (roomUnsubscribe) {
    roomUnsubscribe();
    roomUnsubscribe = null;
  }
  window.__onlineMatchStarted = null;

  const roomId = currentRoomId;
  currentRoomId = null;
  myRole = null;

  // Release any seat we held, and delete the room if we were its host and
  // it would be left empty. This makes rooms disappear promptly on leave.
  if (roomId) {
    const roomRef = ref(db, `rooms/${roomId}`);
    get(roomRef).then(snap => {
      if (!snap.exists()) return;
      const room = snap.val();
      const updates = {};
      if (room.redPlayer && room.redPlayer.id === myUserId) updates.redPlayer = null;
      if (room.blackPlayer && room.blackPlayer.id === myUserId) updates.blackPlayer = null;

      const willBeEmpty =
        (room.hostId === myUserId) &&
        !room.blackPlayer &&
        (!room.redPlayer || room.redPlayer.id === myUserId);

      if (willBeEmpty) {
        return remove(roomRef);
      }
      updates.lastInteraction = Date.now();
      return update(roomRef, updates);
    }).catch(err => console.error('離開對局桌失敗：', err));
  }

  // Return to the lobby view (unless the caller controls navigation).
  if (!skipNavigation) {
    navigate('__returnToOnlineLobby', 'returnToOnlineLobby');
  }
}

function enterRoom(roomId) {
  currentRoomId = roomId;
  myRole = null;
  window.__onlineMatchStarted = null;
  goToRoomView();
  attachRoomListener(roomId);
  startRoomHeartbeat(roomId);
}

// While a player is inside a room, keep its lastInteraction fresh so the
// stale-room cleanup doesn't remove a room that's legitimately waiting.
let roomHeartbeat = null;
function startRoomHeartbeat(roomId) {
  stopRoomHeartbeat();
  const touch = () => {
    if (currentRoomId !== roomId) return;
    update(ref(db, `rooms/${roomId}`), { lastInteraction: Date.now() }).catch(() => {});
  };
  touch();
  roomHeartbeat = setInterval(touch, 10000);
}
function stopRoomHeartbeat() {
  if (roomHeartbeat) clearInterval(roomHeartbeat);
  roomHeartbeat = null;
}

// Expose the lobby "進入對局桌" button handler used in the rendered list.
window.joinRoom = (roomId) => enterRoom(roomId);

// Let main.js trigger a clean seat/room release when navigating away via the
// back/home buttons (without going through the in-room "離開對局桌" button).
window.__leaveOnlineRoom = () => {
  if (currentRoomId) handleLeaveRoom(true);
};
// #endregion

// #region CELL 2: 玩家線上狀態、心跳包與分頁可見性同步
let presenceHeartbeat = null;

function registerOnlinePresence() {
  updatePresenceStatus();
  onDisconnect(ref(db, `online_users/${myUserId}`)).remove();
  // Release the username claim when this client disconnects.
  if (currentUsername) {
    onDisconnect(ref(db, `taken_names/${encodeName(currentUsername)}`)).remove();
  }

  // Avoid stacking multiple heartbeat intervals on repeated calls.
  if (presenceHeartbeat) clearInterval(presenceHeartbeat);
  presenceHeartbeat = setInterval(() => {
    if (currentUsername) {
      updatePresenceStatus();
    }
  }, 10000);
}

function updatePresenceStatus() {
  if (!currentUsername) return;
  const userRef = ref(db, `online_users/${myUserId}`);
  set(userRef, {
    username: currentUsername,
    status: isTabActive ? 'online' : 'away',
    lastSeen: Date.now()
  });
}
// #endregion

// #region CELL 3: 房間列表、Table編號、離線過濾與強制無人房間自動刪除
let lobbyListenersAttached = false;
let lobbyRoomsUnsub = null;
let lobbyUsersUnsub = null;

const ONLINE_WINDOW_MS = 20000;      // a user is "online" if seen within this window
const ROOM_CREATE_GRACE_MS = 8000;   // don't delete a brand-new room before host presence syncs
const ROOM_STALE_MS = 25000;         // room idle longer than this with no seated online player is removed

function initLobbyListeners() {
  const container = document.getElementById('room-list-container');
  const onlineCountBadge = document.getElementById('online-count-badge');

  // Attach the realtime listeners only once. Re-entering the lobby reuses them,
  // preventing duplicate lists / racing rebuilds that made joining unreliable.
  if (lobbyListenersAttached) return;
  lobbyListenersAttached = true;

  const roomsRef = ref(db, 'rooms');
  const usersRef = ref(db, 'online_users');

  lobbyUsersUnsub = onValue(usersRef, (snapshot) => {
    const users = snapshot.val() || {};
    const now = Date.now();
    let activeOnlineCount = 0;
    const removedUids = [];

    Object.keys(users).forEach(uid => {
      if (now - (users[uid].lastSeen || 0) < ONLINE_WINDOW_MS) {
        activeOnlineCount++;
      } else {
        // 清除過期的使用者紀錄
        removedUids.push(uid);
        remove(ref(db, `online_users/${uid}`)).catch(() => {});
      }
    });

    // Release any usernames still owned by the removed (stale) users so the
    // names become available again if onDisconnect did not fire.
    if (removedUids.length) {
      get(ref(db, 'taken_names')).then(nameSnap => {
        const names = nameSnap.val() || {};
        Object.keys(names).forEach(key => {
          if (removedUids.includes(names[key])) {
            remove(ref(db, `taken_names/${key}`)).catch(() => {});
          }
        });
      }).catch(() => {});
    }

    if (onlineCountBadge) onlineCountBadge.textContent = `線上玩家: ${activeOnlineCount}`;

    // Reuse the same users snapshot for the room render.
    get(roomsRef).then(roomSnap => {
      cleanAndRenderRooms(roomSnap, users, now, container);
    });
  });

  lobbyRoomsUnsub = onValue(roomsRef, (roomSnap) => {
    get(usersRef).then(userSnap => {
      const users = userSnap.val() || {};
      const now = Date.now();
      cleanAndRenderRooms(roomSnap, users, now, container);
    });
  });
}

function cleanAndRenderRooms(snapshot, users, now, container) {
  if (!container) return;
  container.innerHTML = '';

  if (!snapshot.exists()) {
    container.innerHTML = '<div style="text-align:center; padding:10px; color:#aaa;">目前沒有對局桌，請自行建立！</div>';
    return;
  }

  let visibleRooms = 0;

  snapshot.forEach(child => {
    const room = child.val();
    const roomId = child.key;

    const redOnline = room.redPlayer && users[room.redPlayer.id] && (now - (users[room.redPlayer.id].lastSeen || 0) < ONLINE_WINDOW_MS);
    const blackOnline = room.blackPlayer && users[room.blackPlayer.id] && (now - (users[room.blackPlayer.id].lastSeen || 0) < ONLINE_WINDOW_MS);
    const hostOnline = room.hostId && users[room.hostId] && (now - (users[room.hostId].lastSeen || 0) < ONLINE_WINDOW_MS);

    const createdRecently = now - (room.lastInteraction || 0) < ROOM_CREATE_GRACE_MS;
    const roomStale = now - (room.lastInteraction || 0) > ROOM_STALE_MS;

    // Delete a room only when NOBODY associated with it is online anymore
    // (no seated player AND the host is offline), and it has had time to be seen.
    // This keeps a host's waiting room alive while they are connected, but
    // removes rooms whose owner has gone offline / closed the tab.
    const nobodyOnline = !redOnline && !blackOnline && !hostOnline;
    if (!createdRecently && nobodyOnline && roomStale) {
      remove(ref(db, `rooms/${roomId}`)).catch(err => {
        console.error('刪除無人對局桌失敗（可能是 Firebase 寫入規則限制）：', err);
      });
      return;
    }

    visibleRooms++;

    const redName = redOnline ? room.redPlayer.name : '等待加入';
    const blackName = blackOnline ? room.blackPlayer.name : '等待加入';

    const item = document.createElement('div');
    item.className = 'room-item';
    item.innerHTML = `
      <div>
        <strong>${room.roomName}</strong>
        <div style="font-size:0.85rem; color:#ccc;">紅：${redName} | 黑：${blackName} | 狀態：${room.status === 'waiting' ? '尋覓對手中' : '對戰中'}</div>
      </div>
      <button class="btn-primary" data-room-id="${roomId}">進入對局桌</button>
    `;
    // Bind via addEventListener instead of inline onclick for reliability.
    item.querySelector('button').addEventListener('click', () => enterRoom(roomId));
    container.appendChild(item);
  });

  if (visibleRooms === 0) {
    container.innerHTML = '<div style="text-align:center; padding:10px; color:#aaa;">目前沒有對局桌，請自行建立！</div>';
  }
}

async function createNewRoom() {
  let newRoomRef;
  let disconnectCleanupRegistered = false;
  try {
    const roomsRef = ref(db, 'rooms');
    const snapshot = await get(roomsRef);
    let myRoomCount = 0;
    let maxTableNum = 0;

    if (snapshot.exists()) {
      snapshot.forEach(child => {
        const room = child.val();
        if (room.hostId === myUserId) {
          myRoomCount++;
        }
        const match = room.roomName && room.roomName.match(/#(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxTableNum) maxTableNum = num;
        }
      });
    }

    if (myRoomCount >= 2) {
      alert('您同時只能建立最多 2 張對局桌！');
      return;
    }

    const nextTableNum = maxTableNum + 1;
    const tableNumberStr = String(nextTableNum).padStart(3, '0');
    newRoomRef = push(roomsRef);
    currentRoomId = newRoomRef.key;

    await onDisconnect(newRoomRef).remove();
    disconnectCleanupRegistered = true;
    await set(newRoomRef, {
      roomName: `對局桌 #${tableNumberStr}`,
      hostId: myUserId,
      redPlayer: null,
      blackPlayer: null,
      spectators: {},
      status: 'waiting',
      lastInteraction: Date.now()
    });

    // After a successful create, go straight into the room view.
    enterRoom(currentRoomId);
  } catch (err) {
    if (disconnectCleanupRegistered) {
      try {
        await onDisconnect(newRoomRef).cancel();
      } catch (cancelError) {
        console.error('取消對局桌斷線清理失敗：', cancelError);
      }
    }
    currentRoomId = null;
    console.error('建立對局桌失敗：', err);
    alert('建立對局桌失敗，請稍後再試。');
  }
}
// #endregion

