/* Couchkino – Client */
(() => {
'use strict';

// ================= Hilfen =================
const $ = (s) => document.querySelector(s);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* egal */ } },
};
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
function randId(n) {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) => a[x % a.length]).join('');
}
function initials(name) { return (name || '?').trim().slice(0, 1).toUpperCase(); }
function toast(text, { error = false, ms = 3500, actions = [] } = {}) {
  const t = el('div', { class: 'toast' + (error ? ' err' : '') }, el('div', { class: 't-text', text }));
  if (actions.length) {
    const wrap = el('div', { class: 't-actions' });
    for (const a of actions) wrap.append(el('button', { class: 'btn small', text: a.label, onclick: () => { a.run(); t.remove(); } }));
    t.append(wrap);
  }
  $('#toasts').append(t);
  setTimeout(() => t.remove(), ms);
}
function fmtTime(ts) { return new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }
const YT_RE = /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?[^\s]*v=|shorts\/|live\/|embed\/)|youtu\.be\/)[\w-]{11}[^\s]*/i;

const ICONS = {
  micOn: '<svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11z"/></svg>',
  micOff: '<svg viewBox="0 0 24 24"><path d="M19 11h-2a5 5 0 0 1-.6 2.4l1.5 1.5A7 7 0 0 0 19 11zm-4 .2V5a3 3 0 0 0-5.9-.8zM4.3 3 3 4.3l6 6V11a3 3 0 0 0 4.4 2.7l1.6 1.6A5 5 0 0 1 7 11H5a7 7 0 0 0 6 6.9V21h2v-3.1a7 7 0 0 0 3.4-1.3l3.3 3.3 1.3-1.3z"/></svg>',
  camOn: '<svg viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z"/></svg>',
  camOff: '<svg viewBox="0 0 24 24"><path d="M21 6.5l-4 4V7a1 1 0 0 0-1-1H9.8L21 17.2zM3.3 2 2 3.3 4.7 6H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12c.2 0 .4-.1.5-.2l3.2 3.2 1.3-1.3z"/></svg>',
  mutedSmall: '🔇',
};
const REACTIONS = ['❤️', '😂', '😮', '😭', '🔥', '👏', '💀', '🥺'];

let myKey = store.get('ck_key');
if (!myKey) { myKey = randId(16); store.set('ck_key', myKey); }

// ================= Start =================
const roomMatch = location.pathname.match(/^\/r\/([a-z0-9-]{3,40})\/?$/i);
if (roomMatch) showJoin(roomMatch[1].toLowerCase());
else showHome();

function showHome() {
  $('#home').classList.remove('hidden');
  const name = $('#homeName');
  name.value = store.get('ck_name') || '';
  const remember = () => { if (name.value.trim()) store.set('ck_name', name.value.trim()); };
  $('#createRoom').onclick = () => { remember(); location.href = '/r/' + randId(6); };
  const join = () => {
    const code = $('#joinCode').value.trim().toLowerCase().replace(/^.*\/r\//, '').replace(/[^a-z0-9-]/g, '');
    if (code.length < 3) return toast('Gib einen gültigen Raum-Code ein', { error: true });
    remember();
    location.href = '/r/' + code;
  };
  $('#joinRoom').onclick = join;
  $('#joinCode').onkeydown = (e) => { if (e.key === 'Enter') join(); };
}

function showJoin(roomId) {
  $('#joinRoomCode').textContent = roomId;
  $('#joinName').value = store.get('ck_name') || '';
  $('#joinMic').checked = store.get('ck_mic') === '1';
  $('#joinCam').checked = store.get('ck_cam') === '1';
  $('#joinModal').classList.remove('hidden');
  setTimeout(() => $('#joinName').focus(), 50);
  const go = () => {
    const name = $('#joinName').value.trim();
    if (!name) { $('#joinName').focus(); return toast('Gib deinen Namen ein', { error: true }); }
    store.set('ck_name', name);
    store.set('ck_mic', $('#joinMic').checked ? '1' : '0');
    store.set('ck_cam', $('#joinCam').checked ? '1' : '0');
    $('#joinModal').classList.add('hidden');
    $('#room').classList.remove('hidden');
    startRoom(roomId, name, $('#joinMic').checked, $('#joinCam').checked);
  };
  $('#joinBtn').onclick = go;
  $('#joinName').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}

// ================= YouTube-API =================
let ytApiReady = false;
let roomStarted = false;
window.onYouTubeIframeAPIReady = () => { ytApiReady = true; if (roomStarted) createPlayer(); };

// ================= Raum =================
let socket, selfId = null, roomId = null, myName = '';
const users = new Map();
let state = { video: null, playing: false, time: 0, rate: 1, serverNow: Date.now() };
let queue = [];
let clockOffset = 0;

function startRoom(id, name, wantMic, wantCam) {
  roomId = id; myName = name; roomStarted = true;
  document.title = 'Couchkino · ' + id;
  $('#roomCode').textContent = id;
  setupUI();
  setupAudioLevel();
  renderSelfTile();
  if (ytApiReady) createPlayer();

  socket = io({ transports: ['websocket', 'polling'] });
  socket.on('connect', () => {
    $('#connState').className = 'conn ok';
    $('#connState').title = 'Verbunden';
    socket.emit('join', { room: roomId, name: myName, key: myKey });
  });
  socket.on('disconnect', () => {
    $('#connState').className = 'conn bad';
    $('#connState').title = 'Verbindung weg – verbinde neu …';
    closeAllPeers();
  });
  socket.on('init', onInit);
  socket.on('user:joined', (u) => { users.set(u.id, u); renderPresence(); renderPeerTile(u.id); });
  socket.on('user:left', ({ id }) => { users.delete(id); closePeer(id); renderPresence(); });
  socket.on('user:update', (u) => {
    users.set(u.id, u);
    if (u.id === selfId) return;
    renderPeerTile(u.id);
  });
  socket.on('chat:msg', addChat);
  socket.on('queue', (q) => { queue = q; renderQueue(); });
  socket.on('queue:added', ({ item, by }) => {
    toast(`${by} will „${item.title}“ schauen`, {
      ms: 9000,
      actions: [
        { label: '👍', run: () => vote(item.id, 1) },
        { label: '👎', run: () => vote(item.id, -1) },
      ],
    });
  });
  socket.on('player:state', (s) => {
    const prevVideo = state.video && state.video.id;
    const prevPlaying = state.playing;
    state = s;
    applyState();
    renderNow();
    if (s.by && s.by !== myName) {
      if (s.video && prevVideo === s.video.id && prevPlaying !== s.playing) toast(`${s.by} hat ${s.playing ? 'weiter abgespielt ▶' : 'pausiert ⏸'}`, { ms: 2000 });
    }
  });
  socket.on('react', ({ emoji, name: n, color }) => floatReaction(emoji, n, color));
  socket.on('signal', onSignal);

  // Mikro/Kamera wie beim Beitreten gewählt
  if (wantMic) setMic(true);
  if (wantCam) setCam(true);
  fetch('/api/ice').then((r) => r.json()).then((c) => { iceConfig = c; }).catch(() => {});
}

function onInit(data) {
  closeAllPeers();
  selfId = data.selfId;
  users.clear();
  for (const u of data.users) users.set(u.id, u);
  queue = data.queue;
  $('#chatList').replaceChildren();
  data.chat.forEach(addChat);
  renderPresence();
  renderQueue();
  syncClock().then(() => { state = data.player; applyState(); renderNow(); });
  emitMedia();
  // Wer neu dazukommt, ruft alle anderen an
  ensureIce().then(() => {
    for (const u of users.values()) if (u.id !== selfId) { renderPeerTile(u.id); createPeer(u.id, true); }
  });
}

async function syncClock() {
  let best = Infinity;
  for (let i = 0; i < 5; i++) {
    await new Promise((res) => {
      const t0 = performance.now();
      socket.timeout(3000).emit('time:ping', (err, serverNow) => {
        if (!err) {
          const rtt = performance.now() - t0;
          if (rtt < best) { best = rtt; clockOffset = serverNow + rtt / 2 - Date.now(); }
        }
        res();
      });
    });
  }
}

// ================= UI =================
function setupUI() {
  $('#copyLink').onclick = async () => {
    const link = location.origin + '/r/' + roomId;
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: 'Couchkino', text: 'Komm in mein Couchkino!', url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      toast('Link kopiert – einfach weiterschicken 💌');
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      window.prompt('Link kopieren:', link);
    }
  };

  const rb = $('#reactionBtns');
  for (const e of REACTIONS) rb.append(el('button', { text: e, title: 'Reaktion senden', onclick: () => socket.emit('react', { emoji: e }) }));

  $('#nextBtn').onclick = () => {
    if (!state.video && !queue.length) return toast('Die Playlist ist leer');
    socket.emit('player:next');
  };

  $('#addForm').onsubmit = (e) => {
    e.preventDefault();
    const url = $('#addInput').value.trim();
    if (!url) return;
    addVideo(url, () => { $('#addInput').value = ''; });
  };

  $('#chatForm').onsubmit = (e) => {
    e.preventDefault();
    const text = $('#chatInput').value.trim();
    if (!text) return;
    socket.emit('chat', { text });
    $('#chatInput').value = '';
  };

  $('#micBtn').onclick = () => setMic(!(local.audio && local.audio.enabled));
  $('#camBtn').onclick = () => setCam(!local.video);
  $('#settingsBtn').onclick = openSettings;
  $('#settingsClose').onclick = () => $('#settingsModal').classList.add('hidden');
  $('#settingsModal').onclick = (e) => { if (e.target.id === 'settingsModal') $('#settingsModal').classList.add('hidden'); };
  $('#tapToSync').onclick = () => {
    $('#tapToSync').classList.add('hidden');
    if (!playerReady) return;
    suppress(1500);
    player.seekTo(expectedTime(), true);
    player.playVideo();
  };
  renderControls();
}

function addVideo(url, onOk) {
  socket.timeout(10000).emit('queue:add', { url }, (err, res) => {
    if (err) return toast('Server antwortet nicht – nochmal versuchen', { error: true });
    if (!res || !res.ok) return toast((res && res.reason) || 'Ging nicht', { error: true });
    if (onOk) onOk();
    toast(res.started ? 'Läuft jetzt ▶' : 'Zur Playlist hinzugefügt ✓', { ms: 2000 });
  });
}

function renderPresence() {
  const p = $('#presence');
  p.replaceChildren();
  for (const u of users.values()) {
    p.append(el('div', { class: 'avatar', style: `background:${u.color}`, title: u.name + (u.id === selfId ? ' (du)' : '') }, initials(u.name)));
  }
}

function renderNow() {
  $('#nowTitle').textContent = state.video ? state.video.title : '–';
  $('#emptyState').classList.toggle('hidden', !!state.video);
  document.title = state.video ? `▶ ${state.video.title} · Couchkino` : 'Couchkino · ' + roomId;
}

// ---------- Playlist ----------
function score(q) { return Object.values(q.votes).reduce((a, b) => a + b, 0); }
function vote(itemId, v) {
  const item = queue.find((q) => q.id === itemId);
  const mine = item ? item.votes[myKey] || 0 : 0;
  socket.emit('queue:vote', { itemId, v: mine === v ? 0 : v });
}
function renderQueue() {
  const list = $('#queueList');
  list.replaceChildren();
  $('#queueCount').textContent = queue.length ? `(${queue.length})` : '';
  if (!queue.length) {
    list.append(el('li', { class: 'q-empty', text: 'Noch leer. Füg Videos hinzu – die anderen können mit 👍 / 👎 abstimmen.' }));
    return;
  }
  const sorted = [...queue].sort((a, b) => score(b) - score(a) || a.addedAt - b.addedAt);
  const topId = (sorted.find((q) => score(q) >= 0) || {}).id;
  for (const q of sorted) {
    const s = score(q);
    const ups = Object.values(q.votes).filter((v) => v > 0).length;
    const downs = Object.values(q.votes).filter((v) => v < 0).length;
    const mine = q.votes[myKey] || 0;
    list.append(el('li', { class: 'q-item' + (s < 0 ? ' rejected' : '') + (q.id === topId ? ' top' : '') },
      el('img', { class: 'q-thumb', src: `https://i.ytimg.com/vi/${q.videoId}/mqdefault.jpg`, alt: '', loading: 'lazy' }),
      el('div', { class: 'q-info' },
        el('div', { class: 'q-title', text: q.title, title: q.title }),
        el('div', { class: 'q-meta', text: (q.id === topId ? '⭐ Als Nächstes · ' : s < 0 ? '🚫 wird übersprungen · ' : '') + 'von ' + q.addedBy + (q.channel ? ' · ' + q.channel : '') })),
      el('div', { class: 'q-votes' },
        el('button', { class: 'vote up' + (mine === 1 ? ' on' : ''), title: 'Will ich sehen', onclick: () => vote(q.id, 1) }, '👍 ', String(ups)),
        el('button', { class: 'vote down' + (mine === -1 ? ' on' : ''), title: 'Lieber was anderes', onclick: () => vote(q.id, -1) }, '👎 ', String(downs))),
      el('div', { class: 'q-actions' },
        el('button', { class: 'icon-btn', title: 'Jetzt abspielen', text: '▶', onclick: () => socket.emit('queue:play', { itemId: q.id }) }),
        el('button', { class: 'icon-btn', title: 'Entfernen', text: '✕', onclick: () => socket.emit('queue:remove', { itemId: q.id }) }))));
  }
}

// ---------- Chat ----------
function addChat(m) {
  const list = $('#chatList');
  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  if (m.system) {
    list.append(el('li', { class: 'sys', text: m.text }));
  } else {
    const mine = m.key === myKey;
    const bubble = el('div', { class: 'bubble' });
    // Links klickbar machen (ohne HTML einzuschleusen)
    const parts = m.text.split(/(https?:\/\/[^\s]+)/g);
    for (const part of parts) {
      if (/^https?:\/\//.test(part)) bubble.append(el('a', { href: part, target: '_blank', rel: 'noopener noreferrer', text: part }));
      else if (part) bubble.append(part);
    }
    const li = el('li', { class: 'msg' + (mine ? ' mine' : '') },
      el('div', { class: 'who', style: `color:${m.color}` }, mine ? 'Du' : m.name, el('time', { text: fmtTime(m.at) })),
      bubble);
    const yt = m.text.match(YT_RE);
    if (yt) li.append(el('div', {}, el('button', { class: 'btn small add-yt', text: '+ zur Playlist', onclick: () => addVideo(yt[0]) })));
    list.append(li);
  }
  if (nearBottom || m.key === myKey) list.scrollTop = list.scrollHeight;
}

// ---------- Reaktionen ----------
function floatReaction(emoji, name, color) {
  const layer = $('#reactionLayer');
  const left = 8 + Math.random() * 80;
  const node = el('div', { class: 'float-react', style: `left:${left}%` },
    el('div', { class: 'e', text: emoji }),
    el('div', { class: 'n', text: name, style: `color:${color}` }));
  layer.append(node);
  setTimeout(() => node.remove(), 3300);
}

// ================= YouTube-Sync =================
let player = null, playerReady = false, loadedId = null;
let suppressUntil = 0, awaitingFirstPlay = false, lastPoll = null;

function createPlayer() {
  if (player) return;
  player = new YT.Player('ytPlayer', {
    width: '100%', height: '100%',
    playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin },
    events: {
      onReady: () => { playerReady = true; applyState(); setInterval(poll, 1000); },
      onStateChange: onYTState,
      onPlaybackRateChange: onYTRate,
      onError: onYTError,
    },
  });
}
function suppress(ms) { suppressUntil = Math.max(suppressUntil, Date.now() + ms); }
function expectedTime() {
  if (!state.video) return 0;
  const serverNowEst = Date.now() + clockOffset;
  return Math.max(0, state.time + (state.playing ? ((serverNowEst - state.serverNow) / 1000) * state.rate : 0));
}
function sendUpdate(playing, time) {
  const rate = playerReady ? player.getPlaybackRate() : 1;
  state = { ...state, playing, time, rate, serverNow: Date.now() + clockOffset, by: myName };
  socket.emit('player:update', { playing, time, rate });
}

function applyState() {
  if (!playerReady) return;
  if (!state.video) {
    if (loadedId) { suppress(1000); player.stopVideo(); loadedId = null; }
    $('#tapToSync').classList.add('hidden');
    return;
  }
  suppress(1500);
  const exp = expectedTime();
  if (loadedId !== state.video.id) {
    loadedId = state.video.id;
    awaitingFirstPlay = true;
    lastPoll = null;
    if (state.playing) player.loadVideoById({ videoId: loadedId, startSeconds: exp });
    else player.cueVideoById({ videoId: loadedId, startSeconds: exp });
  } else {
    if (Math.abs(player.getCurrentTime() - exp) > 1) player.seekTo(exp, true);
    const st = player.getPlayerState();
    if (state.playing && st !== 1 && st !== 3) player.playVideo();
    if (!state.playing && (st === 1 || st === 3)) player.pauseVideo();
    lastPoll = null;
  }
  if (player.getPlaybackRate() !== state.rate) player.setPlaybackRate(state.rate);
  if (state.playing) {
    // Prüfen, ob der Browser Autoplay blockiert hat
    setTimeout(() => {
      if (state.playing && playerReady && loadedId === (state.video && state.video.id)) {
        const st = player.getPlayerState();
        if (st !== 1 && st !== 3) $('#tapToSync').classList.remove('hidden');
      }
    }, 3000);
  }
}

function onYTState(e) {
  const s = e.data;
  if (s === 1) { awaitingFirstPlay = false; $('#tapToSync').classList.add('hidden'); }
  if (s === 0) {
    if (state.video && loadedId === state.video.id) socket.emit('player:ended', { videoId: loadedId });
    return;
  }
  if (Date.now() < suppressUntil || !state.video || loadedId !== state.video.id) return;
  const t = player.getCurrentTime();
  if (s === 1 && !state.playing) sendUpdate(true, t);
  else if (s === 2 && state.playing && !awaitingFirstPlay) sendUpdate(false, t);
  else if (s === 3 && state.playing && !awaitingFirstPlay && Math.abs(t - expectedTime()) > 2.5) sendUpdate(true, t);
}
function onYTRate(e) {
  if (Date.now() < suppressUntil || !state.video) return;
  state.rate = e.data;
  sendUpdate(state.playing, player.getCurrentTime());
}
function onYTError(e) {
  const msg = (e.data === 101 || e.data === 150) ? 'Dieses Video darf nicht eingebettet werden – überspringe …' : 'Video kann nicht abgespielt werden – überspringe …';
  toast(msg, { error: true });
  if (state.video && loadedId === state.video.id) socket.emit('player:ended', { videoId: loadedId });
}

// Läuft jede Sekunde: erkennt Spulen und gleicht Abweichungen aus
function poll() {
  if (!playerReady || !state.video || loadedId !== state.video.id) return;
  const now = Date.now();
  const st = player.getPlayerState();
  const cur = player.getCurrentTime();
  const sup = now < suppressUntil || awaitingFirstPlay;
  if (!sup) {
    if (state.playing && st === 1) {
      if (lastPoll && lastPoll.st === 1) {
        const predicted = lastPoll.t + ((now - lastPoll.at) / 1000) * player.getPlaybackRate();
        if (Math.abs(cur - predicted) > 2.5) { // jemand hat hier gespult
          sendUpdate(true, cur);
          lastPoll = { t: cur, at: now, st };
          return;
        }
      }
      const exp = expectedTime();
      if (Math.abs(cur - exp) > 1.5) { // hinterher (z. B. nach Laden) → aufholen
        suppress(1500);
        player.seekTo(exp, true);
        lastPoll = null;
        return;
      }
    } else if (!state.playing && (st === 2 || st === 5)) {
      if (Math.abs(cur - state.time) > 1.5) sendUpdate(false, cur); // im Pausemodus gespult
    } else if (state.playing && (st === 2 || st === 5 || st === -1)) {
      $('#tapToSync').classList.remove('hidden');
    }
  }
  lastPoll = { t: cur, at: now, st };
}

// ================= Video- & Sprachchat (WebRTC) =================
let iceConfig = null;
const local = { audio: null, video: null };
const peers = new Map(); // id -> { pc, audioTx, videoTx, pending, initiator, discTimer }
let micId = store.get('ck_micId') || '';
let camId = store.get('ck_camId') || '';

async function ensureIce() {
  if (iceConfig) return iceConfig;
  try { iceConfig = await (await fetch('/api/ice')).json(); }
  catch { iceConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }; }
  return iceConfig;
}

function createPeer(id, initiator) {
  closePeer(id, true);
  const pc = new RTCPeerConnection(iceConfig || undefined);
  const peer = { id, pc, initiator, audioTx: null, videoTx: null, pending: [], discTimer: null };
  peers.set(id, peer);

  pc.onicecandidate = (e) => { if (e.candidate) socket.emit('signal', { to: id, data: { candidate: e.candidate } }); };
  pc.onconnectionstatechange = () => {
    const cs = pc.connectionState;
    setTileStatus(id, cs === 'connected' ? '' : cs === 'failed' ? 'Verbindung fehlgeschlagen' : cs === 'disconnected' ? 'verbinde neu …' : 'verbinde …');
    clearTimeout(peer.discTimer);
    if (cs === 'failed' && peer.initiator) negotiate(peer, true);
    if (cs === 'disconnected' && peer.initiator) peer.discTimer = setTimeout(() => { if (pc.connectionState === 'disconnected') negotiate(peer, true); }, 4000);
  };

  if (initiator) {
    peer.audioTx = pc.addTransceiver('audio', { direction: 'sendrecv' });
    peer.videoTx = pc.addTransceiver('video', { direction: 'sendrecv' });
    applyLocalTracks(peer);
    attachRemote(peer);
    negotiate(peer, false);
  }
  return peer;
}

async function negotiate(peer, iceRestart) {
  try {
    const offer = await peer.pc.createOffer({ iceRestart });
    await peer.pc.setLocalDescription(offer);
    socket.emit('signal', { to: peer.id, data: { sdp: peer.pc.localDescription } });
  } catch (err) { console.warn('Offer fehlgeschlagen', err); }
}

async function onSignal({ from, data }) {
  let peer = peers.get(from);
  try {
    if (data.sdp) {
      if (data.sdp.type === 'offer') {
        if (!peer || peer.initiator) { await ensureIce(); peer = createPeer(from, false); renderPeerTile(from); }
        const pc = peer.pc;
        await pc.setRemoteDescription(data.sdp);
        if (!peer.audioTx) {
          for (const t of pc.getTransceivers()) {
            const kind = t.receiver.track.kind;
            if (kind === 'audio' && !peer.audioTx) peer.audioTx = t;
            if (kind === 'video' && !peer.videoTx) peer.videoTx = t;
            t.direction = 'sendrecv';
          }
          applyLocalTracks(peer);
          attachRemote(peer);
        }
        await pc.setLocalDescription(await pc.createAnswer());
        socket.emit('signal', { to: from, data: { sdp: pc.localDescription } });
        flushCandidates(peer);
      } else if (data.sdp.type === 'answer' && peer) {
        await peer.pc.setRemoteDescription(data.sdp);
        flushCandidates(peer);
      }
    } else if (data.candidate && peer) {
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate).catch(() => {});
      else peer.pending.push(data.candidate);
    }
  } catch (err) { console.warn('Signal-Fehler', err); }
}
function flushCandidates(peer) {
  const list = peer.pending.splice(0);
  for (const c of list) peer.pc.addIceCandidate(c).catch(() => {});
}
function applyLocalTracks(peer) {
  if (peer.audioTx) peer.audioTx.sender.replaceTrack(local.audio).catch(() => {});
  if (peer.videoTx) peer.videoTx.sender.replaceTrack(local.video).catch(() => {});
}
function attachRemote(peer) {
  const tracks = [peer.audioTx, peer.videoTx].filter(Boolean).map((t) => t.receiver.track);
  const stream = new MediaStream(tracks);
  const tile = renderPeerTile(peer.id);
  if (!tile) return;
  tile.video.srcObject = stream;
  tile.video.play().catch(() => {});
  if (peer.audioTx) watchLevel(peer.id, peer.audioTx.receiver.track);
}
function closePeer(id, keepTile) {
  const p = peers.get(id);
  if (p) { clearTimeout(p.discTimer); try { p.pc.close(); } catch { /* egal */ } peers.delete(id); }
  unwatchLevel(id);
  if (!keepTile) { const t = tiles.get(id); if (t) { t.root.remove(); tiles.delete(id); layoutTiles(); } }
}
function closeAllPeers() { for (const id of [...peers.keys()]) closePeer(id); for (const id of [...tiles.keys()]) if (id !== 'self') closePeer(id); }

// ---------- Mikro & Kamera ----------
async function setMic(on) {
  if (on) {
    if (!local.audio) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: micId ? { ideal: micId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        local.audio = s.getAudioTracks()[0];
        for (const p of peers.values()) applyLocalTracks(p);
      } catch (err) { return toast(mediaError(err, 'Mikrofon'), { error: true, ms: 6000 }); }
    }
    local.audio.enabled = true;
    watchLevel('self', local.audio);
  } else if (local.audio) {
    local.audio.enabled = false;
  }
  renderControls(); renderSelfTile(); emitMedia();
}
async function setCam(on) {
  if (on) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: camId ? { ideal: camId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: camId ? undefined : 'user' },
      });
      if (local.video) local.video.stop();
      local.video = s.getVideoTracks()[0];
      local.video.onended = () => { local.video = null; for (const p of peers.values()) applyLocalTracks(p); renderControls(); renderSelfTile(); emitMedia(); };
    } catch (err) { return toast(mediaError(err, 'Kamera'), { error: true, ms: 6000 }); }
  } else if (local.video) {
    local.video.stop();
    local.video = null;
  }
  for (const p of peers.values()) applyLocalTracks(p);
  renderControls(); renderSelfTile(); emitMedia();
}
function mediaError(err, what) {
  if (!window.isSecureContext) return `${what} geht nur über https:// (online) oder localhost.`;
  if (err && err.name === 'NotAllowedError') return `${what} blockiert – erlaube den Zugriff oben in der Adressleiste (🔒).`;
  if (err && err.name === 'NotFoundError') return `Kein(e) ${what} gefunden.`;
  if (err && err.name === 'NotReadableError') return `${what} wird gerade von einem anderen Programm benutzt.`;
  return `${what} konnte nicht gestartet werden.`;
}
function emitMedia() {
  if (socket && socket.connected) socket.emit('media', { mic: !!(local.audio && local.audio.enabled), cam: !!local.video });
}
function renderControls() {
  const micOn = !!(local.audio && local.audio.enabled);
  const camOn = !!local.video;
  $('#micBtn').innerHTML = micOn ? ICONS.micOn : ICONS.micOff;
  $('#micBtn').className = 'round ' + (micOn ? 'on' : 'off');
  $('#camBtn').innerHTML = camOn ? ICONS.camOn : ICONS.camOff;
  $('#camBtn').className = 'round ' + (camOn ? 'on' : 'off');
}

async function openSettings() {
  $('#settingsModal').classList.remove('hidden');
  let devices = [];
  try { devices = await navigator.mediaDevices.enumerateDevices(); } catch { /* egal */ }
  const fill = (sel, kind, current, label) => {
    sel.replaceChildren(el('option', { value: '', text: 'Standard' }));
    devices.filter((d) => d.kind === kind && d.deviceId).forEach((d, i) => {
      sel.append(el('option', { value: d.deviceId, text: d.label || `${label} ${i + 1}`, selected: d.deviceId === current }));
    });
  };
  fill($('#camSelect'), 'videoinput', camId, 'Kamera');
  fill($('#micSelect'), 'audioinput', micId, 'Mikrofon');
  $('#camSelect').onchange = () => { camId = $('#camSelect').value; store.set('ck_camId', camId); if (local.video) setCam(true); };
  $('#micSelect').onchange = async () => {
    micId = $('#micSelect').value; store.set('ck_micId', micId);
    if (local.audio) {
      const wasOn = local.audio.enabled;
      local.audio.stop(); local.audio = null;
      await setMic(true);
      if (!wasOn) setMic(false);
    }
  };
}

// ---------- Kacheln ----------
const tiles = new Map();
function makeTile(id, self) {
  const video = el('video', { autoplay: true, playsinline: true });
  if (self) video.muted = true;
  const ava = el('div', { class: 'ava' });
  const avaWrap = el('div', { class: 'ava-wrap' }, ava);
  const nameSpan = el('span');
  const micIcon = el('em', { style: 'font-style:normal' });
  const status = el('div', { class: 'status hidden' });
  const root = el('div', { class: 'tile' + (self ? ' self' : '') }, video, avaWrap, el('div', { class: 'tag' }, micIcon, nameSpan), status);
  const t = { root, video, ava, avaWrap, nameSpan, micIcon, status };
  tiles.set(id, t);
  if (self) $('#tiles').prepend(root); else $('#tiles').append(root);
  layoutTiles();
  return t;
}
function layoutTiles() { $('#tiles').classList.toggle('one', tiles.size === 1); }
function renderSelfTile() {
  const t = tiles.get('self') || makeTile('self', true);
  const camOn = !!local.video;
  const micOn = !!(local.audio && local.audio.enabled);
  if (camOn) {
    if (!t.video.srcObject || t.video.srcObject.getVideoTracks()[0] !== local.video) t.video.srcObject = new MediaStream([local.video]);
    t.video.play().catch(() => {});
  } else t.video.srcObject = null;
  t.avaWrap.classList.toggle('hidden', camOn);
  t.ava.textContent = initials(myName);
  const me = selfId && users.get(selfId);
  t.ava.style.background = me ? me.color : 'var(--accent)';
  t.nameSpan.textContent = myName + ' (du)';
  t.micIcon.textContent = micOn ? '' : ICONS.mutedSmall;
}
function renderPeerTile(id) {
  const u = users.get(id);
  if (!u || id === selfId) return null;
  const t = tiles.get(id) || makeTile(id, false);
  t.avaWrap.classList.toggle('hidden', !!u.cam);
  t.ava.textContent = initials(u.name);
  t.ava.style.background = u.color;
  t.nameSpan.textContent = u.name;
  t.micIcon.textContent = u.mic ? '' : ICONS.mutedSmall;
  return t;
}
function setTileStatus(id, text) {
  const t = tiles.get(id);
  if (!t) return;
  t.status.textContent = text;
  t.status.classList.toggle('hidden', !text);
}

// ---------- Wer spricht gerade? ----------
let audioCtx = null;
const meters = new Map();
function setupAudioLevel() {
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  setInterval(() => {
    for (const [id, m] of meters) {
      m.analyser.getByteTimeDomainData(m.data);
      let sum = 0;
      for (let i = 0; i < m.data.length; i++) { const v = (m.data[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / m.data.length);
      const key = id === 'self' ? 'self' : id;
      const t = tiles.get(key);
      const active = id === 'self' ? !!(local.audio && local.audio.enabled) : true;
      if (t) t.root.classList.toggle('speaking', active && rms > 0.04);
    }
  }, 150);
}
function watchLevel(id, track) {
  if (!audioCtx || !track) return;
  unwatchLevel(id);
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const src = audioCtx.createMediaStreamSource(new MediaStream([track]));
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    meters.set(id, { src, analyser, data: new Uint8Array(analyser.fftSize) });
  } catch { /* egal */ }
}
function unwatchLevel(id) {
  const m = meters.get(id);
  if (m) { try { m.src.disconnect(); } catch { /* egal */ } meters.delete(id); }
}

})();
