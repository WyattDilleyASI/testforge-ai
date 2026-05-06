# Moonlight — multi-agent Werewolf for TestForge

A hidden launcher inside TestForge that runs Werewolf games with multiple
Claude agents. The architecture is generic — agents with hidden roles,
private channels, and adversarial discussion — and naturally generalizes
to **adversarial test case review**, where reviewer agents try to identify
test cases being defended for the wrong reasons.

This directory holds the server-side game engine. Drops into TestForge as
`server/moonlight/` with the route module mounted under `/api/moonlight/`.

## Files

| File | Role |
|------|------|
| `roles.js` | Role definitions, channels, win conditions, distribution validation |
| `game_state.js` | The single source of truth; all mutation goes through here |
| `fake_claude.js` | Slightly-smart stand-in for the real Claude client. Same interface as the eventual real client |
| `orchestrator.js` | The main game loop: night → day → resolve → win-check |
| `_route_example.js` | Express route module — copy or rename to `routes/moonlight.js` when integrating |
| `demo.js` | CLI runner: `node demo.js --seed 42` |
| `batch.js` | N-game stress runner: `node batch.js --n 500` |
| `smoke_test.js` | Data model assertions (33 of them); run after any change to roles or game_state |

## Verification status

- **Smoke test**: 33/33 passing (`node smoke_test.js`)
- **500-game batch**: 0 crashes, 50.4% village / 49.6% wolves win rate
- **Edge config sweep**: 7p/9p × 1/3 rounds all clean

The JS port matches the reference Python port's aggregate behavior within
expected variance. Cross-reference `/python-source/` if debugging.

## Integration plan

**Pass 1 (this directory):** Server-side game engine. Done.

**Pass 2 (next):** React component `client/src/components/MoonlightView.jsx`
plus three lines added to `App.jsx`'s keystroke handler for the `moonlight`
trigger and one line in the `parseHash` route table. The component calls
`POST /api/moonlight/run` and renders the returned transcript with a small
delay between events so it reads as a game playing out.

**Pass 3 (future):** Real Claude client. The orchestrator's `client.call(...)`
contract is unchanged — swap `FakeClaudeClient` for `RealClaudeClient`.
At that point we likely also want SSE streaming, since real games take
30-60s instead of 5-50ms.

**Pass 4 (Level 2):** Pivot the same architecture to adversarial test
case review. Roles change, channel semantics stay identical, prompt
templates get rewritten. The orchestrator and game_state are reusable.

## What's deferred

- KB persistence — games don't save anywhere yet. Adding it is a single
  call to `createKbEntry` in the route after the game ends.
- Real Claude client — this is fake-only.
- SSE streaming — `/api/moonlight/run` is synchronous. Fine for fake
  games (~50ms); will need streaming for real Claude.
- The keystroke trigger and React UI — that's pass 2.

## Running it

```bash
node demo.js --seed 42                    # one game, verbose
node batch.js --n 500                     # 500-game stress test
node smoke_test.js                        # data model assertions
```
