/* S.H.A.D.E. human.js  (load it LAST, after desktop.js)
   1. Shows today's suggested split big, in plain words.
   2. Puts a small ? on every card that explains what the card does.
   Does not touch the plan, the map or any data. */
(function () {
  'use strict';

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  /* ───────── 1. the suggested split ───────── */
  var pill = $('#weather-split-pill');
  var slider = $('#rng-split');

  function updateSplit() {
    if (!pill) return;
    var m = (pill.textContent || '').match(/(\d+)\s*%\s*Cooling\s*\/\s*(\d+)\s*%\s*Relief/i);
    if (!m) return;
    var cool = +m[1], rel = +m[2];
    $('#sf-cool').textContent = cool;
    $('#sf-rel').textContent = rel;
    $('#sf-bar-cool').style.width = cool + '%';

    var why;
    if (rel >= 45) why = 'It is dangerously hot, so most of the money goes to help people right now: water points, cool rooms, ORS. Roofs and trees can wait a little.';
    else if (rel >= 25) why = 'It is hotter than a normal day, so we keep a bigger share for this summer\u2019s relief. The rest still goes into roofs and trees that last.';
    else why = 'Today is a normal day, so most of the money goes into things that last: cool roofs and trees. A smaller part is kept for relief. This is only a suggestion, you can change it.';
    $('#sf-why').textContent = why;

    var yours = $('#sf-yours');
    if (slider && yours) {
      var c = Number(slider.value);
      var same = c === cool;
      yours.className = 'sf-yours' + (same ? ' same' : '');
      yours.textContent = same ? '\u2713 Your slider is already set like this.' : 'Your slider is at ' + c + ' / ' + (100 - c) + ' right now.';
    }
  }
  if (pill) new MutationObserver(updateSplit).observe(pill, { childList: true, characterData: true, subtree: true });
  if (slider) slider.addEventListener('input', updateSplit);
  var apply = $('#btn-apply-suggested');
  if (apply) apply.addEventListener('click', function () { setTimeout(updateSplit, 60); setTimeout(updateSplit, 600); });
  setInterval(updateSplit, 1000); // app.js sets the slider from code too, so just look again now and then
  updateSplit();

  /* ───────── 2. the ? helpers (plain words) ───────── */
  var WIN = {
    'win-readme': ['About this project', 'The short story of why this exists. Read it first if you are new here.'],
    'win-controls': ['Budget', 'Here you tell the tool how much money the city has and how you want to use it. Move the sliders, then press the green button at the bottom.'],
    'win-map': ['The map', 'Every shape is a ward of Kolkata. A darker colour means more of whatever you chose to show, like heat or people. Click a ward to read about it.'],
    'ward-drawer': ['Ward inspector', 'Click a ward on the map and its story shows up here: how hot it is, who lives there, and what we would do for it.'],
    'win-plan': ['The plan', 'This is the answer. Which wards get money, for what, and how many people it helps. It changes each time you press the run button.'],
    'win-bench': ['Is our way better?', 'We spend the same money in five simple ways, like \u201Chottest ward first\u201D, and put the results side by side. It shows if our way really does better.'],
    'win-tradeoff': ['What fairness costs', 'If we keep more money safe for the poorest wards, we may lose a little total cooling. This curve shows how much.'],
    'win-model': ['Where the numbers come from', 'What data we used and what we had to assume. Please read this before you trust any number on the page.']
  };
  var CARD = {
    sum0: ['Hottest is not always neediest', 'A short reason why we do not simply cool the hottest places.'],
    sum1: ['Two pots of money', 'Cooling means things built to last (roofs, trees). Relief means help for this summer only (water, cool rooms).'],
    sum2: ['Check our working', 'How we try to be honest about what we do not know.'],
    air: ['Air temperature', 'What a thermometer shows right now in Kolkata.'],
    hum: ['Humidity', 'How much water is in the air. When it is high, sweat does not dry and the body cannot cool down.'],
    hi: ['Heat index', 'How hot it really feels on the body, with temperature and humidity together. This is the number that decides the heat alert.'],
    split: ['Today\u2019s suggested split', 'We look at today\u2019s heat and suggest how to divide the budget between lasting cooling and quick relief. A hotter day means more for quick relief. It is only a suggestion, you can always change it.'],
    k1: ['Heat people are spared', 'How much less heat people will have to live in, added up over everyone in the chosen wards. Higher is better.'],
    k2: ['People newly covered', 'Old people, small children and people in poor housing who now have a water point or cool room within a short walk.'],
    k3: ['Spent on cooling', 'Money for things that stay, like cool roofs and trees. You pay once.'],
    k4: ['Spent on relief', 'Money for this summer only, like water points, cool rooms and ORS. It must be paid again every summer.'],
    budget: ['Total budget', 'All the money the city can use for heat. Everything in the plan is paid from this one amount.'],
    split2: ['Cooling / relief split', 'Slide towards cooling to build things that last. Slide towards relief to help people more quickly this summer.'],
    careful: ['How careful?', 'The tool runs 50 models and they do not all agree. \u201CNormal\u201D uses the average. \u201CCareful\u201D plans for the bad-luck case, so you are less likely to be let down.'],
    floor: ['Kept safe for the most vulnerable', 'A part of the money that only the most vulnerable wards can get, so they are not left out. More fairness, a little less total cooling.']
  };

  var pop = document.createElement('div');
  pop.className = 'qm-pop'; pop.hidden = true; pop.setAttribute('role', 'tooltip'); pop.id = 'qm-pop';
  document.body.appendChild(pop);
  var openBtn = null;

  function closePop() { if (openBtn) openBtn.setAttribute('aria-expanded', 'false'); openBtn = null; pop.hidden = true; }
  function showPop(btn) {
    if (openBtn === btn) { closePop(); return; }
    closePop();
    pop.innerHTML = '<b></b><p></p>';
    pop.firstChild.textContent = btn.getAttribute('data-t');
    pop.lastChild.textContent = btn.getAttribute('data-h');
    pop.hidden = false;
    var r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    var left = Math.max(10, Math.min(innerWidth - w - 10, r.left + r.width / 2 - w / 2));
    var top = r.bottom + 8;
    if (top + h > innerHeight - 10) top = Math.max(10, r.top - h - 8);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-describedby', 'qm-pop');
    openBtn = btn;
  }
  document.addEventListener('click', function (e) { if (openBtn && !pop.contains(e.target)) closePop(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openBtn) { var b = openBtn; closePop(); b.focus(); } });
  window.addEventListener('scroll', closePop, { passive: true });
  window.addEventListener('resize', closePop);

  function mk(entry) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'qm'; b.textContent = '?';
    b.setAttribute('aria-label', 'What is this? ' + entry[0]);
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('data-t', entry[0]); b.setAttribute('data-h', entry[1]);
    b.addEventListener('click', function (e) { e.stopPropagation(); e.preventDefault(); showPop(b); });
    return b;
  }
  function addTo(host, entry, where) {
    if (!host || !entry) return;
    for (var i = 0; i < host.children.length; i++) if (host.children[i].classList.contains('qm')) return;
    var b = mk(entry);
    if (where && where.before) host.insertBefore(b, where.before); else host.appendChild(b);
  }

  function decorate() {
    // every window: ? sits next to the title
    $$('.win').forEach(function (w) {
      var bar = $('.titlebar', w); if (!bar) return;
      var title = ($('.win-title', bar) || {}).textContent || '';
      var entry = WIN[w.id] || (/allocation plan/i.test(title) ? WIN['win-plan'] : null);
      if (entry && !$('.qm', bar)) { var t = $('.win-title', bar); addTo(bar, entry, { before: t ? t.nextSibling : null }); }
    });
    // the three note cards
    $$('.summary-card').forEach(function (c, i) { addTo(c, CARD['sum' + i]); });
    // weather readouts
    $$('.wx-card').forEach(function (c) {
      var l = (($('.wx-label', c) || {}).textContent || '').toLowerCase();
      addTo(c, /humid/.test(l) ? CARD.hum : /heat/.test(l) ? CARD.hi : CARD.air);
    });
    // the big suggestion
    addTo($('#split-feature'), CARD.split);
    // the four result boxes
    ['k1', 'k2', 'k3', 'k4'].forEach(function (k) { addTo($('.kpi-box.' + k), CARD[k]); });
    // a few confusing controls
    [['#rng-budget', 'budget'], ['#rng-split', 'split2'], ['#sel-estimate-mode', 'careful'], ['#rng-floor', 'floor']].forEach(function (p) {
      var input = $(p[0]); var g = input && input.closest('.control-group'); var lab = g && $('label', g);
      if (lab) addTo(lab, CARD[p[1]], { before: $('strong', lab) });
    });
  }

  var queued = false;
  new MutationObserver(function () {
    if (queued) return; queued = true;
    requestAnimationFrame(function () { queued = false; decorate(); });
  }).observe(document.body, { childList: true, subtree: true });
  decorate();
})();