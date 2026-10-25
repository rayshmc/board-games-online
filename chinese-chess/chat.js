// #region CELL 1: 聊天室 (單一頻道) 與旁觀名單共用元件
// These two widgets are shared by BOTH the room view (對局桌) and the live
// board view (對局中), so the same UI/logic is never written twice. Each widget
// owns its own Firebase listeners and can be destroyed when its view closes.
import { getDatabase, ref, onValue, push, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ONE shared channel: every client in the room (red, black and spectators)
// reads and writes the same conversation, so nobody is ever muted and everyone
// sees the same messages. Each message carries the sender's role purely as a
// label (紅 / 黑 / 觀), never as a permission.
const MAX_MESSAGE_LENGTH = 120;
const MAX_RENDERED_MESSAGES = 60;   // only the newest N messages are loaded
const DEFAULT_STALE_MS = 45000;     // spectator without a heartbeat is hidden

// Full name of a role, used in the composer hint.
function roleName(role) {
  if (role === 'red') return '紅方玩家';
  if (role === 'black') return '黑方玩家';
  return '旁觀者';
}

// Short badge shown next to the sender's name.
function roleShort(role) {
  if (role === 'red') return '紅';
  if (role === 'black') return '黑';
  return '觀';
}

function roleClass(role) {
  if (role === 'red') return 'red';
  if (role === 'black') return 'black';
  return 'spectator';
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
// #endregion

// #region CELL 2: 聊天面板（單一頻道，房內所有人共用）
export class ChatPanel {
  constructor({ roomId, userId, username, role = 'spectator' } = {}) {
    this.roomId = roomId || null;
    this.userId = userId || '';
    this.username = username || '匿名玩家';
    this.role = role || 'spectator';

    this.messages = [];
    this._unsubscribers = [];
    this.root = null;
    this.messagesEl = null;
    this.inputEl = null;
    this.hintEl = null;
  }

  // Build the DOM inside `rootEl` and start listening. Safe to call again:
  // the previous listeners/DOM are torn down first.
  mount(rootEl) {
    if (!this.roomId || !rootEl) return;
    this.destroy();
    this.root = rootEl;
    rootEl.classList.add('chat-panel');
    rootEl.innerHTML = '';
    this._buildDom(rootEl);
    this._subscribe();
    this._renderMessages();
    this._updateComposer();
  }

  destroy() {
    this._unsubscribers.forEach(fn => { try { fn(); } catch (e) { /* ignore */ } });
    this._unsubscribers = [];
    if (this.root) {
      this.root.innerHTML = '';
      this.root.classList.remove('chat-panel');
      this.root = null;
    }
    this.messagesEl = null;
    this.inputEl = null;
    this.hintEl = null;
    // Forget cached traffic so a re-mount never shows another room's messages.
    this.messages = [];
  }

  _buildDom(rootEl) {
    const title = document.createElement('div');
    title.className = 'chat-title';
    title.textContent = '聊天室';
    rootEl.appendChild(title);

    const list = document.createElement('div');
    list.className = 'chat-messages';
    this.messagesEl = list;
    rootEl.appendChild(list);

    // A <form> gives us free Enter-to-send without reloading the page.
    const row = document.createElement('form');
    row.className = 'chat-input-row';
    row.addEventListener('submit', (e) => {
      e.preventDefault();
      this.send();
    });

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'chat-input';
    input.maxLength = MAX_MESSAGE_LENGTH;
    input.autocomplete = 'off';
    input.placeholder = '輸入訊息...';
    this.inputEl = input;
    row.appendChild(input);

    const sendBtn = document.createElement('button');
    sendBtn.type = 'submit';
    sendBtn.className = 'chat-send';
    sendBtn.textContent = '送出';
    row.appendChild(sendBtn);

    rootEl.appendChild(row);

    const hint = document.createElement('div');
    hint.className = 'chat-hint';
    this.hintEl = hint;
    rootEl.appendChild(hint);
  }

  _subscribe() {
    // ONE node for the whole room: no per-side channels, so red, black and the
    // spectators all read and write the same conversation.
    const chatRef = query(
      ref(getDatabase(), `rooms/${this.roomId}/chat`),
      limitToLast(MAX_RENDERED_MESSAGES)
    );

    const unsub = onValue(chatRef, (snap) => {
      const list = [];
      snap.forEach(child => {
        const v = child.val() || {};
        // Only real messages are rendered (defensive: skip any non-message node).
        if (typeof v.text !== 'string' || !v.text) return;
        list.push({
          id: child.key,
          uid: v.uid || '',
          name: v.name || '匿名玩家',
          role: v.role || 'spectator',
          text: v.text,
          ts: v.ts || 0
        });
      });
      this.messages = list;
      this._renderMessages();
    }, (err) => {
      console.error('讀取聊天訊息失敗：', err);
    });

    this._unsubscribers.push(unsub);
  }

  _renderMessages() {
    const listEl = this.messagesEl;
    if (!listEl) return;
    listEl.innerHTML = '';

    if (this.messages.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'chat-empty';
      empty.textContent = '目前還沒有訊息，快來開個話題吧！';
      listEl.appendChild(empty);
      return;
    }

    this.messages.forEach(m => {
      const row = document.createElement('div');
      row.className = 'chat-msg' + (m.uid && m.uid === this.userId ? ' me' : '');

      // Small 紅 / 黑 / 觀 badge so everyone can tell who is speaking.
      const badge = document.createElement('span');
      badge.className = 'chat-role ' + roleClass(m.role);
      badge.textContent = roleShort(m.role);
      row.appendChild(badge);

      const author = document.createElement('span');
      author.className = 'chat-author';
      // textContent everywhere: usernames/messages are user input, never HTML.
      author.textContent = m.name;
      row.appendChild(author);

      const text = document.createElement('span');
      text.className = 'chat-text';
      text.textContent = m.text;
      row.appendChild(text);

      const time = formatTime(m.ts);
      if (time) {
        const timeEl = document.createElement('span');
        timeEl.className = 'chat-time';
        timeEl.textContent = time;
        row.appendChild(timeEl);
      }

      listEl.appendChild(row);
    });

    listEl.scrollTop = listEl.scrollHeight;
  }

  // Called when the player takes / leaves a seat. Since there is only ONE
  // channel, this merely refreshes the identity line under the composer.
  setRole(role) {
    this.role = role || 'spectator';
    this._updateComposer();
  }

  _updateComposer() {
    // Everyone may post here, so the hint describes who you are and who will
    // see the message instead of any (non-existent) channel restriction.
    if (this.hintEl) {
      this.hintEl.textContent = `您目前是${roleName(this.role)}，訊息會顯示給房內所有人。`;
    }
  }

  send() {
    if (!this.inputEl) return;
    const raw = (this.inputEl.value || '').trim();
    if (!raw) return;

    const text = raw.slice(0, MAX_MESSAGE_LENGTH);
    this.inputEl.value = '';

    push(ref(getDatabase(), `rooms/${this.roomId}/chat`), {
      uid: this.userId,
      name: this.username,
      role: this.role,
      text,
      ts: Date.now()
    }).catch(err => {
      console.error('發送聊天訊息失敗：', err);
      if (this.hintEl) this.hintEl.textContent = '訊息發送失敗，請確認 Firebase 寫入規則後再試。';
    });

    if (typeof this.inputEl.focus === 'function') this.inputEl.focus();
  }
}
// #endregion

// #region CELL 3: 旁觀名單（即時訂閱、過濾失聯者、標記自己）
export class SpectatorList {
  constructor({ roomId, userId, staleMs = DEFAULT_STALE_MS } = {}) {
    this.roomId = roomId || null;
    this.userId = userId || '';
    this.staleMs = staleMs;
    this.emptyText = '目前沒有旁觀者';
    this.listEl = null;
    this.countEl = null;
    this._onChange = null;
    this._unsubscribers = [];
  }

  // `onChange(entries)` lets the caller react to the head-count (e.g. flip a
  // "對局進行中，您正在旁觀" notice).
  mount({ listEl, countEl, emptyText, onChange } = {}) {
    if (!this.roomId) return;
    this.destroy();

    this.listEl = listEl || null;
    this.countEl = countEl || null;
    if (emptyText) this.emptyText = emptyText;
    this._onChange = typeof onChange === 'function' ? onChange : null;

    const specsRef = ref(getDatabase(), `rooms/${this.roomId}/spectators`);
    const unsub = onValue(specsRef, (snap) => {
      const specs = snap.val() || {};
      const now = Date.now();
      const entries = [];

      Object.keys(specs).forEach(uid => {
        const s = specs[uid];
        if (!s) return;
        // Hide stale entries: their onDisconnect cleanup can land a beat late.
        if (now - (s.lastSeen || 0) > this.staleMs) return;
        entries.push({
          uid,
          name: s.name || '匿名玩家',
          joinedAt: s.joinedAt || 0,
          me: uid === this.userId
        });
      });
      // Keep a stable order so the list does not jitter on every heartbeat.
      entries.sort((a, b) => a.joinedAt - b.joinedAt);

      this._render(entries);
      if (this._onChange) this._onChange(entries);
    }, (err) => {
      console.error('讀取旁觀名單失敗：', err);
    });

    this._unsubscribers.push(unsub);
  }

  destroy() {
    this._unsubscribers.forEach(fn => { try { fn(); } catch (e) { /* ignore */ } });
    this._unsubscribers = [];
    if (this.listEl) this.listEl.innerHTML = '';
    this._onChange = null;
  }

  _render(entries) {
    if (this.countEl) this.countEl.textContent = String(entries.length);
    if (!this.listEl) return;

    this.listEl.innerHTML = '';
    if (entries.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'spectator-empty';
      empty.textContent = this.emptyText;
      this.listEl.appendChild(empty);
      return;
    }

    entries.forEach(entry => {
      const chip = document.createElement('span');
      chip.className = 'spectator-chip' + (entry.me ? ' me' : '');
      chip.textContent = entry.name + (entry.me ? '（你）' : '');
      this.listEl.appendChild(chip);
    });
  }
}
// #endregion
