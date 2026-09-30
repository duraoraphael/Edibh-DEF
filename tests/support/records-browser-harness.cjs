// Exercise the real pages, SDK, transactions and Excel download against local
// emulators. Only Next routing and the Firebase connection are supplied here.
const fs = require('node:fs/promises');
const path = require('node:path');
const { webpack } = require('next/dist/compiled/webpack/webpack');

module.exports = async function buildRecordsHarness() {
  const root = process.cwd();
  const output = await fs.mkdtemp(path.join(root, 'test-results', 'records-harness-'));
  const files = {
    'loader.cjs': `const ts = require('typescript'); module.exports = function(source) { return ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }, fileName: this.resourcePath }).outputText; };`,
    'firebase.js': `
      import { initializeApp } from 'firebase/app';
      import { getAuth, connectAuthEmulator } from 'firebase/auth';
      import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
      import { getStorage, connectStorageEmulator } from 'firebase/storage';
      export const firebaseConfig = { apiKey: 'demo-key', projectId: 'demo-upload-fix', storageBucket: 'demo-upload-fix.appspot.com' };
      const app = initializeApp(firebaseConfig);
      export const auth = getAuth(app), db = getFirestore(app), storage = getStorage(app);
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, '127.0.0.1', 8180);
      connectStorageEmulator(storage, '127.0.0.1', 9299);
    `,
    'auth.js': `import { auth } from './firebase'; export const useAuth = () => ({ user: auth.currentUser, profile: window.testProfile });`,
    'navigation.js': `
      import { useMemo, useSyncExternalStore } from 'react';
      const subscribe = (listener) => { window.addEventListener('popstate', listener); return () => window.removeEventListener('popstate', listener); };
      const snapshot = () => window.location.pathname + window.location.search;
      export const useLocation = () => useSyncExternalStore(subscribe, snapshot);
      const router = {
        push(url) { history.pushState({}, '', url); window.dispatchEvent(new PopStateEvent('popstate')); },
        replace(url) { history.replaceState({}, '', url); window.dispatchEvent(new PopStateEvent('popstate')); },
        back() { history.back(); },
      };
      export const useRouter = () => router;
      export function useSearchParams() { const url = useLocation(); return useMemo(() => new URLSearchParams(url.split('?')[1]), [url]); }
    `,
    'entry.js': `
      import React from 'react'; import { createRoot } from 'react-dom/client';
      import { signInWithEmailAndPassword } from 'firebase/auth';
      import { doc, getDocFromServer } from 'firebase/firestore';
      import { Toaster } from 'sonner';
      import { auth, db } from './firebase'; import { useLocation } from './navigation';
      import History from '@/app/(dashboard)/records/page'; import Editor from '@/app/(dashboard)/records/new/page';
      function App() { const url = useLocation(); return React.createElement(React.Fragment, null,
        url.startsWith('/records/new') ? React.createElement(Editor, { key: url }) : React.createElement(History), React.createElement(Toaster)); }
      async function start() {
        const { user } = await signInWithEmailAndPassword(auth, window.testAccount.email, window.testAccount.password);
        const profile = await getDocFromServer(doc(db, 'users', user.uid));
        window.testProfile = { ...profile.data(), id: user.uid, uid: user.uid };
        createRoot(document.getElementById('root')).render(React.createElement(App));
      }
      start().catch(error => { document.getElementById('root').textContent = error.message; throw error; });
    `,
  };
  await Promise.all(Object.entries(files).map(([name, content]) => fs.writeFile(path.join(output, name), content)));
  await new Promise((resolve, reject) => {
    const compiler = webpack({
      mode: 'development', devtool: false, entry: path.join(output, 'entry.js'),
      output: { path: output, filename: 'records.js' },
      resolve: { extensions: ['.tsx', '.ts', '.js'], alias: {
        '@/lib/auth-context$': path.join(output, 'auth.js'), '@/lib/firebase$': path.join(output, 'firebase.js'),
        'next/navigation$': path.join(output, 'navigation.js'), '@': path.join(root, 'src'),
      }, fallback: { fs: false, path: false, crypto: false, stream: false, buffer: false } },
      module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(output, 'loader.cjs') }] },
      plugins: [new webpack.DefinePlugin({
        'process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET': JSON.stringify('demo-upload-fix.appspot.com'),
      })],
    });
    compiler.run((error, stats) => compiler.close(() => {
      if (error || stats.hasErrors()) reject(error || new Error(stats.toString({ all: false, errors: true })));
      else resolve();
    }));
  });
  const cssDir = path.join(root, '.next', 'static', 'chunks');
  const styles = (await fs.readdir(cssDir)).filter(name => name.endsWith('.css'));
  if (!styles.length) throw new Error('Run npm run build before browser tests.');
  return { script: await fs.readFile(path.join(output, 'records.js'), 'utf8'), css: (await Promise.all(styles.map(name => fs.readFile(path.join(cssDir, name), 'utf8')))).join('\n') };
};
