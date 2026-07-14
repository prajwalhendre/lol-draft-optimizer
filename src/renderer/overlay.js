'use strict';
/* Overlay renderer: display-only view of engine output pushed from the main process. */

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const bg = (url) => (url ? `background-image:url("${esc(url)}");` : '');

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

function rosterRow(p, side, icons, splash, isMe) {
  const key = `${side}:${p.cellId}`;
  const locked = Boolean(p.champion) && p.locked;
  const roleLabel = (p.role || '').slice(0, 3).toUpperCase() || '—';
  const portraitStyle = p.champion && icons[p.champion] ? bg(icons[p.champion]) : '';
  const bleedStyle = locked && splash[p.champion] ? bg(splash[p.champion]) : '';
  return `<div class="tRow ${locked ? 'locked' : ''}" data-lockkey="${esc(key)}">
    ${locked ? `<div class="bleed" style="${bleedStyle}"></div>` : ''}
    <div class="role">${esc(roleLabel)}</div>
    <div class="portrait ${locked ? 'locked' : (p.champion ? '' : 'empty')}" style="${portraitStyle}"></div>
    <div class="cname ${locked ? '' : 'pending'}">${esc(p.champion || 'Waiting…')}</div>
    ${isMe ? '<span class="youTag">YOU</span>' : ''}
  </div>`;
}

window.draftApi.onDraft((p) => {
  const s = p.state || {};
  const icons = p.icons || {};
  const splash = p.splash || {};
  let html = '';

  const bansA = (s.bans && s.bans.ally) || [];
  const bansE = (s.bans && s.bans.enemy) || [];
  if (bansA.length || bansE.length) {
    html += '<h2>Bans</h2><div class="bans">';
    html += `<span>Yours: <b>${bansA.map(esc).join(', ') || '—'}</b></span>`;
    html += `<span>Enemy: <b>${bansE.map(esc).join(', ') || '—'}</b></span></div>`;
  }

  const myTeam = s.myTeam || [];
  const enemyTeam = s.enemyTeam || [];
  if (myTeam.length) {
    html += '<h2>Your team</h2><div class="roster">';
    html += myTeam.map((t) => rosterRow(t, 'ally', icons, splash, t.cellId === s.me.cellId)).join('');
    html += '</div>';
  }
  if (enemyTeam.length) {
    html += '<h2>Enemy team</h2><div class="roster">';
    html += enemyTeam.map((t) => rosterRow(t, 'enemy', icons, splash, false)).join('');
    html += '</div>';
  }

  const picks = p.picks || [];
  if (picks.length && !(s.me && s.me.lockedChampion)) {
    html += `<h2>Pick suggestions ${s.me && s.me.role ? '· ' + esc(s.me.role) : ''}</h2>`;
    const max = picks[0].score || 1;
    for (const r of picks.slice(0, 6)) {
      const icon = icons[r.champion];
      html += `<div class="pick ${r.source === 'meta' ? 'metaSource' : ''}">${icon ? `<img style="${bg(icon)}" alt=""/>` : ''}<div class="body">
        <div class="top"><span class="name">${esc(r.champion)}</span>
          ${r.tier ? `<span class="tier">${esc(r.tier)}</span>` : ''}
          ${r.source === 'meta' ? '<span class="tag">meta</span>' : ''}
          ${r.winRate != null ? `<span class="wr">${r.winRate.toFixed(1)}% WR</span>` : ''}</div>
        <div class="reasons">${r.reasons.slice(0, 3).map((t) => `<span>${esc(t)}</span>`).join('')}</div>
        <div class="bar"><i style="width:${Math.max(6, Math.round((r.score / max) * 100))}%"></i></div>
      </div></div>`;
    }
  }

  const lockedSplash = s.me && s.me.lockedChampion ? splash[s.me.lockedChampion] : null;

  if (p.runes) {
    const g = p.runes.page || {};
    html += `<h2>Runes — ${esc(p.runes.champion)}${p.runes.locked ? '' : ' (hover)'}</h2><div class="runebox">
      ${lockedSplash ? `<div class="bleed" style="${bg(lockedSplash)}"></div>` : ''}
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
      ${lockedSplash ? `<div class="bleed" style="${bg(lockedSplash)}"></div>` : ''}
      <div class="row">Start: ${esc(b.starter)}</div>
      <div class="row">Boots: ${esc(b.boots)}</div>
      <div class="row">Core: ${(b.core || []).map(esc).join(' → ')}</div>
      ${(p.items.situational || []).map((s2) => `<div class="sit"><b>${esc(s2.item)}</b> <span>— ${esc(s2.why)}</span></div>`).join('')}
      <div class="src">source: ${esc(p.items.source)}</div>
    </div>`;
  }

  if (!html) html = '<p class="hint">In champ select — waiting for role assignment / first events…</p>';
  $('main').innerHTML = html;

  // Play the lock-in effect on rows that just transitioned to locked. Rendered
  // after innerHTML swap so the target elements exist with fresh bounding rects.
  const meKey = s.me && s.me.cellId != null ? `ally:${s.me.cellId}` : null;
  for (const key of p.justLocked || []) {
    const row = $('main').querySelector(`.tRow[data-lockkey="${cssKeyEscape(key)}"]`);
    if (!row) continue;
    triggerExecuteFx(row, p.meJustLocked && key === meKey);
  }
});

// cellId is always numeric and side is 'ally'|'enemy', so this is just a safety
// net against querySelector attribute-selector syntax errors, not an injection risk.
function cssKeyEscape(key) {
  return String(key).replace(/["\\]/g, '');
}

function triggerExecuteFx(targetEl, big) {
  const layer = $('fxLayer');
  const appEl = $('app');
  const rect = targetEl.getBoundingClientRect();
  const panelRect = appEl.getBoundingClientRect();
  const cx = rect.left - panelRect.left + rect.width / 2;
  const cy = rect.top - panelRect.top + rect.height / 2;

  const fx = document.createElement('div');
  fx.className = 'executeFx' + (big ? ' big' : '');
  const beamTop = big ? 0 : rect.top - panelRect.top - 8;
  const beamHeight = big ? cy + 40 : rect.height + 16;
  fx.innerHTML = `
    <div class="beam" style="left:${cx}px; top:${beamTop}px; height:${beamHeight}px;"></div>
    <div class="flash" style="left:${cx}px; top:${cy}px;"></div>
    <div class="ring" style="left:${cx}px; top:${cy}px;"></div>
    <div class="ring ring2" style="left:${cx}px; top:${cy}px;"></div>
  `;
  layer.appendChild(fx);

  if (big) {
    appEl.classList.add('shake');
    setTimeout(() => appEl.classList.remove('shake'), 420);
  }
  setTimeout(() => fx.remove(), 1200);
}

window.draftApi.getBootstrap().then((b) => {
  if (b && b.patch) $('statusText').textContent = `Ready · snapshot patch ${b.patch}`;
});
