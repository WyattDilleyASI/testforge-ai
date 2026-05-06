// ═══════════════════════════════════════════════════════════════════════════
// fake_claude.js — Slightly-smart stand-in for the real Claude client.
//
// Same interface as the eventual real claude_client.js:
//
//     response = client.call(player, state, task)
//
// Returns an object matching the structured output the real Claude will
// produce. Knows enough about the game to play recognizable Werewolf.
//
// Strategy by role
// ----------------
// - Wolves: pick a non-wolf target, prefer revealed seers/bodyguards,
//   coordinate via the wolves' chat by proposing then consensusing.
// - Seer: investigate someone unknown; reveal once they've found a
//   confirmed wolf and a day or two has passed.
// - Bodyguard: protect whoever has been most accused recently. Never the
//   same person twice in a row (rule-enforced anyway).
// - Villager: vote for the most-accused player, trust seer claims.
//
// What this is NOT
// ----------------
// - Not optimal. Designed to produce VARIED games — sometimes village
//   wins, sometimes wolves do. Real Claude will be much more interesting.
// - Speeches drawn from a small canned pool. Real Claude will produce
//   real prose. The pool exists so the transcript reads as a game, not
//   as a stream of identical stub strings.
// ═══════════════════════════════════════════════════════════════════════════

const { Channel, Team } = require("./roles");

// ─── Speech pools ──────────────────────────────────────────────────────────

const WOLF_SPEECHES = [
  "I think we should slow down before accusing anyone.",
  "{target} has been awfully quiet today — that's suspicious.",
  "I'm just a regular villager, you're barking up the wrong tree.",
  "Whoever killed {victim} clearly knew what they were doing.",
  "Let's not jump to conclusions without evidence.",
  "I trust {ally} — they've been making good points.",
];

const VILLAGER_SPEECHES = [
  "I don't trust {target}. Their story doesn't add up.",
  "We need to vote together or the wolves will pick us off.",
  "Has anyone noticed {target} hasn't said much?",
  "I think {target} is dodging the question.",
  "If I were a wolf, I wouldn't be defending people this hard.",
  "We lost {victim} last night — we need to be sharper today.",
];

const SEER_SPEECHES_QUIET = [
  "I'm watching everyone carefully. Patience.",
  "Let's hear what {target} has to say first.",
  "I have my suspicions but I want to be sure.",
];

const SEER_SPEECHES_REVEAL = [
  "I'm the seer. {target} is a wolf — I saw it last night.",
  "Listen — I've been investigating. {target} is not who they claim.",
  "I have to come forward. {target} is a confirmed wolf.",
];

const BODYGUARD_SPEECHES = [
  "I'm not saying who, but someone's been protected.",
  "We need to think about who the wolves would target next.",
  "I trust the seer if they reveal — let's hear them out.",
  "Whoever is special, stay alive — we need you.",
];

// Simple template formatter: "{target}" → values.target
function fmt(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`);
}

// ─── The fake client ───────────────────────────────────────────────────────

class FakeClaudeClient {
  constructor(rng) {
    this.rng = rng;
    // Per-player memory the real Claude doesn't need. Real Claude carries
    // its memory in the prompt context; the fake needs explicit state.
    this.seerKnowledge = {};   // name -> Team learned
    this.hasRevealed = new Set(); // seer names who've revealed
  }

  call(player, state, task) {
    switch (task) {
      case "wolf_propose":   return this._wolfPropose(player, state);
      case "wolf_consensus": return this._wolfConsensus(player, state);
      case "investigate":    return this._investigate(player, state);
      case "protect":        return this._protect(player, state);
      case "speak":          return this._speak(player, state);
      case "vote":           return this._vote(player, state);
      default: throw new Error(`Unknown task: ${JSON.stringify(task)}`);
    }
  }

  // ── Night actions ────────────────────────────────────────────────────────

  _wolfPropose(player, state) {
    const candidates = state.livingPlayers()
      .filter(p => p.team === Team.VILLAGE)
      .map(p => p.name);

    // Bias: target anyone who claimed seer/bodyguard publicly.
    for (const p of state.livingPlayers()) {
      if (p.team === Team.VILLAGE && (p.claimedRole === "seer" || p.claimedRole === "bodyguard")) {
        return {
          target: p.name,
          reasoning: `${p.name} claimed ${p.claimedRole} — top priority.`,
        };
      }
    }
    const target = this.rng.choice(candidates);
    return {
      target,
      reasoning: `${target} seems active in discussion — eliminate them.`,
    };
  }

  _wolfConsensus(player, state) {
    // Find the most recent proposal from a teammate in the wolves' chat.
    const chat = state.getChannel(Channel.WOLVES_CHAT);
    for (let i = chat.length - 1; i >= 0; i--) {
      const entry = chat[i];
      if (entry.speaker !== player.name && entry.text.includes("PROPOSE:")) {
        const after = entry.text.split("PROPOSE:")[1];
        const target = (after.split(/\s+/)[0] || "").replace(/[.,]+$/, "");
        try {
          if (state.getPlayer(target).alive) {
            return { target, reasoning: `Agreed — ${target} is the right call.` };
          }
        } catch { /* not a real player, fall through */ }
      }
    }
    return this._wolfPropose(player, state);
  }

  _investigate(player, state) {
    // Don't re-investigate someone already known.
    let candidates = state.livingPlayers()
      .filter(p => p.name !== player.name && !(p.name in this.seerKnowledge))
      .map(p => p.name);
    if (candidates.length === 0) {
      candidates = state.livingPlayers()
        .filter(p => p.name !== player.name)
        .map(p => p.name);
    }
    const target = this.rng.choice(candidates);
    // Record what we'll learn so future _speak/_vote can use it.
    this.seerKnowledge[target] = state.getPlayer(target).team;
    return {
      target,
      reasoning: `Investigating ${target} — they've been notable today.`,
    };
  }

  _protect(player, state) {
    const candidates = state.livingPlayers()
      .filter(p => p.name !== state.lastProtected)
      .map(p => p.name);

    // Heuristic: count name mentions in recent town square as accusations.
    const recent = state.getChannel(Channel.TOWN_SQUARE, { recentDays: 1 });
    const accusationCounts = {};
    for (const entry of recent) {
      for (const p of state.livingPlayers()) {
        if (entry.text.includes(p.name) && p.name !== entry.speaker) {
          accusationCounts[p.name] = (accusationCounts[p.name] || 0) + 1;
        }
      }
    }

    if (Object.keys(accusationCounts).length > 0) {
      const sorted = Object.entries(accusationCounts).sort((a, b) => b[1] - a[1]);
      for (const [name] of sorted) {
        if (candidates.includes(name)) {
          return {
            target: name,
            reasoning: `${name} has been heavily accused — protecting them.`,
          };
        }
      }
    }

    if (candidates.includes(player.name)) {
      return {
        target: player.name,
        reasoning: "Protecting myself tonight, no clear target.",
      };
    }
    const target = this.rng.choice(candidates);
    return { target, reasoning: `Protecting ${target} on a hunch.` };
  }

  // ── Day actions ──────────────────────────────────────────────────────────

  _speak(player, state) {
    const living = state.livingPlayers().filter(p => p.name !== player.name);
    const targetName = living.length > 0 ? this.rng.choice(living).name : "no one";

    const recentDeaths = state.players
      .filter(p => !p.alive && p.deathDay === state.day)
      .map(p => p.name);
    const victim = recentDeaths.length > 0 ? recentDeaths[0] : "the last victim";

    if (player.role.name === "werewolf") {
      const allies = state.livingPlayers()
        .filter(p => p.team === Team.WOLVES && p.name !== player.name)
        .map(p => p.name);
      const ally = allies.length > 0 ? allies[0] : "no one";
      const template = this.rng.choice(WOLF_SPEECHES);
      return {
        speech: fmt(template, { target: targetName, victim, ally }),
        privateReasoning: "Deflecting suspicion, blending with the village.",
        claimRole: null,
      };
    }

    if (player.role.name === "seer") {
      const confirmedWolves = Object.entries(this.seerKnowledge)
        .filter(([name, team]) => {
          if (team !== Team.WOLVES) return false;
          try { return state.getPlayer(name).alive; } catch { return false; }
        })
        .map(([name]) => name);

      if (
        confirmedWolves.length > 0
        && !this.hasRevealed.has(player.name)
        && state.day >= 2
      ) {
        const wolf = confirmedWolves[0];
        this.hasRevealed.add(player.name);
        const template = this.rng.choice(SEER_SPEECHES_REVEAL);
        return {
          speech: fmt(template, { target: wolf }),
          privateReasoning: `Revealing — ${wolf} is confirmed wolf, time is short.`,
          claimRole: "seer",
        };
      }

      if (this.hasRevealed.has(player.name)) {
        const stillAlive = Object.entries(this.seerKnowledge)
          .filter(([n, t]) => {
            if (t !== Team.WOLVES) return false;
            try { return state.getPlayer(n).alive; } catch { return false; }
          })
          .map(([n]) => n);
        if (stillAlive.length > 0) {
          return {
            speech: `Still saying it — ${stillAlive[0]} is a wolf. Vote them.`,
            privateReasoning: "Already revealed, doubling down.",
            claimRole: "seer",
          };
        }
      }

      const template = this.rng.choice(SEER_SPEECHES_QUIET);
      return {
        speech: fmt(template, { target: targetName }),
        privateReasoning: "Holding the reveal, gathering more info.",
        claimRole: null,
      };
    }

    if (player.role.name === "bodyguard") {
      const template = this.rng.choice(BODYGUARD_SPEECHES);
      return {
        speech: fmt(template, { target: targetName }),
        privateReasoning: "Keeping a low profile, supporting the seer if they reveal.",
        claimRole: null,
      };
    }

    // villager
    const template = this.rng.choice(VILLAGER_SPEECHES);
    return {
      speech: fmt(template, { target: targetName, victim }),
      privateReasoning: "Trying to read the room.",
      claimRole: null,
    };
  }

  _vote(player, state) {
    const living = state.livingPlayers()
      .filter(p => p.name !== player.name)
      .map(p => p.name);

    if (player.role.name === "werewolf") {
      const recent = state.getChannel(Channel.TOWN_SQUARE, { recentDays: 1 });
      const counts = {};
      for (const entry of recent) {
        for (const p of state.livingPlayers()) {
          if (
            entry.text.includes(p.name)
            && p.name !== entry.speaker
            && p.team === Team.VILLAGE
          ) {
            counts[p.name] = (counts[p.name] || 0) + 1;
          }
        }
      }
      if (Object.keys(counts).length > 0) {
        const target = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
        return { vote: target, reasoning: "Riding the bandwagon." };
      }
      const nonWolves = state.livingPlayers()
        .filter(p => p.team === Team.VILLAGE)
        .map(p => p.name);
      return {
        vote: nonWolves.length > 0 ? this.rng.choice(nonWolves) : living[0],
        reasoning: "Picking off a villager.",
      };
    }

    if (player.role.name === "seer") {
      // Vote for known wolf if any are alive.
      for (const [name, team] of Object.entries(this.seerKnowledge)) {
        if (team === Team.WOLVES) {
          try {
            if (state.getPlayer(name).alive) {
              return { vote: name, reasoning: "I know they're a wolf." };
            }
          } catch { /* not a real player anymore */ }
        }
      }
      return this._voteWithAccusations(player, state);
    }

    // villager or bodyguard — trust seer claim if any
    for (const p of state.livingPlayers()) {
      if (p.claimedRole === "seer" && p.name !== player.name) {
        const recent = state.getChannel(Channel.TOWN_SQUARE, { recentDays: 1 });
        for (let i = recent.length - 1; i >= 0; i--) {
          const entry = recent[i];
          if (entry.speaker === p.name) {
            for (const other of state.livingPlayers()) {
              if (
                entry.text.includes(other.name)
                && other.name !== p.name
                && other.name !== player.name
              ) {
                return {
                  vote: other.name,
                  reasoning: `Trusting the seer (${p.name}).`,
                };
              }
            }
          }
        }
      }
    }
    return this._voteWithAccusations(player, state);
  }

  _voteWithAccusations(player, state) {
    const recent = state.getChannel(Channel.TOWN_SQUARE, { recentDays: 1 });
    const counts = {};
    for (const entry of recent) {
      for (const p of state.livingPlayers()) {
        if (
          entry.text.includes(p.name)
          && p.name !== entry.speaker
          && p.name !== player.name
        ) {
          counts[p.name] = (counts[p.name] || 0) + 1;
        }
      }
    }
    if (Object.keys(counts).length > 0) {
      const target = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
      return { vote: target, reasoning: "Most suspicious based on discussion." };
    }
    const living = state.livingPlayers()
      .filter(p => p.name !== player.name)
      .map(p => p.name);
    return {
      vote: this.rng.choice(living),
      reasoning: "No clear suspect; picking on a hunch.",
    };
  }
}

module.exports = { FakeClaudeClient };
