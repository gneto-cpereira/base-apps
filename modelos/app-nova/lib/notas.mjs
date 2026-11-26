// Exemplo de uma parte da app: tabela própria (com migrações) e rotas. Apagar ou trocar pela app a sério.
import { migrar, Erro, texto } from 'base-apps';

export function rotasNotas(app) {
  // Migrações: nunca alterar um passo antigo; acrescentar passos novos no fim.
  migrar(app.bd, 'notas', [
    `CREATE TABLE notas (id INTEGER PRIMARY KEY, conta TEXT NOT NULL REFERENCES contas(id) ON DELETE CASCADE, texto TEXT NOT NULL, em INTEGER NOT NULL)`,
  ]);
  const minhas = (id) => app.bd.prepare('SELECT id, texto, em FROM notas WHERE conta = ? ORDER BY em DESC, id DESC').all(id);

  // Todas as rotas exigem sessão completa por defeito; { papel: 'admin' } ou { publica: true } mudam isso.
  app.rota('GET', 'notas', ({ conta }) => minhas(conta.id));

  app.rota('POST', 'notas', ({ conta, corpo }) => {
    const t = texto(corpo.texto, 500);
    if (!t) throw new Erro('Escreve alguma coisa.');
    app.bd.prepare('INSERT INTO notas (conta, texto, em) VALUES (?, ?, ?)').run(conta.id, t, Date.now());
    return minhas(conta.id);
  });
}
