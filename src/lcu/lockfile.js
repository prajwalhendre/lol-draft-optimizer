'use strict';
// LCU lockfile discovery. The League client writes `lockfile` on launch:
//   name:pid:port:password:protocol
// macOS default install path, overridable via LOL_LOCKFILE env var.

const fs = require('fs');
const path = require('path');

const CANDIDATE_PATHS = [
  process.env.LOL_LOCKFILE,
  '/Applications/League of Legends.app/Contents/LoL/lockfile',
  path.join(process.env.HOME || '', 'Applications/League of Legends.app/Contents/LoL/lockfile'),
].filter(Boolean);

function readLockfile() {
  for (const p of CANDIDATE_PATHS) {
    try {
      const raw = fs.readFileSync(p, 'utf8').trim();
      const [name, pid, port, password, protocol] = raw.split(':');
      if (port && password) {
        return { name, pid: Number(pid), port: Number(port), password, protocol: protocol || 'https', path: p };
      }
    } catch { /* not there / not readable — keep looking */ }
  }
  return null;
}

// Polls until the League client is up, then resolves with credentials.
function waitForLockfile({ intervalMs = 3000, onWaiting = () => {} } = {}) {
  return new Promise((resolve) => {
    const tick = () => {
      const lf = readLockfile();
      if (lf) return resolve(lf);
      onWaiting();
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

module.exports = { readLockfile, waitForLockfile, CANDIDATE_PATHS };
