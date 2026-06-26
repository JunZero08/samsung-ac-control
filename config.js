const config = {
  server: {
    port: 3000,
    host: '0.0.0.0'
  },

  connection: {
    // Type: 'mock' for simulation (no hardware), 'tcp' for serial-to-Ethernet gateway, 'serial' for direct RS-485 via USB
    type: 'mock',

    // TCP serial gateway settings (for Waveshare or similar RS485-to-Ethernet converters)
    tcp: {
      host: '192.168.1.100',
      port: 4196
    },

    // Direct serial port settings (USB RS-485 adapter)
    serial: {
      path: 'COM3',
      baudRate: 2400,
      dataBits: 8,
      parity: 'even',
      stopBits: 1
    },

    // Protocol settings
    protocol: {
      type: 'non-nasa',
      masterAddress: 0x50,
      broadcastAddress: 0xAD,
      commandRead: 0xA0,
      commandWrite: 0xA1
    },

    // Polling interval (ms) for refreshing device status
    pollingInterval: 5000,

    // Response timeout (ms)
    responseTimeout: 2000
  },

  devices: [
    { id: 1, name: '101호', address: 0x01, enabled: true },
    { id: 2, name: '102호', address: 0x02, enabled: true },
    { id: 3, name: '103호', address: 0x03, enabled: true },
    { id: 4, name: '104호', address: 0x04, enabled: true },
    { id: 5, name: '105호', address: 0x05, enabled: true },
    { id: 6, name: '106호', address: 0x06, enabled: true },
    { id: 7, name: '107호', address: 0x07, enabled: true },
    { id: 8, name: '108호', address: 0x08, enabled: true },
    { id: 9, name: '109호', address: 0x09, enabled: true },
    { id: 10, name: '110호', address: 0x0A, enabled: true }
  ]
};

module.exports = config;
