/* S.H.A.D.E. tree explainer.
   Add ONE line inside <head> of index.html, before app.js:  <script src="shade-bot.js"></script>
   It (1) remembers the last /api/plan + /api/weather calls the site made, (2) draws the tree + chat window,
   (3) sends the question and those settings to /api/explain (the RAG endpoint in server.js). */
(function () {
  'use strict';
  if (window.__shadeBot) return;
  window.__shadeBot = true;

  var scriptEl = document.currentScript;
  var base = scriptEl && scriptEl.src ? scriptEl.src.replace(/[^\/]*$/, '') : '/';

  /* ── 1. watch what the website sends, so the bot explains the SAME plan the user sees ── */
  var seen = { plan: null, weather: {} };
  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (/\/api\/plan(\?|$)/.test(url) && init && typeof init.body === 'string') {
        seen.plan = JSON.parse(init.body);
      } else if (/\/api\/weather/.test(url)) {
        var u = new URL(url, location.href);
        seen.weather = { simulate: u.searchParams.get('simulate') === 'true', alert: u.searchParams.get('alert'), loc: u.searchParams.get('loc') };
      }
    } catch (e) { /* never break the site */ }
    return realFetch(input, init);
  };

  var link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = base + 'shade-bot.css';
  document.head.appendChild(link);

  /* ── helpers ── */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) { return s.replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function inline(s) { return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>'); }
  function md(t) {
    t = t.replace(/\s*\[[a-z][a-z0-9_]*(?:\s*,\s*[a-z][a-z0-9_]*)*\]/g, '');
    var out = [], list = false;
    esc(t).split(/\r?\n/).forEach(function (l) {
      var m = l.match(/^\s*[-*\u2022]\s+(.*)$/);
      if (m) { if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + inline(m[1]) + '</li>'); }
      else { if (list) { out.push('</ul>'); list = false; } if (l.trim()) out.push('<p>' + inline(l) + '</p>'); }
    });
    if (list) out.push('</ul>');
    return out.join('');
  }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  var SUGGESTIONS = [
    'Why this budget split?',
    'Why were these wards chosen?',
    'Why is this better than spreading money evenly?',
    'How sure are you about these picks?'
  ];
  var history = [];
  var busy = false;

  /* ── 2. build the tree + window ── */
  function build() {
    var tree = document.createElement('button');
    tree.className = 'sb-tree';
    tree.type = 'button';
    tree.setAttribute('aria-label', 'Ask the tree why the plan was chosen');
    tree.setAttribute('aria-expanded', 'false');
    tree.setAttribute('aria-controls', 'sb-panel');
    tree.innerHTML =
      '<svg class="sb-svg" viewBox="0 0 120 160" aria-hidden="true">' +
      '<ellipse class="sb-ground" cx="60" cy="152" rx="34" ry="5"/>' +
      '<path class="sb-branch" d="M60 120 C70 112 78 108 86 100"/><path class="sb-branch" d="M59 114 C50 106 42 102 34 94"/>' +
      '<path class="sb-trunk" d="M55 152 C56 130 57 118 56 96 L64 96 C63 118 64 130 65 152 Z"/>' +
      '<circle class="cr c0" cx="60" cy="86" r="26"/>' +
      '<circle class="cr c1" cx="40" cy="70" r="20"/><circle class="cr c1" cx="80" cy="70" r="20"/>' +
      '<circle class="cr c2" cx="60" cy="52" r="24"/>' +
      '<circle class="cr c3" cx="30" cy="92" r="14"/><circle class="cr c3" cx="90" cy="92" r="14"/>' +
      '<circle class="cr c4" cx="60" cy="30" r="14"/></svg>' +
      '<span class="sb-tip">Ask why</span>';
    if (!store('shadeBotSeen')) tree.classList.add('sb-new');

    var panel = document.createElement('section');
    panel.className = 'win sb-panel';
    panel.id = 'sb-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'S.H.A.D.E. explainer chat');
    panel.innerHTML =
      '<div class="titlebar"><span class="win-title">Ask the tree: why this plan?</span>' +
      '<div class="win-btns"><button type="button" class="sb-help" title="Tutorial" aria-label="Tutorial">?</button>' +
      '<button type="button" class="sb-clear" title="New chat" aria-label="New chat">\u21BA</button>' +
      '<button type="button" class="sb-close" title="Close" aria-label="Close">\u2715</button></div></div>' +
      '<div class="win-body sb-body"><div class="sb-log" aria-live="polite"></div>' +
      '<div class="sb-chips"></div>' +
      '<form class="sb-form"><input type="text" maxlength="500" placeholder="Ask about the split, a ward, the model\u2026" aria-label="Your question" autocomplete="off">' +
      '<button type="submit" class="btn-primary">Send</button></form></div>';

    document.body.appendChild(panel);
    document.body.appendChild(tree);

    var log = $('.sb-log', panel), chips = $('.sb-chips', panel), form = $('.sb-form', panel), input = $('input', form);

    function addMsg(cls, html, sources) {
      var d = document.createElement('div');
      d.className = 'sb-msg ' + cls;
      d.innerHTML = html;
      if (sources && sources.length) {
        var s = document.createElement('div');
        s.className = 'sb-src';
        s.textContent = 'Based on: ' + sources.map(function (x) { return x.title; }).join(' \u00B7 ');
        d.appendChild(s);
      }
      log.appendChild(d);
      log.scrollTop = log.scrollHeight;
      return d;
    }
    function greet() {
      log.innerHTML = ''; history = [];
      addMsg('bot', '<p>Ask <strong>why</strong> the plan came out this way: the budget split, the wards picked, or how it compares with simpler options.</p>');
    }
    function renderChips() {
      chips.innerHTML = '';
      SUGGESTIONS.forEach(function (t) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'btn-layer'; b.textContent = t;
        b.addEventListener('click', function () { ask(t); });
        chips.appendChild(b);
      });
    }

    function ask(text) {
      text = (text || '').trim();
      if (!text || busy) return;
      busy = true; input.value = '';
      addMsg('me', '<p>' + esc(text) + '</p>');
      var wait = addMsg('bot', '<span class="sb-dots"><span></span><span></span><span></span></span>');
      realFetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: history.slice(-8), plan_params: seen.plan || {}, weather_query: seen.weather })
      }).then(function (r) {
        return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; });
      }).then(function (j) {
        wait.remove();
        addMsg('bot', md(j.reply));
        history.push({ role: 'user', text: text }, { role: 'bot', text: j.reply });
      }).catch(function (e) {
        wait.remove();
        addMsg('bot err', '<p>The explanation is unavailable right now. Please try again.</p>');
      }).then(function () { busy = false; input.focus(); });
    }

    function open(quiet) {
      tree.classList.add('is-big'); tree.classList.remove('sb-new');
      $('.sb-tip', tree).hidden = true;
      tree.setAttribute('aria-expanded', 'true');
      panel.classList.add('open');
      store('shadeBotSeen', '1');
      if (quiet !== true) setTimeout(function () { if (panel.classList.contains('open')) input.focus(); }, 900);
    }
    function close(quiet) {
      panel.classList.remove('open');
      tree.classList.remove('is-big');
      tree.setAttribute('aria-expanded', 'false');
      if (quiet !== true) tree.focus();
    }

    tree.addEventListener('click', function () { panel.classList.contains('open') ? close() : open(); });
    $('.sb-close', panel).addEventListener('click', close);
    $('.sb-clear', panel).addEventListener('click', greet);
    $('.sb-help', panel).addEventListener('click', function () { startTour(open, close); });
    form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('.sb-tour-card') && panel.classList.contains('open')) close();
    });

    greet(); renderChips();
    window.shadeBot = { open: open, close: close, tour: function () { startTour(open, close); } };
  }

  /* ── 3. tutorial for the tree (same look as the main tour) ── */
  function startTour(open, close) {
    if ($('.sb-tour-card')) return;
    var steps = [
      { sel: '.sb-tree', title: 'Meet the tree', open: false,
        html: '<p>This little tree is your <b>plan explainer</b>. Click it and it grows into a big tree and opens a chat window.</p>' },
      { sel: '.sb-panel', title: 'It reads your plan', open: true,
        html: '<p>Every time you ask, the tree looks at what the website decided right now (the <b>heat index and alert</b>, your <b>cooling / relief split</b>, the <b>wards picked</b>, the model card and the comparison with simpler strategies).</p><p>Its answers use only those facts, so the explanation matches the numbers on screen.</p>' },
      { sel: '.sb-chips', title: 'Start with a question', open: true,
        html: '<ol><li><b>Why this split?</b> compares the suggested split from the weather with the one you set.</li><li><b>Why these wards?</b> explains the heat, population and vulnerability behind each pick.</li><li><b>Why is it better?</b> compares the plan with spreading money evenly.</li></ol><p>You can also type things like <b>"Why Ward 45?"</b></p>' },
      { sel: '.sb-form', title: 'Change, run, ask again', open: true,
        html: '<p>Move a slider or toggle the heatwave simulation, press <b>Run</b>, then ask again. The tree re-reads the new plan, so you can see <b>why the choice changed</b>. Use \u21BA for a fresh chat and ? to replay this tutorial.</p>' }
    ];
    var i = 0, spot = document.createElement('div'), card = document.createElement('div');
    spot.className = 'sb-tour-spot'; card.className = 'sb-tour-card';
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Explainer tutorial');
    document.body.appendChild(spot); document.body.appendChild(card);
    var wasOpen = $('.sb-panel').classList.contains('open');

    function end() {
      document.removeEventListener('keydown', onKey, true);
      spot.remove(); card.remove();
      if (!wasOpen) close();
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); end(); } }
    document.addEventListener('keydown', onKey, true);

    function show() {
      var s = steps[i];
      if (s.open && !$('.sb-panel').classList.contains('open')) open();
      // wait for the grow / pop-up animation before measuring
      setTimeout(function () {
        var el = $(s.sel);
        if (!el) return;
        var r = el.getBoundingClientRect(), pad = 6;
        spot.style.cssText = 'left:' + (r.left - pad) + 'px;top:' + (r.top - pad) + 'px;width:' + (r.width + pad * 2) + 'px;height:' + (r.height + pad * 2) + 'px';
        card.className = 'sb-tour-card ' + (r.top + r.height / 2 > innerHeight / 2 ? 'at-top' : 'at-bottom');
      }, s.open && !wasOpen && i === 1 ? 1300 : 350);
      card.innerHTML =
        '<div class="tour-progress"><span style="width:' + Math.round((i + 1) / steps.length * 100) + '%"></span></div>' +
        '<div class="tour-meta">Explainer tutorial \u00B7 step ' + (i + 1) + ' of ' + steps.length + '</div>' +
        '<div class="tour-title">' + s.title + '</div><div class="tour-text">' + s.html + '</div>' +
        '<div class="tour-actions"><button type="button" class="tour-skip">Skip</button><span class="tour-gap"></span>' +
        '<button type="button" class="btn-secondary tour-back"' + (i === 0 ? ' disabled' : '') + '>Back</button>' +
        '<button type="button" class="btn-primary tour-next">' + (i === steps.length - 1 ? 'Done' : 'Next') + '</button></div>';
      $('.tour-skip', card).onclick = end;
      $('.tour-back', card).onclick = function () { if (i > 0) { i--; show(); } };
      $('.tour-next', card).onclick = function () { if (i < steps.length - 1) { i++; show(); } else end(); };
      $('.tour-next', card).focus();
    }
    show();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();