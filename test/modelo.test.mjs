import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(import.meta.dirname, '..', 'bin', 'base-apps.mjs');
const todos = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? todos(join(d, n)) : [join(d, n)]));

test('nova-app cria uma app completa, sem marcadores por trocar', () => {
  const pasta = join(mkdtempSync(join(tmpdir(), 'base-apps-modelo-')), 'minha-app');
  execFileSync(process.execPath, [CLI, 'nova-app', 'minha-app', '--titulo', 'Minha App', '--porta', '8123', '--dev-dados', 'partilhados', '--pasta', pasta]);
  const f = todos(pasta).map((x) => x.slice(pasta.length + 1).replaceAll('\\', '/'));
  for (const obrigatorio of ['CLAUDE.md', 'README.md', 'CHANGELOG.md', '.gitignore', '.gitattributes', 'package.json', 'servidor.mjs',
    'web/index.html', 'web/app.js', 'web/estilo.css', 'servidor/app.env', 'servidor/docker-compose.yml', 'servidor/Dockerfile',
    'servidor/arranque.sh', 'servidor/dev-acordar.sh', 'servidor/copia-dados.sh', 'servidor/LEIA-ME.md', 'servidor/SEGURANCA.md', 'test/app.test.mjs'])
    assert.ok(f.includes(obrigatorio), `falta ${obrigatorio}`);
  for (const x of todos(pasta)) assert.doesNotMatch(readFileSync(x, 'utf8'), /\{\{[A-Z_]+\}\}/, x);
  assert.match(readFileSync(join(pasta, 'servidor', 'app.env'), 'utf8'), /NOME=minha-app\nTITULO="Minha App"\nPORTA=8123/);
  assert.match(readFileSync(join(pasta, 'servidor', 'docker-compose.yml'), 'utf8'), /\.\.\/\.\.\/dados:\/dados\n$/);
  const pkg = JSON.parse(readFileSync(join(pasta, 'package.json'), 'utf8'));
  assert.match(pkg.dependencies['base-apps'], /^github:gneto-cpereira\/base-apps#v\d+\.\d+\.\d+$/);
  // os scripts do servidor são iguais aos da base
  assert.match(execFileSync(process.execPath, [CLI, 'infra'], { cwd: pasta, encoding: 'utf8' }), /Iguais à base/);
});
