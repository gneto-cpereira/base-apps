// Envio de emails (códigos de entrada) por SMTP com TLS, sem dependências. Pensado para um Gmail grátis com
// "palavra-passe de app" (ver docs/EMAIL.md). A configuração fica na base de dados da app (tabela definicoes,
// chave "email"): { utilizador, senhaApp, remetente, host?, porta? }. Sem configuração, entra-se com palavra-passe.
// BASE_EMAIL_CONSOLA=1 escreve os emails na consola em vez de os enviar (só para testes locais).
import tls from 'node:tls';
import { randomBytes } from 'node:crypto';

export const normalizarEmail = (e) => String(e ?? '').trim().toLowerCase();
export const emailValido = (e) => typeof e === 'string' && e.length <= 120 && /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(e);
/** O email do trabalho do dono nunca é usado para enviar (regra das apps). */
export const emailProibido = (e) => /@blueoasis\./i.test(String(e));

const semQuebras = (s) => String(s).replace(/[\r\n]+/g, ' ');
const cabecalhoUtf8 = (s) => `=?UTF-8?B?${Buffer.from(semQuebras(s)).toString('base64')}?=`;
const base64Linhas = (s) => Buffer.from(s).toString('base64').replace(/.{76}/g, '$&\r\n');

// Conversa SMTP mínima: EHLO, AUTH PLAIN, MAIL FROM, RCPT TO, DATA, QUIT (TLS direto na porta 465)
function smtp({ host, porta, utilizador, senha, de, para, mensagem }) {
  return new Promise((ok, falha) => {
    const s = tls.connect({ host, port: porta, servername: host, minVersion: 'TLSv1.2' });
    s.setTimeout(20000, () => { s.destroy(); falha(new Error('SMTP: tempo esgotado')); });
    s.on('error', falha);
    const passos = [
      [null, 220],
      ['EHLO base-apps', 250],
      [`AUTH PLAIN ${Buffer.from(`\0${utilizador}\0${senha}`).toString('base64')}`, 235],
      [`MAIL FROM:<${de}>`, 250],
      [`RCPT TO:<${para}>`, 250],
      ['DATA', 354],
      [mensagem.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..') + '\r\n.', 250],
      ['QUIT', 221],
    ];
    let i = 0, buf = '';
    const enviar = () => { const [cmd] = passos[i]; if (cmd) s.write(cmd + '\r\n'); };
    s.on('data', (d) => {
      buf += d.toString('utf8');
      const linhas = buf.split('\r\n');
      buf = linhas.pop();
      for (const l of linhas) {
        if (/^\d{3}-/.test(l)) continue; // resposta com várias linhas
        if (Number(l.slice(0, 3)) !== passos[i][1]) {
          s.destroy();
          return falha(new Error(`SMTP respondeu ${l.slice(0, 120)}${i === 2 ? ' (palavra-passe de app errada?)' : ''}`));
        }
        i++;
        if (i >= passos.length) { s.end(); return ok(); }
        enviar();
      }
    });
  });
}

export function criarEmail(bd, titulo) {
  const CONSOLA = process.env.BASE_EMAIL_CONSOLA === '1';
  const ler = bd.prepare("SELECT valor FROM definicoes WHERE chave = 'email'");
  const enviados = []; // só no modo consola (para os testes)

  function config() {
    let c = null;
    try { c = JSON.parse(ler.get()?.valor || 'null'); } catch {}
    if (c && emailValido(c.utilizador) && c.senhaApp) return c;
    return CONSOLA ? { consola: true, utilizador: 'app@exemplo.pt', remetente: titulo } : null;
  }

  function guardar({ utilizador, senhaApp }) {
    utilizador = normalizarEmail(utilizador);
    if (!emailValido(utilizador)) throw new Error('Endereço inválido.');
    if (emailProibido(utilizador)) throw new Error('Usa um email pessoal, não o do trabalho.');
    senhaApp = String(senhaApp || '').replace(/\s/g, '');
    if (senhaApp.length < 16) throw new Error('A palavra-passe de app tem 16 letras.');
    bd.prepare("INSERT INTO definicoes (chave, valor) VALUES ('email', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
      .run(JSON.stringify({ utilizador, senhaApp, remetente: titulo }));
  }
  const desligar = () => bd.prepare("DELETE FROM definicoes WHERE chave = 'email'").run();

  async function enviar({ para, assunto, texto }) {
    const c = config();
    if (!c) throw new Error('Email não configurado.');
    if (!emailValido(para)) throw new Error('Destinatário inválido.');
    if (c.consola) {
      enviados.push({ para, assunto, texto });
      if (process.env.BASE_EMAIL_CONSOLA_SILENCIO !== '1') console.log(`\n--- EMAIL (consola) para ${para}\nAssunto: ${assunto}\n${texto}\n---\n`);
      return;
    }
    const dominio = c.utilizador.split('@')[1];
    const mensagem = [
      `From: ${cabecalhoUtf8(c.remetente || titulo)} <${c.utilizador}>`,
      `To: <${para}>`,
      `Subject: ${cabecalhoUtf8(assunto)}`,
      `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
      `Message-ID: <${randomBytes(12).toString('hex')}@${dominio}>`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      'Auto-Submitted: auto-generated',
      '',
      base64Linhas(texto),
    ].join('\r\n');
    await smtp({ host: c.host || 'smtp.gmail.com', porta: c.porta || 465, utilizador: c.utilizador, senha: c.senhaApp, de: c.utilizador, para, mensagem });
  }

  return { config, configurado: () => !!config(), guardar, desligar, enviar, enviados };
}
