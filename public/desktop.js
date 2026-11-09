// Cosmetic panel chrome only. Nothing here touches positions, the plan or the map's data.
(function () {
  function resizeMap() {
    try { if (typeof map !== 'undefined' && map && map.resize) setTimeout(function () { map.resize(); }, 50); } catch (e) {}
  }

  document.querySelectorAll('.win').forEach(function (win) {
    win.addEventListener('click', function (e) {
      var btn = e.target.closest('.win-btns button');
      if (!btn || !win.contains(btn)) return;
      var act = btn.getAttribute('data-act');
      if (!act) return;
      if (act === 'min') win.classList.toggle('collapsed');
      if (act === 'close') win.style.display = 'none';
      if (act === 'max') { win.classList.toggle('maximized'); document.body.classList.toggle('has-max', !!document.querySelector('.win.maximized')); resizeMap(); }
      resizeMap();
    });
  });

  var tasks = [['win-readme', 'About'], ['win-controls', 'Budget'], ['win-map', 'Map'], ['win-plan', 'Plan'],
               ['win-bench', 'Benchmarks'], ['win-tradeoff', 'Trade-off'], ['win-model', 'Model card']];
  var holder = document.getElementById('task-buttons');
  tasks.forEach(function (t) {
    var el = document.getElementById(t[0]);
    if (!el || !holder) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'task-btn';
    b.textContent = t[1];
    b.addEventListener('click', function () {
      el.style.display = '';
      el.classList.remove('collapsed');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('flash');
      setTimeout(function () { el.classList.remove('flash'); }, 900);
      resizeMap();
    });
    holder.appendChild(b);
  });

  var clock = document.getElementById('clock');
  function tick() { if (clock) clock.textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); }
  tick(); setInterval(tick, 1000);

  // Connection check: warn clearly if the page isn't being served by server.js
  (function () {
    function banner(msg) {
      var d = document.createElement('div');
      d.className = 'conn-banner';
      d.innerHTML = msg;
      document.body.insertBefore(d, document.body.firstChild);
    }
    if (location.protocol === 'file:') {
      banner('<strong>This page was opened as a file.</strong> Start the server with <code>node server.js</code> in the shade-kolkata folder, then open <code>http://localhost:3000</code>.');
      return;
    }
    fetch('/api/health').then(function (r) {
      if (!r.ok) throw new Error('bad status ' + r.status);
      return r.json();
    }).then(function (h) {
      if (!h.wards_loaded) banner('<strong>The server is running but has loaded 0 wards.</strong> Check the database connection in .env and re-run <code>node seed.js</code>.');
    }).catch(function () {
      banner('<strong>Cannot reach the S.H.A.D.E. server at ' + location.origin + '.</strong> Run <code>node server.js</code> and open <code>http://localhost:3000</code> (not Live Server or a file).');
    });
  })();

  // ── Loading screen: wind + SHADE wordmark, paced to about a minute ──
  (function () {
    var LOADER_MIN_SECONDS = 22; // the loading screen stays up at least this long; change the number to taste
    // "Watch intro" button: reloads the page and plays the full intro once
    var introBtn = document.getElementById('btn-intro');
    if (introBtn) introBtn.addEventListener('click', function () {
      try { sessionStorage.setItem('shade_replay_intro', '1'); } catch (e) {}
      location.reload();
    });
    // the red wipe on "Compare to Heatmap" needs a copy of the label (app.js changes the text)
    var cmpBtn = document.getElementById('btn-compare-heatmap');
    if (cmpBtn) {
      var syncLabel = function () { cmpBtn.setAttribute('data-label', cmpBtn.textContent.replace(/\s+/g, ' ').trim()); };
      syncLabel(); new MutationObserver(syncLabel).observe(cmpBtn, { childList: true, characterData: true, subtree: true });
    }
    var loader = document.getElementById('loader');
    if (!loader) return;
    if (location.protocol === 'file:') { loader.remove(); return; }

    // A returning visitor skips the intro ONLY if the server answers fast (it is awake).
    // A sleeping server (cold start) gets the intro again, because that is what it is there for.
    var visited = false;
    try { visited = !!localStorage.getItem('shade_visited_intro'); } catch (e) {}
    var replay = false;
    try { replay = sessionStorage.getItem('shade_replay_intro') === '1'; sessionStorage.removeItem('shade_replay_intro'); } catch (e) {}
    if (!visited || replay) { run(); }
    else {
      loader.style.visibility = 'hidden';
      var decided = false;
      var warm = function () { if (decided) return; decided = true; loader.remove(); };
      var cold = function () { if (decided) return; decided = true; loader.style.visibility = ''; run(); };
      var probe = setTimeout(cold, 1500);
      fetch('/api/health', { cache: 'no-store' })
        .then(function (r) { clearTimeout(probe); if (r.ok) warm(); else cold(); })
        .catch(function () { clearTimeout(probe); cold(); });
    }

  function run() {
    var started = Date.now();
    var fill = document.getElementById('loader-bar-fill');
    var pctEl = document.getElementById('loader-pct');
    var skip = document.getElementById('loader-skip');
    var steps = { server: false, map: false, weather: false, plan: false };
    var finished = false, shown = 0, isReady = false, stageOn = !!document.getElementById('loader-stage');
    var lsPct = document.getElementById('ls-pct'), lsFill = document.getElementById('ls-fill'), enterBtn = document.getElementById('ls-enter');

    function render() {
      var elapsed = Date.now() - started;
      var target = Math.min(elapsed / (LOADER_MIN_SECONDS * 1000) * 100, steps.plan ? 100 : 99);
      if (shown < target) shown += Math.max(0.05, (target - shown) * 0.15);
      if (shown > 100) shown = 100;
      pctEl.textContent = Math.floor(shown) + '%';
      fill.style.width = shown + '%';
      if (lsPct) { lsPct.textContent = Math.floor(shown) + '%'; lsFill.style.width = shown + '%'; }
      if (!steps.plan && elapsed > (LOADER_MIN_SECONDS + 30) * 1000) skip.hidden = false;
      var ready = steps.plan && elapsed >= LOADER_MIN_SECONDS * 1000 && shown >= 99.5;
      if (ready) isReady = true;
      if (enterBtn) {
        enterBtn.disabled = !isReady;
        var lbl = isReady ? 'Enter S.H.A.D.E.' : 'Getting ready\u2026 ' + Math.floor(shown) + '%';
        if (enterBtn.textContent !== lbl) enterBtn.textContent = lbl;
      }
      if (ready && !stageOn) finish();
    }
    var anim = setInterval(render, 40);

    function finish() {
      if (finished) return;
      finished = true;
      try { localStorage.setItem('shade_visited_intro', '1'); } catch (e) {} // only counts as "seen" once it has finished
      clearInterval(anim);
      shown = 100; pctEl.textContent = '100%'; fill.style.width = '100%';
      setTimeout(function () {
        loader.classList.add('hide');
        setTimeout(function () {
          loader.remove();
          try { if (typeof map !== 'undefined' && map && map.resize) map.resize(); } catch (e) {}
        }, 450);
      }, 250);
    }
    skip.addEventListener('click', finish);

    // ── Intro stage: heat-news clippings are pinned up one by one, a tally runs, then the page dims and S.H.A.D.E. introduces itself ──
    var NEWS = [
      { chip: 'heatstroke deaths, 2022', num: 730, text: 'people officially died of heat or sunstroke in India. The health ministry’s own system logged only 33.',
        note: 'A Delhi ragpicker collapsed in the heat in 2024. His family had no proof it was heat. He was never counted.',
        quote: 'India’s heatwaves worsening, but no one knows how many dying', pub: 'DT Next (PTI)',
        url: 'https://www.dtnext.in/news/national/indias-heatwaves-worsening-but-no-one-knows-how-many-dying-836417',
        img: 'https://media.assettype.com/dt-next%2Fimport%2Fh-upload%2F2025%2F06%2F09%2F866387-man-pouring-water-over-himself.jpg?w=600&auto=format%2Ccompress&fit=max', cap: 'Representative image (PTI)' },
      { chip: 'of heatstroke cases, 2024', num: 0.3, dec: 1, suf: '%', text: 'ended up counted as a death (159 of nearly 48,000 cases). Experts say surveillance catches only a fraction.',
        note: 'Only the people who reach a hospital get counted.',
        quote: 'India recorded over 7,000 suspected heatstroke cases, 14 deaths in March-June period: RTI', pub: 'The Tribune (PTI)',
        url: 'https://www.tribuneindia.com/news/science-technology/india-recorded-over-7000-suspected-heatstroke-cases-14-deaths-in-march-june-period-rti/',
        img: 'https://www.tribuneindia.com/sortd-service/imaginary/v22-01/jpg/large/high?url=dGhldHJpYnVuZS1zb3J0ZC1wcm8tcHJvZC1zb3J0ZC9tZWRpYWRmYmM3OGQwLTZhYWUtMTFmMC1hMWQ5LTI5ODU0ZWM2MDM5Ni5qcGc=', cap: 'Tribune photo' },
      { chip: 'India’s hottest day ever', num: 51, dec: 1, suf: '°C', text: 'Phalodi, Rajasthan, 19 May 2016. It broke a record that had stood since 1956.',
        note: 'It was so hot, one man said his phone stopped working.',
        quote: 'Super Hot! India Records Its Highest Temperature Ever', pub: 'NPR',
        url: 'https://www.npr.org/sections/thetwo-way/2016/05/20/478829946/super-hot-india-records-its-highest-temperature-ever',
        img: null, cap: 'Illustration' },
      { chip: 'working hours lost to heat, 2024', num: 124, suf: '%', text: 'more than in the 1990s: 247 billion hours across India in one year.',
        note: 'Two thirds of it on farms. A fifth on construction sites.',
        quote: 'India Faces Record Heatwave Days in 2024, Labour Losses Hit $194 Bn, Says Study', pub: 'Outlook Business',
        url: 'https://www.outlookbusiness.com/news/india-record-heatwave-days-labour-losses-2024',
        img: 'https://media.assettype.com/outlookbusiness/2025-10-29/30z9dzfi/HotClimate.jpg?w=600&auto=format%2Ccompress&fit=max', cap: 'Photo by Unsplash' }
    ];
    (function () {
      var stage = document.getElementById('loader-stage');
      if (!stage) return;
      var wrap = document.getElementById('ls-cards'), timers = [], cards = [];
      var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var TILT = [-1.6, 1.3, -0.8, 1.8], DROP = [0, 12, 3, 14], TAPE = [-4, 3, -2, 5];
      var SCRIB = ['M3 7 C30 2 70 10 110 5 S170 3 197 8', 'M4 5 C40 9 80 2 120 7 S180 9 196 4', 'M2 8 C50 3 90 9 135 4 S185 8 198 5', 'M3 6 C45 10 85 3 125 8 S175 3 197 7'];
      function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
      function fmt(n, dec) { return n.toLocaleString('en-IN', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }); }
      function art(i) {
        var bars = '', x = 0, h = [34, 52, 28, 60, 40, 24, 48, 36, 56, 30, 44, 26];
        for (var k = 0; k < 12; k++) { bars += '<rect x="' + x + '" y="' + (130 - h[k]) + '" width="26" height="' + h[k] + '"/>'; x += 26; }
        return '<svg viewBox="0 0 300 130" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="lsg' + i + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9a23b"/><stop offset="1" stop-color="#c2410c"/></linearGradient></defs>' +
          '<rect width="300" height="130" fill="url(#lsg' + i + ')"/><circle cx="222" cy="44" r="28" fill="#fff0c2" opacity=".92"/><circle cx="222" cy="44" r="40" fill="#fff0c2" opacity=".25"/>' +
          '<g fill="#5a1d08" opacity=".4">' + bars + '</g></svg>';
      }
      NEWS.forEach(function (n, i) {
        var d = document.createElement('div');
        d.className = 'ls-card';
        d.style.setProperty('--r', TILT[i % 4] + 'deg'); d.style.setProperty('--t', TAPE[i % 4] + 'deg'); d.style.marginTop = DROP[i % 4] + 'px';
        d.innerHTML =
          '<div class="ls-img">' + (n.img ? '<img alt="" referrerpolicy="no-referrer" src="' + esc(n.img) + '">' : art(i)) + '<span class="ls-cap">' + esc(n.cap) + '</span></div>' +
          '<div class="ls-chip">' + esc(n.chip) + '</div>' +
          '<div class="ls-numrow"><div class="ls-stat"><span class="ls-num"></span></div><svg class="ls-scrib" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true"><path d="' + SCRIB[i % 4] + '" fill="none" stroke="#b3261e" stroke-width="3" stroke-linecap="round" opacity=".85"/></svg></div>' +
          '<p class="ls-text">' + esc(n.text) + '</p>' +
          '<p class="ls-note">' + esc(n.note) + '</p>' +
          '<div class="ls-clip"><q>“' + esc(n.quote) + '”</q><div class="ls-src"><a href="' + esc(n.url) + '" target="_blank" rel="noopener noreferrer">' + esc(n.pub) + '</a> · <a href="' + esc(n.url) + '" target="_blank" rel="noopener noreferrer">read it ↗</a></div></div>';
        var im = d.querySelector('img');
        if (im) im.addEventListener('error', function () { var box = im.parentNode; box.removeChild(im); box.insertAdjacentHTML('afterbegin', art(i)); });
        wrap.appendChild(d); cards.push(d);
      });
      function count(el, n) {
        var f = function (v) { return (n.pre || '') + fmt(v, n.dec) + (n.suf || ''); };
        if (still) { el.textContent = f(n.num); return; }
        var t0 = Date.now();
        (function tick() {
          var p = Math.min((Date.now() - t0) / 1200, 1), e = 1 - Math.pow(1 - p, 3);
          el.textContent = f(n.num * e);
          if (p < 1 && !finished) requestAnimationFrame(tick);
        })();
      }
      function reveal(i) { if (finished || !stageOn) return; cards[i].classList.add('show'); count(cards[i].querySelector('.ls-num'), NEWS[i]); }

      // Tally: official NCRB heat/sunstroke deaths, 2015-22 (8,171) + 2023 (about 806). Each little figure is about 50 people.
      var TOTAL = 8977, PER = 50, numEl = document.getElementById('lc-num'), field = document.getElementById('lc-field'), c0 = Date.now(), lit = 0, figs = [];
      var FIG = '<svg class="lc-p" viewBox="0 0 10 18" fill="currentColor" stroke="currentColor"><circle cx="5" cy="3.2" r="2.6" stroke="none"/><path d="M5 6.8V12M1.5 9H8.5M5 12L2.6 17M5 12L7.4 17" fill="none" stroke-width="1.4" stroke-linecap="round"/></svg>';
      for (var k = 0; k < Math.ceil(TOTAL / PER); k++) {
        field.insertAdjacentHTML('beforeend', FIG);
        var fg = field.lastChild, j = Math.sin(k * 12.9898) * 43758.5453; j -= Math.floor(j);
        fg.style.transform = 'rotate(' + ((j - .5) * 12) + 'deg) translateY(' + ((j - .5) * 2.4) + 'px)';
        figs.push(fg);
      }
      (function run() {
        var p = Math.min((Date.now() - c0 - 800) / 17000, 1);
        if (p < 0) p = 0;
        var v = Math.round(TOTAL * (still ? 1 : 1 - Math.pow(1 - p, 1.6)));
        numEl.textContent = fmt(v);
        var want = Math.min(figs.length, Math.floor(v / PER));
        while (lit < want) figs[lit++].classList.add('on');
        if (p < 1 && !finished && stageOn) requestAnimationFrame(run);
        else { numEl.textContent = fmt(TOTAL); while (lit < figs.length) figs[lit++].classList.add('on'); }
      })();

      [500, 5000, 9500, 14000].forEach(function (t, i) { timers.push(setTimeout(function () { reveal(i); }, t)); });
      timers.push(setTimeout(function () { if (!finished && stageOn) stage.classList.add('dim'); }, 18500));
      document.getElementById('ls-skip').addEventListener('click', function () {
        stageOn = false; timers.forEach(clearTimeout);
        loader.classList.remove('stage-on'); // back to the plain loading screen
      });
      enterBtn.addEventListener('click', function () { if (isReady) finish(); });
    })();

    function pingServer() {
      fetch('/api/health').then(function (r) { if (!r.ok) throw 0; steps.server = true; }).catch(function () { setTimeout(pingServer, 2000); });
    }
    pingServer();

    var poll = setInterval(function () {
      if (finished) { clearInterval(poll); return; }
      try {
        if (typeof wardsGeoJSON !== 'undefined' && wardsGeoJSON) steps.map = true;
        var ws = document.getElementById('weather-status');
        if (ws && ws.textContent.indexOf('Loading') === -1) steps.weather = true;
        if (typeof currentPlan !== 'undefined' && currentPlan) steps.plan = true;
      } catch (e) {}
    }, 250);
  } // end run()
  })();
})();

// ── Sliders: filled track + live values on the weight sliders ──
(function () {
  document.querySelectorAll('.weight-sliders label').forEach(function (l) {
    var input = l.querySelector('input');
    if (!input) return;
    var v = document.createElement('b');
    v.className = 'wval';
    l.insertBefore(v, input);
  });
  function sync() {
    document.querySelectorAll('input[type="range"]').forEach(function (r) {
      var min = parseFloat(r.min) || 0, max = parseFloat(r.max) || 100, val = parseFloat(r.value);
      r.style.setProperty('--pct', ((val - min) / (max - min) * 100) + '%');
      var out = r.parentNode.querySelector('.wval');
      if (out) out.textContent = '×' + val.toFixed(1);
    });
  }
  document.addEventListener('input', sync);
  sync();
  setInterval(sync, 250);
})();

// ── Tutorial: guided tour of every control and result ──
(function () {
  var KEY = 'shade_tour_v1';
  var STEPS = [
    { title: 'Welcome to SHADE',
      text: '<p>A heat map shows where it is hottest. SHADE shows where a <b>limited budget</b> helps the most <b>vulnerable people</b> the most.</p><p>This tour walks through every control and result in the order you would use them. Use the Next and Back buttons or the arrow keys, and reopen it any time from the <b>Tutorial</b> button at the top.</p>' },
    { sel: '.weather-wrap', title: 'Check today\'s conditions',
      text: 'Live weather for Kolkata (from Open-Meteo) with the heat index. The <b>Suggested Split</b> is a starting point for dividing the budget under these conditions. Tick <b>Simulate Severe Heatwave</b> to see how the suggestion changes at a 43.8°C heat index, and press <b>Apply Suggested Split</b> to copy it into the split slider.' },
    { sel: '#rng-budget', closest: '.control-group', title: 'Set the total budget',
      text: 'Drag to choose the total heat budget, from ₹2 to ₹35 crore. Everything the optimizer recommends is paid for from this single amount.' },
    { sel: '#rng-split', closest: '.control-group', title: 'Split it between two pools',
      text: 'The money goes into two pools. <b>Cooling</b> is one-time capital spending (cool roofs, urban trees) that lowers heat for years. <b>Relief</b> is seasonal spending (water points, cool rooms, mobile units, school ORS) that protects people each summer. Slide towards cooling for lasting change, towards relief for immediate protection.' },
    { sel: '#sel-estimate-mode', closest: '.control-group', title: 'Choose how cautious to be',
      text: 'Cooling gains are estimated by an ensemble of 50 models. <b>Expected Gain</b> plans on the average result. <b>Conservative Mode</b> plans on the 10th percentile, a cautious figure that about nine in ten models meet or beat, so the picks are less likely to disappoint.' },
    { sel: '#rng-floor', closest: '.control-group', title: 'Reserve money for the most vulnerable',
      text: 'The equity floor sets aside a minimum share of the budget (0 to 50%) for the most vulnerable wards. At 0% there is no guarantee. Raise it to make sure help reaches those wards. The Equity trade-off chart further down shows what that guarantee costs.' },
    { sel: '.checkbox-grid', run: function () { var f = document.getElementById('adv-options'); if (f) f.open = true; }, title: 'Choose what can be built',
      text: 'Untick any intervention you do not want considered. Cooling: cool roofs and urban trees. Relief: water points, cool rooms, mobile relief units and school ORS supply. The distance beside water points (300 m) and cool rooms (1 km) is the walking range used to count who is covered.' },
    { sel: '.weight-sliders', run: function () { var f = document.getElementById('adv-options'); if (f) f.open = true; }, title: 'Decide what "vulnerable" means',
      text: 'Ward vulnerability is ranked from five factors: share of elderly people (60+), children under 6, slum share, building density and poor roofs (tin or asbestos). Each slider runs from 0 (ignore) to 2 (double weight), and the ward ranking updates as you move them.' },
    { sel: '#btn-run-plan', title: 'Run the optimizer',
      text: 'When your settings are ready, press this to build the allocation plan. Change a setting and run again to compare plans.' },
    { sel: '#win-map', title: 'Read the map',
      text: 'Every Kolkata ward, coloured by the layer you choose. After you press <b>Run</b>, the wards chosen for structural cooling are <b>highlighted with a bright green outline and a number label</b> while the other wards fade back. Wards that get seasonal relief have a <b>dashed blue outline</b>, and a <b>blue dot</b> marks a hospital heat-alert flag.' },
    { sel: '#win-map', title: 'Click a highlighted ward', run: function () { return window.shadeDemoWard && window.shadeDemoWard(); },
      text: 'Click any highlighted ward on the map, or any card in the Allocation plan, to select it. It gets a thick dark outline, the map zooms to it and the Ward inspector fills in. We just selected the top pick for you.' },
    { sel: '.map-toolbar', title: 'Switch the map layer',
      text: 'Choose between surface temperature, vulnerability index and population. <b>Hot-night proxy</b> is for display only and is not used when picking wards. Comparing temperature with vulnerability shows why the hottest ward is not always the one most in need.' },
    { sel: '#ward-drawer', title: 'Ward inspector: name and numbers',
      text: 'Shows the <b>ward name and number</b>, whether it is a cooling pick or a relief site, and its parameters (surface temperature, vulnerability, population, vegetation, building density, poor roofs, distance to water). Each bar shows how the ward ranks against all other wards.' },
    { sel: '#ward-drawer .wi-why', title: 'Why it got this allocation',
      text: 'The reasoning in plain words: its rank among the picks, what makes it hot, vulnerable or populous, why this measure beat the alternatives, the cost share and the confidence. For a ward that was <b>not</b> chosen, it shows how it compares with the chosen ones.' },
    { sel: '#ward-drawer .wi-measures', title: 'Recommended measures',
      text: 'Every cooling and relief option for the ward with its expected cooling, uncertainty range, cost and walking-coverage gap. The option the optimizer picked is tagged <b>Selected</b>.' },
    { sel: '.kpi-grid', title: 'The headline numbers',
      text: '<b>Person-degrees averted</b> is the modelled cooling from structural measures, counted across the people who benefit. <b>Vulnerable people newly covered</b> is how many can now reach seasonal relief on foot. <b>Cooling pool spent</b> is a one-time cost, while <b>Relief pool spent</b> recurs every summer.' },
    { sel: '#list-cooling', title: 'Structural cooling picks',
      text: 'The wards and measures chosen for cooling. The stability badge shows how consistently a pick holds up across the 50-model ensemble. Higher stability means a more dependable choice.' },
    { sel: '#list-relief', title: 'Seasonal relief picks',
      text: 'Relief sites such as water points and cool rooms, placed using OpenStreetMap walking routes so coverage counts people who can actually reach them on foot.' },
    { sel: '#equity-audit-box', title: 'Who benefits?',
      text: 'The equity audit summarises how the plan\'s benefits are distributed, so you can check that the most vulnerable wards are getting their share.' },
    { sel: '#list-hospitals', title: 'Hospital heat flags',
      text: 'Hospitals that should be flagged for heat readiness. Acting on these costs nothing, and they appear on the map as blue dots.' },
    { sel: '#win-bench', title: 'Benchmarks',
      text: 'The same cooling budget spent under five targeting rules, so you can see how SHADE compares with simple approaches. For example, hottest-first underperforms when the hottest wards have fewer vulnerable residents.' },
    { sel: '#win-tradeoff', title: 'Impact of reserving money', text: 'Plots the total cooling lost when you force the system to reserve a larger share of the budget for the most vulnerable wards. Use it to choose an equity floor with the cost in view.' },
    { sel: '#win-model', title: 'Check the model',
      text: 'The model card and street-network coverage audit show how the predictions were built and where walking coverage still has gaps. Use them to judge how far to trust the plan.' },
    { sel: '.sb-tree', fixed: true, bot: false, title: 'Ask the tree why',
      text: 'This small tree is the <b>plan explainer</b>. Click it and it grows into a big tree and opens a chat window.' },
    { sel: '.sb-panel', fixed: true, bot: true, title: 'It explains the plan\'s choices',
      text: 'The tree reads what the site decided right now: the <b>heat index and alert</b>, the <b>cooling / relief split</b> you set against the suggested one, the <b>wards picked</b>, the benchmarks and the model card. It then explains <b>why</b> each choice was made and <b>why it beats</b> simpler strategies, using only those numbers.' },
    { sel: '.sb-chips', fixed: true, bot: true, title: 'Questions to try',
      text: '<ol><li><b>Why this budget split?</b></li><li><b>Why were these wards chosen?</b></li><li><b>Why is this better than spreading money evenly?</b></li></ol><p>Or type your own, such as <b>"Why Ward 45?"</b>. Change a slider, press <b>Run</b>, and ask again to see why the plan changed.</p>' },
    { sel: '.topbar', title: 'Save and switch language',
      text: '<b>Save Scenario</b> stores your current settings and plan in the Neon database. The language button switches the interface between বাংলা and English.' },
    { title: 'You are ready',
      text: '<ol><li>Check the weather suggestion, then set the budget and split.</li><li>Pick expected or conservative mode, and an equity floor.</li><li>Choose the interventions and vulnerability weights, then run the optimizer.</li><li>Explore the map and ward inspector, and read the plan.</li><li>Check the benchmarks, trade-off and model card, then save the scenario.</li><li>Click the tree to ask why the plan was chosen.</li></ol><p>Reopen this tour any time with the Tutorial button.</p>' }
  ];

  var dim, spot, card, bar, meta, titleEl, textEl, btnBack, btnNext, btnSkip;
  var idx = 0, active = false, raf = 0, current = null;

  // The tree explainer (shade-bot.js) is opened / closed by the tour steps that point at it
  var botByTour = false;
  function botSet(wantOpen) {
    var b = window.shadeBot;
    if (!b) return;
    var isOpen = !!document.querySelector('.sb-panel.open');
    if (wantOpen && !isOpen) { botByTour = true; b.open(true); }
    else if (!wantOpen && isOpen && botByTour) { b.close(true); botByTour = false; }
  }

  function make(tag, cls) { var e = document.createElement(tag); e.className = cls; return e; }

  function build() {
    if (card) return;
    dim = make('div', 'tour-dim');
    spot = make('div', 'tour-spot');
    card = make('div', 'tour-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-labelledby', 'tour-title');
    card.innerHTML = '<div class="tour-progress"><span></span></div><div class="tour-meta"></div><h3 class="tour-title" id="tour-title"></h3><div class="tour-text"></div><div class="tour-actions"><button type="button" class="tour-skip">Skip tour</button><span class="tour-gap"></span><button type="button" class="btn-secondary tour-back">Back</button><button type="button" class="btn-primary tour-next">Next</button></div>';
    document.body.appendChild(dim); document.body.appendChild(spot); document.body.appendChild(card);
    bar = card.querySelector('.tour-progress span');
    meta = card.querySelector('.tour-meta');
    titleEl = card.querySelector('.tour-title');
    textEl = card.querySelector('.tour-text');
    btnBack = card.querySelector('.tour-back');
    btnNext = card.querySelector('.tour-next');
    btnSkip = card.querySelector('.tour-skip');
    btnBack.addEventListener('click', function () { show(idx - 1); });
    btnNext.addEventListener('click', function () { idx === STEPS.length - 1 ? close() : show(idx + 1); });
    btnSkip.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (!active) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') { if (idx < STEPS.length - 1) show(idx + 1); }
      else if (e.key === 'ArrowLeft') { if (idx > 0) show(idx - 1); }
    });
  }

  function resolve(step) {
    var el = document.querySelector(step.sel);
    if (!el) return null;
    if (step.closest) el = el.closest(step.closest) || el;
    var w = el.closest('.win');
    if (w) { w.classList.remove('collapsed'); w.style.display = ''; }
    if (el.getBoundingClientRect().height < 20 && w) el = w;
    return el;
  }

  function reveal(el) {
    var r = el.getBoundingClientRect(), vh = window.innerHeight;
    var absTop = r.top + window.scrollY;
    var y = r.height > vh * 0.55 ? absTop - 16 : absTop + r.height / 2 - vh * 0.36;
    window.scrollTo(0, Math.max(0, y));
  }

  function show(i) {
    idx = Math.max(0, Math.min(STEPS.length - 1, i));
    var s = STEPS[idx];
    if (s.bot !== undefined) botSet(s.bot); else if (botByTour) botSet(false);
    card.style.display = '';
    meta.textContent = 'Step ' + (idx + 1) + ' of ' + STEPS.length;
    bar.style.width = ((idx + 1) / STEPS.length * 100) + '%';
    titleEl.textContent = s.title;
    textEl.innerHTML = s.text;
    textEl.scrollTop = 0;
    btnBack.disabled = idx === 0;
    btnNext.textContent = idx === STEPS.length - 1 ? 'Finish' : (idx === 0 ? 'Start tour' : 'Next');
    btnSkip.style.visibility = idx === STEPS.length - 1 ? 'hidden' : 'visible';
    function place() {
      current = s.sel ? resolve(s) : null;
      if (current && !s.fixed) reveal(current);
      dim.style.display = current ? 'none' : 'block';
      spot.style.display = current ? 'block' : 'none';
      card.classList.remove('at-top', 'at-bottom', 'at-center');
      card.classList.add(current ? 'at-bottom' : 'at-center');
    }
    place();
    if (s.run) { var at = idx; Promise.resolve(s.run()).then(function () { if (active && idx === at) place(); }).catch(function () {}); }
    btnNext.focus({ preventScroll: true });
  }

  function loop() {
    if (!active) return;
    if (current && document.body.contains(current)) {
      var r = current.getBoundingClientRect(), pad = 6, vh = window.innerHeight;
      spot.style.top = (r.top - pad) + 'px';
      spot.style.left = (r.left - pad) + 'px';
      spot.style.width = (r.width + pad * 2) + 'px';
      spot.style.height = (r.height + pad * 2) + 'px';
      var low = STEPS[idx].fixed || (r.height < vh * 0.55 && (r.top + r.height / 2) > vh * 0.55);
      card.classList.toggle('at-top', low);
      card.classList.toggle('at-bottom', !low);
    }
    raf = requestAnimationFrame(loop);
  }

  function remember() { try { localStorage.setItem(KEY, '1'); localStorage.setItem('shade_tour_clicked_v2', '1'); } catch (e) {} var tb = document.getElementById('btn-tour'); if (tb) tb.classList.remove('is-new'); }

  function open() {
    build();
    active = true;
    remember();
    show(0);
    cancelAnimationFrame(raf);
    loop();
  }

  function close() {
    active = false;
    cancelAnimationFrame(raf);
    if (botByTour) botSet(false);
    if (card) { card.style.display = 'none'; dim.style.display = 'none'; spot.style.display = 'none'; }
    var b = document.getElementById('btn-tour');
    if (b) b.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  var tourBtn = document.getElementById('btn-tour');
  if (tourBtn) { tourBtn.addEventListener('click', open); try { if (!localStorage.getItem('shade_tour_clicked_v2')) tourBtn.classList.add('is-new'); } catch (e) {} }

  try {
    if (!localStorage.getItem(KEY)) {
      var wait = setInterval(function () {
        if (!document.getElementById('loader')) { clearInterval(wait); setTimeout(open, 600); }
      }, 400);
    }
  } catch (e) {}
})();

// ── Forest: every tree is drawn at random, with lopsided canopies and uneven trunks ──
(function () {
  var param = null;
  try { param = new URLSearchParams(location.search).get('forest'); } catch (e) {}
  var SEED = param !== null ? (parseInt(param, 10) || 1) : Math.floor(Math.random() * 1e9);

  function prng(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var BROWN = '#5a4a3a';
  function f(n) { return Math.round(n * 10) / 10; }
  function rr(R, a, b) { return a + (b - a) * R(); }
  function pick(R, list) {
    var tot = 0, i; for (i = 0; i < list.length; i++) tot += list[i][1];
    var x = R() * tot;
    for (i = 0; i < list.length; i++) { x -= list[i][1]; if (x <= 0) return list[i][0]; }
    return list[0][0];
  }
  function oneOf(R, arr) { return arr[Math.floor(R() * arr.length)]; }

  function build(type, R, color) {
    var parts = [], top = 0;
    function r(a, b) { return rr(R, a, b); }
    function raw(s) { parts.push(s); }
    function blob(cx, cy, rad) {
      parts.push('<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(rad) + '" fill="' + color + '"/>');
      if (cy - rad < top) top = cy - rad;
    }
    function tone(cx, cy, rad, fill, op) {
      parts.push('<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(rad) + '" fill="' + fill + '" opacity="' + op + '"/>');
    }
    var i;

    if (type === 'round') {
      var th = r(26, 40), lean = r(-12, 12), R0 = r(22, 32), ys = r(.78, 1), n = Math.round(r(6, 9));
      var cx0 = lean + r(-.3, .3) * R0, cy0 = -(th + R0 * ys * .7);
      raw('<path d="M-3.2 0 C-3 ' + f(-th * .4) + ' ' + f(lean * .3 - 2) + ' ' + f(-th * .8) + ' ' + f(lean - 2) + ' ' + f(-th - 8) + ' L' + f(lean + 2) + ' ' + f(-th - 8) + ' C' + f(lean * .3 + 2) + ' ' + f(-th * .8) + ' 3 ' + f(-th * .4) + ' 3.2 0Z" fill="' + BROWN + '"/>');
      var side = R() < .5 ? -1 : 1;
      raw('<path d="M' + f(lean * .5) + ' ' + f(-th * .62) + ' L' + f(lean * .5 + side * r(9, 16)) + ' ' + f(-th - r(6, 16)) + '" stroke="' + BROWN + '" stroke-width="2.2" stroke-linecap="round" fill="none"/>');
      blob(cx0, cy0, R0 * r(.55, .7));
      for (i = 0; i < n; i++) {
        var a = r(0, Math.PI * 2), d = r(.25, .8) * R0;
        blob(cx0 + Math.cos(a) * d * 1.1, cy0 + Math.sin(a) * d * ys, R0 * r(.32, .55));
      }
      tone(cx0 - R0 * r(.2, .4), cy0 - R0 * r(.25, .45) * ys, R0 * r(.25, .38), '#fff', .14);
      tone(cx0 + R0 * r(.25, .45), cy0 + R0 * r(.1, .3) * ys, R0 * r(.25, .35), '#000', .08);
    } else if (type === 'cone') {
      var tx = r(-5, 5), yb = r(14, 24), wl = r(9, 16), wr = r(9, 16);
      raw('<rect x="-2" y="' + f(-yb) + '" width="4" height="' + f(yb) + '" fill="' + BROWN + '"/>');
      raw('<path d="M' + f(tx) + ' -100 C' + f(tx - wl * .5) + ' -82 ' + f(-wl * 1.05) + ' -55 ' + f(-wl) + ' ' + f(-yb - 2) +
          ' Q' + f(r(-3, 3)) + ' ' + f(-yb + r(2, 6)) + ' ' + f(wr) + ' ' + f(-yb - 2) +
          ' C' + f(wr * 1.05) + ' -55 ' + f(tx + wr * .5) + ' -82 ' + f(tx) + ' -100Z" fill="' + color + '"/>');
      raw('<path d="M' + f(tx) + ' -100 C' + f(tx - wl * .5) + ' -82 ' + f(-wl * 1.05) + ' -55 ' + f(-wl) + ' ' + f(-yb - 2) + ' L' + f(tx * .5) + ' ' + f(-yb - 2) + 'Z" fill="#fff" opacity=".12"/>');
      top = -100;
    } else if (type === 'banyan') {
      var W = r(55, 80), thb = r(34, 44), lb = r(-8, 8);
      raw('<path d="M' + f(lb - 7) + ' 0 L' + f(lb - 4) + ' ' + f(-thb - 6) + ' L' + f(lb + 5) + ' ' + f(-thb - 6) + ' L' + f(lb + 8) + ' 0Z" fill="' + BROWN + '"/>');
      var nr = Math.round(r(2, 4));
      for (i = 0; i < nr; i++) {
        var rx = r(-W * .8, W * .8), y0 = -thb - r(2, 8), yend = R() < .25 ? -thb * r(.3, .6) : 0;
        raw('<path d="M' + f(rx * .6) + ' ' + f(y0) + ' Q' + f(rx + r(-5, 5)) + ' ' + f((y0 + yend) / 2) + ' ' + f(rx) + ' ' + f(yend) + '" stroke="' + BROWN + '" stroke-width="1.8" stroke-linecap="round" fill="none"/>');
      }
      var cyb = -(thb + r(14, 22)), nb = Math.round(r(8, 12)), sd = r(-.3, .3) * W;
      for (i = 0; i < nb; i++) {
        var t = (i + R() * .8) / nb;
        blob(sd + (t * 2 - 1) * W * r(.85, 1), cyb + r(-.35, .3) * W * .45, W * r(.2, .36));
      }
      blob(sd * .5, cyb - r(0, .1) * W, W * r(.35, .45));
      tone(sd - W * r(.15, .4), cyb - W * r(.2, .3), W * r(.2, .3), '#fff', .13);
      tone(sd + W * r(.2, .45), cyb + W * r(.05, .2), W * r(.2, .3), '#000', .08);
    } else if (type === 'palm') {
      var bnd = r(-18, 18), hg = r(80, 92);
      raw('<path d="M-2.5 0 Q' + f(bnd * 1.3) + ' ' + f(-hg * .5) + ' ' + f(bnd) + ' ' + f(-hg) + '" stroke="' + BROWN + '" stroke-width="4" fill="none" stroke-linecap="round"/>');
      var nf = Math.round(r(5, 8));
      for (i = 0; i < nf; i++) {
        var ang = -Math.PI * (0.04 + 0.92 * (i + R() * .6) / nf);
        var L = r(20, 34), dr = Math.abs(Math.cos(ang)) * r(6, 14);
        var ex = bnd + Math.cos(ang) * L, ey = -hg + Math.sin(ang) * L + dr;
        var mx = (bnd + ex) / 2, my = (-hg + ey) / 2 - r(4, 9);
        var nx = -(ey + hg), ny = ex - bnd, nl = Math.sqrt(nx * nx + ny * ny) || 1, w = r(4, 6.5);
        nx = nx / nl * w; ny = ny / nl * w;
        raw('<path d="M' + f(bnd) + ' ' + f(-hg) + ' Q' + f(mx + nx) + ' ' + f(my + ny) + ' ' + f(ex) + ' ' + f(ey) +
            ' Q' + f(mx - nx) + ' ' + f(my - ny) + ' ' + f(bnd) + ' ' + f(-hg) + 'Z" fill="' + color + '"/>');
        top = Math.min(top, ey - 3, my - 6);
      }
    } else {
      var m = Math.round(r(3, 5)), sp = r(9, 16);
      for (i = 0; i < m; i++) blob((i / (m - 1) - .5) * 2 * sp + r(-3, 3), -r(4, 9), r(6, 11));
      tone(-sp * .4, -r(9, 12), r(4, 6), '#fff', .14);
    }
    return { html: parts.join(''), top: top };
  }

  function place(type, R, x, base, h, color, flip, opacity) {
    var t = build(type, R, color);
    var s = h / Math.max(10, -t.top);
    return '<g' + (opacity ? ' opacity="' + opacity + '"' : '') + ' transform="translate(' + f(x) + ' ' + f(base) + ') scale(' + f(s * (flip ? -1 : 1)) + ' ' + f(s) + ')"><g class="tree-sway">' + t.html + '</g></g>';
  }

  var DEEP = ['#0b5d3b', '#14764d', '#2f7d57'], MID = ['#3f8f66', '#5a9f7a', '#7fb394'], BACK = ['#9cc5ab', '#b4d3bf'];
  var MIX = [['round', .34], ['cone', .2], ['palm', .16], ['banyan', .1], ['shrub', .2]];

  function treeLine(svg) {
    var ground = svg.querySelector('.ground'); if (!ground) return;
    var R = prng(SEED + 11), html = '', x, type, h;
    for (x = -30; x < 1470; x += rr(R, 30, 92) + (R() < .18 ? rr(R, 40, 110) : 0)) {
      type = pick(R, MIX);
      h = type === 'shrub' ? rr(R, 22, 36) : type === 'banyan' ? rr(R, 70, 95) : rr(R, 60, 108);
      html += place(type, R, x, 160 + rr(R, -3, 4), h, oneOf(R, BACK), R() < .5, .55);
    }
    for (x = -40; x < 1470; x += rr(R, 55, 135) + (R() < .22 ? rr(R, 50, 120) : 0)) {
      type = pick(R, MIX);
      h = type === 'shrub' ? rr(R, 26, 44) : type === 'banyan' ? rr(R, 90, 128) : rr(R, 78, 152);
      html += place(type, R, x, 160 + rr(R, -2, 5), h, oneOf(R, DEEP.concat(MID)), R() < .5);
    }
    ground.insertAdjacentHTML('beforebegin', html);
  }

  function hero(svg) {
    var ground = svg.querySelector('.ground'); if (!ground) return;
    var R = prng(SEED + 23), html = '';
    var slots = [rr(R, 14, 40), rr(R, 235, 268), rr(R, 300, 340), rr(R, 190, 215)];
    slots.forEach(function (x) {
      var type = pick(R, [['round', .3], ['cone', .3], ['palm', .25], ['shrub', .15]]);
      var h = type === 'shrub' ? rr(R, 22, 34) : rr(R, 55, 108);
      html += place(type, R, x, 141 + rr(R, -2, 2), h, oneOf(R, MID.concat(DEEP)), R() < .5);
    });
    html += place('banyan', R, rr(R, 95, 165), 141, rr(R, 104, 126), oneOf(R, DEEP), R() < .5);
    ground.insertAdjacentHTML('afterend', html);
  }

  function single(svg, type, seed, h) {
    svg.insertAdjacentHTML('beforeend', place(type, prng(seed), 30, 78, h, 'currentColor', false));
  }

  document.querySelectorAll('svg[data-forest]').forEach(function (svg) {
    var kind = svg.getAttribute('data-forest');
    if (kind === 'line') treeLine(svg);
    else if (kind === 'hero') hero(svg);
    else if (kind === 'logo') single(svg, svg.getAttribute('data-type') || 'round', SEED + (svg.getAttribute('data-type') === 'cone' ? 5 : 3), 68);
    else if (kind === 'loader') single(svg, 'round', SEED + 99, 74);
  });
})();

// ── Trees sway slightly as the page scrolls (a small damped spring per tree) ──
(function () {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var trees = [];
  document.querySelectorAll('.treeline .tree-sway, .hero-trees .tree-sway, .badge-logo .tree-sway').forEach(function (el, i) {
    var seed = Math.sin(i * 12.9898) * 43758.5453; seed = seed - Math.floor(seed);
    trees.push({ el: el, a: 0, v: 0, k: 0.05 + seed * 0.04, gain: 0.6 + seed * 0.8 });
  });
  if (!trees.length) return;

  var lastY = window.scrollY, running = false;
  var MAX = 3.5;

  function frame() {
    var energy = 0;
    trees.forEach(function (t) {
      t.v += -t.k * t.a - 0.07 * t.v;
      t.a += t.v;
      if (t.a > MAX) t.a = MAX; else if (t.a < -MAX) t.a = -MAX;
      energy += Math.abs(t.a) + Math.abs(t.v);
      t.el.setAttribute('transform', 'rotate(' + t.a.toFixed(3) + ')');
    });
    if (energy > 0.02) requestAnimationFrame(frame);
    else {
      running = false;
      trees.forEach(function (t) { t.a = 0; t.v = 0; t.el.removeAttribute('transform'); });
    }
  }

  window.addEventListener('scroll', function () {
    var dy = window.scrollY - lastY;
    lastY = window.scrollY;
    if (!dy) return;
    var kick = Math.max(-40, Math.min(40, dy)) * 0.012;
    trees.forEach(function (t) { t.v += kick * t.gain; });
    if (!running) { running = true; requestAnimationFrame(frame); }
  }, { passive: true });
})();

// ── Weather: turn the one-line status into big readouts ──
(function () {
  var status = document.getElementById('weather-status');
  var host = document.getElementById('wx-stats');
  var banner = document.querySelector('.weather-banner');
  if (!status || !host || !banner) return;

  function grab(re, t) { var m = t.match(re); return m ? m[1] : null; }
  function el(tag, cls, text) { var e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e; }
  function card(label, value, unit, cls) {
    var c = el('div', 'wx-card' + (cls ? ' ' + cls : ''));
    c.appendChild(el('span', 'wx-label', label));
    var v = el('span', 'wx-val', value);
    v.appendChild(el('small', '', unit));
    c.appendChild(v);
    return c;
  }

  function render() {
    var t = status.textContent || '';
    var air = grab(/(-?[\d.]+)\s*°\s*C\s*Air/i, t);
    var hum = grab(/([\d.]+)\s*%\s*Humidity/i, t);
    var hi = grab(/(-?[\d.]+)\s*°\s*C\s*Heat\s*Index/i, t);
    if (air === null || hum === null || hi === null) {
      banner.classList.remove('wx-parsed');
      host.hidden = true;
      return;
    }
    var cm = t.match(/Heat\s*Index\s*\(([^)]+)\)/i);
    var cond = cm ? cm[1].trim() : '';
    var sm = t.match(/^\s*([^:]+):/);
    var src = sm ? sm[1].trim() : 'Live weather';
    var alert = cond && !/normal/i.test(cond);

    host.textContent = '';
    host.appendChild(el('span', 'wx-source', src));
    host.appendChild(card('Air temperature', air, '°C'));
    host.appendChild(card('Humidity', hum, '%'));
    host.appendChild(card('Heat index', hi, '°C', 'heat'));
    if (cond) host.appendChild(el('span', 'wx-cond' + (alert ? ' alert' : ''), cond));
    host.hidden = false;
    banner.classList.add('wx-parsed');
  }

  new MutationObserver(render).observe(status, { childList: true, characterData: true, subtree: true });
  render();
})();

// ── Allocation Plan (#win-plan): Click to open as a larger floating window with Min, Max & Close ──
(function () {
  var planWin = document.getElementById('win-plan');
  if (!planWin) return;

  var btnHolder = planWin.querySelector('.win-btns');
  if (btnHolder) {
    btnHolder.innerHTML =
      '<button type="button" data-plan-act="min" title="Minimize" aria-label="Minimize">–</button>' +
      '<button type="button" data-plan-act="max" title="Maximize" aria-label="Maximize">□</button>' +
      '<button type="button" data-plan-act="close" title="Close" aria-label="Close">×</button>';
  }

  var backdrop = document.createElement('div');
  backdrop.className = 'plan-modal-backdrop';
  document.body.appendChild(backdrop);

  var placeholder = document.createElement('aside');
  placeholder.className = 'win results-panel plan-placeholder';
  placeholder.style.display = 'none';
  placeholder.innerHTML =
    '<div class="titlebar"><span class="win-title">Allocation plan (Open in Window)</span></div>' +
    '<div class="win-body"><p class="hint">Allocation plan is currently open in a larger window. Click <b>×</b> on the window (or click here) to dock it back.</p></div>';
  planWin.parentNode.insertBefore(placeholder, planWin);

  function openFloating() {
    if (planWin.classList.contains('plan-floating')) return;
    placeholder.style.display = '';
    planWin.classList.add('plan-floating');
    planWin.classList.remove('collapsed');
    backdrop.classList.add('show');
  }

  function closeFloating() {
    planWin.classList.remove('plan-floating', 'maximized', 'collapsed');
    planWin.style.display = '';
    placeholder.style.display = 'none';
    backdrop.classList.remove('show');
    document.body.classList.toggle('has-max', !!document.querySelector('.win.maximized'));
  }

  planWin.addEventListener('click', function (e) {
    var actBtn = e.target.closest('[data-plan-act]');
    if (actBtn) {
      e.stopPropagation();
      var act = actBtn.getAttribute('data-plan-act');
      if (act === 'min') {
        planWin.classList.toggle('collapsed');
      } else if (act === 'max') {
        if (!planWin.classList.contains('plan-floating')) {
          openFloating();
        }
        planWin.classList.toggle('maximized');
        document.body.classList.toggle('has-max', !!document.querySelector('.win.maximized'));
      } else if (act === 'close') {
        if (planWin.classList.contains('plan-floating') || planWin.classList.contains('maximized')) {
          closeFloating();
        } else {
          planWin.style.display = 'none';
        }
      }
      return;
    }

    if (!planWin.classList.contains('plan-floating')) {
      openFloating();
    }
  });

  backdrop.addEventListener('click', closeFloating);
  placeholder.addEventListener('click', closeFloating);
})();

// ── Soft UI Click Sound (Web Audio API — zero external audio files required) ──
(function () {
  var audioCtx = null;

  function playSoftClick() {
    try {
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      if (!audioCtx) {
        audioCtx = new AudioContextClass();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      var now = audioCtx.currentTime;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.028);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.03);
    } catch (e) {}
  }

  document.addEventListener('click', playSoftClick, true);
})();