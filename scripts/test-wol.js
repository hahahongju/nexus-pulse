const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexuspulse-wol-'));
process.env.NEXUSPULSE_CONFIG_DIR = testRoot;
const wol = require('../server/wolManager');

try {
  assert.equal(wol.normalizeMac('aa-bb-cc-dd-ee-ff'), 'AA:BB:CC:DD:EE:FF');
  assert.throws(() => wol.normalizeMac('not-a-mac'), /MAC 주소/);
  assert.equal(wol.validateBroadcast('192.168.0.255'), '192.168.0.255');
  assert.equal(wol.validateBroadcast('255.255.255.255'), '255.255.255.255');
  assert.throws(() => wol.validateBroadcast('8.8.8.255'), /사설망/);
  assert.equal(wol.validatePort(9), 9);
  assert.throws(() => wol.validatePort(53), /7 또는 9/);

  const packet = wol.createMagicPacket('AA:BB:CC:DD:EE:FF');
  assert.equal(packet.length, 102);
  assert.equal(packet.subarray(0, 6).toString('hex'), 'ffffffffffff');
  assert.equal(packet.subarray(6, 12).toString('hex'), 'aabbccddeeff');

  const device = wol.addDevice({ name: 'Test PC', mac: 'AA:BB:CC:DD:EE:FF', broadcast: '192.168.0.255', port: 9 });
  assert.equal(wol.listDevices().length, 1);
  assert.throws(() => wol.addDevice({ name: 'Duplicate', mac: device.mac, broadcast: '192.168.0.255', port: 9 }), /이미 등록/);
  assert.deepEqual(wol.removeDevice(device.id), { id: device.id, removed: true });
  assert.equal(wol.listDevices().length, 0);
  console.log('WOL manager tests passed.');
} finally {
  fs.rmSync(testRoot, { recursive: true, force: true });
}
