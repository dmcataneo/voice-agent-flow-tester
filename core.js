/* Call Flow Tester core: expected cost, outcomes and break-even for a simple voice-bot flow.
   No speech, no LLM, no phone line: every step is a probability you can change.
   Works in the browser (window.FlowCore) and in Node (module.exports), so the app and the tests share this file. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FlowCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var HOURS_PER_PERSON = 120;   // productive phone hours per person per month, used for the staffing estimate

  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var DEFAULT_INTENTS = [
    { id: 'status',  name: 'Where is my order?',     share: 28, contain: 82, botSecs: 55,  humanSecs: 240, auto: true },
    { id: 'access',  name: 'Reset my password',      share: 14, contain: 75, botSecs: 70,  humanSecs: 270, auto: true },
    { id: 'change',  name: 'Change a booking',       share: 16, contain: 55, botSecs: 110, humanSecs: 330, auto: true },
    { id: 'billing', name: 'Question about a bill',  share: 20, contain: 35, botSecs: 120, humanSecs: 420, auto: true },
    { id: 'issue',   name: 'Complaint or problem',   share: 12, contain: 10, botSecs: 60,  humanSecs: 600, auto: true },
    { id: 'cancel',  name: 'Cancel my contract',     share: 10, contain: 20, botSecs: 80,  humanSecs: 480, auto: true }
  ];

  var DEFAULTS = {
    callsPerMonth: 20000,
    asrError: 12,        // % of times the bot does not understand what the caller wants
    maxRetries: 2,       // extra tries before it passes the caller to a person
    captureSecs: 25,     // greeting and "how can I help?"
    retrySecs: 12,       // each extra try
    giveUp: 25,          // % of callers the bot cannot help who hang up instead of asking for a person
    falseContain: 3,     // % of "solved by the bot" calls where the caller was not really helped and calls again
    ctxSaving: 15,       // % of a person's time saved when the bot passes on what it learned
    humanResolve: 92,    // % of calls a person resolves
    botPerMin: 0.12,     // EUR per minute of bot call (telephony, speech, hosting): a made-up all-in number
    humanPerHour: 26,    // EUR per hour of a person on the phone, fully loaded
    failCost: 4          // EUR lost on each call that ends unresolved: callbacks, complaints, churn
  };

  function copyIntents(list) { return list.map(function (x) { var o = {}, k; for (k in x) o[k] = x[k]; return o; }); }
  function params(over) {
    var p = {}, k;
    for (k in DEFAULTS) p[k] = DEFAULTS[k];
    for (k in (over || {})) p[k] = over[k];
    return p;
  }

  /* One call of one intent. Returns probabilities and expected seconds. */
  function intentFlow(it, p) {
    var e = p.asrError / 100, R = Math.max(0, Math.round(p.maxRetries));
    var c = it.contain / 100, g = p.giveUp / 100, f = p.falseContain / 100, ctx = p.ctxSaving / 100, hr = p.humanResolve / 100;
    var humanFull = it.humanSecs;
    var base = { botSecs: 0, humanSecs: humanFull, botResolved: 0, handoffCtx: 0, handoffNoCtx: 0, repeat: 0, gaveUp: 0, understood: 0 };
    var out;
    if (!it.auto) {
      out = base;
      out.handoffNoCtx = 1; out.humanSecs = humanFull;     // goes straight to a person
      out.direct = true;
    } else {
      var failAll = Math.pow(e, R + 1), pc = 1 - failAll;
      var attempts = e === 1 ? R + 1 : (1 - Math.pow(e, R + 1)) / (1 - e);   // expected tries used
      var capSecs = p.captureSecs + p.retrySecs * (attempts - 1);
      var botSecs = capSecs + pc * it.botSecs;
      var botResolved = pc * c * (1 - f);
      var repeat = pc * c * f;
      var handCtx = pc * (1 - c) * (1 - g);
      var gaveUp = pc * (1 - c) * g;
      var handNo = failAll;
      var humanSecs = handCtx * humanFull * (1 - ctx) + handNo * humanFull + repeat * humanFull;
      out = { botSecs: botSecs, humanSecs: humanSecs, botResolved: botResolved, handoffCtx: handCtx, handoffNoCtx: handNo, repeat: repeat, gaveUp: gaveUp, understood: pc, direct: false };
    }
    var humanResolved = hr * (out.handoffCtx + out.handoffNoCtx + out.repeat);
    out.humanResolved = humanResolved;
    out.resolved = out.botResolved + humanResolved;
    out.unresolved = 1 - out.resolved;
    out.botCost = out.botSecs / 60 * p.botPerMin;
    out.humanCost = out.humanSecs / 3600 * p.humanPerHour;
    out.failCost = out.unresolved * p.failCost;
    out.cost = out.botCost + out.humanCost + out.failCost;
    out.costPerResolved = out.resolved > 0 ? out.cost / out.resolved : Infinity;
    out.reachPerson = out.handoffCtx + out.handoffNoCtx + out.repeat;
    return out;
  }

  /* What it costs when people take every call. */
  function peopleOnly(it, p) {
    var hr = p.humanResolve / 100, cost = it.humanSecs / 3600 * p.humanPerHour + (1 - hr) * p.failCost;
    return { cost: cost, resolved: hr, costPerResolved: hr > 0 ? cost / hr : Infinity, humanSecs: it.humanSecs };
  }

  /* Lowest containment (%) at which automating this intent costs no more per resolved call than people.
     Returns 0 if it already wins with no containment, null if it never wins, even at 100%. */
  function breakEven(it, p) {
    var base = peopleOnly(it, p).costPerResolved;
    function costAt(cn) { var x = {}, k; for (k in it) x[k] = it[k]; x.contain = cn; x.auto = true; return intentFlow(x, p).costPerResolved; }
    if (costAt(0) <= base) return 0;
    if (costAt(100) > base) return null;
    var lo = 0, hi = 100, i;
    for (i = 0; i < 50; i++) { var mid = (lo + hi) / 2; if (costAt(mid) > base) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }

  function verdict(ratio) {
    if (ratio <= 0.85) return { id: 'yes', label: 'Worth automating' };
    if (ratio <= 1.05) return { id: 'close', label: 'Close call' };
    return { id: 'no', label: 'Keep with people' };
  }

  /* The whole queue: weighted over intents. Per-call numbers; money and hours are scaled to calls per month. */
  function evaluate(intents, p) {
    var total = intents.reduce(function (a, x) { return a + x.share; }, 0) || 1;
    var rows = intents.map(function (it) {
      var w = it.share / total, flow = intentFlow(it, p), pe = peopleOnly(it, p);
      var be = breakEven(it, p);
      var ratio = flow.costPerResolved / pe.costPerResolved;
      return { it: it, weight: w, flow: flow, people: pe, breakEven: be, ratio: ratio, verdict: it.auto ? verdict(ratio) : { id: 'off', label: 'Not automated' } };
    });
    var keys = ['botSecs', 'humanSecs', 'botResolved', 'humanResolved', 'handoffCtx', 'handoffNoCtx', 'repeat', 'gaveUp', 'understood', 'resolved', 'unresolved', 'botCost', 'humanCost', 'failCost', 'cost', 'reachPerson'];
    var t = {}, pt = { cost: 0, resolved: 0, humanSecs: 0 };
    keys.forEach(function (k) { t[k] = 0; });
    rows.forEach(function (r) {
      keys.forEach(function (k) { t[k] += r.weight * r.flow[k]; });
      pt.cost += r.weight * r.people.cost; pt.resolved += r.weight * r.people.resolved; pt.humanSecs += r.weight * r.people.humanSecs;
    });
    var N = p.callsPerMonth;
    var flowTotals = {
      perCall: t, costPerResolved: t.resolved > 0 ? t.cost / t.resolved : Infinity,
      monthlyCost: t.cost * N, resolvedPct: t.resolved * 100, reachPersonPct: t.reachPerson * 100, gaveUpPct: t.gaveUp * 100,
      humanHours: t.humanSecs * N / 3600, people: t.humanSecs * N / 3600 / HOURS_PER_PERSON, botHours: t.botSecs * N / 3600
    };
    var peopleTotals = {
      costPerResolved: pt.resolved > 0 ? pt.cost / pt.resolved : Infinity, monthlyCost: pt.cost * N, resolvedPct: pt.resolved * 100,
      humanHours: pt.humanSecs * N / 3600, people: pt.humanSecs * N / 3600 / HOURS_PER_PERSON
    };
    return {
      rows: rows, flow: flowTotals, people: peopleTotals,
      savingsPerMonth: peopleTotals.monthlyCost - flowTotals.monthlyCost,
      costPerResolvedDelta: flowTotals.costPerResolved / peopleTotals.costPerResolved - 1
    };
  }

  /* Play individual calls, one at a time, from the same probabilities. */
  function sampleCalls(intents, p, n, seed) {
    var rand = rng(seed), total = intents.reduce(function (a, x) { return a + x.share; }, 0) || 1, calls = [], i;
    var e = p.asrError / 100, R = Math.max(0, Math.round(p.maxRetries));
    var g = p.giveUp / 100, f = p.falseContain / 100, ctx = p.ctxSaving / 100, hr = p.humanResolve / 100;
    for (i = 0; i < n; i++) {
      var x = rand() * total, it = intents[0], acc = 0, j;
      for (j = 0; j < intents.length; j++) { acc += intents[j].share; if (x < acc) { it = intents[j]; break; } }
      var steps = [], botSecs = 0, humanSecs = 0, resolved = false, outcome;
      if (!it.auto) {
        steps.push('Straight to a person'); humanSecs = it.humanSecs;
        resolved = rand() < hr; outcome = resolved ? 'person' : 'unresolved';
        steps.push(resolved ? 'Person resolves it' : 'Person cannot resolve it');
      } else {
        var tries = 0, heard = false;
        botSecs = p.captureSecs;
        while (tries <= R) {
          tries++;
          if (rand() >= e) { heard = true; break; }
          if (tries <= R) botSecs += p.retrySecs;
        }
        steps.push(heard ? (tries === 1 ? 'Bot understands the first time' : 'Bot understands after ' + tries + ' tries') : 'Bot never understands (' + tries + ' tries)');
        if (!heard) {
          steps.push('Passed to a person, no context'); humanSecs = it.humanSecs;
          resolved = rand() < hr; outcome = resolved ? 'person' : 'unresolved';
          steps.push(resolved ? 'Person resolves it' : 'Person cannot resolve it');
        } else {
          botSecs += it.botSecs;
          if (rand() < it.contain / 100) {
            if (rand() < f) {
              steps.push('Bot says it is done, but it is not'); steps.push('Caller phones again, goes to a person');
              humanSecs = it.humanSecs; resolved = rand() < hr; outcome = resolved ? 'person' : 'unresolved';
              steps.push(resolved ? 'Person resolves it' : 'Person cannot resolve it');
            } else { steps.push('Bot resolves it'); resolved = true; outcome = 'bot'; }
          } else if (rand() < g) {
            steps.push('Bot cannot help'); steps.push('Caller hangs up'); outcome = 'gaveup';
          } else {
            steps.push('Bot cannot help'); steps.push('Passed to a person, with context');
            humanSecs = it.humanSecs * (1 - ctx); resolved = rand() < hr; outcome = resolved ? 'person' : 'unresolved';
            steps.push(resolved ? 'Person resolves it' : 'Person cannot resolve it');
          }
        }
      }
      var cost = botSecs / 60 * p.botPerMin + humanSecs / 3600 * p.humanPerHour + (resolved ? 0 : p.failCost);
      calls.push({ intent: it.name, steps: steps, botSecs: botSecs, humanSecs: humanSecs, outcome: outcome, resolved: resolved, cost: cost });
    }
    return calls;
  }

  var SCENES = {
    base: { label: 'Everyday mix', params: {}, shares: null },
    simple: { label: 'Mostly simple calls', params: {}, shares: [50, 20, 12, 8, 4, 6] },
    billing: { label: 'Billing-heavy month', params: {}, shares: [12, 8, 12, 46, 14, 8] },
    noisy: { label: 'Noisy lines', params: { asrError: 30, maxRetries: 3 }, shares: null },
    cautious: { label: 'Cautious bot', params: { maxRetries: 1, giveUp: 8, falseContain: 1 }, shares: null },
    pricey: { label: 'Pricey voice stack', params: { botPerMin: 0.45 }, shares: null }
  };

  return {
    HOURS_PER_PERSON: HOURS_PER_PERSON, rng: rng, DEFAULTS: DEFAULTS, DEFAULT_INTENTS: DEFAULT_INTENTS, SCENES: SCENES,
    params: params, copyIntents: copyIntents, intentFlow: intentFlow, peopleOnly: peopleOnly, breakEven: breakEven,
    verdict: verdict, evaluate: evaluate, sampleCalls: sampleCalls
  };
});
