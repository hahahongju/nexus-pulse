const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const dns = require('dns');

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexuspulse-downloads-'));
process.env.NEXUSPULSE_CONFIG_DIR = path.join(testRoot, 'config');
process.env.DOWNLOAD_DIR = path.join(testRoot, 'downloads');
process.env.HERMES_BIN = '/bin/true';
process.env.YOUTUBE_CONCURRENCY = '1';

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
  assert.throws(() => downloads.startYoutube('https://example.com/video', '4k'), /화질|YouTube 주소/);
  assert.deepEqual(downloads.qualityOptions().map((item) => item.id), ['360p', '480p', '720p', '1080p', 'best', 'audio']);
  assert.deepEqual(downloads.clearFailedYoutubeJobs(), { removed: 0, ids: [] });
  assert.deepEqual(downloads.retryFailedYoutubeJobs(), { retried: 0, ids: [] });
  assert.deepEqual(downloads.parseYoutubeProgressLine('download: 44.2%| 33.99MiB/s|00:05'), {
    progress: 44.2, speed: '33.99MiB/s', eta: '00:05',
  });
  assert.equal(downloads.parseYoutubeProgressLine('[download] 44.2%'), null);
  assert.equal(downloads.isPrivateAddress('127.0.0.1'), true);
  assert.equal(downloads.isPrivateAddress('192.168.1.10'), true);
  assert.equal(downloads.isPrivateAddress('10.0.0.1'), true);
  assert.equal(downloads.isPrivateAddress('8.8.8.8'), false);
  assert.throws(() => downloads.validateFileUrl('file:///etc/passwd'), /HTTP\(S\)/);
  assert.throws(() => downloads.validateFileUrl('http://127.0.0.1/private.iso'), /내부 네트워크/);
  assert.throws(() => downloads.validateFileUrl('http://user:pass@example.com/file.iso'), /인증 정보/);
  assert.throws(() => downloads.startFile('http://localhost/private.iso'), /내부 네트워크/);
  assert.equal(downloads.isDownloadableContentType('text/html; charset=utf-8'), false);
  assert.equal(downloads.isDownloadableContentType('application/xhtml+xml'), false);
  assert.equal(downloads.isDownloadableContentType('application/octet-stream'), true);
  assert.equal(downloads.isDownloadableContentType('application/x-iso9660-image'), true);
  const hermes = await downloads.requestWithHermes('Windows 11 26H2 한국어 x64 ISO를 공식 배포처에서 받아줘');
  assert.ok(hermes.requestId.startsWith('hermes-'));
  await new Promise((resolve) => setTimeout(resolve, 50));
  let conversation = downloads.listYoutubeJobs().find((job) => job.id === hermes.requestId);
  assert.equal(conversation.status, 'awaiting-input');
  assert.equal(conversation.prompt, 'Windows 11 26H2 한국어 x64 ISO를 공식 배포처에서 받아줘');
  assert.equal(conversation.messages[0].role, 'user');
  await downloads.continueHermesConversation(hermes.requestId, '정식 공개 버전이 아니면 받지 말고 나에게 확인해줘');
  await new Promise((resolve) => setTimeout(resolve, 50));
  conversation = downloads.listYoutubeJobs().find((job) => job.id === hermes.requestId);
  assert.equal(conversation.messages.filter((message) => message.role === 'user').length, 2);
  assert.ok(fs.existsSync(path.join(testRoot, 'config', 'hermes-conversations.json')));
  await assert.rejects(() => downloads.continueHermesConversation('missing', '계속'), /찾을 수 없습니다/);

  // Deleting a queued or running job must not require a file path or leave a request alive.
  const originalLookup = dns.lookup;
  const pendingLookups = [];
  dns.lookup = (_host, _options, callback) => { pendingLookups.push(callback); };
  try {
    const activeFile = downloads.startFile('https://download.example/test.iso');
    const queuedFile = downloads.startFile('https://download.example/next.iso');
    assert.equal(downloads.listYoutubeJobs().find((job) => job.id === queuedFile.id).status, 'queued');
    assert.deepEqual(await downloads.youtubeAction(queuedFile.id, 'delete'), { id: queuedFile.id, removed: true, fileDeleted: false });
    const deletion = downloads.youtubeAction(activeFile.id, 'delete');
    pendingLookups[0](null, [{ address: '8.8.8.8', family: 4 }]);
    assert.deepEqual(await deletion, { id: activeFile.id, removed: true, fileDeleted: false });
    assert.equal(downloads.listYoutubeJobs().some((job) => job.id === activeFile.id || job.id === queuedFile.id), false);
  } finally {
    dns.lookup = originalLookup;
  }

  const directory = settings.downloadDir;
  const tempDir = path.join(directory, '.nexuspulse-temp', 'fixture-job');
  fs.mkdirSync(tempDir, { recursive: true });
  const partialPath = path.join(directory, 'fixture.iso.part');
  const outputPath = path.join(directory, 'fixture.iso');
  fs.writeFileSync(partialPath, 'partial');
  fs.writeFileSync(outputPath, 'complete');
  fs.writeFileSync(path.join(tempDir, 'fragment'), 'temporary');
  assert.equal(downloads.deleteTrackedFile({ downloadDir: directory, partialPath, outputPath, tempDir }), true);
  assert.equal(fs.existsSync(partialPath) || fs.existsSync(outputPath) || fs.existsSync(tempDir), false);
  const outsidePath = path.join(testRoot, 'outside.iso');
  fs.writeFileSync(outsidePath, 'keep');
  const escapePath = path.join(directory, 'escape.iso');
  fs.symlinkSync(outsidePath, escapePath);
  assert.throws(() => downloads.deleteTrackedFile({ downloadDir: directory, outputPath: escapePath }), /저장 루트 밖/);
  assert.equal(fs.existsSync(outsidePath), true);

  // A restored Hermes request must retain its child job so the red action removes its files.
  const linkedOutput = path.join(directory, 'hermes-linked.iso');
  const linkedPartial = path.join(directory, 'hermes-linked.iso.part');
  const linkedTemp = path.join(directory, '.nexuspulse-temp', 'hermes-linked');
  fs.mkdirSync(linkedTemp, { recursive: true });
  fs.writeFileSync(linkedOutput, 'complete');
  fs.writeFileSync(linkedPartial, 'partial');
  fs.writeFileSync(path.join(linkedTemp, 'fragment'), 'temporary');
  const conversationsPath = path.join(testRoot, 'config', 'hermes-conversations.json');
  const conversations = JSON.parse(fs.readFileSync(conversationsPath, 'utf8'));
  const parent = conversations.find((item) => item.id === hermes.requestId);
  const childId = 'file-hermes-linked';
  parent.relatedJobIds = [childId];
  parent.relatedJobs = [{
    id: childId, kind: 'file', origin: 'hermes', parentRequestId: parent.id,
    status: 'completed', downloadDir: directory,
    outputPath: linkedOutput, partialPath: linkedPartial, tempDir: linkedTemp,
    createdAt: Date.now(), updatedAt: Date.now(),
  }];
  fs.writeFileSync(conversationsPath, JSON.stringify(conversations));
  delete require.cache[require.resolve('../server/downloadManager')];
  const restored = require('../server/downloadManager');
  assert.ok(restored.listYoutubeJobs().some((job) => job.id === childId));
  assert.deepEqual(await restored.youtubeAction(parent.id, 'delete'), { id: parent.id, removed: true, fileDeleted: true });
  assert.equal(restored.listYoutubeJobs().some((job) => job.id === childId || job.id === parent.id), false);
  assert.equal([linkedOutput, linkedPartial, linkedTemp].some((entry) => fs.existsSync(entry)), false);
  console.log('Download manager tests passed.');
}

run().finally(() => fs.rmSync(testRoot, { recursive: true, force: true }));
