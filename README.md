# Call Flow Tester

Hey! I built this because "just put a voice agent on the phones" sounds simple and the math is not. A bot that solves most calls is great. A bot that solves a few and annoys the rest can cost more than it saves.

There is no voice, no speech recognition and no AI model in here, and nothing to pay for. Every step of the flow is a probability you set, so you can see which ones move the cost and which ones barely matter.

It's a small experiment with made-up numbers, not a forecast for any real company or product.

It runs in the browser. There is nothing to install: open `index.html`, or serve the folder with any static file server.

[Open the live app](https://dmcataneo.github.io/voice-agent-flow-tester/). No login needed.

## Run locally

```bash
# Option 1: open index.html in a browser
# Option 2: serve the folder
python3 -m http.server 8000     # then visit http://localhost:8000
```

## What you can do

- Start from a scene: everyday mix, mostly simple calls, billing-heavy month, noisy lines, cautious bot, or a pricey voice stack.
- See where 100 calls end up in three steps: understood or not, solved / handed to a person / hung up, and resolved or not.
- Compare the cost per resolved call with a people-only team, plus the monthly difference and how many people you need either way.
- Go intent by intent: edit the mix, how often the bot solves each kind of call and how long calls take, or untick "Bot" to send a kind of call straight to a person. Each row gets a break-even solve rate and a verdict.
- Read ten calls one at a time, step by step, and roll new ones. Copy a link to the exact setup: the settings are stored in the URL.

## How it works

The bot asks what the caller wants. If it does not understand, it tries again (up to the retry limit), then passes the caller to a person. If it understands, it solves the call or it does not. When it does not, callers either ask for a person (with the bot's notes, so the person is faster) or hang up. A few "solved" calls were not really solved, so the caller phones again and reaches a person.

Cost per resolved call = (bot minutes x bot price + person minutes x person price + a fixed cost for each unresolved call) / calls that ended resolved. The people-only baseline is the same calls answered by a person from the start.

Everything is an expected value over the flow, calculated exactly, not a random run. The "ten calls" panel plays individual calls from the same probabilities, and a test checks that many simulated calls agree with the expected values.

Things to keep in mind:

- The numbers are inputs, not findings. Change the bot price, the solve rate or the cost of an unresolved call and the verdicts change. That is the point of the tool.
- Not covered: queues and waiting, peak hours, caller mood, repeat callers beyond the one above, build and setup costs, and anything about how a real speech system sounds.
- Staffing uses 120 phone hours per person per month. It is a rough guide, not a rota.

## Tests

```bash
node --test core.test.js
```

The tests check that the outcome probabilities add up to one, that a non-automated intent costs exactly what people-only costs, that a perfect bot never reaches a person, that more solves never raise the cost per resolved call, that break-even really is the point where the two cost the same, that totals scale with call volume, that simulated calls agree with the expected values, and that every scene gives finite numbers. Node 18 or newer, no dependencies.
