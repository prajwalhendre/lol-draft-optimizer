# LoL Draft Optimizer

A local-first League of Legends draft assistant for macOS. During champ select it reads the League client's own local API (LCU) — no typing, no OCR, no cloud — and shows a transparent always-on-top overlay with:

- **Pick suggestions** from *your* champion pool, ranked by comfort, current meta strength, counters vs the enemy draft, duo synergy, and team-comp gaps — re-ranked live on every ban/pick. Always shows at least 3 suggestions for your assigned role: if your pool can't provide that many (empty, banned out, or picked by either team), the gap is filled with the patch's best meta picks for that role, scored through the same counter/synergy/comp logic and clearly labeled `meta` vs your own `pool` picks.
- **Full team rosters** — ally and enemy, live — with each player's champion portrait, role, and lock status.
- **Splash-art visuals**: every champion shows their current official splash art (Data Dragon's live splash endpoint, so reworked champions always show up-to-date art with no manual patching needed). Once a player locks in, their splash art blurs and bleeds a few pixels past their row into the surrounding panel — and stays that way for the rest of the draft.
- **A lock-in effect** — an original golden beam/flash/shockwave animation plays on whichever roster row just locked in (bigger, centered, with a screen shake for your own lock; a smaller in-row version for teammates and enemies).
- **Runes** for your locked champion, adjusted for the actual lane matchup and enemy comp.
- **Item build** with situational counter-items (anti-heal, armor/MR, tenacity, anti-dive) as the enemy comp fills in.

Everything runs locally. No account, no Riot API key, no third-party scraping.

## Setup

```bash
cd lol-draft-optimizer
npm install          # installs ws + Electron
```

**Set your champion pool** — edit `data/profile.json`. Weight 1–5 per champion (5 = main). It ships with placeholder pools for top/mid/adc/support; replace them with your champs. Names use in-game display names (`Miss Fortune`, `Kai'Sa`, `Dr. Mundo`).

## Run

**Live overlay (with the League client):**

```bash
npm start
```

Launch the League client whenever — the overlay auto-detects it via the lockfile and connects. First run needs internet once to cache Riot Data Dragon (champion ids/icons); it's cached per patch afterward. Splash art loads live from Riot's CDN each session (not cached to disk), so it's always current.

Hotkeys: `⌘⇧O` toggle click-through ↔ interactive · `⌘⇧H` show/hide.

If your League install is non-standard, point the app at the lockfile:
`LOL_LOCKFILE="/path/to/League of Legends.app/Contents/LoL/lockfile" npm start`

**Manual mode (no client needed — plan drafts, test the engine):**

```bash
npm run cli                                            # interactive
npm run cli -- --role top --enemy Garen --lock Darius  # one-shot
```

**Tests:**

```bash
npm test
```

## How it works

```
League client (LCU) ──lockfile──> WebSocket subscription (champ-select session events)
        │                                     │
        └── Data Dragon (Riot: icons cached/patch, splash art live)  ▼
                    └────────────────────> canonical draft state ──> recommendation engine ──> overlay
CLI manual mode ───────────────────────────────────────────────┘
```

- `src/lcu/` — lockfile discovery, LCU WebSocket client, session → draft-state parser
- `src/engine/` — data store, pick scorer (pool + meta-fallback), rune + item recommenders, Data Dragon cache (icons + live splash art)
- `src/main/` — Electron main process; also diffs consecutive draft states to detect "just locked" transitions per player, driving the lock-in effect and resetting on reconnect/draft-end so it never replays for picks locked before you connected
- `src/renderer/` — the overlay itself: rosters, pick cards, splash-art bleed, lock-in FX (transparent, frameless, always-on-top, 440×760)
- `src/cli/` — manual draft mode behind the same draft-state interface

## Data files (and how to keep them fresh)

- **`data/meta_tier_snapshot.json`** — static per-patch tier/counter/duo snapshot (currently patch 26.13). *This is deliberately not a live feed* — see the proposal: no third-party stat-site APIs allow this use, so the refresh path is manual: re-pull the five per-role tier-list pages once per patch and regenerate this file wholesale. Two semantics the engine enforces (and tests): `score` is a composite metric used for ranking, **not** a win rate (`win_rate` is display-only); and `countered_by` on X lists champs **X struggles against**, so picks *into* enemy X come from X's own list.
- **`data/champion_knowledge.json`** — editable seed knowledge: champion attributes for comp scoring, plus default rune pages / builds (per-champion where curated, per-archetype fallback otherwise). Rune/item names are seed data — tweak per patch, the engine treats them as data.
- **`data/profile.json`** — your pool + optional per-champion rune/build overrides (they beat the knowledge base).

Champions that only appear in `tier_only_champions` have no counter data; the engine scores them on tier + comfort and says so, rather than penalizing missing data.

## Known limitations (v1, by design)

- Meta/counter snapshot drifts each patch until manually refreshed (see above).
- LCU champ-select payload fields drift slightly between client versions; the parser is defensive, and `LOL_DEBUG=1 npm start` logs raw sessions if something looks off.
- Enemy roles aren't exposed by the client; the engine treats your lane opponent as the enemy assigned to your role when known, otherwise weights all enemies equally.
- Splash art and the lock-in effect are overlay-only — `npm run cli` stays a plain-text draft planner, no visuals.
- Phase 4 (self-computed win rates via the official Riot `match-v5` API) is intentionally not built.

## macOS notes

Transparent always-on-top windows need no special permissions. If the overlay doesn't float above the League client in fullscreen, set League to Borderless. If Gatekeeper complains about the unsigned Electron binary on first `npm start`, allow it in System Settings → Privacy & Security (local dev app; notarization only matters if you distribute it).
