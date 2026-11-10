const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const dns = require('dns');
const net = require('net');
const { Transform } = require('stream');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const CONFIG_DIR = process.env.NEXUSPULSE_CONFIG_DIR || path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(CONFIG_DIR, 'downloads.json');
const HERMES_CONVERSATIONS_FILE = path.join(CONFIG_DIR, 'hermes-conversations.json');
const DEFAULT_DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || '/mnt/storage/downloads';
const MAX_YOUTUBE_CONCURRENCY = Math.max(1, Number(process.env.YOUTUBE_CONCURRENCY) || 2);
const HERMES_BIN = process.env.HERMES_BIN || '/mnt/hermes/engine/hermes-agent/venv/bin/hermes';
const HERMES_PROVIDER = process.env.HERMES_DOWNLOAD_PROVIDER || 'custom:omniroute-fast';
const HERMES_MODEL = process.env.HERMES_DOWNLOAD_MODEL || 'auto/pro-fast';
const HERMES_DOWNLOAD_TIMEOUT_MS = Math.min(30 * 60 * 1000, Math.max(3 * 60 * 1000, Number(process.env.HERMES_DOWNLOAD_TIMEOUT_MS) || 15 * 60 * 1000));
const jobs = new Map();
const activeHermesRequests = new Set();
const MAX_HERMES_MESSAGE_LENGTH = 1000;
const MAX_HERMES_HISTORY_MESSAGES = 12;
const MAX_HERMES_HISTORY_CHARS = 8000;
const MAX_FILE_BYTES = Math.max(1024 ** 3, Number(process.env.MAX_FILE_DOWNLOAD_BYTES) || 100 * 1024 ** 3);
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

function saveHermesConversations() {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    const conversations = Array.from(jobs.values())
      .filter((job) => job.kind === 'hermes-request')
      .map((job) => ({
        ...publicJob(job),
        relatedJobs: (job.relatedJobIds || []).map((id) => jobs.get(id)).filter(Boolean).map(publicJob),
      }));
    const temporary = `${HERMES_CONVERSATIONS_FILE}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(conversations, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, HERMES_CONVERSATIONS_FILE);
  } catch (error) {
    console.error('[Hermes] 대화 저장 실패:', error.message);
  }
}

function validateHermesMessage(message) {
  if (typeof message !== 'string' || !message.trim()) throw new Error('Hermes에게 보낼 내용을 입력하세요.');
  const normalized = message.trim();
  if (normalized.length > MAX_HERMES_MESSAGE_LENGTH) throw new Error(`메시지는 ${MAX_HERMES_MESSAGE_LENGTH}자 이하로 입력하세요.`);
  return normalized;
}

function formatHermesTranscript(messages) {
  const selected = [];
  let remaining = MAX_HERMES_HISTORY_CHARS;
  for (const message of messages.slice(-MAX_HERMES_HISTORY_MESSAGES).reverse()) {
    const role = message.role === 'assistant' ? 'Hermes' : '사용자';
    const prefix = `${role}: `;
    const content = String(message.content || '').trim();
    const allowance = remaining - prefix.length - 2;
    if (allowance <= 0) break;
    const bounded = content.length > allowance
      ? (allowance > 1 ? `…${content.slice(-(allowance - 1))}` : content.slice(-allowance))
      : content;
    selected.push(`${prefix}${bounded}`);
    remaining -= prefix.length + bounded.length + 2;
  }
  return selected.reverse().join('\n\n') || '(이전 대화 없음)';
}

function executeHermesJob(requestJob) {
  if (!requestJob.prompt) throw new Error('재시작할 Hermes 요청 목표가 없습니다.');
  if (activeHermesRequests.has(requestJob.id)) throw new Error('Hermes가 이미 이 요청을 처리 중입니다.');
  requestJob.messages = Array.isArray(requestJob.messages) ? requestJob.messages : [];
  requestJob.status = 'discovering';
  requestJob.progress = 5;
  requestJob.speed = '콘텐츠 검색·선정 중';
  requestJob.eta = '';
  requestJob.error = '';
  requestJob.updatedAt = Date.now();
  const startedAt = Date.now();
  activeHermesRequests.add(requestJob.id);
  saveHermesConversations();
  const history = (requestJob.messages || []).filter((message, index) =>
    !(index === 0 && message.role === 'user' && message.content === requestJob.prompt));
  const transcript = formatHermesTranscript(history);
  const relatedDownloads = (requestJob.relatedJobIds || [])
    .map((id) => jobs.get(id))
    .filter(Boolean)
    .map((job) => {
      const state = ({ queued: '대기 중', running: '다운로드 중', paused: '일시정지', completed: '완료', failed: '실패', cancelled: '취소됨' })[job.status] || job.status;
      const details = [
        `${job.kind === 'youtube' ? 'YouTube' : '일반 파일'}: ${state}`,
        job.status === 'running' ? `${job.progress || 0}%` : '',
        job.outputPath ? `저장 경로: ${job.outputPath}` : '',
        job.error ? `오류: ${job.error}` : '',
      ].filter(Boolean);
      return `- ${details.join(' · ')}`;
    });
  const instruction = [
    'NexusPulse 다운로드 요청을 처리한다. `nexus-downloads` 스킬을 따르고, 대화 기록보다 사용자의 최신 요청을 우선한다.',
    '중요: 이 CLI에서 `nexus_download`는 지연 로드 도구다. 최상위 도구로 직접 호출하지 마라. `tool_describe(names:["nexus_download"])`로 스키마를 확인한 뒤 `tool_call(calls:[{name:"nexus_download",arguments:{...}}])`로 실행한다. 이름이 이미 보이면 `tool_search`로 다시 찾지 않는다.',
    'URL 없는 YouTube 요청 중 인기 영상 1개 요청은 `nexus_download`의 `action:"search_add"`를 사용해 검색과 큐 등록을 한 번에 처리한다: `tool_call(calls:[{name:"nexus_download",arguments:{"action":"search_add","source":"youtube","query":"검색어","quality":"720p"}}])`. 이 동작은 관련 검색 후보 중 조회수가 가장 높은 항목을 자동 선택한다. 여러 개 요청, 엄격한 조건, 또는 후보 선택이 필요한 요청은 `action:"search"`로 후보를 확인한 뒤 각 선택 URL을 포함한 `action:"add"`를 별도로 호출한다. 검색 결과 URL 없이 `add`하지 않는다.',
    '소프트웨어·ISO·문서는 공식 배포처와 정확한 버전·에디션·언어·아키텍처를 `web_search`/`web_extract`로 확인한 뒤 진행한다. 불명확하면 묻고, 검색 결과 페이지나 미러를 다운로드 URL로 사용하지 않는다.',
    '큐 등록이나 실제 완료 상태를 도구 결과로 확인하기 전에는 완료라고 말하지 않는다. 상태 질문은 목록/상태를 조회한다. 오류가 나면 같은 호출을 반복하지 말고 구체적인 오류를 보고한다.',
    '요청한 다운로드 관리와 결과 확인만 한다. 미래형 약속으로 끝내지 말고, 실제 조치하거나 필요한 선택을 묻는다.',
    `최초 목표: ${requestJob.prompt}`,
    `연결된 다운로드의 현재 서버 상태:\n${relatedDownloads.length ? relatedDownloads.join('\n') : '- 연결된 다운로드 작업 없음'}`,
    `최근 대화(최대 ${MAX_HERMES_HISTORY_MESSAGES}개, ${MAX_HERMES_HISTORY_CHARS}자):\n${transcript}`,
  ].join('\n');
  execFileAsync(HERMES_BIN, [
      '--in', path.join(__dirname, '..'),
      '--oneshot', instruction,
      '--provider', HERMES_PROVIDER,
      '--model', HERMES_MODEL,
      '--skills', 'nexus-downloads',
      '--toolsets', 'web,nexus_downloads',
      '--reasoning', 'none',
    ], {
      timeout: HERMES_DOWNLOAD_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, NEXUSPULSE_HERMES_REQUEST_ID: requestJob.id },
    })
    .then(({ stdout }) => {
      const response = stdout.trim() || 'Hermes가 응답 없이 종료되었습니다. 원하는 조건을 더 구체적으로 알려주세요.';
      const outputLimitFailure = /No visible answer was produced|hit its output-token limit|output-token limit/i.test(response);
      requestJob.status = outputLimitFailure ? 'failed' : 'awaiting-input';
      requestJob.progress = outputLimitFailure ? 0 : 100;
      requestJob.speed = outputLimitFailure ? '모델 출력 한도 초과' : '응답 완료 · 후속 대화 가능';
      requestJob.error = outputLimitFailure ? response.slice(0, 1200) : '';
      requestJob.output = outputLimitFailure ? '' : response;
      requestJob.messages.push({ role: 'assistant', content: response, createdAt: Date.now() });
      requestJob.updatedAt = Date.now();
      saveHermesConversations();
    })
    .catch((error) => {
      const detail = String(error.stderr || error.stdout || error.message || '')
        .replace(/(?:sk-|fc-)[A-Za-z0-9_-]{12,}/g, '[redacted]')
        .trim()
        .slice(-1200);
      requestJob.status = 'failed';
      requestJob.error = `Hermes 요청 실패 (${HERMES_PROVIDER}/${HERMES_MODEL})${detail ? `: ${detail}` : ''}`;
      requestJob.updatedAt = Date.now();
      saveHermesConversations();
    })
    .finally(() => {
      console.info(`[Hermes] request=${requestJob.id} status=${requestJob.status} duration_ms=${Date.now() - startedAt} provider=${HERMES_PROVIDER} model=${HERMES_MODEL}`);
      activeHermesRequests.delete(requestJob.id);
    });
}

async function requestWithHermes(prompt) {
  const normalized = validateHermesMessage(prompt);
  if (!fs.existsSync(HERMES_BIN)) throw new Error('Hermes 실행 파일을 찾을 수 없습니다.');
  const requestId = `hermes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const requestJob = {
    id: requestId, kind: 'hermes-request', origin: 'hermes', url: '', quality: '',
    status: 'discovering', progress: 5, speed: '콘텐츠 검색·선정 중', eta: '',
    prompt: normalized, output: '', outputPath: '', error: '',
    messages: [{ role: 'user', content: normalized, createdAt: Date.now() }], relatedJobIds: [],
    createdAt: Date.now(), updatedAt: Date.now(), process: null,
  };
  jobs.set(requestId, requestJob);
  executeHermesJob(requestJob);
  return { message: 'Hermes가 백그라운드에서 콘텐츠를 검색하고 있습니다.', requestId };
}

async function continueHermesConversation(id, message) {
  const requestJob = jobs.get(id);
  if (!requestJob || requestJob.kind !== 'hermes-request') throw new Error('Hermes 대화를 찾을 수 없습니다.');
  if (activeHermesRequests.has(id) || requestJob.status === 'discovering') throw new Error('Hermes가 이전 메시지를 처리 중입니다. 응답 후 다시 보내세요.');
  if (!fs.existsSync(HERMES_BIN)) throw new Error('Hermes 실행 파일을 찾을 수 없습니다.');
  const normalized = validateHermesMessage(message);
  requestJob.messages = Array.isArray(requestJob.messages) ? requestJob.messages : [];
  requestJob.messages.push({ role: 'user', content: normalized, createdAt: Date.now() });
  requestJob.error = '';
  executeHermesJob(requestJob);
  return { message: '후속 요청을 Hermes에게 전달했습니다.', requestId: id };
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
  const { process: child, request, stream, settled, ...data } = job;
  return data;
}

function isPrivateAddress(address) {
  const value = String(address || '').toLowerCase().split('%')[0];
  if (net.isIPv4(value)) {
    const [a, b] = value.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19));
  }
  if (net.isIPv6(value)) {
    if (value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) return true;
    const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return mapped ? isPrivateAddress(mapped) : false;
  }
  return true;
}

function validateFileUrl(input) {
  let parsed;
  try { parsed = new URL(input); } catch { throw new Error('유효한 HTTP(S) 파일 URL을 입력하세요.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('HTTP(S) 파일 URL만 사용할 수 있습니다.');
  if (parsed.username || parsed.password) throw new Error('인증 정보가 포함된 URL은 사용할 수 없습니다.');
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || (net.isIP(hostname) && isPrivateAddress(hostname))) {
    throw new Error('내부 네트워크 주소에서는 파일을 다운로드할 수 없습니다.');
  }
  return parsed;
}

async function resolvePublicAddress(hostname) {
  const records = await new Promise((resolve, reject) => {
    dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => error ? reject(error) : resolve(addresses));
  });
  if (!records.length || records.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('내부 네트워크로 연결되는 주소는 다운로드할 수 없습니다.');
  }
  return records[0];
}

function safeFilename(value) {
  const cleaned = String(value || '').normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '_')
    .replace(/^\.+/, '').trim().slice(0, 180);
  return cleaned || `download-${Date.now()}.bin`;
}

function responseFilename(response, url) {
  const disposition = String(response.headers['content-disposition'] || '');
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  let candidate = plain;
  if (encoded) {
    try { candidate = decodeURIComponent(encoded); } catch { candidate = encoded; }
  }
  if (!candidate) candidate = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
  return safeFilename(candidate);
}

function availableFilename(directory, filename) {
  const extension = path.extname(filename);
  const stem = path.basename(filename, extension);
  let candidate = path.join(directory, filename);
  for (let index = 1; fs.existsSync(candidate) || fs.existsSync(`${candidate}.part`); index += 1) {
    candidate = path.join(directory, `${stem} (${index})${extension}`);
  }
  return candidate;
}

function isDownloadableContentType(contentType) {
  const normalized = String(contentType || '').split(';')[0].trim().toLowerCase();
  return !['text/html', 'application/xhtml+xml'].includes(normalized);
}

async function downloadFileResponse(job, url, redirects = 0) {
  if (job.status === 'cancelled') throw new Error('다운로드가 취소되었습니다.');
  if (redirects > 5) throw new Error('파일 URL의 리다이렉트가 너무 많습니다.');
  const parsed = validateFileUrl(url);
  const resolved = await resolvePublicAddress(parsed.hostname);
  if (job.status === 'cancelled') throw new Error('다운로드가 취소되었습니다.');
  const partialSize = job.partialPath && fs.existsSync(job.partialPath) ? fs.statSync(job.partialPath).size : 0;
  const headers = { 'User-Agent': 'NexusPulse/1.0', Accept: '*/*' };
  if (partialSize > 0) headers.Range = `bytes=${partialSize}-`;

  return new Promise((resolve, reject) => {
    const transport = parsed.protocol === 'https:' ? https : http;
    const request = transport.get(parsed, {
      headers,
      lookup: (_hostname, options, callback) => {
        if (options?.all) callback(null, [resolved]);
        else callback(null, resolved.address, resolved.family);
      },
    }, (response) => {
      if (job.status === 'cancelled') {
        response.destroy();
        reject(new Error('다운로드가 취소되었습니다.'));
        return;
      }
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        const nextUrl = new URL(response.headers.location, parsed).toString();
        downloadFileResponse(job, nextUrl, redirects + 1).then(resolve, reject);
        return;
      }
      if (![200, 206].includes(response.statusCode)) {
        response.resume();
        reject(new Error(`파일 서버가 HTTP ${response.statusCode}로 응답했습니다.`));
        return;
      }
      if (!isDownloadableContentType(response.headers['content-type'])) {
        response.resume();
        reject(new Error('직접 다운로드 파일이 아니라 웹 안내 페이지입니다. 공식 파일 URL을 다시 확인하세요.'));
        return;
      }

      const downloadDir = validateDownloadDir(readSettings().downloadDir);
      if (!job.outputPath) {
        job.outputPath = availableFilename(downloadDir, job.filename || responseFilename(response, parsed));
        job.partialPath = `${job.outputPath}.part`;
        job.output = path.basename(job.outputPath);
        if (job.parentRequestId) saveHermesConversations();
      }
      let existing = fs.existsSync(job.partialPath) ? fs.statSync(job.partialPath).size : 0;
      if (existing > 0 && response.statusCode !== 206) {
        fs.truncateSync(job.partialPath, 0);
        existing = 0;
      }
      const contentLength = Number(response.headers['content-length']) || 0;
      const rangeTotal = Number(String(response.headers['content-range'] || '').match(/\/(\d+)$/)?.[1]) || 0;
      const total = rangeTotal || existing + contentLength;
      if (total > MAX_FILE_BYTES) {
        response.destroy();
        reject(new Error(`파일 크기가 제한(${Math.round(MAX_FILE_BYTES / 1024 ** 3)}GB)을 초과합니다.`));
        return;
      }
      if (total) {
        const stats = fs.statfsSync(downloadDir);
        const freeBytes = stats.bavail * stats.bsize;
        if (Math.max(0, total - existing) > freeBytes - 1024 ** 3) {
          response.destroy();
          reject(new Error('저장 공간이 부족합니다. 최소 1GB의 여유 공간을 남겨야 합니다.'));
          return;
        }
      } else {
        const stats = fs.statfsSync(downloadDir);
        if (stats.bavail * stats.bsize <= 1024 ** 3) {
          response.destroy();
          reject(new Error('저장 공간이 부족합니다. 최소 1GB의 여유 공간을 남겨야 합니다.'));
          return;
        }
      }

      const stream = fs.createWriteStream(job.partialPath, { flags: existing ? 'a' : 'wx', mode: 0o600 });
      job.stream = stream;
      stream.on('close', () => { if (job.stream === stream) job.stream = null; });
      let received = existing;
      let lastSpaceCheck = existing;
      let intervalBytes = 0;
      let lastUpdate = Date.now();
      const guard = new Transform({
        transform(chunk, encoding, callback) {
          const nextReceived = received + chunk.length;
          if (nextReceived > MAX_FILE_BYTES) {
            callback(new Error(`파일 크기가 제한(${Math.round(MAX_FILE_BYTES / 1024 ** 3)}GB)을 초과합니다.`));
            return;
          }
          if (nextReceived - lastSpaceCheck >= 8 * 1024 ** 2) {
            try {
              const stats = fs.statfsSync(downloadDir);
              if (stats.bavail * stats.bsize < 1024 ** 3 + chunk.length) {
                callback(new Error('저장 공간이 부족합니다. 최소 1GB의 여유 공간을 남겨야 합니다.'));
                return;
              }
              lastSpaceCheck = nextReceived;
            } catch (error) {
              callback(error);
              return;
            }
          }
          received = nextReceived;
          intervalBytes += chunk.length;
          const now = Date.now();
          if (now - lastUpdate >= 1000) {
            job.progress = total ? Math.min(99.9, received / total * 100) : 0;
            job.speed = `${(intervalBytes / ((now - lastUpdate) / 1000) / 1024 ** 2).toFixed(1)} MB/s`;
            job.eta = total && intervalBytes ? `${Math.ceil((total - received) / (intervalBytes / ((now - lastUpdate) / 1000)))}초` : '';
            job.updatedAt = now;
            intervalBytes = 0;
            lastUpdate = now;
          }
          callback(null, chunk);
        },
      });
      guard.on('error', (error) => { response.destroy(); reject(error); });
      response.on('error', reject);
      stream.on('error', reject);
      stream.on('finish', () => resolve());
      response.pipe(guard).pipe(stream);
    });
    job.request = request;
    request.setTimeout(30000, () => request.destroy(new Error('파일 서버 응답 시간이 초과되었습니다.')));
    request.on('error', reject);
  });
}

function launchFile(job) {
  job.status = 'running';
  job.error = '';
  job.updatedAt = Date.now();
  job.settled = downloadFileResponse(job, job.url)
    .then(() => {
      if (job.status !== 'running') return;
      fs.renameSync(job.partialPath, job.outputPath);
      job.partialPath = '';
      job.status = 'completed';
      job.progress = 100;
      job.speed = '';
      job.eta = '';
    })
    .catch((error) => {
      if (!['paused', 'cancelled'].includes(job.status)) {
        job.status = 'failed';
        job.error = error.message;
      }
    })
    .finally(() => {
      job.request = null;
      job.stream = null;
      job.settled = null;
      job.updatedAt = Date.now();
      if (job.parentRequestId) saveHermesConversations();
      pumpYoutubeQueue();
    });
}

function trackedRoot(job) {
  const root = job.downloadDir || readSettings().downloadDir;
  return fs.realpathSync(validateDownloadDir(root));
}

function removeTrackedPath(root, targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) return false;
  const target = fs.realpathSync(targetPath);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error('저장 루트 밖의 파일은 삭제할 수 없습니다.');
  if (!fs.lstatSync(targetPath).isFile()) throw new Error('일반 파일만 삭제할 수 있습니다.');
  return targetPath;
}

function deleteTrackedFile(job) {
  const root = trackedRoot(job);
  const files = [...new Set([job.partialPath, job.outputPath].filter(Boolean))]
    .map((target) => removeTrackedPath(root, target))
    .filter(Boolean);
  let tempDir = '';
  if (job.tempDir && fs.existsSync(job.tempDir)) {
    const tempRoot = fs.realpathSync(path.join(root, '.nexuspulse-temp'));
    tempDir = fs.realpathSync(job.tempDir);
    if (!tempRoot.startsWith(`${root}${path.sep}`) || !tempDir.startsWith(`${tempRoot}${path.sep}`)) {
      throw new Error('저장 루트 밖의 임시 파일은 삭제할 수 없습니다.');
    }
  }
  for (const file of files) fs.unlinkSync(file);
  if (tempDir) fs.rmSync(job.tempDir, { recursive: true, force: true });
  job.outputPath = '';
  job.partialPath = '';
  job.tempDir = '';
  return files.length > 0 || !!tempDir;
}

function listYoutubeJobs() {
  const priority = { running: 0, discovering: 1, queued: 2, 'awaiting-input': 3, paused: 4, failed: 5, cancelled: 6, completed: 7 };
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
  const downloadDir = validateDownloadDir(job.downloadDir || readSettings().downloadDir);
  job.downloadDir = downloadDir;
  const tempRoot = path.join(downloadDir, '.nexuspulse-temp');
  fs.mkdirSync(tempRoot, { recursive: true, mode: 0o700 });
  if (fs.realpathSync(tempRoot) !== tempRoot) throw new Error('임시 폴더가 저장 경로 밖을 가리킵니다.');
  job.tempDir = path.join(tempRoot, job.id);
  fs.mkdirSync(job.tempDir, { recursive: true, mode: 0o700 });
  if (fs.realpathSync(job.tempDir) !== job.tempDir) throw new Error('작업 임시 폴더가 저장 경로 밖을 가리킵니다.');
  if (job.parentRequestId) saveHermesConversations();
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
    '-P', `temp:${job.tempDir}`,
    '-o', '%(title)s [%(id)s].%(ext)s',
    url,
  ];
  const child = spawn('yt-dlp', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  });
  job.process = child;
  job.settled = new Promise((resolve) => child.once('close', resolve));
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
        if (job.parentRequestId) saveHermesConversations();
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
    job.status = job.status === 'cancelled' ? 'cancelled' : (code === 0 ? 'completed' : 'failed');
    if (job.status === 'completed') { job.progress = 100; job.error = ''; }
    job.updatedAt = Date.now();
    job.process = null;
    job.settled = null;
    if (job.parentRequestId) saveHermesConversations();
    pumpYoutubeQueue();
  });
}

function pumpYoutubeQueue() {
  const active = Array.from(jobs.values()).filter((job) => ['running', 'paused'].includes(job.status)).length;
  const slots = Math.max(0, MAX_YOUTUBE_CONCURRENCY - active);
  Array.from(jobs.values()).filter((job) => job.status === 'queued').slice(0, slots).forEach((job) => {
    try { job.kind === 'file' ? launchFile(job) : launchYoutube(job); }
    catch (error) { job.status = 'failed'; job.error = error.message; job.updatedAt = Date.now(); }
  });
}

function linkHermesJob(job, requestId) {
  if (!requestId || !activeHermesRequests.has(requestId)) return;
  const parent = jobs.get(requestId);
  if (!parent || parent.kind !== 'hermes-request') return;
  job.parentRequestId = requestId;
  parent.relatedJobIds = Array.isArray(parent.relatedJobIds) ? parent.relatedJobIds : [];
  parent.relatedJobIds.push(job.id);
  saveHermesConversations();
}

function startFile(url, filename = '', parentRequestId = '') {
  const parsed = validateFileUrl(url);
  const downloadDir = validateDownloadDir(readSettings().downloadDir);
  const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job = {
    id, kind: 'file', origin: activeHermesRequests.size > 0 ? 'hermes' : 'manual',
    url: parsed.toString(), filename: filename ? safeFilename(filename) : '', quality: '',
    status: 'queued', progress: 0, speed: '', eta: '', output: '', outputPath: '', partialPath: '', error: '',
    downloadDir, createdAt: Date.now(), updatedAt: Date.now(), process: null, request: null, stream: null, settled: null,
  };
  jobs.set(id, job);
  linkHermesJob(job, parentRequestId);
  pumpYoutubeQueue();
  return publicJob(job);
}

function startYoutube(url, quality = '720p', parentRequestId = '') {
  if (!commandExists('yt-dlp')) throw new Error('yt-dlp가 설치되지 않았습니다. 설치 후 다시 시도하세요.');
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('유효한 HTTP(S) 동영상 URL을 입력하세요.');
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { throw new Error('유효하지 않은 YouTube URL입니다.'); }
  if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
    throw new Error('YouTube 주소만 다운로드할 수 있습니다.');
  }
  if (!YOUTUBE_QUALITY_PRESETS[quality]) throw new Error('지원하지 않는 YouTube 화질입니다.');
  const downloadDir = validateDownloadDir(readSettings().downloadDir);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job = { id, kind: 'youtube', origin: activeHermesRequests.size > 0 ? 'hermes' : 'manual', url, quality, status: 'queued', progress: 0, speed: '', eta: '', output: '', outputPath: '', error: '', downloadDir, tempDir: '', createdAt: Date.now(), updatedAt: Date.now(), process: null, settled: null };
  jobs.set(id, job);
  linkHermesJob(job, parentRequestId);
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
    throw new Error('재시작할 다운로드 URL이 없습니다.');
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

async function stopJobForRemoval(job) {
  if (job.kind === 'hermes-request' && job.status === 'discovering') {
    throw new Error('Hermes가 처리 중입니다. 응답이 끝난 뒤 목록에서 제거하세요.');
  }
  if (!['running', 'paused'].includes(job.status) && !job.settled) return;
  const wasPaused = job.status === 'paused';
  const settled = job.settled;
  const stream = job.stream;
  job.status = 'cancelled';
  job.updatedAt = Date.now();
  if (job.kind === 'file') {
    if (job.request) job.request.destroy();
    if (stream) {
      const closed = stream.closed ? Promise.resolve() : new Promise((resolve) => stream.once('close', resolve));
      stream.destroy();
      await closed;
    }
  } else if (job.process) {
    if (wasPaused) job.process.kill('SIGCONT');
    job.process.kill('SIGTERM');
  }
  if (settled) {
    let timer;
    try {
      try {
        await Promise.race([
          settled,
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('다운로드 프로세스 종료 시간이 초과되었습니다.')), 15000); }),
        ]);
      } catch (error) {
        if (job.process) job.process.kill('SIGKILL');
        throw error;
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

async function youtubeAction(id, action) {
  const job = jobs.get(id);
  if (!job) throw new Error('다운로드 작업을 찾을 수 없습니다.');
  if (action === 'remove' || action === 'delete') {
    await stopJobForRemoval(job);
    let fileDeleted = false;
    if (action === 'delete' && job.kind === 'hermes-request') {
      for (const childId of [...(job.relatedJobIds || [])]) {
        if (!jobs.has(childId)) continue;
        const result = await youtubeAction(childId, 'delete');
        fileDeleted = result.fileDeleted || fileDeleted;
      }
    } else if (action === 'delete') {
      fileDeleted = deleteTrackedFile(job);
    }
    jobs.delete(id);
    const parent = job.parentRequestId && jobs.get(job.parentRequestId);
    if (parent?.kind === 'hermes-request') {
      parent.relatedJobIds = (parent.relatedJobIds || []).filter((childId) => childId !== id);
      parent.updatedAt = Date.now();
    }
    if (job.kind === 'hermes-request' || parent) saveHermesConversations();
    pumpYoutubeQueue();
    return { id, removed: true, fileDeleted };
  }
  if (action === 'pause' && job.kind === 'file' && job.request && job.status === 'running') {
    job.status = 'paused'; job.request.destroy(); job.updatedAt = Date.now();
  } else if (action === 'resume' && job.kind === 'file' && job.status === 'paused') {
    job.status = 'queued'; job.updatedAt = Date.now(); pumpYoutubeQueue();
  } else if (action === 'cancel' && job.kind === 'file' && ['queued', 'running', 'paused'].includes(job.status)) {
    job.status = 'cancelled';
    if (job.request) job.request.destroy();
    job.updatedAt = Date.now(); pumpYoutubeQueue();
  } else if (action === 'pause' && job.process && job.status === 'running') {
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
  if (removedIds.length) saveHermesConversations();
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

function hydrateHermesConversations() {
  try {
    const conversations = JSON.parse(fs.readFileSync(HERMES_CONVERSATIONS_FILE, 'utf8'));
    if (!Array.isArray(conversations)) return;
    for (const stored of conversations) {
      if (!stored || stored.kind !== 'hermes-request' || typeof stored.id !== 'string' || !stored.prompt) continue;
      const { relatedJobs, ...conversation } = stored;
      const restored = { ...conversation, process: null, request: null };
      restored.relatedJobIds = Array.isArray(restored.relatedJobIds) ? restored.relatedJobIds : [];
      if (restored.status === 'discovering') {
        restored.status = 'failed';
        restored.error = '서비스 재시작으로 Hermes 응답이 중단되었습니다. 후속 메시지를 보내 다시 진행하세요.';
        restored.updatedAt = Date.now();
      }
      jobs.set(restored.id, restored);
      for (const child of Array.isArray(relatedJobs) ? relatedJobs : []) {
        if (!child || typeof child.id !== 'string' || child.parentRequestId !== restored.id || jobs.has(child.id)) continue;
        const linked = { ...child, process: null, request: null, stream: null, settled: null };
        if (['running', 'queued', 'paused'].includes(linked.status)) {
          linked.status = 'failed';
          linked.error = '서비스 재시작으로 다운로드가 중단되었습니다. 다시 시도하세요.';
          linked.updatedAt = Date.now();
        }
        jobs.set(linked.id, linked);
      }
    }
  } catch { /* No persisted Hermes conversations yet. */ }
}

hydrateHermesConversations();
hydrateCompletedFiles();

module.exports = { getStatus, saveSettings, getTransmission, addTorrent, torrentAction, listYoutubeJobs, startYoutube, startFile, youtubeAction, clearFailedYoutubeJobs, retryFailedYoutubeJobs, retryYoutubeJob, requestWithHermes, continueHermesConversation, qualityOptions, parseYoutubeProgressLine, validateFileUrl, isPrivateAddress, isDownloadableContentType, deleteTrackedFile };
