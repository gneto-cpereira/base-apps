// Códigos de 6 dígitos de uma app de autenticação (TOTP, RFC 6238: HMAC-SHA1, 30 segundos).
// Funciona com Google Authenticator, Microsoft Authenticator, Aegis, 2FAS, 1Password, Bitwarden…
import { createHmac, randomBytes } from 'node:crypto';

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(buf) {
  let bits = 0, valor = 0, out = '';
  for (const b of buf) {
    valor = (valor << 8) | b; bits += 8;
    while (bits >= 5) { out += ALFABETO[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALFABETO[(valor << (5 - bits)) & 31];
  return out;
}
export function deBase32(txt) {
  const s = String(txt).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, valor = 0;
  const out = [];
  for (const ch of s) {
    valor = (valor << 5) | ALFABETO.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((valor >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const novoSegredo = () => base32(randomBytes(20));
export const passoAtual = (agora = Date.now()) => Math.floor(agora / 30000);

export function codigoTotp(segredo, passo = passoAtual()) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(passo));
  const h = createHmac('sha1', deBase32(segredo)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, '0');
}

// Aceita o código do passo atual e de um passo antes/depois (relógios desacertados).
// Devolve o passo usado, ou -1. Recusa passos já usados (o mesmo código não serve duas vezes).
export function verificarTotp(segredo, codigo, ultimoPasso = -1) {
  const c = String(codigo ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c) || !segredo) return -1;
  const agora = passoAtual();
  for (const p of [agora, agora - 1, agora + 1]) {
    if (p <= ultimoPasso) continue;
    if (codigoTotp(segredo, p) === c) return p;
  }
  return -1;
}

export const urlOtpauth = (titulo, conta, segredo) =>
  `otpauth://totp/${encodeURIComponent(`${titulo}:${conta}`)}?secret=${segredo}&issuer=${encodeURIComponent(titulo)}&algorithm=SHA1&digits=6&period=30`;
