const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexuspulse-downloads-'));
process.env.NEXUSPULSE_CONFIG_DIR = path.join(testRoot, 'config');
process.env.DOWNLOAD_DIR = path.join(testRoot, 'downloads');

const downloads = require('../server/downloadManager');

async function run() {
  const settings = downloads.saveSettings({ downloadDir: path.join(testRoot, 'usb', 'downloads') });
  assert.equal(settings.downloadDir, path.join(testRoot, 'usb', 'downloads'));
  assert.equal(downloads.getStatus().writable, true);
  assert.throws(() => downloads.saveSettings({ downloadDir: 'relative/path' }), /절대 경로/);

  const transmission = await downloads.getTransmission();
  assert.equal(typeof transmission.available, 'boolean');
  assert.ok(Array.isArray(transmission.torrents));

  assert.throws(() => downloads.startYoutube('file:///etc/passwd'), /설치되지 않았습니다|HTTP/);
  assert.throws(() => downloads.startYoutube('https://example.com/video', '4k'), /화질/);
  assert.deepEqual(downloads.qualityOptions().map((item) => item.id), ['360p', '480p', '720p', '1080p', 'best', 'audio']);
  console.log('Download manager tests passed.');
}

run().finally(() => fs.rmSync(testRoot, { recursive: true, force: true }));
