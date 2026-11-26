// Servidor de {{TITULO}}. A entrada, as contas, a segurança e o modo dev vêm da base-apps
// (ver node_modules/base-apps/README.md). Aqui só ficam as rotas da própria app (em lib/).
import { criarApp } from 'base-apps';
import { rotasNotas } from './lib/notas.mjs';

const app = criarApp({
  // privado: [/^\/ficheiros\//],   // pastas de web/ que só se veem com sessão
  // limiteCorpo: 64_000,            // bytes por pedido (16 KB por defeito)
});

rotasNotas(app);

app.iniciar();
