/* Call Flow Tester UI: probabilities in, cost per resolved call out. */
(function () {
  'use strict';
  var C = window.FlowCore;
  var $ = function (id) { return document.getElementById(id); };
  var state = { p: C.params(), intents: C.copyIntents(C.DEFAULT_INTENTS), scene: 'base', seed: 3 };
  var ev;

  var KNOBS = [
    { group: 'The bot', items: [
      { k: 'asrError', label: 'Not understood, per try', min: 0, max: 60, step: 1, fmt: pc, note: 'Noisy lines and accents push this up.' },
      { k: 'maxRetries', label: 'Extra tries before a person', min: 0, max: 4, step: 1, fmt: function (v) { return v; }, note: 'More tries catch more callers and annoy more callers.' },
      { k: 'captureSecs', label: 'Greeting and first question (s)', min: 10, max: 60, step: 1, fmt: function (v) { return v + ' s'; }, note: '' },
      { k: 'retrySecs', label: 'Each extra try (s)', min: 5, max: 30, step: 1, fmt: function (v) { return v + ' s'; }, note: '' }
    ] },
    { group: 'When the bot cannot help', items: [
      { k: 'giveUp', label: 'Callers who hang up', min: 0, max: 80, step: 1, fmt: pc, note: 'The rest ask for a person.' },
      { k: 'falseContain', label: '"Solved" but not really', min: 0, max: 20, step: 1, fmt: pc, note: 'They phone again and reach a person.' },
      { k: 'ctxSaving', label: 'Person time saved by hand-over notes', min: 0, max: 50, step: 1, fmt: pc, note: 'When the bot passes on what it learned.' },
      { k: 'humanResolve', label: 'Calls a person resolves', min: 70, max: 100, step: 1, fmt: pc, note: 'Also used for the people-only team.' }
    ] },
    { group: 'Money and volume', items: [
      { k: 'botPerMin', label: 'Bot price per minute (EUR)', min: 0.02, max: 0.8, step: 0.01, fmt: function (v) { return 'EUR ' + v.toFixed(2); }, note: 'Made-up all-in: phone line, speech, hosting.' },
      { k: 'humanPerHour', label: 'Person cost per hour (EUR)', min: 12, max: 50, step: 1, fmt: function (v) { return 'EUR ' + v; }, note: 'Fully loaded, on the phone.' },
      { k: 'failCost', label: 'Cost of an unresolved call (EUR)', min: 0, max: 15, step: 0.5, fmt: function (v) { return 'EUR ' + v.toFixed(2).replace(/\.00$/, ''); }, note: 'Callbacks, complaints, lost customers. Set 0 to count only phone time.' },
      { k: 'callsPerMonth', label: 'Calls per month', min: 2000, max: 100000, step: 1000, fmt: function (v) { return v.toLocaleString('en-US'); }, note: '' }
    ] }
  ];

  function pc(v) { return Math.round(v) + '%'; }
  function eur(v) { return Number.isFinite(v) ? 'EUR ' + v.toFixed(2) : 'n/a'; }
  function eur0(v) { return (v < 0 ? '-' : '') + 'EUR ' + Math.round(Math.abs(v)).toLocaleString('en-US'); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  function seg(cls, pct, label, dark) {
    if (pct < 0.05) return '';
    return '<i class="' + cls + (dark ? ' dark' : '') + '" style="width:' + pct + '%" title="' + esc(label) + ': ' + pct.toFixed(1) + '%">' + (pct >= 7 ? Math.round(pct) + '%' : '') + '</i>';
  }
  function keys(items) { return items.map(function (x) { return '<span><i class="sw ' + x[0] + '"></i>' + x[1] + ' ' + x[2].toFixed(1) + '%</span>'; }).join(''); }

  function draw() {
    var t = ev.flow.perCall;
    var und = t.understood * 100, notU = 100 - und;
    $('bar1').innerHTML = seg('c-bot', und, 'Understood', false) + seg('c-noctx', notU, 'Not understood, sent to a person', false);
    $('keys1').innerHTML = keys([['c-bot', 'Understood', und], ['c-noctx', 'Not understood, sent to a person', notU]]);

    var contained = (t.botResolved + t.repeat) * 100, ctx = t.handoffCtx * 100, gave = t.gaveUp * 100;
    var directPct = ev.rows.reduce(function (a, r) { return a + (r.it.auto ? 0 : r.weight * 100); }, 0);
    $('bar2').innerHTML = seg('c-bot', contained, 'Bot says solved', false) + seg('c-ctx', ctx, 'Asked for a person', false) + seg('c-gave', gave, 'Hung up', false) + seg('c-noctx', 100 - contained - ctx - gave, 'Sent to a person without understanding, or straight to a person', false);
    $('keys2').innerHTML = keys([['c-bot', 'Bot says solved', contained], ['c-ctx', 'Asked for a person (with notes)', ctx], ['c-gave', 'Hung up', gave], ['c-noctx', 'Sent to a person (not understood or not automated)', 100 - contained - ctx - gave]]);

    var bot = t.botResolved * 100, per = t.humanResolved * 100, un = t.unresolved * 100;
    $('bar3').innerHTML = seg('c-bot', bot, 'Resolved by the bot', false) + seg('c-ok', per, 'Resolved by a person', true) + seg('c-bad', un, 'Not resolved', true);
    $('keys3').innerHTML = keys([['c-bot', 'Resolved by the bot', bot], ['c-ok', 'Resolved by a person', per], ['c-bad', 'Not resolved (hung up, or a person could not)', un]]);

    var f = ev.flow, pe = ev.people;
    var d = ev.costPerResolvedDelta, better = d < 0;
    $('kpis').innerHTML =
      '<div class="kpi ' + (better ? 'good' : 'bad') + '"><small>With the voice flow</small><b>' + eur(f.costPerResolved) + '</b><span>' + f.resolvedPct.toFixed(0) + '% resolved</span></div>' +
      '<div class="kpi"><small>People only</small><b>' + eur(pe.costPerResolved) + '</b><span>' + pe.resolvedPct.toFixed(0) + '% resolved</span></div>' +
      '<div class="kpi ' + (ev.savingsPerMonth >= 0 ? 'good' : 'bad') + '"><small>' + (ev.savingsPerMonth >= 0 ? 'Saved per month' : 'Extra cost per month') + '</small><b>' + eur0(Math.abs(ev.savingsPerMonth)) + '</b><span>on ' + state.p.callsPerMonth.toLocaleString('en-US') + ' calls</span></div>' +
      '<div class="kpi"><small>People needed</small><b>' + f.people.toFixed(1) + ' vs ' + pe.people.toFixed(1) + '</b><span>at ' + C.HOURS_PER_PERSON + ' phone hours each a month</span></div>';

    $('takeaway').textContent = better
      ? 'The flow is ' + Math.round(-d * 100) + '% cheaper per resolved call, and ' + f.reachPersonPct.toFixed(0) + '% of calls still reach a person. ' + f.gaveUpPct.toFixed(0) + '% of callers hang up.'
      : 'With these numbers the flow is ' + Math.round(d * 100) + '% more expensive per resolved call than a people-only team.';
    drawTable(); markScenes(); writeHash();
  }

  function drawTable() {
    var head = '<thead><tr><th>Kind of call</th><th>Share of calls (%)</th><th>Bot</th><th>Bot solves (%)</th><th>Bot time (s)</th><th>Person time (s)</th><th>With bot, per resolved call</th><th>People only</th><th>Break-even solve rate</th><th>Verdict</th></tr></thead>';
    var body = '<tbody>' + ev.rows.map(function (r, i) {
      var it = r.it;
      var be = r.breakEven === null ? 'never' : r.breakEven === 0 ? 'always' : r.breakEven.toFixed(0) + '%';
      return '<tr><td>' + esc(it.name) + '</td>' +
        num(i, 'share', it.share, 0, 100) + '<td><input type="checkbox" data-i="' + i + '" data-f="auto"' + (it.auto ? ' checked' : '') + ' aria-label="Automate ' + esc(it.name) + '"></td>' +
        num(i, 'contain', it.contain, 0, 100) + num(i, 'botSecs', it.botSecs, 10, 600) + num(i, 'humanSecs', it.humanSecs, 30, 1800) +
        '<td>' + eur(r.flow.costPerResolved) + '</td><td>' + eur(r.people.costPerResolved) + '</td><td>' + (it.auto ? be : '') + '</td>' +
        '<td><span class="pill ' + r.verdict.id + '">' + r.verdict.label + '</span></td></tr>';
    }).join('') + '</tbody>';
    var table = $('intents'), active = document.activeElement, keep = active && active.dataset && active.dataset.i ? active.dataset.i + active.dataset.f : null;
    table.innerHTML = head + body;
    if (keep) { var again = table.querySelector('[data-i="' + keep.charAt(0) + '"][data-f="' + keep.slice(1) + '"]'); if (again) { again.focus(); if (again.select) again.select(); } }
  }
  function num(i, f, v, min, max) { return '<td><input type="number" data-i="' + i + '" data-f="' + f + '" value="' + Math.round(v) + '" min="' + min + '" max="' + max + '" step="1" aria-label="' + f + '"></td>'; }

  $('intents').addEventListener('change', function (e) {
    var t = e.target, i = t.dataset.i, f = t.dataset.f;
    if (i == null) return;
    var it = state.intents[+i];
    if (f === 'auto') it.auto = t.checked;
    else { var v = parseFloat(t.value); if (!isFinite(v)) return; var lim = { share: [0, 100], contain: [0, 100], botSecs: [10, 600], humanSecs: [30, 1800] }[f]; it[f] = Math.min(lim[1], Math.max(lim[0], v)); }
    state.scene = null; run();
  });

  function drawCalls() {
    var calls = C.sampleCalls(state.intents, state.p, 10, state.seed);
    $('calls').innerHTML = calls.map(function (c) {
      var ok = c.resolved;
      return '<div class="call ' + (ok ? 'ok' : 'ko') + '"><b><span>' + esc(c.intent) + '</span><em>' + (ok ? 'resolved' : 'not resolved') + ' · ' + eur(c.cost) + '</em></b><ol>' + c.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></div>';
    }).join('');
  }
  $('roll').onclick = function () { state.seed = (state.seed * 7919 + 17) % 1000003; drawCalls(); };

  function run() { ev = C.evaluate(state.intents, state.p); draw(); drawCalls(); }

  function buildScenes() {
    var box = $('scenes');
    Object.keys(C.SCENES).forEach(function (k) {
      var b = document.createElement('button'); b.className = 'chip'; b.dataset.scene = k; b.textContent = C.SCENES[k].label;
      b.onclick = function () { applyScene(k); }; box.appendChild(b);
    });
  }
  function markScenes() {
    Array.prototype.forEach.call(document.querySelectorAll('#scenes .chip'), function (c) { var on = c.dataset.scene === state.scene; c.style.fontWeight = on ? '800' : ''; c.style.borderColor = on ? 'var(--accent)' : ''; });
  }
  function applyScene(k) {
    var sc = C.SCENES[k];
    state.scene = k; state.p = C.params(sc.params); state.intents = C.copyIntents(C.DEFAULT_INTENTS);
    if (sc.shares) state.intents.forEach(function (x, i) { x.share = sc.shares[i]; });
    syncKnobs(); run();
  }

  function buildKnobs() {
    var box = $('params');
    KNOBS.forEach(function (g) {
      var col = document.createElement('div'); col.innerHTML = '<h2>' + g.group + '</h2>';
      g.items.forEach(function (it) {
        var d = document.createElement('div'); d.className = 'param';
        d.innerHTML = '<label for="k_' + it.k + '">' + it.label + '<output id="o_' + it.k + '"></output></label><input type="range" id="k_' + it.k + '" min="' + it.min + '" max="' + it.max + '" step="' + it.step + '">' + (it.note ? '<small>' + it.note + '</small>' : '');
        col.appendChild(d);
        d.querySelector('input').addEventListener('input', function (e) { state.p[it.k] = parseFloat(e.target.value); $('o_' + it.k).textContent = it.fmt(state.p[it.k]); state.scene = null; run(); });
      });
      box.appendChild(col);
    });
  }
  function syncKnobs() { KNOBS.forEach(function (g) { g.items.forEach(function (it) { $('k_' + it.k).value = state.p[it.k]; $('o_' + it.k).textContent = it.fmt(state.p[it.k]); }); }); }

  function writeHash() {
    var o = { p: {}, i: state.intents.map(function (x) { return [x.share, x.contain, x.botSecs, x.humanSecs, x.auto ? 1 : 0]; }) }, k;
    for (k in state.p) if (state.p[k] !== C.DEFAULTS[k]) o.p[k] = Math.round(state.p[k] * 1000) / 1000;
    var def = JSON.stringify(C.DEFAULT_INTENTS.map(function (x) { return [x.share, x.contain, x.botSecs, x.humanSecs, 1]; }));
    var s = (Object.keys(o.p).length || JSON.stringify(o.i) !== def) ? '#' + encodeURIComponent(JSON.stringify(o)) : '';
    if (history.replaceState) history.replaceState(null, '', location.pathname + location.search + s);
  }
  function readHash() {
    if (location.hash.length < 3) return;
    try {
      var o = JSON.parse(decodeURIComponent(location.hash.slice(1))), k;
      for (k in (o.p || {})) if (k in C.DEFAULTS && isFinite(o.p[k])) state.p[k] = +o.p[k];
      if (Array.isArray(o.i) && o.i.length === state.intents.length) o.i.forEach(function (a, i) { var it = state.intents[i]; if (a.every(isFinite)) { it.share = +a[0]; it.contain = +a[1]; it.botSecs = +a[2]; it.humanSecs = +a[3]; it.auto = !!a[4]; } });
      state.scene = null;
    } catch (e) { /* ignore a broken link */ }
  }

  $('share').onclick = function () {
    var b = $('share'), done = function () { b.textContent = 'Link copied'; b.classList.add('ok'); setTimeout(function () { b.textContent = 'Copy link'; b.classList.remove('ok'); }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(location.href).then(done, done); else done();
  };
  $('reset').onclick = function () { applyScene('base'); };

  buildScenes(); buildKnobs(); readHash(); syncKnobs(); run();
})();
