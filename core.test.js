const test = require('node:test');
const assert = require('node:assert');
const C = require('./core.js');

const P = C.params();
const I = () => C.copyIntents(C.DEFAULT_INTENTS);

test('outcome probabilities add up to one for every intent', () => {
  for (const it of I()) {
    const f = C.intentFlow(it, P);
    const sum = f.botResolved + f.handoffCtx + f.handoffNoCtx + f.repeat + f.gaveUp;
    assert.ok(Math.abs(sum - 1) < 1e-9, it.id);
    assert.ok(Math.abs(f.resolved + f.unresolved - 1) < 1e-9);
  }
});

test('an intent that is not automated costs exactly what people-only costs', () => {
  for (const it of I()) {
    it.auto = false;
    const f = C.intentFlow(it, P), pe = C.peopleOnly(it, P);
    assert.ok(Math.abs(f.cost - pe.cost) < 1e-12);
    assert.ok(Math.abs(f.costPerResolved - pe.costPerResolved) < 1e-12);
  }
});

test('with a perfect bot, zero retries and nothing to hand off, nobody reaches a person', () => {
  const it = Object.assign({}, I()[0], { contain: 100 });
  const f = C.intentFlow(it, C.params({ asrError: 0, falseContain: 0 }));
  assert.ok(Math.abs(f.botResolved - 1) < 1e-12);
  assert.strictEqual(f.humanSecs, 0);
});

test('higher containment never raises the cost per resolved call', () => {
  const it = I()[3];
  let prev = Infinity;
  for (let c = 0; c <= 100; c += 10) {
    const x = Object.assign({}, it, { contain: c });
    const v = C.intentFlow(x, P).costPerResolved;
    assert.ok(v <= prev + 1e-9);
    prev = v;
  }
});

test('break-even sits where bot and people cost the same', () => {
  const p = C.params({ botPerMin: 0.3 });
  for (const it of I()) {
    const be = C.breakEven(it, p);
    if (be === null || be === 0) continue;
    const x = Object.assign({}, it, { contain: be });
    assert.ok(Math.abs(C.intentFlow(x, p).costPerResolved - C.peopleOnly(it, p).costPerResolved) < 1e-6);
  }
});

test('break-even is null when the bot is too expensive even at full containment', () => {
  const it = Object.assign({}, I()[0], { botSecs: 600 });
  assert.strictEqual(C.breakEven(it, C.params({ botPerMin: 5 })), null);
});

test('better speech recognition lowers the share of calls that reach a person', () => {
  const a = C.evaluate(I(), C.params({ asrError: 35 })).flow.reachPersonPct;
  const b = C.evaluate(I(), C.params({ asrError: 5 })).flow.reachPersonPct;
  assert.ok(b < a);
});

test('a pricier voice stack never makes the flow cheaper', () => {
  const a = C.evaluate(I(), C.params({ botPerMin: 0.1 })).flow.monthlyCost;
  const b = C.evaluate(I(), C.params({ botPerMin: 0.6 })).flow.monthlyCost;
  assert.ok(b > a);
});

test('shares are normalised and totals scale with calls per month', () => {
  const a = C.evaluate(I(), C.params({ callsPerMonth: 10000 })).flow.monthlyCost;
  const b = C.evaluate(I(), C.params({ callsPerMonth: 20000 })).flow.monthlyCost;
  assert.ok(Math.abs(b / a - 2) < 1e-9);
  const doubled = I().map(x => Object.assign(x, { share: x.share * 2 }));
  assert.ok(Math.abs(C.evaluate(doubled, P).flow.costPerResolved - C.evaluate(I(), P).flow.costPerResolved) < 1e-12);
});

test('simulated calls agree with the expected values', () => {
  const calls = C.sampleCalls(I(), P, 60000, 11);
  const res = calls.filter(c => c.resolved).length / calls.length;
  const cost = calls.reduce((a, c) => a + c.cost, 0) / calls.length;
  const ev = C.evaluate(I(), P);
  assert.ok(Math.abs(res - ev.flow.perCall.resolved) < 0.01, 'resolved ' + res);
  assert.ok(Math.abs(cost - ev.flow.perCall.cost) / ev.flow.perCall.cost < 0.03, 'cost ' + cost);
});

test('same seed replays the same calls', () => {
  const a = C.sampleCalls(I(), P, 20, 5), b = C.sampleCalls(I(), P, 20, 5);
  assert.deepStrictEqual(a, b);
});

test('every scene runs and gives finite numbers', () => {
  for (const k of Object.keys(C.SCENES)) {
    const intents = I(), sc = C.SCENES[k];
    if (sc.shares) intents.forEach((x, i) => { x.share = sc.shares[i]; });
    const ev = C.evaluate(intents, C.params(sc.params));
    assert.ok(Number.isFinite(ev.flow.costPerResolved) && Number.isFinite(ev.people.costPerResolved), k);
  }
});
