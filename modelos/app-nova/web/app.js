// {{TITULO}}: arranque da página. Entrada, conta e administração vêm da base (/base/...), com o aspeto desta app.
import { obter, pedir, esc, sessaoAtual } from '/base/api.js';
import { mostrarEntrada, ligarDoisPassos } from '/base/entrada.js';
import { mostrarConta } from '/base/conta.js';
import { mostrarUtilizadores, mostrarRegisto, mostrarInterruptorDev } from '/base/admin.js';

const vista = document.querySelector('#vista');
const topo = document.querySelector('.topo');
const MARCA = '<h1>{{TITULO}}</h1>';
let SESSAO = null;

addEventListener('ba:sessao-terminou', () => location.reload());
addEventListener('ba:dois-passos', () => ligarDoisPassos(vista, { obrigatorio: true, marca: MARCA, titulo: '{{TITULO}}', depois: () => location.reload() }));

async function arrancar() {
  SESSAO = await sessaoAtual();
  if (!SESSAO) { topo.hidden = true; return mostrarEntrada(vista, { marca: MARCA, aoEntrar: () => arrancar() }); }
  if (SESSAO.configurarTotp) return ligarDoisPassos(vista, { obrigatorio: true, marca: MARCA, titulo: '{{TITULO}}', depois: () => arrancar() });
  topo.hidden = false;
  document.querySelectorAll('[data-so]').forEach((b) => { b.hidden = SESSAO.papel !== b.dataset.so; });
  mostrarInterruptorDev(document.querySelector('#interruptor-dev'));
  ir('inicio');
}

const PAGINAS = {
  inicio: async () => {
    vista.innerHTML = `<section class="pagina"><h2>Olá, ${esc(SESSAO.nome)}!</h2>
      <form id="nova"><input name="texto" maxlength="500" placeholder="Uma nota…" required><button type="submit">Guardar</button></form>
      <ul id="notas"></ul></section>`;
    const desenhar = (l) => { document.querySelector('#notas').innerHTML = l.map((n) => `<li>${esc(n.texto)}</li>`).join(''); };
    desenhar(await obter('notas'));
    document.querySelector('#nova').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { desenhar(await pedir('notas', { texto: e.target.texto.value })); e.target.reset(); } catch (err) { alert(err.message); }
    });
  },
  conta: () => mostrarConta(vista),
  contas: () => mostrarUtilizadores(vista),
  registo: () => mostrarRegisto(vista),
};
function ir(p) { PAGINAS[p]?.(); }
document.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => ir(b.dataset.ir)));

arrancar();
