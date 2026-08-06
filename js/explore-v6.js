/* ==========================================================================
   explore.js — the Explore workspace

   The selected area is the subject: it is the only ochre thing on the map, in
   the rent bars and in the primary figure. Everything else is neutral.

   LGA-first workflow, dwelling availability, the 30-bond threshold, the ABS
   endpoint and the lga_code join are all carried over unchanged.
   ========================================================================== */
(function () {
  'use strict';

  var A = window.ATLAS;
  var C = A.CONFIG;
  var K = A.COLOUR;

  var el = {
    lga: document.getElementById('lga'),
    lgaHint: document.getElementById('lga-hint'),
    dwelling: document.getElementById('dwelling'),
    dwellingHint: document.getElementById('dwelling-hint'),
    reset: document.getElementById('reset'),
    downloadPdf: document.getElementById('download-pdf'),
    status: document.getElementById('status'),
    subject: document.getElementById('subject'),
    prompt: document.getElementById('prompt'),
    name: document.getElementById('subject-name'),
    rent: document.getElementById('rent'),
    rentCaption: document.getElementById('rent-caption'),
    verdict: document.getElementById('verdict'),
    bonds: document.getElementById('bonds'),
    growth: document.getElementById('growth'),
    bars: document.getElementById('bars'),
    legend: document.getElementById('legend'),
    flag: document.getElementById('map-flag')
  };

  var status = A.createStatus(el.status);

  var data = null;
  var sel = { lga: '', dwelling: '' };
  var map = null, geo = null, layer = null, attempts = 0;
  var byCode = new Map();
  var selectedMapColour = '#70b991';

  function flag(text, strong) {
    el.flag.innerHTML = '';
    if (strong) el.flag.append(A.el('b', null, strong + ' '));
    el.flag.append(document.createTextNode(text));
  }

  /* ---------------------------------------------------------------------
     Selection — one path for the menu, the map and a restored query string
     --------------------------------------------------------------------- */
  function select(code, wantedDwelling) {
    sel.lga = code || '';

    if (!sel.lga) {
      sel.dwelling = '';
      el.lga.value = '';
      el.dwelling.replaceChildren(new Option('Choose an area first', ''));
      el.dwelling.disabled = true;
      el.dwellingHint.textContent = 'Only types with 30 or more bonds appear.';
      el.subject.hidden = true;
      el.prompt.hidden = false;
      if (el.downloadPdf) el.downloadPdf.disabled = true;
      status.set('idle', 'Ready', 'Choose an area to begin.');
      paintMap();
      A.commit('index.html', sel);
      return;
    }

    if (!data.hasLga(sel.lga)) {
      sel.lga = ''; sel.dwelling = '';
      el.lga.value = '';
      el.subject.hidden = true;
      el.prompt.hidden = false;
      if (el.downloadPdf) el.downloadPdf.disabled = true;
      status.set('empty', 'Not found', 'That area is not in the dataset. It may sit below the 30-bond threshold.');
      A.commit('index.html', sel);
      return;
    }

    el.lga.value = sel.lga;

    var types = data.dwellingTypesFor(sel.lga);
    var wanted = wantedDwelling || sel.dwelling;
    /* One available type is not a choice, so make it for them. */
    if (!wanted && types.length === 1) wanted = types[0];

    var matched = A.fillSelect(
      el.dwelling,
      types.length === 1 ? 'The one available type' : 'Select a dwelling type',
      types.map(function (t) { return { value: t, label: t }; }),
      wanted
    );
    el.dwelling.disabled = false;
    el.dwellingHint.textContent = types.length + ' ' + A.plural(types.length, 'type')
      + ' above the threshold here.';
    sel.dwelling = matched ? el.dwelling.value : '';

    if (sel.dwelling) {
      render();
    } else {
      el.subject.hidden = true;
      el.prompt.hidden = false;
      if (el.downloadPdf) el.downloadPdf.disabled = true;
      status.set('idle', 'Step 02',
        data.nameForLga(sel.lga) + ' holds ' + types.length + ' '
        + A.plural(types.length, 'dwelling type') + '. Pick one.');
      paintMap();
      frame();
      el.dwelling.focus();
    }
    A.commit('index.html', sel);
  }

  /* ---------------------------------------------------------------------
     Render the subject
     --------------------------------------------------------------------- */
  function render() {
    var row = data.rowFor(sel.lga, sel.dwelling);
    if (!row) {
      el.subject.hidden = true;
      el.prompt.hidden = false;
      if (el.downloadPdf) el.downloadPdf.disabled = true;
      status.set('empty', 'No record',
        'No checked ' + sel.dwelling.toLowerCase() + ' record for this area.');
      return;
    }

    el.prompt.hidden = true;
    el.subject.hidden = false;
    if (el.downloadPdf) el.downloadPdf.disabled = false;

    el.name.textContent = row.lga_name;
    el.rent.textContent = A.currency(row.median_weekly_rent);
    el.rentCaption.textContent = 'median weekly ' + row.dwelling_type.toLowerCase() + ' rent, 2025';
    el.bonds.textContent = A.count(row.bond_count);
    el.growth.textContent = A.percentage(row.population_growth_pct);

    var nsw = data.stateMedianRent(row.dwelling_type);
    var cmp = A.compareToMedian(row.median_weekly_rent, nsw);
    var peers = data.rowsForDwelling(row.dwelling_type).length;

    el.verdict.textContent = cmp.direction === 'same'
      ? 'The same as the NSW median of ' + A.currency(nsw) + ' a week, across ' + peers + ' areas.'
      : A.currency(Math.abs(cmp.difference)) + ' a week ' + cmp.word
        + ' the NSW median of ' + A.currency(nsw) + ', across ' + peers + ' areas.';

    renderBars();
    paintMap();
    frame();
    A.commit('index.html', sel);

    status.set('success', 'Showing', row.dwelling_type + ' in ' + row.lga_name + '.');
  }

  function renderBars() {
    var rows = data.rowsForLga(sel.lga);
    el.bars.replaceChildren();
    if (!rows.length) return;

    var max = rows.reduce(function (m, r) { return Math.max(m, r.median_weekly_rent); }, 0) || 1;

    rows.forEach(function (r) {
      var current = r.dwelling_type === sel.dwelling;
      var li = A.el('li', 'bar');
      li.dataset.current = String(current);
      li.setAttribute('aria-label',
        r.dwelling_type + ': ' + A.currency(r.median_weekly_rent) + ' a week'
        + (current ? ', selected' : ''));

      li.append(A.el('span', 'bar-label', r.dwelling_type));
      li.append(A.el('span', 'bar-value', A.currency(r.median_weekly_rent)));

      var track = A.el('span', 'bar-track');
      var fill = A.el('span', 'bar-fill');
      fill.style.width = Math.max(3, (r.median_weekly_rent / max) * 100) + '%';
      track.append(fill);
      li.append(track);

      el.bars.append(li);
    });
  }

  /* ---------------------------------------------------------------------
     Boundaries — endpoint, layer, where clause and join all unchanged
     --------------------------------------------------------------------- */
  function url(fallback) {
    return C.boundaryEndpoint + '?' + new URLSearchParams({
      where: fallback ? '1=1' : "STATE_CODE_2021 = '1'",
      outFields: 'LGA_CODE_2025,LGA_NAME_2025,STATE_CODE_2021',
      returnGeometry: 'true',
      outSR: '4326',
      resultRecordCount: '2000',
      f: 'geojson'
    }).toString();
  }

  function code(feature) {
    var p = feature && feature.properties;
    return String((p ? p[C.boundaryCodeField] : '') || '').trim();
  }

  function request(fallback) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var out = false;
    var t = window.setTimeout(function () { out = true; if (ctl) ctl.abort(); }, C.boundaryTimeoutMs);

    return fetch(url(fallback), {
      headers: { Accept: 'application/geo+json, application/json' },
      signal: ctl ? ctl.signal : undefined
    })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (p) {
        window.clearTimeout(t);
        /* ArcGIS answers 200 with an error envelope when a field name is
           wrong, which reads as valid JSON but holds no features. */
        if (p && p.error) throw new Error('ABS service error ' + p.error.code);
        if (!p || !Array.isArray(p.features) || !p.features.length) throw new Error('No areas returned.');
        return p;
      })
      .catch(function (e) {
        window.clearTimeout(t);
        throw out ? new Error('The boundary request timed out.') : e;
      });
  }

  function loadBoundaries() {
    attempts += 1;
    flag('Loading boundaries');

    request(false)
      .catch(function (first) {
        console.warn('ABS primary boundary request failed:', first.message);
        /* Same endpoint and layer, state filter dropped, then narrowed back to
           the NSW 1xxxx code range client-side. */
        return request(true).then(function (p) {
          p.features = p.features.filter(function (f) {
            var c = code(f);
            return c.length === 5 && c.charAt(0) === '1';
          });
          if (!p.features.length) throw first;
          return p;
        });
      })
      .then(function (payload) {
        geo = payload;
        addLayer();
        var matched = payload.features.filter(function (f) { return data.hasLga(code(f)); }).length;
        if (!matched) { flag('areas matched the dataset', 'No'); return; }
        flag('of ' + data.lgaCount + ' areas mapped', String(matched));
      })
      .catch(function (e) {
        console.error('ABS boundary request failed:', e);
        flag('Map unavailable — figures unaffected');
      });
  }

  function ensureMap() {
    if (map || !window.L) return;
    map = window.L.map('map', { zoomControl: true, keyboard: true, attributionControl: true })
      .setView([-32.6, 147], 6);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap · Boundaries ABS ASGS 2025'
    }).addTo(map);
    if (geo) addLayer();
    window.setTimeout(function () { if (map) map.invalidateSize(); }, 0);
  }

  function addLayer() {
    if (!map || !geo || layer) return;
    byCode.clear();
    layer = window.L.geoJSON(geo, {
      style: style,
      onEachFeature: function (feature, lyr) {
        var c = code(feature);
        byCode.set(c, lyr);
        lyr.bindTooltip(function () { return tip(feature); }, { sticky: true, direction: 'top' });
        lyr.on({
          mouseover: function () { if (c !== sel.lga) lyr.setStyle({ weight: 1.6, color: K.ink }); },
          mouseout: function () { lyr.setStyle(style(feature)); },
          click: function () { if (data.hasLga(c)) select(c, sel.dwelling); }
        });
      }
    }).addTo(map);
    paintMap();
    frame();
  }

  function rentFor(c) {
    if (!sel.dwelling) return NaN;
    var r = data.rowFor(c, sel.dwelling);
    return r ? r.median_weekly_rent : NaN;
  }

  function shade(v) {
    if (!Number.isFinite(v) || !sel.dwelling) return K.mapNone;
    var b = data.rentBreaks(sel.dwelling);
    if (v <= b.q1) return K.mapRamp[0];
    if (v <= b.q2) return K.mapRamp[1];
    if (v <= b.q3) return K.mapRamp[2];
    return K.mapRamp[3];
  }

  /* The selected area is filled ochre rather than shaded, so it reads as a
     different kind of thing from its neighbours instead of a darker one. The
     panel carries its exact figure, so no value is lost. */
  function style(feature) {
    var c = code(feature);
    var v = rentFor(c);
    var chosen = c === sel.lga;
    return {
      color: chosen ? K.ink : '#ffffff',
      weight: chosen ? 2.4 : 0.7,
      fillColor: chosen ? selectedMapColour : shade(v),
      fillOpacity: chosen ? 0.95 : (Number.isFinite(v) ? 0.8 : 0.28)
    };
  }

  function tip(feature) {
    var c = code(feature);
    var name = (feature.properties && feature.properties[C.boundaryNameField]) || 'Unnamed area';
    var v = rentFor(c);
    if (Number.isFinite(v)) return '<strong>' + name + '</strong><br>' + A.currency(v) + ' a week';
    if (!sel.dwelling) return '<strong>' + name + '</strong><br>Pick a dwelling type';
    return '<strong>' + name + '</strong><br>No checked record';
  }

  function paintMap() {
    renderLegend();
    if (!layer) return;
    layer.eachLayer(function (lyr) {
      lyr.setStyle(style(lyr.feature));
      lyr.setTooltipContent(tip(lyr.feature));
      if (code(lyr.feature) === sel.lga && lyr.bringToFront) lyr.bringToFront();
    });
  }

  function renderLegend() {
    el.legend.replaceChildren();
    if (!sel.dwelling) {
      el.legend.append(A.el('li', null, 'Pick a dwelling type to shade the map.'));
      return;
    }
    var b = data.rentBreaks(sel.dwelling);
    var entries = [
      [K.mapRamp[0], 'Up to ' + A.currency(b.q1)],
      [K.mapRamp[1], A.currency(b.q1) + ' – ' + A.currency(b.q2)],
      [K.mapRamp[2], A.currency(b.q2) + ' – ' + A.currency(b.q3)],
      [K.mapRamp[3], 'Over ' + A.currency(b.q3)],
      [K.mapNone, 'No checked record'],
      [selectedMapColour, 'Selected area']
    ];
    entries.forEach(function (e) {
      var li = A.el('li');
      var sw = A.el('i', 'swatch');
      sw.style.background = e[0];
      li.append(sw, A.el('span', null, e[1]));
      el.legend.append(li);
    });
  }

  function frame() {
    if (!map || !sel.lga) return;
    var lyr = byCode.get(sel.lga);
    if (!lyr || !lyr.getBounds) return;
    var b = lyr.getBounds();
    if (b && b.isValid()) map.fitBounds(b, { padding: [40, 40], maxZoom: 10 });
  }



  function downloadSelectionPdf() {
    var P = window.ATLAS_PDF;
    if (!sel.lga || !sel.dwelling || !data) return;
    if (!P || !P.available()) {
      window.alert('The PDF exporter could not load. Check your internet connection and try again.');
      return;
    }

    var row = data.rowFor(sel.lga, sel.dwelling);
    if (!row) return;
    var areaRows = data.rowsForLga(sel.lga);
    var nsw = data.stateMedianRent(row.dwelling_type);
    var cmp = A.compareToMedian(row.median_weekly_rent, nsw);
    var doc = P.create();
    var y = P.header(doc, 'Selected area report');

    doc.setTextColor(24, 35, 58);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text(row.lga_name, 16, y);
    y += 10;
    doc.setTextColor(75, 95, 211);
    doc.setFontSize(24);
    doc.text(A.currency(row.median_weekly_rent), 16, y);
    doc.setTextColor(98, 112, 137);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text('Median weekly ' + row.dwelling_type.toLowerCase() + ' rent, 2025', 55, y - 1);

    y += 13;
    doc.setFillColor(244, 247, 252);
    doc.roundedRect(16, y - 6, 178, 18, 4, 4, 'F');
    doc.setTextColor(72, 86, 112);
    doc.setFontSize(9.5);
    var verdict = cmp.direction === 'same'
      ? 'The same as the NSW median of ' + A.currency(nsw) + ' a week.'
      : A.currency(Math.abs(cmp.difference)) + ' a week ' + cmp.word + ' the NSW median of ' + A.currency(nsw) + '.';
    doc.text(verdict, 22, y + 4);

    y += 25;
    doc.setFillColor(247, 249, 252);
    doc.roundedRect(16, y, 85, 28, 4, 4, 'F');
    doc.roundedRect(109, y, 85, 28, 4, 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(104, 119, 145);
    doc.text('BONDS', 22, y + 8);
    doc.text('POPULATION CHANGE', 115, y + 8);
    doc.setFontSize(18);
    doc.setTextColor(25, 38, 61);
    doc.text(A.count(row.bond_count), 22, y + 20);
    doc.text(A.percentage(row.population_growth_pct), 115, y + 20);
    y += 39;

    y = P.sectionTitle(doc, 'Rent by dwelling type in ' + row.lga_name, y);
    y = P.table(doc, {
      y: y,
      headers: ['Dwelling type', 'Area rent', 'NSW median', 'Bonds'],
      widths: [76, 36, 40, 26],
      aligns: ['left', 'right', 'right', 'right'],
      rows: areaRows.map(function (r) {
        return {
          highlight: r.dwelling_type === row.dwelling_type,
          cells: [r.dwelling_type, A.currency(r.median_weekly_rent), A.currency(data.stateMedianRent(r.dwelling_type)), A.count(r.bond_count)]
        };
      })
    });

    y += 12;
    y = P.callout(doc, 'Interpretation note',
      'Only LGA-by-dwelling-type groups with at least 30 rental bonds are included. Population change covers 2021 to 2025. These figures provide association and context, not proof that population growth caused rent changes.', y);

    P.footer(doc, 'NSW Rent Atlas - median weekly rent is a price-based proxy for rental pressure.');
    doc.save(P.safeFileName(row.lga_name) + '-' + P.safeFileName(row.dwelling_type) + '-rent-report.pdf');
  }

  /* ---------------------------------------------------------------------
     Start
     --------------------------------------------------------------------- */
  A.loadDataset({
    onStart: function () { status.set('loading', 'Loading', 'Requesting the checked dataset.'); },

    onSuccess: function (dataset, info) {
      data = dataset;
      A.fillSelect(el.lga, 'Select an area',
        dataset.lgaOptions.map(function (e) { return { value: e[0], label: e[1] }; }), '');
      el.lgaHint.textContent = dataset.lgaCount + ' areas hold enough checked records.'
        + (info.skipped ? ' ' + info.skipped + ' incomplete rows skipped.' : '');

      ensureMap();
      status.set('idle', 'Ready', 'Choose an area to begin.');

      var restored = A.initialSelection();
      if (restored.lga) select(restored.lga, restored.dwelling);
      else { A.decorateLinks(sel); renderLegend(); }

      loadBoundaries();
    },

    onEmpty: function (m) {
      status.set('empty', 'No data', m);
      el.lga.replaceChildren(new Option('No areas available', ''));
      el.lga.disabled = true;
    },

    onError: function (m) {
      status.set('error', 'Error', m);
      el.lga.replaceChildren(new Option('Unavailable', ''));
      el.lga.disabled = true;
      el.dwelling.disabled = true;
      flag('Dataset unavailable');
    }
  });

  el.lga.addEventListener('change', function () { select(el.lga.value, sel.dwelling); });

  el.dwelling.addEventListener('change', function () {
    sel.dwelling = el.dwelling.value;
    if (!sel.dwelling) {
      el.subject.hidden = true;
      el.prompt.hidden = false;
      if (el.downloadPdf) el.downloadPdf.disabled = true;
      status.set('idle', 'Step 02', 'Pick a dwelling type.');
      paintMap();
      A.commit('index.html', sel);
      return;
    }
    render();
  });

  if (el.downloadPdf) el.downloadPdf.addEventListener('click', downloadSelectionPdf);

  el.reset.addEventListener('click', function () {
    select('', '');
    if (map) map.setView([-32.6, 147], 6);
    status.set('idle', 'Cleared', 'Choose an area to begin.');
    el.lga.focus();
  });

  el.flag.addEventListener('click', function () {
    if (!layer && attempts <= 6 && data) loadBoundaries();
  });
}());
