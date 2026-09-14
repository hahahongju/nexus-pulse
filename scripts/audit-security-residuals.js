// Non-destructive probes using isolated authentication and download fixtures.
// Reports observed behavior; true means the named weakness was reproduced.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-security-review-'));
const protectedTarget = fs.mkdtempSync('/var/tmp/nexus-security-review-');
process.env.NEXUSPULSE_CONFIG_DIR = root;
process.env.DOWNLOAD_DIR = path.join(root, 'downloads');
const auth = require('../server/security/authStore');
const downloads = require('../server/downloadManager');

(async () => {
  try {
    await auth.init();
    await auth.setPin('review-old-password');
    const session = await auth.createSession();
    await auth.setPin('review-new-password');
    console.log('session_survives_password_change', !!await auth.validateToken(session.sessionToken));

    const setup = await auth.generate2FASetup();
    auth.enable2FA(setup.secret, auth.generateTOTP(setup.secret), setup.backupCodes);
    const first = auth.createTemp2FAToken();
    const second = auth.createTemp2FAToken();
    const otp = auth.generateTOTP(setup.secret);
    const a = await auth.verify2FALogin(first, otp);
    const b = await auth.verify2FALogin(second, otp);
    console.log('otp_reusable_across_login_sessions', a.success && b.success);

    const config = path.join(root, 'security', 'admin-token.env');
    fs.renameSync(config, `${config}.fixture-backup`);
    console.log('missing_config_accepts_default_pin', auth.verifyPin('1234'));
    console.log('missing_config_accepts_otp', (await auth.verify2FALogin(auth.createTemp2FAToken(), '000000')).success);
    fs.renameSync(`${config}.fixture-backup`, config);

    let rejectedDirectPath = false;
    try { downloads.saveSettings({ downloadDir: protectedTarget }); } catch { rejectedDirectPath = true; }
    const link = path.join(root, 'linked-directory');
    fs.symlinkSync(protectedTarget, link);
    let symlinkAccepted = false;
    try { downloads.saveSettings({ downloadDir: link }); symlinkAccepted = true; } catch { /* expected */ }
    console.log('symlink_bypasses_directory_protection', rejectedDirectPath && symlinkAccepted);
    downloads.saveSettings({ downloadDir: path.join(root, 'downloads') });

    let internalRequest = false;
    const server = http.createServer((req, res) => {
      internalRequest = true;
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Isolated security test');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let job;
    try {
      try { job = downloads.startYoutube(`http://127.0.0.1:${server.address().port}/audit-video`); }
      catch (error) { if (!/YouTube/.test(error.message)) throw error; }
      for (let i = 0; job && i < 100; i++) {
        if (internalRequest || downloads.listYoutubeJobs().find(j => j.id === job.id)?.status === 'failed') break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      console.log('youtube_fetches_loopback_url', internalRequest);
    } finally {
      const state = downloads.listYoutubeJobs().find(j => j.id === job?.id)?.status;
      if (['running', 'queued', 'paused'].includes(state)) downloads.youtubeAction(job.id, 'cancel');
      await new Promise(resolve => server.close(resolve));
    }

    // Stub process creation: never execute an agent or spend inference credits.
    const cp = require('child_process');
    const originalExecFile = cp.execFile;
    let starts = 0;
    cp.execFile = () => { starts++; return {}; };
    process.env.HERMES_BIN = '/bin/true';
    delete require.cache[require.resolve('../server/downloadManager')];
    const agentDownloads = require('../server/downloadManager');
    cp.execFile = originalExecFile;
    const request = await agentDownloads.requestWithHermes('isolated audit fixture');
    for (let i = 0; i < 2; i++) {
      try { agentDownloads.youtubeAction(request.requestId, 'retry'); } catch { /* active jobs must reject retries */ }
    }
    console.log('running_hermes_job_can_spawn_duplicates', starts === 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(protectedTarget, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
