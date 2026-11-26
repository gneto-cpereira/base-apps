# Decisões: o que era diferente entre as apps e como ficou

O Elmer e o Grão a Grão resolviam algumas coisas de maneiras opostas. Na base ficou **uma só maneira**.
Quando o Elmer e o Grão a Grão adotarem a base, mudam para estas regras (ver "Migração", no fim).

| Assunto | Elmer | Grão a Grão | Na base |
|---|---|---|---|
| Onde ficam as contas | ficheiros JSON | SQLite | **SQLite** (`node:sqlite`), `<DADOS>/app.db`, com as tabelas da app |
| Identificação | nome curto (`a-z0-9._-`) | nome com acentos | **as duas coisas**: `id` curto para entrar + `nome` para mostrar |
| Entrar | código por email; palavra-passe só sem email | só palavra-passe | **automático**: código por email se o Gmail estiver configurado, senão palavra-passe |
| Criar contas | superadmin na app (e definia a palavra-passe) | convite na consola; a pessoa escolhia nome e palavra-passe | **superadmin cria** (app ou consola) com id, nome, email e papel; **a pessoa escolhe a palavra-passe** com um código de 10 letras (30 min) |
| Palavra-passe esquecida | superadmin mudava-a | código `repor-senha` | **código de 10 letras** (o mesmo mecanismo) |
| Papéis | user / admin / superadmin | pessoa / superadmin | **user / admin / superadmin** (pessoa = user) |
| Sessão do superadmin sem dois passos | marcada na sessão | calculada da conta | **calculada da conta** (`papel = superadmin` e sem TOTP) |
| Rotas da entrada | `/api/entrada/…`, `/api/entrar` | `/api/conta/…` | **`/api/conta/…`** (todas) |
| Resposta da entrada | `{ passo: 'totp' }` ou a sessão | `{ passo: 'codigo' \| 'feito' }` | **`{ passo: 'totp' \| 'feito', … }`** |
| Limites de tentativas | em memória (perdiam-se ao reiniciar) | na base de dados | **na base de dados** (o contentor reinicia a cada novidade) |
| Códigos de email pendentes | em memória | — | **na base de dados** (só o hash) |
| Formato do hash | campos `sal`, `hash`, `n` (sal em texto) | `scrypt$N$r$p$sal$hash` | **`scrypt$N$r$p$salHex$hashHex`**, palavra-passe normalizada em NFC |
| Códigos de recuperação | 10 carateres a-z0-9 | 10 sem confundíveis, `XXXXX-XXXXX` | **10 sem confundíveis, `XXXXX-XXXXX`**; aceita minúsculas e sem hífen |
| Dados do dev | os mesmos do main | cópia renovada ao acordar | **cópia por defeito** (`DEV_DADOS=copia`); `partilhados` possível |
| Cookie do dev | o mesmo do main | `__Host-<app>-dev` (aceita o do main) | **`__Host-<app>-dev`, aceita o do main** |
| Reiniciar com novidades | reconstrói o site; reinicia só se o servidor mudou | reinicia sempre | **reinicia sempre** (+ `npm run construir`, se existir) |
| Chave do GitHub no servidor | `chave/elmer_deploy`, montada rw | `chave/grao_deploy`, montada `:ro` | **`chave/deploy`, montada `:ro`** |
| Pasta de dados no servidor | `estado/` | `dados/` | **`dados/`** |
| Projeto Docker | sem nome (= "servidor") | `name: grao-a-grao` | **`name: <app>`** |
| Corpo máximo dos pedidos | 4–6 KB | 64 KB | **16 KB** por defeito, cada rota pode subir |
| Expiração das sessões | 30 dias; 7 admins/superadmin | 30; 7 superadmin | **30 dias; 7 para admin e superadmin** |
| Atualização da "última vez" da sessão | 1 vez por hora | 1 vez a cada 5 min | **5 minutos** |
| Registo de segurança | últimos 300 eventos | sem limite | **180 dias** |
| Corpo de email/remetente | "Elmer" fixo | — | **TITULO da app** (`servidor/app.env`) |

## Migração (quando chegar a hora de cada app)

- **Elmer**: passar `utilizadores.json`/`sessoes.json` para `app.db` (o sal antigo é texto: na conversão,
  `salHex = hex(utf8(sal))` e `N = n`, e os hashes continuam a servir). Os `nome` atuais passam a `id` e a `nome`.
  `email.json` passa para a tabela `definicoes`. Pasta `estado/` → `dados/`, `chave/elmer_deploy` → `chave/deploy`.
  As sessões podem ser migradas (hash igual) ou simplesmente terminar (toda a gente volta a entrar).
- **Grão a Grão**: muda para Node (passo seguinte). Os hashes `scrypt$…` servem tal e qual, salvo palavras-passe
  com acentos escritas de forma decomposta (raro). `pessoa` → `user`; o `nome` atual passa a `nome`, e cria-se
  um `id` curto para cada conta.

## Por decidir

1. **Cópias fora do servidor.** Hoje ficam no mesmo disco (protegem de erros, não de avarias). Opção grátis:
   `rclone` para um Google Drive/OneDrive pessoal, cifrado. Vale para todas as apps.
2. **Cifra no Grão a Grão.** O quê (só as fotos das faturas? também campos da base de dados?) e se a chave fica no
   servidor (`segredos.env`; protege as cópias e o disco roubado, não o servidor ligado) ou noutro sítio.
3. **Grão a Grão com email?** Ao configurar o Gmail, a entrada passa sozinha a código por email. Ou fica só com
   palavra-passe (está só no Tailscale)?
4. **Identificadores curtos das contas do Grão a Grão** (hoje entra-se pelo nome com acentos).
5. **Migração do Elmer:** quando, e se as sessões passam (ninguém volta a entrar) ou terminam (toda a gente entra de novo).
6. **QR code** no ecrã de ligar a app de autenticação (hoje: botão para abrir a app + chave para escrever).
   Gerar QR sem dependências custa ~300 linhas.
7. **Limite de memória** de 384 MB por contentor: chega para todas as apps?
8. **Painel do servidor:** como lê as versões (`docker exec <app> npx base-apps versao --json` de cada app, ou o painel lê os `package.json` e pergunta ao GitHub).
9. **Registo de segurança:** guardar 180 dias (com IPs e emails) está bem?
