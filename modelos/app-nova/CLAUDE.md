# {{TITULO}}: instruções para o Claude

<!-- Modelo da base-apps v{{VERSAO_BASE}}. As secções "Regras comuns" são iguais em todas as apps; a secção
     "Esta app" é só desta. Ao atualizar a base, comparar com node_modules/base-apps/modelos/app-nova/CLAUDE.md. -->

## Esta app

- **O que é:** (uma frase)
- **Quem a usa:** (pessoas, aparelhos)
- **Dados sensíveis:** (o quê; o que vai cifrado)
- **Pública na internet:** não (só Tailscale, porta {{PORTA}})
- **Commits e push autónomos:** (sim/não; data em que o dono autorizou)
- **Dependências além da base:** nenhuma

## Regras comuns (todas as apps)

### Como trabalhar
- Fala-se em **português de Portugal** e trata-se o dono por **tu**. Os textos da app também.
- **Em planeamento não se constrói nada sem pedido explícito.** Propor primeiro (curto), construir depois do "sim".
- **Custo zero:** só ferramentas e serviços gratuitos.
- **O servidor é fraco** (2 núcleos, 3,7 GB, várias apps): nada de processos pesados, dependências grandes ou trabalhos contínuos.
- **Só o dono avalia** o que é feito para as pessoas (textos, ecrãs, conteúdos); não inventar avaliações.
- Verificar o que se fez (testes, `npm start` + browser) antes de dizer que está feito; dizer o que não foi verificado.

### Base comum (base-apps)
- Entrada, contas, sessões, segurança, contentores e cópias vêm da **base-apps**
  (`node_modules/base-apps`, documentação em `docs/`). **Não copiar nem reescrever isso na app.**
- Se faltar alguma coisa na base, propor a mudança na base (nova versão), não remendar na app.
- Seguir `docs/NORMAS.md` (pastas, nomes, rotas, base de dados) e `docs/WEB.md` (ecrãs da base com o aspeto da app).
- `servidor/Dockerfile`, `arranque.sh`, `dev-acordar.sh`, `copia-dados.sh` são cópias da base: não editar
  (`npx base-apps infra` para comparar).

### Segurança
- Rotas novas com `app.rota(...)`: exigem sessão por defeito. `publica: true` só com razão escrita.
- Cada rota confere de quem são os dados; SQL sempre com `?`; texto do browser validado e limitado;
  no browser, `esc()` antes de `innerHTML`; nada de JavaScript inline.
- Nunca pôr no git palavras-passe, chaves, tokens, `segredos.env`, dados pessoais, bases de dados.
- Antes de abrir a app ou depois de mudanças grandes: `docs/LISTA-SEGURANCA.md` e registo em `servidor/SEGURANCA.md`.

### Git (ver docs/GIT.md da base)
- Trabalhar no ramo **`dev`**; passar para o `main` só quando o dono aprovar (`git merge --ff-only dev`).
- Commits com o **email noreply pessoal** (`253965595+gneto-cpereira@users.noreply.github.com`), **nunca o do trabalho**.
- Mensagens em português, a dizer o quê e porquê. Ver o `git diff --staged` antes de cada commit.
- Criar repositórios, mudar visibilidade, forçar push ou apagar ramos: perguntar sempre.

### Servidor
- `ssh gneto-server` (sem palavra-passe; docker sem sudo). Pastas em `~/{{NOME}}/` (ver `servidor/LEIA-ME.md`).
- O contentor atualiza-se sozinho do GitHub a cada 5 minutos; não é preciso entrar no servidor para publicar.
- Contas: `docker exec -it {{NOME}} npx base-apps <comando>` (`ajuda` lista todos).

## Como correr no PC

```
npm install
npx base-apps superadmin <id>        # dá um código para escolher a palavra-passe
npm start                            # http://localhost:{{PORTA}}
npm test
```
Para testar a entrada por email sem Gmail: `BASE_EMAIL_CONSOLA=1 npm start` (os códigos aparecem na consola).
