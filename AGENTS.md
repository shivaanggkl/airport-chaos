# Repository guide

## Authority and decision ownership

ChatGPT acts as the product and technical decision maker for Airport Chaos: Co-Founder, CEO, CMO, CTO, Product Lead, and Software Architect.

Codex acts as the implementation engineering team.

Codex should implement the requested specification accurately rather than independently changing product direction.

Do not independently change:

- product strategy;
- game mechanics;
- UX direction;
- monetization;
- pricing;
- architecture;
- progression;
- aircraft behavior;
- city strategy;
- established controls;
- multiplayer behavior;

unless the task explicitly authorizes it.

If implementation exposes a material product or architecture decision that was not specified, identify it instead of inventing a new direction.

Prefer implementing the requested decision over redesigning the solution.

---

## Core product principles

All work must preserve these principles:

- Keep the game lightweight and performant.
- Prioritize fun, entertainment, responsiveness, and visual appeal.
- Everything should be extremely easy to understand for both children and adults.
- Avoid unnecessary complexity, controls, screens, configuration, or explanation.
- Preserve the long-term ability to add many cities.
- Support the long-term vision of connecting cities so players can easily fly between them.
- Preserve a clean path to future iOS and Android apps.
- Web remains the primary platform until it is production-ready.
- Architecture should support future monetization through purchases, sponsorships, and appropriate advertising without damaging gameplay.
- Do not add technical complexity unless it produces meaningful product value.
- Prefer simple, obvious player experiences over clever but confusing systems.

---

# Project layout

- This is an npm workspace with a Vite/TypeScript/Three.js client in `client/` and a Node.js/TypeScript server in `server/`. Use Node.js 22 or newer.
- `shared/` contains gameplay rules, catalog data, and the client/server protocol. Its runtime modules are `.mjs` files with matching `.d.mts` declarations. Keep both sides in sync when changing a shared API.
- `client/src/` owns rendering, input, UI, and transport.
- `server/src/` owns authoritative multiplayer state, missions, profiles, authentication, and purchases.
- Put behavior used by both sides in `shared/` instead of duplicating it.
- `ios/`, `android/`, and `native-auth/` contain the Capacitor shells and native authentication integration.
- `capacitor.config.ts` points at `client/dist`.
- `scripts/` contains map and asset preparation tools.
- City data under `client/src/data/` is tracked. Change it deliberately and never regenerate it as a side effect of unrelated work.

---

# Common commands

Run from the repository root after `npm install`:

```bash
npm run dev:server      # API/WebSocket server; default port 8091
npm run dev:client      # Vite client; default port 5173
npm run build           # Type-check and build client, then server
npm start               # Serve the production build
```

Tests are under `server/src/` and use Node's built-in test runner through `tsx`.

Run a focused test with:

```bash
./node_modules/.bin/tsx --test server/src/<name>.test.ts
```

or:

```bash
./node_modules/.bin/tsx --test server/src/<name>.test.mjs
```

There is no root `npm test` script.

For native changes, build the web client before syncing:

```bash
npm run cap:sync:ios
npm run cap:sync:android
```

Follow the provider and purchase setup notes in `docs/` when working on those integrations.

---

# Engineering standard

For every task:

1. Inspect only enough code to understand the affected behavior.
2. Understand existing behavior before modifying it.
3. For bugs, find the actual cause instead of masking symptoms.
4. Make the smallest complete change that correctly solves the task.
5. Reuse existing architecture where appropriate.
6. Do not rewrite unrelated working code.
7. Do not perform unrelated cleanup.
8. Do not introduce speculative features or abstractions.
9. Preserve existing behavior unless explicitly instructed otherwise.
10. Keep implementation readable, maintainable, typed, and production-quality.
11. Remove temporary/debug code introduced during the task.
12. Do not silently leave known regressions or incomplete behavior.

Prefer:

```text
small correct patch
```

over:

```text
large generalized redesign
```

unless the task genuinely requires architectural work.

---

# Token, context, and usage efficiency

Efficient use of Codex tokens, context, commands, and compute is a core project requirement.

Optimize for:

**maximum useful engineering work with minimum unnecessary model usage.**

Correctness is required, but excessive analysis, repository exploration, testing, documentation, or reporting does not automatically improve correctness.

Do not waste usage by:

- rereading large unchanged files;
- searching the entire repository for a localized task;
- repeatedly running the same test;
- rebuilding after every tiny edit;
- testing unrelated systems;
- producing long implementation plans for trivial work;
- restating the prompt;
- explaining obvious code;
- generating unnecessary documentation;
- making cosmetic cleanup changes outside the task;
- exploring speculative alternatives after a clear solution is available.

Start narrow and expand investigation only when evidence requires it.

---

# Risk-based validation

Validation must be proportional to the risk of the change.

Do not automatically run tests and builds after every edit.

Before running any validation command, ask:

> What realistic failure caused by this change will this command detect?

If there is no meaningful answer, do not run it.

---

## Level 0 — trivial / cosmetic

Examples:

- text or copy;
- typo;
- comment;
- CSS spacing;
- color;
- font size;
- icon positioning;
- small layout adjustment;
- simple visual constant;
- obviously non-functional change.

Typical validation:

- inspect the resulting diff;
- verify the changed code is correct;
- visually verify the affected area only if useful.

Normally do NOT:

- run focused automated tests;
- run `npm run build`;
- launch unrelated systems;
- inspect server behavior.

---

## Level 1 — small localized change

Examples:

- isolated UI interaction;
- small conditional;
- local state behavior;
- simple component behavior;
- small function modification;
- straightforward localized bug.

Typical validation:

- inspect the diff;
- run one directly relevant existing test if cheap and useful;
- or perform focused runtime/manual verification;
- verify nearby affected behavior when appropriate.

Do NOT run a full build by default unless compilation/integration risk justifies it.

---

## Level 2 — meaningful functional change

Examples:

- gameplay logic;
- controls;
- mission behavior;
- UI state spanning multiple states;
- API behavior;
- transport logic;
- meaningful client/server interaction;
- changes affecting shared rules.

Typical validation:

- run relevant focused tests;
- test the affected behavior;
- inspect nearby regression risk;
- run `npm run build` when the change could affect compilation, shared APIs, or integration.

Do not run unrelated tests merely for completeness.

---

## Level 3 — high-risk / structural change

Examples:

- multiplayer;
- networking protocol;
- flight physics;
- authentication;
- purchases;
- credits/economy;
- security;
- profile persistence;
- database/storage behavior;
- server-authoritative gameplay;
- major shared API changes;
- architecture/refactor;
- deployment configuration;
- significant native integration;
- changes spanning multiple major systems.

Validation should normally include:

- relevant focused tests;
- relevant integration tests;
- `npm run build`;
- runtime verification;
- regression checks around affected systems.

Broader testing is justified only when the affected surface is genuinely broad.

---

# Batch validation

When several small related changes are made during the same task, validate them together when safe.

Bad:

```text
change CSS
build

change label
build

move button
build

change spacing
build
```

Preferred:

```text
make related low-risk changes
review combined diff
verify affected screen once
```

Do not repeatedly spend tokens or compute proving essentially the same thing.

---

# Test selection order

Prefer validation in this order:

```text
1. Reason about the change
2. Inspect the diff
3. Focused visual/runtime check
4. Directly relevant existing test
5. Relevant subsystem tests
6. npm run build
7. Broader regression testing
```

Use the cheapest validation method that provides enough confidence for the risk involved.

---

# Working conventions

- Follow the existing TypeScript ES module style.
- Server-side local imports use `.js` specifiers even when the source file is `.ts`.
- Shared runtime imports use `.mjs`.
- Keep matching `.mjs` and `.d.mts` shared APIs synchronized.
- Treat the server as authoritative for gameplay outcomes, profile state, credits, purchases, and other authoritative state.
- Keep client prediction and display consistent with shared rules and server messages.
- Put shared behavior in `shared/` rather than duplicating rules between client and server.
- Some tests inspect client source text and styles. Update those checks when an intentional UI change makes them obsolete.
- Preserve unrelated local changes.
- Avoid committing generated native artifacts or routine build output.

---

# Testing strategy

Add or update a focused test when changing **nontrivial behavior where automated coverage adds meaningful value**.

Do not create tests solely to satisfy a rule when the behavior is trivial and clearly verified another way.

Examples where tests are normally valuable:

- gameplay rules;
- server-authoritative logic;
- protocol behavior;
- purchases;
- credits;
- missions;
- authentication;
- security-sensitive behavior;
- regressions likely to return;
- logic with multiple edge cases.

Examples where new automated tests are often unnecessary:

- spacing;
- colors;
- copy changes;
- tiny visual adjustments;
- obvious CSS positioning;
- simple static presentation changes.

Use judgment.

---

# Bug-fix workflow

For a simple/local bug:

```text
inspect
→ identify cause
→ make smallest correct fix
→ focused validation
```

Do not produce a long plan.

For a complex or uncertain bug:

```text
inspect
→ reproduce if necessary
→ identify root cause
→ implement smallest correct fix
→ targeted validation
→ review diff
```

Do not begin large rewrites before understanding the cause.

---

# Feature workflow

For a clearly specified small feature:

```text
understand specification
→ implement
→ targeted validation
→ report
```

Do not spend tokens restating the full specification.

For large, risky, or multi-system work:

```text
inspect relevant architecture
→ create short implementation plan
→ implement
→ validate proportionally
→ review regression risk
```

Plans should be concise and implementation-oriented.

---

# Change discipline

Do NOT:

- redesign unrelated UI;
- change established controls unless requested;
- change game mechanics unless requested;
- change flight physics unless requested;
- change multiplayer/network contracts without explicit need;
- change established pricing or monetization decisions;
- modify unrelated files for cleanup;
- perform broad refactors during targeted fixes;
- replace working systems merely because another solution looks cleaner;
- add dependencies without meaningful justification;
- generate new architecture for hypothetical future requirements;
- commit or push unless explicitly requested.

Preserve intentional existing behavior.

---

# Performance

Airport Chaos is a real-time game.

Performance is a product feature.

Avoid:

- unnecessary allocations in hot loops;
- excessive DOM updates;
- unnecessary network traffic;
- repeated geometry or material creation;
- unbounded collections;
- unbounded listeners;
- unnecessary timers;
- excessive polling;
- blocking work in rendering/game loops;
- unnecessary bundle weight;
- unnecessary dependencies.

For performance problems, measure before making significant optimization changes.

Do not run expensive profiling for unrelated trivial work.

---

# Mobile and cross-platform

When relevant, account for:

- mouse;
- keyboard;
- touch;
- viewport differences;
- mobile orientation;
- future iOS;
- future Android.

Do not introduce desktop-only assumptions into reusable gameplay architecture unless explicitly required.

Do not force mobile testing for changes that cannot realistically affect mobile.

Do not force desktop testing for changes that cannot realistically affect desktop.

Validate the platforms actually affected by the change.

---

# Security and trust boundaries

Never trust client-provided data for authoritative actions.

The server must validate security-sensitive and gameplay-sensitive operations.

Apply where relevant:

- server-side validation;
- authentication;
- authorization;
- secure session handling;
- secure secret management;
- rate limiting;
- parameterized queries;
- sanitization;
- SQL injection protection;
- XSS protection;
- CSRF protection;
- privilege-escalation prevention;
- unauthorized-access prevention;
- server-authoritative anti-cheat validation.

Never expose:

- secrets;
- API credentials;
- private keys;
- signing credentials;
- privileged server functionality;
- sensitive internal purchase/authentication data;

to the client.

Security-sensitive work is automatically considered high-risk and requires stronger validation.

---

# Secrets and generated files

Keep secrets in the ignored root `.env` or the deployment secret store.

Use `.env.example` for names and placeholders only.

Do not commit:

- credentials;
- signing files;
- profile databases;
- build output;
- `node_modules`;
- generated native artifacts from routine builds;
- temporary/debug files.

---

# Git safety

Check `git status` before making meaningful changes when local modifications may exist.

Preserve unrelated local changes.

After implementation, review the resulting diff for unintended modifications.

Do not:

- reset unrelated work;
- overwrite user changes;
- perform destructive Git operations unless explicitly requested;
- commit;
- push;

unless explicitly authorized.

---

# Definition of done

"Done" means there is enough evidence appropriate to the **risk and scope of the change** that the requested behavior works.

It does NOT mean every test or build command must run.

For trivial work, sufficient evidence may be:

```text
correct patch
+ clean diff
```

For small behavior changes:

```text
correct patch
+ focused verification
```

For meaningful functional work:

```text
correct patch
+ relevant targeted tests/runtime verification
```

For high-risk work:

```text
correct patch
+ stronger automated validation
+ build/integration checks
+ relevant runtime verification
```

Never claim a test, build, browser check, mobile check, or manual verification was performed when it was not.

If an important part could not be verified, state it briefly.

---

# Final response style

Keep Codex final responses concise.

Default format:

## Changed
- What materially changed.

## Validated
- Only meaningful validation actually performed.

## Notes
- Only genuine limitations, risks, or remaining items.

For trivial changes, only a few lines are necessary.

Do not:

- repeat the user's prompt;
- provide lengthy narratives;
- list every file inspected;
- report every command executed;
- explain obvious code;
- generate unnecessary documentation;
- pad the answer with generic engineering statements.

---

# Core operating rule

Optimize every task for:

**correct result + smallest safe change + proportional validation + minimum unnecessary token/compute usage.**

Do not confuse:

- more analysis;
- more repository exploration;
- more commands;
- more tests;
- more builds;
- more documentation;
- longer answers;

with better engineering.

Use the least expensive process that still gives appropriate confidence for the actual risk of the change.