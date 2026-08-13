/* ==========================================================================
   compare.js — statewide relationship evidence plus local comparison modes
   ========================================================================== */
(function () {
  'use strict';

  var A = window.ATLAS;
  var K = A.COLOUR;

  var el = {
    lgaField: document.getElementById('lga-field'),
    lga: document.getElementById('lga'),
    compareMode: document.getElementById('compare-mode'),
    compareLgaField: document.getElementById('compare-lga-field'),
    compareLga: document.getElementById('compare-lga'),
    dwellingField: document.getElementById('dwelling-field'),
    dwelling: document.getElementById('dwelling'),
    compareActions: document.getElementById('compare-actions'),
    reset: document.getElementById('reset'),
    downloadPdf: document.getElementById('download-pdf'),
    status: document.getElementById('status'),
    subject: document.getElementById('subject'),
    subjectEyebrow: document.getElementById('subject-eyebrow'),
    name: document.getElementById('subject-name'),
    headline: document.getElementById('headline'),
    relationshipSection: document.getElementById('relationship-section'),
    relationshipSummary: document.getElementById('relationship-summary'),
    relationshipBars: document.getElementById('relationship-bars'),
    relationshipTable: document.getElementById('relationship-table'),
    relationshipAlt: document.getElementById('relationship-alt'),
    relationshipAxisMax: document.getElementById('relationship-axis-max'),
    relationshipFocus: document.getElementById('relationship-focus'),
    relationshipFocusHeading: document.getElementById('relationship-focus-heading'),
    relationshipFocusLede: document.getElementById('relationship-focus-lede'),
    relationshipFocusChip: document.getElementById('relationship-focus-chip'),
    relationshipFocusMetrics: document.getElementById('relationship-focus-metrics'),
    relationshipScatter: document.getElementById('relationship-scatter'),
    relationshipLegend: document.getElementById('relationship-legend'),
    chartSection: document.getElementById('chart-section'),
    chartEyebrow: document.getElementById('chart-eyebrow'),
    chartHeading: document.getElementById('chart-heading'),
    chartLede: document.getElementById('chart-lede'),
    contextSection: document.getElementById('context-section'),
    keySubject: document.getElementById('key-subject'),
    keyReference: document.getElementById('key-reference'),
    canvas: document.getElementById('chart'),
    chartAlt: document.getElementById('chart-alt'),
    tableCaption: document.getElementById('table-caption'),
    table: document.getElementById('table'),
    tableColSubject: document.getElementById('table-col-subject'),
    tableColReference: document.getElementById('table-col-reference'),
    tableColBonds: document.getElementById('table-col-bonds'),
    valuesSummary: document.getElementById('values-summary'),
    context: document.getElementById('context-line')
  };

  var status = A.createStatus(el.status);
  var data = null;
  var sel = { lga: '', dwelling: '', mode: '', compareLga: '' };
  var chart = null;

  function hideSelectedArea(state, title, note) {
    if (chart) { chart.destroy(); chart = null; }
    el.subject.hidden = true;
    el.chartSection.hidden = true;
    el.contextSection.hidden = true;
    if (el.relationshipFocus) el.relationshipFocus.hidden = true;
    el.table.replaceChildren();
    if (el.downloadPdf) el.downloadPdf.disabled = true;
    status.set(state, title, note);
    A.commit('analysis.html', { lga: sel.lga, dwelling: sel.dwelling });
  }

  function mean(values) {
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function medianValue(values) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function svgEl(name, attrs, text) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    if (text != null) node.textContent = text;
    return node;
  }

  function logGamma(z) {
    var coefficients = [
      676.5203681218851, -1259.1392167224028, 771.3234287776531,
      -176.6150291621406, 12.507343278686905, -0.13857109526572012,
      0.000009984369578019572, 0.00000015056327351493116
    ];
    if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
    z -= 1;
    var x = 0.9999999999998099;
    coefficients.forEach(function (c, i) { x += c / (z + i + 1); });
    var t = z + coefficients.length - 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }

  function betaFraction(a, b, x) {
    var maxIterations = 200;
    var epsilon = 3e-14;
    var tiny = 1e-300;
    var qab = a + b;
    var qap = a + 1;
    var qam = a - 1;
    var c = 1;
    var d = 1 - qab * x / qap;
    if (Math.abs(d) < tiny) d = tiny;
    d = 1 / d;
    var h = d;

    for (var m = 1; m <= maxIterations; m += 1) {
      var m2 = 2 * m;
      var aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < tiny) d = tiny;
      c = 1 + aa / c;
      if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d;
      h *= d * c;

      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < tiny) d = tiny;
      c = 1 + aa / c;
      if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d;
      var delta = d * c;
      h *= delta;
      if (Math.abs(delta - 1) < epsilon) break;
    }
    return h;
  }

  function regularisedBeta(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b)
      + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return front * betaFraction(a, b, x) / a;
    return 1 - front * betaFraction(b, a, 1 - x) / b;
  }

  function correlationPValue(r, n) {
    if (n < 3 || !Number.isFinite(r)) return NaN;
    if (Math.abs(r) >= 1) return 0;
    var degrees = n - 2;
    var tSquared = r * r * degrees / (1 - r * r);
    return regularisedBeta(degrees / (degrees + tSquared), degrees / 2, 0.5);
  }

  function relationshipStats(type) {
    var rows = data.rowsForDwelling(type);
    var x = rows.map(function (r) { return r.population_growth_pct; });
    var y = rows.map(function (r) { return r.median_weekly_rent; });
    var mx = mean(x);
    var my = mean(y);
    var sxx = 0;
    var syy = 0;
    var sxy = 0;

    rows.forEach(function (r) {
      var dx = r.population_growth_pct - mx;
      var dy = r.median_weekly_rent - my;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    });

    var slope = sxy / sxx;
    var correlation = sxy / Math.sqrt(sxx * syy);
    var stateMedian = data.stateMedianRent(type);
    return {
      type: type,
      n: rows.length,
      slope: slope,
      intercept: my - slope * mx,
      normalisedSlope: slope / stateMedian * 100,
      correlation: correlation,
      p: correlationPValue(correlation, rows.length),
      stateMedian: stateMedian
    };
  }

  function formatP(value) {
    return value < 0.001 ? '<0.001' : value.toFixed(3);
  }

  function renderRelationships() {
    var stats = A.CONFIG.dwellingOrder.map(relationshipStats)
      .sort(function (a, b) { return b.normalisedSlope - a.normalisedSlope; });
    var max = Math.max.apply(null, stats.map(function (s) { return s.normalisedSlope; }));

    el.relationshipSummary.replaceChildren();
    el.relationshipBars.replaceChildren();
    el.relationshipTable.replaceChildren();

    stats.forEach(function (s) {
      var summary = A.el('div', 'relationship-stat');
      summary.dataset.significant = String(s.p < 0.05);
      summary.append(A.el('span', null, s.type));
      summary.append(A.el('strong', null, s.normalisedSlope.toFixed(2) + '%'));
      summary.append(A.el('small', null,
        'r = ' + s.correlation.toFixed(2) + ' · ' + s.n + ' LGAs · '
        + (s.p < 0.05 ? 'significant' : 'not significant')));
      el.relationshipSummary.append(summary);

      var row = A.el('div', 'relationship-row');
      row.setAttribute('role', 'listitem');
      row.dataset.significant = String(s.p < 0.05);

      var label = A.el('div', 'relationship-label');
      label.append(A.el('strong', null, s.type));
      label.append(A.el('span', null, s.n + ' ' + A.plural(s.n, 'LGA')));

      var track = A.el('div', 'relationship-track');
      var fill = A.el('span', 'relationship-fill');
      fill.style.width = (s.normalisedSlope / max * 100).toFixed(1) + '%';
      track.append(fill);

      var value = A.el('div', 'relationship-value');
      value.append(A.el('strong', null, s.normalisedSlope.toFixed(2) + '%'));
      value.append(A.el('span', null, 'r = ' + s.correlation.toFixed(2) + ' · p ' + formatP(s.p)));
      value.append(A.el('em', null, s.p < 0.05 ? 'STATISTICALLY SIGNIFICANT' : 'NOT STATISTICALLY SIGNIFICANT'));

      row.append(label, track, value);
      el.relationshipBars.append(row);

      var tr = document.createElement('tr');
      var th = document.createElement('th');
      th.scope = 'row';
      th.textContent = s.type;
      tr.append(th);
      [s.normalisedSlope.toFixed(2) + '%', s.correlation.toFixed(2), formatP(s.p), String(s.n)]
        .forEach(function (v) { tr.append(A.el('td', 'num', v)); });
      el.relationshipTable.append(tr);
    });

    el.relationshipAxisMax.textContent = max.toFixed(2) + '%';
    el.relationshipAlt.textContent = stats.map(function (s) {
      return s.type + ': ' + s.normalisedSlope.toFixed(2) + '% normalised slope, '
        + 'correlation ' + s.correlation.toFixed(2) + ', p-value ' + formatP(s.p)
        + ', based on ' + s.n + ' LGAs.';
    }).join(' ');
    el.relationshipSection.hidden = false;
  }

  function addFocusMetric(label, value, note, tone) {
    var card = A.el('div', 'relationship-focus-metric');
    if (tone) card.dataset.tone = tone;
    card.append(A.el('span', null, label));
    card.append(A.el('strong', null, value));
    card.append(A.el('small', null, note));
    el.relationshipFocusMetrics.append(card);
  }

  function addLegendItem(kind, label) {
    var item = A.el('span', 'scatter-legend-item');
    item.append(A.el('i', 'scatter-key scatter-key-' + kind));
    item.append(document.createTextNode(label));
    el.relationshipLegend.append(item);
  }

  function renderRelationshipFocus(name, peerName) {
    if (!sel.dwelling || !sel.lga) {
      el.relationshipFocus.hidden = true;
      return;
    }

    var type = sel.dwelling;
    var rows = data.rowsForDwelling(type);
    var selected = data.rowFor(sel.lga, type);
    var peer = sel.mode === 'lga' && sel.compareLga ? data.rowFor(sel.compareLga, type) : null;
    if (!selected || (sel.mode === 'lga' && !peer)) {
      el.relationshipFocus.hidden = true;
      return;
    }

    var stats = relationshipStats(type);
    var xVals = rows.map(function (r) { return r.population_growth_pct; });
    var yVals = rows.map(function (r) { return r.median_weekly_rent; });
    var xMinRaw = Math.min.apply(null, xVals);
    var xMaxRaw = Math.max.apply(null, xVals);
    var yMinRaw = Math.min.apply(null, yVals);
    var yMaxRaw = Math.max.apply(null, yVals);
    var xPad = Math.max((xMaxRaw - xMinRaw) * 0.07, 0.8);
    var yPad = Math.max((yMaxRaw - yMinRaw) * 0.08, 35);
    var xMin = xMinRaw - xPad;
    var xMax = xMaxRaw + xPad;
    var yMin = Math.max(0, yMinRaw - yPad);
    var yMax = yMaxRaw + yPad;

    var W = 820, H = 460;
    var m = { left: 76, right: 28, top: 28, bottom: 66 };
    var iw = W - m.left - m.right;
    var ih = H - m.top - m.bottom;
    function sx(v) { return m.left + (v - xMin) / (xMax - xMin) * iw; }
    function sy(v) { return m.top + ih - (v - yMin) / (yMax - yMin) * ih; }

    el.relationshipScatter.replaceChildren();
    el.relationshipFocusMetrics.replaceChildren();
    el.relationshipLegend.replaceChildren();

    el.relationshipFocusHeading.textContent = type + ': population growth vs median rent';
    el.relationshipFocusLede.textContent = 'Each point is an eligible NSW LGA for ' + type
      + '. The highlighted ' + (peer ? 'points show the two selected LGAs' : 'point shows ' + name)
      + '; the line shows the statewide least-squares trend.';
    el.relationshipFocusChip.textContent = rows.length + ' eligible ' + A.plural(rows.length, 'LGA');

    var title = svgEl('title', { id: 'relationship-scatter-title' }, type + ' population growth and median rent');
    var desc = svgEl('desc', { id: 'relationship-scatter-desc' },
      'Scatter plot of ' + rows.length + ' eligible NSW LGAs. Population growth from 2021 to 2025 is on the horizontal axis and 2025 median weekly rent is on the vertical axis.');
    el.relationshipScatter.append(title, desc);

    var grid = svgEl('g', { class: 'scatter-grid' });
    var axes = svgEl('g', { class: 'scatter-axes' });
    var marks = svgEl('g', { class: 'scatter-marks' });
    var labels = svgEl('g', { class: 'scatter-labels' });

    var ticks = 5;
    for (var i = 0; i <= ticks; i += 1) {
      var xv = xMin + (xMax - xMin) * i / ticks;
      var x = sx(xv);
      grid.append(svgEl('line', { x1: x, y1: m.top, x2: x, y2: m.top + ih, class: 'scatter-grid-line' }));
      axes.append(svgEl('text', { x: x, y: H - 36, class: 'scatter-tick', 'text-anchor': 'middle' }, xv.toFixed(1) + '%'));

      var yv = yMin + (yMax - yMin) * i / ticks;
      var y = sy(yv);
      grid.append(svgEl('line', { x1: m.left, y1: y, x2: m.left + iw, y2: y, class: 'scatter-grid-line' }));
      axes.append(svgEl('text', { x: m.left - 12, y: y + 4, class: 'scatter-tick', 'text-anchor': 'end' }, '$' + Math.round(yv)));
    }

    axes.append(svgEl('line', { x1: m.left, y1: m.top + ih, x2: m.left + iw, y2: m.top + ih, class: 'scatter-axis-line' }));
    axes.append(svgEl('line', { x1: m.left, y1: m.top, x2: m.left, y2: m.top + ih, class: 'scatter-axis-line' }));
    axes.append(svgEl('text', { x: m.left + iw / 2, y: H - 9, class: 'scatter-axis-title', 'text-anchor': 'middle' }, 'Population growth, 2021–2025 (%)'));
    axes.append(svgEl('text', { x: 20, y: m.top + ih / 2, class: 'scatter-axis-title', 'text-anchor': 'middle', transform: 'rotate(-90 20 ' + (m.top + ih / 2) + ')' }, 'Median weekly rent, 2025 (AUD)'));

    var trendX1 = xMinRaw;
    var trendX2 = xMaxRaw;
    var trendY1 = stats.intercept + stats.slope * trendX1;
    var trendY2 = stats.intercept + stats.slope * trendX2;
    marks.append(svgEl('line', {
      x1: sx(trendX1), y1: sy(trendY1), x2: sx(trendX2), y2: sy(trendY2), class: 'scatter-trend'
    }));

    rows.forEach(function (r) {
      var c = svgEl('circle', {
        cx: sx(r.population_growth_pct), cy: sy(r.median_weekly_rent), r: 4,
        class: 'scatter-point', tabindex: '0', 'aria-label': r.lga_name + ': '
          + A.percentage(r.population_growth_pct) + ' population growth, ' + A.currency(r.median_weekly_rent) + ' median weekly rent'
      });
      c.append(svgEl('title', {}, r.lga_name + ' — ' + A.percentage(r.population_growth_pct)
        + ' growth · ' + A.currency(r.median_weekly_rent) + '/week'));
      marks.append(c);
    });

    function addSelectedMark(r, label, secondary) {
      var x = sx(r.population_growth_pct), y = sy(r.median_weekly_rent);
      if (secondary) {
        var s = 9;
        marks.append(svgEl('polygon', {
          points: x + ',' + (y - s) + ' ' + (x + s) + ',' + y + ' ' + x + ',' + (y + s) + ' ' + (x - s) + ',' + y,
          class: 'scatter-selected scatter-secondary'
        }));
      } else {
        marks.append(svgEl('circle', { cx: x, cy: y, r: 9, class: 'scatter-selected scatter-primary' }));
      }
      var anchor = x > W - 180 ? 'end' : 'start';
      var dx = anchor === 'end' ? -12 : 12;
      labels.append(svgEl('text', {
        x: x + dx, y: Math.max(m.top + 16, y - 12), class: 'scatter-selected-label', 'text-anchor': anchor
      }, label));
    }

    addSelectedMark(selected, name, false);
    if (peer) addSelectedMark(peer, peerName, true);

    el.relationshipScatter.append(grid, axes, marks, labels);

    addLegendItem('points', 'Eligible NSW LGAs');
    addLegendItem('trend', 'Statewide trend');
    addLegendItem('primary', name);
    if (peer) addLegendItem('secondary', peerName);

    addFocusMetric(name, A.currency(selected.median_weekly_rent) + '/wk',
      A.percentage(selected.population_growth_pct) + ' population growth · ' + A.count(selected.bond_count) + ' bonds', 'primary');
    if (peer) {
      addFocusMetric(peerName, A.currency(peer.median_weekly_rent) + '/wk',
        A.percentage(peer.population_growth_pct) + ' population growth · ' + A.count(peer.bond_count) + ' bonds', 'secondary');
    } else {
      addFocusMetric('NSW ' + type + ' median', A.currency(stats.stateMedian) + '/wk',
        'Median across ' + rows.length + ' eligible LGAs for this dwelling type', 'reference');
    }
    addFocusMetric('Statewide relationship', 'r = ' + stats.correlation.toFixed(2),
      stats.normalisedSlope.toFixed(2) + '% normalised slope · p ' + formatP(stats.p), stats.p < 0.05 ? 'significant' : 'weak');

    el.relationshipFocus.hidden = false;
  }

  function commonTypes(codeA, codeB) {
    var typesB = new Set(data.dwellingTypesFor(codeB));
    return data.dwellingTypesFor(codeA).filter(function (type) { return typesB.has(type); });
  }

  function comparisonName() {
    return sel.mode === 'lga' && sel.compareLga ? data.nameForLga(sel.compareLga) : 'NSW median';
  }

  function comparisonDataset(rows, name) {
    if (sel.mode === 'median') {
      return rows.map(function (r) {
        return {
          type: r.dwelling_type,
          subjectValue: r.median_weekly_rent,
          referenceValue: data.stateMedianRent(r.dwelling_type),
          subjectBonds: r.bond_count,
          referenceBonds: null
        };
      });
    }
    return rows.map(function (r) {
      var peer = data.rowFor(sel.compareLga, r.dwelling_type);
      return peer ? {
        type: r.dwelling_type,
        subjectValue: r.median_weekly_rent,
        referenceValue: peer.median_weekly_rent,
        subjectBonds: r.bond_count,
        referenceBonds: peer.bond_count
      } : null;
    }).filter(Boolean);
  }

  function setSelectPlaceholder(select, text) {
    select.replaceChildren(new Option(text, ''));
    select.value = '';
  }

  function applyModeUI() {
    var active = sel.mode === 'median' || sel.mode === 'lga';
    el.lgaField.hidden = !active;
    el.dwellingField.hidden = !active;
    el.compareLgaField.hidden = sel.mode !== 'lga';
    el.compareActions.hidden = !active;

    if (!active) {
      sel.lga = '';
      sel.compareLga = '';
      sel.dwelling = '';
      el.lga.value = '';
      setSelectPlaceholder(el.compareLga, 'Choose the first LGA first');
      el.compareLga.disabled = true;
      setSelectPlaceholder(el.dwelling, 'Choose an LGA first');
      el.dwelling.disabled = true;
      hideSelectedArea('success', 'Statewide evidence ready', 'Choose a comparison type to begin.');
    }
  }

  function populateMedianDwelling(preferred) {
    var types = data.dwellingTypesFor(sel.lga);
    var matched = A.fillSelect(
      el.dwelling,
      'Choose dwelling type',
      types.map(function (type) { return { value: type, label: type }; }),
      preferred || ''
    );
    el.dwelling.disabled = false;
    sel.dwelling = matched ? el.dwelling.value : '';
  }

  function populateSecondLga(preferred) {
    if (!sel.lga) {
      sel.compareLga = '';
      setSelectPlaceholder(el.compareLga, 'Choose the first LGA first');
      el.compareLga.disabled = true;
      return;
    }

    var options = data.lgaOptions.filter(function (entry) {
      return entry[0] !== sel.lga && commonTypes(sel.lga, entry[0]).length > 0;
    });
    var matched = A.fillSelect(
      el.compareLga,
      'Choose second LGA',
      options.map(function (entry) { return { value: entry[0], label: entry[1] }; }),
      preferred || ''
    );
    el.compareLga.disabled = false;
    sel.compareLga = matched ? el.compareLga.value : '';
  }

  function populateSharedDwelling(preferred) {
    if (!sel.lga || !sel.compareLga) {
      sel.dwelling = '';
      setSelectPlaceholder(el.dwelling, 'Choose both LGAs first');
      el.dwelling.disabled = true;
      return;
    }
    var types = commonTypes(sel.lga, sel.compareLga);
    var matched = A.fillSelect(
      el.dwelling,
      'Choose shared dwelling type',
      types.map(function (type) { return { value: type, label: type }; }),
      preferred || ''
    );
    el.dwelling.disabled = false;
    sel.dwelling = matched ? el.dwelling.value : '';
  }

  function selectPrimary(codeValue, wantedDwelling) {
    sel.lga = codeValue || '';
    sel.compareLga = '';
    sel.dwelling = '';

    if (!sel.lga) {
      el.lga.value = '';
      if (sel.mode === 'lga') {
        populateSecondLga('');
        populateSharedDwelling('');
      } else {
        setSelectPlaceholder(el.dwelling, 'Choose an LGA first');
        el.dwelling.disabled = true;
      }
      hideSelectedArea('success', 'Statewide evidence ready', 'Choose the first LGA.');
      return;
    }

    if (!data.hasLga(sel.lga)) {
      sel.lga = '';
      el.lga.value = '';
      hideSelectedArea('empty', 'Area not found', 'It may sit below the 30-bond dwelling-type threshold.');
      return;
    }

    el.lga.value = sel.lga;
    if (sel.mode === 'median') {
      populateMedianDwelling(wantedDwelling);
      if (sel.dwelling) {
        renderSelectedArea();
      } else {
        hideSelectedArea('success', 'LGA selected', 'Choose a dwelling type to place ' + data.nameForLga(sel.lga) + ' on the statewide population growth–rent relationship.');
      }
      return;
    }

    populateSecondLga('');
    populateSharedDwelling('');
    hideSelectedArea('success', 'First LGA selected', 'Choose the second LGA to continue.');
  }

  function selectSecond(codeValue, wantedDwelling) {
    sel.compareLga = codeValue || '';
    sel.dwelling = '';
    if (!sel.compareLga) {
      populateSharedDwelling('');
      hideSelectedArea('success', 'First LGA selected', 'Choose the second LGA to continue.');
      return;
    }
    populateSharedDwelling(wantedDwelling);
    if (sel.dwelling) {
      renderSelectedArea();
    } else {
      hideSelectedArea('success', 'Two LGAs selected', 'Choose a shared dwelling type to compare their position in the statewide population growth–rent relationship.');
    }
  }

  function headlineForMedian(name, areaRows, rows) {
    el.headline.replaceChildren();
    if (sel.dwelling) {
      var row = rows[0];
      var nsw = data.stateMedianRent(row.dwelling_type);
      var cmp = A.compareToMedian(row.median_weekly_rent, nsw);
      el.headline.append(document.createTextNode(row.dwelling_type + ' rent here is '));
      el.headline.append(A.el('b', null, cmp.direction === 'same'
        ? 'the same as the NSW median'
        : A.currency(Math.abs(cmp.difference)) + ' a week ' + cmp.word + ' the NSW median'));
      el.headline.append(document.createTextNode(
        ' — ' + A.currency(row.median_weekly_rent) + ' against ' + A.currency(nsw)
        + ', across ' + data.rowsForDwelling(row.dwelling_type).length + ' areas.'));
    } else {
      var above = areaRows.filter(function (r) {
        return A.compareToMedian(r.median_weekly_rent, data.stateMedianRent(r.dwelling_type)).direction === 'above';
      }).length;
      el.headline.append(A.el('b', null, above + ' of ' + areaRows.length));
      el.headline.append(document.createTextNode(
        ' available dwelling ' + A.plural(areaRows.length, 'type')
        + ' rent above the NSW median for the same type.'));
    }
  }

  function headlineForLga(name, peerName, rows) {
    el.headline.replaceChildren();
    if (sel.dwelling) {
      var row = rows[0];
      var peer = data.rowFor(sel.compareLga, row.dwelling_type);
      var cmp = A.compareToMedian(row.median_weekly_rent, peer.median_weekly_rent);
      el.headline.append(document.createTextNode(row.dwelling_type + ' rent in ' + name + ' is '));
      el.headline.append(A.el('b', null, cmp.direction === 'same'
        ? 'the same as ' + peerName
        : A.currency(Math.abs(cmp.difference)) + ' a week ' + cmp.word + ' ' + peerName));
      el.headline.append(document.createTextNode(
        ' — ' + A.currency(row.median_weekly_rent) + ' against ' + A.currency(peer.median_weekly_rent) + '.'));
    } else {
      var above = 0;
      rows.forEach(function (row) {
        var peer = data.rowFor(sel.compareLga, row.dwelling_type);
        if (peer && row.median_weekly_rent > peer.median_weekly_rent) above += 1;
      });
      el.headline.append(A.el('b', null, above + ' of ' + rows.length));
      el.headline.append(document.createTextNode(
        ' shared dwelling ' + A.plural(rows.length, 'type')
        + ' rent above ' + peerName + '.'));
    }
  }

  function setChartCopy(name, refName, lgaMode) {
    el.subjectEyebrow.textContent = lgaMode ? 'Selected LGA comparison' : 'Selected area';
    el.chartEyebrow.textContent = lgaMode ? 'LGA vs LGA' : 'Selected area against NSW';
    el.chartHeading.textContent = lgaMode ? name + ' vs ' + refName : 'Rent comparison by dwelling type';
    el.chartLede.textContent = lgaMode
      ? 'Each pair compares shared dwelling types across the two selected LGAs.'
      : 'Each pair compares the selected LGA with the median across all eligible NSW LGAs for the same dwelling type.';
    el.keySubject.textContent = name;
    el.keyReference.textContent = refName;
    el.tableColSubject.textContent = name;
    el.tableColReference.textContent = refName;
    el.tableColBonds.textContent = lgaMode ? 'Bonds (selected / comparison)' : 'Bonds';
    el.valuesSummary.textContent = lgaMode ? 'View exact LGA vs LGA values' : 'View exact selected-area values';
  }

  function renderSelectedArea() {
    var areaRows = data.rowsForLga(sel.lga);
    var name = areaRows[0].lga_name;
    if (!sel.dwelling) {
      hideSelectedArea('success', 'Choose a dwelling type', 'The relationship view compares population growth with rent within one dwelling market at a time.');
      return;
    }
    var rows = sel.dwelling
      ? areaRows.filter(function (r) { return r.dwelling_type === sel.dwelling; })
      : areaRows.slice();

    if (sel.mode === 'lga') {
      if (!sel.compareLga) {
        hideSelectedArea('success', 'Statewide evidence ready', 'Choose another area to compare with ' + name + '.');
        return;
      }
      var peerName = data.nameForLga(sel.compareLga);
      rows = rows.filter(function (r) { return Boolean(data.rowFor(sel.compareLga, r.dwelling_type)); });
      if (!rows.length) {
        hideSelectedArea('empty', 'No shared record', name + ' and ' + peerName + ' do not share the selected dwelling type.');
        return;
      }
      el.subject.hidden = false;
      el.chartSection.hidden = false;
      el.contextSection.hidden = false;
      if (el.downloadPdf) el.downloadPdf.disabled = false;
      el.name.textContent = name;
      headlineForLga(name, peerName, rows);
      setChartCopy(name, peerName, true);
      renderRelationshipFocus(name, peerName);
      var growth = areaRows[0].population_growth_pct;
      var peerGrowth = data.rowsForLga(sel.compareLga)[0].population_growth_pct;
      var growthCmp = A.compareToMedian(growth, peerGrowth);
      el.context.textContent = name + ' recorded ' + A.percentage(growth)
        + ' population change between 2021 and 2025, while ' + peerName + ' recorded ' + A.percentage(peerGrowth) + '. '
        + (growthCmp.direction === 'same'
          ? 'The two areas changed by the same amount.'
          : name + ' was ' + Math.abs(growth - peerGrowth).toFixed(1) + ' percentage points '
            + growthCmp.word + ' ' + peerName + '.');
      var pairs = comparisonDataset(rows, name);
      renderChart(pairs, name, peerName);
      renderTable(pairs, true);
      el.tableCaption.textContent = 'Median weekly rent in 2025 for ' + name + ' beside ' + peerName + ' for each shared dwelling type.';
      el.chartAlt.textContent = name + ' compared with ' + peerName + ' by dwelling type.';
      status.set('success', 'Showing LGA comparison', name + ' against ' + peerName + '.');
      A.commit('analysis.html', { lga: sel.lga, dwelling: sel.dwelling });
      return;
    }

    if (!rows.length) {
      hideSelectedArea('empty', 'No record', 'No checked record for that combination.');
      return;
    }

    el.subject.hidden = false;
    el.chartSection.hidden = false;
    el.contextSection.hidden = false;
    if (el.downloadPdf) el.downloadPdf.disabled = false;
    el.name.textContent = name;
    headlineForMedian(name, areaRows, rows);
    setChartCopy(name, 'NSW median', false);
    renderRelationshipFocus(name, 'NSW median');

    var growthMedian = areaRows[0].population_growth_pct;
    var g = A.compareToMedian(growthMedian, data.stateGrowthMedian);
    el.context.textContent = name + ' recorded ' + A.percentage(growthMedian)
      + ' population change between 2021 and 2025, '
      + (g.direction === 'same'
        ? 'the same as the median across the 121 threshold-eligible NSW areas.'
        : Math.abs(growthMedian - data.stateGrowthMedian).toFixed(1) + ' percentage points '
          + g.direction + ' the 121-area median of ' + A.percentage(data.stateGrowthMedian) + '.');

    var medianPairs = comparisonDataset(rows, name);
    renderChart(medianPairs, name, 'NSW median');
    renderTable(medianPairs, false);
    el.tableCaption.textContent = 'Median weekly rent in 2025 for ' + name
      + ', beside the median across all NSW areas holding a checked record for the same type.';
    el.chartAlt.textContent = name + ' compared with NSW median by dwelling type.';
    status.set('success', 'Showing local comparison', name + ' against NSW medians.');
    A.commit('analysis.html', { lga: sel.lga, dwelling: sel.dwelling });
  }

  function renderChart(pairs, subjectName, referenceName) {
    if (chart) { chart.destroy(); chart = null; }
    el.chartSection.dataset.single = String(pairs.length === 1);

    var labels = pairs.map(function (r) { return r.type; });
    var mine = pairs.map(function (r) { return r.subjectValue; });
    var ref = pairs.map(function (r) { return r.referenceValue; });

    if (window.Chart) {
      chart = new Chart(el.canvas, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            { label: subjectName, data: mine, backgroundColor: '#5b6fdd', borderWidth: 0, borderRadius: 8, barPercentage: 0.82, categoryPercentage: 0.7 },
            { label: referenceName, data: ref, backgroundColor: '#97a2b6', borderWidth: 0, borderRadius: 8, barPercentage: 0.82, categoryPercentage: 0.7 }
          ]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 0 },
          interaction: { mode: 'index', intersect: false },
          layout: { padding: { right: 8 } },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: K.ink,
              padding: 10,
              callbacks: {
                label: function (c) { return c.dataset.label + ': ' + A.currency(c.raw) + ' a week'; },
                afterBody: function (items) {
                  var i = items[0] ? items[0].dataIndex : -1;
                  if (i < 0) return '';
                  var cmp = A.compareToMedian(mine[i], ref[i]);
                  return cmp.direction === 'same'
                    ? 'Same as comparison'
                    : A.currency(Math.abs(cmp.difference)) + ' a week ' + cmp.word + ' the comparison value';
                }
              }
            }
          },
          scales: {
            x: {
              beginAtZero: true,
              ticks: { callback: function (v) { return '$' + v; }, color: '#6e7c92' },
              title: { display: true, text: 'Median weekly rent, 2025 (AUD)', color: '#728096' },
              grid: { color: '#e7ebf2' },
              border: { display: false }
            },
            y: {
              ticks: { color: '#546278' },
              grid: { display: false },
              border: { display: false }
            }
          }
        }
      });
    }
  }

  function renderTable(pairs, lgaMode) {
    el.table.replaceChildren();
    pairs.forEach(function (pair) {
      var cmp = A.compareToMedian(pair.subjectValue, pair.referenceValue);
      var tr = document.createElement('tr');
      var th = document.createElement('th');
      th.scope = 'row';
      th.textContent = pair.type;
      tr.append(th);
      [A.currency(pair.subjectValue), A.currency(pair.referenceValue),
        cmp.direction === 'same' ? '$0'
          : (cmp.difference > 0 ? '+' : '−') + A.currency(Math.abs(cmp.difference))]
        .forEach(function (v) { tr.append(A.el('td', 'num', v)); });

      tr.append(A.el('td', 'dir-' + cmp.direction,
        cmp.direction === 'same' ? 'Same'
          : cmp.direction === 'above' ? 'Above' : 'Below'));
      tr.append(A.el('td', 'num', lgaMode
        ? A.count(pair.subjectBonds) + ' / ' + A.count(pair.referenceBonds)
        : A.count(pair.subjectBonds)));
      el.table.append(tr);
    });
  }

  function downloadComparisonPdf() {
    var P = window.ATLAS_PDF;
    if (!sel.lga || !data) return;
    if (!P || !P.available()) {
      window.alert('The PDF exporter could not load. Check your internet connection and try again.');
      return;
    }

    var areaRows = data.rowsForLga(sel.lga);
    var name = areaRows[0].lga_name;
    var rows = sel.dwelling
      ? areaRows.filter(function (r) { return r.dwelling_type === sel.dwelling; })
      : areaRows.slice();
    var referenceName = sel.mode === 'lga' ? data.nameForLga(sel.compareLga) : 'NSW median';

    if (sel.mode === 'lga') {
      if (!sel.compareLga) return;
      rows = rows.filter(function (r) { return Boolean(data.rowFor(sel.compareLga, r.dwelling_type)); });
    }
    if (!rows.length) return;

    var doc = P.create();
    var y = P.header(doc, sel.mode === 'lga' ? 'LGA versus LGA comparison' : 'Selected area comparison');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(24, 35, 58);
    doc.text(sel.mode === 'lga' ? name + ' vs ' + referenceName : name, 16, y);
    y += 9;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(93, 108, 134);

    var growth = areaRows[0].population_growth_pct;
    var introText;
    if (sel.mode === 'lga') {
      var peerGrowth = data.rowsForLga(sel.compareLga)[0].population_growth_pct;
      introText = name + ' population change, 2021-2025: ' + A.percentage(growth) + '. '
        + referenceName + ': ' + A.percentage(peerGrowth) + '.';
    } else {
      var growthCmp = A.compareToMedian(growth, data.stateGrowthMedian);
      introText = 'Population change, 2021-2025: ' + A.percentage(growth) + '. ';
      introText += growthCmp.direction === 'same'
        ? 'This matches the eligible-LGA median.'
        : Math.abs(growth - data.stateGrowthMedian).toFixed(1) + ' percentage points ' + growthCmp.direction
          + ' the eligible-LGA median of ' + A.percentage(data.stateGrowthMedian) + '.';
    }
    y = P.wrappedText(doc, introText, 16, y, 178, 5);
    y += 8;

    var pairs = comparisonDataset(rows, name);
    y = P.sectionTitle(doc, sel.dwelling ? sel.dwelling + ' rent comparison' : 'Rent comparison by dwelling type', y);
    y = P.table(doc, {
      y: y,
      headers: sel.mode === 'lga'
        ? ['Dwelling type', name, referenceName, 'Difference', 'Bonds']
        : ['Dwelling type', name, 'NSW median', 'Difference', 'Bonds'],
      widths: [54, 32, 32, 28, 34],
      aligns: ['left', 'right', 'right', 'right', 'right'],
      rows: pairs.map(function (pair) {
        var cmp = A.compareToMedian(pair.subjectValue, pair.referenceValue);
        var diff = cmp.direction === 'same' ? '$0'
          : (cmp.difference > 0 ? '+' : '-') + A.currency(Math.abs(cmp.difference));
        return {
          cells: [
            pair.type,
            A.currency(pair.subjectValue),
            A.currency(pair.referenceValue),
            diff,
            sel.mode === 'lga' ? A.count(pair.subjectBonds) + ' / ' + A.count(pair.referenceBonds) : A.count(pair.subjectBonds)
          ]
        };
      })
    });

    y += 12;
    y = P.sectionTitle(doc, 'Statewide relationship context', y);
    var stats = sel.dwelling ? [relationshipStats(sel.dwelling)] : A.CONFIG.dwellingOrder.map(relationshipStats);
    y = P.table(doc, {
      y: y,
      headers: ['Dwelling type', 'Normalised slope', 'Correlation', 'Result'],
      widths: [68, 42, 34, 34],
      aligns: ['left', 'right', 'right', 'right'],
      rows: stats.map(function (s) {
        return { cells: [s.type, s.normalisedSlope.toFixed(2) + '%', 'r = ' + s.correlation.toFixed(2), s.p < 0.05 ? 'Significant' : 'Not significant'] };
      })
    });

    y += 12;
    y = P.callout(doc, 'Interpretation note',
      'The analysis is bivariate and describes association, not causation. Housing supply, income, vacancy, transport access and planning controls are not held constant.', y);

    P.footer(doc, sel.mode === 'lga'
      ? 'NSW Rent Atlas - LGA versus LGA comparison.'
      : 'NSW Rent Atlas - selected area comparison against NSW medians.');
    doc.save(sel.mode === 'lga'
      ? P.safeFileName(name) + '-vs-' + P.safeFileName(referenceName) + '-rent-comparison.pdf'
      : P.safeFileName(name) + (sel.dwelling ? '-' + P.safeFileName(sel.dwelling) : '') + '-nsw-rent-comparison.pdf');
  }

  A.loadDataset({
    onStart: function () { status.set('loading', 'Loading', 'Requesting the checked dataset.'); },

    onSuccess: function (dataset) {
      data = dataset;
      renderRelationships();
      A.fillSelect(el.lga, 'Select first LGA',
        dataset.lgaOptions.map(function (entry) { return { value: entry[0], label: entry[1] }; }), '');

      var restored = A.initialSelection();
      if (restored.lga) {
        sel.mode = 'median';
        el.compareMode.value = 'median';
        applyModeUI();
        selectPrimary(restored.lga, restored.dwelling);
      } else {
        sel.mode = '';
        el.compareMode.value = '';
        applyModeUI();
      }
    },

    onEmpty: function (message) {
      status.set('empty', 'No data', message);
      el.compareMode.disabled = true;
      el.lga.replaceChildren(new Option('No areas available', ''));
      el.lga.disabled = true;
    },

    onError: function (message) {
      status.set('error', 'Error', message);
      el.compareMode.disabled = true;
      el.lga.replaceChildren(new Option('Unavailable', ''));
      el.lga.disabled = true;
      el.dwelling.disabled = true;
      el.compareLga.disabled = true;
    }
  });

  el.compareMode.addEventListener('change', function () {
    sel.mode = el.compareMode.value;
    sel.lga = '';
    sel.compareLga = '';
    sel.dwelling = '';
    el.lga.value = '';
    setSelectPlaceholder(el.compareLga, 'Choose the first LGA first');
    el.compareLga.disabled = true;
    setSelectPlaceholder(el.dwelling, sel.mode === 'lga' ? 'Choose both LGAs first' : 'Choose an LGA first');
    el.dwelling.disabled = true;
    applyModeUI();
    if (sel.mode) {
      hideSelectedArea(
        'success',
        'Comparison type selected',
        sel.mode === 'lga'
          ? 'Choose the first and second LGAs.'
          : 'Choose an LGA to compare with the NSW median.'
      );
      el.lga.focus();
    }
  });

  el.lga.addEventListener('change', function () {
    selectPrimary(el.lga.value, '');
  });

  el.compareLga.addEventListener('change', function () {
    selectSecond(el.compareLga.value, '');
  });

  el.dwelling.addEventListener('change', function () {
    sel.dwelling = el.dwelling.value;
    renderSelectedArea();
  });

  if (el.downloadPdf) el.downloadPdf.addEventListener('click', downloadComparisonPdf);

  el.reset.addEventListener('click', function () {
    sel.mode = '';
    sel.lga = '';
    sel.compareLga = '';
    sel.dwelling = '';
    el.compareMode.value = '';
    el.lga.value = '';
    applyModeUI();
    el.compareMode.focus();
  });
}());
