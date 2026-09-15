// Read-only audit. Never print session credentials, email bodies or action codes.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
try {
  const session = JSON.parse(await fs.readFile(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
  const token = (await require('firebase-tools/lib/auth').getAccessToken(session.tokens?.refresh_token, [])).access_token;
  const response = await fetch('https://identitytoolkit.googleapis.com/admin/v2/projects/cim-normatel-ac5b7/config', {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const config = await response.json();
  console.log(JSON.stringify({
    emailPasswordEnabled: config.signIn?.email?.enabled,
    passwordRequired: config.signIn?.email?.passwordRequired,
    authorizedDomains: config.authorizedDomains,
    resetActionUrl: config.notification?.sendEmail?.callbackUri,
    resetTemplateConfigured: !!config.notification?.sendEmail?.resetPasswordTemplate,
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ auditFailed: true, code: error.code || error.name }));
  process.exitCode = 1;
}
