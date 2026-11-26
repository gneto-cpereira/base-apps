// Contas, papéis, palavras-passe, segundo passo (TOTP) e sessões, guardados na base de dados da app.
// Usado pelas rotas de entrada (entrada.mjs) e pela linha de comandos (bin/base-apps.mjs).
import { DIA, MINUTO, Erro } from './util.mjs';
import { hashSenha, confereSenha, problemaSenha, novoToken, hashToken, codigoNumerico, codigoLegivel, normalizarCodigo, mostrarCodigo, iguais } from './cripto.mjs';
import { novoSegredo, verificarTotp } from './totp.mjs';
import { normalizarEmail, emailValido } from './email.mjs';
import { transacao } from './bd.mjs';

export const PAPEIS = { user: 1, admin: 2, superadmin: 3 };
/** Uma sessão termina se não for usada durante isto. */
export const SEM_USO = { user: 30 * DIA, admin: 7 * DIA, superadmin: 7 * DIA };
export const VALIDADE = { codigoEmail: 10 * MINUTO, desafio: 5 * MINUTO, codigoSenha: 30 * MINUTO, emergencia: 15 * MINUTO };

/** Identificador para entrar: 2 a 30 caracteres, minúsculas, números, ponto, hífen ou _. */
export const idValido = (n) => typeof n === 'string' && /^[a-z0-9._-]{2,30}$/.test(n);
/** Nome para mostrar: letras (com acentos), números, espaços, ponto, hífen ou apóstrofo, 1 a 40. */
export function nomeLimpo(nome) {
  const n = String(nome ?? '').normalize('NFC').split(/\s+/).filter(Boolean).join(' ');
  return /^[\p{L}\p{N}][\p{L}\p{N} .'’-]{0,39}$/u.test(n) ? n : null;
}
export const falta2passos = (c) => !!c && c.papel === 'superadmin' && !c.totp;
export const pode = (c, papel) => !!c && !falta2passos(c) && (PAPEIS[c.papel] || 0) >= PAPEIS[papel];

export function criarContas({ bd, registar, proibidas = [] }) {
  const q = (sql) => bd.prepare(sql);
  const obter = (id) => q('SELECT * FROM contas WHERE id = ?').get(String(id ?? '')) || null;
  const porEmail = (email) => q('SELECT * FROM contas WHERE email = ?').get(normalizarEmail(email)) || null;
  const porIdOuEmail = (x) => { const s = String(x ?? '').trim().toLowerCase(); return obter(s) || (s.includes('@') ? porEmail(s) : null); };
  const superadmins = () => q("SELECT count(*) AS n FROM contas WHERE papel = 'superadmin'").get().n;
  const exigir = (id) => { const c = obter(id); if (!c) throw new Erro('Conta desconhecida.', 404); return c; };

  function publica(c) {
    return { id: c.id, nome: c.nome, email: c.email || '', papel: c.papel, totp: !!c.totp, configurarTotp: falta2passos(c) };
  }

  function listar() {
    return q(`SELECT c.*, count(s.hash) AS sessoes, max(s.vista) AS vista FROM contas c LEFT JOIN sessoes s ON s.conta = c.id
              GROUP BY c.id ORDER BY c.id`).all()
      .map((c) => ({ ...publica(c), criada: c.criada, sessoes: c.sessoes, vista: c.vista, temSenha: !!c.senha }));
  }

  function validarEmail(email, idAtual) {
    if (email === '' || email == null) return null;
    const e = normalizarEmail(email);
    if (!emailValido(e)) throw new Erro('Email inválido.');
    const outra = porEmail(e);
    if (outra && outra.id !== idAtual) throw new Erro('Esse email já pertence a outra conta.');
    return e;
  }

  function criar({ id, nome, email, papel = 'user' }) {
    id = String(id ?? '').trim().toLowerCase();
    if (!idValido(id)) throw new Erro('Identificador inválido: 2 a 30 caracteres, só minúsculas, números, ponto, hífen ou _.');
    if (obter(id)) throw new Erro('Já existe uma conta com esse identificador.');
    if (!PAPEIS[papel]) throw new Erro('Papel inválido.');
    const n = nome ? nomeLimpo(nome) : id;
    if (!n) throw new Erro('Nome inválido.');
    const e = validarEmail(email, id);
    q('INSERT INTO contas (id, nome, email, papel, criada) VALUES (?, ?, ?, ?, ?)').run(id, n, e, papel, Date.now());
    return obter(id);
  }

  /** Muda nome, email ou papel. Mudar o email ou o papel termina as sessões da pessoa. */
  function alterar(id, { nome, email, papel } = {}, { por } = {}) {
    const c = exigir(id);
    let terminar = false;
    transacao(bd, () => {
      if (nome !== undefined) { const n = nomeLimpo(nome); if (!n) throw new Erro('Nome inválido.'); q('UPDATE contas SET nome = ? WHERE id = ?').run(n, id); }
      if (email !== undefined) {
        const e = validarEmail(email, id);
        if (e !== (c.email || null)) { q('UPDATE contas SET email = ? WHERE id = ?').run(e, id); terminar = true; }
      }
      if (papel !== undefined && papel !== c.papel) {
        if (!PAPEIS[papel]) throw new Erro('Papel inválido.');
        if (por === id && papel !== 'superadmin' && c.papel === 'superadmin') throw new Erro('Não podes tirar a ti próprio o papel de superadmin.');
        if (c.papel === 'superadmin' && superadmins() <= 1) throw new Erro('Tem de ficar pelo menos um superadmin.');
        q('UPDATE contas SET papel = ? WHERE id = ?').run(papel, id);
        terminar = true;
      }
    });
    if (terminar) terminarSessoes(id);
    return obter(id);
  }

  function apagar(id, { por } = {}) {
    const c = exigir(id);
    if (por === id) throw new Erro('Não te podes apagar a ti próprio.');
    if (c.papel === 'superadmin' && superadmins() <= 1) throw new Erro('Tem de ficar pelo menos um superadmin.');
    q('DELETE FROM contas WHERE id = ?').run(id);
  }

  // ---------- Palavras-passe ----------
  async function conferirSenha(conta, senha) {
    const { ok, refazer } = await confereSenha(conta?.senha, senha);
    if (ok && refazer) q('UPDATE contas SET senha = ? WHERE id = ?').run(await hashSenha(senha), conta.id);
    return ok;
  }
  function validarSenha(c, senha) {
    const p = problemaSenha(senha, { nome: c.id, proibidas: [c.nome, ...proibidas] });
    if (p) throw new Erro(p);
  }
  /** Define a palavra-passe (valida as regras) e termina as outras sessões da pessoa. */
  async function definirSenha(id, senha, { exceto } = {}) {
    const c = exigir(id);
    validarSenha(c, senha);
    q('UPDATE contas SET senha = ? WHERE id = ?').run(await hashSenha(senha), id);
    terminarSessoes(id, exceto);
  }
  /** Código (30 min, uma vez) para a pessoa escolher a palavra-passe: conta nova ou palavra-passe esquecida. */
  function novoCodigoSenha(id, por = null) {
    exigir(id);
    const codigo = codigoLegivel(10);
    transacao(bd, () => {
      q('DELETE FROM codigos_senha WHERE conta = ? OR expira < ?').run(id, Date.now());
      q('INSERT INTO codigos_senha (hash, conta, expira, criado_por) VALUES (?, ?, ?, ?)').run(hashToken(codigo), id, Date.now() + VALIDADE.codigoSenha, por);
    });
    return mostrarCodigo(codigo);
  }
  /** Conta do código, sem o gastar, ou null. */
  function verCodigoSenha(codigo) {
    const r = q('SELECT conta FROM codigos_senha WHERE hash = ? AND expira > ?').get(hashToken(normalizarCodigo(codigo)), Date.now());
    return r ? obter(r.conta) : null;
  }
  /** Devolve a conta do código (e gasta-o), ou null. */
  function usarCodigoSenha(codigo) {
    const c = verCodigoSenha(codigo);
    if (c) q('DELETE FROM codigos_senha WHERE hash = ?').run(hashToken(normalizarCodigo(codigo)));
    return c;
  }

  // ---------- Código de emergência (criado na linha de comandos, se o email falhar) ----------
  function novoCodigoEmergencia(id) {
    const c = exigir(id);
    if (!c.email) throw new Erro('Essa conta não tem email.');
    const codigo = codigoNumerico(8);
    q('INSERT INTO emergencia (conta, hash, expira) VALUES (?, ?, ?) ON CONFLICT(conta) DO UPDATE SET hash = excluded.hash, expira = excluded.expira')
      .run(id, hashToken(codigo), Date.now() + VALIDADE.emergencia);
    return codigo;
  }
  function usarEmergencia(id, codigo) {
    q('DELETE FROM emergencia WHERE expira < ?').run(Date.now());
    const r = q('SELECT hash FROM emergencia WHERE conta = ?').get(id);
    if (!r || !iguais(r.hash, hashToken(codigo))) return false;
    q('DELETE FROM emergencia WHERE conta = ?').run(id);
    return true;
  }

  // ---------- Segundo passo (app de autenticação) ----------
  function iniciarTotp(id) {
    const c = exigir(id);
    if (c.totp) throw new Erro('A app de autenticação já está ligada.', 409);
    const segredo = novoSegredo();
    q('UPDATE contas SET totp_novo = ? WHERE id = ?').run(segredo, id);
    return segredo;
  }
  /** Liga o segundo passo. Devolve os 8 códigos de recuperação (só se mostram agora), ou null se o código estiver errado. */
  function ativarTotp(id, codigo, sessaoAtual) {
    const c = exigir(id);
    if (c.totp || !c.totp_novo) throw new Erro('Começa outra vez a ligar a app de autenticação.', 409);
    const passo = verificarTotp(c.totp_novo, codigo);
    if (passo < 0) return null;
    const codigos = Array.from({ length: 8 }, () => codigoLegivel(10));
    transacao(bd, () => {
      q('UPDATE contas SET totp = totp_novo, totp_novo = NULL, totp_passo = ? WHERE id = ?').run(passo, id);
      q('DELETE FROM recuperacao WHERE conta = ?').run(id);
      const ins = q('INSERT INTO recuperacao (conta, hash) VALUES (?, ?)');
      for (const k of codigos) ins.run(id, hashToken(k));
    });
    terminarSessoes(id, sessaoAtual); // as outras sessões terão de entrar com o segundo passo
    return codigos.map(mostrarCodigo);
  }
  /** Confere o código da app (ou um código de recuperação, que fica gasto). Devolve 'totp', 'recuperacao' ou null. */
  function conferirSegundoPasso(id, codigo) {
    const c = obter(id);
    if (!c?.totp) return null;
    const passo = verificarTotp(c.totp, codigo, c.totp_passo);
    if (passo >= 0) { q('UPDATE contas SET totp_passo = ? WHERE id = ?').run(passo, id); return 'totp'; }
    const k = normalizarCodigo(codigo);
    if (k.length === 10 && q('DELETE FROM recuperacao WHERE conta = ? AND hash = ?').run(id, hashToken(k)).changes) return 'recuperacao';
    // Códigos antigos do Elmer (antes da base): 10 letras/números em minúsculas, guardados como hash das minúsculas.
    if (k.length === 10 && q('DELETE FROM recuperacao WHERE conta = ? AND hash = ?').run(id, hashToken(k.toLowerCase())).changes) return 'recuperacao';
    return null;
  }
  const recuperacaoRestante = (id) => q('SELECT count(*) AS n FROM recuperacao WHERE conta = ?').get(id).n;
  function desligarTotp(id) {
    q('UPDATE contas SET totp = NULL, totp_novo = NULL, totp_passo = -1 WHERE id = ?').run(id);
    q('DELETE FROM recuperacao WHERE conta = ?').run(id);
  }
  /** Repor os dois passos (perdeu o telemóvel): desliga-os e termina as sessões. */
  function repor2passos(id) { exigir(id); desligarTotp(id); terminarSessoes(id); }

  // ---------- Sessões ----------
  /** Cria uma sessão e devolve o token (vai só para o cookie; aqui guarda-se o hash). */
  function criarSessao(id, { ip, agente } = {}) {
    const t = Date.now(), token = novoToken();
    q('INSERT INTO sessoes (hash, conta, criada, vista, ip, agente) VALUES (?, ?, ?, ?, ?, ?)').run(hashToken(token), id, t, t, ip || null, agente || null);
    return token;
  }
  /** Conta da sessão deste token (com .sessao = hash), ou null. Apaga a sessão se expirou sem uso. */
  function sessaoDe(token, { ip } = {}) {
    if (!token || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
    const h = hashToken(token);
    const s = q('SELECT * FROM sessoes WHERE hash = ?').get(h);
    if (!s) return null;
    const c = obter(s.conta), t = Date.now();
    if (!c || t - s.vista > (SEM_USO[c.papel] || SEM_USO.user)) { q('DELETE FROM sessoes WHERE hash = ?').run(h); return null; }
    if (t - s.vista > 5 * MINUTO) q('UPDATE sessoes SET vista = ?, ip = coalesce(?, ip) WHERE hash = ?').run(t, ip || null, h);
    return { ...c, sessao: h };
  }
  function terminarSessoes(id, exceto = null) {
    q('DELETE FROM sessoes WHERE conta = ? AND hash IS NOT ?').run(id, exceto);
  }
  const terminarSessao = (hash) => q('DELETE FROM sessoes WHERE hash = ?').run(hash);
  function sessoesDe(id, atual) {
    return q('SELECT * FROM sessoes WHERE conta = ? ORDER BY vista DESC').all(id)
      .map((s) => ({ id: s.hash.slice(0, 16), criada: s.criada, vista: s.vista, ip: s.ip, agente: s.agente, atual: s.hash === atual }));
  }
  function limparExpiradas() {
    const t = Date.now();
    for (const [papel, ms] of Object.entries(SEM_USO)) q('DELETE FROM sessoes WHERE vista < ? AND conta IN (SELECT id FROM contas WHERE papel = ?)').run(t - ms, papel);
    for (const tab of ['desafios', 'codigos_email', 'codigos_senha', 'emergencia']) q(`DELETE FROM ${tab} WHERE expira < ?`).run(t);
  }

  return {
    obter, porEmail, porIdOuEmail, publica, listar, criar, alterar, apagar, superadmins,
    conferirSenha, validarSenha, definirSenha, novoCodigoSenha, verCodigoSenha, usarCodigoSenha, novoCodigoEmergencia, usarEmergencia,
    iniciarTotp, ativarTotp, conferirSegundoPasso, recuperacaoRestante, desligarTotp, repor2passos,
    criarSessao, sessaoDe, terminarSessoes, terminarSessao, sessoesDe, limparExpiradas, registar,
  };
}
