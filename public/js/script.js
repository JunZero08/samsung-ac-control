let devices = [];
let selectedDevice = null;
let pendingControl = {};
let currentFloor = 1;
let ws = null;

const MODE_LABELS = { auto: '자동', cool: '냉방', dry: '제습', fan: '송풍', heat: '난방' };
const FAN_LABELS = { auto: '자동', low: '약', med: '중', high: '강', turbo: '터보' };

function init() {
  connectWebSocket();
  fetchDevices();
  document.getElementById('refreshAll').addEventListener('click', fetchDevices);
  document.querySelectorAll('.floor-tab').forEach(el => {
    el.addEventListener('click', () => switchFloor(parseInt(el.dataset.floor)));
  });
}

function connectWebSocket() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${location.host}`;

  ws = new WebSocket(url);
  ws.onopen = () => updateConnectionBadge(true);
  ws.onclose = () => {
    updateConnectionBadge(false);
    setTimeout(connectWebSocket, 3000);
  };
  ws.onerror = () => ws.close();
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'state') updateDeviceState(msg.data);
    } catch (_) {}
  };
}

function updateConnectionBadge(connected) {
  const badge = document.getElementById('connectionBadge');
  if (connected) {
    badge.className = 'connection-badge';
    badge.innerHTML = '<span class="dot"></span> 연결됨';
  } else {
    badge.className = 'connection-badge disconnected';
    badge.innerHTML = '<span class="dot"></span> 연결 끊김';
  }
}

function getFloor(name) {
  return parseInt(name[0]);
}

function switchFloor(floor) {
  currentFloor = floor;
  document.querySelectorAll('.floor-tab').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.floor) === floor);
  });
  renderGrid();
}

async function fetchDevices() {
  try {
    const grid = document.getElementById('deviceGrid');
    grid.innerHTML = '<div class="loading"><div class="spinner"></div><p>에어컨 정보를 불러오는 중...</p></div>';

    const res = await fetch('/api/devices');
    devices = await res.json();

    if (devices.length === 0) {
      grid.innerHTML = '<div class="loading"><p>설정된 에어컨이 없습니다. config.js를 확인하세요.</p></div>';
      return;
    }

    renderGrid();
  } catch (err) {
    document.getElementById('deviceGrid').innerHTML =
      '<div class="loading"><p style="color:var(--orange)">서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.</p></div>';
  }
}

function renderGrid() {
  const grid = document.getElementById('deviceGrid');
  grid.innerHTML = '';

  const filtered = devices.filter(d => getFloor(d.name) === currentFloor);
  const info = document.getElementById('floorInfo');
  const first = filtered[0];
  const last = filtered[filtered.length - 1];
  info.textContent = `${first?.name}~${last?.name} · ${filtered.length}대`;

  filtered.forEach(d => {
    const card = document.createElement('div');
    card.className = `device-card${d.power === 'on' ? ' power-on' : ''}`;
    card.dataset.id = d.id;

    if (d.online === false && !d.power) {
      card.innerHTML = `
        <div class="card-offline">
          <svg viewBox="0 0 24 24" width="40" height="40">
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" fill="currentColor" opacity="0.3"/>
          </svg>
          <span>연결할 수 없음</span>
        </div>
      `;
    } else {
      card.innerHTML = `
        <div class="card-header">
          <span class="card-room-name">${d.name}</span>
          <span class="card-power-indicator ${d.power === 'on' ? 'on' : ''}"></span>
        </div>
        <div class="card-temp-display">
          <span class="card-temp-value">${d.targetTemp || '--'}</span>
          <span class="card-temp-unit">°C</span>
        </div>
        <div class="card-current-temp">실내 ${d.currentTemp || '--'}°C</div>
        <div class="card-details">
          <span class="card-badge ${d.power === 'on' ? 'power-on' : ''}">${MODE_LABELS[d.mode] || d.mode || '--'}</span>
          <span class="card-badge">풍량 ${FAN_LABELS[d.fanSpeed] || d.fanSpeed || '--'}</span>
        </div>
      `;
    }

    card.addEventListener('click', () => openModal(d.id));
    grid.appendChild(card);
  });
}

function updateDeviceState(data) {
  const idx = devices.findIndex(d => d.id === data.id);
  if (idx < 0) return;
  devices[idx] = { ...devices[idx], ...data };
  const d = devices[idx];

  const card = document.querySelector(`.device-card[data-id="${data.id}"]`);
  if (card) {
    card.className = `device-card${d.power === 'on' ? ' power-on' : ''}`;
    card.dataset.id = d.id;

    if (d.online === false && !d.power) {
      card.innerHTML = `
        <div class="card-offline">
          <svg viewBox="0 0 24 24" width="40" height="40">
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" fill="currentColor" opacity="0.3"/>
          </svg>
          <span>연결할 수 없음</span>
        </div>
      `;
    } else {
      card.innerHTML = `
        <div class="card-header">
          <span class="card-room-name">${d.name}</span>
          <span class="card-power-indicator ${d.power === 'on' ? 'on' : ''}"></span>
        </div>
        <div class="card-temp-display">
          <span class="card-temp-value">${d.targetTemp || '--'}</span>
          <span class="card-temp-unit">°C</span>
        </div>
        <div class="card-current-temp">실내 ${d.currentTemp || '--'}°C</div>
        <div class="card-details">
          <span class="card-badge ${d.power === 'on' ? 'power-on' : ''}">${MODE_LABELS[d.mode] || d.mode || '--'}</span>
          <span class="card-badge">풍량 ${FAN_LABELS[d.fanSpeed] || d.fanSpeed || '--'}</span>
        </div>
      `;
    }
  } else {
    if (d.name && getFloor(d.name) === currentFloor) {
      const grid = document.getElementById('deviceGrid');
      const pos = devices.filter(x => getFloor(x.name) === currentFloor).findIndex(x => x.id === d.id);
      if (pos >= 0) {
        renderGrid();
        return;
      }
    }
  }

  if (selectedDevice && selectedDevice.id === data.id) {
    const updated = devices.find(x => x.id === data.id);
    if (updated) updateModal(updated);
  }
}

function openModal(id) {
  const device = devices.find(d => d.id === id);
  if (!device) return;
  selectedDevice = device;
  pendingControl = {
    power: device.power || 'off',
    mode: device.mode || 'cool',
    temperature: device.targetTemp || 24,
    fanSpeed: device.fanSpeed || 'auto'
  };

  document.getElementById('modalOverlay').classList.remove('hidden');
  updateModal(device);
}

function closeModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('modalOverlay').classList.add('hidden');
  selectedDevice = null;
}

function updateModal(d) {
  document.getElementById('modalRoomName').textContent = d.name;
  document.getElementById('modalTargetTemp').textContent = pendingControl.temperature;
  document.getElementById('modalCurrentTemp').innerHTML = `${d.currentTemp || '--'}&deg;C`;

  const powerBtn = document.getElementById('modalPowerBtn');
  const powerText = document.getElementById('modalPowerText');
  const isOn = pendingControl.power === 'on';
  powerBtn.className = `btn-power${isOn ? ' power-on' : ''}`;
  powerText.textContent = isOn ? '켜짐' : '꺼짐';

  document.querySelectorAll('.btn-mode').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === pendingControl.mode);
  });

  document.querySelectorAll('.btn-fan').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.fan === pendingControl.fanSpeed);
  });

  const now = new Date();
  document.getElementById('modalLastUpdate').textContent =
    `최근 업데이트: ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
}

function togglePower() {
  pendingControl.power = pendingControl.power === 'on' ? 'off' : 'on';
  updateModal(selectedDevice);
}

function setMode(mode) {
  pendingControl.mode = mode;
  document.querySelectorAll('.btn-mode').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}

function setFan(speed) {
  pendingControl.fanSpeed = speed;
  document.querySelectorAll('.btn-fan').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.fan === speed);
  });
}

function adjustTemp(delta) {
  const t = Math.min(Math.max(pendingControl.temperature + delta, 16), 30);
  pendingControl.temperature = t;
  document.getElementById('modalTargetTemp').textContent = t;
}

async function sendControl() {
  if (!selectedDevice) return;

  try {
    const res = await fetch(`/api/device/${selectedDevice.id}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingControl)
    });

    const result = await res.json();

    if (result.success || result.state) {
      showToast('설정이 적용되었습니다', 'success');
    } else {
      showToast(result.error || '명령 전송 실패', 'error');
    }
  } catch (err) {
    showToast('서버 통신 오류', 'error');
  }
}

function showToast(msg, type) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type || ''}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.className = 'toast hidden'; }, 2500);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal({ target: document.getElementById('modalOverlay'), currentTarget: document.getElementById('modalOverlay') });
});

document.addEventListener('DOMContentLoaded', init);
