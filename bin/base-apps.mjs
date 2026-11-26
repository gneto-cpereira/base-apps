#!/usr/bin/env node
// Linha de comandos da base-apps. Numa app: npx base-apps <comando>. No servidor:
//   ssh -t gneto-server docker exec -it <nome> npx base-apps <comando>
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerAppEnv } from '../lib/util.mjs';
import { abrirBd, copiarBd } from '../lib/bd.mjs';
import { criarRegisto } from '../lib/registo.mjs';
import { criarEmail, normalizarEmail, emailValido } from '../lib/email.mjs';
import { criarContas } from '../lib/contas.mjs';
import { VERSAO_BASE, estadoVersao } from '../lib/versao.mjs';
import { novaChaveCifra } from '../lib/cripto.mjs';

const BASE = join(dirname(fileURLToPath(import.meta.url)), '..');
const INFRA = ['Dockerfile', 'arranque.sh', 'dev-acordar.sh', 'copia-dados.sh'];
const [cmd, ...args] = process.argv.slice(2);
const SIM_NAO = ['json', 'atualizar'];
const opcoes = {}, posicionais = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (!a.startsWith('--')) posicionais.push(a);
  else if (SIM_NAO.includes(a.slice(2))) opcoes[a.slice(2)] = true;
  else opcoes[a.slice(2)] = args[++i];
}
const opcao = (nome, def) => opcoes[nome] ?? def;
const tem = (nome) => opcoes[nome] === true;
const sair = (msg, codigo = 1) => { console.error(msg); process.exit(codigo); };

const AJUDA = `base-apps ${VERSAO_BASE}

Criar e manter apps:
  nova-app <nome> [--titulo "Nome Bonito"] [--porta 8092] [--dev-dados copia|partilhados] [--pasta <destino>]
  versao [--json]              versão da base que esta app usa, a instalada e a mais recente no GitHub
  infra [--atualizar]          compara os scripts do servidor/ com os da base (e copia-os de novo)
  chave-cifra                  gera uma chave para cifrar dados (vai para ~/<nome>/segredos.env, nunca para o git)
  copiar-dados <origem> <dest> copia a pasta de dados (as bases SQLite com VACUUM INTO); usado pelas cópias

Contas (na pasta da app; no servidor dentro do contentor):
  listar                       contas e como se entra
  superadmin <id> [email] [--nome "Nome"]  cria ou promove o superadmin
  codigo-senha <id>            código (30 min) para a pessoa escolher a palavra-passe
  email                        configura o Gmail que envia os códigos (ver docs/EMAIL.md)
  testar-email <destino>       envia um email de teste
  desligar-email               volta a entrar com palavra-passe
  emergencia <id>              código de 8 dígitos (15 min) para entrar se o email falhar
  repor-2passos <id>           desliga a app de autenticação de alguém (perdeu o telemóvel)
  terminar-sessoes <id>        fecha todas as sessões de alguém
  registo [n]                  últimos eventos de segurança`;

// ---------- Perguntas no terminal (texto escondido para palavras-passe) ----------
let resto = '';
function perguntar(pergunta, escondido = false) {
  return new Promise((ok) => {
    const { stdin, stdout } = process;
    stdout.write(pergunta);
    if (!stdin.isTTY || !escondido) {
      const linha = () => { const i = resto.indexOf('\n'); if (i < 0) return false; ok(resto.slice(0, i).replace(/\r$/, '')); resto = resto.slice(i + 1); return true; };
      if (linha()) return;
      stdin.setEncoding('utf8');
      stdin.on('data', function ler(d) { resto += d; if (linha()) { stdin.off('data', ler); stdin.pause(); } });
      stdin.resume(); return;
    }
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    let s = '';
    const tecla = (c) => {
      if (c === '\r' || c === '\n' || c === '\u0004') { stdin.setRawMode(false); stdin.pause(); stdin.off('data', tecla); stdout.write('\n'); ok(s); }
      else if (c === '\u0003') { stdout.write('\n'); process.exit(1); }
      else if (c === '\u007f' || c === '\b') s = s.slice(0, -1);
      else s += c;
    };
    stdin.on('data', tecla);
  });
}

// ---------- Contas: abre a base de dados da app desta pasta ----------
function abrirApp() {
  const env = lerAppEnv(process.cwd());
  if (!env.NOME) sair('Não encontrei servidor/app.env: corre este comando na pasta da app.');
  const dados = resolve(process.env.DADOS || 'dados');
  const bd = abrirBd(join(dados, 'app.db'));
  const registar = criarRegisto(bd);
  const email = criarEmail(bd, env.TITULO || env.NOME);
  const contas = criarContas({ bd, registar, proibidas: [env.NOME, env.TITULO] });
  return { env, dados, bd, registar, email, contas };
}
const idDe = (x) => String(x || '').trim().toLowerCase();
function tentar(fn) { try { return fn(); } catch (e) { sair(e.message); } }

// ---------- Ficheiros ----------
function copiarPasta(origem, destino, trocar) {
  mkdirSync(destino, { recursive: true });
  for (const n of readdirSync(origem)) {
    const o = join(origem, n), d = join(destino, n.replace(/^_/, '.')); // _gitignore → .gitignore (o npm não publica .gitignore)
    if (statSync(o).isDirectory()) copiarPasta(o, d, trocar);
    else if (/\.(png|jpg|webp|ico)$/.test(n)) copyFileSync(o, d);
    else writeFileSync(d, trocar(readFileSync(o, 'utf8')));
  }
}
const igual = (a, b) => { try { return readFileSync(a, 'utf8').replace(/\r\n/g, '\n') === readFileSync(b, 'utf8').replace(/\r\n/g, '\n'); } catch { return false; } };

switch (cmd) {
  case 'nova-app': {
    const nome = posicionais[0];
    if (!nome || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(nome)) sair('Uso: nova-app <nome> (minúsculas, números e hífen; ex.: grao-a-grao)');
    const titulo = opcao('titulo', nome.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()));
    const porta = Number(opcao('porta', '8092'));
    const devDados = opcao('dev-dados', 'copia');
    if (!['copia', 'partilhados'].includes(devDados)) sair('--dev-dados é "copia" ou "partilhados".');
    const destino = resolve(opcao('pasta', nome));
    if (existsSync(destino) && readdirSync(destino).length) sair(`A pasta ${destino} já existe e não está vazia.`);
    const trocar = (t) => t.replaceAll('{{NOME}}', nome).replaceAll('{{TITULO}}', titulo).replaceAll('{{PORTA}}', String(porta))
      .replaceAll('{{DEV_DADOS}}', devDados).replaceAll('{{PASTA_DADOS_DEV}}', devDados === 'copia' ? 'dados-dev' : 'dados')
      .replaceAll('{{VERSAO_BASE}}', VERSAO_BASE).replaceAll('{{DATA}}', new Date().toISOString().slice(0, 10));
    copiarPasta(join(BASE, 'modelos', 'app-nova'), destino, trocar);
    for (const f of INFRA) copyFileSync(join(BASE, 'infra', f), join(destino, 'servidor', f));
    console.log(`App "${titulo}" criada em ${destino}.

Próximos passos (ver o README.md da app):
  cd "${relative(process.cwd(), destino) || '.'}"
  git init -b main && git add -A && git commit -m "App nova a partir da base-apps ${VERSAO_BASE}"
  npm install
  npx base-apps superadmin <o-teu-id>      # e depois: npm start  →  http://localhost:${porta}
Porta ${porta}: confirma em docs/NORMAS.md (base-apps) que não está ocupada por outra app.`);
    break;
  }

  case 'versao': {
    const r = estadoVersao(process.cwd());
    if (tem('json')) { console.log(JSON.stringify(r)); break; }
    console.log(`App: ${r.app || '?'}\nbase-apps declarada: ${r.declarada || '—'}\ninstalada: ${r.instalada || '—'}\nmais recente no GitHub: ${r.ultima || '—'}`);
    if (r.erro) console.log(r.erro);
    else if (r.desatualizada) console.log(`Desatualizada (${r.salto}). Vê o CHANGELOG da base antes de atualizar${r.salto === 'major' ? ': uma versão major obriga a mexer na app' : ''}.`);
    else if (r.desatualizada === false) console.log('Em dia.');
    if (r.instalada && r.declarada && `v${r.instalada}` !== r.declarada) console.log('Atenção: a versão instalada é diferente da declarada. Corre "npm install".');
    break;
  }

  case 'infra': {
    const dif = INFRA.filter((f) => !igual(join(BASE, 'infra', f), join('servidor', f)));
    if (tem('atualizar')) {
      for (const f of dif) copyFileSync(join(BASE, 'infra', f), join('servidor', f));
      console.log(dif.length ? `Copiados da base ${VERSAO_BASE}: ${dif.join(', ')}` : 'Já estavam iguais à base.');
    } else {
      console.log(dif.length ? `Diferentes da base ${VERSAO_BASE}: ${dif.join(', ')}. Para os copiar: npx base-apps infra --atualizar` : `Iguais à base ${VERSAO_BASE}.`);
      if (dif.length) process.exitCode = 2;
    }
    break;
  }

  case 'chave-cifra':
    console.log(`CHAVE_CIFRA=${novaChaveCifra()}\n\nPõe esta linha em ~/<nome>/segredos.env no servidor (chmod 600) e guarda-a também no teu gestor de palavras-passe.\nSem ela, os dados cifrados não se conseguem ler — nem a partir das cópias.`);
    break;

  case 'copiar-dados': {
    const [origem, destino] = posicionais.map((p) => resolve(p));
    if (!origem || !destino) sair('Uso: copiar-dados <origem> <destino>');
    rmSync(destino, { recursive: true, force: true });
    const copiar = (o, d) => {
      mkdirSync(d, { recursive: true, mode: 0o700 });
      for (const n of readdirSync(o)) {
        if (/-(wal|shm|journal)$|\.tmp$/.test(n)) continue;
        const a = join(o, n), b = join(d, n);
        if (statSync(a).isDirectory()) copiar(a, b);
        else if (n.endsWith('.db')) copiarBd(a, b);
        else copyFileSync(a, b);
      }
    };
    copiar(origem, destino);
    console.log(`Dados copiados para ${destino}`);
    break;
  }

  case 'listar': {
    const { contas, email } = abrirApp();
    const l = contas.listar();
    console.log(l.length ? l.map((c) => `${c.id}  ${c.nome}  (${c.papel})  ${c.email || 'sem email'}${c.totp ? '  · 2 passos' : ''}  · ${c.sessoes} sessão(ões)`).join('\n') : 'Ainda não há contas.');
    console.log(`\nEntrada por: ${email.configurado() ? 'código por email' : 'palavra-passe (email por configurar)'}`);
    break;
  }

  case 'superadmin': {
    const { contas, email, registar } = abrirApp();
    const id = idDe(posicionais[0]), e = posicionais[1] ? normalizarEmail(posicionais[1]) : null;
    if (!id) sair('Uso: superadmin <id> [email] [--nome "Nome"]');
    if (e && !emailValido(e)) sair('Email inválido.');
    if (email.configurado() && !e && !contas.obter(id)?.email) sair('A entrada é por email: indica também o email (superadmin <id> <email>).');
    const nome = opcao('nome');
    tentar(() => (contas.obter(id) ? contas.alterar(id, { papel: 'superadmin', ...(e ? { email: e } : {}), ...(nome ? { nome } : {}) }) : contas.criar({ id, nome, email: e, papel: 'superadmin' })));
    registar('cli-superadmin', { conta: id });
    console.log(`Superadmin "${id}" guardado.`);
    if (!email.configurado() && !contas.obter(id).senha) {
      console.log(`\nCódigo para escolheres a palavra-passe: ${contas.novoCodigoSenha(id, 'cli')}\nNa app, carrega em "Tenho um código". Vale 30 minutos e uma só vez.`);
    }
    console.log('Ao entrar vais ligar a app de autenticação (obrigatória para o superadmin).');
    break;
  }

  case 'codigo-senha': {
    const { contas, registar } = abrirApp();
    const id = idDe(posicionais[0]);
    const codigo = tentar(() => contas.novoCodigoSenha(id, 'cli'));
    registar('cli-codigo-senha', { conta: id });
    console.log(`Código para ${id}: ${codigo}\nNa app, em "Tenho um código", a pessoa escolhe a palavra-passe. Vale 30 minutos e uma só vez.`);
    break;
  }

  case 'email': {
    const { email, contas, registar } = abrirApp();
    console.log('Gmail que envia os códigos de entrada. Precisa da verificação em 2 passos da Google ligada e de uma');
    console.log('"palavra-passe de app" (myaccount.google.com/apppasswords). Ver docs/EMAIL.md da base-apps.\n');
    const utilizador = await perguntar('Endereço Gmail: ');
    const senhaApp = await perguntar('Palavra-passe de app (16 letras, não aparece no ecrã): ', true);
    tentar(() => email.guardar({ utilizador, senhaApp }));
    registar('cli-email-configurado', { utilizador: normalizarEmail(utilizador) });
    const semEmail = contas.listar().filter((c) => !c.email).map((c) => c.id);
    console.log('\nGuardado. A app passa a entrar com código por email. Testa com: testar-email <o-teu-email>');
    if (semEmail.length) console.log(`Atenção: estas contas não têm email e não vão conseguir entrar até lhes pores um: ${semEmail.join(', ')}`);
    break;
  }

  case 'testar-email': {
    const { email, env } = abrirApp();
    const para = normalizarEmail(posicionais[0]);
    if (!emailValido(para)) sair('Uso: testar-email <destino>');
    try { await email.enviar({ para, assunto: `Teste ${env.TITULO || env.NOME}`, texto: `Se recebeste isto, o envio de códigos de ${env.TITULO || env.NOME} está a funcionar.\n` }); console.log(`Enviado para ${para}.`); }
    catch (e) { sair(`Falhou: ${e.message}`); }
    break;
  }

  case 'desligar-email': {
    const { email, registar } = abrirApp();
    email.desligar(); registar('cli-email-desligado');
    console.log('Email desligado: a app volta a entrar com palavra-passe. Quem não tiver palavra-passe precisa de um código (codigo-senha <id>).');
    break;
  }

  case 'emergencia': {
    const { contas, registar } = abrirApp();
    const id = idDe(posicionais[0]);
    const codigo = tentar(() => contas.novoCodigoEmergencia(id));
    registar('cli-codigo-emergencia', { conta: id });
    const c = contas.obter(id);
    console.log(`Código de emergência para ${id}: ${codigo}\nNa app, escreve o email ${c.email}, carrega em "Já tenho um código" e usa este código. Vale 15 minutos e uma só vez.${c.totp ? '\nDepois ainda é pedido o código da app de autenticação (ou um de recuperação).' : ''}`);
    break;
  }

  case 'repor-2passos': {
    const { contas, registar } = abrirApp();
    const id = idDe(posicionais[0]);
    tentar(() => contas.repor2passos(id));
    registar('cli-repor-2passos', { conta: id });
    console.log(`Dois passos desligados para ${id}. Se for superadmin, volta a ligá-los ao entrar.`);
    break;
  }

  case 'terminar-sessoes': {
    const { contas, registar } = abrirApp();
    const id = idDe(posicionais[0]);
    if (!contas.obter(id)) sair(`Não existe a conta "${id}".`);
    contas.terminarSessoes(id);
    registar('cli-terminar-sessoes', { conta: id });
    console.log(`Sessões de ${id} terminadas.`);
    break;
  }

  case 'registo': {
    const { registar } = abrirApp();
    for (const e of registar.ultimos(Number(posicionais[0]) || 50).reverse())
      console.log(`${new Date(e.em).toISOString().replace('T', ' ').slice(0, 19)}  ${e.tipo}  ${e.conta || '-'}  ${e.ip || '-'}${e.detalhe ? '  ' + JSON.stringify(e.detalhe) : ''}`);
    break;
  }

  case undefined: case 'ajuda': case '--help': case '-h':
    console.log(AJUDA);
    break;

  default:
    sair(`Comando desconhecido: ${cmd}\n\n${AJUDA}`);
}
