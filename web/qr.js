// Gerador de QR code (ISO/IEC 18004) sem dependências: modo byte (UTF-8), correção de erros M, versões 1 a 20
// (até ~330 bytes; chega para os endereços otpauth:// da app de autenticação). Segue o algoritmo de referência
// de Project Nayuki (MIT). Servido em /base/qr.js.
//   import { qrSvg } from '/base/qr.js';
//   el.innerHTML = qrSvg('otpauth://totp/...');

const ECC_POR_BLOCO = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
const BLOCOS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];
const NIVEL_M = 0; // bits do nível de correção M no formato

const bit = (x, i) => ((x >>> i) & 1) !== 0;

function modulosDeDados(v) {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
  return r;
}
const codigosDeDados = (v) => Math.floor(modulosDeDados(v) / 8) - ECC_POR_BLOCO[v] * BLOCOS[v];

// Reed-Solomon em GF(2^8) com o polinómio 0x11D
function mult(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z;
}
function divisor(grau) {
  const r = new Array(grau).fill(0);
  r[grau - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grau; i++) {
    for (let j = 0; j < r.length; j++) { r[j] = mult(r[j], raiz); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
    raiz = mult(raiz, 0x02);
  }
  return r;
}
function resto(dados, div) {
  const r = div.map(() => 0);
  for (const b of dados) {
    const f = b ^ r.shift();
    r.push(0);
    div.forEach((c, i) => { r[i] ^= mult(c, f); });
  }
  return r;
}

/** Matriz do QR code: lista de linhas, cada uma uma lista de booleanos (true = escuro). */
export function qrMatriz(texto) {
  const bytes = [...new TextEncoder().encode(String(texto))];
  let v = 1;
  for (; v <= 20; v++) if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= codigosDeDados(v) * 8) break;
  if (v > 20) throw new Error('Texto demasiado comprido para o QR code.');

  // Bits: modo byte, comprimento, dados, terminador, enchimento
  const bits = [];
  const por = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  por(4, 4); por(bytes.length, v < 10 ? 8 : 16);
  for (const b of bytes) por(b, 8);
  const capacidade = codigosDeDados(v) * 8;
  por(0, Math.min(4, capacidade - bits.length));
  por(0, (8 - (bits.length % 8)) % 8);
  for (let p = 0xec; bits.length < capacidade; p ^= 0xec ^ 0x11) por(p, 8);
  const dados = [];
  for (let i = 0; i < bits.length; i += 8) dados.push(parseInt(bits.slice(i, i + 8).join(''), 2));

  // Blocos com correção de erros, intercalados
  const nBlocos = BLOCOS[v], eccLen = ECC_POR_BLOCO[v], totais = Math.floor(modulosDeDados(v) / 8);
  const curtos = nBlocos - (totais % nBlocos), compCurto = Math.floor(totais / nBlocos);
  const div = divisor(eccLen), blocos = [];
  for (let i = 0, k = 0; i < nBlocos; i++) {
    const d = dados.slice(k, k + compCurto - eccLen + (i < curtos ? 0 : 1));
    k += d.length;
    const ecc = resto(d, div);
    if (i < curtos) d.push(0);
    blocos.push(d.concat(ecc));
  }
  const final = [];
  for (let i = 0; i < blocos[0].length; i++)
    for (let j = 0; j < blocos.length; j++) if (i !== compCurto - eccLen || j >= curtos) final.push(blocos[j][i]);

  // Matriz e padrões fixos
  const n = v * 4 + 17;
  const m = Array.from({ length: n }, () => new Array(n).fill(false));
  const fixo = Array.from({ length: n }, () => new Array(n).fill(false));
  const pf = (x, y, escuro) => { m[y][x] = escuro; fixo[y][x] = true; };
  for (let i = 0; i < n; i++) { pf(6, i, i % 2 === 0); pf(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]])
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < n && y >= 0 && y < n) pf(x, y, dist !== 2 && dist !== 4);
    }
  const alin = [];
  if (v > 1) {
    const num = Math.floor(v / 7) + 2, passo = Math.ceil((v * 4 + 4) / (num * 2 - 2)) * 2;
    alin.push(6);
    for (let p = n - 7; alin.length < num; p -= passo) alin.splice(1, 0, p);
  }
  for (let i = 0; i < alin.length; i++) for (let j = 0; j < alin.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === alin.length - 1) || (i === alin.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) pf(alin[i] + dx, alin[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const formato = (mascara) => {
    const d = (NIVEL_M << 3) | mascara;
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412;
    for (let i = 0; i <= 5; i++) pf(8, i, bit(b, i));
    pf(8, 7, bit(b, 6)); pf(8, 8, bit(b, 7)); pf(7, 8, bit(b, 8));
    for (let i = 9; i < 15; i++) pf(14 - i, 8, bit(b, i));
    for (let i = 0; i < 8; i++) pf(n - 1 - i, 8, bit(b, i));
    for (let i = 8; i < 15; i++) pf(8, n - 15 + i, bit(b, i));
    pf(8, n - 8, true);
  };
  formato(0);
  if (v >= 7) {
    let r = v;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (v << 12) | r;
    for (let i = 0; i < 18; i++) { const a = n - 11 + (i % 3), c = Math.floor(i / 3); pf(a, c, bit(b, i)); pf(c, a, bit(b, i)); }
  }

  // Dados em ziguezague
  let i = 0;
  for (let dir = n - 1; dir >= 1; dir -= 2) {
    if (dir === 6) dir = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const x = dir - j, subir = ((dir + 1) & 2) === 0, y = subir ? n - 1 - vert : vert;
      if (!fixo[y][x] && i < final.length * 8) { m[y][x] = bit(final[i >>> 3], 7 - (i & 7)); i++; }
    }
  }

  // Máscara: experimenta as 8 e fica com a de menor penalização
  const MASCARAS = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const aplicar = (k) => { for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fixo[y][x] && MASCARAS[k](x, y)) m[y][x] = !m[y][x]; };
  let melhor = 0, menor = Infinity;
  for (let k = 0; k < 8; k++) {
    aplicar(k); formato(k);
    const p = penalizacao(m);
    if (p < menor) { menor = p; melhor = k; }
    aplicar(k); // desfaz (a máscara é um XOR)
  }
  aplicar(melhor); formato(melhor);
  return m;
}

// Penalização (regras 1, 2, 3 e 4 da norma, de forma simples)
function penalizacao(m) {
  const n = m.length;
  let p = 0, escuros = 0;
  const linhas = (get) => {
    for (let a = 0; a < n; a++) {
      let corrida = 1;
      const seq = [];
      for (let b = 0; b < n; b++) {
        seq.push(get(a, b) ? 1 : 0);
        if (b > 0 && get(a, b) === get(a, b - 1)) { corrida++; if (corrida === 5) p += 3; else if (corrida > 5) p++; }
        else corrida = 1;
      }
      const s = seq.join('');
      for (const padrao of ['10111010000', '00001011101']) for (let k = s.indexOf(padrao); k >= 0; k = s.indexOf(padrao, k + 1)) p += 40;
    }
  };
  linhas((a, b) => m[a][b]);
  linhas((a, b) => m[b][a]);
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
  }
  for (const l of m) for (const c of l) if (c) escuros++;
  p += Math.floor(Math.abs(escuros * 20 - n * n * 10) / (n * n)) * 10;
  return p;
}

/** QR code em SVG (escala com o tamanho do elemento). As cores seguem currentColor e o fundo é branco. */
export function qrSvg(texto, { margem = 4, titulo = 'QR code' } = {}) {
  const m = qrMatriz(texto), n = m.length, t = n + margem * 2;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) d += `M${x + margem} ${y + margem}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" role="img" aria-label="${titulo}" shape-rendering="crispEdges"><rect width="${t}" height="${t}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
