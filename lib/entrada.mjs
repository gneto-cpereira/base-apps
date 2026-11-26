// Rotas da conta e da entrada, iguais em todas as apps (em /api/conta/...). Ver docs/SEGURANCA.md.
//
// Como se entra (o método é escolhido sozinho):
// - Com o Gmail configurado → email + código de 6 dígitos (10 min, uma vez, 5 tentativas). Sem palavras-passe.
// - Sem email configurado   → identificador (ou email) + palavra-passe.
// - Depois, quem tem a app de autenticação ligada escreve o código dela (ou um código de recuperação).
//   O superadmin tem de a ligar: até lá só consegue ligá-la ou sair.
// Contas novas: criadas pelo superadmin (na app ou na linha de comandos). Sem email configurado, a pessoa recebe
// um código de 10 letras (30 min) para escolher ela própria a palavra-passe; o mesmo serve para uma esquecida.
// Ninguém, nem o superadmin, escolhe ou vê a palavra-passe de outra pessoa.
import { Erro, espera, agenteDe, texto } from './util.mjs';
import { novoToken, hashToken, codigoNumerico, iguais } from './cripto.mjs';
import { normalizarEmail, emailValido } from './email.mjs';
import { urlOtpauth } from './totp.mjs';
import { PAPEIS, VALIDADE, pode } from './contas.mjs';
import { MAX_FALHAS } from './limites.mjs';

export function registarRotasConta(app) {
  const { bd, contas, email, registar, limites, titulo } = app;
  const q = (sql) => bd.prepare(sql);
  const publica = { publica: true };
  const metodo = () => (email.configurado() ? 'email' : 'senha');

  function travar(...chaves) {
    const s = limites.espera(...chaves);
    if (s) throw new Erro(app.mensagemEspera(s), 429, { 'Retry-After': String(s) });
  }
  async function falhou(chaves, tipo, dados) {
    const preso = limites.falhou(...chaves);
    registar(preso ? 'bloqueio' : tipo, dados);
    await espera(400); // torna a adivinhação ainda mais lenta
  }

  function entrarDeVez({ req, res, ip }, c, como) {
    const token = contas.criarSessao(c.id, { ip, agente: agenteDe(req) });
    registar('entrada', { conta: c.id, ip, como });
    app.json(res, 200, { passo: 'feito', ...contas.publica(c) }, { 'Set-Cookie': app.cookieSessao(token) });
  }
  // Depois do primeiro fator: quem tem app de autenticação ainda tem de escrever o código dela.
  function depoisDoPrimeiroFator(ctx, c, como) {
    if (c.totp) {
      const d = novoToken();
      q('DELETE FROM desafios WHERE expira < ?').run(Date.now());
      q('INSERT INTO desafios (hash, conta, metodo, expira) VALUES (?, ?, ?, ?)').run(hashToken(d), c.id, como, Date.now() + VALIDADE.desafio);
      return { passo: 'totp', desafio: d };
    }
    entrarDeVez(ctx, c, como);
  }

  // ---------- Entrada (sem sessão) ----------
  app.rota('GET', 'conta/entrada', () => ({ metodo: metodo(), titulo, ramo: app.ramo }), publica);

  app.rota('POST', 'conta/pedir-codigo', async ({ corpo, ip }) => {
    if (metodo() !== 'email') throw new Erro('O envio de emails ainda não está configurado.');
    const e = normalizarEmail(corpo.email);
    if (!emailValido(e)) throw new Erro('Escreve um email válido.');
    if (!limites.dentro('pedir-ip:' + ip, 10, 3600_000) || !limites.dentro('pedir-global', 60, 3600_000)) {
      registar('limite-pedidos', { ip });
      throw new Erro('Demasiados pedidos de código. Tenta mais tarde.', 429);
    }
    // A resposta é igual quer a conta exista quer não (não revela quem tem conta); o envio corre em segundo plano.
    const c = contas.porEmail(e);
    if (c && limites.dentro('pedir-email:' + e, 4, 15 * 60_000) && limites.dentro('pedir-email-curto:' + e, 1, 40_000)) {
      const codigo = codigoNumerico(6);
      q(`INSERT INTO codigos_email (email, conta, hash, expira, falhas) VALUES (?, ?, ?, ?, 0)
         ON CONFLICT(email) DO UPDATE SET conta = excluded.conta, hash = excluded.hash, expira = excluded.expira, falhas = 0`)
        .run(e, c.id, hashToken(codigo), Date.now() + VALIDADE.codigoEmail);
      email.enviar({
        para: e,
        assunto: `Código ${titulo}: ${codigo}`,
        texto: `Olá ${c.nome},\n\nO teu código para entrar em ${titulo} é:\n\n    ${codigo}\n\nÉ válido durante 10 minutos e só serve uma vez.\nSe não foste tu a pedir, ignora este email: sem o código ninguém entra.\n\n${titulo}\n`,
      }).then(() => registar('codigo-enviado', { conta: c.id, ip })).catch((err) => registar('email-falhou', { conta: c.id, erro: err.message }));
    } else if (!c) registar('codigo-pedido-email-desconhecido', { ip });
    await espera(300 + Math.random() * 300);
    return { ok: true };
  }, publica);

  app.rota('POST', 'conta/codigo', async (ctx) => {
    const { corpo, ip } = ctx;
    const e = normalizarEmail(corpo.email), cod = String(corpo.codigo ?? '').replace(/\s/g, '');
    const chaves = ['ip:' + ip, 'email:' + e];
    travar(...chaves);
    const x = q('SELECT * FROM codigos_email WHERE email = ? AND expira > ?').get(e, Date.now());
    let c = null, como = 'email';
    if (x && /^\d{6}$/.test(cod) && iguais(hashToken(cod), x.hash)) { c = contas.obter(x.conta); q('DELETE FROM codigos_email WHERE email = ?').run(e); }
    else if (/^\d{8}$/.test(cod)) { const k = contas.porEmail(e); if (k && contas.usarEmergencia(k.id, cod)) { c = k; como = 'emergencia'; } }
    if (!c) {
      if (x) { // à 5.ª tentativa errada o código deixa de valer
        if (x.falhas + 1 >= MAX_FALHAS) q('DELETE FROM codigos_email WHERE email = ?').run(e);
        else q('UPDATE codigos_email SET falhas = falhas + 1 WHERE email = ?').run(e);
      }
      await falhou(chaves, 'codigo-errado', { ip, email: e.slice(0, 120) });
      throw new Erro('Código errado ou expirado.', 401);
    }
    limites.limpar('email:' + e);
    return depoisDoPrimeiroFator(ctx, c, como);
  }, publica);

  app.rota('POST', 'conta/entrar', async (ctx) => { // palavra-passe (só enquanto o email não está configurado)
    const { corpo, ip } = ctx;
    if (metodo() !== 'senha') throw new Erro('Entra com o código enviado por email.');
    const id = String(corpo.nome ?? corpo.id ?? '').trim().toLowerCase().slice(0, 120);
    const chaves = ['ip:' + ip, 'conta:' + id];
    travar(...chaves);
    const c = contas.porIdOuEmail(id);
    if (!(await contas.conferirSenha(c, corpo.senha))) {
      await falhou(chaves, c ? 'senha-errada' : 'conta-inexistente', { conta: id.slice(0, 60), ip });
      throw new Erro('Utilizador ou palavra-passe errados.', 401);
    }
    limites.limpar('conta:' + id);
    return depoisDoPrimeiroFator(ctx, c, 'senha');
  }, publica);

  app.rota('POST', 'conta/totp', async (ctx) => {
    const { corpo, ip } = ctx;
    const h = hashToken(String(corpo.desafio || ''));
    const d = q('SELECT * FROM desafios WHERE hash = ? AND expira > ?').get(h, Date.now());
    if (!d) throw new Erro('O tempo para escrever o código acabou. Entra outra vez.', 401);
    const chaves = ['ip:' + ip, 'totp:' + d.conta];
    travar(...chaves);
    const como = contas.conferirSegundoPasso(d.conta, corpo.codigo);
    if (!como) {
      if (d.falhas + 1 >= MAX_FALHAS) q('DELETE FROM desafios WHERE hash = ?').run(h);
      else q('UPDATE desafios SET falhas = falhas + 1 WHERE hash = ?').run(h);
      await falhou(chaves, 'totp-errado', { conta: d.conta, ip });
      throw new Erro('Código da app de autenticação errado.', 401);
    }
    q('DELETE FROM desafios WHERE hash = ?').run(h);
    limites.limpar('totp:' + d.conta);
    if (como === 'recuperacao') registar('codigo-recuperacao-usado', { conta: d.conta, ip, restam: contas.recuperacaoRestante(d.conta) });
    const c = contas.obter(d.conta);
    if (!c) throw new Erro('Conta desconhecida.', 401);
    entrarDeVez(ctx, c, `${d.metodo}+${como}`);
  }, publica);

  // Escolher a palavra-passe com o código dado pelo superadmin (conta nova ou palavra-passe esquecida)
  app.rota('POST', 'conta/definir-senha', async (ctx) => {
    const { corpo, ip } = ctx;
    const chaves = ['ip:' + ip];
    travar(...chaves);
    const c = contas.verCodigoSenha(corpo.codigo);
    if (!c) {
      await falhou(chaves, 'codigo-senha-errado', { ip });
      throw new Erro('Esse código não existe ou já não vale.', 401);
    }
    contas.validarSenha(c, corpo.senha); // uma palavra-passe fraca não gasta o código
    contas.usarCodigoSenha(corpo.codigo);
    await contas.definirSenha(c.id, corpo.senha);
    limites.limpar(...chaves);
    registar('senha-definida', { conta: c.id, ip });
    return depoisDoPrimeiroFator(ctx, contas.obter(c.id), 'codigo-senha');
  }, publica);

  app.rota('POST', 'conta/sair', ({ req, res, ip }) => {
    const c = app.contaDe(req);
    if (c) { contas.terminarSessao(c.sessao); registar('saida', { conta: c.id, ip }); }
    app.json(res, 200, { ok: true }, { 'Set-Cookie': app.apagarCookie() });
  }, publica);

  // ---------- Com sessão ----------
  const meio = { sem2passos: true };
  app.rota('GET', 'conta/eu', ({ conta }) => ({ ...contas.publica(conta), metodo: metodo(), ramo: app.ramo, titulo }), meio);

  app.rota('POST', 'conta/totp/iniciar', ({ conta }) => {
    const segredo = contas.iniciarTotp(conta.id);
    return { segredo, url: urlOtpauth(titulo, conta.email || conta.id, segredo) };
  }, meio);

  app.rota('POST', 'conta/totp/ativar', async ({ conta, corpo, ip }) => {
    const chaves = ['ip:' + ip, 'totp:' + conta.id];
    travar(...chaves);
    const recuperacao = contas.ativarTotp(conta.id, corpo.codigo, conta.sessao);
    if (!recuperacao) {
      await falhou(chaves, 'totp-errado-ao-ligar', { conta: conta.id, ip });
      throw new Erro('Código errado. Confirma que a hora do telemóvel está certa e escreve o código que aparece agora.');
    }
    limites.limpar('totp:' + conta.id);
    registar('totp-ligado', { conta: conta.id, ip });
    return { recuperacao };
  }, meio);

  app.rota('POST', 'conta/totp/desligar', async ({ conta, corpo, ip }) => {
    if (conta.papel === 'superadmin') throw new Erro('O superadmin tem de ter sempre a verificação em dois passos.');
    const chaves = ['ip:' + ip, 'totp:' + conta.id];
    travar(...chaves);
    if (!contas.conferirSegundoPasso(conta.id, corpo.codigo)) { await falhou(chaves, 'totp-errado', { conta: conta.id, ip }); throw new Erro('Código errado.'); }
    contas.desligarTotp(conta.id);
    registar('totp-desligado', { conta: conta.id, ip });
    return {};
  });

  app.rota('GET', 'conta/sessoes', ({ conta }) => contas.sessoesDe(conta.id, conta.sessao));
  app.rota('POST', 'conta/sessoes', ({ conta, corpo, ip }) => {
    const qual = String(corpo.id || '');
    for (const s of q('SELECT hash FROM sessoes WHERE conta = ?').all(conta.id))
      if (s.hash !== conta.sessao && (qual === 'outras' || s.hash.slice(0, 16) === qual)) contas.terminarSessao(s.hash);
    registar('sessoes-terminadas', { conta: conta.id, ip, quais: qual === 'outras' ? 'outras' : 'uma' });
    return contas.sessoesDe(conta.id, conta.sessao);
  });

  app.rota('POST', 'conta/senha', async ({ conta, corpo, ip }) => {
    const chaves = ['ip:' + ip, 'conta:' + conta.id];
    travar(...chaves);
    if (!(await contas.conferirSenha(contas.obter(conta.id), corpo.atual))) {
      await falhou(chaves, 'senha-errada', { conta: conta.id, ip });
      throw new Erro('A palavra-passe atual está errada.');
    }
    await contas.definirSenha(conta.id, corpo.nova, { exceto: conta.sessao });
    registar('senha-alterada', { conta: conta.id, ip });
    return {};
  });

  // ---------- Superadmin: contas e registo de segurança ----------
  const sa = { papel: 'superadmin' };
  app.rota('GET', 'conta/utilizadores', () => ({ metodo: metodo(), contas: contas.listar() }), sa);
  app.rota('POST', 'conta/utilizadores', async ({ conta, corpo, ip }) => {
    const acao = String(corpo.acao || '');
    const id = String(corpo.id || '').trim().toLowerCase();
    let codigoSenha = null;
    if (acao === 'criar') {
      if (metodo() === 'email' && !normalizarEmail(corpo.email)) throw new Erro('Falta o email: é com ele que a pessoa entra.');
      contas.criar({ id, nome: texto(corpo.nome, 40) || id, email: corpo.email || null, papel: corpo.papel || 'user' });
      if (metodo() === 'senha') codigoSenha = contas.novoCodigoSenha(id, conta.id);
    } else if (acao === 'alterar') {
      contas.alterar(id, { nome: corpo.nome, email: corpo.email, papel: corpo.papel }, { por: conta.id });
    } else if (acao === 'apagar') contas.apagar(id, { por: conta.id });
    else if (acao === 'repor2passos') {
      if (id === conta.id) throw new Erro('Não podes repor os teus próprios dois passos aqui.');
      contas.repor2passos(id);
    } else if (acao === 'terminarSessoes') { if (!contas.obter(id)) throw new Erro('Conta desconhecida.'); contas.terminarSessoes(id, id === conta.id ? conta.sessao : null); }
    else if (acao === 'codigoSenha') codigoSenha = contas.novoCodigoSenha(id, conta.id);
    else throw new Erro('Ação desconhecida.');
    registar('conta-' + acao, { conta: id, por: conta.id, ip, ...(corpo.papel && PAPEIS[corpo.papel] ? { papel: corpo.papel } : {}) });
    return { metodo: metodo(), contas: contas.listar(), ...(codigoSenha ? { codigoSenha } : {}) };
  }, sa);

  app.rota('GET', 'conta/registo', () => registar.ultimos(200), sa);
}

export { pode };
