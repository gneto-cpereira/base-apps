// Versão de testes (dev). No servidor, cada app tem dois contentores: <nome> (ramo main, o de toda a gente) e
// <nome>-dev (ramo dev), que só está ligado quando o ramo dev tem novidades (infra/dev-acordar.sh, no cron).
// Com DEV_URL definido (contentor main), um superadmin com o interruptor "dev" ligado (cookie <nome>_ramo=dev)
// é encaminhado para o contentor dev. Rotas: GET/POST /api/conta/ramo.
import http from 'node:http';
import { lerCookies, ipDe, Erro } from './util.mjs';
import { pode } from './contas.mjs';

export function criarDev({ nome, ramo, devUrl, contaDe, CABECALHOS }) {
  const COOKIE_RAMO = `${nome}_ramo`;
  const ativo = ramo === 'main' && !!devUrl;
  let visto = { em: 0, ok: false };

  async function acordado() {
    if (!ativo) return false;
    if (Date.now() - visto.em < 15_000) return visto.ok;
    let ok = false;
    try { ok = (await fetch(devUrl + '/api/conta/entrada', { signal: AbortSignal.timeout(1500) })).ok; } catch {}
    visto = { em: Date.now(), ok };
    return ok;
  }

  async function deveEncaminhar(req, caminho) {
    if (!ativo || caminho === '/api/conta/ramo' || lerCookies(req)[COOKIE_RAMO] !== 'dev') return false;
    return pode(contaDe(req), 'superadmin') && (await acordado());
  }

  function encaminhar(req, res) {
    const alvo = new URL(devUrl);
    // o caminho vai tal e qual, mas o anfitrião é sempre o do dev (mesmo com caminhos como //outro-site)
    const headers = { ...req.headers, 'x-forwarded-for': ipDe(req) };
    const p = http.request({ hostname: alvo.hostname, port: alvo.port || 80, method: req.method, path: req.url.startsWith('/') ? req.url : '/' + req.url, headers }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    p.on('error', () => {
      visto = { em: 0, ok: false };
      if (!res.headersSent) { res.writeHead(502, { ...CABECALHOS, 'Content-Type': 'text/plain; charset=utf-8' }); res.end('A versão de testes (dev) não está a responder. Recarrega a página.'); }
      else res.destroy();
    });
    req.pipe(p);
  }

  function registarRotas(app) {
    const estado = async (req, conta) => {
      const souSuper = pode(conta, 'superadmin');
      const pedido = souSuper && lerCookies(req)[COOKIE_RAMO] === 'dev';
      const acordado_ = souSuper && (await acordado());
      return { ramo: app.ramo, existe: ativo && souSuper, pedido, ativo: pedido && acordado_, acordado: acordado_ };
    };
    app.rota('GET', 'conta/ramo', ({ req, conta }) => estado(req, conta));
    app.rota('POST', 'conta/ramo', async ({ req, res, conta, corpo, ip }) => {
      if (!pode(conta, 'superadmin')) throw new Erro('Só o superadmin.', 403);
      if (!ativo) throw new Erro('Aqui não há versão de testes.');
      const dev = !!corpo.dev;
      app.registar('ramo', { conta: conta.id, ip, dev });
      const ck = dev ? `${COOKIE_RAMO}=dev; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${30 * 86400}` : `${COOKIE_RAMO}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
      req.headers.cookie = `${COOKIE_RAMO}=${dev ? 'dev' : ''}`; // para o estado devolvido já refletir a mudança
      app.json(res, 200, await estado(req, conta), { 'Set-Cookie': ck });
    });
  }

  return { ativo, acordado, deveEncaminhar, encaminhar, registarRotas };
}
