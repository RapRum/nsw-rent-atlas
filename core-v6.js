/* ==========================================================================
   core.js — shared foundation

   One source of truth for configuration, statistics, data loading, status
   states and the selection that travels between pages.

   The dataset, the 30-bond threshold, the ABS endpoint, the lga_code join and
   every calculation are carried over unchanged from the working dashboard.
   ========================================================================== */
(function (global) {
  'use strict';

  var CONFIG = {
    dataPath: 'data/dashboard_data.csv',
    dwellingOrder: ['Flat/Apartment', 'House', 'Unit', 'Townhouse'],
    boundaryEndpoint: 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2025/LGA/MapServer/0/query',
    boundaryCodeField: 'LGA_CODE_2025',
    boundaryNameField: 'LGA_NAME_2025',
    csvTimeoutMs: 15000,
    boundaryTimeoutMs: 20000,
    storageKey: 'nsw-atlas/selection'
  };

  /* Data colours, mirrored from tokens.css so the chart and map agree with
     the stylesheet. Ochre is always the selected area; slate is always the
     NSW reference. */
  var COLOUR = {
    subject: '#b8621f',
    subjectStrong: '#9a4f14',
    reference: '#6b7680',
    referenceWash: '#eceef0',
    mapRamp: ['#dce4e6', '#a8bcc2', '#6c8a94', '#375762'],
    mapNone: '#b5b2a9',
    ink: '#101316',
    paperLine: '#e3e1db',
    paperFg2: '#565f69'
  };

  /* ---------------------------------------------------------------------
     Formatting
     --------------------------------------------------------------------- */
  var money = new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD', maximumFractionDigits: 0
  });

  function currency(v) { return Number.isFinite(v) ? money.format(v) : '—'; }
  function percentage(v) { return Number.isFinite(v) ? v.toFixed(1) + '%' : '—'; }
  function count(v) { return Number.isFinite(v) ? v.toLocaleString('en-AU') : '—'; }
  function plural(n, one, many) { return n === 1 ? one : (many || one + 's'); }

  /* ---------------------------------------------------------------------
     Statistics — descriptive only
     --------------------------------------------------------------------- */
  function median(values) {
    var v = values.filter(Number.isFinite).sort(function (a, b) { return a - b; });
    if (!v.length) return NaN;
    var m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }

  function quantile(values, p) {
    var v = values.filter(Number.isFinite).sort(function (a, b) { return a - b; });
    if (!v.length) return NaN;
    var pos = (v.length - 1) * p;
    var lo = Math.floor(pos), hi = Math.ceil(pos);
    return lo === hi ? v[lo] : v[lo] + (v[hi] - v[lo]) * (pos - lo);
  }

  /* One rule for "above, below or at the NSW median", shared by the map, the
     chart, the headline and the table so they cannot disagree. */
  function compareToMedian(value, reference) {
    if (!Number.isFinite(value) || !Number.isFinite(reference)) {
      return { direction: 'unknown', difference: NaN, word: 'Not available' };
    }
    var d = value - reference;
    if (Math.abs(d) < 0.5) return { direction: 'same', difference: 0, word: 'the same as' };
    return {
      direction: d > 0 ? 'above' : 'below',
      difference: d,
      word: d > 0 ? 'higher than' : 'lower than'
    };
  }

  /* ---------------------------------------------------------------------
     Rows
     --------------------------------------------------------------------- */
  function parseRow(row) {
    return {
      lga_code: String(row.lga_code == null ? '' : row.lga_code).trim(),
      lga_name: String(row.lga_name == null ? '' : row.lga_name).trim(),
      dwelling_type: String(row.dwelling_type == null ? '' : row.dwelling_type).trim(),
      median_weekly_rent: Number(row.median_weekly_rent),
      bond_count: Number(row.bond_count),
      population_2025: Number(row.population_2025),
      population_growth_pct: Number(row.population_growth_pct)
    };
  }

  function validRow(r) {
    return Boolean(r.lga_code) && Boolean(r.lga_name)
      && CONFIG.dwellingOrder.indexOf(r.dwelling_type) !== -1
      && Number.isFinite(r.median_weekly_rent)
      && Number.isFinite(r.bond_count)
      && Number.isFinite(r.population_growth_pct);
  }

  /* ---------------------------------------------------------------------
     Dataset wrapper. Statewide medians and quartile breaks are memoised —
     the map restyles every polygon on each change and would otherwise re-sort
     the whole dataset once per polygon.
     --------------------------------------------------------------------- */
  function createDataset(rows) {
    var byLga = new Map(), names = new Map(), medianCache = new Map(), breakCache = new Map();

    rows.forEach(function (r) {
      if (!byLga.has(r.lga_code)) byLga.set(r.lga_code, []);
      byLga.get(r.lga_code).push(r);
      names.set(r.lga_code, r.lga_name);
    });

    byLga.forEach(function (list) {
      list.sort(function (a, b) {
        return CONFIG.dwellingOrder.indexOf(a.dwelling_type)
          - CONFIG.dwellingOrder.indexOf(b.dwelling_type);
      });
    });

    var growth = new Map();
    rows.forEach(function (r) { growth.set(r.lga_code, r.population_growth_pct); });

    return {
      rows: rows,
      lgaCount: byLga.size,
      lgaOptions: Array.from(names.entries())
        .sort(function (a, b) { return a[1].localeCompare(b[1], 'en-AU'); }),
      stateGrowthMedian: median(Array.from(growth.values())),

      hasLga: function (c) { return byLga.has(c); },
      rowsForLga: function (c) { return byLga.get(c) || []; },
      nameForLga: function (c) { return names.get(c) || ''; },
      dwellingTypesFor: function (c) {
        return (byLga.get(c) || []).map(function (r) { return r.dwelling_type; });
      },
      rowFor: function (c, d) {
        return (byLga.get(c) || []).find(function (r) { return r.dwelling_type === d; }) || null;
      },
      rowsForDwelling: function (d) {
        return rows.filter(function (r) { return r.dwelling_type === d; });
      },

      stateMedianRent: function (d) {
        if (!medianCache.has(d)) {
          medianCache.set(d, median(rows
            .filter(function (r) { return r.dwelling_type === d; })
            .map(function (r) { return r.median_weekly_rent; })));
        }
        return medianCache.get(d);
      },

      rentBreaks: function (d) {
        if (!breakCache.has(d)) {
          var v = rows.filter(function (r) { return r.dwelling_type === d; })
            .map(function (r) { return r.median_weekly_rent; });
          breakCache.set(d, { q1: quantile(v, 0.25), q2: quantile(v, 0.5), q3: quantile(v, 0.75), n: v.length });
        }
        return breakCache.get(d);
      }
    };
  }

  /* ---------------------------------------------------------------------
     Loading. Fetching before parsing keeps the HTTP status visible, so a
     missing file reads as an error rather than as an empty dataset.
     --------------------------------------------------------------------- */
  function loadDataset(o) {
    var onStart = o.onStart || function () {};
    var onSuccess = o.onSuccess || function () {};
    var onEmpty = o.onEmpty || function () {};
    var onError = o.onError || function () {};

    if (!global.Papa) {
      onError('The CSV parser did not load. Check your connection and reload.');
      return;
    }
    onStart();

    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timedOut = false;
    var timer = global.setTimeout(function () { timedOut = true; if (ctl) ctl.abort(); }, CONFIG.csvTimeoutMs);

    fetch(CONFIG.dataPath, {
      signal: ctl ? ctl.signal : undefined,
      headers: { Accept: 'text/csv, text/plain' },
      cache: 'no-cache'
    })
      .then(function (res) {
        if (!res.ok) throw new Error('The dataset request returned HTTP ' + res.status + '.');
        if ((res.headers.get('content-type') || '').toLowerCase().indexOf('text/html') !== -1) {
          throw new Error('The server returned a web page instead of the CSV. Check data/dashboard_data.csv exists.');
        }
        return res.text();
      })
      .then(function (text) {
        global.clearTimeout(timer);
        if (!text || !text.trim()) { onEmpty('The dataset file was reached but is empty.'); return; }

        var parsed = Papa.parse(text, {
          header: true, skipEmptyLines: true,
          transformHeader: function (h) { return String(h).trim(); }
        });
        var all = parsed.data.map(parseRow);
        var valid = all.filter(validRow);

        if (!valid.length) {
          onEmpty('The dataset loaded but contained no usable records.'
            + (parsed.errors.length ? ' Parser: ' + parsed.errors[0].message + '.' : ''));
          return;
        }
        onSuccess(createDataset(valid), { skipped: all.length - valid.length });
      })
      .catch(function (err) {
        global.clearTimeout(timer);
        if (timedOut) { onError('The dataset request timed out. Check the local server is running.'); return; }
        if (err && err.name === 'TypeError') {
          onError('The dataset could not be requested. Serve this folder over http://localhost rather than opening the file directly.');
          return;
        }
        onError((err && err.message) || 'The dataset request failed.');
      });
  }

  /* ---------------------------------------------------------------------
     Status. The live region keeps its child elements and only their text
     changes, so assistive technology reliably announces updates.
     --------------------------------------------------------------------- */
  function createStatus(root) {
    if (!root) return { set: function () {} };
    var title = root.querySelector('[data-status-title]');
    var note = root.querySelector('[data-status-note]');
    return {
      set: function (state, titleText, noteText) {
        root.dataset.state = state;
        if (title) title.textContent = titleText;
        if (note) note.textContent = noteText || '';
      }
    };
  }

  /* ---------------------------------------------------------------------
     Selection shared across pages: query string first, session second, and
     every in-product link carries the current selection.
     --------------------------------------------------------------------- */
  function readStored() {
    try {
      var raw = global.sessionStorage.getItem(CONFIG.storageKey);
      if (!raw) return { lga: '', dwelling: '' };
      var p = JSON.parse(raw);
      return { lga: typeof p.lga === 'string' ? p.lga : '', dwelling: typeof p.dwelling === 'string' ? p.dwelling : '' };
    } catch (e) { return { lga: '', dwelling: '' }; }
  }

  function initialSelection() {
    var q = new URLSearchParams(global.location.search);
    var lga = (q.get('lga') || '').trim();
    if (lga) return { lga: lga, dwelling: (q.get('dwelling') || '').trim() };
    return readStored();
  }

  function clearStored() {
    try { global.sessionStorage.removeItem(CONFIG.storageKey); } catch (e) { /* storage unavailable */ }
  }

  function decorateLinks(sel) {
    var q = new URLSearchParams();
    if (sel.lga) q.set('lga', sel.lga);
    if (sel.dwelling) q.set('dwelling', sel.dwelling);
    var s = q.toString();
    document.querySelectorAll('[data-carry]').forEach(function (a) {
      var base = a.getAttribute('data-carry');
      a.setAttribute('href', s ? base + '?' + s : base);
    });
  }

  function commit(page, sel) {
    var q = new URLSearchParams();
    if (sel.lga) q.set('lga', sel.lga);
    if (sel.dwelling) q.set('dwelling', sel.dwelling);
    var s = q.toString();
    global.history.replaceState({}, '', s ? page + '?' + s : page);
    try {
      global.sessionStorage.setItem(CONFIG.storageKey,
        JSON.stringify({ lga: sel.lga || '', dwelling: sel.dwelling || '' }));
    } catch (e) { /* storage unavailable; the query string still carries it */ }
    decorateLinks(sel);
  }

  /* ---------------------------------------------------------------------
     Small helpers
     --------------------------------------------------------------------- */
  function fillSelect(select, placeholder, items, wanted) {
    select.replaceChildren();
    var ph = document.createElement('option');
    ph.value = ''; ph.textContent = placeholder;
    select.append(ph);
    items.forEach(function (it) {
      var o = document.createElement('option');
      o.value = it.value; o.textContent = it.label;
      select.append(o);
    });
    var ok = wanted && items.some(function (it) { return it.value === wanted; });
    select.value = ok ? wanted : '';
    return Boolean(ok);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  global.ATLAS = {
    CONFIG: CONFIG,
    COLOUR: COLOUR,
    currency: currency, percentage: percentage, count: count, plural: plural,
    median: median, quantile: quantile, compareToMedian: compareToMedian,
    parseRow: parseRow, validRow: validRow, createDataset: createDataset,
    loadDataset: loadDataset, createStatus: createStatus,
    initialSelection: initialSelection, commit: commit, decorateLinks: decorateLinks, clearStored: clearStored,
    fillSelect: fillSelect, el: el
  };

  /* Every page carries the current selection on its in-product links. Page
     scripts re-run this through commit(); doing it here too means a page with
     no script of its own (the method page) still keeps the selection. */
  function initialisePageLinks() {
    decorateLinks(initialSelection());
    document.querySelectorAll('[data-reset-selection]').forEach(function (a) {
      a.addEventListener('click', function () { clearStored(); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialisePageLinks);
  } else {
    initialisePageLinks();
  }
}(window));
