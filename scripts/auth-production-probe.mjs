// Explicitly authorized disposable-account probe. Never logs passwords/tokens.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, deleteUser } from 'firebase/auth';
import { initializeFirestore, doc, setDoc, getDocFromServer, serverTimestamp, terminate } from 'firebase/firestore';
const require = createRequire(import.meta.url);
const env = parseEnv(await fs.readFile('.env.local', 'utf8'));
const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
if (projectId !== 'cim-normatel-ac5b7') throw new Error('Unexpected project');
const app = initializeApp({ apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY, projectId, appId: env.NEXT_PUBLIC_FIREBASE_APP_ID });
const auth = getAuth(app);
const db = initializeFirestore(app, { experimentalForceLongPolling: true });
const email = `codex-disposable-${crypto.randomUUID()}@example.invalid`;
const password = crypto.randomUUID() + '!aA1';
let created;
let operation = 'auth.createUserWithEmailAndPassword';
try {
  created = (await createUserWithEmailAndPassword(auth, email, password)).user;
  await fs.mkdir('recovery/auth-probes', { recursive: true });
  await fs.writeFile(`recovery/auth-probes/${created.uid}.json`, JSON.stringify({ uid: created.uid, email, projectId, disposable: true }));
  console.log(JSON.stringify({ operation, success: true, uid: created.uid }));
  operation = 'auth.updateProfile';
  await updateProfile(created, { displayName: 'Codex disposable auth test' });
  operation = 'firestore.users.create';
  const write = setDoc(doc(db, 'users', created.uid), { name: 'Codex disposable auth test', email, role: 'visualizador', status: 'pendente', avatarUrl: '', department: '', lastActive: serverTimestamp(), createdAt: serverTimestamp() });
  await Promise.race([write, new Promise((_, reject)=>setTimeout(()=>reject(Object.assign(new Error('timeout'), { code: 'probe/timeout' })), 20000).unref())]);
  const snap = await getDocFromServer(doc(db, 'users', created.uid));
  console.log(JSON.stringify({ operation, success: snap.exists(), role: snap.data()?.role, status: snap.data()?.status }));
  operation = 'auth.login.productionGate';
  const origin = 'https://fluxocriticos.vercel.app';
  const gate = await fetch(origin + '/api/auth/login-check', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(20000) });
  console.log(JSON.stringify({ operation, status: gate.status, body: await gate.text() }));
  operation = 'auth.signInWithEmailAndPassword';
  await signOut(auth);
  const credential = await signInWithEmailAndPassword(auth, email, password);
  console.log(JSON.stringify({ operation, success: credential.user.uid === created.uid }));
} catch (error) {
  console.log(JSON.stringify({ operation, code: error.code || error.name }));
  process.exitCode = 1;
} finally {
  if (created) {
    // Cleanup only the exact UID/email created above, never by a broad query.
    const session = JSON.parse(await fs.readFile(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
    const token = (await require('firebase-tools/lib/auth').getAccessToken(session.tokens?.refresh_token, [])).access_token;
    const lookup = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: [created.uid] }) });
    const actual = (await lookup.json()).users?.[0];
    if (actual?.localId !== created.uid || actual?.email !== email) throw new Error('Cleanup identity mismatch; stopped');
    const deleted = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${created.uid}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (!deleted.ok && deleted.status !== 404) throw new Error('Cleanup profile failed');
    if (auth.currentUser?.uid !== created.uid) await signInWithEmailAndPassword(auth, email, password);
    await deleteUser(auth.currentUser);
    console.log(JSON.stringify({ operation: 'cleanup.confirmedDisposableUid', uid: created.uid, success: true }));
  }
  await terminate(db);
  await deleteApp(app);
}
