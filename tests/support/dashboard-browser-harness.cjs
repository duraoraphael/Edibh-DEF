// Bundle the real dashboard with read-only, in-memory Firebase adapters.
// No test route, auth bypass or fixture is shipped with the application.
const fs = require('node:fs/promises');
const path = require('node:path');
const { webpack } = require('next/dist/compiled/webpack/webpack');

module.exports = async function buildDashboardHarness() {
  const root = process.cwd();
  const output = path.join(root, 'test-results', 'dashboard-harness');
  await fs.mkdir(output, { recursive: true });
  const files = {
    'loader.cjs': `const ts = require('typescript'); module.exports = function(source) { return ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }, fileName: this.resourcePath }).outputText; };`,
    'auth.js': `export const useAuth = () => ({ profile: { role: 'visualizador', name: 'Teste' }, user: { email: 'teste@example.com' } });`,
    'firebase.js': `export const db = {}; export const auth = { currentUser: null };`,
    'link.js': `import React from 'react'; import { nav } from './navigation.js'; export default function Link({ href, onClick, ...props }) { return React.createElement('a', { href, ...props, onClick: (event) => { onClick?.(event); if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || !String(href).startsWith('/')) return; event.preventDefault(); nav.push(href); } }); }`,
    'navigation.js': `import React from 'react';
      const listeners = new Set(); const emit = () => listeners.forEach(listener => listener());
      window.addEventListener('popstate', emit);
      export const nav = { push(href) { history.pushState({}, '', href); emit(); }, replace(href) { history.replaceState({}, '', href); emit(); }, back() { history.back(); } };
      export const useLocation = () => React.useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => location.pathname + location.search);
      export const useRouter = () => nav;
      export const usePathname = () => { useLocation(); return location.pathname; };
      export const useSearchParams = () => { const search = useLocation(); return React.useMemo(() => new URLSearchParams(location.search), [search]); };`,
    'excel.js': `export async function exportRecordsToExcel(options) { window.__exported = options; }`,
    'firestore.js': `
      export const collection = (_, name) => ({ name, withConverter() { return this; } });
      export const doc = (_, ...parts) => ({ name: parts.join('/') });
      export const query = (ref) => ref;
      export const orderBy = () => null;
      export const where = () => null;
      export class Timestamp {}
      const forbidden = () => { throw new Error('Unexpected database write in dashboard test'); };
      export const addDoc = forbidden, deleteDoc = forbidden, setDoc = forbidden, writeBatch = forbidden, runTransaction = forbidden;
      export const serverTimestamp = () => null;
      export const getDoc = forbidden, getDocs = forbidden;
      export function onSnapshot(ref, callback) {
        if (ref.name === 'records') callback({ docs: window.dashboardFixture.records.map(record => ({ data: () => record })) });
        else if (ref.name === 'formFields/default') callback({ exists: () => true, data: () => ({ fields: window.dashboardFixture.fields }) });
        else callback({ exists: () => false });
        return () => {};
      }
    `,
    'entry.js': `import React from 'react'; import { createRoot } from 'react-dom/client'; import Dashboard from '@/app/(dashboard)/dashboard/page'; import Detail from '@/app/(dashboard)/dashboard/detalhamento/page'; import { nav, useLocation, usePathname } from './navigation.js';
      function Records() { const params = new URLSearchParams(location.search); return React.createElement('div', { 'data-testid': 'records-stub' }, React.createElement('p', null, 'Ficha ' + params.get('record')), React.createElement('button', { onClick: () => nav.replace(params.get('returnTo')) }, 'Fechar ficha')); }
      function App() { useLocation(); const path = usePathname(); const Page = path === '/records' ? Records : path.startsWith('/dashboard/detalhamento') ? Detail : Dashboard; return React.createElement(Page, { key: path }); }
      createRoot(document.getElementById('root')).render(React.createElement(App));`,
  };
  await Promise.all(Object.entries(files).map(([name, content]) => fs.writeFile(path.join(output, name), content)));
  await new Promise((resolve, reject) => {
    const compiler = webpack({
      mode: 'development', devtool: false, entry: path.join(output, 'entry.js'),
      output: { path: output, filename: 'dashboard.js' },
      resolve: { extensions: ['.tsx', '.ts', '.js'], alias: {
        '@/lib/auth-context$': path.join(output, 'auth.js'),
        '@/lib/firebase$': path.join(output, 'firebase.js'),
        'firebase/firestore$': path.join(output, 'firestore.js'),
        'next/link$': path.join(output, 'link.js'),
        'next/navigation$': path.join(output, 'navigation.js'),
        '@/lib/excel-export$': path.join(output, 'excel.js'),
        '@': path.join(root, 'src'),
      } },
      module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(output, 'loader.cjs') }] },
    });
    compiler.run((error, stats) => compiler.close(() => {
      if (error || stats.hasErrors()) reject(error || new Error(stats.toString({ all: false, errors: true })));
      else resolve();
    }));
  });
  const cssDir = path.join(root, '.next', 'static', 'chunks');
  const styles = (await fs.readdir(cssDir)).filter(name => name.endsWith('.css'));
  if (!styles.length) throw new Error('Run npm run build before the dashboard browser tests.');
  return {
    script: await fs.readFile(path.join(output, 'dashboard.js'), 'utf8'),
    css: (await Promise.all(styles.map(name => fs.readFile(path.join(cssDir, name), 'utf8')))).join('\n'),
  };
};
