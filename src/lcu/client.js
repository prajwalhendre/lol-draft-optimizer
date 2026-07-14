'use strict';
// LCU connection: WebSocket event bus + HTTPS REST, authenticated via the lockfile.
// The client uses a self-signed cert on 127.0.0.1, hence rejectUnauthorized: false
// (local loopback only — nothing leaves the machine).

const https = require('https');
const { EventEmitter } = require('events');
const WebSocket = require('ws');

const CHAMP_SELECT_EVENT = 'OnJsonApiEvent_lol-champ-select_v1_session';
const CHAMP_SELECT_URI = '/lol-champ-select/v1/session';

class LcuClient extends EventEmitter {
  constructor(lockfile) {
    super();
    this.lockfile = lockfile;
    this.authHeader = 'Basic ' + Buffer.from(`riot:${lockfile.password}`).toString('base64');
    this.ws = null;
    this.closed = false;
  }

  request(method, uri) {
    return new Promise((resolve, reject) => {
      const req = https.request({
        host: '127.0.0.1',
        port: this.lockfile.port,
        path: uri,
        method,
        headers: { Authorization: this.authHeader, Accept: 'application/json' },
        rejectUnauthorized: false,
      }, (res) => {
        let body = '';
        res.on('data', (d) => { body += d; });
        res.on('end', () => {
          if (res.statusCode === 404) return resolve(null); // e.g. no active champ select
          try { resolve(body ? JSON.parse(body) : null); } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  connect() {
    const url = `wss://127.0.0.1:${this.lockfile.port}/`;
    this.ws = new WebSocket(url, 'wamp', {
      headers: { Authorization: this.authHeader },
      rejectUnauthorized: false,
    });

    this.ws.on('open', async () => {
      // WAMP-style subscribe: [5, eventName]
      this.ws.send(JSON.stringify([5, CHAMP_SELECT_EVENT]));
      this.emit('connected');
      // Pull current session immediately in case we attached mid-draft.
      try {
        const session = await this.request('GET', CHAMP_SELECT_URI);
        if (session) this.emit('champSelect', session);
      } catch { /* fine — events will arrive */ }
    });

    this.ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      // Event frames: [8, eventName, { data, eventType, uri }]
      if (!Array.isArray(msg) || msg[0] !== 8 || msg[1] !== CHAMP_SELECT_EVENT) return;
      const payload = msg[2] || {};
      if (payload.eventType === 'Delete') this.emit('champSelectEnd');
      else if (payload.data) this.emit('champSelect', payload.data);
    });

    this.ws.on('close', () => { if (!this.closed) this.emit('disconnected'); });
    this.ws.on('error', (err) => this.emit('error', err));
    return this;
  }

  close() { this.closed = true; if (this.ws) this.ws.close(); }
}

module.exports = { LcuClient, CHAMP_SELECT_EVENT, CHAMP_SELECT_URI };
