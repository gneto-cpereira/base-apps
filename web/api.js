// Pedidos à API da app, iguais em todas as apps. Servido em /base/api.js.
//   import { pedir, obter } from '/base/api.js';
//   const livro = await obter('livro');            // GET /api/livro
//   await pedir('livro', { valor: 3 });             // POST /api/livro (JSON)
// Erros: lança Error com a mensagem do servidor (já em português, pronta a mostrar).
// Quando a sessão termina (401) ou falta ligar os dois passos (403), avisa a página com um evento:
//   addEventListener('ba:sessao-terminou', …)   e   addEventListener('ba:dois-passos', …)
export const SEM_LIGACAO = 'Não foi possível falar com o servidor. Confirma que tens internet.';
const ENTRADA = /^conta\/(entrada|pedir-codigo|codigo|entrar|totp|definir-senha|sair)$/;

async function tratar(rota, r) {
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && !ENTRADA.test(rota)) { dispatchEvent(new CustomEvent('ba:sessao-terminou')); throw Object.assign(new Error(d.erro || 'É preciso entrar.'), { sessao: true }); }
  if (r.status === 403 && /dois passos/.test(d.erro || '')) { dispatchEvent(new CustomEvent('ba:dois-passos')); throw Object.assign(new Error(d.erro), { sessao: true }); }
  if (!r.ok) throw Object.assign(new Error(d.erro || SEM_LIGACAO), { estado: r.status });
  return d;
}

export async function pedir(rota, corpo = {}) {
  let r;
  try { r = await fetch('/api/' + rota, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }); }
  catch { throw new Error(SEM_LIGACAO); }
  return tratar(rota, r);
}

export async function obter(rota) {
  let r;
  try { r = await fetch('/api/' + rota, { cache: 'no-store' }); }
  catch { throw new Error(SEM_LIGACAO); }
  return tratar(rota, r);
}

/** Sessão atual ({ id, nome, email, papel, totp, configurarTotp, metodo, ramo }) ou null. */
export async function sessaoAtual() {
  try { const r = await fetch('/api/conta/eu', { cache: 'no-store' }); return r.ok ? await r.json() : null; }
  catch { return null; }
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function haQuanto(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 90) return 'agora mesmo';
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

/** Nome curto de um "user agent" (para a lista de sessões). */
export function dispositivo(ua = '') {
  const so = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Dispositivo';
  const nav = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return nav ? `${nav} · ${so}` : so;
}
