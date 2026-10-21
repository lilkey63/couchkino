'use strict';
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 20000, maxHttpBufferSize: 2e5 });

// Nur die drei Webseiten-Dateien ausliefern (alles liegt im Hauptordner)
const sendPage = (file) => (req, res) => res.sendFile(path.join(__dirname, file));
app.get('/', sendPage('index.html'));
app.get('/r/:room', sendPage('index.html'));
app.get('/app.js', sendPage('app.js'));
app.get('/style.css', sendPage('style.css'));
app.get('/healthz', (req, res) => res.send('ok'));

// ICE-Server für WebRTC (STUN immer, TURN optional über Umgebungsvariablen)
app.get('/api/ice', (req, res) => {
  const iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (process.env.TURN_URLS) {
    iceServers.push({
      urls: process.env.TURN_URLS.split(',').map((s) => s.trim()).filter(Boolean),
      username: process.env.TURN_USERNAME || '',
      credential: process.env.TURN_CREDENTIAL || '',
    });
  }
  res.json({ iceServers });
});

const COLORS = ['#ff7a59', '#5ec8ff', '#b48cff', '#5fe0a2', '#ffd25e', '#ff6fae', '#7ab8ff', '#ffa94d'];
const REACTIONS = ['❤️', '😂', '😮', '😭', '🔥', '👏', '💀', '🥺'];
const MAX_CHAT = 200;
const MAX_QUEUE = 100;

// ---------- YouTube-Hilfen ----------
function validId(id) { return /^[\w-]{11}$/.test(id || '') ? id : null; }
function parseYouTube(input) {
  input = String(input || '').trim();
  if (validId(input)) return input;
  try {
    const u = new URL(/^https?:\/\//i.test(input) ? input : 'https://' + input);
    const host = u.hostname.replace(/^(www|m|music)\./, '');
    if (host === 'youtu.be') return validId(u.pathname.slice(1).split('/')[0]);
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.searchParams.get('v')) return validId(u.searchParams.get('v'));
      const m = u.pathname.match(/^\/(embed|shorts|live|v)\/([\w-]{11})/);
      if (m) return m[2];
    }
  } catch { /* kein gültiger Link */ }
  return null;
}

const infoCache = new Map();
async function fetchInfo(videoId) {
  if (infoCache.has(videoId)) return infoCache.get(videoId);
  try {
    const url = 'https://www.youtube.com/oembed?format=json&url=' +
      encodeURIComponent('https://www.youtube.com/watch?v=' + videoId);
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (r.status === 401 || r.status === 403) return { ok: false, reason: 'Dieses Video erlaubt kein Abspielen auf anderen Seiten.' };
    if (r.status === 404 || r.status === 400) return { ok: false, reason: 'Video nicht gefunden (privat oder gelöscht?).' };
    if (!r.ok) throw new Error('status ' + r.status);
    const j = await r.json();
    const info = { ok: true, title: String(j.title || 'YouTube-Video').slice(0, 200), channel: String(j.author_name || '').slice(0, 100) };
    infoCache.set(videoId, info);
    return info;
  } catch {
    return { ok: true, title: 'YouTube-Video', channel: '' };
  }
}

// ---------- Räume ----------
const rooms = new Map();
function getRoom(id) {
  let r = rooms.get(id);
  if (!r) {
    r = {
      id, users: new Map(), queue: [], chat: [], colorIdx: 0, deleteTimer: null,
      player: { video: null, playing: false, time: 0, rate: 1, updatedAt: Date.now() },
    };
    rooms.set(id, r);
  }
  if (r.deleteTimer) { clearTimeout(r.deleteTimer); r.deleteTimer = null; }
  return r;
}
function curTime(p) { return p.playing ? p.time + ((Date.now() - p.updatedAt) / 1000) * p.rate : p.time; }
function playerView(r, by) {
  const p = r.player;
  return { video: p.video, playing: p.playing, time: curTime(p), rate: p.rate, serverNow: Date.now(), by: by || null };
}
function score(q) { let s = 0; for (const v of q.votes.values()) s += v; return s; }
function queueView(r) {
  return r.queue.map((q) => ({
    id: q.id, videoId: q.videoId, title: q.title, channel: q.channel,
    addedBy: q.addedBy, addedAt: q.addedAt, votes: Object.fromEntries(q.votes),
  }));
}
function userView(u) { return { id: u.id, key: u.key, name: u.name, color: u.color, mic: u.mic, cam: u.cam }; }
function pushChat(r, msg) {
  const m = { id: crypto.randomUUID(), at: Date.now(), ...msg };
  r.chat.push(m);
  if (r.chat.length > MAX_CHAT) r.chat.splice(0, r.chat.length - MAX_CHAT);
  io.to(r.id).emit('chat:msg', m);
}
function system(r, text) { pushChat(r, { system: true, text }); }

function startVideo(r, item, byName) {
  r.player = {
    video: { id: item.videoId, title: item.title, channel: item.channel },
    playing: true, time: 0, rate: 1, updatedAt: Date.now(),
  };
  io.to(r.id).emit('player:state', playerView(r, byName));
  system(r, `▶ Jetzt läuft: ${item.title}`);
}
function advance(r, byName) {
  const candidates = r.queue.filter((q) => score(q) >= 0)
    .sort((a, b) => score(b) - score(a) || a.addedAt - b.addedAt);
  const next = candidates[0];
  if (next) {
    r.queue = r.queue.filter((q) => q !== next);
    io.to(r.id).emit('queue', queueView(r));
    startVideo(r, next, byName);
  } else {
    r.player = { video: null, playing: false, time: 0, rate: 1, updatedAt: Date.now() };
    io.to(r.id).emit('player:state', playerView(r, byName));
    if (r.queue.length) system(r, 'Playlist zu Ende – die übrigen Videos haben mehr 👎 als 👍.');
  }
}

// ---------- Socket-Verbindungen ----------
io.on('connection', (socket) => {
  let room = null;
  let me = null;
  let lastChat = 0;

  socket.on('time:ping', (cb) => { if (typeof cb === 'function') cb(Date.now()); });

  socket.on('join', ({ room: roomId, name, key } = {}) => {
    roomId = String(roomId || '').toLowerCase();
    if (!/^[a-z0-9-]{3,40}$/.test(roomId) || room) return;
    name = String(name || '').trim().slice(0, 24) || 'Gast';
    key = String(key || '').slice(0, 40) || socket.id;
    room = getRoom(roomId);
    me = { id: socket.id, key, name, color: COLORS[room.colorIdx++ % COLORS.length], mic: false, cam: false };
    room.users.set(socket.id, me);
    socket.join(roomId);
    socket.emit('init', {
      selfId: socket.id,
      users: [...room.users.values()].map(userView),
      queue: queueView(room),
      chat: room.chat,
      player: playerView(room),
    });
    socket.to(roomId).emit('user:joined', userView(me));
    system(room, `${me.name} ist da 👋`);
  });

  socket.on('media', ({ mic, cam } = {}) => {
    if (!me) return;
    me.mic = !!mic; me.cam = !!cam;
    io.to(room.id).emit('user:update', userView(me));
  });

  socket.on('signal', ({ to, data } = {}) => {
    if (!room || !room.users.has(to) || !data) return;
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('chat', ({ text } = {}) => {
    if (!me) return;
    text = String(text || '').trim().slice(0, 1000);
    const now = Date.now();
    if (!text || now - lastChat < 250) return;
    lastChat = now;
    pushChat(room, { name: me.name, color: me.color, key: me.key, uid: me.id, text });
  });

  socket.on('react', ({ emoji } = {}) => {
    if (!me || !REACTIONS.includes(emoji)) return;
    io.to(room.id).emit('react', { emoji, name: me.name, color: me.color });
  });

  socket.on('queue:add', async ({ url } = {}, cb) => {
    const reply = (x) => typeof cb === 'function' && cb(x);
    if (!me) return reply({ ok: false });
    const videoId = parseYouTube(url);
    if (!videoId) return reply({ ok: false, reason: 'Das ist kein YouTube-Link.' });
    if (room.queue.length >= MAX_QUEUE) return reply({ ok: false, reason: 'Die Playlist ist voll.' });
    if (room.queue.some((q) => q.videoId === videoId)) return reply({ ok: false, reason: 'Das Video ist schon in der Playlist.' });
    const info = await fetchInfo(videoId);
    if (!info.ok) return reply({ ok: false, reason: info.reason });
    if (!room.users.has(socket.id)) return;
    const item = {
      id: crypto.randomUUID(), videoId, title: info.title, channel: info.channel,
      addedBy: me.name, addedAt: Date.now(), votes: new Map(),
    };
    if (!room.player.video) {
      reply({ ok: true, started: true });
      startVideo(room, item, me.name);
      return;
    }
    room.queue.push(item);
    io.to(room.id).emit('queue', queueView(room));
    socket.to(room.id).emit('queue:added', { item: queueView(room).find((q) => q.id === item.id), by: me.name });
    system(room, `${me.name} hat „${item.title}“ zur Playlist hinzugefügt`);
    reply({ ok: true });
  });

  socket.on('queue:vote', ({ itemId, v } = {}) => {
    if (!me) return;
    const item = room.queue.find((q) => q.id === itemId);
    if (!item) return;
    v = Number(v);
    if (v === 1 || v === -1) item.votes.set(me.key, v); else item.votes.delete(me.key);
    io.to(room.id).emit('queue', queueView(room));
  });

  socket.on('queue:remove', ({ itemId } = {}) => {
    if (!me) return;
    const item = room.queue.find((q) => q.id === itemId);
    if (!item) return;
    room.queue = room.queue.filter((q) => q !== item);
    io.to(room.id).emit('queue', queueView(room));
    system(room, `${me.name} hat „${item.title}“ entfernt`);
  });

  socket.on('queue:play', ({ itemId } = {}) => {
    if (!me) return;
    const item = room.queue.find((q) => q.id === itemId);
    if (!item) return;
    room.queue = room.queue.filter((q) => q !== item);
    io.to(room.id).emit('queue', queueView(room));
    startVideo(room, item, me.name);
  });

  socket.on('player:next', () => { if (me) advance(room, me.name); });

  socket.on('player:ended', ({ videoId } = {}) => {
    if (!me || !room.player.video || room.player.video.id !== videoId) return;
    advance(room, null);
  });

  socket.on('player:update', ({ playing, time, rate } = {}) => {
    if (!me || !room.player.video) return;
    time = Number(time); rate = Number(rate) || 1;
    if (!Number.isFinite(time) || time < 0) return;
    room.player.playing = !!playing;
    room.player.time = time;
    room.player.rate = Math.min(2, Math.max(0.25, rate));
    room.player.updatedAt = Date.now();
    socket.to(room.id).emit('player:state', playerView(room, me.name));
  });

  socket.on('disconnect', () => {
    if (!room || !me) return;
    room.users.delete(socket.id);
    io.to(room.id).emit('user:left', { id: socket.id });
    system(room, `${me.name} ist gegangen`);
    if (room.users.size === 0) {
      const r = room;
      r.deleteTimer = setTimeout(() => { if (r.users.size === 0) rooms.delete(r.id); }, 30 * 60 * 1000);
    }
  });
});

server.listen(PORT, () => console.log(`Couchkino läuft auf http://localhost:${PORT}`));
