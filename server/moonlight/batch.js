// ═══════════════════════════════════════════════════════════════════════════
// batch.js — Run N Moonlight games in series and produce aggregate stats.
// Ported from /python-source/batch.py. Used to verify the JS port matches
// the Python version's behavior in aggregate.
// ═══════════════════════════════════════════════════════════════════════════

const { GameState, SeededRng } = require("./game_state");
const { runGame } = require("./orchestrator");
const { FakeClaudeClient } = require("./fake_claude");

const C = {
  RESET: "\x1b[0m", DIM: "\x1b[2m", BOLD: "\x1b[1m",
  RED: "\x1b[31m", GREEN: "\x1b[32m", YELLOW: "\x1b[33m",
  BLUE: "\x1b[34m", MAGENTA: "\x1b[35m", CYAN: "\x1b[36m", GRAY: "\x1b[90m",
};

function summarize(seed, transcript, state, durationMs) {
  let deathsByWolves = 0, deathsByVote = 0, ties = 0;
  let maxDaysHit = false, validatorCorrections = 0;
  let claimsTrue = 0, claimsBluff = 0;

  for (const ev of transcript.events) {
    if (ev.kind === "death") {
      if (ev.data.cause === "wolves") deathsByWolves++;
      else if (ev.data.cause === "vote") deathsByVote++;
    } else if (ev.kind === "vote_resolution" && ev.data.tied) ties++;
    else if (ev.kind === "max_days_hit") maxDaysHit = true;
    else if (ev.kind === "validator_correction") validatorCorrections++;
    else if (ev.kind === "role_claim") {
      if (ev.data.claimed === ev.data.actual) claimsTrue++;
      else claimsBluff++;
    }
  }

  return {
    seed,
    winner: state.winner,
    finalDay: state.day,
    survivors: state.players.filter(p => p.alive).map(p => p.name),
    survivorRoles: state.players.filter(p => p.alive).map(p => p.role.name),
    deathsByWolves, deathsByVote, ties, maxDaysHit,
    validatorCorrections, claimsTrue, claimsBluff,
    durationMs,
    crashed: false,
    crashMessage: null,
  };
}

function runOne(seed, players, rounds) {
  const t0 = process.hrtime.bigint();
  try {
    const namePool = ["Alice", "Bob", "Carol", "Diana", "Eli", "Frank", "Grace", "Henry", "Iris"];
    const names = namePool.slice(0, players);
    const state = GameState.fromConfig({ playerNames: names, rng: new SeededRng(seed) });
    const client = new FakeClaudeClient(new SeededRng(seed + 1));
    const { transcript } = runGame(state, client, { discussionRounds: rounds });
    const durationMs = Number(process.hrtime.bigint() - t0) / 1e6;
    return summarize(seed, transcript, state, durationMs);
  } catch (exc) {
    const durationMs = Number(process.hrtime.bigint() - t0) / 1e6;
    return {
      seed, winner: null, finalDay: 0,
      survivors: [], survivorRoles: [],
      deathsByWolves: 0, deathsByVote: 0, ties: 0,
      maxDaysHit: false, validatorCorrections: 0,
      claimsTrue: 0, claimsBluff: 0,
      durationMs,
      crashed: true, crashMessage: `${exc.constructor.name}: ${exc.message}`,
    };
  }
}

function printReport(results, totalDurationS) {
  const total = results.length;
  const crashed = results.filter(r => r.crashed);
  const finished = results.filter(r => !r.crashed);

  console.log(`\n${C.MAGENTA}${"═".repeat(60)}`);
  console.log(`  BATCH RESULTS — ${total} games in ${totalDurationS.toFixed(2)}s`);
  console.log(`  (${(total / totalDurationS).toFixed(1)} games/sec)`);
  console.log(`${"═".repeat(60)}${C.RESET}`);

  if (crashed.length > 0) {
    console.log(`\n${C.RED}━━ Crashes (${crashed.length}) ━━${C.RESET}`);
    const byMsg = {};
    for (const r of crashed) {
      const msg = r.crashMessage || "<unknown>";
      (byMsg[msg] = byMsg[msg] || []).push(r.seed);
    }
    for (const [msg, seeds] of Object.entries(byMsg)) {
      const example = seeds.slice(0, 5).join(", ");
      const more = seeds.length > 5 ? ` (+${seeds.length - 5} more)` : "";
      console.log(`  ${C.RED}× ${msg}${C.RESET}`);
      console.log(`    ${C.DIM}seeds: ${example}${more}${C.RESET}`);
    }
    console.log(`\n  ${C.YELLOW}Re-run any crashed game with: node demo.js --seed <seed>${C.RESET}`);
  }

  if (finished.length === 0) {
    console.log(`\n${C.RED}No games finished — cannot compute statistics.${C.RESET}`);
    return;
  }

  // Win rates
  console.log(`\n${C.CYAN}━━ Win rates ━━${C.RESET}`);
  const winCounts = { village: 0, wolves: 0, null: 0 };
  for (const r of finished) winCounts[String(r.winner)] = (winCounts[String(r.winner)] || 0) + 1;
  for (const [winner, label, color] of [
    ["village", "Village wins", C.GREEN],
    ["wolves",  "Wolves wins ", C.RED],
    ["null",    "Inconclusive", C.YELLOW],
  ]) {
    const count = winCounts[winner] || 0;
    const pct = (count / finished.length) * 100;
    const filled = Math.floor(30 * pct / 100);
    const bar = "█".repeat(filled) + "░".repeat(30 - filled);
    console.log(`  ${color}${label}${C.RESET}  ${bar}  ${String(count).padStart(4)} (${pct.toFixed(1).padStart(5)}%)`);
  }

  // Game length
  console.log(`\n${C.CYAN}━━ Game length ━━${C.RESET}`);
  const days = finished.map(r => r.finalDay);
  const sortedDays = [...days].sort((a, b) => a - b);
  const mean = days.reduce((a, b) => a + b, 0) / days.length;
  console.log(`  Mean:   ${mean.toFixed(2)} days`);
  console.log(`  Median: ${sortedDays[Math.floor(sortedDays.length / 2)]} days`);
  console.log(`  Min:    ${sortedDays[0]} days`);
  console.log(`  Max:    ${sortedDays[sortedDays.length - 1]} days`);
  const dayCounts = {};
  for (const d of days) dayCounts[d] = (dayCounts[d] || 0) + 1;
  const maxCount = Math.max(...Object.values(dayCounts));
  console.log(`\n  ${C.DIM}Distribution:${C.RESET}`);
  for (const d of Object.keys(dayCounts).map(Number).sort((a, b) => a - b)) {
    const filled = Math.floor(30 * dayCounts[d] / maxCount);
    const bar = "█".repeat(filled) + "░".repeat(30 - filled);
    console.log(`    Day ${String(d).padStart(2)}  ${C.GRAY}${bar}${C.RESET}  ${dayCounts[d]}`);
  }

  // Edge cases
  console.log(`\n${C.CYAN}━━ Edge cases ━━${C.RESET}`);
  const totalTies = finished.reduce((s, r) => s + r.ties, 0);
  const gamesWithTies = finished.filter(r => r.ties > 0).length;
  const gamesMaxDays = finished.filter(r => r.maxDaysHit).length;
  const totalCorrections = finished.reduce((s, r) => s + r.validatorCorrections, 0);
  const gamesWithCorrections = finished.filter(r => r.validatorCorrections > 0).length;
  console.log(`  Vote ties:               ${totalTies} total across ${gamesWithTies} games`);
  console.log(`  Max-days hit:            ${gamesMaxDays} games`);
  console.log(`  Validator corrections:   ${totalCorrections} total across ${gamesWithCorrections} games`);

  // Role claims
  console.log(`\n${C.CYAN}━━ Role claims (seer reveals) ━━${C.RESET}`);
  const totalTrue = finished.reduce((s, r) => s + r.claimsTrue, 0);
  const totalBluff = finished.reduce((s, r) => s + r.claimsBluff, 0);
  const gamesWithClaim = finished.filter(r => r.claimsTrue + r.claimsBluff > 0).length;
  console.log(`  Honest claims:   ${totalTrue} (in ${gamesWithClaim} games)`);
  console.log(`  Bluff claims:    ${totalBluff}`);

  // Deaths
  console.log(`\n${C.CYAN}━━ Deaths ━━${C.RESET}`);
  const totalWolfKills = finished.reduce((s, r) => s + r.deathsByWolves, 0);
  const totalVoteKills = finished.reduce((s, r) => s + r.deathsByVote, 0);
  console.log(`  Killed by wolves:  ${totalWolfKills} (${(totalWolfKills / finished.length).toFixed(2)}/game)`);
  console.log(`  Voted out:         ${totalVoteKills} (${(totalVoteKills / finished.length).toFixed(2)}/game)`);

  // Performance
  console.log(`\n${C.CYAN}━━ Performance ━━${C.RESET}`);
  const durations = finished.map(r => r.durationMs);
  const sortedDur = [...durations].sort((a, b) => a - b);
  const meanDur = durations.reduce((a, b) => a + b, 0) / durations.length;
  console.log(`  Per-game mean:   ${meanDur.toFixed(2)} ms`);
  console.log(`  Per-game median: ${sortedDur[Math.floor(sortedDur.length / 2)].toFixed(2)} ms`);
  console.log(`  Slowest:         ${sortedDur[sortedDur.length - 1].toFixed(2)} ms`);
}

// ─── Main ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { n: 500, players: 8, rounds: 2, startSeed: 1 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--n") args.n = parseInt(argv[++i], 10);
    else if (argv[i] === "--players") args.players = parseInt(argv[++i], 10);
    else if (argv[i] === "--rounds") args.rounds = parseInt(argv[++i], 10);
    else if (argv[i] === "--start-seed") args.startSeed = parseInt(argv[++i], 10);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
console.log(`${C.CYAN}Running ${args.n} games — ${args.players} players, ${args.rounds} discussion rounds, seeds ${args.startSeed}..${args.startSeed + args.n - 1}${C.RESET}`);

const t0 = process.hrtime.bigint();
const results = [];
for (let i = 0; i < args.n; i++) {
  results.push(runOne(args.startSeed + i, args.players, args.rounds));
}
const totalDurationS = Number(process.hrtime.bigint() - t0) / 1e9;

printReport(results, totalDurationS);

process.exit(results.some(r => r.crashed) ? 1 : 0);
