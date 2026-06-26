const config = {
  server: {
    port: 3000,
    host: "0.0.0.0",
  },

  connection: {
    // Type: 'mock' for simulation (no hardware), 'tcp' for serial-to-Ethernet gateway, 'serial' for direct RS-485 via USB
    type: "mock",

    // TCP serial gateway settings (for Waveshare or similar RS485-to-Ethernet converters)
    tcp: {
      host: "192.168.1.100",
      port: 4196,
    },

    // Direct serial port settings (USB RS-485 adapter)
    serial: {
      path: "COM3",
      baudRate: 2400,
      dataBits: 8,
      parity: "even",
      stopBits: 1,
    },

    // Protocol settings
    protocol: {
      type: "non-nasa",
      masterAddress: 0x50,
      broadcastAddress: 0xad,
      commandRead: 0xa0,
      commandWrite: 0xa1,
    },

    // Polling interval (ms) for refreshing device status
    pollingInterval: 5000,

    // Response timeout (ms)
    responseTimeout: 2000,
  },

  devices: (() => {
    const list = [];
    let id = 0;
    for (let floor = 1; floor <= 4; floor++) {
      for (let room = 1; room <= 14; room++) {
        id++;
        const roomStr = String(room).padStart(2, '0');
        list.push({ id, name: `${floor}${roomStr}호`, address: id, enabled: true });
      }
    }
    return list;
  })(),
};

module.exports = config;
