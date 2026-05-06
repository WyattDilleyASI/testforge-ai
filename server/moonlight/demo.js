// ═══════════════════════════════════════════════════════════════════════════
// demo.js — Run a full Moonlight game with the fake Claude client.
// No API calls. Prints a complete game transcript.
//
// Usage:
//   node demo.js                # Random seed
//   node demo.js --seed 42      # Reproducible game
//   node demo.js --seed 42 --quiet
// ═══════════════════════════════════════════════════════════════════════════

const { GameState, SeededRng, Phase } = require("./game_state");
const { runGame } = require("./orchestrator");
const { FakeClaudeClient } = require("./fake_claude");

const C = {
  RESET: "\x1b[0m",
  DIM:   "\x1b[2m",
  BOLD:  "\x1b[1m",
  RED:   "\x1b[31m",
  GREEN: "\x1b[32m",
  YELLOW:"\x1b[33m",
  BLUE:  "\x1b[34m",
  MAGENTA:"\x1b[35m",
  CYAN:  "\x1b[36m",
  GRAY:  "\x1b[90m",
};

function banner(text, color = C.CYAN) {
  const bar = "═".repeat(60);
  console.log(`\n${color}${bar}`);
  console.log(`  ${text}`);
  console.log(`${bar}${C.RESET}`);
}

function section(text, color = C.BLUE) {
  console.log(`\n${color}── ${text} ──${C.RESET}`);
}

function renderTranscript(transcript) {
  let initialRoles = {};

  for (const ev of transcript.events) {
    if (ev.kind === "game_start") {
      initialRoles = ev.data.roles || {};
      banner(`MOONLIGHT — ${ev.data.playerCount || "?"} players`, C.MAGENTA);
      console.log(`\n${C.DIM}Roles (hidden from agents during game):${C.RESET}`);
      for (const [name, role] of Object.entries(initialRoles)) {
        const roleColor = role === "werewolf" ? C.RED : C.GREEN;
        console.log(`  ${roleColor}${name.padEnd(10)}${C.RESET} ${C.DIM}·${C.RESET} ${role}`);
      }
      continue;
    }

    if (ev.kind === "night_begins") { section(`NIGHT ${ev.day}`, C.BLUE); continue; }

    if (ev.kind === "discussion_round") {
      if (ev.data.round === 1) section(`DAY ${ev.day} — discussion`, C.YELLOW);
      else console.log(`\n${C.DIM}  ── round ${ev.data.round} ──${C.RESET}`);
      continue;
    }

    if (ev.kind === "wolves_decided") {
      console.log(`  ${C.RED}Wolves agree to kill ${C.BOLD}${ev.data.target}${C.RESET}`);
    } else if (ev.kind === "night_action") {
      const { actor, role, target } = ev.data;
      const color = role === "seer" ? C.CYAN : C.GREEN;
      console.log(`  ${color}${role[0].toUpperCase() + role.slice(1)} (${actor}) → ${target}${C.RESET}`);
    } else if (ev.kind === "validator_correction") {
      const { actor, reason, fallback } = ev.data;
      console.log(`  ${C.YELLOW}[validator] ${actor} corrected (${reason}) → ${fallback}${C.RESET}`);
    } else if (ev.kind === "night_resolution") {
      const { seerResult, seerTarget, protected: prot } = ev.data;
      if (seerResult) {
        const color = seerResult === "wolves" ? C.RED : C.GREEN;
        console.log(`  ${C.CYAN}Seer learns: ${seerTarget} is ${color}${seerResult.toUpperCase()}${C.RESET}`);
      }
      if (prot) console.log(`  ${C.GREEN}Bodyguard saves the night — no death.${C.RESET}`);
    } else if (ev.kind === "death") {
      const { victim, cause, roleRevealed } = ev.data;
      const roleColor = roleRevealed === "werewolf" ? C.RED : C.GREEN;
      if (cause === "wolves") {
        console.log(`  ${C.BOLD}${C.RED}☾ ${victim} was killed by wolves.${C.RESET} ${C.DIM}(was ${roleColor}${roleRevealed}${C.DIM}){C.RESET}`.replace("{C.RESET}", C.RESET));
      } else {
        console.log(`  ${C.BOLD}${C.YELLOW}☼ ${victim} was voted out.${C.RESET} ${C.DIM}(was ${roleColor}${roleRevealed}${C.DIM})${C.RESET}`);
      }
    } else if (ev.kind === "no_death") {
      console.log(`  ${C.DIM}The night passed quietly — nobody died.${C.RESET}`);
    } else if (ev.kind === "speech") {
      console.log(`  ${C.BOLD}${ev.data.speaker.padEnd(8)}${C.RESET} ${C.DIM}»${C.RESET} ${ev.data.text}`);
    } else if (ev.kind === "role_claim") {
      const { speaker, claimed, actual } = ev.data;
      const truth = claimed === actual ? "TRUE" : "BLUFF";
      const color = truth === "TRUE" ? C.GREEN : C.RED;
      console.log(`  ${color}        ↑ ${speaker} CLAIMS ${claimed} (${truth})${C.RESET}`);
    } else if (ev.kind === "vote_cast") {
      console.log(`  ${C.GRAY}${ev.data.voter.padEnd(8)} → ${ev.data.target}${C.RESET}`);
    } else if (ev.kind === "vote_resolution") {
      const tallyStr = Object.entries(ev.data.tally)
        .sort((a, b) => b[1] - a[1])
        .map(([n, c]) => `${n}:${c}`).join(", ");
      console.log(`  ${C.YELLOW}Tally: ${tallyStr}${C.RESET}`);
      if (ev.data.tied) console.log(`  ${C.YELLOW}Tied — no elimination.${C.RESET}`);
    } else if (ev.kind === "max_days_hit") {
      console.log(`\n${C.YELLOW}Max days reached without a winner.${C.RESET}`);
    } else if (ev.kind === "game_over") {
      const { winner, survivors, finalDay } = ev.data;
      const color = winner === "village" ? C.GREEN : C.RED;
      banner(`GAME OVER — ${color}${(winner || "no").toUpperCase()} WINS${C.RESET} on day ${finalDay}`, color);
      console.log(`\n${C.DIM}Survivors:${C.RESET}`);
      for (const name of survivors) {
        const role = initialRoles[name] || "?";
        const roleColor = role === "werewolf" ? C.RED : C.GREEN;
        console.log(`  ${roleColor}${name.padEnd(10)}${C.RESET} ${C.DIM}·${C.RESET} ${role}`);
      }
    }
  }
}

function printStats(transcript) {
  const counts = {};
  for (const ev of transcript.events) counts[ev.kind] = (counts[ev.kind] || 0) + 1;
  console.log(`\n${C.DIM}── Transcript stats ──${C.RESET}`);
  console.log(`${C.DIM}Total events: ${transcript.events.length}${C.RESET}`);
  for (const k of ["speech", "vote_cast", "death", "role_claim", "wolves_decided", "night_action", "validator_correction"]) {
    if (counts[k]) console.log(`${C.DIM}  ${k.padEnd(24)} ${counts[k]}${C.RESET}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { seed: null, players: 8, rounds: 2, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--seed") args.seed = parseInt(argv[++i], 10);
    else if (argv[i] === "--players") args.players = parseInt(argv[++i], 10);
    else if (argv[i] === "--rounds") args.rounds = parseInt(argv[++i], 10);
    else if (argv[i] === "--quiet") args.quiet = true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const seed = args.seed !== null ? args.seed : Math.floor(Math.random() * 100000);

console.log(`${C.DIM}Seed: ${seed}${C.RESET}`);

const namePool = ["Alice", "Bob", "Carol", "Diana", "Eli", "Frank", "Grace", "Henry", "Iris"];
const names = namePool.slice(0, args.players);

const state = GameState.fromConfig({
  playerNames: names,
  rng: new SeededRng(seed),
});
const client = new FakeClaudeClient(new SeededRng(seed + 1));

const { transcript, winner } = runGame(state, client, { discussionRounds: args.rounds });

if (!args.quiet) {
  renderTranscript(transcript);
  printStats(transcript);
} else {
  console.log(`Winner: ${winner || "no winner"} on day ${state.day}`);
}

process.exit(winner !== null ? 0 : 1);
