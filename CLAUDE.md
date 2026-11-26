# base-apps: instruções para o Claude

Biblioteca comum das apps do gneto-server. Ler o [README.md](README.md) e as [normas](docs/NORMAS.md).

## Regras

- Português de Portugal, tratar o dono por tu. Custo zero. Servidor fraco: nada pesado.
- **Em planeamento não se constrói sem pedido explícito.**
- **Sem dependências externas.** Só módulos do Node 24.
- **Compatibilidade:** tudo o que as apps usam (exports de `lib/index.mjs`, rotas `/api/conta/*`, ficheiros
  `/base/*`, classes `ba-*`, comandos da linha de comandos, scripts de `infra/`, formato da base de dados) só
  muda de forma incompatível numa versão **major**, com o que as apps têm de fazer escrito no CHANGELOG.
- Mudanças à base de dados: **só passos novos** no fim de `ESQUEMA_BASE` (`lib/bd.mjs`), nunca alterar os antigos.
- Segurança primeiro: qualquer mudança na entrada/sessões atualiza `docs/SEGURANCA.md` e tem teste em `test/`.
- O que é diferente entre apps resolve-se aqui **uma vez**, e regista-se em `docs/DECISOES.md`.
- `npm test` tem de passar antes de cada commit.

## Git

- Ramo `main`; cada versão leva etiqueta `vX.Y.Z` e secção no CHANGELOG (ver [docs/GIT.md](docs/GIT.md)).
- Commits com o email noreply pessoal (`253965595+gneto-cpereira@users.noreply.github.com`), nunca o do trabalho.
- Criar o repositório no GitHub, mudar a visibilidade, fazer push: **perguntar primeiro**.

## Organização

```
lib/        servidor (index.mjs exporta o que as apps usam)
web/        ecrãs do browser, servidos em /base/
bin/        linha de comandos base-apps
infra/      scripts do servidor copiados para servidor/ de cada app
modelos/    app-nova (marcadores {{NOME}}, {{TITULO}}, {{PORTA}}, {{DEV_DADOS}}, {{PASTA_DADOS_DEV}}, {{VERSAO_BASE}}, {{DATA}};
            ficheiros _x viram .x)
docs/       normas e instruções
test/       node:test
```
