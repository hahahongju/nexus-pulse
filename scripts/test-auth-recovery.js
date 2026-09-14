const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-auth-recovery-'));
process.env.NEXUSPULSE_CONFIG_DIR = fixture;
const auth = require('../server/security/authStore');
const originalNow = Date.now;

(async () => {
  try {
    await auth.init();
    await auth.setPin('fixture-password');
    const setup = await auth.generate2FASetup();
    auth.enable2FA(setup.secret, auth.generateTOTP(setup.secret), setup.backupCodes);
    const now = Date.now();
    Date.now = () => now;
    const code = auth.generateTOTP(setup.secret);
    assert.equal((await auth.verify2FALogin(auth.createTemp2FAToken(), code)).success, true);
    Date.now = () => now + 30000;
    assert.equal((await auth.verify2FALogin(auth.createTemp2FAToken(), code)).success, false);
    delete require.cache[require.resolve('../server/security/authStore')];
    const restarted = require('../server/security/authStore');
    await restarted.init();
    assert.equal((await restarted.verify2FALogin(restarted.createTemp2FAToken(), code)).success, false);
    const config = path.join(fixture, 'security', 'admin-token.env');
    fs.renameSync(config, `${config}.backup`);
    assert.equal((await restarted.verify2FALogin(restarted.createTemp2FAToken(), '000000')).success, false);
    assert.equal(restarted.verifyPin('1234'), false);
    fs.renameSync(`${config}.backup`, config);
    const legacy = await restarted.registerToken('fixture-legacy', { role: 'admin', expiresAt: now + 3600000 });
    const file = path.join(fixture, 'security', 'auth-index', 'index.json');
    const index = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete index.items.find(item => item.id === legacy.id).metadata.kind;
    fs.writeFileSync(file, JSON.stringify(index));
    assert.equal(await restarted.validateToken('fixture-legacy'), null);
    const sessions = await Promise.all([restarted.createSession(), restarted.createSession()]);
    await restarted.setPin('fixture-new-password');
    for (const session of sessions) assert.equal(await restarted.validateToken(session.sessionToken), null);
    console.log('Auth recovery tests passed: OTP replay, restart, missing config, legacy tokens, password change.');
  } finally {
    Date.now = originalNow;
    fs.rmSync(fixture, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
