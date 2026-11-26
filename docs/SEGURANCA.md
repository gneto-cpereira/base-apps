# Segurança da base (comum a todas as apps)

Junta o que o Elmer (revisto em 2026-11-14) e o Grão a Grão (revisto em 2026-11-25/26) já faziam, com as
diferenças normalizadas (ver [DECISOES.md](DECISOES.md)). Segue a OWASP (*Session Management*, *Password Storage*)
e a NIST SP 800-63B.

## Como se entra

O método escolhe-se sozinho, conforme o Gmail da app está ou não configurado (`npx base-apps email`):

- **Código por email** (com Gmail): escreve-se o email e recebe-se um código de 6 dígitos.
  - Vale 10 minutos e uma só vez. À 5.ª tentativa errada deixa de valer.
  - A resposta é sempre a mesma, haja ou não conta com esse email: ninguém descobre quem tem conta.
  - Limites de pedidos: 1 a cada 40 s e 4 em 15 min por email; 10 por hora por IP; 60 por hora no total.
  - Se o email falhar: código de emergência de 8 dígitos (15 min), só pela linha de comandos do servidor.
- **Palavra-passe** (sem Gmail): identificador (ou email) + palavra-passe.
  - Mínimo 12 caracteres; recusa as mais comuns e as que contêm o nome da pessoa ou da app.
    Sem regras de "maiúscula e símbolo" nem mudança obrigatória (NIST).
  - Guardadas com scrypt N=2^17, r=8, p=1 (OWASP), no formato `scrypt$N$r$p$sal$hash`. As antigas são refeitas no próximo login.
  - Uma conta inexistente demora o mesmo tempo a recusar.
  - **Ninguém escolhe nem vê a palavra-passe de outra pessoa.** Contas novas e palavras-passe esquecidas:
    o superadmin gera um código de 10 letras (30 min, uma vez) e a pessoa escolhe a palavra-passe em "Tenho um código".
    Uma palavra-passe fraca não gasta o código.
- **Segundo passo (TOTP)**: código de uma app de autenticação.
  - Obrigatório para o superadmin: até o ligar, só consegue ligá-lo ou sair. Opcional para os outros.
  - Um código usado não volta a servir (nem dentro dos mesmos 30 s).
  - 8 códigos de recuperação de uso único (10 letras sem caracteres confundíveis), guardados só como hash.
  - Ao ligá-lo, terminam as outras sessões dessa pessoa.

## Tentativas falhadas

- Contadas por IP e por conta/email (e por conta no segundo passo). À 5.ª falha há um bloqueio de 1 minuto;
  cada novo bloqueio dura o dobro, até 1 hora. Guardadas na base de dados: sobrevivem aos reinícios.
- Cada falha espera 0,4 s antes de responder.

## Sessões

- Token aleatório de 256 bits; na base de dados fica só o SHA-256.
- Cookie `__Host-<app>` (no dev `__Host-<app>-dev`) com `Secure`, `HttpOnly` e `SameSite=Strict`.
- Expiram sem uso: 30 dias para utilizadores, 7 para administradores e superadmins.
- Mudar o papel, o email, a palavra-passe ou os dois passos de alguém termina as sessões dessa pessoa.
- Cada pessoa vê as suas sessões (dispositivo, IP, última vez) e pode terminá-las.

## Pedidos

- **Todas as rotas `/api/*` exigem sessão completa**, salvo as marcadas como públicas (só as da entrada).
  As rotas novas de uma app ficam protegidas por defeito.
- **CSRF:** escritas só em JSON e vindas da própria app (`Sec-Fetch-Site` e `Origin`).
- **Cabeçalhos:** CSP sem JavaScript inline, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Cross-Origin-Opener/Resource-Policy`, HSTS (no servidor).
- **Ficheiros:** caminhos com `..` ou `\`, ficheiros escondidos (`.git`…) e métodos que não sejam GET/HEAD são recusados.
  Pastas privadas de `web/` só com sessão.
- **Respostas da API** não ficam em cache (`no-store`).
- **Tempos limite** contra ligações lentas de propósito (cabeçalhos 10 s, pedido 30 s); corpo limitado a 16 KB por defeito.
- O IP de quem pede só vem do `X-Forwarded-For` quando a ligação chega de um endereço local (Tailscale, contentor main).

## Servidor

- O contentor só escuta em `127.0.0.1:<porta>`: a rede local não lhe chega.
- Corre como o utilizador 1000; a pasta da chave é montada só de leitura; a chave do GitHub é só de leitura.
- A base de dados e as pastas de dados são só legíveis pelo dono (600/700).
- Cópias diárias (30 dias) no mesmo disco. A chave de cifra (`segredos.env`) não vai nas cópias.
- **Registo de segurança** (na app: Registo, só o superadmin; `npx base-apps registo`; `docker logs`):
  entradas, saídas, falhas, bloqueios, códigos enviados, alterações de contas e de dois passos.
- **Versão de testes:** só o superadmin a pode ligar; o main só encaminha para o dev quem for superadmin com
  sessão válida, e o anfitrião é sempre o do dev (mesmo com caminhos estranhos como `//outro-site`).

## Cifra de dados (opcional)

`cifrar(buffer, chave)` / `decifrar(...)`: AES-256-GCM, para dados sensíveis (ex.: faturas). A chave
(`npx base-apps chave-cifra`) vai para `~/<nome>/segredos.env` e para o gestor de palavras-passe do dono,
nunca para o git nem para as cópias. Quem ler o disco ou uma cópia não lê os ficheiros cifrados.

## Riscos que ficam

- Quem controla o email de alguém entra como essa pessoa (por isso o superadmin tem também a app de autenticação).
- As cópias estão no mesmo disco: protegem de erros, não de uma avaria do disco.
- O registo de segurança guarda IPs e emails (180 dias): é necessário para ver ataques.
