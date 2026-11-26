// Ecrã de entrada, igual em funcionamento em todas as apps; o aspeto é de cada app (classes ba-*, ver docs/WEB.md).
//   import { mostrarEntrada } from '/base/entrada.js';
//   mostrarEntrada(document.querySelector('#vista'), {
//     marca: '<h1>Grão a Grão</h1>',            // HTML do topo (logótipo, nome) — da própria app
//     aoEntrar: (sessao) => arrancarApp(sessao),
//   });
// Opções para a app dar a sua personalidade (sem mudar o funcionamento):
//   marca: texto HTML, ou função (passo) => HTML, com passo = 'email' | 'codigo' | 'senha' | 'definir-senha' |
//          'totp' | 'dois-passos' | 'recuperacao'
//   aoDesenhar(el, passo): chamada depois de cada ecrã ser desenhado (ex.: desenhar a mascote)
//   reagir(estado): 'a-enviar' | 'erro' | 'entrou' (ex.: a mascote pensa, fica preocupada, festeja)
// Passos: email → código (ou identificador + palavra-passe) → código da app de autenticação, se ligada →
// (superadmin sem ela) ligar a app de autenticação → códigos de recuperação → aoEntrar.
// "Tenho um código" (sem email configurado): escolher a palavra-passe com o código dado pelo superadmin.
import { pedir, obter, esc } from './api.js';
import { qrSvg } from './qr.js';

export async function mostrarEntrada(el, { marca = '', aoEntrar, aviso = '', aoDesenhar, reagir } = {}) {
  const op = { marca, aoDesenhar, reagir };
  let info = { metodo: 'senha', titulo: '' };
  try { info = await obter('conta/entrada'); } catch (e) { aviso ||= e.message; }
  const titulo = info.titulo;
  let email = '';

  const erroHTML = (t) => `<p class="ba-erro" ${t ? '' : 'hidden'} role="alert">${esc(t)}</p>`;
  const $ = (s) => el.querySelector(s);
  const mostrarErro = (t) => { const m = $('.ba-erro'); m.textContent = t; m.hidden = !t; };
  const ocupado = (form, sim) => { const b = form.querySelector('button[type=submit]'); b.disabled = sim; b.classList.toggle('ba-a-carregar', sim); };
  const forma = (passo, corpo) => {
    el.innerHTML = `<form class="ba-entrada" novalidate><div class="ba-marca">${marcaDe(marca, passo)}</div>${corpo}</form>`;
    aoDesenhar?.(el, passo);
    return $('form');
  };
  async function enviar(form, fn) {
    mostrarErro(''); ocupado(form, true); reagir?.('a-enviar');
    try { await fn(); } catch (e) { mostrarErro(e.message); ocupado(form, false); reagir?.('erro'); }
  }

  const concluir = async (d) => {
    if (d.passo === 'totp') return passoTotp(d.desafio);
    if (d.configurarTotp) return ligarDoisPassos(el, { ...op, obrigatorio: true, titulo, depois: () => aoEntrar?.({ ...d, configurarTotp: false, totp: true }) });
    reagir?.('entrou');
    aoEntrar?.(d);
  };

  function passoEmail(t = aviso) {
    const f = forma('email', `
      <p class="ba-texto">Escreve o teu email. Enviamos-te um código para entrares, sem palavras-passe.</p>
      <label class="ba-campo">Email<input name="email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" inputmode="email" required value="${esc(email)}"></label>
      ${erroHTML(t)}
      <button class="ba-botao ba-principal" type="submit">Enviar código</button>
      <div class="ba-ligacoes"><button class="ba-ligacao" type="button" data-ja-tenho>Já tenho um código</button></div>`);
    f.email.focus();
    $('[data-ja-tenho]').addEventListener('click', () => { email = f.email.value.trim(); if (!email) return mostrarErro('Escreve primeiro o teu email.'); passoCodigo(false); });
    f.addEventListener('submit', (e) => { e.preventDefault(); email = f.email.value.trim(); enviar(f, async () => { await pedir('conta/pedir-codigo', { email }); passoCodigo(true); }); });
  }

  function passoCodigo(enviado) {
    const f = forma('codigo', `
      <p class="ba-texto">${enviado ? `Se <b>${esc(email)}</b> tiver conta, acabou de receber um código de 6 dígitos. Pode demorar um minuto; vê também no spam.` : `Escreve o código que tens para <b>${esc(email)}</b>.`}</p>
      <label class="ba-campo">Código<input name="codigo" class="ba-codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="9" required></label>
      ${erroHTML('')}
      <button class="ba-botao ba-principal" type="submit">Entrar</button>
      <div class="ba-ligacoes"><button class="ba-ligacao" type="button" data-reenviar></button><button class="ba-ligacao" type="button" data-outro>Usar outro email</button></div>`);
    f.codigo.focus();
    const reenviar = $('[data-reenviar]');
    let falta = enviado ? 40 : 0;
    const contar = () => { reenviar.disabled = falta > 0; reenviar.textContent = falta > 0 ? `Reenviar código (${falta}s)` : enviado ? 'Reenviar código' : 'Enviar código'; };
    contar();
    const relogio = setInterval(() => { if (!reenviar.isConnected) return clearInterval(relogio); if (falta > 0) { falta--; contar(); } }, 1000);
    reenviar.addEventListener('click', async () => {
      try { await pedir('conta/pedir-codigo', { email }); enviado = true; falta = 40; contar(); mostrarErro(''); $('.ba-texto').innerHTML = `Enviámos um novo código para <b>${esc(email)}</b>.`; }
      catch (e) { mostrarErro(e.message); }
    });
    $('[data-outro]').addEventListener('click', () => passoEmail(''));
    f.codigo.addEventListener('input', () => { if (f.codigo.value.replace(/\D/g, '').length === 6 && enviado) f.requestSubmit(); });
    f.addEventListener('submit', (e) => { e.preventDefault(); enviar(f, async () => concluir(await pedir('conta/codigo', { email, codigo: f.codigo.value }))); });
  }

  function passoTotp(desafio) {
    const f = forma('totp', `
      <p class="ba-texto">Abre a tua app de autenticação e escreve o código de 6 dígitos de <b>${esc(titulo)}</b>.</p>
      <label class="ba-campo">Código da app<input name="codigo" class="ba-codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="12" required></label>
      ${erroHTML('')}
      <button class="ba-botao ba-principal" type="submit">Confirmar</button>
      <p class="ba-nota">Perdeste o telemóvel? Escreve um dos teus códigos de recuperação (10 letras e números).</p>`);
    f.codigo.focus();
    f.codigo.addEventListener('input', () => { if (/^\d{6}$/.test(f.codigo.value.trim())) f.requestSubmit(); });
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); mostrarErro(''); ocupado(f, true); reagir?.('a-enviar');
      try { await concluir(await pedir('conta/totp', { desafio, codigo: f.codigo.value })); }
      catch (err) {
        if (/acabou/.test(err.message)) return info.metodo === 'email' ? passoEmail(err.message) : passoSenha(err.message);
        mostrarErro(err.message); ocupado(f, false); f.codigo.select(); reagir?.('erro');
      }
    });
  }

  function passoSenha(t = aviso) {
    const f = forma('senha', `
      <label class="ba-campo">Utilizador ou email<input name="nome" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
      <label class="ba-campo">Palavra-passe<input name="senha" type="password" autocomplete="current-password" required></label>
      ${erroHTML(t)}
      <button class="ba-botao ba-principal" type="submit">Entrar</button>
      <div class="ba-ligacoes"><button class="ba-ligacao" type="button" data-codigo>Tenho um código</button></div>`);
    f.nome.focus();
    $('[data-codigo]').addEventListener('click', () => passoDefinirSenha());
    f.addEventListener('submit', (e) => { e.preventDefault(); enviar(f, async () => concluir(await pedir('conta/entrar', { nome: f.nome.value, senha: f.senha.value }))); });
  }

  // Conta nova ou palavra-passe esquecida: o superadmin dá um código de 10 letras (vale 30 minutos)
  function passoDefinirSenha() {
    const f = forma('definir-senha', `
      <p class="ba-texto">Escreve o código que te deram e escolhe a tua palavra-passe: pelo menos 12 caracteres. Uma frase curta é fácil de lembrar.</p>
      <label class="ba-campo">Código<input name="codigo" class="ba-codigo" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="14" required></label>
      <label class="ba-campo">Palavra-passe nova<input name="senha" type="password" autocomplete="new-password" minlength="12" required></label>
      <label class="ba-campo">Repete a palavra-passe<input name="senha2" type="password" autocomplete="new-password" required></label>
      ${erroHTML('')}
      <button class="ba-botao ba-principal" type="submit">Guardar e entrar</button>
      <div class="ba-ligacoes"><button class="ba-ligacao" type="button" data-voltar>Voltar</button></div>`);
    f.codigo.focus();
    $('[data-voltar]').addEventListener('click', () => passoSenha(''));
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      if (f.senha.value !== f.senha2.value) return mostrarErro('As palavras-passe não são iguais.');
      enviar(f, async () => concluir(await pedir('conta/definir-senha', { codigo: f.codigo.value, senha: f.senha.value })));
    });
  }

  if (info.metodo === 'email') passoEmail(); else passoSenha();
}

/**
 * Ligar a app de autenticação. Obrigatório para o superadmin (no fim da entrada); opcional para os outros
 * (na página da conta). Termina em `depois()`.
 */
export async function ligarDoisPassos(el, { obrigatorio = false, marca = '', titulo = '', depois, aoDesenhar, reagir } = {}) {
  let d;
  try { d = await pedir('conta/totp/iniciar'); } catch (e) { if (!e.sessao) el.innerHTML = `<p class="ba-erro">${esc(e.message)}</p>`; return; }
  const grupos = d.segredo.match(/.{1,4}/g).join(' ');
  el.innerHTML = `<div class="ba-dois-passos">
    ${obrigatorio ? `<div class="ba-marca">${marcaDe(marca, 'dois-passos')}</div><h2 class="ba-titulo">Proteger a conta</h2><p class="ba-texto">Como superadmin, a tua conta precisa de um segundo passo: um código que muda a cada 30 segundos numa app do telemóvel. Só tens de fazer isto uma vez.</p>` : ''}
    <ol class="ba-passos">
      <li><b>Instala uma app de autenticação</b><span class="ba-nota">Google Authenticator, Microsoft Authenticator, Aegis (Android) ou 2FAS. Se já tens uma, usa essa.</span></li>
      <li><b>Adiciona ${esc(titulo || 'esta app')}</b><span class="ba-nota">Na app de autenticação, lê este QR code com a câmara. Se estás no telemóvel, carrega no botão. Também podes escolher "introduzir chave" e escrever a chave.</span>
        <div class="ba-qr">${qrSvg(d.url, { titulo: 'QR code para a app de autenticação' })}</div>
        <a class="ba-botao" href="${esc(d.url)}">Abrir na app de autenticação</a>
        <div class="ba-chave"><code>${grupos}</code><button class="ba-botao ba-pequeno" type="button" data-copiar>Copiar</button></div></li>
      <li><b>Escreve o código que aparece</b>
        <form class="ba-linha-form"><input name="codigo" class="ba-codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000000" required><button class="ba-botao ba-principal" type="submit">Ativar</button></form>
        <p class="ba-erro" hidden role="alert"></p></li>
    </ol>
    ${obrigatorio ? '<div class="ba-ligacoes"><button class="ba-ligacao" type="button" data-sair>Sair</button></div>' : ''}
  </div>`;
  aoDesenhar?.(el, 'dois-passos');
  const $ = (s) => el.querySelector(s);
  $('[data-copiar]').addEventListener('click', (e) => copiar(d.segredo, e.target, $('.ba-chave code')));
  $('[data-sair]')?.addEventListener('click', async () => { try { await pedir('conta/sair'); } catch {} location.reload(); });
  const f = $('form');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const m = $('.ba-erro'); m.hidden = true; reagir?.('a-enviar');
    try { const { recuperacao } = await pedir('conta/totp/ativar', { codigo: f.codigo.value }); mostrarRecuperacao(el, recuperacao, depois, { marca: obrigatorio ? marca : '', aoDesenhar, reagir }); }
    catch (err) { if (!err.sessao) { m.textContent = err.message; m.hidden = false; reagir?.('erro'); } }
  });
}

function mostrarRecuperacao(el, codigos, continuar, { marca = '', aoDesenhar, reagir } = {}) {
  const texto = codigos.join('\n');
  el.innerHTML = `<div class="ba-dois-passos">
    ${marca ? `<div class="ba-marca">${marcaDe(marca, 'recuperacao')}</div>` : ''}
    <h2 class="ba-titulo">Verificação em dois passos ligada</h2>
    <p class="ba-texto">Guarda estes <b>códigos de recuperação</b> num sítio seguro (gestor de palavras-passe, papel na gaveta…). Cada um serve <b>uma vez</b>, se perderes o telemóvel. Não voltam a ser mostrados.</p>
    <pre class="ba-recuperacao">${texto}</pre>
    <div class="ba-ligacoes"><button class="ba-botao" type="button" data-copiar>Copiar códigos</button></div>
    <label class="ba-confirmar"><input type="checkbox" data-guardei> Guardei os códigos</label>
    <button class="ba-botao ba-principal" type="button" data-continuar disabled>Continuar</button>
  </div>`;
  aoDesenhar?.(el, 'recuperacao');
  reagir?.('entrou');
  const $ = (s) => el.querySelector(s);
  $('[data-copiar]').addEventListener('click', (e) => copiar(texto, e.target, $('.ba-recuperacao')));
  $('[data-guardei]').addEventListener('change', (e) => { $('[data-continuar]').disabled = !e.target.checked; });
  $('[data-continuar]').addEventListener('click', () => continuar?.());
}

export async function copiar(texto, botao, alvo) {
  try { await navigator.clipboard.writeText(texto); botao.textContent = 'Copiado ✓'; }
  catch { getSelection().selectAllChildren(alvo); }
}

const marcaDe = (marca, passo) => (typeof marca === 'function' ? marca(passo) : marca);
