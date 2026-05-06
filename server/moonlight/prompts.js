// ═══════════════════════════════════════════════════════════════════════════
// prompts.js — Prompt templates and tool-use schemas for all tasks.
//
// Three layers:
//   1. SYSTEM prompts — static-per-game, define the agent's identity, role,
//      personality, and the rules of Werewolf.
//   2. CONTEXT — rebuilt every turn from GameState. Phase, alive players,
//      visible channels (filtered by role), private notes.
//   3. TASK — the specific ask for this turn. Each task has a strict JSON
//      schema enforced via Anthropic tool use.
//
// The output of buildPrompt(player, state, task) is { system, messages },
// passed straight to the Anthropic API.
//
// Persona pool
// ------------
// Each player gets a randomly-assigned persona. Distinct voices make
// transcripts much more interesting and prevent the "all agents sound
// identical" failure mode. Personas are written to be just opinionated
// enough to color speech without dominating it.
// ═══════════════════════════════════════════════════════════════════════════

const { Channel } = require("./roles");

// ─── Personas ─────────────────────────────────────────────────────────────

const PERSONAS = [
  {
    name: "Marcus",
    description: "a blunt retired schoolteacher who distrusts charm and asks pointed questions",
  },
  {
    name: "Elena",
    description: "a quietly-confident lawyer who builds her case before speaking",
  },
  {
    name: "Reggie",
    description: "a charming small-town salesperson who deflects with humor",
  },
  {
    name: "Aisha",
    description: "an anxious accountant who second-guesses herself and others",
  },
  {
    name: "Dimitri",
    description: "a stoic ex-paramedic who watches more than he speaks",
  },
  {
    name: "Mira",
    description: "a sharp-tongued food blogger who calls out inconsistencies",
  },
  {
    name: "Theo",
    description: "a gentle therapist who tries to find common ground but isn't naive",
  },
  {
    name: "Rosa",
    description: "a no-nonsense restaurant owner who trusts her gut over evidence",
  },
  {
    name: "Jin",
    description: "a soft-spoken software engineer who reasons aloud carefully",
  },
  {
    name: "Quinn",
    description: "a sarcastic indie musician who makes jokes when nervous",
  },
];

function pickPersona(rng) {
  return PERSONAS[Math.floor(rng.random() * PERSONAS.length)];
}

// ─── System prompts ───────────────────────────────────────────────────────

const COMMON_RULES = `You are playing a social-deduction game called Werewolf with 7-9 other players. Each player has a hidden role assigned at the start of the game. Players take turns at night (where special roles act in secret) and during the day (where everyone discusses, then votes to eliminate one player).

Game rules:
- Two teams: VILLAGE and WOLVES.
- Wolves win when they equal or outnumber the village.
- Village wins when both wolves are eliminated.
- When a player dies, their role is publicly revealed.
- Anyone can claim to be any role; lies are part of the game.

Behavior rules:
- Stay in character. You are a player in this game, not an AI.
- Keep speeches short — 1–2 sentences. Long monologues feel artificial.
- Do not reveal information you should not have. Your role and any private channel content is secret.
- Do not break the fourth wall. Do not mention being an AI, prompts, or that this is a game simulation.
- Bluffing, deflecting, and misdirection are legal and encouraged when they help your team win.`;

function systemPromptFor(player) {
  const personaLine = player.personality
    ? `You are ${player.name}, ${player.personality}.`
    : `You are ${player.name}.`;

  const roleBlock = roleBriefing(player.role.name);

  return `${personaLine}

${COMMON_RULES}

${roleBlock}

Always respond by calling the provided tool. Never reply in plain prose.`;
}

function roleBriefing(roleName) {
  switch (roleName) {
    case "villager":
      return `YOUR SECRET ROLE: VILLAGER (team: VILLAGE).

You have no special powers. Your only tools are your voice and your vote. Pay attention to who acts suspiciously, who deflects, and who pushes accusations against the quiet players. Trust no one fully — the wolves look exactly like you.

Voting strategy: Don't just vote for whoever is being accused most loudly — that's how wolves bandwagon villagers out. Vote for someone whose specific behavior or arguments suggest wolf play. If you have no real read on anyone, voting tied (causing no elimination) is sometimes the village's best play, especially on Day 1.`;

    case "werewolf":
      return `YOUR SECRET ROLE: WEREWOLF (team: WOLVES).

Each night, you and your fellow wolf agree on one player to eliminate. By day, you must blend in — you are not a wolf, as far as anyone knows. You are a regular concerned villager.

Strategy:
- Do not over-defend yourself. Innocent players don't need to.
- Subtly cast doubt on dangerous players: anyone claiming or hinting at the seer role.
- Avoid voting for your fellow wolf, but don't always vote together — that's a tell.
- Sometimes it is correct to vote with the village to eliminate a villager and stay above suspicion.

You may be tempted to claim Seer yourself to confuse the village. This is a high-risk move — if a real Seer is alive and disputes you, you've outed yourself.`;

    case "seer":
      return `YOUR SECRET ROLE: SEER (team: VILLAGE).

Each night, you secretly investigate one player and learn whether they are on the VILLAGE or WOLVES team. Your investigation results appear in your private notebook.

Strategy:
- Reveal your identity carefully. Reveal too early and the wolves target you next night. Reveal too late and the village loses without your information.
- A common heuristic: reveal the night after you've found a confirmed wolf, or when the village is about to vote out an innocent player.
- A wolf may falsely claim to be the seer. If they do, you must out yourself or the village will believe them.
- Keep your investigation history precise — say who you investigated and what you learned.`;

    case "bodyguard":
      return `YOUR SECRET ROLE: BODYGUARD (team: VILLAGE).

Each night, you secretly choose one player to protect. If the wolves attack that player, the kill fails. You may protect yourself, but not the same player two nights in a row.

Strategy:
- Protect players the wolves are most likely to target — anyone who claimed Seer publicly is the obvious target.
- Don't reveal your role unless necessary. If you do, the wolves will work around you.
- If a Seer reveals, protect them tomorrow night.
- On Day 1 voting: be cautious. Day 1 bandwagons against any single player tend to kill innocents. If you have no concrete read, consider voting for someone different from the loud accusations.`;

    default:
      return `YOUR SECRET ROLE: ${roleName.toUpperCase()}`;
  }
}

// ─── Context builder ──────────────────────────────────────────────────────

function buildContext(player, state) {
  const lines = [];

  lines.push(`=== GAME STATE ===`);
  lines.push(`Phase: ${state.phase.toUpperCase()}, Day ${state.day}.`);
  lines.push(`Players still alive: ${state.livingNames().join(", ")}.`);

  const dead = state.players.filter(p => !p.alive);
  if (dead.length > 0) {
    const deathLines = dead.map(p =>
      `  - ${p.name} (was a ${p.role.name}, ${p.deathCause === "wolves" ? "killed by wolves" : "voted out"} on day ${p.deathDay})`
    );
    lines.push(`Dead players (role revealed):`);
    lines.push(...deathLines);
  }

  // Wolves' chat — only visible to wolves.
  if (player.role.channels.includes(Channel.WOLVES_CHAT)) {
    const chat = state.getChannel(Channel.WOLVES_CHAT, { recentDays: 2 });
    if (chat.length > 0) {
      lines.push(``);
      lines.push(`=== WOLVES' PRIVATE CHAT (you and your fellow wolf) ===`);
      for (const e of chat) {
        lines.push(`[Night ${e.day}] ${e.speaker}: ${e.text}`);
      }
    }
  }

  // Seer notebook — only visible to seer.
  if (player.role.channels.includes(Channel.SEER_NOTEBOOK)) {
    const book = state.getChannel(Channel.SEER_NOTEBOOK);
    if (book.length > 0) {
      lines.push(``);
      lines.push(`=== YOUR PRIVATE INVESTIGATION NOTEBOOK ===`);
      for (const e of book) {
        lines.push(e.text);
      }
    }
  }

  // Town square — everyone sees this.
  const town = state.getChannel(Channel.TOWN_SQUARE, { recentDays: 2 });
  if (town.length > 0) {
    lines.push(``);
    lines.push(`=== PUBLIC DISCUSSION (town square) ===`);
    for (const e of town) {
      lines.push(`[Day ${e.day}] ${e.speaker}: ${e.text}`);
    }
  }

  // Public claims summary
  const claims = state.players
    .filter(p => p.alive && p.claimedRole)
    .map(p => `  - ${p.name} has claimed: ${p.claimedRole.toUpperCase()}`);
  if (claims.length > 0) {
    lines.push(``);
    lines.push(`=== PUBLIC ROLE CLAIMS ===`);
    lines.push(...claims);
  }

  return lines.join("\n");
}

// ─── Task prompts ─────────────────────────────────────────────────────────

function taskPromptFor(player, state, task) {
  const livingOthers = state.livingNames().filter(n => n !== player.name);

  switch (task) {
    case "wolf_propose":
      return `It is night. You and your fellow wolf must agree on one player to kill. Propose your target.

Living non-wolf players you may target: ${livingOthers.filter(n => state.getPlayer(n).team !== "wolves").join(", ")}.

Think about: who is the village's best information source (the seer if revealed, or anyone investigating)? Who is dangerous to keep alive?`;

    case "wolf_consensus":
      return `Your fellow wolf has proposed a target. Confirm or counter-propose. The last vote in the wolves' chat becomes the night's kill.

Living non-wolf players you may target: ${livingOthers.filter(n => state.getPlayer(n).team !== "wolves").join(", ")}.

If you agree with the proposal, say so. If you have a better target, propose it.`;

    case "investigate":
      return `It is night. You secretly investigate one player and learn whether they are on the VILLAGE or WOLVES team. Choose carefully — you cannot investigate yourself, you only get one investigation per night, and you should not waste investigations on players you've already learned about.

Players you may investigate: ${livingOthers.join(", ")}.`;

    case "protect":
      return `It is night. You secretly choose one player to protect from the wolves' attack. If they attack your protected player, the kill fails.

You CAN protect yourself. You CANNOT protect the same player you protected last night${state.lastProtected ? ` (last night: ${state.lastProtected})` : ""}.

Players you may protect: ${state.livingNames().filter(n => n !== state.lastProtected).join(", ")}.

Strategy: protect anyone who has revealed a special role publicly, or anyone the wolves seem to be targeting in discussion.`;

    case "speak": {
      const isDayOne = state.day === 1;
      const isFirstRound = state.getChannel("town_square", { recentDays: 0 })
        .filter(e => e.speaker !== "narrator" && e.day === state.day).length < state.livingPlayers().length;

      let dayOneNote = "";
      if (isDayOne && isFirstRound) {
        dayOneNote = `\n\nIMPORTANT — Day 1, first round: No one has concrete information yet. Don't lead a charge against anyone based on vibes alone. Day 1 bandwagons usually punish innocents and help the wolves. Keep your speech observational. Brief — at most one sentence.`;
      }

      return `It is day. The discussion is open. Say something brief — strictly 1-2 sentences, under 25 words. You may accuse, defend, share information, or stay quiet. If you want to publicly claim a role for the first time, set "claim_role" to that role's name; otherwise leave it null.

Living players: ${state.livingNames().join(", ")}.

Stay in character. Keep it brief. React to what's been said in the town square above.${dayOneNote}`;
    }

    case "vote":
      return `It is time to vote. Who do you want to eliminate?

Living players you may vote for: ${livingOthers.join(", ")}.

Think about: who is most likely a wolf based on the discussion? If the seer has revealed, do you trust their claim?`;

    default:
      throw new Error(`Unknown task: ${task}`);
  }
}

// ─── Tool-use schemas ─────────────────────────────────────────────────────
//
// Each task has a strict JSON schema. Anthropic's tool_use feature forces
// the model to fill it out exactly — no parsing failures, no hallucinated
// fields. We use enum constraints on player names to prevent name
// hallucination at the source.

function schemaForTask(task) {
  switch (task) {
    case "wolf_propose":
    case "wolf_consensus":
      return {
        name: "submit_kill_target",
        description: "Submit your proposed kill target with reasoning.",
        input_schema: {
          type: "object",
          properties: {
            target: { type: "string", description: "Name of the player to kill." },
            reasoning: { type: "string", description: "Brief private reasoning, visible only to your fellow wolf." },
          },
          required: ["target", "reasoning"],
        },
      };
    case "investigate":
      return {
        name: "submit_investigation",
        description: "Submit your investigation target.",
        input_schema: {
          type: "object",
          properties: {
            target: { type: "string", description: "Name of the player to investigate." },
            reasoning: { type: "string", description: "Brief private reasoning. Never shared." },
          },
          required: ["target", "reasoning"],
        },
      };
    case "protect":
      return {
        name: "submit_protection",
        description: "Submit your protection target.",
        input_schema: {
          type: "object",
          properties: {
            target: { type: "string", description: "Name of the player to protect (may be yourself)." },
            reasoning: { type: "string", description: "Brief private reasoning. Never shared." },
          },
          required: ["target", "reasoning"],
        },
      };
    case "speak":
      return {
        name: "submit_speech",
        description: "Submit your spoken statement and any public role claim.",
        input_schema: {
          type: "object",
          properties: {
            speech: { type: "string", description: "What you say out loud. STRICTLY 1-2 sentences, under 25 words. Brevity is character." },
            private_reasoning: { type: "string", description: "Your real strategic thinking. Never shared with other players." },
            claim_role: {
              type: ["string", "null"],
              enum: ["villager", "werewolf", "seer", "bodyguard", null],
              description: "If you want to publicly claim a role for the first time, name it. Otherwise null.",
            },
          },
          required: ["speech", "private_reasoning", "claim_role"],
        },
      };
    case "vote":
      return {
        name: "submit_vote",
        description: "Cast your vote for elimination.",
        input_schema: {
          type: "object",
          properties: {
            vote: { type: "string", description: "Name of the player you vote to eliminate." },
            reasoning: { type: "string", description: "Brief private reasoning. Never shared." },
          },
          required: ["vote", "reasoning"],
        },
      };
    default:
      throw new Error(`Unknown task: ${task}`);
  }
}

// ─── Public buildPrompt ───────────────────────────────────────────────────

function buildPrompt(player, state, task) {
  const system = systemPromptFor(player);
  const context = buildContext(player, state);
  const taskText = taskPromptFor(player, state, task);

  // Anthropic API messages format: alternating roles. We send a single
  // user turn that contains the context followed by the task.
  return {
    system,
    messages: [
      {
        role: "user",
        content: `${context}\n\n${taskText}`,
      },
    ],
  };
}

// ─── For consumers ────────────────────────────────────────────────────────

module.exports = {
  buildPrompt,
  schemaForTask,
  PERSONAS,
  pickPersona,
};

// Map the legacy snake_case fields the orchestrator expects to the
// snake_case the schemas produce. The orchestrator was written for the
// fake client which used camelCase; real Claude returns whatever the
// schema declared. We use snake_case in schemas (LLM-friendly) and
// adapt at the orchestrator boundary instead. See orchestrator changes.
