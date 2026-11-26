// Páginas do superadmin, iguais em funcionamento em todas as apps (o aspeto é de cada app).
//   import { mostrarUtilizadores, mostrarRegisto, mostrarInterruptorDev } from '/base/admin.js';
import { pedir, obter, esc, haQuanto } from './api.js';
import { copiar } from './entrada.js';

const PAPEIS = { user: 'utilizador', admin: 'administrador', superadmin: 'superadmin' };
const opcoesPapel = (atual) => Object.entries(PAPEIS).map(([k, v]) => `<option value="${k}" ${k === atual ? 'selected' : ''}>${v}</option>`).join('');

/** Gerir contas: criar, mudar nome/email/papel, código para a palavra-passe, repor dois passos, terminar sessões, apagar. */
export async function mostrarUtilizadores(el) {
  let d;
  try { d = await obter('conta/utilizadores'); } catch (e) { if (!e.sessao) el.innerHTML = `<p class="ba-erro">${esc(e.message)}</p>`; return; }
  const eu = await obter('conta/eu');

  function lista() {
    el.innerHTML = `<div class="ba-utilizadores">
      <section class="ba-cartao"><h3 class="ba-titulo">Contas</h3><div class="ba-lista">
        ${d.contas.map((c) => `<button class="ba-linha" type="button" data-conta="${esc(c.id)}">
          <span><b>${esc(c.nome)}</b>${c.id === eu.id ? ' <span class="ba-etiqueta">tu</span>' : ''}
          <span class="ba-nota">${[c.id, c.email || (d.metodo === 'email' ? 'sem email' : ''), c.vista ? 'ativo ' + haQuanto(c.vista) : 'sem sessões'].filter(Boolean).map(esc).join(' · ')}</span></span>
          <span class="ba-etiqueta ba-papel-${c.papel}">${PAPEIS[c.papel]}${c.totp ? ' · 2 passos' : ''}</span></button>`).join('')}
      </div></section>
      <section class="ba-cartao"><h3 class="ba-titulo">Nova conta</h3>
        <form class="ba-formulario" data-nova>
          <label class="ba-campo">Identificador (para entrar)<input name="ident" autocapitalize="none" spellcheck="false" pattern="[a-z0-9._\\-]{2,30}" required></label>
          <label class="ba-campo">Nome<input name="nome" maxlength="40"></label>
          <label class="ba-campo">Email${d.metodo === 'email' ? '' : ' (opcional)'}<input name="email" type="email" autocapitalize="none" ${d.metodo === 'email' ? 'required' : ''}></label>
          <label class="ba-campo">Papel<select name="papel">${opcoesPapel('user')}</select></label>
          <p class="ba-erro" hidden role="alert"></p>
          <button class="ba-botao ba-principal" type="submit">Criar</button>
        </form><div data-codigo></div></section>
    </div>`;
    el.querySelectorAll('[data-conta]').forEach((b) => b.addEventListener('click', () => ficha(d.contas.find((c) => c.id === b.dataset.conta))));
    const f = el.querySelector('[data-nova]');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const m = f.querySelector('.ba-erro'); m.hidden = true;
      try {
        d = await pedir('conta/utilizadores', { acao: 'criar', id: f.ident.value.trim().toLowerCase(), nome: f.nome.value, email: f.email.value, papel: f.papel.value });
        const codigo = d.codigoSenha; lista();
        if (codigo) mostrarCodigo(el.querySelector('[data-codigo]'), codigo, 'Dá este código à pessoa: em "Tenho um código" escolhe ela a palavra-passe. Vale 30 minutos e uma só vez.');
      } catch (err) { m.textContent = err.message; m.hidden = false; }
    });
  }

  function ficha(c) {
    const euMesmo = c.id === eu.id;
    el.innerHTML = `<div class="ba-ficha">
      <button class="ba-ligacao" type="button" data-voltar>‹ Contas</button>
      <section class="ba-cartao"><h3 class="ba-titulo">${esc(c.nome)}</h3>
        <p class="ba-nota">${esc(c.id)} · criada ${new Date(c.criada).toLocaleDateString('pt-PT')} · ${c.sessoes} sessão(ões) · ${c.totp ? 'com dois passos' : 'sem dois passos'}</p>
        <form class="ba-formulario">
          <label class="ba-campo">Nome<input name="nome" maxlength="40" value="${esc(c.nome)}"></label>
          <label class="ba-campo">Email<input name="email" type="email" autocapitalize="none" value="${esc(c.email)}"></label>
          <label class="ba-campo">Papel<select name="papel" ${euMesmo ? 'disabled' : ''}>${opcoesPapel(c.papel)}</select></label>
          <p class="ba-nota">Mudar o email ou o papel termina as sessões da pessoa.</p>
          <button class="ba-botao ba-principal" type="submit">Guardar</button>
        </form>
        <p class="ba-erro" hidden role="alert"></p>
        <div data-codigo></div>
        <div class="ba-acoes">
          ${d.metodo === 'senha' ? '<button class="ba-botao" type="button" data-acao="codigoSenha">Código para escolher a palavra-passe</button>' : ''}
          ${!euMesmo && c.totp ? '<button class="ba-botao" type="button" data-acao="repor2passos">Repor dois passos</button>' : ''}
          <button class="ba-botao" type="button" data-acao="terminarSessoes">Terminar sessões</button>
          ${euMesmo ? '' : '<button class="ba-botao ba-perigo" type="button" data-acao="apagar">Apagar conta</button>'}
        </div></section></div>`;
    const m = el.querySelector('.ba-erro');
    const fazer = async (corpo, depois) => {
      m.hidden = true;
      try { d = await pedir('conta/utilizadores', { id: c.id, ...corpo }); depois?.(d); }
      catch (err) { m.textContent = err.message; m.hidden = false; }
    };
    el.querySelector('[data-voltar]').addEventListener('click', lista);
    el.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      fazer({ acao: 'alterar', nome: f.nome.value, email: f.email.value, ...(euMesmo ? {} : { papel: f.papel.value }) }, lista);
    });
    const CONFIRMAR = { apagar: `Apagar a conta ${c.id}? Não se pode desfazer.`, repor2passos: `Desligar a app de autenticação de ${c.id}? A pessoa volta a ligá-la ao entrar.` };
    el.querySelectorAll('[data-acao]').forEach((b) => b.addEventListener('click', () => {
      const acao = b.dataset.acao;
      if (CONFIRMAR[acao] && !confirm(CONFIRMAR[acao])) return;
      fazer({ acao }, (r) => {
        if (r.codigoSenha) return mostrarCodigo(el.querySelector('[data-codigo]'), r.codigoSenha, 'Dá este código à pessoa: em "Tenho um código" escolhe uma palavra-passe nova. Vale 30 minutos e uma só vez.');
        if (acao === 'apagar') return lista();
        ficha(r.contas.find((x) => x.id === c.id));
      });
    }));
  }

  function mostrarCodigo(caixa, codigo, texto) {
    caixa.innerHTML = `<div class="ba-codigo-dado"><p class="ba-nota">${esc(texto)}</p><code>${esc(codigo)}</code> <button class="ba-botao ba-pequeno" type="button">Copiar</button></div>`;
    caixa.querySelector('button').addEventListener('click', (e) => copiar(codigo, e.target, caixa.querySelector('code')));
  }

  lista();
}

const EVENTOS = {
  entrada: 'Entrou', saida: 'Saiu', bloqueio: 'Bloqueio por tentativas', 'senha-errada': 'Palavra-passe errada',
  'conta-inexistente': 'Tentativa com conta inexistente', 'codigo-errado': 'Código de email errado', 'totp-errado': 'Código da app errado',
  'codigo-enviado': 'Código enviado por email', 'email-falhou': 'Envio de email falhou', 'limite-pedidos': 'Limite de pedidos de código',
  'codigo-pedido-email-desconhecido': 'Código pedido para email sem conta', 'codigo-recuperacao-usado': 'Usou um código de recuperação',
  'totp-ligado': 'Ligou os dois passos', 'totp-desligado': 'Desligou os dois passos', 'senha-definida': 'Escolheu a palavra-passe com código',
  'senha-alterada': 'Mudou a palavra-passe', 'sessoes-terminadas': 'Terminou sessões', 'codigo-senha-errado': 'Código de palavra-passe errado',
  ramo: 'Mudou de versão (main/dev)',
};
/** Registo de segurança (últimos 200 eventos). */
export async function mostrarRegisto(el) {
  let ev;
  try { ev = await obter('conta/registo'); } catch (e) { if (!e.sessao) el.innerHTML = `<p class="ba-erro">${esc(e.message)}</p>`; return; }
  el.innerHTML = `<div class="ba-registo ba-lista">${ev.map((e) => `<div class="ba-linha ba-ev-${esc(e.tipo)}">
    <span><b>${esc(EVENTOS[e.tipo] || e.tipo.replace(/^conta-/, 'Conta: ').replace(/^cli-/, 'Consola: '))}</b> ${esc(e.conta || '')}
    <span class="ba-nota">${new Date(e.em).toLocaleString('pt-PT')} · ${esc(e.ip || '')}${e.detalhe ? ' · ' + esc(Object.entries(e.detalhe).map(([k, v]) => `${k}: ${v}`).join(', ')) : ''}</span></span></div>`).join('') || '<p class="ba-nota">Ainda não há eventos.</p>'}</div>`;
}

/** Interruptor da versão de testes (dev), só para o superadmin e só no servidor principal. Esconde-se se não houver dev. */
export async function mostrarInterruptorDev(el) {
  let r;
  try { r = await obter('conta/ramo'); } catch { el.hidden = true; return; }
  if (r.ramo === 'dev') { el.innerHTML = '<span class="ba-etiqueta ba-dev">DEV</span>'; return; }
  if (!r.existe) { el.hidden = true; return; }
  const desenhar = () => {
    el.innerHTML = `<label class="ba-interruptor ${r.acordado ? '' : 'ba-desligado'}"><input type="checkbox" ${r.pedido ? 'checked' : ''}>
      Versão de testes (dev)<span class="ba-nota">${r.acordado ? (r.ativo ? 'Estás no dev.' : 'O dev tem novidades.') : 'O dev está a dormir: não há novidades.'}</span></label>`;
    el.querySelector('input').addEventListener('change', async (e) => {
      try { r = await pedir('conta/ramo', { dev: e.target.checked }); location.reload(); } catch { desenhar(); }
    });
  };
  desenhar();
}
