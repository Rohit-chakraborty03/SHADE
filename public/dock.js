/* S.H.A.D.E. dock.js  (load it LAST, after voice.js)
   Minimise on ANY card sends it to a small "Minimised" tray that appears bottom-left (always visible),
   and lights its button on the green taskbar. Click the chip or the taskbar button to bring the card back.
   Does not touch the plan, the map data or any numbers. */
(function () {
  'use strict';
  var holder = document.getElementById('task-buttons');

  var ORDER = [
    ['win-readme', 'About'], ['win-notice', 'Data notice'], ['win-controls', 'Budget'], ['win-map', 'Map'],
    ['ward-drawer', 'Ward inspector'], ['win-plan', 'Plan'], ['win-bench', 'Benchmarks'],
    ['win-tradeoff', 'Trade-off'], ['win-model', 'Model card']
  ];
  var LABEL = {}; ORDER.forEach(function (o) { LABEL[o[0]] = o[1]; });
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var btns = {}, chips = {}, state = {}, busy = {};

  /* the tray: a fixed chip bar that is always on screen, even if the taskbar is hidden or scrolled away */
  var tray = document.createElement('div');
  tray.id = 'dock-tray'; tray.hidden = true;
  tray.setAttribute('role', 'region'); tray.setAttribute('aria-label', 'Minimised cards');
  tray.innerHTML = '<span class="dock-tray-label">Minimised</span>';
  document.body.appendChild(tray);

  function resize() {
    try { if (typeof map !== 'undefined' && map && map.resize) map.resize(); } catch (e) {}
    try { if (typeof heatmapMap !== 'undefined' && heatmapMap && heatmapMap.resize) heatmapMap.resize(); } catch (e) {}
    try { window.dispatchEvent(new Event('resize')); } catch (e) {}
  }
  function centreOf(node) { var r = node.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  function showChip(el) {
    if (chips[el.id]) return chips[el.id];
    var c = document.createElement('button');
    c.type = 'button'; c.className = 'dock-chip'; c.textContent = LABEL[el.id] || 'Card';
    c.title = 'Bring this card back';
    c.addEventListener('click', function () { undock(el, true); });
    tray.appendChild(c); chips[el.id] = c; tray.hidden = false;
    return c;
  }
  function hideChip(el) {
    var c = chips[el.id];
    if (c) { c.remove(); delete chips[el.id]; }
    if (!Object.keys(chips).length) tray.hidden = true;
  }
  function paint(el) {
    var on = !!state[el.id], b = btns[el.id];
    if (b) { b.classList.toggle('is-min', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    if (on) showChip(el); else hideChip(el);
  }
  function sync(el) {            // something else (e.g. the guided tour) showed the card again
    if (state[el.id] && !busy[el.id] && el.style.display !== 'none') state[el.id] = false;
    paint(el);
  }

  function dock(el) {
    if (state[el.id]) return;
    if (el.id === 'win-plan' && el.classList.contains('plan-floating')) {   // leave the big floating view first
      var ph = document.querySelector('.plan-placeholder'); if (ph) ph.click();
    }
    if (el.classList.contains('maximized')) {
      el.classList.remove('maximized');
      document.body.classList.toggle('has-max', !!document.querySelector('.win.maximized'));
    }
    el.classList.remove('collapsed');
    state[el.id] = true; busy[el.id] = true;
    var chip = showChip(el), from = centreOf(el), to = centreOf(chip);
    paint(el);
    function finish() { el.style.display = 'none'; busy[el.id] = false; resize(); }
    if (el.animate && !still) {
      var a = el.animate(
        [{ transform: 'none', opacity: 1 }, { transform: 'translate(' + (to.x - from.x) + 'px,' + (to.y - from.y) + 'px) scale(.05)', opacity: 0.1 }],
        { duration: 420, easing: 'cubic-bezier(.5,0,.75,.4)', fill: 'forwards' });
      chip.animate([{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1.15)', opacity: 1, offset: .8 }, { transform: 'scale(1)', opacity: 1 }], { duration: 520, delay: 200, fill: 'backwards' });
      a.onfinish = function () { el.style.display = 'none'; a.cancel(); busy[el.id] = false; resize(); };
    } else finish();
  }

  function undock(el, scroll) {
    var was = !!state[el.id], chip = chips[el.id];
    var from = chip ? centreOf(chip) : null;
    state[el.id] = false; busy[el.id] = false;
    el.style.display = ''; el.classList.remove('collapsed');
    paint(el);
    if (was && from && el.animate && !still) {
      var to = centreOf(el);
      el.animate([{ transform: 'translate(' + (from.x - to.x) + 'px,' + (from.y - to.y) + 'px) scale(.05)', opacity: 0.1 }, { transform: 'none', opacity: 1 }],
                 { duration: 380, easing: 'cubic-bezier(.2,.7,.3,1)' });
    }
    resize(); setTimeout(resize, 400);
    if (scroll) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('flash'); setTimeout(function () { el.classList.remove('flash'); }, 900);
    }
  }

  // taskbar buttons (they also work as before: click = jump to the card, or bring it back if minimised)
  if (holder) {
    holder.textContent = '';
    ORDER.forEach(function (t) {
      var el = document.getElementById(t[0]);
      if (!el) return;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'task-btn'; b.textContent = t[1];
      b.setAttribute('aria-pressed', 'false');
      b.title = 'Jump to this card. If it is minimised, bring it back.';
      b.addEventListener('click', function () { undock(el, true); });
      holder.appendChild(b); btns[t[0]] = b;
    });
  }
  ORDER.forEach(function (t) {
    var el = document.getElementById(t[0]);
    if (el) new MutationObserver(function () { sync(el); }).observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
  });

  // any minimise button on any card (old windows, the Plan window, the data notice)
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-act="min"], [data-plan-act="min"], .dock-min');
    if (!b) return;
    var el = b.closest('.win, .dockable');
    if (!el || !LABEL[el.id]) return;
    e.stopPropagation(); e.preventDefault();
    dock(el);
  }, true);

  window.shadeDock = {
    dock: function (id) { var el = document.getElementById(id); if (el) dock(el); },
    restore: function (id) { var el = document.getElementById(id); if (el) undock(el, true); }
  };
})();