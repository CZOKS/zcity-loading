(function () {
  'use strict';
  var config = window.MORPH_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };
  var v = $('video'), list = [], order = [], failed = {}, current = -1;
  var sourceIndex = 0, token = 0, changing = false, timer = null, copyTimer = null;
  var total = null, needed = null, gameSeen = false, lastStatus = '';
  var volumeTouched = false, hasSavedAudio = false, preferredMuted = false;
  var awaitingGesture = false, autoMuted = false;
  var STORAGE = 'morph-loading-audio-v1';

  function text(id, value) { $(id).textContent = String(value); }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function number(value) {
    if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
    var n = Number(value);
    return isFinite(n) ? n : null;
  }
  function nonnegative(value) { var n = number(value); return n !== null && n >= 0 ? Math.floor(n) : null; }
  function short(value, fallback) { return typeof value === 'string' && value.trim() ? value.slice(0, 512) : fallback; }
  function say(value) { text('mediaStatus', value); }
  var initialVolume = number(config.defaultVolume);
  var preferredVolume = initialVolume === null ? 0.25 : clamp(initialVolume, 0, 1);
  var timeout = number(config.videoTimeoutMs);
  timeout = timeout === null ? 30000 : clamp(timeout, 10000, 120000);

  function clearTimer() { if (timer !== null) { clearTimeout(timer); timer = null; } }
  function armTimer(id) {
    clearTimer();
    if (!awaitingGesture) timer = setTimeout(function () { sourceFailed(id); }, timeout);
  }
  function updateVolume() {
    var level = Math.round(v.volume * 100), muted = v.muted || level === 0;
    $('volume').value = String(level);
    text('volumeValue', (muted ? 0 : level) + '%');
    text('mute', muted ? 'Без звука' : 'Звук');
    $('mute').setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук');
    $('mute').setAttribute('aria-pressed', muted ? 'true' : 'false');
  }
  function saveAudio() {
    try { localStorage.setItem(STORAGE, JSON.stringify({ volume: preferredVolume, muted: preferredMuted })); } catch (ignore) {}
  }
  try {
    var stored = localStorage.getItem(STORAGE);
    if (stored) {
      var audio = JSON.parse(stored);
      if (audio && typeof audio.volume === 'number' && isFinite(audio.volume) && audio.volume >= 0 && audio.volume <= 1 && typeof audio.muted === 'boolean') {
        preferredVolume = audio.volume; preferredMuted = audio.muted; hasSavedAudio = true;
      }
    } else {
      var legacy = localStorage.getItem('madness-volume'), old = number(legacy);
      if (old !== null && old >= 0 && old <= 1) {
        preferredVolume = old; preferredMuted = old === 0; hasSavedAudio = true;
      }
    }
  } catch (ignore) {}

  // Only this site's videos/ files. No uploads, external embeds or remote scripts.
  function safeSource(source) {
    if (typeof source !== 'string' || source.indexOf('videos/') !== 0 || source.indexOf('\\') !== -1) return false;
    try {
      var url = new URL(source, location.href), base = new URL('videos/', location.href);
      return (url.protocol === 'https:' || url.protocol === 'http:' || (location.protocol === 'file:' && url.protocol === 'file:')) &&
        url.origin === base.origin && url.pathname.indexOf(base.pathname) === 0 && /\.webm$/i.test(url.pathname);
    } catch (ignore) { return false; }
  }
  function shuffle() {
    order = [];
    for (var i = 0; i < list.length; i++) if (!failed[i]) order.push(i);
    for (var j = order.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1)), swap = order[j]; order[j] = order[k]; order[k] = swap;
    }
    if (order.length > 1 && order[order.length - 1] === current) {
      var first = order[0]; order[0] = order[order.length - 1]; order[order.length - 1] = first;
    }
  }
  function detachVideo() {
    v.onended = v.onerror = v.onplaying = v.onwaiting = v.onloadeddata = v.onprogress = null;
    v.pause(); v.removeAttribute('src'); v.load();
  }
  function noVideo(message) {
    token++; changing = false; clearTimer(); detachVideo();
    $('screen').classList.remove('playing'); $('enable').hidden = true;
    text('counter', 'MORPH TV'); say(message);
  }
  function play(id, mutedRetry) {
    if (id !== token || changing || current < 0) return;
    var player = v;
    function rejected(error) {
      if (id !== token || player !== v || changing) return;
      if (error && error.name === 'AbortError') return;
      if (error && error.name === 'NotAllowedError') {
        clearTimer(); $('enable').hidden = false;
        if (!mutedRetry && !player.muted) {
          autoMuted = true; player.muted = true; updateVolume();
          text('enable', 'Включить звук'); armTimer(id); play(id, true);
        } else {
          awaitingGesture = true; text('enable', 'Запустить видео');
          say('Нажми «Запустить видео», чтобы начать просмотр.');
        }
      } else sourceFailed(id);
    }
    try { var promise = player.play(); if (promise && typeof promise.catch === 'function') promise.catch(rejected); }
    catch (error) { rejected(error); }
  }
  function loadSource() {
    clearTimer(); changing = false; awaitingGesture = false;
    var item = list[current];
    if (!item || sourceIndex >= item.sources.length) { failed[current] = true; next(); return; }
    var id = ++token, previous = v;
    detachVideo();
    // Separate elements isolate late errors and play() promises from the old file.
    v = document.createElement('video');
    v.id = 'video'; v.setAttribute('playsinline', ''); v.setAttribute('preload', 'metadata');
    v.setAttribute('aria-label', 'Видео сервера');
    v.setAttribute('controlslist', 'nodownload noremoteplayback');
    v.disablePictureInPicture = true;
    v.volume = preferredVolume; v.muted = preferredMuted || autoMuted || preferredVolume === 0;
    previous.parentNode.replaceChild(v, previous);
    $('screen').classList.remove('playing');
    $('enable').hidden = !autoMuted || preferredMuted || preferredVolume === 0;
    text('enable', 'Включить звук');
    v.onended = function () { if (id === token && !changing) next(); };
    v.onerror = function () { sourceFailed(id); };
    v.onplaying = function () {
      if (id !== token || changing) return;
      clearTimer(); awaitingGesture = false;
      $('screen').classList.add('playing'); say(item.title);
    };
    v.onwaiting = function () { if (id === token && !changing) { say('Буферизация видео…'); armTimer(id); } };
    v.onloadeddata = function () { if (id === token && !changing && !awaitingGesture) armTimer(id); };
    v.onprogress = function () { if (id === token && !changing && timer !== null) armTimer(id); };
    updateVolume(); say(item.title);
    v.src = item.sources[sourceIndex]; v.load(); armTimer(id); play(id, false);
  }
  function sourceFailed(id) {
    if (id !== token || changing) return;
    clearTimer(); changing = true;
    // Queue instead of recursing through a broken playlist.
    timer = setTimeout(function () {
      if (id !== token) return;
      timer = null; sourceIndex++; loadSource();
    }, 0);
  }
  function next() {
    clearTimer();
    if (!list.length) { noVideo('Видео пока не добавлены. Подключение к серверу продолжается.'); return; }
    order = order.filter(function (index) { return !failed[index]; });
    if (!order.length) shuffle();
    if (!order.length) { noVideo('Видео недоступны. Подключение к серверу продолжается.'); return; }
    current = order.pop(); sourceIndex = 0;
    text('counter', 'РОЛИК ' + ('0' + (current + 1)).slice(-2) + ' / ' + list.length);
    loadSource();
  }
  function setList(items) {
    list = [];
    if (!Array.isArray(items)) items = [];
    items.forEach(function (item, index) {
      if (!item || !Array.isArray(item.sources)) return;
      var sources = item.sources.filter(safeSource);
      if (sources.length) list.push({ title: short(item.title, 'Видео ' + (index + 1)), sources: sources });
    });
    order = []; failed = {}; current = -1; next();
  }
  function userAudio() {
    volumeTouched = true; awaitingGesture = false; autoMuted = false;
    v.volume = preferredVolume; v.muted = preferredMuted || preferredVolume === 0;
    $('enable').hidden = true; updateVolume(); saveAudio();
    if (current >= 0 && v.getAttribute('src') && v.paused) { armTimer(token); play(token, false); }
  }
  $('volume').oninput = function () {
    var level = number(this.value); if (level === null) return;
    preferredVolume = clamp(level / 100, 0, 1); preferredMuted = preferredVolume === 0; userAudio();
  };
  $('mute').onclick = function () {
    if (v.muted || v.volume === 0) { preferredMuted = false; if (preferredVolume === 0) preferredVolume = 0.25; }
    else preferredMuted = true;
    userAudio();
  };
  $('enable').onclick = function () {
    if (!awaitingGesture) { preferredMuted = false; if (preferredVolume === 0) preferredVolume = 0.25; }
    userAudio();
  };

  function observedGame() {
    if (!gameSeen) { gameSeen = true; text('connectionLabel', 'ПОДКЛЮЧЕНИЕ'); }
  }
  function progress() {
    var known = total !== null && total > 0 && needed !== null && needed <= total;
    $('progress').classList.toggle('is-indeterminate', !known && total !== 0);
    if (!known) {
      text('percent', '—'); $('bar').style.width = total === 0 ? '0%' : ''; $('progress').removeAttribute('aria-valuenow');
      text('fileCount', total === 0 ? 'Дополнительные файлы не требуются' : (needed !== null && total !== null && needed > total ? 'Обновляется список файлов' : 'Ожидаем список файлов'));
      return;
    }
    var done = total - needed, percent = Math.floor(done / total * 100);
    text('percent', percent + '%'); $('bar').style.width = percent + '%';
    $('progress').setAttribute('aria-valuenow', String(percent));
    text('fileCount', done + ' / ' + total);
    if (needed === 0) text('file', 'Файлы получены. Игра завершает подключение.');
  }
  window.GameDetails = function (name, url, map, max, steam, mode, volume) {
    observedGame();
    text('server', short(name, config.serverName || 'Morph | Z-CITY'));
    text('map', short(map, 'Ожидаем данные'));
    text('mode', short(mode, 'Z-City'));
    var slots = nonnegative(max); $('slotsRow').hidden = slots === null || slots === 0;
    if (slots !== null && slots > 0) text('slots', slots);
    if (!lastStatus) text('status', 'Подключение к серверу');
    var level = number(volume);
    if (config.respectGameVolume !== false && !volumeTouched && !hasSavedAudio && level !== null) {
      preferredVolume = clamp(level, 0, 1); preferredMuted = preferredVolume === 0;
      v.volume = preferredVolume; v.muted = preferredMuted || autoMuted;
      if (preferredMuted && !awaitingGesture) $('enable').hidden = true;
      updateVolume();
    }
  };
  window.SetFilesTotal = function (n) { observedGame(); total = nonnegative(n); progress(); };
  window.SetFilesNeeded = function (n) { observedGame(); needed = nonnegative(n); progress(); };
  window.DownloadingFile = function (name) { observedGame(); text('file', short(name, 'Получаем файлы сервера…')); };
  window.SetStatusChanged = function (status) {
    observedGame(); lastStatus = short(status, 'Подключение к серверу'); text('status', lastStatus);
  };

  function configure() {
    var brand = short(config.brand, 'MORPH'), edition = short(config.edition, 'Z-CITY');
    text('brand', brand); text('brandSmall', brand); text('edition', edition); text('editionSmall', edition);
    text('server', short(config.serverName, 'Morph | Z-CITY'));
    text('address', short(config.serverAddress, '46.174.49.58:27015'));
    text('description', short(config.description, 'Загружайся.\nУвидимся в игре.'));
    text('creators', short(config.creators, 'Fusion · Uzer'));
    document.title = short(config.serverName, 'Morph | Z-CITY') + ' — подключение';
    try {
      var params = new URLSearchParams(location.search), map = params.get('map') || params.get('Map');
      if (map && map !== '%m') text('map', map.slice(0, 128));
    } catch (ignore) {}
    if (typeof config.discordUrl === 'string' && config.discordUrl) {
      try {
        var link = new URL(config.discordUrl);
        if (link.protocol === 'https:' && /^(discord\.gg|discord\.com|www\.discord\.com)$/.test(link.hostname)) {
          $('discord').href = link.href; $('discord').hidden = false;
        }
      } catch (ignore) {}
    }
  }
  function copied(success) {
    text('copyStatus', success ? 'IP скопирован' : 'Выдели IP и скопируй вручную');
    if (copyTimer !== null) clearTimeout(copyTimer);
    copyTimer = setTimeout(function () { text('copyStatus', ''); }, 3500);
  }
  function legacyCopy(value) {
    var field = document.createElement('textarea'); field.value = value;
    field.setAttribute('readonly', ''); field.style.position = 'fixed'; field.style.left = '-9999px';
    document.body.appendChild(field); var success = false;
    try { field.select(); success = document.execCommand('copy'); } catch (ignore) {}
    document.body.removeChild(field); $('copyIp').focus(); copied(success);
  }
  $('copyIp').onclick = function () {
    var value = $('address').textContent;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try { navigator.clipboard.writeText(value).then(function () { copied(true); }, function () { legacyCopy(value); }); }
      catch (ignore) { legacyCopy(value); }
    } else legacyCopy(value);
  };

  v.volume = preferredVolume; v.muted = preferredMuted || preferredVolume === 0;
  updateVolume(); configure(); progress();
  setList(window.MORPH_PLAYLIST || window.MADNESS_PLAYLIST || []);
})();
