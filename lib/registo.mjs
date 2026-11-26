// Registo de segurança: entradas, falhas, bloqueios, códigos enviados e alterações de contas.
// Fica na base de dados (últimos 180 dias) e também sai na consola (docker compose logs).
import { DIA } from './util.mjs';

export function criarRegisto(bd) {
  const juntar = bd.prepare('INSERT INTO registo_seguranca (em, tipo, conta, ip, detalhe) VALUES (?, ?, ?, ?, ?)');
  let ultimaLimpeza = 0;
  function registar(tipo, { conta = null, ip = null, ...detalhe } = {}) {
    const em = Date.now();
    const d = Object.keys(detalhe).length ? JSON.stringify(detalhe) : null;
    console.log(`${new Date(em).toISOString()} [segurança] ${tipo} ${conta || '-'} ${ip || '-'}${d ? ' ' + d : ''}`);
    try {
      juntar.run(em, tipo, conta, ip, d);
      if (em - ultimaLimpeza > DIA) { ultimaLimpeza = em; bd.prepare('DELETE FROM registo_seguranca WHERE em < ?').run(em - 180 * DIA); }
    } catch (e) { console.error('registo de segurança falhou:', e.message); }
  }
  registar.ultimos = (n = 200) => bd.prepare('SELECT em, tipo, conta, ip, detalhe FROM registo_seguranca ORDER BY id DESC LIMIT ?').all(n)
    .map((r) => ({ ...r, detalhe: r.detalhe ? JSON.parse(r.detalhe) : null }));
  return registar;
}
