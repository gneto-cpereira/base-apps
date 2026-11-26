# Alterações da base-apps

Semver: **patch** corrige sem mexer nas apps; **minor** acrescenta, compatível; **major** obriga a mexer nas apps
(cada secção major diz o quê). A mais recente no topo.

## [1.2.1] - 2026-11-26

- Os códigos de recuperação antigos do Elmer (minúsculas, guardados como hash das minúsculas) continuam a servir
  depois da migração para a base, escritos em maiúsculas ou minúsculas, com ou sem hífen.
- `copiarBd` (e por isso `copiar-dados`, as cópias diárias e os dados do dev) deixa as cópias com `chmod 600`.
- `arranque.sh`: `NPM_CONFIG_UPDATE_NOTIFIER=false` (sem o aviso de versão nova do npm a cada arranque).
  Nas apps: `npx base-apps infra --atualizar`.

## [1.2.0] - 2026-11-26

- Ecrãs de entrada com a personalidade de cada app (sem mudar o funcionamento): `mostrarEntrada` e
  `ligarDoisPassos` aceitam `marca` como função do passo, `aoDesenhar(el, passo)` e `reagir(estado)`
  (`'a-enviar' | 'erro' | 'entrou'`). Primeiro uso: a galinha do Grão a Grão reage na entrada.
- O ecrã dos códigos de recuperação mostra a marca da app quando é o fim da entrada obrigatória.
- `npx base-apps superadmin <id> [email] --nome "Nome"`: nome para mostrar.

## [1.1.1] - 2026-11-26

- O registo de segurança guarda 90 dias (antes 180).
- Decisões registadas em `docs/DECISOES.md`: cifra só das fotos no Grão a Grão, identificadores curtos,
  migração do Elmer depois do Grão a Grão, limite de memória aprovado.

## [1.1.0] - 2026-11-26

- **QR code** no ecrã de ligar a app de autenticação (`/base/qr.js`, sem dependências; classe `ba-qr`).
- `GET /api/conta/eu` devolve também o `titulo` da app (a página da conta usa-o no ecrã dos dois passos).
- Documentação: `docs/IDEIAS.md` (cópias fora do servidor) e decisões tomadas depois da 1.0.0.

## [1.0.0] - 2026-11-26

Primeira versão, a partir do que o Elmer e o Grão a Grão já faziam (diferenças normalizadas: docs/DECISOES.md).

- **Entrada**: código por email (Gmail, SMTP sem dependências) ou palavra-passe (scrypt N=2^17), escolhido sozinho;
  app de autenticação (TOTP) obrigatória para o superadmin, com 8 códigos de recuperação; códigos de 10 letras
  para a pessoa escolher a palavra-passe; código de emergência pela linha de comandos.
- **Sessões**: token de 256 bits guardado como SHA-256, cookie `__Host-`, expiração sem uso (30/7 dias),
  terminadas ao mudar papel, email, palavra-passe ou dois passos; lista de sessões por pessoa.
- **Limites de tentativas** na base de dados (bloqueios de 1 min a 1 h) e janelas de pedidos de código.
- **Servidor** `criarApp()`: rotas protegidas por defeito, papéis, CSRF, cabeçalhos de segurança, ficheiros
  estáticos seguros, pastas privadas, tempos limite, encaminhamento do superadmin para o contentor dev.
- **SQLite** (`node:sqlite`) com migrações por módulo; cópia com `VACUUM INTO`.
- **Cifra** AES-256-GCM para dados sensíveis.
- **Ecrãs** no browser (`/base/*.js`): entrada, conta, contas, registo de segurança, interruptor dev;
  aspeto de cada app (classes `ba-*`, `base.css` opcional).
- **Infraestrutura**: Dockerfile, `arranque.sh`, `dev-acordar.sh` (dados do dev em cópia ou partilhados),
  `copia-dados.sh`; esquema de contentores main/dev com limite de memória e de registos.
- **Linha de comandos** `base-apps`: `nova-app`, `versao [--json]`, `infra [--atualizar]`, `chave-cifra`,
  `copiar-dados` e gestão de contas.
- **Normas e instruções**: NORMAS, GIT, SEGURANCA, LISTA-SEGURANCA, WEB, EMAIL, DECISOES e o `CLAUDE.md` modelo.
