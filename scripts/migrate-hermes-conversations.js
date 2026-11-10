// One-time migration of Hermes requests held by the running pre-chat backend.
// Run before restarting that service, while its in-memory jobs are still available.
const fs = require('fs');
const path = require('path');

const configDir = process.env.NEXUSPULSE_CONFIG_DIR || path.join(__dirname, '..', 'data');
const destination = path.join(configDir, 'hermes-conversations.json');
const tokenFile = path.join(configDir, 'security', 'admin-token.env');
const token = fs.readFileSync(tokenFile, 'utf8').match(/^NEXUS_ADMIN_TOKEN=(.+)$/m)?.[1];
if (!token) throw new Error('NexusPulse 관리자 토큰을 찾을 수 없습니다.');

const originalPrompts = {
  'hermes-1792374769600-tn06tv': 'Windows 11 26H2 ISO 파일을 Microsoft 공식 배포처에서 다운로드해줘',
  'hermes-1792374663016-mhjsda': 'Windows 11 26H2 ISO 파일을 Microsoft 공식 배포처에서 다운로드해줘',
  'hermes-1792372782037-qw9jod': 'Windows 11 26H2 ISO 파일을 Microsoft 공식 배포처에서 다운로드해줘',
  'hermes-1791268299173-bd1e3g': 'Windows 11 25H2 한국어 x64 ISO를 Microsoft 공식 배포처에서 다운로드해줘',
  'hermes-1791268077542-da0xap': 'Windows 11 25H2 ISO를 Microsoft 공식 배포처에서 다운로드해줘',
};

async function main() {
  const response = await fetch('http://127.0.0.1:4500/api/downloads/youtube', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`현재 작업 조회 실패: HTTP ${response.status}`);
  const body = await response.json();
  const live = (body.data || []).filter((job) => job.kind === 'hermes-request');
  const existing = fs.existsSync(destination) ? JSON.parse(fs.readFileSync(destination, 'utf8')) : [];
  const byId = new Map(existing.map((job) => [job.id, job]));
  let imported = 0;
  for (const job of live) {
    const prior = byId.get(job.id);
    const prompt = prior?.prompt || originalPrompts[job.id];
    if (!prompt) {
      console.warn(`원본 요청을 복원할 수 없어 건너뜀: ${job.id}`);
      continue;
    }
    const responseText = String(job.output || '').trim();
    const messages = prior?.messages?.length > 1 ? prior.messages : [
      { role: 'user', content: prompt, createdAt: job.createdAt },
      ...(responseText ? [{ role: 'assistant', content: responseText, createdAt: job.updatedAt }] : []),
    ];
    byId.set(job.id, {
      ...job,
      status: 'awaiting-input',
      progress: 100,
      speed: '응답 완료 · 후속 대화 가능',
      prompt,
      messages,
      output: responseText,
    });
    imported += 1;
  }
  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  const temporary = `${destination}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify([...byId.values()], null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, destination);
  console.log(`Hermes 대화 ${imported}건을 보존했습니다.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
