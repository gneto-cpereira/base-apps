# Git: ramos, commits e versões

## Ramos

- **`main`**: a versão que toda a gente usa. O contentor `<nome>` segue-o (git pull a cada 5 minutos).
- **`dev`**: novidades por testar. O contentor `<nome>-dev` segue-o e só acorda quando o `dev` tem commits que
  o `main` não tem. O superadmin vê-o com o interruptor "Versão de testes (dev)".
- Trabalha-se no `dev`. **Só se passa para o `main` quando o dono aprovar**:
  `git checkout main && git merge --ff-only dev && git push` (o dev volta a dormir).
- Exceção: mudanças à infraestrutura do próprio dev (encaminhamento, compose, scripts) vão para o `main`,
  porque é o main que encaminha e o cron corre a partir do `repo` (main).
- Se o `dev` tiver lixo, pode refazer-se a partir do `main` (`git push --force` ao `dev`), com acordo do dono.

Na **base-apps** não há contentores: trabalha-se no `main` e cada versão leva uma etiqueta.

## Commits

- Autor: o nome do dono e o **email noreply pessoal do GitHub**
  (`253965595+gneto-cpereira@users.noreply.github.com`). **Nunca o email do trabalho.**
  Em cada repositório novo: `git config user.email 253965595+gneto-cpereira@users.noreply.github.com`.
- Mensagens em português, no imperativo ou descritivas, a dizer o quê e porquê
  (ex.: "Entrada: o código de email deixa de valer à 5.ª tentativa").
- Um commit por mudança com sentido; nada de "wip".
- **Nunca** pôr no git: palavras-passe, chaves, tokens, `segredos.env`, dados pessoais, bases de dados, cópias.
  Antes de cada commit, ver o `git diff --staged`.
- Commits e push: o Claude faz commit e push só quando o dono o autorizou para esse repositório
  (fica escrito no `CLAUDE.md` da app ou na memória). Criar repositórios no GitHub, mudar a visibilidade,
  apagar ramos ou forçar push: perguntar sempre.

## Versões de uma app

- `version` no `package.json` da app + `CHANGELOG.md` (secções `## [x.y.z] - AAAA-MM-DD`).
- Etiqueta `vX.Y.Z` quando uma versão passa para o `main`.

## Versões da base-apps

1. Atualizar `CHANGELOG.md` (secção nova no topo) e `version` no `package.json`.
2. `npm test`.
3. `git commit` e `git tag vX.Y.Z` (etiqueta anotada: `git tag -a vX.Y.Z -m "…"`).
4. `git push && git push --tags`.
5. Em cada app, quando o dono quiser: mudar `#vX.Y.Z` no `package.json`, `npm install`,
   `npx base-apps infra --atualizar`, testar no `dev`.
