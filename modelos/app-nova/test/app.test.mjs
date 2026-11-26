// Testes da app: arranca-a numa pasta temporária e fala com ela por HTTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('a app arranca e protege a API', async () => {
  const dados = mkdtempSync(join(tmpdir(), '{{NOME}}-'));
  const p = spawn(process.execPath, ['servidor.mjs'], { env: { ...process.env, DADOS: dados, PORTA: '0', HOST: '127.0.0.1' } });
  try {
    const porta = await new Promise((ok, falha) => {
      p.stdout.on('data', (d) => { const m = String(d).match(/:(\d+) /); if (m) ok(m[1]); });
      p.on('exit', () => falha(new Error('a app parou')));
    });
    assert.equal((await fetch(`http://127.0.0.1:${porta}/api/notas`)).status, 401);
    assert.equal((await fetch(`http://127.0.0.1:${porta}/`)).status, 200);
  } finally { p.kill(); }
});
