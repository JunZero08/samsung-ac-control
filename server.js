const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const net = require('net');
const config = require('./config');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const deviceStates = new Map();
let transport = null;
let pollTimer = null;

class SamsungNonNASAProtocol {
  calculateChecksum(data) {
    return data.reduce((acc, b) => acc ^ b, 0);
  }

  buildReadRequest(dst) {
    const buf = Buffer.alloc(14);
    buf[0] = 0x32;
    buf[1] = config.connection.protocol.masterAddress;
    buf[2] = dst;
    buf[3] = config.connection.protocol.commandRead;
    for (let i = 4; i <= 11; i++) buf[i] = 0x00;
    buf[12] = this.calculateChecksum(buf.slice(1, 12));
    buf[13] = 0x34;
    return buf;
  }

  buildWriteCommand(dst, command) {
    const buf = Buffer.alloc(14);
    buf[0] = 0x32;
    buf[1] = config.connection.protocol.masterAddress;
    buf[2] = dst;
    buf[3] = config.connection.protocol.commandWrite;

    const modeMap = { auto: 0x00, cool: 0x01, dry: 0x02, fan: 0x03, heat: 0x04 };
    const powerBit = command.power === 'on' ? 0x80 : 0x00;
    const modeVal = modeMap[command.mode] !== undefined ? modeMap[command.mode] : 0x01;
    buf[4] = powerBit | modeVal;

    buf[5] = Math.min(Math.max(parseInt(command.temperature) || 24, 16), 30);

    const fanMap = { auto: 0x00, low: 0x01, med: 0x02, high: 0x03, turbo: 0x04 };
    buf[6] = fanMap[command.fanSpeed] !== undefined ? fanMap[command.fanSpeed] : 0x00;

    for (let i = 7; i <= 11; i++) buf[i] = 0x00;
    buf[12] = this.calculateChecksum(buf.slice(1, 12));
    buf[13] = 0x34;

    return buf;
  }

  parseStatusResponse(buf) {
    if (buf.length < 14 || buf[0] !== 0x32 || buf[13] !== 0x34) return null;
    const chk = this.calculateChecksum(buf.slice(1, 12));
    if (chk !== buf[12]) return null;
    if (buf[3] !== config.connection.protocol.commandRead) return null;

    const data0 = buf[4];
    const modeIdx = data0 & 0x0F;
    const modes = ['auto', 'cool', 'dry', 'fan', 'heat', 'auto', 'auto', 'auto'];

    return {
      address: buf[1],
      power: (data0 & 0x80) ? 'on' : 'off',
      mode: modes[modeIdx] || 'auto',
      targetTemp: buf[5] || 24,
      fanSpeed: ['auto', 'low', 'med', 'high', 'turbo'][buf[6] & 0x07] || 'auto',
      currentTemp: buf[7] || buf[5] || 24
    };
  }
}

const protocol = new SamsungNonNASAProtocol();

class TransportTcp {
  constructor(host, port) {
    this.host = host;
    this.port = port;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pendingResolve = null;
    this.reconnectTimer = null;
    this.connected = false;
  }

  connect() {
    if (this.socket) this.socket.destroy();
    this.socket = new net.Socket();
    this.buffer = Buffer.alloc(0);

    this.socket.connect(this.port, this.host, () => {
      console.log(`[TCP] Connected to ${this.host}:${this.port}`);
      this.connected = true;
    });

    this.socket.on('data', (data) => {
      this.buffer = Buffer.concat([this.buffer, data]);
      if (this.pendingResolve && this.buffer.length >= 14) {
        const resolve = this.pendingResolve;
        this.pendingResolve = null;
        const resp = this.buffer.slice(0, 14);
        this.buffer = this.buffer.slice(14);
        resolve(resp);
      }
    });

    this.socket.on('close', () => {
      this.connected = false;
      console.log('[TCP] Connection closed, reconnecting in 3s...');
      if (this.pendingResolve) {
        this.pendingResolve(null);
        this.pendingResolve = null;
      }
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    });

    this.socket.on('error', (err) => {
      console.error('[TCP] Error:', err.message);
      if (this.pendingResolve) {
        this.pendingResolve(null);
        this.pendingResolve = null;
      }
    });
  }

  async sendAndReceive(data, timeout = config.connection.responseTimeout) {
    if (!this.connected || !this.socket) {
      return null;
    }
    return new Promise((resolve) => {
      this.pendingResolve = resolve;
      this.socket.write(data);
      setTimeout(() => {
        if (this.pendingResolve) {
          this.pendingResolve(null);
          this.pendingResolve = null;
        }
      }, timeout);
    });
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket) this.socket.destroy();
    this.connected = false;
  }
}

class MockTransport {
  constructor() {
    this.connected = true;
    this.mockStates = new Map();
    config.devices.forEach(d => {
      if (d.enabled) {
        this.mockStates.set(d.address, {
          power: 'off', mode: 'cool', targetTemp: 24,
          fanSpeed: 'auto', currentTemp: 22 + Math.floor(Math.random() * 5)
        });
      }
    });
  }

  connect() {
    console.log('[MOCK] Running in simulation mode (no hardware required)');
    this.connected = true;
  }

  async sendAndReceive(data) {
    const dst = data[2];
    const cmd = data[3];
    await new Promise(r => setTimeout(r, 50 + Math.random() * 100));

    if (cmd === config.connection.protocol.commandWrite) {
      const power = (data[4] & 0x80) ? 'on' : 'off';
      const modeIdx = data[4] & 0x0F;
      const modes = ['auto', 'cool', 'dry', 'fan', 'heat'];
      const fans = ['auto', 'low', 'med', 'high', 'turbo'];
      this.mockStates.set(dst, {
        power,
        mode: modes[modeIdx] || 'cool',
        targetTemp: data[5] || 24,
        fanSpeed: fans[data[6] & 0x07] || 'auto',
        currentTemp: this.mockStates.get(dst)?.currentTemp || 24
      });
    }

    const state = this.mockStates.get(dst) || { power: 'off', mode: 'cool', targetTemp: 24, fanSpeed: 'auto', currentTemp: 24 };
    const modeMap = { auto: 0x00, cool: 0x01, dry: 0x02, fan: 0x03, heat: 0x04 };
    const fanMap = { auto: 0x00, low: 0x01, med: 0x02, high: 0x03, turbo: 0x04 };

    const res = Buffer.alloc(14);
    res[0] = 0x32;
    res[1] = dst;
    res[2] = config.connection.protocol.masterAddress;
    res[3] = config.connection.protocol.commandRead;
    res[4] = (state.power === 'on' ? 0x80 : 0x00) | (modeMap[state.mode] || 0x00);
    res[5] = state.targetTemp || 24;
    res[6] = fanMap[state.fanSpeed] || 0x00;
    res[7] = state.currentTemp || 24;
    for (let i = 8; i <= 11; i++) res[i] = 0x00;
    res[12] = protocol.calculateChecksum(res.slice(1, 12));
    res[13] = 0x34;
    return res;
  }

  disconnect() {
    this.connected = false;
  }
}

function initTransport() {
  if (config.connection.type === 'tcp') {
    transport = new TransportTcp(config.connection.tcp.host, config.connection.tcp.port);
  } else if (config.connection.type === 'serial') {
    console.error('[SERVER] Serial transport not yet implemented');
    process.exit(1);
  } else {
    transport = new MockTransport();
  }
  transport.connect();
}

async function pollDevice(device) {
  if (!transport || !transport.connected) return null;
  try {
    const req = protocol.buildReadRequest(device.address);
    const resp = await transport.sendAndReceive(req);
    if (!resp) return null;
    const state = protocol.parseStatusResponse(resp);
    if (state) {
      state.id = device.id;
      state.name = device.name;
      state.address = device.address;
      state.online = true;
      state.lastUpdate = Date.now();
      deviceStates.set(device.id, state);
      broadcastState(state);
      return state;
    }
  } catch (err) {
    console.error(`[POLL] Error polling ${device.name}:`, err.message);
  }
  return null;
}

async function pollAll() {
  for (const device of config.devices) {
    if (!device.enabled) continue;
    const state = deviceStates.get(device.id);
    if (!state || Date.now() - state.lastUpdate > config.connection.pollingInterval * 2) {
      await pollDevice(device);
    }
  }
}

function startPolling() {
  pollTimer = setInterval(pollAll, config.connection.pollingInterval);
  pollAll();
}

function broadcastState(state) {
  const msg = JSON.stringify({ type: 'state', data: state });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

app.get('/api/devices', (req, res) => {
  const list = config.devices
    .filter(d => d.enabled)
    .map(d => {
      const state = deviceStates.get(d.id);
      return {
        id: d.id,
        name: d.name,
        address: d.address,
        online: state ? state.online : false,
        ...(state ? {
          power: state.power,
          mode: state.mode,
          targetTemp: state.targetTemp,
          fanSpeed: state.fanSpeed,
          currentTemp: state.currentTemp,
          lastUpdate: state.lastUpdate
        } : {})
      };
    });
  res.json(list);
});

app.get('/api/device/:id', (req, res) => {
  const device = config.devices.find(d => d.id === parseInt(req.params.id));
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const state = deviceStates.get(device.id);
  if (!state) return res.status(503).json({ error: 'No state available' });
  res.json({ id: device.id, name: device.name, ...state });
});

app.post('/api/device/:id/control', async (req, res) => {
  const device = config.devices.find(d => d.id === parseInt(req.params.id));
  if (!device) return res.status(404).json({ error: 'Device not found' });
  if (!transport || !transport.connected) return res.status(503).json({ error: 'Not connected' });

  const { power, mode, temperature, fanSpeed } = req.body;
  const cmd = {};
  if (power !== undefined) cmd.power = power;
  if (mode !== undefined) cmd.mode = mode;
  if (temperature !== undefined) cmd.temperature = temperature;
  if (fanSpeed !== undefined) cmd.fanSpeed = fanSpeed;

  const existing = deviceStates.get(device.id) || { power: 'off', mode: 'cool', targetTemp: 24, fanSpeed: 'auto' };
  cmd.power = cmd.power || existing.power;
  cmd.mode = cmd.mode || existing.mode;
  cmd.temperature = cmd.temperature || existing.targetTemp;
  cmd.fanSpeed = cmd.fanSpeed || existing.fanSpeed;

  try {
    const reqBuf = protocol.buildWriteCommand(device.address, cmd);
    await transport.sendAndReceive(reqBuf);
    await new Promise(r => setTimeout(r, 200));
    await pollDevice(device);
    const newState = deviceStates.get(device.id);
    res.json({ success: true, state: newState });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/device/:id/refresh', async (req, res) => {
  const device = config.devices.find(d => d.id === parseInt(req.params.id));
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const state = await pollDevice(device);
  res.json(state || { error: 'No response from device' });
});

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'welcome', data: { server: 'Samsung AC Control v2.0' } }));

  deviceStates.forEach(state => {
    ws.send(JSON.stringify({ type: 'state', data: state }));
  });
});

function shutdown() {
  if (pollTimer) clearInterval(pollTimer);
  if (transport) transport.disconnect();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (err) => console.error('[FATAL]', err));

initTransport();
startPolling();

server.listen(config.server.port, config.server.host, () => {
  console.log(`[SERVER] Samsung AC Control System v2.0`);
  console.log(`[SERVER] Listening on http://${config.server.host}:${config.server.port}`);
  console.log(`[SERVER] Mode: ${config.connection.type === 'mock' ? 'SIMULATION (no hardware)' : config.connection.type.toUpperCase()}`);
  console.log(`[SERVER] Devices configured: ${config.devices.filter(d => d.enabled).length}`);
});
