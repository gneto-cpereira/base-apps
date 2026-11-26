// Servidor HTTP das apps (node:http, sem dependências).
//
//   import { criarApp } from 'base-apps';
//   const app = criarApp();                        // lê servidor/app.env (NOME, TITULO, PORTA)
//   app.rota('GET', 'livro', ({ conta }) => ({ ... }));               // /api/livro, exige sessão
//   app.rota('POST', 'livro', fn, { papel: 'admin', limiteCorpo: 64_000 });
//   app.iniciar();
//
// O que a base garante a todas as apps (ver docs/SEGURANCA.md):
// - todas as rotas /api/* exigem sessão completa, salvo as marcadas { publica: true };
// - pedidos de escrita só em JSON e da própria origem (CSRF);
// - cabeçalhos de segurança (CSP sem JavaScript inline, HSTS, nosniff, frame-ancestors…) em todas as respostas;
// - ficheiros estáticos sem caminhos com "..", sem ficheiros escondidos, só GET/HEAD; pastas privadas só com sessão;
// - tempos limite contra ligações lentas de propósito e corpos de pedido limitados.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, resolve, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Erro, lerCorpo, lerCookies, ipDe, agenteDe, lerAppEnv, MINUTO } from './util.mjs';
import { abrirBd } from './bd.mjs';
import { criarRegisto } from './registo.mjs';
import { criarLimites, mensagemEspera } from './limites.mjs';
import { criarEmail } from './email.mjs';
import { criarContas, falta2passos, PAPEIS } from './contas.mjs';
import { registarRotasConta } from './entrada.mjs';
import { criarDev } from './dev.mjs';

const WEB_BASE = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');

export const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf', '.woff2': 'font/woff2',
};

export const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

export function criarApp(op = {}) {
  const raiz = resolve(op.raiz || process.cwd());
  const env = lerAppEnv(raiz);
  const nome = op.nome || env.NOME;
  if (!nome || !/^[a-z0-9-]{2,40}$/.test(nome)) throw new Error('Falta o NOME da app (servidor/app.env), só minúsculas, números e hífen.');
  const titulo = op.titulo || env.TITULO || nome;
  const porta = Number(op.porta ?? process.env.PORTA ?? env.PORTA ?? 8080);
  const host = op.host || process.env.HOST || '0.0.0.0';
  const ramo = op.ramo || process.env.RAMO || 'local'; // main | dev | local (no PC)
  const dados = resolve(op.dados || process.env.DADOS || join(raiz, 'dados'));
  const web = resolve(raiz, op.web || 'web');
  const privado = op.privado || [];         // lista de RegExp de caminhos estáticos que exigem sessão
  const limiteCorpo = op.limiteCorpo || 16_000;

  const bd = op.bd || abrirBd(join(dados, 'app.db'));
  const registar = criarRegisto(bd);
  const limites = criarLimites(bd);
  const email = criarEmail(bd, titulo);
  const contas = criarContas({ bd, registar, proibidas: [nome, titulo, ...(op.palavrasProibidas || [])] });

  const CABECALHOS = {
    'Content-Security-Policy': op.csp || CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': op.permissoes || 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    ...(ramo !== 'local' ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
  };

  // Cookies: __Host- (Secure, Path=/, sem Domain) no servidor; o dev tem o seu, para não estragar a sessão do main,
  // mas aceita também o do main. No PC (http://localhost) o cookie não pode ser Secure nem __Host-.
  const COOKIE = ramo === 'main' ? `__Host-${nome}` : ramo === 'dev' ? `__Host-${nome}-dev` : `${nome}_sessao`;
  const COOKIES_ACEITES = ramo === 'dev' ? [COOKIE, `__Host-${nome}`] : [COOKIE];
  const seguro = ramo !== 'local';
  const cookieSessao = (token, maxAge = 400 * 24 * 3600) => // o cookie dura muito; quem decide a expiração é o servidor
    `${COOKIE}=${token}; Path=/; ${seguro ? 'Secure; ' : ''}HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
  const apagarCookie = () => cookieSessao('', 0);

  function json(res, estado, dados, extra = {}) {
    if (res.headersSent) return;
    res.writeHead(estado, { ...CABECALHOS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
    res.end(JSON.stringify(dados));
  }
  const vazio = (res, estado, extra = {}) => { if (!res.headersSent) { res.writeHead(estado, { ...CABECALHOS, ...extra }); res.end(); } };

  /** Conta da sessão do pedido (com .sessao), ou null. */
  function contaDe(req) {
    if (req._conta !== undefined) return req._conta;
    const ck = lerCookies(req);
    let c = null;
    for (const nomeCookie of COOKIES_ACEITES) if (!c && ck[nomeCookie]) c = contas.sessaoDe(ck[nomeCookie], { ip: ipDe(req) });
    return (req._conta = c);
  }

  // ---------- Rotas ----------
  const rotas = [];
  /**
   * Regista uma rota da API em /api/<caminho>. Segmentos ":nome" viram params. Opções:
   *   publica: true            não precisa de sessão
   *   papel: 'admin'           papel mínimo (user < admin < superadmin)
   *   sem2passos: true         aceita a sessão do superadmin que ainda não ligou a app de autenticação
   *   limiteCorpo: n           bytes (16 KB por defeito)
   * O handler recebe { req, res, conta, corpo, params, query, ip, app } e devolve os dados (JSON, estado 200)
   * ou lança new Erro(mensagem, estado). Se responder ele próprio (res.end), não devolve nada.
   */
  function rota(metodo, caminho, fn, opcoes = {}) {
    rotas.push({ metodo: metodo.toUpperCase(), partes: caminho.replace(/^\/+|\/+$/g, '').split('/'), fn, opcoes });
  }
  function encontrar(metodo, caminho) {
    const partes = caminho.replace(/\/+$/, '').split('/');
    let existe = false;
    for (const r of rotas) {
      if (r.partes.length !== partes.length) continue;
      const params = {};
      if (!r.partes.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = partes[i]), partes[i] !== '') : p === partes[i]))) continue;
      existe = true;
      if (r.metodo === metodo || (metodo === 'HEAD' && r.metodo === 'GET')) return { r, params };
    }
    return existe ? 'metodo' : null;
  }

  async function api(req, res, caminho, url) {
    const M = req.method;
    if (M !== 'GET' && M !== 'HEAD') {
      // Proteção CSRF: escritas só em JSON e vindas da própria app
      const site = req.headers['sec-fetch-site'], origem = req.headers.origin;
      if ((site && site !== 'same-origin' && site !== 'none') || (origem && origem !== `https://${req.headers.host}` && origem !== `http://${req.headers.host}`))
        throw new Erro('Pedido de outra origem recusado.', 403);
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new Erro('Só JSON.', 415);
    }
    const achou = encontrar(M, caminho);
    if (!achou) throw new Erro('Não encontrado.', 404);
    if (achou === 'metodo') throw new Erro('Método não permitido.', 405);
    const { r, params } = achou;
    const conta = contaDe(req);
    if (!r.opcoes.publica) {
      if (!conta) {
        const tinha = COOKIES_ACEITES.some((c) => lerCookies(req)[c]);
        throw new Erro('É preciso entrar.', 401, tinha ? { 'Set-Cookie': apagarCookie() } : {});
      }
      if (falta2passos(conta) && !r.opcoes.sem2passos) throw new Erro('Ativa primeiro a verificação em dois passos.', 403);
      if (r.opcoes.papel && (PAPEIS[conta.papel] || 0) < PAPEIS[r.opcoes.papel]) throw new Erro('Não tens permissão para isto.', 403);
    }
    const corpo = M === 'GET' || M === 'HEAD' ? {} : await lerCorpo(req, r.opcoes.limiteCorpo || limiteCorpo);
    const resultado = await r.fn({ req, res, conta, corpo, params, query: url.searchParams, ip: ipDe(req), app });
    if (!res.headersSent) json(res, 200, resultado ?? {});
  }

  // ---------- Ficheiros estáticos ----------
  async function ficheiro(req, res, caminho) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return vazio(res, 405, { Allow: 'GET, HEAD' });
    let pasta = web;
    if (caminho.startsWith('/base/')) { pasta = WEB_BASE; caminho = caminho.slice(5); }
    const ehPrivado = privado.some((re) => re.test(caminho));
    if (ehPrivado) { const c = contaDe(req); if (!c || falta2passos(c)) throw new Erro('É preciso entrar.', 401); }
    if (caminho.endsWith('/')) caminho += 'index.html';
    if (caminho.split('/').some((p) => p.startsWith('.'))) return vazio(res, 404);
    const f = normalize(join(pasta, caminho));
    if (!f.startsWith(pasta + sep)) return vazio(res, 404);
    let info;
    try { info = await stat(f); } catch { info = null; }
    if (!info?.isFile()) { res.writeHead(404, { ...CABECALHOS, 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Não encontrado'); }
    const corpo = await readFile(f);
    const semCache = /\.(html|json|js|mjs|css|webmanifest)$/.test(f);
    res.writeHead(200, {
      ...CABECALHOS, 'Content-Type': TIPOS[extname(f).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': semCache ? 'no-cache' : ehPrivado ? 'private, max-age=3600' : 'max-age=3600',
    });
    res.end(req.method === 'HEAD' ? undefined : corpo);
  }

  const dev = criarDev({ nome, ramo, devUrl: op.devUrl ?? process.env.DEV_URL ?? '', contaDe, CABECALHOS });

  const servidor = http.createServer(async (req, res) => {
    try {
      let url, caminho;
      try { url = new URL(req.url, 'http://x'); caminho = decodeURIComponent(url.pathname); } catch { return vazio(res, 400); }
      if (caminho.includes('\0') || caminho.includes('\\')) return vazio(res, 400);
      if (await dev.deveEncaminhar(req, caminho)) return dev.encaminhar(req, res);
      if (caminho.startsWith('/api/')) return await api(req, res, caminho.slice(5), url);
      return await ficheiro(req, res, caminho);
    } catch (e) {
      if (e instanceof Erro) return json(res, e.estado, { erro: e.message }, e.cabecalhos);
      console.error(`${new Date().toISOString()} erro ${req.method} ${req.url}:`, e);
      json(res, 500, { erro: 'Erro no servidor.' });
    }
  });
  // Tempos limite contra ligações lentas de propósito
  servidor.headersTimeout = 10_000;
  servidor.requestTimeout = 30_000;
  servidor.keepAliveTimeout = 5_000;
  servidor.maxHeadersCount = 60;

  const limpeza = setInterval(() => { try { contas.limparExpiradas(); } catch {} }, 10 * MINUTO);
  limpeza.unref();

  const app = {
    nome, titulo, ramo, raiz, dados, web, bd, contas, email, registar, limites, dev, servidor,
    cookie: COOKIE, cookieSessao, apagarCookie, json, contaDe, rota, mensagemEspera,
    iniciar(cb) {
      return new Promise((ok) => servidor.listen(porta, host, () => {
        const n = bd.prepare('SELECT count(*) AS n FROM contas').get().n;
        const em = email.config();
        if (!op.silencio) {
          console.log(`${titulo} (${ramo}) em http://${host === '0.0.0.0' ? 'localhost' : host}:${servidor.address().port} · dados em ${dados} · ${n} conta(s) · entrada por ${em ? (em.consola ? 'email (consola)' : 'email') : 'palavra-passe'}`);
          if (!n) console.log('Ainda não há contas. Cria o superadmin: npx base-apps superadmin <id> <email>');
        }
        cb?.(app); ok(app);
      }));
    },
    parar() { clearInterval(limpeza); limites.parar(); return new Promise((ok) => servidor.close(() => { try { bd.close(); } catch {} ok(); })); },
  };

  registarRotasConta(app);
  dev.registarRotas(app);
  return app;
}
