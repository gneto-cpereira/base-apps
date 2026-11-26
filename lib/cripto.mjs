// Criptografia das contas e dos dados, só com node:crypto.
// - Palavras-passe: scrypt N=2^17, r=8, p=1 (OWASP), guardadas como "scrypt$N$r$p$salHex$hashHex".
// - Tokens de sessão, desafios e códigos: aleatórios; guarda-se só o SHA-256.
// - Cifra de ficheiros/campos: AES-256-GCM (para dados sensíveis, ex.: faturas), com uma chave da app.
import { scrypt, randomBytes, randomInt, timingSafeEqual, createHash, createHmac, createCipheriv, createDecipheriv } from 'node:crypto';

export const SCRYPT = { N: 2 ** 17, r: 8, p: 1, tamanho: 32 };
const MAXMEM = 256 * 1024 * 1024;

const scryptP = (senha, sal, N, r, p, tamanho) => new Promise((ok, falha) =>
  scrypt(String(senha).normalize('NFC'), sal, tamanho, { N, r, p, maxmem: MAXMEM }, (e, k) => (e ? falha(e) : ok(k))));

export async function hashSenha(senha) {
  const sal = randomBytes(16);
  const { N, r, p, tamanho } = SCRYPT;
  const h = await scryptP(senha, sal, N, r, p, tamanho);
  return `scrypt$${N}$${r}$${p}$${sal.toString('hex')}$${h.toString('hex')}`;
}

// Para contas inexistentes faz-se o mesmo trabalho: o tempo de resposta não denuncia se a conta existe.
const FALSA = `scrypt$${SCRYPT.N}$8$1$${'00'.repeat(16)}$${'00'.repeat(32)}`;

/** Confere a palavra-passe em tempo constante. Devolve { ok, refazer } (refazer: hash com parâmetros antigos). */
export async function confereSenha(guardada, senha) {
  if (typeof senha !== 'string' || senha.length > 200) senha = '';
  const partes = String(guardada || FALSA).split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return { ok: false, refazer: false };
  const [, N, r, p, sal, h] = partes;
  let calc;
  try { calc = await scryptP(senha, Buffer.from(sal, 'hex'), Number(N), Number(r), Number(p), h.length / 2); }
  catch { return { ok: false, refazer: false }; }
  const ok = !!guardada && timingSafeEqual(calc, Buffer.from(h, 'hex'));
  return { ok, refazer: ok && Number(N) < SCRYPT.N };
}

// Regras da NIST SP 800-63B: comprimento mínimo, recusar as óbvias; sem exigir maiúsculas nem símbolos.
const COMUNS = new Set(['123456789012', '1234567890123', '123456123456', '111111111111', '000000000000', '123123123123',
  'qwertyuiopas', 'qwerty123456', 'palavrapasse', 'palavra-passe', 'passwordpassword', 'password1234', 'password123456',
  'abcdefghijkl', 'aaaaaaaaaaaa', 'iloveyou1234', 'benfica12345', 'sporting1234', 'portugal1234', 'fcporto12345',
  'qwertyqwerty', 'abcabcabcabc', '1q2w3e4r5t6y', 'administrador', 'adminadmin123', 'superadmin123']);
export function problemaSenha(s, { nome = '', proibidas = [] } = {}) {
  if (typeof s !== 'string') return 'Palavra-passe inválida.';
  if ([...s].length < 12) return 'A palavra-passe tem de ter pelo menos 12 caracteres. Uma frase curta é fácil de lembrar.';
  if (s.length > 200) return 'A palavra-passe é demasiado comprida.';
  const b = s.toLowerCase().replace(/\s+/g, '');
  if (COMUNS.has(b) || new Set(b).size < 4) return 'Essa palavra-passe é demasiado fácil de adivinhar.';
  const nomes = [nome, ...proibidas].map((x) => String(x || '').toLowerCase().replace(/\s+/g, '')).filter((x) => x.length >= 3);
  if (nomes.some((x) => b.includes(x))) return 'A palavra-passe não pode ter o teu nome nem o nome da app.';
  return null;
}

export const novoToken = () => randomBytes(32).toString('base64url'); // 256 bits
export const hashToken = (t) => createHash('sha256').update(String(t)).digest('hex');
export const codigoNumerico = (digitos = 6) => String(randomInt(0, 10 ** digitos)).padStart(digitos, '0');

// Códigos para escrever à mão (recuperação, definir palavra-passe): sem letras que se confundam (0/O, 1/I/L).
const LEGIVEL = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const codigoLegivel = (n = 10) => Array.from({ length: n }, () => LEGIVEL[randomInt(0, LEGIVEL.length)]).join('');
export const normalizarCodigo = (c) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const mostrarCodigo = (c) => (c.length === 10 ? `${c.slice(0, 5)}-${c.slice(5)}` : c);

// Compara dois textos em tempo constante (via HMAC, para não depender do comprimento)
const CHAVE_CMP = randomBytes(32);
export const iguais = (a, b) => timingSafeEqual(
  createHmac('sha256', CHAVE_CMP).update(String(a)).digest(),
  createHmac('sha256', CHAVE_CMP).update(String(b)).digest());

// ---------- Cifra (AES-256-GCM) ----------
// Formato: "BA1" (3 bytes) + iv (12) + etiqueta (16) + dados cifrados. A chave tem 32 bytes (64 hex),
// vem da variável de ambiente CHAVE_CIFRA e nunca vai para o repositório nem para as cópias.
const MAGIA = Buffer.from('BA1');
export const novaChaveCifra = () => randomBytes(32).toString('hex');
function chave(k) {
  const b = Buffer.isBuffer(k) ? k : Buffer.from(String(k || ''), 'hex');
  if (b.length !== 32) throw new Error('A chave de cifra tem de ter 32 bytes (64 caracteres hexadecimais).');
  return b;
}
export function cifrar(dados, k) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave(k), iv);
  const corpo = Buffer.concat([c.update(Buffer.isBuffer(dados) ? dados : Buffer.from(String(dados), 'utf8')), c.final()]);
  return Buffer.concat([MAGIA, iv, c.getAuthTag(), corpo]);
}
export function decifrar(buf, k) {
  if (!Buffer.isBuffer(buf) || buf.length < 31 || !buf.subarray(0, 3).equals(MAGIA)) throw new Error('Não é um ficheiro cifrado.');
  const d = createDecipheriv('aes-256-gcm', chave(k), buf.subarray(3, 15));
  d.setAuthTag(buf.subarray(15, 31));
  return Buffer.concat([d.update(buf.subarray(31)), d.final()]);
}
export const estaCifrado = (buf) => Buffer.isBuffer(buf) && buf.length >= 31 && buf.subarray(0, 3).equals(MAGIA);
