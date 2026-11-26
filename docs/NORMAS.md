# Normas das apps

Todas as apps do gneto-server seguem estas normas, para funcionarem e se organizarem da mesma maneira.
**O aspeto é de cada app** (cores, letra, logótipo, ecrãs); **o funcionamento e a organização são comuns**.
Uma app nova criada com `npx base-apps nova-app` já as segue.

## Pastas e ficheiros de uma app

```
<app>/
  CLAUDE.md            como o Claude trabalha nesta app (do modelo; regras comuns + o que é próprio da app)
  README.md            o que é a app e como se corre no PC
  CHANGELOG.md         o que mudou, por versão da app
  package.json         nome = NOME da app; dependência "base-apps": "github:gneto-cpereira/base-apps#vX.Y.Z"
  servidor.mjs         arranque do servidor: criarApp() + rotas da app (curto)
  lib/                 código do servidor da app (um ficheiro por assunto: rotas + dados desse assunto)
  web/                 o que o browser recebe (público, salvo as pastas marcadas como privadas)
    index.html         uma só página; scripts e estilos em ficheiros (a CSP proíbe JavaScript inline)
    app.js             arranque da página
    estilo.css         aspeto da app (variáveis --ba-* e classes ba-* dos ecrãs da base)
    manifest.webmanifest, icone.svg / icones/   (PWA)
  ferramentas/         scripts de linha de comandos da app (importações, geradores…), se houver
  test/                testes (node:test), *.test.mjs
  docs/                documentação extra da app, se houver (planos, desenho)
  servidor/            tudo o que é do servidor:
    app.env            identidade da app: NOME, TITULO, PORTA, DEV_DADOS (a única fonte)
    docker-compose.yml contentores main e dev
    Dockerfile, arranque.sh, dev-acordar.sh, copia-dados.sh   cópias da base (não editar; npx base-apps infra)
    LEIA-ME.md         instalação e dia a dia no servidor
    SEGURANCA.md       o que é próprio da app + revisões feitas
  dados/               só no PC, para testes (no .gitignore)
```

Regras:
- **Nomes em português**, sem acentos nos nomes de ficheiros e pastas; minúsculas e hífen (`copia-dados.sh`).
- **JavaScript em módulos** (`.mjs` no servidor, `.js` no browser), sem dependências externas salvo razão forte
  (e então registada no `CLAUDE.md` da app). Sem passo de compilação obrigatório; se a app precisar de gerar
  ficheiros, faz `npm run construir` (o arranque do contentor corre-o).
- **Uma base de dados por app**: `<DADOS>/app.db` (SQLite). As tabelas da base (contas, sessões…) e as da app
  ficam no mesmo ficheiro; as da app criam-se com `migrar(app.bd, '<assunto>', [...])`.
- **Ficheiros da app** (fotos, faturas…) ficam em `<DADOS>/ficheiros/…`, nunca no repositório.
- **Rotas da API** em `/api/<assunto>/...`; `/api/conta/...` é reservado à base.
- **Textos para as pessoas em português de Portugal**, com "tu".

## No servidor

```
~/<NOME>/repo, repo-dev, chave/, dados/, dados-dev/, copias/, segredos.env, *.log
```
- A chave de leitura do GitHub chama-se sempre `chave/deploy` (+ `chave/known_hosts`).
- Contentores: `<NOME>` (main) e `<NOME>-dev` (dev, a dormir sem novidades). Projeto Docker com o nome da app.
- A porta só escuta em `127.0.0.1`; quem lá chega é o Tailscale (`tailscale serve`). Funnel só se a app tiver de
  ser pública (hoje: só o Elmer).
- Limite de memória de 384 MB por contentor e registos do Docker limitados a 2 × 5 MB.

### Portas e horários (atualizar ao criar uma app)

| App | NOME | Porta | Tailscale | Cópia diária | Público (Funnel) |
|---|---|---|---|---|---|
| Elmer | elmer | 8090 | 443 | 04:30 | sim |
| Grão a Grão | grao-a-grao | 8091 | 8443 | 04:45 | não |
| (próxima) | — | 8092 | 8444 | 05:00 | — |

## Versões

- **A base** usa semver com etiquetas git `vX.Y.Z` e `CHANGELOG.md`:
  - patch (`1.0.1`): correções, sem mexer nas apps;
  - minor (`1.1.0`): coisas novas, compatíveis;
  - major (`2.0.0`): obriga a mexer nas apps (o CHANGELOG diz o quê).
- **Cada app** declara a versão da base que usa no `package.json` e atualiza quando quiser:
  `npx base-apps versao` diz se está desatualizada (`--json` para o painel do servidor).
- **A própria app** tem `version` no `package.json` e o seu `CHANGELOG.md`.

Mais: [GIT.md](GIT.md) (ramos e commits), [SEGURANCA.md](SEGURANCA.md), [WEB.md](WEB.md), [DECISOES.md](DECISOES.md).
