/* S.H.A.D.E. report.js
   Builds the formal PDF report. Needs jsPDF (loaded in index.html before this file).
   Two parts:
     ShadeReport.build(jsPDF, data, assets)  -> jsPDF document (pure layout, no page access)
     ShadeReport.download()                  -> reads the page, builds the PDF, saves it
   Nothing here changes the plan, the map or any data. */
(function (root) {
  'use strict';

  var PW = 210, PH = 297, M = 18, CW = PW - 2 * M, TOP = 26, BOT = PH - 22;
  var GREEN = [26, 74, 56], INK = [32, 32, 32], GREY = [100, 100, 100], RULE = [175, 175, 175];

  /* The built-in PDF fonts only know Western characters, so swap the few others. */
  function clean(s) {
    if (s == null) return '';
    return String(s)
      .replace(/\u20B9/g, 'Rs ').replace(/[\u2212\u2012]/g, '-').replace(/\u2192/g, '->')
      .replace(/\u2713/g, '').replace(/R\u00B2/g, 'R-squared').replace(/\u00B2/g, '2').replace(/\u2248/g, '~').replace(/\u2264/g, '<=').replace(/\u2265/g, '>=')
      .replace(/[\u2009\u202F\u00A0]/g, ' ')
      .replace(/[^\x09\x0A\x20-\x7E\xA1-\xFF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, '');
  }
  function inr(n) {
    n = Number(n) || 0;
    if (n >= 1e7) return 'Rs ' + (n / 1e7).toFixed(2) + ' Cr';
    return 'Rs ' + (n / 1e5).toFixed(1) + ' L';
  }
  function num(n) { return Number(n || 0).toLocaleString('en-IN'); }
  function fc(n) { return String(Math.round(Number(n) * 100) / 100); }
  function tname(t) { return String(t || '').replace(/_/g, ' '); }
  function cap(t) { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); }

  function build(jsPDF, data, assets) {
    assets = assets || {};
    var doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    var y = TOP, pageNo = 1;

    /* ── page furniture ── */
    function watermark() {
      if (assets.watermark) {
        var w = 176, h = w * assets.watermark.h / assets.watermark.w;
        doc.addImage(assets.watermark.url, 'PNG', (PW - w) / 2, (PH - h) / 2, w, h, 'shade-wm', 'FAST');
      } else {
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.08 }));
        doc.setFont('times', 'bolditalic'); doc.setFontSize(130); doc.setTextColor(GREEN[0], GREEN[1], GREEN[2]);
        doc.text('SHADE', PW / 2, PH / 2 + 20, { align: 'center', angle: 28 });
        doc.restoreGraphicsState();
      }
    }
    function runningHeader() {
      if (pageNo === 1) return;
      doc.setFont('times', 'italic'); doc.setFontSize(9); doc.setTextColor(GREY[0], GREY[1], GREY[2]);
      doc.text('S.H.A.D.E.  |  Kolkata Heat Allocation Report', M, 13);
      doc.setDrawColor(RULE[0], RULE[1], RULE[2]); doc.setLineWidth(0.2); doc.line(M, 15.5, PW - M, 15.5);
    }
    function newPage() { doc.addPage(); pageNo++; watermark(); runningHeader(); y = TOP; }
    function ensure(h) { if (y + h > BOT) { newPage(); return true; } return false; }

    watermark();

    /* ── text helpers ── */
    function setBody(size, style, color) {
      doc.setFont('helvetica', style || 'normal'); doc.setFontSize(size || 9.5);
      var c = color || INK; doc.setTextColor(c[0], c[1], c[2]);
    }
    function wrap(text, width) { return doc.splitTextToSize(clean(text), width); }

    function h1(text) {
      ensure(22);
      y += 3;
      doc.setFont('times', 'bold'); doc.setFontSize(14.5); doc.setTextColor(GREEN[0], GREEN[1], GREEN[2]);
      doc.text(clean(text), M, y);
      y += 2.2; doc.setDrawColor(GREEN[0], GREEN[1], GREEN[2]); doc.setLineWidth(0.45); doc.line(M, y, PW - M, y);
      y += 6;
    }
    function h2(text) {
      ensure(34); y += 1.5;
      doc.setFont('times', 'bold'); doc.setFontSize(11); doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text(clean(text), M, y); y += 5;
    }
    function para(text, o) {
      o = o || {};
      setBody(o.size || 9.5, o.style, o.color);
      var lh = (o.size || 9.5) * 0.5, lines = wrap(text, o.width || CW);
      lines.forEach(function (ln) { ensure(lh + 1); setBody(o.size || 9.5, o.style, o.color); doc.text(ln, o.x || M, y); y += lh; });
      y += (o.gap == null ? 2.5 : o.gap);
    }
    function bullets(list, o) {
      o = o || {};
      list.forEach(function (t) {
        var lines = wrap(t, CW - 6), lh = 4.8;
        lines.forEach(function (ln, i) {
          ensure(lh + 1); setBody(9.5);
          if (i === 0) doc.text('\u2022', M + 1.5, y);
          doc.text(ln, M + 6, y); y += lh;
        });
        y += 1.2;
      });
      y += 1;
    }

    /* two-column key / value table */
    function kv(rows, labelW) {
      labelW = labelW || 62;
      rows.forEach(function (r) {
        var vl = wrap(r[1] == null || r[1] === '' ? '-' : r[1], CW - labelW - 3), lh = 4.6;
        var h = Math.max(1, vl.length) * lh + 2.6;
        ensure(h);
        setBody(9, 'bold', GREY); doc.text(clean(r[0]), M, y + 3.4);
        setBody(9.5); vl.forEach(function (ln, i) { doc.text(ln, M + labelW, y + 3.4 + i * lh); });
        y += h; doc.setDrawColor(215, 215, 215); doc.setLineWidth(0.15); doc.line(M, y, PW - M, y);
      });
      y += 3;
    }

    /* grid table: cols = [{t, w, a}], rows = [[..], ..]; header repeats on a new page */
    function grid(cols, rows, o) {
      o = o || {};
      var fs = o.size || 8.5, lh = fs * 0.5, pad = 1.6;
      function head() {
        setBody(fs, 'bold', GREEN);
        var heads = cols.map(function (c) { return wrap(c.t, c.w - 2 * pad); });
        var hh = Math.max.apply(null, heads.map(function (a) { return a.length; })) * lh + 3;
        var x = M;
        cols.forEach(function (c, i) {
          heads[i].forEach(function (ln, k) {
            var tx = c.a === 'r' ? x + c.w - pad : x + pad;
            doc.text(ln, tx, y + 3.4 + k * lh, c.a === 'r' ? { align: 'right' } : undefined);
          });
          x += c.w;
        });
        y += hh; doc.setDrawColor(GREEN[0], GREEN[1], GREEN[2]); doc.setLineWidth(0.4); doc.line(M, y, PW - M, y);
      }
      ensure(rows.length <= 8 ? rows.length * 7 + 16 : 24);
      doc.setDrawColor(GREEN[0], GREEN[1], GREEN[2]); doc.setLineWidth(0.4); doc.line(M, y, PW - M, y);
      head();
      rows.forEach(function (r) {
        var cells = r.map(function (v, i) { return wrap(v == null || v === '' ? '-' : v, cols[i].w - 2 * pad); });
        var rh = Math.max.apply(null, cells.map(function (a) { return a.length; })) * lh + 3;
        if (ensure(rh + 2)) { doc.setDrawColor(GREEN[0], GREEN[1], GREEN[2]); doc.setLineWidth(0.4); doc.line(M, y, PW - M, y); head(); }
        var x = M;
        cols.forEach(function (c, i) {
          setBody(fs, o.boldFirst && i === 0 ? 'bold' : 'normal');
          cells[i].forEach(function (ln, k) {
            var tx = c.a === 'r' ? x + c.w - pad : x + pad;
            doc.text(ln, tx, y + 3.4 + k * lh, c.a === 'r' ? { align: 'right' } : undefined);
          });
          x += c.w;
        });
        y += rh; doc.setDrawColor(215, 215, 215); doc.setLineWidth(0.15); doc.line(M, y, PW - M, y);
      });
      y += 4;
    }

    var P = data.plan, I = data.inputs, W = data.weather || {};
    var cool = P.cooling || { picks: [] }, rel = P.relief || { picks: [] };
    var date = data.now;
    var dateStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    var timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    /* ───────── title block ───────── */
    if (assets.wordmark) {
      var ww = 62, wh = ww * assets.wordmark.h / assets.wordmark.w;
      doc.addImage(assets.wordmark.url, 'PNG', M, 12, ww, wh, 'shade-word', 'FAST');
      y = 12 + wh + 2;
    } else {
      doc.setFont('times', 'bolditalic'); doc.setFontSize(34); doc.setTextColor(GREEN[0], GREEN[1], GREEN[2]);
      doc.text('SHADE', M, 28); y = 33;
    }
    doc.setFont('times', 'italic'); doc.setFontSize(11.5); doc.setTextColor(GREY[0], GREY[1], GREY[2]);
    doc.text('System for Heat Allocation & Distribution Equity', M, y); y += 4;
    doc.setDrawColor(GREEN[0], GREEN[1], GREEN[2]); doc.setLineWidth(1); doc.line(M, y, PW - M, y); y += 11;
    doc.setFont('times', 'bold'); doc.setFontSize(23); doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text('Heat Action Allocation Report', M, y); y += 8;
    doc.setFont('times', 'normal'); doc.setFontSize(12.5); doc.setTextColor(GREY[0], GREY[1], GREY[2]);
    doc.text('City of Kolkata  -  Decision-support output', M, y); y += 9;

    kv([
      ['Report reference', data.ref],
      ['Date and time of issue', dateStr + ', ' + timeStr + ' (local time)'],
      ['Geographic scope', 'Kolkata only (' + (data.wardCount || 'all') + ' wards in the S.H.A.D.E. dataset)'],
      ['Ward examined in detail', data.ward ? 'Ward ' + data.ward.no + ' - ' + data.ward.name : 'None'],
      ['Planning mode', I.modeLabel],
      ['Status of this document', 'Output of a prototype of a concept. All figures are model estimates.']
    ]);

    /* ───────── 1. executive summary ───────── */
    h1('1.  Executive summary');
    var shade = (P.baselines || [])[0], others = (P.baselines || []).slice(1);
    var sIdx = (P.baselines || []).findIndex(function (b) { return /s\.?h\.?a\.?d\.?e|optimi/i.test(b.strategy); });
    if (sIdx >= 0) { shade = P.baselines[sIdx]; others = P.baselines.filter(function (_, i) { return i !== sIdx; }); }
    var summary = 'This report records the heat-adaptation plan produced by S.H.A.D.E. for Kolkata on ' + dateStr + '. The plan works within a total heat budget of ' +
      I.budgetCr.toFixed(1) + ' crore rupees, divided ' + I.coolPct + '% to structural cooling (measures that last) and ' + (100 - I.coolPct) + '% to seasonal relief (measures for the current summer).';
    para(summary);
    para('The plan selects ' + cool.picks.length + ' ward(s) for structural cooling and ' + rel.picks.length + ' seasonal relief site(s). It is estimated to avert ' +
      num(cool.person_degrees_averted) + ' person-degrees of heat exposure and to newly place ' + num(rel.vulnerable_people_covered) +
      ' vulnerable people within walking reach of relief. The cooling pool spends ' + inr(cool.spent_inr) + ' once; the relief pool spends ' + inr(rel.spent_inr) + ' per summer season.');
    if (shade && others.length) {
      var best = others.slice().sort(function (a, b) { return b.personDegrees - a.personDegrees; })[0];
      var diff = best.personDegrees ? (shade.personDegrees - best.personDegrees) / best.personDegrees * 100 : 0;
      para('Against the strongest simple targeting rule tested on the same cooling budget ("' + best.strategy + '"), the S.H.A.D.E. allocation averts ' +
        Math.abs(diff).toFixed(1) + '% ' + (diff >= 0 ? 'more' : 'less') + ' modelled heat exposure (Section 5.2).');
    }
    if (data.ward) para('Ward ' + data.ward.no + ' (' + data.ward.name + ') has been examined in detail in Section 4' + (data.wardNote ? '. ' + data.wardNote : '.'));

    /* ───────── 2. inputs and conditions ───────── */
    h1('2.  Planning inputs and conditions');
    h2('2.1  Parameters set by the user');
    kv([
      ['Total heat budget', I.budgetCr.toFixed(1) + ' crore rupees'],
      ['Cooling / relief split applied', I.coolPct + '% cooling / ' + (100 - I.coolPct) + '% relief'],
      ['Uncertainty planning mode', I.modeLabel],
      ['Equity floor', I.floorPct + '% of the budget reserved for the most vulnerable wards'],
      ['Structural cooling measures allowed', (I.cooling.length ? I.cooling.join(', ') : 'None')],
      ['Seasonal relief measures allowed', (I.relief.length ? I.relief.join(', ') : 'None')]
    ]);
    h2('2.2  Vulnerability weights');
    para('Each weight scales one factor in the vulnerability index (0 ignores the factor, 1 is the default, 2 doubles it).', { size: 9, color: GREY });
    grid([{ t: 'Factor', w: 110 }, { t: 'Weight', w: 64, a: 'r' }],
      I.weights.map(function (w) { return [w[0], String(w[1])]; }), {});
    h2('2.3  Weather at the time of planning');
    kv([
      ['Source', W.source || 'Not available'],
      ['Air temperature', W.temp != null ? W.temp + ' \u00B0C' : '-'],
      ['Relative humidity', W.hum != null ? W.hum + ' %' : '-'],
      ['Heat index', W.hi != null ? W.hi + ' \u00B0C' + (W.alert ? '  (' + W.alert + ')' : '') : '-'],
      ['Severe-heatwave simulation', W.simulated ? 'Switched on' : 'Switched off'],
      ['Split suggested by the system', W.sugCool != null ? W.sugCool + '% cooling / ' + W.sugRel + '% relief' : '-'],
      ['Split applied in this plan', I.coolPct + '% cooling / ' + (100 - I.coolPct) + '% relief' + (W.sugCool != null ? (W.sugCool === I.coolPct ? '  (same as suggested)' : '  (adjusted by the user)') : '')]
    ]);

    /* ───────── 3. allocation plan ───────── */
    h1('3.  Allocation plan (estimates)');
    h2('3.1  Headline results');
    grid([{ t: 'Measure', w: 78 }, { t: 'Result', w: 40, a: 'r' }, { t: 'What it means', w: 56 }], [
      ['Estimated heat exposure avoided', num(cool.person_degrees_averted) + ' person-degrees', 'From cool roofs and trees'],
      ['Estimated vulnerable people newly covered', num(rel.vulnerable_people_covered), 'Within walking reach of relief'],
      ['Estimated cooling cost', inr(cool.spent_inr), 'One-time capital'],
      ['Estimated relief cost', inr(rel.spent_inr) + ' / season', 'Repeats every summer']
    ], { boldFirst: true });

    h2('3.2  Structural cooling: wards and measures');
    if (cool.picks.length) {
      grid([{ t: '#', w: 8 }, { t: 'Ward', w: 42 }, { t: 'Measure', w: 26 }, { t: 'Cost', w: 22, a: 'r' }, { t: 'Expected drop', w: 24, a: 'r' }, { t: 'Range', w: 30, a: 'r' }, { t: 'Confidence', w: 22, a: 'r' }],
        cool.picks.map(function (p, i) {
          return [String(i + 1), p.ward_no + ' - ' + p.ward_name, cap(tname(p.type)), inr(p.cost), '-' + fc(p.cooling_gain_c) + ' \u00B0C',
            '-' + fc(p.cooling_gain_low_c) + ' to -' + fc(p.cooling_gain_high_c) + ' \u00B0C', Math.round(p.stability * 100) + '%'];
        }));
      para('Confidence is the share of the 50 model runs in which the same pick stays in the plan.', { size: 8.5, color: GREY });
    } else para('No structural cooling measure fits within the budget and constraints set.');

    h2('3.3  Seasonal relief: sites');
    if (rel.picks.length) {
      grid([{ t: 'Ward', w: 62 }, { t: 'Measure', w: 40 }, { t: 'Cost per season', w: 32, a: 'r' }, { t: 'Vulnerable people newly covered', w: 40, a: 'r' }],
        rel.picks.map(function (r) { return [r.ward_no + ' - ' + r.ward_name, cap(tname(r.type)), inr(r.cost), num(r.uncovered_vulnerable_pop)]; }));
    } else para('No seasonal relief measure was selected.');

    h2('3.4  Equity audit');
    var eq = P.equity_audit || {};
    kv([
      ['Share of cooling spend in high-slum wards', eq.slum_budget_share_pct + '%'],
      ['Share of cooling spend in the most vulnerable fifth of wards', eq.top_quintile_budget_share_pct + '%'],
      ['Elderly (60+) reached', num(eq.elderly_reached)],
      ['Children (under 6) reached', num(eq.children_reached)],
      ['Share of city population reached', eq.population_share_reached_pct + '%']
    ], 92);

    h2('3.5  Hospital heat-readiness flags');
    para('These hospitals are flagged for a heat alert. This step has no cost.', { size: 9, color: GREY });
    if ((P.hospital_alerts || []).length) bullets(P.hospital_alerts.map(function (h) { return h.name; }));
    else para('No hospital was flagged in this run.');

    /* ───────── 4. selected ward ───────── */
    h1('4.  Ward under examination');
    if (data.ward) {
      var wd = data.ward;
      h2('Ward ' + wd.no + ' - ' + wd.name);
      para(wd.chips.join('   |   '), { style: 'bold', color: GREEN });
      h2('4.1  Ward parameters');
      grid([{ t: 'Parameter', w: 66 }, { t: 'Value', w: 38, a: 'r' }, { t: 'Position among all wards', w: 70 }],
        wd.params.map(function (p) { return [p.label, p.value, p.pos || '-']; }), { boldFirst: true });
      h2('4.2  Why this ward was treated this way');
      bullets(wd.why.length ? wd.why : ['No plan reasoning was available for this ward.']);
      h2('4.3  Measures considered for this ward');
      if (wd.measuresCool.length) { para('Long-term (cooling)', { style: 'bold', gap: 1 }); bullets(wd.measuresCool); }
      if (wd.measuresRelief.length) { para('Seasonal (relief)', { style: 'bold', gap: 1 }); bullets(wd.measuresRelief); }
      if (wd.gap) para(wd.gap, { size: 9, color: GREY });
    } else para('No ward was available to examine.');

    /* ───────── 5. reasoning ───────── */
    h1('5.  Reasoning behind the plan');
    h2('5.1  Why this split of the budget');
    var sugRel = W.sugRel != null ? W.sugRel : (100 - I.coolPct);
    var tone = sugRel >= 45 ? 'Heat conditions are severe, so the system leans towards immediate relief for people at risk.'
      : sugRel >= 25 ? 'Conditions are warmer than usual, so the system keeps a larger share for seasonal relief while still investing in lasting measures.'
      : 'Conditions are normal, so most of the budget goes to structural measures (cool roofs and trees) that keep working in later years.';
    para('The system reads the live heat index for Kolkata and suggests how to divide the budget between the two pools. ' + tone +
      (W.sugCool != null ? ' The suggestion was ' + W.sugCool + '% cooling / ' + W.sugRel + '% relief; the split applied in this plan is ' + I.coolPct + '% / ' + (100 - I.coolPct) + '%.' : '') +
      ' The split is a starting point and can be changed by the planner.');

    h2('5.2  Comparison with simpler targeting rules');
    para('The same cooling budget was spent using five targeting rules. A higher figure means more modelled heat exposure avoided.', { size: 9, color: GREY });
    if ((P.baselines || []).length) {
      var maxPd = Math.max.apply(null, P.baselines.map(function (b) { return b.personDegrees; })) || 1;
      grid([{ t: 'Targeting rule', w: 80 }, { t: 'Person-degrees averted (modelled)', w: 56, a: 'r' }, { t: 'Relative to best', w: 38, a: 'r' }],
        P.baselines.map(function (b) { return [b.strategy, num(Math.round(b.personDegrees)), Math.round(b.personDegrees / maxPd * 100) + '%']; }), { boldFirst: false });
    }

    h2('5.3  Cost of the equity guarantee');
    para('Reserving more of the budget for the most vulnerable wards can reduce the total heat exposure avoided. This table shows that trade-off.', { size: 9, color: GREY });
    if ((P.tradeoff_curve || []).length) {
      grid([{ t: 'Share of budget guaranteed to the most vulnerable', w: 100 }, { t: 'Total person-degrees averted', w: 74, a: 'r' }],
        P.tradeoff_curve.map(function (t) { return [t.floor_pct + '%', num(Math.round(t.total_person_degrees))]; }));
    }

    h2('5.4  How to read the confidence figures');
    para('The cooling gains come from an ensemble of 50 models, not a single model. "Expected" planning uses the ensemble average. "Conservative" planning uses the 10th percentile, a cautious estimate that is exceeded in nine runs out of ten. The range shown for each pick runs from the low to the high end of the ensemble.');

    /* ───────── 6. data, model, limits ───────── */
    h1('6.  Data sources, model and limitations');
    if (data.modelCard) para(data.modelCard);
    if (data.coverage) para(data.coverage);
    ensure(30);
    para('Status. S.H.A.D.E. is a prototype of a concept. Every figure in this report is a modelled estimate and has not been validated in a real city programme or measured on the ground. Limitations. Cooling values are correlational model estimates derived from satellite land-surface temperature. They are not measured air-temperature trials. Walking reach is calculated along street routes, which is more realistic than straight-line circles but still depends on map data. This report supports planning decisions and does not replace on-site surveys or professional engineering judgement. S.H.A.D.E. currently covers Kolkata only.', { color: INK });

    ensure(34); y += 6;
    doc.setDrawColor(GREEN[0], GREEN[1], GREEN[2]); doc.setLineWidth(0.4); doc.line(M, y, M + 70, y); y += 5;
    setBody(10, 'bold'); doc.text('Prepared by S.H.A.D.E.', M, y); y += 4.8;
    setBody(9.5, 'normal', GREY); doc.text('System for Heat Allocation & Distribution Equity, Kolkata', M, y); y += 4.8;
    doc.text('Designed and developed by Rohit Chakravorty', M, y);

    /* ───────── footers on every page ───────── */
    var n = doc.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setDrawColor(RULE[0], RULE[1], RULE[2]); doc.setLineWidth(0.2); doc.line(M, PH - 17, PW - M, PH - 17);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(GREY[0], GREY[1], GREY[2]);
      doc.text('S.H.A.D.E. Kolkata Heat Allocation Report   |   ' + data.ref, M, PH - 12.5);
      doc.text('Page ' + i + ' of ' + n, PW - M, PH - 12.5, { align: 'right' });
      doc.text('Designed and developed by Rohit Chakravorty', M, PH - 8.5);
    }
    return doc;
  }

  /* ───────────────── page side: collect data, make images, save ───────────────── */
  function textImage(text, px, alpha, angle, pad, stroke) {
    var c = document.createElement('canvas'), ctx = c.getContext('2d');
    var font = px + 'px "Satisfy", "Brush Script MT", cursive';
    ctx.font = font;
    var tw = Math.ceil(ctx.measureText(text).width);
    var rad = (angle || 0) * Math.PI / 180;
    var w = Math.ceil(Math.abs(tw * Math.cos(rad)) + Math.abs(px * 1.5 * Math.sin(rad))) + pad * 2;
    var h = Math.ceil(Math.abs(tw * Math.sin(rad)) + Math.abs(px * 1.5 * Math.cos(rad))) + pad * 2;
    c.width = w; c.height = h;
    ctx.translate(w / 2, h / 2); ctx.rotate(rad);
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var col = 'rgba(26,74,56,' + alpha + ')';
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = stroke; ctx.lineJoin = 'round';
    if (stroke) ctx.strokeText(text, 0, 0);
    ctx.fillText(text, 0, 0);
    return { url: c.toDataURL('image/png'), w: w, h: h };
  }

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function txt(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }

  var LABELS = {
    mean_temp_c: ['Mean surface temperature', function (v) { return v + ' \u00B0C'; }],
    vulnerability: ['Vulnerability index', function (v) { return String(v); }],
    population: ['Population', function (v) { return num(v); }],
    mean_ndvi: ['Vegetation index (NDVI)', function (v) { return String(v); }],
    building_density: ['Building density', function (v) { return Math.round(v * 100) + '%'; }],
    pct_poor_roof: ['Poor roofs (tin / asbestos)', function (v) { return Math.round(v * 100) + '%'; }],
    dist_water_m: ['Distance to nearest water', function (v) { return v + ' m'; }]
  };
  var SKIP = { ward_no: 1, name: 1, geometry: 1, ward_name: 1 };

  function percentileText(prop, v) {
    try {
      if (typeof pctile !== 'function' || typeof wardsGeoJSON === 'undefined' || !wardsGeoJSON) return '';
      var p = pctile(prop, Number(v));
      return p == null ? '' : 'Higher than ' + p + '% of wards';
    } catch (e) { return ''; }
  }

  async function collect() {
    if (typeof currentPlan === 'undefined' || !currentPlan) await runOptimizer();
    var plan = currentPlan;

    var wardNo = (typeof selectedWard !== 'undefined' && selectedWard != null) ? selectedWard : null;
    var wardNote = '';
    if (wardNo == null && plan.cooling.picks.length) { wardNo = Number(plan.cooling.picks[0].ward_no); wardNote = 'No ward was selected on the map, so the top-ranked structural cooling pick is shown'; }
    var ward = null, modelCard = '', coverage = '';

    if (wardNo != null) {
      try { await inspectWard(wardNo); } catch (e) {}
      var brief = null;
      try { brief = await (await fetch('/api/brief/' + wardNo)).json(); } catch (e) {}
      var w = brief && brief.ward;
      var drawer = $('#ward-drawer-content');
      var params = [];
      if (w) {
        var keys = Object.keys(LABELS).filter(function (k) { return w[k] != null; });
        Object.keys(w).forEach(function (k) {
          if (SKIP[k] || LABELS[k]) return;
          var v = w[k];
          if (v == null || typeof v === 'object') return;
          keys.push(k);
        });
        params = keys.map(function (k) {
          var v = w[k], lab, shown;
          if (LABELS[k]) { lab = LABELS[k][0]; shown = LABELS[k][1](v); }
          else {
            lab = cap(k.replace(/^pct_/, 'share of ').replace(/_/g, ' '));
            shown = typeof v === 'number' ? (/^pct_/.test(k) && v <= 1 ? Math.round(v * 100) + '%' : String(Math.round(v * 1000) / 1000)) : String(v);
          }
          return { label: lab, value: shown, pos: typeof v === 'number' ? percentileText(k, v) : '' };
        });
      }
      var chips = $$('.wi-chip', drawer).map(txt);
      ward = {
        no: wardNo, name: w ? w.name : (txt($('.wi-head h4', drawer)).replace(/^Ward\s*\d+:\s*/, '')),
        chips: chips.length ? chips : ['Not a cooling pick'],
        params: params,
        why: $$('.wi-why li', drawer).map(txt),
        measuresCool: [], measuresRelief: [], gap: txt($('.wi-gap', drawer))
      };
      var lists = $$('.wi-measures ul', drawer);
      if (lists[0]) ward.measuresCool = $$('li', lists[0]).map(txt).filter(function (t) { return !/^No cooling/.test(t); });
      if (lists[1]) ward.measuresRelief = $$('li', lists[1]).map(txt).filter(function (t) { return !/^No relief/.test(t); });
    }

    var weather = {};
    try {
      var sim = $('#chk-sim-heatwave').checked;
      var wx = await (await fetch('/api/weather?simulate=' + sim)).json();
      weather = { source: wx.source, temp: wx.temp_c, hum: wx.humidity_pct, hi: wx.heat_index_c, alert: wx.alert_name,
        sugCool: wx.suggested_split.cooling, sugRel: wx.suggested_split.relief, simulated: sim };
    } catch (e) { weather = { simulated: $('#chk-sim-heatwave').checked }; }

    var mc = $('#model-card-box .audit-box'), cv = $('#coverage-gap-box .audit-box');
    if (mc) modelCard = txt(mc);
    if (cv) coverage = txt(cv);

    var mode = $('#sel-estimate-mode').value;
    var wl = [['Elderly (% aged 60+)', 'w-60'], ['Children (% under 6)', 'w-u6'], ['Slum share (assumed data)', 'w-slum'], ['Building density', 'w-bldg'], ['Poor roof, tin / asbestos (assumed data)', 'w-roof']];
    var now = new Date();
    var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
    var ref = 'SHADE-' + now.getFullYear() + pad2(now.getMonth() + 1) + pad2(now.getDate()) + '-' + pad2(now.getHours()) + pad2(now.getMinutes());

    return {
      now: now, ref: ref, wardCount: (typeof wardsGeoJSON !== 'undefined' && wardsGeoJSON) ? wardsGeoJSON.features.length : null,
      inputs: {
        budgetCr: Number($('#rng-budget').value), coolPct: Number($('#rng-split').value), floorPct: Number($('#rng-floor').value),
        modeLabel: mode === 'conservative' ? 'Conservative (10th percentile of the 50-model ensemble)' : 'Expected (mean of the 50-model ensemble)',
        cooling: $$('.chk-cool:checked').map(function (e) { return txt(e.parentNode); }),
        relief: $$('.chk-rel:checked').map(function (e) { return txt(e.parentNode); }),
        weights: wl.map(function (p) { return [p[0], Number($('#' + p[1]).value)]; })
      },
      weather: weather, plan: plan, ward: ward, wardNote: wardNote, modelCard: modelCard, coverage: coverage
    };
  }

  async function download() {
    var jsPDF = root.jspdf && root.jspdf.jsPDF;
    if (!jsPDF) throw new Error('The PDF library did not load. Check your internet connection and try again.');
    try { await Promise.all([document.fonts.load('200px "Satisfy"'), document.fonts.load('60px "Satisfy"')]); } catch (e) {}
    var data = await collect();
    var assets = {};
    try {
      assets.watermark = textImage('SHADE', 300, 0.09, -28, 40, 6);
      assets.wordmark = textImage('SHADE', 150, 1, 0, 14, 3);
    } catch (e) { assets = {}; }
    var doc = build(jsPDF, data, assets);
    doc.save('SHADE-Kolkata-Report' + (data.ward ? '-Ward' + data.ward.no : '') + '-' + data.ref.slice(6, 14) + '.pdf');
  }

  root.ShadeReport = { build: build, download: download };

  /* button */
  function wire() {
    var btn = document.getElementById('btn-report');
    if (!btn) return;
    btn.addEventListener('click', async function () {
      if (btn.disabled) return;
      var old = btn.textContent;
      btn.disabled = true; btn.textContent = 'Preparing report\u2026';
      try { await download(); }
      catch (e) { console.error(e); alert('Sorry, the report could not be made. ' + (e && e.message ? e.message : '')); }
      btn.disabled = false; btn.textContent = old;
    });
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
  }
})(typeof window !== 'undefined' ? window : globalThis);