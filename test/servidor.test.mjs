import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { novaApp, cliente } from './ajuda.mjs';
import { codigoTotp, passoAtual } from '../lib/totp.mjs';

let A, base;
before(async () => { ({ app: A, base } = await novaApp()); });
after(() => A.parar());
beforeEach(() => A.bd.exec('DELETE FROM tentativas'));

// Cria o superadmin como na linha de comandos e define-lhe a palavra-passe com o código.
async function superadminComSenha(c, id = 'chefe', senha = 'uma frase bem comprida') {
  A.contas.criar({ id, nome: 'Chefe', papel: 'superadmin' });
  const codigo = A.contas.novoCodigoSenha(id);
  return c.post('/api/conta/definir-senha', { codigo, senha });
}

test('cabeçalhos de segurança e ficheiros', async () => {
  const c = cliente(base);
  const r = await c.get('/');
  assert.equal(r.estado, 200);
  assert.match(r.cabecalhos.get('content-security-policy'), /script-src 'self'/);
  assert.equal(r.cabecalhos.get('x-frame-options'), 'DENY');
  assert.equal(r.cabecalhos.get('x-content-type-options'), 'nosniff');
  assert.equal((await c.get('/%2e%2e/servidor/app.env')).estado, 404);
  assert.equal((await c.get('/.git/config')).estado, 404);
  assert.equal((await c.get('/%5c..%5cservidor%5capp.env')).estado, 400);
  assert.equal((await c.get('/privado/x.txt')).estado, 401);
  assert.equal((await c.get('/base/entrada.js')).estado, 200);
  assert.equal((await c.pedir('PUT', '/index.html', 'x', { 'content-type': 'text/plain' })).estado, 405);
});

test('rotas: sessão exigida por defeito, públicas, parâmetros, CSRF', async () => {
  const c = cliente(base);
  assert.equal((await c.get('/api/ola')).estado, 401);
  assert.deepEqual((await c.get('/api/publica')).dados, { ok: 1 });
  assert.deepEqual((await c.get('/api/item/abc')).dados, { id: 'abc' });
  assert.equal((await c.get('/api/nada')).estado, 404);
  assert.equal((await c.post('/api/conta/entrar', {}, { origin: 'https://mau.exemplo' })).estado, 403);
  assert.equal((await c.post('/api/conta/entrar', {}, { 'sec-fetch-site': 'cross-site' })).estado, 403);
  assert.equal((await c.pedir('POST', '/api/conta/entrar', 'nome=x', { 'content-type': 'application/x-www-form-urlencoded' })).estado, 415);
  assert.equal((await c.post('/api/conta/entrar', { senha: 'x'.repeat(20_000) })).estado, 413);
  assert.equal((await c.get('/api/conta/entrada')).dados.metodo, 'senha');
});

test('palavra-passe, segundo passo obrigatório do superadmin e códigos de recuperação', async () => {
  const c = cliente(base);
  // palavra-passe fraca não gasta o código
  A.contas.criar({ id: 'ana', nome: 'Ana Sá', papel: 'superadmin' });
  const codigo = A.contas.novoCodigoSenha('ana');
  assert.equal((await c.post('/api/conta/definir-senha', { codigo, senha: 'curta' })).estado, 400);
  assert.equal((await c.post('/api/conta/definir-senha', { codigo, senha: 'ana e a app de teste' })).estado, 400); // tem o nome
  let r = await c.post('/api/conta/definir-senha', { codigo, senha: 'cavalo bateria agrafo correto' });
  assert.equal(r.estado, 200);
  assert.equal(r.dados.passo, 'feito');
  assert.equal(r.dados.configurarTotp, true);
  assert.equal((await c.post('/api/conta/definir-senha', { codigo, senha: 'cavalo bateria agrafo correto' })).estado, 401); // gasto

  // até ligar a app de autenticação, só pode ligá-la ou sair
  assert.equal((await c.get('/api/ola')).estado, 403);
  assert.equal((await c.get('/api/conta/eu')).estado, 200);
  const { segredo } = (await c.post('/api/conta/totp/iniciar')).dados;
  assert.equal((await c.post('/api/conta/totp/ativar', { codigo: '000000' })).estado, 400);
  r = await c.post('/api/conta/totp/ativar', { codigo: codigoTotp(segredo) });
  assert.equal(r.estado, 200);
  assert.equal(r.dados.recuperacao.length, 8);
  assert.match(r.dados.recuperacao[0], /^[2-9A-Z]{5}-[2-9A-Z]{5}$/);
  const recuperacao = r.dados.recuperacao;
  assert.deepEqual((await c.get('/api/ola')).dados, { ola: 'ana' });
  assert.equal((await c.post('/api/conta/totp/desligar', { codigo: '123456' })).estado, 400); // superadmin não pode

  // sair e voltar a entrar: palavra-passe → código da app (o mesmo código não serve duas vezes)
  await c.post('/api/conta/sair');
  assert.equal((await c.get('/api/ola')).estado, 401);
  r = await c.post('/api/conta/entrar', { nome: 'ANA', senha: 'cavalo bateria agrafo correto' });
  assert.equal(r.dados.passo, 'totp');
  const usado = codigoTotp(segredo);
  assert.equal((await c.post('/api/conta/totp', { desafio: r.dados.desafio, codigo: usado })).estado, 401);
  r = await c.post('/api/conta/entrar', { nome: 'ana', senha: 'cavalo bateria agrafo correto' });
  r = await c.post('/api/conta/totp', { desafio: r.dados.desafio, codigo: recuperacao[0].toLowerCase() });
  assert.equal(r.estado, 200);
  assert.equal(r.dados.passo, 'feito');
  assert.equal(A.contas.recuperacaoRestante('ana'), 7);

  // sessões: listar e terminar as outras
  const c2 = cliente(base);
  r = await c2.post('/api/conta/entrar', { nome: 'ana', senha: 'cavalo bateria agrafo correto' });
  r = await c2.post('/api/conta/totp', { desafio: r.dados.desafio, codigo: codigoTotp(segredo, passoAtual() + 1) });
  assert.equal(r.estado, 200);
  assert.equal((await c.get('/api/conta/sessoes')).dados.length, 2);
  await c.post('/api/conta/sessoes', { id: 'outras' });
  assert.equal((await c2.get('/api/ola')).estado, 401);
  assert.equal((await c.get('/api/ola')).estado, 200);
});

test('tentativas falhadas bloqueiam', async () => {
  const c = cliente(base);
  for (let i = 0; i < 5; i++) assert.equal((await c.post('/api/conta/entrar', { nome: 'ninguem', senha: 'errada errada errada' })).estado, 401);
  const r = await c.post('/api/conta/entrar', { nome: 'ninguem', senha: 'errada errada errada' });
  assert.equal(r.estado, 429);
  assert.ok(Number(r.cabecalhos.get('retry-after')) > 0);
  A.limites.limpar('ip:127.0.0.1', 'ip:::ffff:127.0.0.1');
});

test('superadmin gere contas; os outros não', async () => {
  const c = cliente(base);
  await superadminComSenha(c, 'bruno');
  const { segredo } = (await c.post('/api/conta/totp/iniciar')).dados;
  await c.post('/api/conta/totp/ativar', { codigo: codigoTotp(segredo) });
  let r = await c.post('/api/conta/utilizadores', { acao: 'criar', id: 'rita', nome: 'Rita Gonçalves', papel: 'user' });
  assert.equal(r.estado, 200);
  assert.match(r.dados.codigoSenha, /^[2-9A-Z]{5}-[2-9A-Z]{5}$/);
  assert.ok(r.dados.contas.some((x) => x.id === 'rita' && x.nome === 'Rita Gonçalves'));
  assert.equal((await c.post('/api/conta/utilizadores', { acao: 'criar', id: 'Rita!' })).estado, 400);
  assert.equal((await c.post('/api/conta/utilizadores', { acao: 'alterar', id: 'bruno', papel: 'user' })).estado, 400);

  const u = cliente(base);
  r = await u.post('/api/conta/definir-senha', { codigo: r.dados.codigoSenha, senha: 'gosto muito de sopa de pedra' });
  assert.equal(r.dados.configurarTotp, false);
  assert.equal((await u.get('/api/ola')).estado, 200);
  assert.equal((await u.get('/api/so-admin')).estado, 403);
  assert.equal((await u.get('/api/conta/utilizadores')).estado, 403);
  // mudar o papel termina as sessões dessa pessoa
  await c.post('/api/conta/utilizadores', { acao: 'alterar', id: 'rita', papel: 'admin' });
  assert.equal((await u.get('/api/ola')).estado, 401);
  assert.ok((await c.get('/api/conta/registo')).dados.some((e) => e.tipo === 'conta-alterar'));
});

test('sessão expira sem uso', async () => {
  const c = cliente(base);
  A.contas.criar({ id: 'velho', nome: 'Velho' });
  await c.post('/api/conta/definir-senha', { codigo: A.contas.novoCodigoSenha('velho'), senha: 'esta frase chega bem' });
  assert.equal((await c.get('/api/ola')).estado, 200);
  A.bd.prepare('UPDATE sessoes SET vista = ? WHERE conta = ?').run(Date.now() - 31 * 86400_000, 'velho');
  assert.equal((await c.get('/api/ola')).estado, 401);
});

test('entrada por código de email', async () => {
  process.env.BASE_EMAIL_CONSOLA = '1';
  const { app: E, base: b } = await novaApp();
  delete process.env.BASE_EMAIL_CONSOLA;
  try {
    const c = cliente(b);
    assert.equal((await c.get('/api/conta/entrada')).dados.metodo, 'email');
    E.contas.criar({ id: 'joao', nome: 'João', email: 'joao@exemplo.pt' });
    assert.equal((await c.post('/api/conta/entrar', { nome: 'joao', senha: 'qualquer coisa longa' })).estado, 400);
    // conta inexistente: mesma resposta, sem email
    assert.deepEqual((await c.post('/api/conta/pedir-codigo', { email: 'ninguem@exemplo.pt' })).dados, { ok: true });
    assert.equal(E.email.enviados.length, 0);
    assert.deepEqual((await c.post('/api/conta/pedir-codigo', { email: 'Joao@Exemplo.pt' })).dados, { ok: true });
    await new Promise((ok) => setTimeout(ok, 50));
    assert.equal(E.email.enviados.length, 1);
    const codigo = E.email.enviados[0].assunto.match(/(\d{6})$/)[1];
    // 1 pedido a cada 40 s por email
    await c.post('/api/conta/pedir-codigo', { email: 'joao@exemplo.pt' });
    assert.equal(E.email.enviados.length, 1);
    assert.equal((await c.post('/api/conta/codigo', { email: 'joao@exemplo.pt', codigo: '000000' === codigo ? '111111' : '000000' })).estado, 401);
    const r = await c.post('/api/conta/codigo', { email: 'joao@exemplo.pt', codigo });
    assert.equal(r.estado, 200);
    assert.equal(r.dados.id, 'joao');
    assert.equal((await c.get('/api/ola')).dados.ola, 'joao');
    // código de emergência (linha de comandos)
    const c2 = cliente(b);
    const em = E.contas.novoCodigoEmergencia('joao');
    assert.equal((await c2.post('/api/conta/codigo', { email: 'joao@exemplo.pt', codigo: em })).estado, 200);
    assert.equal((await cliente(b).post('/api/conta/codigo', { email: 'joao@exemplo.pt', codigo: em })).estado, 401);
  } finally { await E.parar(); }
});
