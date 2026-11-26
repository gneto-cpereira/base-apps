// Página "Conta e segurança", igual em funcionamento em todas as apps (o aspeto é de cada app).
//   import { mostrarConta } from '/base/conta.js';
//   mostrarConta(document.querySelector('#conta'));
// Mostra: quem sou e como entro; as minhas sessões (terminar uma ou todas as outras);
// app de autenticação (ligar/desligar; o superadmin não pode desligar); mudar a palavra-passe; sair.
import { pedir, obter, esc, haQuanto, dispositivo } from './api.js';
import { ligarDoisPassos } from './entrada.js';

const NOME_PAPEL = { user: 'utilizador', admin: 'administrador', superadmin: 'superadmin' };

export async function mostrarConta(el) {
  let eu;
  try { eu = await obter('conta/eu'); } catch (e) { if (!e.sessao) el.innerHTML = `<p class="ba-erro">${esc(e.message)}</p>`; return; }
  el.innerHTML = `<div class="ba-conta">
    <section class="ba-cartao"><h2 class="ba-titulo">${esc(eu.nome)}</h2>
      <p class="ba-nota">${esc(eu.id)}${eu.email ? ' · ' + esc(eu.email) : ''} · ${NOME_PAPEL[eu.papel] || eu.papel}</p>
      <p class="ba-nota">Entras com ${eu.metodo === 'email' ? 'um código enviado para o teu email' : 'a tua palavra-passe'}${eu.totp ? ' e a app de autenticação' : ''}.</p></section>
    <section class="ba-cartao" data-sessoes><h3 class="ba-titulo">Sessões abertas</h3><div class="ba-lista"></div></section>
    <section class="ba-cartao" data-2fa><h3 class="ba-titulo">Verificação em dois passos</h3><div></div></section>
    ${eu.metodo === 'senha' ? `<section class="ba-cartao" data-senha><h3 class="ba-titulo">Mudar a palavra-passe</h3>
      <form class="ba-formulario">
        <label class="ba-campo">Palavra-passe atual<input name="atual" type="password" autocomplete="current-password" required></label>
        <label class="ba-campo">Palavra-passe nova<input name="nova" type="password" autocomplete="new-password" minlength="12" required></label>
        <label class="ba-campo">Repete a nova<input name="nova2" type="password" autocomplete="new-password" required></label>
        <p class="ba-erro" hidden role="alert"></p><p class="ba-ok" hidden></p>
        <button class="ba-botao ba-principal" type="submit">Mudar</button></form></section>` : ''}
    <div class="ba-ligacoes"><button class="ba-botao" type="button" data-sair>Sair</button></div>
  </div>`;
  const $ = (s) => el.querySelector(s);
  $('[data-sair]').addEventListener('click', async () => { try { await pedir('conta/sair'); } catch {} location.reload(); });

  async function sessoes(lista) {
    lista ||= await obter('conta/sessoes').catch(() => []);
    const caixa = $('[data-sessoes] .ba-lista');
    caixa.innerHTML = lista.map((s) => `<div class="ba-linha">
        <span><b>${esc(dispositivo(s.agente))}</b>${s.atual ? ' <span class="ba-etiqueta">esta</span>' : ''}<span class="ba-nota">${esc(s.ip || '')} · ${haQuanto(s.vista)}</span></span>
        ${s.atual ? '' : `<button class="ba-botao ba-pequeno" type="button" data-terminar="${esc(s.id)}">Terminar</button>`}</div>`).join('')
      + (lista.length > 1 ? '<button class="ba-botao" type="button" data-terminar="outras">Terminar todas as outras</button>' : '');
    caixa.querySelectorAll('[data-terminar]').forEach((b) => b.addEventListener('click', async () => sessoes(await pedir('conta/sessoes', { id: b.dataset.terminar }))));
  }

  function doisPassos() {
    const caixa = $('[data-2fa] div');
    if (!eu.totp) {
      caixa.innerHTML = '<p class="ba-nota">Além do primeiro passo, pede um código de uma app do telemóvel. Protege a conta mesmo que alguém saiba o teu email ou a tua palavra-passe.</p><button class="ba-botao ba-principal" type="button" data-ligar>Ligar</button>';
      caixa.querySelector('[data-ligar]').addEventListener('click', () => ligarDoisPassos(caixa, { titulo: eu.titulo, depois: () => { eu.totp = true; doisPassos(); sessoes(); } }));
    } else if (eu.papel === 'superadmin') {
      caixa.innerHTML = '<p class="ba-nota">Ligada. O superadmin tem de a ter sempre ligada.</p>';
    } else {
      caixa.innerHTML = `<p class="ba-nota">Ligada. Para a desligar, escreve um código da app.</p>
        <form class="ba-linha-form"><input name="codigo" class="ba-codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="12" required><button class="ba-botao" type="submit">Desligar</button></form><p class="ba-erro" hidden role="alert"></p>`;
      caixa.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try { await pedir('conta/totp/desligar', { codigo: e.target.codigo.value }); eu.totp = false; doisPassos(); }
        catch (err) { const m = caixa.querySelector('.ba-erro'); m.textContent = err.message; m.hidden = false; }
      });
    }
  }

  $('[data-senha] form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, erro = f.querySelector('.ba-erro'), ok = f.querySelector('.ba-ok');
    erro.hidden = ok.hidden = true;
    if (f.nova.value !== f.nova2.value) { erro.textContent = 'As palavras-passe novas não são iguais.'; erro.hidden = false; return; }
    try { await pedir('conta/senha', { atual: f.atual.value, nova: f.nova.value }); f.reset(); ok.textContent = 'Palavra-passe mudada. As outras sessões foram terminadas.'; ok.hidden = false; sessoes(); }
    catch (err) { erro.textContent = err.message; erro.hidden = false; }
  });

  sessoes(); doisPassos();
}
