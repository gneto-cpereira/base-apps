import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashSenha, confereSenha, problemaSenha, cifrar, decifrar, novaChaveCifra, estaCifrado } from '../lib/cripto.mjs';
import { compararSemver } from '../lib/versao.mjs';
import { nomeLimpo, idValido } from '../lib/contas.mjs';
import { codigoTotp } from '../lib/totp.mjs';
import { scryptSync } from 'node:crypto';

test('palavras-passe', async () => {
  const h = await hashSenha('uma frase bem comprida');
  assert.match(h, /^scrypt\$131072\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.deepEqual(await confereSenha(h, 'uma frase bem comprida'), { ok: true, refazer: false });
  assert.equal((await confereSenha(h, 'outra')).ok, false);
  assert.equal((await confereSenha(null, 'x')).ok, false);
  // hash antigo (N=2^14) continua a servir e pede para ser refeito
  const sal = Buffer.from('abcd', 'utf8');
  const antigo = `scrypt$16384$8$1$${sal.toString('hex')}$${scryptSync('segredo antigo', sal, 64, { N: 16384, r: 8, p: 1 }).toString('hex')}`;
  assert.deepEqual(await confereSenha(antigo, 'segredo antigo'), { ok: true, refazer: true });
  assert.ok(problemaSenha('curta'));
  assert.ok(problemaSenha('aaaaaaaaaaaaaaa'));
  assert.ok(problemaSenha('o grao a grao e bom', { proibidas: ['grao'] }));
  assert.equal(problemaSenha('cavalo bateria agrafo'), null);
});

test('cifra AES-256-GCM', () => {
  const k = novaChaveCifra();
  const c = cifrar('fatura 123 €', k);
  assert.ok(estaCifrado(c));
  assert.equal(decifrar(c, k).toString(), 'fatura 123 €');
  c[c.length - 1] ^= 1;
  assert.throws(() => decifrar(c, k));
  assert.throws(() => decifrar(cifrar('x', k), novaChaveCifra()));
});

test('TOTP (vetor da RFC 6238)', () => {
  // segredo "12345678901234567890" em base32; t=59 s → passo 1 → 94287082 (8 dígitos) → 287082
  assert.equal(codigoTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1), '287082');
});

test('nomes, identificadores e versões', () => {
  assert.equal(nomeLimpo('  Ana   Sá '), 'Ana Sá');
  assert.equal(nomeLimpo("D'Artagnan"), "D'Artagnan");
  assert.equal(nomeLimpo('<script>'), null);
  assert.ok(idValido('ana.sa'));
  assert.ok(!idValido('Ana'));
  assert.equal(compararSemver('v1.2.3', 'v1.10.0'), -1);
  assert.equal(compararSemver('v2.0.0', '1.9.9'), 1);
  assert.equal(compararSemver('v1.0.0', 'v1.0.0'), 0);
});
