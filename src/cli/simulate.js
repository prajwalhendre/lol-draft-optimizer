'use strict';
// Manual draft mode — same draft-state interface as live mode, no League client needed.
// Usage:
//   npm run cli                          interactive
//   npm run cli -- --role mid --enemy Yasuo,Malzahar --ally Garen --ban Zed
const readline = require('readline');
const path = require('path');

const { loadStore } = require('../engine/store');
const { createDraftState } = require('../engine/draft');
const { recommendPicks } = require('../engine/recommend');
const { recommendRunes } = require('../engine/runes');
const { recommendItems } = require('../engine/items');

const ROOT = path.join(__dirname, '..', '..');
const { store, profile } = loadStore(ROOT);
const state = createDraftState();

const C = { dim: '\x1b[2m', cyan: '\x1b[36m', gold: '\x1b[33m', red: '\x1b[31m', green: '\x1b[32m', bold: '\x1b[1m', off: '\x1b[0m' };

function resolve(name) {
  const c = store.canonicalName(name);
  if (!c) console.log(`${C.red}Unknown/ambiguous champion: "${name}"${C.off}`);
  return c;
}

function show() {
  console.log(`\n${C.bold}— Draft state —${C.off}`);
  console.log(`Role: ${C.cyan}${state.me.role || 'unset (use: role <top|jungle|mid|adc|support>)'}${C.off}`);
  console.log(`Bans  yours: ${state.bans.ally.join(', ') || '—'} | enemy: ${state.bans.enemy.join(', ') || '—'}`);
  console.log(`Allies: ${state.myTeam.map((p) => p.champion).join(', ') || '—'}`);
  console.log(`Enemies: ${state.enemyTeam.map((p) => p.champion + (p.role ? ` (${p.role})` : '')).join(', ') || '—'}`);

  if (!state.me.role) return;
  const picks = recommendPicks(store, profile, state);
  if (!picks.length) { console.log(`${C.red}No champions available to recommend for ${state.me.role} — check data/meta_tier_snapshot.json${C.off}`); return; }
  console.log(`\n${C.bold}Pick suggestions (${state.me.role}):${C.off}`);
  picks.slice(0, 6).forEach((r, i) => {
    const wr = r.winRate != null ? ` ${C.dim}${r.winRate.toFixed(1)}% WR${C.off}` : '';
    const src = r.source === 'meta' ? ` ${C.cyan}[meta]${C.off}` : '';
    console.log(`  ${i + 1}. ${C.green}${r.champion}${C.off} ${C.gold}${r.tier || ''}${C.off} (${r.score})${wr}${src}`);
    console.log(`     ${C.dim}${r.reasons.join(' · ')}${C.off}`);
  });
}

function showLocked(champ) {
  const runes = recommendRunes(store, profile, state, champ);
  const items = recommendItems(store, profile, state, champ);
  const g = runes.page;
  console.log(`\n${C.bold}Runes — ${champ}${C.off} ${C.dim}(${runes.source})${C.off}`);
  console.log(`  ${C.gold}${g.primaryTree} · ${g.keystone}${C.off} | ${g.primary.join(' · ')}`);
  console.log(`  ${g.secondaryTree}: ${g.secondary.join(' · ')} | Shards: ${g.shards.join(' / ')}`);
  runes.notes.forEach((n) => console.log(`  ${C.cyan}▸ ${n}${C.off}`));
  const b = items.build;
  console.log(`\n${C.bold}Build — ${champ}${C.off} ${C.dim}(${items.source})${C.off}`);
  console.log(`  Start: ${b.starter} | Boots: ${b.boots}`);
  console.log(`  Core: ${b.core.join(' → ')}`);
  items.situational.forEach((s) => console.log(`  ${C.gold}${s.item}${C.off} ${C.dim}— ${s.why}${C.off}`));
}

const commands = {
  role(arg) {
    const r = { top: 'top', jungle: 'jungle', jg: 'jungle', mid: 'mid', adc: 'adc', bot: 'adc', support: 'support', sup: 'support' }[arg && arg.toLowerCase()];
    if (!r) return console.log(`${C.red}Usage: role <top|jungle|mid|adc|support>${C.off}`);
    state.me.role = r; show();
  },
  enemy(arg) {
    const [name, role] = arg.split(/\s+/);
    const c = resolve(name); if (!c) return;
    state.enemyTeam.push({ champion: c, role: role || (state.enemyTeam.length === 0 && state.me.role ? state.me.role : null), cellId: null, locked: true });
    show();
  },
  ally(arg) { const c = resolve(arg); if (!c) return; state.myTeam.push({ champion: c, role: null, cellId: null, locked: true }); show(); },
  ban(arg) { const c = resolve(arg); if (!c) return; state.bans.enemy.push(c); show(); },
  myban(arg) { const c = resolve(arg); if (!c) return; state.bans.ally.push(c); show(); },
  lock(arg) { const c = resolve(arg); if (!c) return; state.me.lockedChampion = c; state.myTeam.push({ champion: c, role: state.me.role, cellId: null, locked: true }); showLocked(c); },
  show() { show(); if (state.me.lockedChampion) showLocked(state.me.lockedChampion); },
  reset() { Object.assign(state, createDraftState()); console.log('Draft reset.'); },
  help() {
    console.log(`Commands:
  role <r>          your role (top/jungle/mid/adc/support)
  enemy <champ> [role]   add enemy pick (first enemy defaults to your lane)
  ally <champ>      add ally pick
  ban <champ>       enemy ban   |  myban <champ>   your team's ban
  lock <champ>      lock YOUR champion -> runes + build
  show | reset | quit`);
  },
  quit() { process.exit(0); },
  exit() { process.exit(0); },
};

// --- one-shot flag mode ---
const argv = process.argv.slice(2);
if (argv.length) {
  const flag = (f) => { const i = argv.indexOf(`--${f}`); return i >= 0 ? argv[i + 1] : null; };
  const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
  const roleArg = flag('role');
  if (roleArg) {
    state.me.role = { top: 'top', jungle: 'jungle', jg: 'jungle', mid: 'mid', adc: 'adc', bot: 'adc', support: 'support', sup: 'support' }[roleArg.toLowerCase()] || null;
  }
  list(flag('ban')).forEach((b) => { const c = resolve(b); if (c) state.bans.enemy.push(c); });
  list(flag('myban')).forEach((b) => { const c = resolve(b); if (c) state.bans.ally.push(c); });
  list(flag('ally')).forEach((a2) => { const c = resolve(a2); if (c) state.myTeam.push({ champion: c, role: null, cellId: null, locked: true }); });
  list(flag('enemy')).forEach((e2, i) => { const c = resolve(e2); if (c) state.enemyTeam.push({ champion: c, role: i === 0 && state.me.role ? state.me.role : null, cellId: null, locked: true }); });
  show();
  if (flag('lock')) { const c = resolve(flag('lock')); if (c) { state.me.lockedChampion = c; showLocked(c); } }
  process.exit(0);
}

// --- interactive mode ---
console.log(`${C.bold}LoL Draft Optimizer — manual mode${C.off} ${C.dim}(snapshot patch ${store.patch})${C.off}`);
commands.help();
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: `${C.cyan}draft> ${C.off}` });
rl.prompt();
rl.on('line', (line) => {
  const [cmd, ...rest] = line.trim().split(/\s+/);
  if (cmd) {
    const fn = commands[cmd.toLowerCase()];
    if (fn) fn(rest.join(' '));
    else console.log(`${C.red}Unknown command "${cmd}" — try: help${C.off}`);
  }
  rl.prompt();
});
