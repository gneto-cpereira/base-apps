// Ajudas dos testes: uma app numa pasta temporária e um cliente HTTP com cookies.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { criarApp } from '../lib/index.mjs';

process.env.BASE_EMAIL_CONSOLA_SILENCIO = '1';

export async function novaApp(op = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'base-apps-'));
  mkdirSync(join(raiz, 'servidor')); mkdirSync(join(raiz, 'web')); mkdirSync(join(raiz, 'web', 'privado'));
  writeFileSync(join(raiz, 'servidor', 'app.env'), 'NOME=teste\nTITULO="App de Teste"\nPORTA=0\n');
  writeFileSync(join(raiz, 'web', 'index.html'), '<!doctype html><title>t</title>');
  writeFileSync(join(raiz, 'web', 'privado', 'x.txt'), 'segredo');
  const app = criarApp({ raiz, porta: 0, host: '127.0.0.1', silencio: true, privado: [/^\/privado\//], ...op });
  app.rota('GET', 'ola', ({ conta }) => ({ ola: conta.id }));
  app.rota('GET', 'publica', () => ({ ok: 1 }), { publica: true });
  app.rota('GET', 'so-admin', () => ({ ok: 1 }), { papel: 'admin' });
  app.rota('GET', 'item/:id', ({ params }) => ({ id: params.id }), { publica: true });
  await app.iniciar();
  const base = `http://127.0.0.1:${app.servidor.address().port}`;
  return { app, base, raiz };
}

export function cliente(base) {
  const jar = {};
  async function pedir(metodo, caminho, corpo, cabecalhos = {}) {
    const h = { ...cabecalhos };
    const ck = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (ck) h.cookie = ck;
    if (corpo !== undefined && !h['content-type']) h['content-type'] = 'application/json';
    const r = await fetch(base + caminho, { method: metodo, headers: h, body: corpo === undefined ? undefined : typeof corpo === 'string' ? corpo : JSON.stringify(corpo), redirect: 'manual' });
    for (const c of r.headers.getSetCookie()) {
      const [par] = c.split(';'); const i = par.indexOf('=');
      const k = par.slice(0, i), v = par.slice(i + 1);
      if (/Max-Age=0/.test(c) || !v) delete jar[k]; else jar[k] = v;
    }
    const txt = await r.text();
    let dados; try { dados = JSON.parse(txt); } catch { dados = txt; }
    return { estado: r.status, dados, cabecalhos: r.headers };
  }
  return {
    jar,
    get: (c, h) => pedir('GET', c, undefined, h),
    post: (c, corpo = {}, h) => pedir('POST', c, corpo, h),
    pedir,
  };
}
