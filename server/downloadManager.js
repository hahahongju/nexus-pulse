const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const CONFIG_DIR = process.env.NEXUSPULSE_CONFIG_DIR || path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(CONFIG_DIR, 'downloads.json');
const DEFAULT_DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || '/mnt/storage/downloads';
const MAX_YOUTUBE_CONCURRENCY = Math.max(1, Number(process.env.YOUTUBE_CONCURRENCY) || 2);
const HERMES_BIN = process.env.HERMES_BIN || '/home/hongju/.hermes/hermes-agent/venv/bin/hermes';
const HERMES_PROVIDER = process.env.HERMES_DOWNLOAD_PROVIDER || 'custom:omniroute-fast';
const HERMES_MODEL = process.env.HERMES_DOWNLOAD_MODEL || 'auto/pro-fast';
const HERMES_DOWNLOAD_TIMEOUT_MS = Math.min(30 * 60 * 1000, Math.max(3 * 60 * 1000, Number(process.env.HERMES_DOWNLOAD_TIMEOUT_MS) || 15 * 60 * 1000));
const jobs = new Map();
const activeHermesRequests = new Set();
const YOUTUBE_QUALITY_PRESETS = Object.freeze({
  '360p': {
    label: '360p 용량 절약',
    args: ['--format', 'bv*[height<=360][vcodec^=avc1]+ba[ext=m4a]/b[height<=360][ext=mp4]/b[height<=360]', '--merge-output-format', 'mp4'],
  },
  '480p': {
    label: '480p 표준',
    args: ['--format', 'bv*[height<=480][vcodec^=avc1]+ba[ext=m4a]/b[height<=480][ext=mp4]/b[height<=480]', '--merge-output-format', 'mp4'],
  },
  '720p': {
    label: '720p 태블릿 권장',
    args: ['--format', 'bv*[height<=720][vcodec^=avc1]+ba[ext=m4a]/b[height<=720][ext=mp4]/b[height<=720]', '--merge-output-format', 'mp4'],
  },
  '1080p': {
    label: '1080p 고화질',
    args: ['--format', 'bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]/b[height<=1080][ext=mp4]/b[height<=1080]', '--merge-output-format', 'mp4'],
  },
  best: {
    label: '최고 화질',
    args: ['--format', 'bestvideo*+bestaudio/best', '--merge-output-format', 'mp4'],
  },
  audio: {
    label: 'MP3 오디오만',
    args: ['--format', 'bestaudio/best', '--extract-audio', '--audio-format', 'mp3', '--audio-quality', '192K'],
  },
});

function commandExists(command) {
  try {
    const paths = (process.env.PATH || '').split(path.delimiter);
    return paths.some((directory) => {
      try {
        fs.accessSync(path.join(directory, command), fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function readSettings() {
  try {
    return { downloadDir: DEFAULT_DOWNLOAD_DIR, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch {
    return { downloadDir: DEFAULT_DOWNLOAD_DIR };
  }
}

const FORBIDDEN_ROOT_DIRS = [
  '/', '/bin', '/boot', '/dev', '/etc', '/lib', '/lib64', '/proc', '/root', '/run', '/sbin', '/sys', '/usr', '/var'
];
const SENSITIVE_USER_DIRS = [
  '.ssh', '.gnupg', '.config/systemd'
];

function validateDownloadDir(input) {
  if (typeof input !== 'string' || !path.isAbsolute(input)) throw new Error('저장 경로는 절대 경로여야 합니다.');
  const resolved = path.resolve(input.trim());
  const normalized = path.normalize(resolved);

  for (const forbidden of FORBIDDEN_ROOT_DIRS) {
    if (normalized === forbidden || normalized.startsWith(forbidden + path.sep)) {
      if (normalized.startsWith('/mnt/') || normalized.startsWith('/media/')) {
        continue;
      }
      throw new Error(`보호된 시스템 디렉터리(${forbidden})는 저장 경로로 사용할 수 없습니다.`);
    }
  }

  for (const sensitive of SENSITIVE_USER_DIRS) {
    if (normalized.includes(`/${sensitive}`) || normalized.endsWith(`/${sensitive}`)) {
      throw new Error(`보안에 민감한 디렉터리(${sensitive})는 저장 경로로 사용할 수 없습니다.`);
    }
  }

  if (!fs.existsSync(normalized)) fs.mkdirSync(normalized, { recursive: true });
  const realPath = fs.realpathSync(normalized);
  const allowedExternal = realPath === '/mnt' || realPath.startsWith('/mnt/') || realPath === '/media' || realPath.startsWith('/media/');
  if (!allowedExternal && realPath !== normalized) throw new Error('심볼릭 링크를 통한 저장 경로는 사용할 수 없습니다.');
  const stat = fs.statSync(realPath);
  if (!stat.isDirectory()) throw new Error('저장 경로가 디렉터리가 아닙니다.');
  fs.accessSync(normalized, fs.constants.R_OK | fs.constants.W_OK);
  return realPath;
}

function saveSettings(next) {
  const settings = { downloadDir: validateDownloadDir(next.downloadDir) };
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  return settings;
}

function storageCandidates() {
  const settings = readSettings();
  const mounts = [];
  try {
    const seen = new Set();
    const lines = fs.readFileSync('/proc/mounts', 'utf8').split('\n');
    for (const line of lines) {
      const [device, mount, type] = line.split(' ');
      if (!device || !mount || !device.startsWith('/dev/') || seen.has(mount)) continue;
      seen.add(mount);
      let stats = null;
      try { stats = fs.statfsSync(mount); } catch { /* unavailable mount */ }
      mounts.push({
        device,
        mount: mount.replace(/\\040/g, ' '),
        type,
        removable: mount.startsWith('/media/') || mount.startsWith('/mnt/'),
        totalBytes: stats ? stats.blocks * stats.bsize : 0,
        freeBytes: stats ? stats.bavail * stats.bsize : 0,
      });
    }
  } catch { /* Linux mount discovery is best effort. */ }
  return { current: settings.downloadDir, mounts };
}

function parseTorrentList(output) {
  return output.split('\n').slice(1).filter((line) => line.trim() && !line.trim().startsWith('Sum:')).map((line) => {
    const match = line.match(/^\s*(\d+)\*?\s+(\S+)\s+(.{10})\s+(.{8})\s+([\d.]+)\s+([\d.]+)\s+(\S+)\s+(.{12})\s+(.+)$/);
    if (!match) return null;
    return {
      id: Number(match[1]), done: match[2], have: match[3].trim(), eta: match[4].trim(),
      uploadKbps: Number(match[5]), downloadKbps: Number(match[6]), ratio: match[7],
      status: match[8].trim(), name: match[9].trim(),
    };
  }).filter(Boolean);
}

async function transmission(args) {
  if (!commandExists('transmission-remote')) throw new Error('transmission-remote가 설치되지 않았습니다.');
  const { stdout } = await execFileAsync('transmission-remote', args, { timeout: 15000, maxBuffer: 1024 * 1024 });
  return stdout;
}

function executeHermesJob(requestJob) {
  const normalized = requestJob.output || '';
  if (!normalized) throw new Error('재시작할 Hermes 요청 내용이 없습니다.');
  requestJob.status = 'discovering';
  requestJob.progress = 5;
  requestJob.speed = '콘텐츠 검색·선정 중';
  requestJob.eta = '';
  requestJob.error = '';
  requestJob.updatedAt = Date.now();
  activeHermesRequests.add(requestJob.id);
  const instruction = [
    '사용자의 다운로드 요청을 처리하라.',
    '반드시 nexus-downloads skill과 nexus_download 도구를 사용하라.',
    'URL이 없으면 web 도구로 공식 채널의 적절한 콘텐츠를 찾은 뒤 다운로드 큐에 추가하라.',
    '다운로드와 상태 확인 외의 작업은 하지 마라.',
    `사용자 요청: ${normalized}`,
  ].join('\n');
  execFileAsync(HERMES_BIN, [
      '--in', path.join(__dirname, '..'),
      '--oneshot', instruction,
      '--provider', HERMES_PROVIDER,
      '--model', HERMES_MODEL,
      '--skills', 'nexus-downloads',
      '--toolsets', 'web,nexus_downloads',
      '--reasoning', 'low',
    ], { timeout: HERMES_DOWNLOAD_TIMEOUT_MS, maxBuffer: 1024 * 1024 })
    .then(({ stdout }) => {
      requestJob.status = 'completed';
      requestJob.progress = 100;
      requestJob.speed = '큐 등록 완료';
      requestJob.output = stdout.trim() || normalized;
      requestJob.updatedAt = Date.now();
    })
    .catch((error) => {
      const detail = String(error.stderr || error.stdout || error.message || '')
        .replace(/(?:sk-|fc-)[A-Za-z0-9_-]{12,}/g, '[redacted]')
        .trim()
        .slice(-1200);
      requestJob.status = 'failed';
      requestJob.error = `Hermes 요청 실패 (${HERMES_PROVIDER}/${HERMES_MODEL})${detail ? `: ${detail}` : ''}`;
      requestJob.updatedAt = Date.now();
    })
    .finally(() => activeHermesRequests.delete(requestJob.id));
}

async function requestWithHermes(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('다운로드 요청을 입력하세요.');
  const normalized = prompt.trim();
  if (normalized.length > 500) throw new Error('요청은 500자 이하로 입력하세요.');
  if (!fs.existsSync(HERMES_BIN)) throw new Error('Hermes 실행 파일을 찾을 수 없습니다.');
  const requestId = `hermes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const requestJob = {
    id: requestId, kind: 'hermes-request', origin: 'hermes', url: '', quality: '',
    status: 'discovering', progress: 5, speed: '콘텐츠 검색·선정 중', eta: '',
    output: normalized, outputPath: '', error: '',
    createdAt: Date.now(), updatedAt: Date.now(), process: null,
  };
  jobs.set(requestId, requestJob);
  executeHermesJob(requestJob);
  return { message: 'Hermes가 백그라운드에서 콘텐츠를 검색하고 있습니다.', requestId };
}

async function getTransmission() {
  try {
    const output = await transmission(['-l']);
    return { available: true, connected: true, torrents: parseTorrentList(output) };
  } catch (error) {
    return { available: commandExists('transmission-remote'), connected: false, torrents: [], error: error.message };
  }
}

async function addTorrent(uri) {
  if (typeof uri !== 'string' || (!uri.startsWith('magnet:?') && !/^https?:\/\//i.test(uri))) {
    throw new Error('Magnet 또는 HTTP(S) torrent URL만 사용할 수 있습니다.');
  }
  const settings = readSettings();
  await transmission(['-w', validateDownloadDir(settings.downloadDir), '-a', uri]);
  return getTransmission();
}

async function torrentAction(id, action) {
  if (!/^\d+$/.test(String(id))) throw new Error('잘못된 torrent ID입니다.');
  const flags = { start: '-s', stop: '-S', remove: '-r', delete: '-rad' };
  if (!flags[action]) throw new Error('지원하지 않는 Transmission 작업입니다.');
  await transmission(['-t', String(id), flags[action]]);
  return getTransmission();
}

function publicJob(job) {
  const { process: child, ...data } = job;
  return data;
}

function deleteTrackedFile(job) {
  if (!job.outputPath) throw new Error('삭제할 완료 파일 경로가 없습니다.');
  const root = fs.realpathSync(validateDownloadDir(readSettings().downloadDir));
  const target = fs.realpathSync(job.outputPath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error('저장 루트 밖의 파일은 삭제할 수 없습니다.');
  if (!fs.statSync(target).isFile()) throw new Error('일반 파일만 삭제할 수 있습니다.');
  fs.unlinkSync(target);
  job.outputPath = '';
}

function listYoutubeJobs() {
  const priority = { running: 0, discovering: 1, queued: 2, paused: 3, failed: 4, cancelled: 5, completed: 6 };
  return Array.from(jobs.values()).map(publicJob).sort((a, b) => {
    const statusOrder = (priority[a.status] ?? 99) - (priority[b.status] ?? 99);
    return statusOrder || b.createdAt - a.createdAt;
  });
}

function qualityOptions() {
  return Object.entries(YOUTUBE_QUALITY_PRESETS).map(([id, preset]) => ({ id, label: preset.label }));
}

function parseYoutubeProgressLine(line) {
  const clean = line.replace(/\x1b\[[0-9;]*m/g, '');
  const match = clean.match(/^download:\s*([\d.]+)%\|([^|]*)\|([^|]*)/);
  if (!match) return null;
  return { progress: Number(match[1]), speed: match[2].trim(), eta: match[3].trim() };
}

function launchYoutube(job) {
  const downloadDir = validateDownloadDir(readSettings().downloadDir);
  const url = job.url;
  const preset = YOUTUBE_QUALITY_PRESETS[job.quality];
  if (!preset) throw new Error('지원하지 않는 YouTube 화질입니다.');
  if (!commandExists('yt-dlp')) throw new Error('yt-dlp가 설치되지 않았습니다. 설치 후 다시 시도하세요.');
  const args = [
    '--newline',
    '--no-colors',
    '--progress-delta', '0.5',
    '--no-playlist',
    '--windows-filenames',
    '--trim-filenames', '70',
    '--js-runtimes', 'node:/usr/bin/node',
    '--remote-components', 'ejs:github',
    ...preset.args,
    '--progress-template', 'download:download:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
    '--print', 'after_move:filepath:%(filepath)s',
    '-P', downloadDir,
    '-o', '%(title)s [%(id)s].%(ext)s',
    url,
  ];
  const child = spawn('yt-dlp', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  });
  job.process = child;
  job.status = 'running';
  const pending = { stdout: '', stderr: '' };
  const consume = (buffer, isError = false, flush = false) => {
    const channel = isError ? 'stderr' : 'stdout';
    pending[channel] += buffer.toString();
    const lines = pending[channel].split(/[\r\n]+/);
    const tail = lines.pop() || '';
    pending[channel] = flush ? '' : tail;
    if (flush && tail) lines.push(tail);
    for (const rawLine of lines) {
      const line = rawLine.replace(/\x1b\[[0-9;]*m/g, '');
      const progress = parseYoutubeProgressLine(line);
      if (progress) {
        Object.assign(job, progress);
      } else if (line.startsWith('filepath:')) {
        job.outputPath = line.slice('filepath:'.length).trim();
      } else if (line.trim()) {
        const value = line.trim().slice(0, 500);
        if (isError) job.error = value; else job.output = value;
      }
      job.updatedAt = Date.now();
    }
  };
  child.stdout.on('data', (data) => consume(data));
  child.stderr.on('data', (data) => consume(data, true));
  child.on('error', (error) => { job.status = 'failed'; job.error = error.message; job.updatedAt = Date.now(); });
  child.on('close', (code) => {
    consume('', false, true);
    consume('', true, true);
    job.status = code === 0 ? 'completed' : (job.status === 'cancelled' ? 'cancelled' : 'failed');
    if (code === 0) { job.progress = 100; job.error = ''; }
    job.updatedAt = Date.now();
    job.process = null;
    pumpYoutubeQueue();
  });
}

function pumpYoutubeQueue() {
  const active = Array.from(jobs.values()).filter((job) => ['running', 'paused'].includes(job.status)).length;
  const slots = Math.max(0, MAX_YOUTUBE_CONCURRENCY - active);
  Array.from(jobs.values()).filter((job) => job.status === 'queued').slice(0, slots).forEach((job) => {
    try { launchYoutube(job); }
    catch (error) { job.status = 'failed'; job.error = error.message; job.updatedAt = Date.now(); }
  });
}

function startYoutube(url, quality = '720p') {
  if (!commandExists('yt-dlp')) throw new Error('yt-dlp가 설치되지 않았습니다. 설치 후 다시 시도하세요.');
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('유효한 HTTP(S) 동영상 URL을 입력하세요.');
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { throw new Error('유효하지 않은 YouTube URL입니다.'); }
  if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
    throw new Error('YouTube 주소만 다운로드할 수 있습니다.');
  }
  if (!YOUTUBE_QUALITY_PRESETS[quality]) throw new Error('지원하지 않는 YouTube 화질입니다.');
  validateDownloadDir(readSettings().downloadDir);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job = { id, kind: 'youtube', origin: activeHermesRequests.size > 0 ? 'hermes' : 'manual', url, quality, status: 'queued', progress: 0, speed: '', eta: '', output: '', outputPath: '', error: '', createdAt: Date.now(), updatedAt: Date.now(), process: null };
  jobs.set(id, job);
  pumpYoutubeQueue();
  return publicJob(job);
}

function retryYoutubeJob(job) {
  if (['running', 'paused', 'discovering'].includes(job.status)) {
    throw new Error(`현재 상태(${job.status})에서 작업을 재시작할 수 없습니다.`);
  }
  if (job.kind === 'hermes-request') {
    executeHermesJob(job);
    return publicJob(job);
  }
  if (!job.url) {
    throw new Error('재시작할 동영상 URL이 없습니다.');
  }
  job.status = 'queued';
  job.progress = 0;
  job.speed = '';
  job.eta = '';
  job.error = '';
  job.outputPath = '';
  job.updatedAt = Date.now();
  pumpYoutubeQueue();
  return publicJob(job);
}

function youtubeAction(id, action) {
  const job = jobs.get(id);
  if (!job) throw new Error('YouTube 작업을 찾을 수 없습니다.');
  if (action === 'pause' && job.process && job.status === 'running') {
    job.process.kill('SIGSTOP'); job.status = 'paused'; job.updatedAt = Date.now();
  } else if (action === 'resume' && job.process && job.status === 'paused') {
    job.process.kill('SIGCONT'); job.status = 'running'; job.updatedAt = Date.now();
  } else if (action === 'cancel' && job.process && ['running', 'paused'].includes(job.status)) {
    if (job.status === 'paused') job.process.kill('SIGCONT');
    job.status = 'cancelled'; job.process.kill('SIGTERM');
  } else if (action === 'cancel' && job.status === 'queued') {
    job.status = 'cancelled'; job.updatedAt = Date.now(); pumpYoutubeQueue();
  } else if ((action === 'retry' || action === 'restart') && !['running', 'paused'].includes(job.status)) {
    return retryYoutubeJob(job);
  } else if (action === 'remove' && !['running', 'paused'].includes(job.status)) {
    jobs.delete(id); return { id, removed: true };
  } else if (action === 'delete' && !['running', 'paused'].includes(job.status)) {
    deleteTrackedFile(job); jobs.delete(id); return { id, removed: true, fileDeleted: true };
  } else {
    throw new Error(`현재 상태(${job.status})에서 ${action} 작업을 수행할 수 없습니다.`);
  }
  return publicJob(job);
}

function clearFailedYoutubeJobs() {
  const removedIds = [];
  for (const [id, job] of jobs) {
    if (job.status !== 'failed') continue;
    jobs.delete(id);
    removedIds.push(id);
  }
  return { removed: removedIds.length, ids: removedIds };
}

function retryFailedYoutubeJobs() {
  const retriedIds = [];
  for (const [id, job] of jobs) {
    if (job.status !== 'failed') continue;
    try {
      retryYoutubeJob(job);
      retriedIds.push(id);
    } catch {
      // ignore
    }
  }
  return { retried: retriedIds.length, ids: retriedIds };
}

function getStatus() {
  const settings = readSettings();
  let writable = false;
  try { fs.accessSync(settings.downloadDir, fs.constants.W_OK); writable = true; } catch { /* shown in diagnostics */ }
  return { settings, storage: storageCandidates(), qualityOptions: qualityOptions(), tools: { transmission: commandExists('transmission-remote'), ytDlp: commandExists('yt-dlp') }, writable };
}

function hydrateCompletedFiles() {
  const directory = readSettings().downloadDir;
  try {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.mp4')) continue;
      const videoId = entry.name.match(/\[([A-Za-z0-9_-]{11})\]\.mp4$/)?.[1];
      const outputPath = path.join(directory, entry.name);
      const stat = fs.statSync(outputPath);
      const id = `file-${videoId || Buffer.from(entry.name).toString('base64url').slice(0, 18)}`;
      if (jobs.has(id)) continue;
      jobs.set(id, {
        id,
        url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : '',
        quality: 'existing',
        status: 'completed',
        progress: 100,
        speed: '', eta: '', output: entry.name, outputPath, error: '',
        createdAt: stat.mtimeMs, updatedAt: stat.mtimeMs, process: null,
      });
    }
  } catch { /* An unavailable storage device is reported by getStatus(). */ }
}

hydrateCompletedFiles();

module.exports = { getStatus, saveSettings, getTransmission, addTorrent, torrentAction, listYoutubeJobs, startYoutube, youtubeAction, clearFailedYoutubeJobs, retryFailedYoutubeJobs, retryYoutubeJob, requestWithHermes, qualityOptions, parseYoutubeProgressLine };
