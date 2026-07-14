'use strict';
/* Overlay renderer: display-only view of engine output pushed from the main process. */

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

window.draftApi.onStatus((p) => {
  $('statusText').textContent = p.text + (p.patch ? `  ·  patch ${p.patch}` : '');
  $('dot').className = p.connected ? 'on' : '';
});

window.draftApi.onInteractive((p) => {
  $('mode').textContent = p.clickThrough ? 'ghost' : 'interactive';
});

window.draftApi.onDraftEnd(() => {
  $('main').innerHTML = '<p class="hint">Champ select ended. GLHF! Waiting for the next draft…</p>';
});

window.draftApi.onDraft((p) => {
  const s = p.state || {};
  let html = '';

  const bansA = (s.bans && s.bans.ally) || [];
  const bansE = (s.bans && s.bans.enemy) || [];
  if (bansA.length || bansE.length) {
    html += '<h2>Bans</h2><div class="bans">';
    html += `<span>Yours: <b>${bansA.map(esc).join(', ') || '—'}</b></span>`;
    html += `<span>Enemy: <b>${bansE.map(esc).join(', ') || '—'}</b></span></div>`;
  }

  const enemies = (s.enemyTeam || []).map((e) => e.champion).filter(Boolean);
  if (enemies.length) {
    html += `<h2>Enemy picks</h2><div class="bans"><span>${enemies.map(esc).join(', ')}</span></div>`;
  }

  const picks = p.picks || [];
  if (picks.length && !(s.me && s.me.lockedChampion)) {
    html += `<h2>Pick suggestions ${s.me && s.me.role ? '· ' + esc(s.me.role) : ''}</h2>`;
    const max = picks[0].score || 1;
    for (const r of picks.slice(0, 6)) {
      const icon = p.icons && p.icons[r.champion];
      html += `<div class="pick">${icon ? `<img src="${esc(icon)}" alt=""/>` : ''}<div class="body">
        <div class="top"><span class="name">${esc(r.champion)}</span>
          ${r.tier ? `<span class="tier">${esc(r.tier)}</span>` : ''}
          ${r.winRate != null ? `<span class="wr">${r.winRate.toFixed(1)}% WR</span>` : ''}</div>
        <div class="why">${esc(r.reasons.slice(0, 3).join(' · '))}</div>
        <div class="bar"><i style="width:${Math.max(6, Math.round((r.score / max) * 100))}%"></i></div>
      </div></div>`;
    }
  }

  if (p.runes) {
    const g = p.runes.page || {};
    html += `<h2>Runes — ${esc(p.runes.champion)}${p.runes.locked ? '' : ' (hover)'}</h2><div class="runebox">
      <div class="ks">${esc(g.primaryTree)} · ${esc(g.keystone)}</div>
      <div class="row">${(g.primary || []).map(esc).join(' · ')}</div>
      <div class="row">${esc(g.secondaryTree)}: ${(g.secondary || []).map(esc).join(' · ')}</div>
      <div class="row">Shards: ${(g.shards || []).map(esc).join(' / ')}</div>
      ${(p.runes.notes || []).map((n) => `<div class="note">▸ ${esc(n)}</div>`).join('')}
      <div class="src">source: ${esc(p.runes.source)}</div>
    </div>`;
  }

  if (p.items) {
    const b = p.items.build || {};
    html += `<h2>Build — ${esc(p.items.champion)}</h2><div class="itembox">
      <div class="row">Start: ${esc(b.starter)}</div>
      <div class="row">Boots: ${esc(b.boots)}</div>
      <div class="row">Core: ${(b.core || []).map(esc).join(' → ')}</div>
      ${(p.items.situational || []).map((s2) => `<div class="sit"><b>${esc(s2.item)}</b> <span>— ${esc(s2.why)}</span></div>`).join('')}
      <div class="src">source: ${esc(p.items.source)}</div>
    </div>`;
  }

  if (!html) html = '<p class="hint">In champ select — waiting for role assignment / first events…</p>';
  $('main').innerHTML = html;
});

window.draftApi.getBootstrap().then((b) => {
  if (b && b.patch) $('statusText').textContent = `Ready · snapshot patch ${b.patch}`;
});
