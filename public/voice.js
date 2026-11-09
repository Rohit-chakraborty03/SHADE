/* S.H.A.D.E. voice.js  (load it LAST, after human.js)
   Adds a speaker button to every "?" popup and to the guided tour. Click it, pick English or Bangla,
   and it explains the card in simple spoken words (not a read-out of the text on screen).
   Uses the browser's built-in speech (speechSynthesis): no server, no keys. */
(function () {
  'use strict';
  if (!('speechSynthesis' in window)) return;

  /* The explanations live in voice-text.json (edit them there). make_audio.py turns them into audio/<lang>/<id>.mp3 */
  var LOOKUP = {};
  function norm(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim(); }
  fetch('voice-text.json').then(function (r) { return r.json(); }).then(function (d) {
    d.forEach(function (r) { r.titles.forEach(function (t) { LOOKUP[t] = r; }); });
  }).catch(function () {});

  var PREF = 'shade_voice_lang';
  function getPref() { try { return localStorage.getItem(PREF) || ''; } catch (e) { return ''; } }
  function setPref(v) { try { localStorage.setItem(PREF, v); } catch (e) {} }

  /* ───────── speech ───────── */
  var synth = window.speechSynthesis, current = null;
  function voiceFor(code) {
    var vs = synth.getVoices() || [];
    if (code === 'bn') return vs.filter(function (v) { return /^bn/i.test(v.lang); })[0] || null;
    return vs.filter(function (v) { return /^en-IN/i.test(v.lang); })[0] || vs.filter(function (v) { return /^en/i.test(v.lang); })[0] || null;
  }
  var clip = null;
  function stopAll() { try { synth.cancel(); } catch (e) {} if (clip) { clip.onended = clip.onerror = null; try { clip.pause(); } catch (e) {} clip = null; } if (current) { current.setOn(false); current = null; } }
  window.addEventListener('beforeunload', function () { try { synth.cancel(); } catch (e) {} });

  /* ───────── the little control (button, language dropdown, transcript) ───────── */
  var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';
  function makeRow(getTitle, onResize) {
    var row = document.createElement('div');
    row.className = 'vx';
    row.innerHTML =
      '<button type="button" class="vx-btn" aria-label="Explain this aloud in simple words">' + ICON + '<span>Explain aloud</span></button>' +
      '<select class="vx-sel" hidden aria-label="Choose the language to listen in">' +
      '<option value="" disabled selected>Choose language\u2026</option>' +
      '<option value="en">English (simple)</option><option value="bn">\u09AC\u09BE\u0982\u09B2\u09BE (\u09B8\u09B9\u099C \u09AD\u09BE\u09B7\u09BE)</option></select>' +
      '<div class="vx-text" hidden></div><div class="vx-note" hidden></div>';
    var btn = row.querySelector('.vx-btn'), label = btn.querySelector('span'), sel = row.querySelector('.vx-sel');
    var text = row.querySelector('.vx-text'), note = row.querySelector('.vx-note');
    var api = { setOn: function (on) { btn.classList.toggle('on', on); label.textContent = on ? 'Stop' : 'Explain aloud'; }, reset: reset, stop: stopAll };

    function reset() {
      if (current === api) stopAll();
      api.setOn(false); text.hidden = true; note.hidden = true; sel.hidden = true; sel.value = '';
    }
    function speak(code) {
      var r = LOOKUP[norm(getTitle())];
      var msg = r ? r[code] : (code === 'bn' ? '\u098F\u0987 \u0985\u0982\u09B6\u09C7\u09B0 \u0995\u09A5\u09BE \u09AA\u09B0\u09C7 \u09AF\u09CB\u0997 \u09B9\u09AC\u09C7\u0964' : 'This part helps you use the tool. Read the short text above it for the details.');
      stopAll();
      text.textContent = msg; text.lang = code; text.hidden = false; note.hidden = true;
      current = api; api.setOn(true);
      function done() { if (current === api) { api.setOn(false); current = null; } }
      function browserVoice() {              // fallback only when the mp3 is missing
        var vc = voiceFor(code);
        if (code === 'bn' && !vc) {          // no real Bangla voice: do not mumble, just show the words
          note.textContent = 'Audio is not set up yet. Run make_audio.py once (see the instructions), or read the words above.';
          note.hidden = false; done(); if (onResize) onResize(); return;
        }
        var u = new SpeechSynthesisUtterance(msg);
        u.lang = code === 'bn' ? 'bn-IN' : 'en-IN'; if (vc) u.voice = vc; u.rate = 0.92; u.onend = u.onerror = done;
        synth.speak(u);
      }
      if (r) {
        clip = new Audio('audio/' + code + '/' + r.id + '.mp3');
        clip.onended = done;
        clip.onerror = function () { clip = null; browserVoice(); };
        clip.play().catch(function () { if (clip) { clip = null; browserVoice(); } });
      } else browserVoice();
      if (onResize) onResize();
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (current === api) { stopAll(); return; }
      sel.hidden = false;
      var p = getPref();
      if (p) { sel.value = p; speak(p); } else { sel.focus(); }
      if (onResize) onResize();
    });
    sel.addEventListener('change', function () { if (sel.value) { setPref(sel.value); speak(sel.value); } });
    sel.addEventListener('click', function (e) { e.stopPropagation(); });
    return Object.assign(row, { _api: api });
  }

  /* ───────── 1. the "?" popup ───────── */
  var pop = document.getElementById('qm-pop');
  function fitPop() {
    var h = pop.offsetHeight, t = parseFloat(pop.style.top) || 0;
    if (t + h > innerHeight - 10) pop.style.top = Math.max(10, innerHeight - h - 10) + 'px';
  }
  if (pop) {
    new MutationObserver(function () {
      if (pop.hidden) { stopAll(); return; }
      if (pop.querySelector('.vx')) return;
      var title = pop.firstChild ? pop.firstChild.textContent : '';
      pop.appendChild(makeRow(function () { return title; }, fitPop));
      fitPop();
    }).observe(pop, { childList: true, attributes: true, attributeFilter: ['hidden'] });
  }

  /* ───────── 2. the guided tour ───────── */
  var lastTitle = '';
  setInterval(function () {
    var card = document.querySelector('.tour-card');
    if (!card) return;
    var t = card.querySelector('.tour-title'), actions = card.querySelector('.tour-actions');
    if (!t || !actions) return;
    var row = card.querySelector('.vx');
    if (!row) {
      row = makeRow(function () { return t.textContent; });
      card.insertBefore(row, actions);
    }
    var shown = card.offsetParent !== null || getComputedStyle(card).display !== 'none';
    if (!shown) { if (current === row._api) stopAll(); return; }
    if (t.textContent !== lastTitle) { lastTitle = t.textContent; row._api.reset(); }
  }, 300);

  /* ───────── 3. a banner on the dashboard that advertises the feature ───────── */
  (function () {
    var KEY = 'shade_voice_promo_off';
    try { if (localStorage.getItem(KEY)) return; } catch (e) {}
    var anchor = document.querySelector('.weather-wrap');
    if (!anchor) return;
    var b = document.createElement('section');
    b.className = 'voice-promo';
    b.setAttribute('aria-label', 'Listen instead of reading');
    b.innerHTML =
      '<span class="vp-ico">' + ICON + '</span>' +
      '<div class="vp-text"><strong>New: listen instead of reading.</strong>' +
      '<span>Tap any <b class="vp-q">?</b> on a card, then press the speaker. It explains in simple English or \u09AC\u09BE\u0982\u09B2\u09BE.</span>' +
      '<span lang="bn">\u09AA\u09A1\u09BC\u09A4\u09C7 \u09A8\u09BE \u099A\u09BE\u0987\u09B2\u09C7 \u09B6\u09C1\u09A8\u09C1\u09A8\u0964 \u09AF\u09C7\u0995\u09CB\u09A8\u09CB \u0995\u09BE\u09B0\u09CD\u09A1\u09C7\u09B0 ? \u099A\u09BE\u09AA\u09C1\u09A8, \u09A4\u09BE\u09B0\u09AA\u09B0 \u09B8\u09CD\u09AA\u09BF\u0995\u09BE\u09B0\u09C7\u09B0 \u09AC\u09CB\u09A4\u09BE\u09AE\u09C7 \u099A\u09BE\u09AA \u09A6\u09BF\u09A8\u0964</span></div>' +
      '<div class="vp-slot"></div>' +
      '<button type="button" class="vp-x" aria-label="Hide this tip">\u00D7</button>';
    b.querySelector('.vp-slot').appendChild(makeRow(function () { return 'About this project'; }, null));
    b.querySelector('.vp-x').addEventListener('click', function () {
      stopAll(); b.remove();
      try { localStorage.setItem(KEY, '1'); } catch (e) {}
    });
    anchor.parentNode.insertBefore(b, anchor);
  })();
})();