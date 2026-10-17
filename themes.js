(function () {
  'use strict';
  var keys = ['abyss', 'forest', 'void', 'boykisser'];
  var names = ['ABYSS · Беспокойная бездна', 'FOREST · Древняя роща', 'VOID · Горизонт событий', 'BOYKISSER · Silly Madness'];
  var ids = ['themeAbyss', 'themeForest', 'themeVoid', 'themeBoykisser'];
  var storage = 'morph-loading-theme-v1', motionStorage = 'morph-loading-motion-v1';
  var config = window.MORPH_CONFIG || {}, current = config.defaultTheme || 'abyss';
  var reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var paused = !!(reduced && reduced.matches), explicitMotion = false;
  function get(id) { return document.getElementById(id); }
  function save(key, value) { try { localStorage.setItem(key, value); } catch (ignore) {} }
  try {
    current = localStorage.getItem(storage) || current;
    var motion = localStorage.getItem(motionStorage);
    if (motion === 'paused' || motion === 'running') { paused = motion === 'paused'; explicitMotion = true; }
  } catch (ignore) {}
  function select(key, persist) {
    var index = keys.indexOf(key);
    if (index === -1) { index = 0; key = keys[0]; }
    current = key;
    document.body.setAttribute('data-theme', key);
    get('realmName').textContent = names[index];
    ids.forEach(function (id, n) { get(id).setAttribute('aria-pressed', String(n === index)); });
    if (persist) save(storage, key);
  }
  function renderMotion() {
    // Reduced-motion always takes precedence over a saved animation preference.
    var stopped = paused || !!(reduced && reduced.matches);
    document.body.setAttribute('data-motion', stopped ? 'paused' : 'running');
    get('motion').setAttribute('aria-pressed', String(stopped));
    get('motion').textContent = stopped ? 'Анимация: выкл.' : 'Анимация: вкл.';
    get('motion').disabled = !!(reduced && reduced.matches);
    get('motion').title = reduced && reduced.matches ? 'Анимация отключена в настройках устройства' : 'Декоративная анимация страницы';
  }
  ids.forEach(function (id, index) { get(id).onclick = function () { select(keys[index], true); }; });
  get('motion').onclick = function () { paused = !paused; explicitMotion = true; save(motionStorage, paused ? 'paused' : 'running'); renderMotion(); };
  if (reduced) {
    var changed = function () { if (!explicitMotion) paused = reduced.matches; renderMotion(); };
    if (reduced.addEventListener) reduced.addEventListener('change', changed);
    else if (reduced.addListener) reduced.addListener(changed);
  }
  select(current, false);
  renderMotion();
}());
