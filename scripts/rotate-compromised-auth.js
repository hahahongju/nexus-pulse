// Run with the service stopped. Preserve the existing password and OTP settings.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const auth = require('../server/security/authStore');

(async () => {
  await auth.init();
  const directory = path.join(process.env.NEXUSPULSE_CONFIG_DIR || path.join(__dirname, '..', 'data'), 'security');
  const filename = path.join(directory, 'admin-token.env');
  const token = crypto.randomBytes(32).toString('base64url');
  const config = fs.readFileSync(filename, 'utf8').replace(/^NEXUS_ADMIN_TOKEN=.*$/m, `NEXUS_ADMIN_TOKEN=${token}`);
  fs.writeFileSync(filename, config, { mode: 0o600 });
  for (const item of await auth.index.listItems()) await auth.index.deleteItem(item.id);
  await auth.registerToken(token, { name: 'Local administrator', role: 'admin', isMaster: true });
  const automation = crypto.randomBytes(32).toString('base64url');
  await auth.registerToken(automation, { name: 'Hermes downloads', role: 'operator' });
  fs.writeFileSync(path.join(directory, 'hermes-token'), automation, { mode: 0o600 });
  console.log('Credentials rotated; password and OTP preserved.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
