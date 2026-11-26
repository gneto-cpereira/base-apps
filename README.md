# base-apps

Base comum das apps do gneto-server (Elmer, Grão a Grão e as que vierem): **entrada e segurança**, **servidor**,
**infraestrutura** (contentores main/dev, atualização pelo GitHub, cópias diárias), **normas** e o **modelo de app nova**.

Cada app tem o seu aspeto, mas todas **funcionam e se organizam da mesma maneira**.
Node 24, **sem dependências** (só `node:http`, `node:crypto`, `node:sqlite`, `node:test`).

## O que dá a uma app

| | |
|---|---|
| **Entrada** | código de 6 dígitos por email (Gmail grátis) ou identificador + palavra-passe; app de autenticação (obrigatória para o superadmin) com códigos de recuperação; códigos para escolher a palavra-passe; código de emergência |
| **Segurança** | sessões só como hash em cookie `__Host-`, limites de tentativas com bloqueios que crescem, CSRF, CSP e restantes cabeçalhos, tempos limite, registo de segurança, cifra AES-256-GCM opcional |
| **Servidor** | `criarApp()`: rotas `/api/*` protegidas por defeito, ficheiros estáticos seguros, SQLite com migrações |
| **Ecrãs** | entrada, conta (sessões, dois passos, palavra-passe) e administração (contas, registo, interruptor dev), com o estilo da app |
| **Infraestrutura** | Dockerfile, `arranque.sh` (git pull de 5 em 5 min), `dev-acordar.sh` (dev a dormir sem novidades), `copia-dados.sh` (30 dias) |
| **Linha de comandos** | `npx base-apps nova-app`, `versao`, `infra`, contas (`superadmin`, `email`, `emergencia`…) |
| **Normas** | [docs/NORMAS.md](docs/NORMAS.md), [docs/GIT.md](docs/GIT.md), [docs/SEGURANCA.md](docs/SEGURANCA.md), [docs/LISTA-SEGURANCA.md](docs/LISTA-SEGURANCA.md), [docs/WEB.md](docs/WEB.md), [docs/EMAIL.md](docs/EMAIL.md), [docs/DECISOES.md](docs/DECISOES.md), [docs/IDEIAS.md](docs/IDEIAS.md) |

## App nova

```
npx github:gneto-cpereira/base-apps#v1.1.0 nova-app a-minha-app --titulo "A Minha App" --porta 8092
cd a-minha-app
git init -b main && git config user.email 253965595+gneto-cpereira@users.noreply.github.com
npm install
npx base-apps superadmin <o-teu-id>     # dá um código: na app, "Tenho um código"
npm start                               # http://localhost:8092
```

Fica com: `CLAUDE.md` (regras para o Claude), `servidor.mjs` + `lib/` (um exemplo de notas para trocar),
`web/` (página com entrada, conta e administração), `servidor/` (contentores, scripts, instruções do servidor)
e `test/`. Ver [docs/NORMAS.md](docs/NORMAS.md).

(Antes de o repositório estar no GitHub: `node <caminho>/base-apps/bin/base-apps.mjs nova-app …` e
`npm install --no-save <caminho>/base-apps`.)

## Usar numa app

```json
"dependencies": { "base-apps": "github:gneto-cpereira/base-apps#v1.1.0" }
```

```js
// servidor.mjs
import { criarApp, migrar, Erro, texto } from 'base-apps';

const app = criarApp();                         // lê servidor/app.env: NOME, TITULO, PORTA
migrar(app.bd, 'livro', [`CREATE TABLE livro (id INTEGER PRIMARY KEY, conta TEXT NOT NULL, valor INTEGER)`]);

app.rota('GET', 'livro', ({ conta }) =>          // GET /api/livro, exige sessão
  app.bd.prepare('SELECT * FROM livro WHERE conta = ?').all(conta.id));

app.rota('POST', 'livro', ({ conta, corpo }) => {
  if (!Number.isInteger(corpo.valor)) throw new Erro('Valor inválido.');
  app.bd.prepare('INSERT INTO livro (conta, valor) VALUES (?, ?)').run(conta.id, corpo.valor);
  return { ok: true };
}, { papel: 'admin' });

app.iniciar();
```

Opções de `criarApp`: `privado` (RegExp de pastas de `web/` só com sessão), `limiteCorpo`, `csp`, `permissoes`,
`palavrasProibidas`, `web`, `dados`. Variáveis de ambiente: `RAMO` (`main`/`dev`/`local`), `DADOS`, `PORTA`,
`HOST`, `DEV_URL`, `BASE_EMAIL_CONSOLA=1` (emails na consola, para testes), `CHAVE_CIFRA`.

Opções de `app.rota(metodo, caminho, fn, opcoes)`: `publica`, `papel`, `sem2passos`, `limiteCorpo`.
Caminhos com `:param` (ex.: `faturas/:id`). O `fn` recebe `{ req, res, conta, corpo, params, query, ip, app }`.

No browser (`web/app.js`):

```js
import { mostrarEntrada } from '/base/entrada.js';
import { obter, pedir, sessaoAtual } from '/base/api.js';
```
Ver [docs/WEB.md](docs/WEB.md) para o aspeto (classes `ba-*`).

## Versões

Semver com etiquetas git `vX.Y.Z` e [CHANGELOG.md](CHANGELOG.md). Cada app declara a sua no `package.json`.

```
npx base-apps versao           # declarada, instalada e a mais recente no GitHub (desatualizada? patch/minor/major)
npx base-apps versao --json    # para o painel do servidor
npx base-apps infra            # scripts do servidor iguais aos desta versão da base?
```

Para lançar uma versão: ver [docs/GIT.md](docs/GIT.md#versões-da-base-apps).

## Testes

```
npm test
```
