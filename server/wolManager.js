const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_DIR = process.env.NEXUSPULSE_CONFIG_DIR || path.join(__dirname, '..', 'data');
const DEVICES_FILE = path.join(CONFIG_DIR, 'wol-devices.json');
const ALLOWED_PORTS = new Set([7, 9]);

function normalizeMac(input) {
  if (typeof input !== 'string') throw new Error('MAC 주소를 입력하세요.');
  const compact = input.trim().replace(/[:-]/g, '').toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(compact)) throw new Error('올바른 MAC 주소 형식이 아닙니다.');
  return compact.match(/.{2}/g).join(':');
}

function validateBroadcast(input) {
  const value = String(input || '255.255.255.255').trim();
  const octets = value.split('.').map(Number);
  const validIpv4 = octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
  if (!validIpv4) throw new Error('올바른 IPv4 브로드캐스트 주소가 아닙니다.');
  const isLimited = value === '255.255.255.255';
  const isPrivate = octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168);
  if (!isLimited && (!isPrivate || octets[3] !== 255)) throw new Error('사설망 브로드캐스트 주소만 사용할 수 있습니다.');
  return value;
}

function validatePort(input = 9) {
  const port = Number(input);
  if (!ALLOWED_PORTS.has(port)) throw new Error('WOL 포트는 7 또는 9만 사용할 수 있습니다.');
  return port;
}

function sanitizeDevice(input) {
  const name = String(input?.name || '').trim();
  if (!name || name.length > 60) throw new Error('장치 이름은 1~60자로 입력하세요.');
  return {
    name,
    mac: normalizeMac(input?.mac),
    broadcast: validateBroadcast(input?.broadcast),
    port: validatePort(input?.port),
  };
}

function readDevices() {
  try {
    const data = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeDevices(devices) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(DEVICES_FILE, `${JSON.stringify(devices, null, 2)}\n`, { mode: 0o600 });
}

function listDevices() {
  return readDevices();
}

function addDevice(input) {
  const device = { id: crypto.randomUUID(), ...sanitizeDevice(input), createdAt: Date.now() };
  const devices = readDevices();
  if (devices.some((item) => item.mac === device.mac)) throw new Error('이미 등록된 MAC 주소입니다.');
  devices.push(device);
  writeDevices(devices);
  return device;
}

function removeDevice(id) {
  const devices = readDevices();
  const next = devices.filter((item) => item.id !== id);
  if (next.length === devices.length) throw new Error('WOL 장치를 찾을 수 없습니다.');
  writeDevices(next);
  return { id, removed: true };
}

function createMagicPacket(mac) {
  const bytes = Buffer.from(normalizeMac(mac).replace(/:/g, ''), 'hex');
  return Buffer.concat([Buffer.alloc(6, 0xff), ...Array.from({ length: 16 }, () => bytes)]);
}

function sendPacket(packet, broadcast, port) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    socket.once('error', (error) => { socket.close(); reject(error); });
    socket.bind(0, () => {
      socket.setBroadcast(true);
      socket.send(packet, port, broadcast, (error) => {
        socket.close();
        if (error) reject(error); else resolve();
      });
    });
  });
}

async function wakeDevice(id) {
  const device = readDevices().find((item) => item.id === id);
  if (!device) throw new Error('WOL 장치를 찾을 수 없습니다.');
  const packet = createMagicPacket(device.mac);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await sendPacket(packet, device.broadcast, device.port);
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return { id: device.id, name: device.name, mac: device.mac, packetsSent: 3, sentAt: Date.now() };
}

module.exports = { listDevices, addDevice, removeDevice, wakeDevice, normalizeMac, validateBroadcast, validatePort, createMagicPacket };
