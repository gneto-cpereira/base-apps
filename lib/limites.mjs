// Limites de tentativas, guardados na base de dados (sobrevivem aos reinícios do contentor, que acontecem
// a cada novidade do GitHub).
// - Travão: cada falha conta; à 5.ª o alvo (IP, conta, email…) fica bloqueado 1 minuto, e cada novo bloqueio
//   dura o dobro, até 1 hora.
// - Janela: no máximo `max` acontecimentos em `ms` (ex.: pedidos de código por email).
import { MINUTO, HORA } from './util.mjs';

export const MAX_FALHAS = 5;

export function criarLimites(bd) {
  const obter = bd.prepare('SELECT * FROM tentativas WHERE chave = ?');
  const guardar = bd.prepare(`INSERT INTO tentativas (chave, falhas, bloqueios, ate, ultima) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(chave) DO UPDATE SET falhas = excluded.falhas, bloqueios = excluded.bloqueios, ate = excluded.ate, ultima = excluded.ultima`);
  const apagar = bd.prepare('DELETE FROM tentativas WHERE chave = ?');
  const contarJanela = bd.prepare('SELECT count(*) AS n FROM janelas WHERE chave = ? AND em > ?');
  const juntarJanela = bd.prepare('INSERT INTO janelas (chave, em) VALUES (?, ?)');

  const limpeza = setInterval(() => {
    const t = Date.now();
    bd.prepare('DELETE FROM tentativas WHERE ate < ? AND ultima < ?').run(t, t - 6 * HORA);
    bd.prepare('DELETE FROM janelas WHERE em < ?').run(t - 24 * HORA);
  }, 10 * MINUTO);
  limpeza.unref();

  return {
    /** Segundos que ainda faltam do bloqueio mais longo entre estas chaves (0 = livre). */
    espera(...chaves) {
      const t = Date.now();
      return Math.max(0, ...chaves.map((c) => { const v = obter.get(c); return v && v.ate > t ? Math.ceil((v.ate - t) / 1000) : 0; }));
    },
    /** Conta uma falha em cada chave. Devolve true se alguma ficou bloqueada agora. */
    falhou(...chaves) {
      const t = Date.now();
      let preso = false;
      for (const c of chaves) {
        const v = obter.get(c) || { falhas: 0, bloqueios: 0, ate: 0 };
        let { falhas, bloqueios, ate } = v;
        falhas++;
        if (falhas >= MAX_FALHAS) { ate = t + Math.min(HORA, MINUTO * 2 ** bloqueios); bloqueios++; falhas = 0; preso = true; }
        guardar.run(c, falhas, bloqueios, ate, t);
      }
      return preso;
    },
    limpar(...chaves) { for (const c of chaves) apagar.run(c); },
    /** Janela deslizante: regista o acontecimento e devolve true se ainda está dentro do limite. */
    dentro(chave, max, ms) {
      const t = Date.now();
      if (contarJanela.get(chave, t - ms).n >= max) return false;
      juntarJanela.run(chave, t);
      return true;
    },
    parar() { clearInterval(limpeza); },
  };
}

export const mensagemEspera = (s) => `Demasiadas tentativas. Tenta outra vez daqui a ${s > 90 ? Math.ceil(s / 60) + ' minutos' : s + ' segundos'}.`;
