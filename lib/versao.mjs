// Versões da base-apps: que versão uma app declara, qual está instalada e qual é a mais recente no GitHub.
// Usado por "npx base-apps versao [--json]" (e, no futuro, pelo painel do servidor).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const PACOTE_BASE = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));
export const VERSAO_BASE = PACOTE_BASE.version;
export const REPOSITORIO = 'https://github.com/gneto-cpereira/base-apps.git';

export const lerSemver = (v) => { const m = String(v || '').match(/v?(\d+)\.(\d+)\.(\d+)/); return m ? m.slice(1).map(Number) : null; };
export function compararSemver(a, b) {
  const x = lerSemver(a), y = lerSemver(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

/** Etiquetas vX.Y.Z do repositório (git ls-remote), ordenadas da mais antiga para a mais recente. */
export function etiquetasRemotas(repo = REPOSITORIO) {
  const out = execFileSync('git', ['ls-remote', '--tags', '--refs', repo], { encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'pipe'] });
  return out.split('\n').map((l) => l.split('refs/tags/')[1]).filter((t) => t && /^v\d+\.\d+\.\d+$/.test(t)).sort(compararSemver);
}

/**
 * Estado da base numa app: { app, declarada, instalada, ultima, desatualizada, salto, erro }.
 * salto: 'patch' | 'minor' | 'major' (major = muda coisas que obrigam a mexer na app; ver CHANGELOG).
 */
export function estadoVersao(pastaApp = process.cwd(), { repo } = {}) {
  const r = { app: null, declarada: null, instalada: null, ultima: null, desatualizada: null, salto: null, erro: null };
  try {
    const pkg = JSON.parse(readFileSync(join(pastaApp, 'package.json'), 'utf8'));
    r.app = pkg.name || null;
    const dep = pkg.dependencies?.['base-apps'] || '';
    r.declarada = (dep.match(/#(v\d+\.\d+\.\d+)$/) || [])[1] || dep || null;
    if (!repo && /^github:([^#]+)/.test(dep)) repo = `https://github.com/${dep.match(/^github:([^#]+)/)[1]}.git`;
  } catch { r.erro = 'Não encontrei o package.json da app.'; return r; }
  try { r.instalada = JSON.parse(readFileSync(join(pastaApp, 'node_modules', 'base-apps', 'package.json'), 'utf8')).version; } catch {}
  try {
    const t = etiquetasRemotas(repo);
    r.ultima = t.at(-1) || null;
  } catch (e) { r.erro = 'Não consegui ver as versões no GitHub: ' + String(e.stderr || e.message).trim().split('\n')[0]; }
  if (r.ultima && r.declarada) {
    r.desatualizada = compararSemver(r.declarada, r.ultima) < 0;
    if (r.desatualizada) {
      const a = lerSemver(r.declarada), b = lerSemver(r.ultima);
      r.salto = a[0] !== b[0] ? 'major' : a[1] !== b[1] ? 'minor' : 'patch';
    }
  }
  return r;
}
