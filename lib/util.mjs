// Peças pequenas usadas por todo o servidor: erros para o utilizador, respostas JSON, corpo dos pedidos,
// cookies, IP de quem pede e configuração da app (servidor/app.env).
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const SEGUNDO = 1000;
export const MINUTO = 60 * SEGUNDO;
export const HORA = 60 * MINUTO;
export const DIA = 24 * HORA;

/** Erro para mostrar à pessoa: a API responde { erro: mensagem } com este estado HTTP. */
export class Erro extends Error {
  constructor(mensagem, estado = 400, cabecalhos = {}) {
    super(mensagem);
    this.estado = estado;
    this.cabecalhos = cabecalhos;
  }
}

export const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Lê o corpo JSON de um pedido. Corpo maior do que o limite → erro 413. JSON inválido → {}.
export async function lerCorpo(req, limite) {
  const partes = [];
  let total = 0;
  for await (const p of req) {
    total += p.length;
    if (total > limite) throw new Erro('Pedido demasiado grande.', 413);
    partes.push(p);
  }
  if (!total) return {};
  try {
    const d = JSON.parse(Buffer.concat(partes).toString('utf8'));
    return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  } catch { return {}; }
}

export function lerCookies(req) {
  const o = {};
  for (const p of String(req.headers.cookie || '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
  return o;
}

// Atrás do Tailscale (serve/funnel) ou do contentor principal (no caso do dev), a ligação chega de um endereço
// local; aí o IP de quem pede é o último do X-Forwarded-For (o que o proxy acrescentou). Ligações diretas de
// fora usam o IP da ligação: o cabeçalho não é aceite, porque qualquer um o podia inventar.
const LOCAL = /^(::1|127\.|::ffff:127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::ffff:(10|172|192)\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|fd)/;
export function ipDe(req) {
  const direto = req.socket.remoteAddress || '?';
  const xff = req.headers['x-forwarded-for'];
  if (xff && LOCAL.test(direto)) return String(xff).split(',').map((x) => x.trim()).filter(Boolean).pop() || direto;
  return direto;
}
export const agenteDe = (req) => String(req.headers['user-agent'] || '').slice(0, 200);

export const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// servidor/app.env: a única fonte da identidade da app (lida pelo Node e pelos scripts do servidor).
//   NOME=grao-a-grao   TITULO="Grão a Grão"   PORTA=8091   DEV_DADOS=copia
export function lerAppEnv(pasta = process.cwd()) {
  const f = join(resolve(pasta), 'servidor', 'app.env');
  const o = {};
  let txt;
  try { txt = readFileSync(f, 'utf8'); } catch { return o; }
  for (const linha of txt.split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (/^".*"$|^'.*'$/.test(v)) v = v.slice(1, -1);
    o[m[1]] = v;
  }
  return o;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
