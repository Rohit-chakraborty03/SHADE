/* S.H.A.D.E. jungle.js  (load it LAST, after dock.js)
   The little story at the bottom of the page, on a loop:
   a woodcutter chops the jungle down -> the sun rises and the whole place turns red -> he sweats ->
   he collapses -> he turns into a tiny plant -> the jungle grows back -> and it starts again.
   Pure decoration: it only draws inside the tree strip and never touches the plan, the map or any number. */
(function () {
  'use strict';
  var strip = document.querySelector('.treeline');
  var svg = strip && strip.querySelector('svg');
  var ground = svg && svg.querySelector('.ground');
  if (!svg || !ground) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var NS = 'http://www.w3.org/2000/svg';
  var VBW = 1440, VBH = 210, VBY = -40, GY = 158;           // taller view so the sun has room above the trees
  var CFG = { walkSpeed: 380, swings: 2, cluster: 58, regrowMs: 3200, restMs: 2600 };
  svg.setAttribute('viewBox', '0 ' + VBY + ' ' + VBW + ' ' + VBH);

  /* ───────── tiny helpers ───────── */
  function mk(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function easeOut(p) { return 1 - Math.pow(1 - p, 3); }
  function easeIn(p) { return p * p; }
  function easeInOut(p) { return p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
  function easeBack(p) { var c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); }
  function rgb(a, b, p) { return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(lerp(a[i], b[i], p)); }).join(',') + ')'; }
  var SKIN = [224, 172, 105], FLUSH = [232, 72, 52];

  /* only animate while the strip is on screen and the tab is in front */
  var onScreen = true;
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { onScreen = es[es.length - 1].isIntersecting; }).observe(strip);
  function live() { return onScreen && !document.hidden; }
  var raf = function (f) { return window.requestAnimationFrame(f); };

  function tween(ms, fn) {
    return new Promise(function (res) {
      var acc = 0, last = null;
      function f(t) {
        if (last === null) last = t;
        var dt = Math.min(t - last, 50); last = t;
        if (live()) acc += dt;
        var p = ms > 0 ? Math.min(acc / ms, 1) : 1;
        fn(p, dt);
        if (p >= 1) res(); else raf(f);
      }
      raf(f);
    });
  }
  function wait(ms) { return tween(ms, function () {}); }

  function viewRange() {                                          // which part of the 1440-wide scene is really on screen
    var r = svg.getBoundingClientRect();
    var cw = r.width || window.innerWidth || VBW, ch = r.height || 210;
    var s = Math.max(cw / VBW, ch / VBH), w = cw / s;
    return { x0: VBW / 2 - w / 2, x1: VBW / 2 + w / 2 };
  }

  /* ───────── scene parts ───────── */
  var defs = mk('defs', {});
  var gSun = mk('radialGradient', { id: 'jgSun' }, defs);
  [['0', '#fff3b0', '1'], ['.35', '#ffc23a', '.75'], ['.7', '#ff7a2f', '.25'], ['1', '#ff5a2a', '0']].forEach(function (s) { mk('stop', { offset: s[0], 'stop-color': s[1], 'stop-opacity': s[2] }, gSun); });
  var gHeat = mk('linearGradient', { id: 'jgHeat', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
  mk('stop', { offset: '0', 'stop-color': '#ff4a2a', 'stop-opacity': '.85' }, gHeat);
  mk('stop', { offset: '1', 'stop-color': '#c1121f', 'stop-opacity': '.6' }, gHeat);
  svg.insertBefore(defs, svg.firstChild);

  var sun = mk('g', { opacity: '0' });
  svg.insertBefore(sun, defs.nextSibling);                          // behind the trees
  mk('circle', { r: 78, fill: 'url(#jgSun)' }, sun);
  var rays = mk('g', { stroke: '#ffb703', 'stroke-width': 3, 'stroke-linecap': 'round' }, sun);
  for (var i = 0; i < 14; i++) {
    var a = i / 14 * Math.PI * 2;
    mk('line', { x1: Math.cos(a) * 36, y1: Math.sin(a) * 36, x2: Math.cos(a) * 50, y2: Math.sin(a) * 50 }, rays);
  }
  mk('circle', { r: 28, fill: '#ffb703' }, sun);
  mk('circle', { r: 22, cx: -4, cy: -4, fill: '#ffd966', opacity: '.8' }, sun);

  // wrap every tree so it can fall / regrow without fighting the sway code
  var trees = [];
  Array.prototype.slice.call(svg.children).forEach(function (g) {
    if (g.tagName !== 'g' || !g.querySelector('.tree-sway')) return;
    var m = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)/.exec(g.getAttribute('transform') || '');
    if (!m) return;
    var w = mk('g', {});
    svg.insertBefore(w, g); w.appendChild(g);
    trees.push({ wrap: w, x: +m[1], y: +m[2], stump: null, gone: false });
  });
  trees.sort(function (a, b) { return a.x - b.x; });
  if (!trees.length) return;

  var gStumps = mk('g', {});
  svg.insertBefore(gStumps, ground);

  var heatRect = mk('rect', { x: -400, y: VBY - 20, width: VBW + 800, height: VBH + 40, fill: 'url(#jgHeat)', opacity: '0', 'pointer-events': 'none' });
  svg.appendChild(heatRect);
  var shimmer = mk('g', { fill: 'none', stroke: '#ffe0a8', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: '0' });
  svg.appendChild(shimmer);
  var waves = [96, 118, 140].map(function (y) {
    var d = 'M-120 ' + y;
    for (var x = -120; x < VBW + 160; x += 60) d += ' q15 -9 30 0 t30 0';
    return mk('path', { d: d }, shimmer);
  });

  var sprout = mk('g', { opacity: '0' });
  svg.appendChild(sprout);
  mk('path', { d: 'M0 0 C-1 -10 1 -18 0 -27', stroke: '#2f9e5b', 'stroke-width': 3.2, fill: 'none', 'stroke-linecap': 'round' }, sprout);
  mk('path', { d: 'M0 -19 C-15 -26 -19 -15 -17 -11 C-9 -9 -2 -13 0 -19Z', fill: '#43b86a' }, sprout);
  mk('path', { d: 'M0 -24 C15 -33 21 -22 18 -18 C10 -16 2 -20 0 -24Z', fill: '#2f9e5b' }, sprout);
  mk('circle', { cy: -28, r: 3, fill: '#9be07a' }, sprout);

  /* the woodcutter (feet at y=0, about 53 units tall) */
  var man = { x: -200, leg: 0, arm: 12, rot: 0, shown: false, flush: 0 };
  var gMan = mk('g', { opacity: '0' });
  svg.appendChild(gMan);
  var legs = [0, 1].map(function () {
    var l = mk('g', {}, gMan);
    mk('rect', { x: -2.2, y: -22, width: 4.4, height: 21, rx: 1.8, fill: '#37474f' }, l);
    mk('rect', { x: -2.4, y: -3.2, width: 8, height: 3.6, rx: 1.6, fill: '#1f2326' }, l);
    return l;
  });
  mk('rect', { x: -5.5, y: -42, width: 11, height: 21, rx: 4, fill: '#2a5d9f' }, gMan);
  var head = mk('circle', { cy: -48.5, r: 6, fill: rgb(SKIN, FLUSH, 0) }, gMan);
  mk('path', { d: 'M-6.2 -50 A6.2 6.2 0 0 1 6.2 -50 L6.2 -52.5 A7 7 0 0 0 -6.2 -52.5Z', fill: '#5d4037' }, gMan);
  mk('circle', { cx: 2.6, cy: -48.5, r: .9, fill: '#222' }, gMan);
  var armG = mk('g', {}, gMan);
  mk('rect', { x: -1.5, y: -26, width: 3, height: 28, rx: 1, fill: '#8d5a2b' }, armG);                 // axe handle
  mk('path', { d: 'M1.5 -1 L11 -5 L11 7 L1.5 3Z', fill: '#a9b4ba', stroke: '#6b777d', 'stroke-width': .6 }, armG); // blade
  mk('rect', { x: -2.6, y: -39, width: 5.2, height: 15.5, rx: 2.6, fill: '#2a5d9f' }, armG);           // sleeve
  mk('circle', { cy: -23.5, r: 2.8, fill: SKIN_CSS() }, armG);                                          // hand
  function SKIN_CSS() { return 'rgb(' + SKIN.join(',') + ')'; }

  var gFx = mk('g', {});
  svg.appendChild(gFx);

  function pose() {
    gMan.setAttribute('transform', 'translate(' + man.x.toFixed(1) + ' ' + GY + ') rotate(' + man.rot.toFixed(1) + ') scale(1.2)');
    legs[0].setAttribute('transform', 'rotate(' + man.leg.toFixed(1) + ' 0 -22)');
    legs[1].setAttribute('transform', 'rotate(' + (-man.leg).toFixed(1) + ' 0 -22)');
    armG.setAttribute('transform', 'rotate(' + man.arm.toFixed(1) + ' 0 -38)');
    head.setAttribute('fill', rgb(SKIN, FLUSH, man.flush));
  }
  function setWrap(t, ang, s) {
    t.wrap.setAttribute('transform', 'translate(' + t.x + ' ' + t.y + ') rotate(' + ang.toFixed(1) + ') scale(' + s.toFixed(3) + ') translate(' + (-t.x) + ' ' + (-t.y) + ')');
  }

  /* ───────── particles (wood chips, sweat, green sparkles) and the always-on shimmer ───────── */
  var parts = [], heat = 0, clock = 0, sunSpin = 0;
  var DROP = 'M0 -4 C2 -1 3 1 0 3.2 C-3 1 -2 -1 0 -4Z';
  function spawn(kind, x, y) {
    var el, p = { x: x, y: y, life: 0 };
    if (kind === 'chip') {
      el = mk('rect', { x: -1.6, y: -1, width: 3.2, height: 2, fill: '#c9955a' }, gFx);
      p.vx = 25 + Math.random() * 55; p.vy = -(40 + Math.random() * 70); p.g = 280; p.max = .6;
    } else if (kind === 'sweat') {
      el = mk('path', { d: DROP, fill: '#8fd8ff', stroke: '#3aa0d8', 'stroke-width': .5 }, gFx);
      p.vx = (Math.random() - .3) * 14; p.vy = 8 + Math.random() * 14; p.g = 170; p.max = 1.0;
    } else {
      el = mk('circle', { r: 2 + Math.random() * 1.6, fill: Math.random() < .5 ? '#7bd88f' : '#c8f2a0' }, gFx);
      var a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 40;
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - 25; p.g = 30; p.max = 1.1;
    }
    p.el = el; parts.push(p);
  }
  var lastT = null;
  function frame(t) {
    if (lastT === null) lastT = t;
    var dt = Math.min((t - lastT) / 1000, .05); lastT = t;
    if (live()) {
      clock += dt;
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.life += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.life >= p.max || p.y > GY + 4) { p.el.remove(); parts.splice(i, 1); continue; }
        p.el.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ')');
        p.el.setAttribute('opacity', (1 - p.life / p.max).toFixed(2));
      }
      if (heat > 0.01) {
        shimmer.setAttribute('opacity', (heat * .55).toFixed(2));
        waves.forEach(function (w, k) { w.setAttribute('transform', 'translate(' + (Math.sin(clock * 1.8 + k * 1.7) * 18).toFixed(1) + ' ' + (Math.sin(clock * 2.6 + k) * 2).toFixed(1) + ')'); });
      } else shimmer.setAttribute('opacity', '0');
      if (+sun.getAttribute('opacity') > 0) { sunSpin += dt * 14; rays.setAttribute('transform', 'rotate(' + sunSpin.toFixed(1) + ')'); }
    }
    raf(frame);
  }
  raf(frame);

  function setSun(x, y, o) { sun.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')'); sun.setAttribute('opacity', o.toFixed(2)); }
  function setHeat(h) { heat = h; heatRect.setAttribute('opacity', (h * .46).toFixed(3)); }

  /* ───────── the story ───────── */
  var phase = 'rest';
  function armTo(angle, ms, ez) {
    var a0 = man.arm; ez = ez || easeOut;
    return tween(ms, function (p) { man.arm = lerp(a0, angle, ez(p)); pose(); });
  }
  function walkTo(tx) {
    var x0 = man.x, dist = Math.abs(tx - x0);
    if (dist < 1) return Promise.resolve();
    return tween(dist / CFG.walkSpeed * 1000, function (p) {
      var ph = p * dist / 15 * Math.PI;
      man.x = lerp(x0, tx, p); man.leg = Math.sin(ph) * 27; man.arm = 22 + Math.sin(ph + 1) * 9; pose();
    }).then(function () { man.leg = 0; man.arm = 12; pose(); });
  }
  function addStump(t) {
    if (t.stump) return;
    t.stump = mk('g', {}, gStumps);
    mk('rect', { x: t.x - 5.5, y: t.y - 6, width: 11, height: 8, rx: 2, fill: '#6b4a2f' }, t.stump);
    mk('ellipse', { cx: t.x, cy: t.y - 6, rx: 5.5, ry: 2, fill: '#d9b27c' }, t.stump);
  }
  function fall(t, delay) {
    return wait(delay).then(function () {
      addStump(t);
      return tween(540, function (p) {
        setWrap(t, 88 * easeIn(p), 1);
        if (p > .65) t.wrap.style.opacity = String(1 - (p - .65) / .35);
      });
    }).then(function () { t.wrap.style.visibility = 'hidden'; t.gone = true; });
  }
  function vanish(t) { addStump(t); t.wrap.style.visibility = 'hidden'; t.gone = true; }
  function regrow(t, delay) {
    return wait(delay).then(function () {
      t.wrap.style.visibility = ''; t.wrap.style.opacity = '1'; setWrap(t, 0, 0.001);
      return tween(700, function (p) {
        setWrap(t, 0, Math.max(.001, easeBack(p)));
        if (p > .15 && t.stump) { t.stump.remove(); t.stump = null; }
      });
    }).then(function () { t.wrap.removeAttribute('transform'); t.gone = false; });
  }

  function resetScene() {
    trees.forEach(function (t) { t.wrap.style.visibility = ''; t.wrap.style.opacity = '1'; t.wrap.removeAttribute('transform'); t.gone = false; if (t.stump) { t.stump.remove(); t.stump = null; } });
    sprout.setAttribute('opacity', '0');
    setHeat(0); setSun(0, 220, 0);
    man.leg = 0; man.arm = 12; man.rot = 0; man.flush = 0; pose();
    gMan.setAttribute('opacity', '0');
  }

  async function cycle() {
    resetScene();
    var V = viewRange();
    var inView = trees.filter(function (t) { return t.x > V.x0 - 70 && t.x < V.x1 + 70; });
    trees.forEach(function (t) { if (inView.indexOf(t) < 0) vanish(t); });
    // the jungle stands for a moment, then he walks in from the left
    phase = 'jungle'; await wait(CFG.restMs);
    phase = 'cutting';
    man.x = V.x0 - 50; pose(); gMan.setAttribute('opacity', '1');
    var alive = inView.slice(), falls = [];
    var pending = trees.filter(function (t) { return inView.indexOf(t) < 0; });
    while (alive.length) {
      var T = alive[0];
      var sx = Math.min(T.x - 28, V.x1 - 50);
      if (sx > man.x) await walkTo(sx);
      for (var s = 0; s < CFG.swings; s++) {
        await armTo(155, 210);
        await armTo(-35, 95, easeIn);
        for (var c = 0; c < 4; c++) spawn('chip', man.x + 30, GY - 6);
      }
      var group = alive.filter(function (t) { return t.x < T.x + CFG.cluster; });
      group.forEach(function (t, i) { falls.push(fall(t, i * 80)); });
      alive = alive.filter(function (t) { return group.indexOf(t) < 0; });
      await armTo(12, 150);
    }
    await Promise.all(falls);

    // the sun comes up and the whole strip heats up
    phase = 'sun';
    var sunX = V.x0 + (V.x1 - V.x0) * .72;
    var sweatAcc = 0;
    await tween(3600, function (p, dt) {
      setSun(sunX, lerp(215, 26, easeOut(p)), Math.min(1, p * 3));
      setHeat(easeInOut(p));
      man.flush = easeInOut(p);
      man.arm = lerp(12, 160, easeOut(Math.min(1, p * 1.6))) + Math.sin(clock * 9) * 6 * Math.max(0, p - .4);
      pose();
    });
    // he sweats, wiping his forehead
    phase = 'sweat';
    await tween(3400, function (p, dt) {
      man.arm = 160 + Math.sin(clock * 8) * 8;
      man.rot = Math.sin(clock * 2.2) * (2 + p * 5);
      sweatAcc += dt / 1000 * 11;
      while (sweatAcc >= 1) {
        sweatAcc -= 1;
        var r = man.rot * Math.PI / 180;
        spawn('sweat', man.x + 57 * Math.sin(r) + (Math.random() - .5) * 9, GY - 57 * Math.cos(r) + 2);
      }
      pose();
    });
    // he falls over
    phase = 'fall';
    var r0 = man.rot;
    await tween(850, function (p) { man.rot = lerp(r0, 90, easeIn(p)); man.arm = lerp(man.arm, 40, p); pose(); });
    await tween(260, function (p) { man.rot = 90 - Math.sin(p * Math.PI) * 5; pose(); });
    await wait(650);

    // he turns into a tiny plant
    phase = 'plant';
    var px = man.x + 26;
    for (var k = 0; k < 14; k++) spawn('spark', px, GY - 10);
    sprout.setAttribute('transform', 'translate(' + px.toFixed(1) + ' ' + GY + ') scale(0.001)');
    await tween(1900, function (p) {
      gMan.setAttribute('opacity', String(Math.max(0, 1 - p * 1.7)));
      var s2 = Math.max(.001, easeBack(Math.max(0, (p - .25) / .75)));
      sprout.setAttribute('opacity', String(Math.min(1, p * 4)));
      sprout.setAttribute('transform', 'translate(' + px.toFixed(1) + ' ' + GY + ') scale(' + s2.toFixed(3) + ')');
    });
    await wait(500);

    // sun sets, the jungle grows back
    phase = 'regrow';
    var regrows = inView.map(function (t, i) { return regrow(t, 500 + (i / inView.length) * (CFG.regrowMs - 900)); });
    pending.forEach(function (t) { t.wrap.style.visibility = ''; t.wrap.style.opacity = '1'; t.wrap.removeAttribute('transform'); if (t.stump) { t.stump.remove(); t.stump = null; } t.gone = false; });
    await tween(CFG.regrowMs, function (p) {
      var q = easeInOut(p);
      setSun(sunX, lerp(26, 215, q), 1 - Math.max(0, (p - .8) / .2));
      setHeat(1 - q);
    });
    await Promise.all(regrows);
    setHeat(0); setSun(0, 230, 0);
    phase = 'jungle';
    await wait(CFG.restMs);
    await tween(700, function (p) { sprout.setAttribute('opacity', String(1 - p)); });
  }

  window.shadeJungle = { phase: function () { return phase; } };
  (async function main() {
    await wait(1500);
    for (;;) {
      try { await cycle(); } catch (e) { if (window.console) console.warn('jungle:', e); await wait(3000); }
    }
  })();
})();