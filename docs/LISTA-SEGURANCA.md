# Lista de verificação de segurança

Passar antes de abrir uma app nova, antes de a pôr na internet (Funnel) e depois de mudanças grandes.
Registar o resultado no `servidor/SEGURANCA.md` da app (data, versão da base, o que ficou).

## Código

- [ ] Todas as rotas novas usam `app.rota(...)` sem `publica: true`, salvo razão escrita ao lado.
- [ ] Cada rota confere **de quem** são os dados (ex.: `WHERE conta = ?`), não só se há sessão.
- [ ] Rotas de administração têm `{ papel: 'admin' }` ou `'superadmin'`.
- [ ] Os dados que vêm do browser são validados (tipo, tamanho, lista de valores aceites); textos com `texto(v, max)`.
- [ ] SQL sempre com `?` (nunca a juntar texto ao SQL).
- [ ] No browser, todo o texto vindo de dados passa por `esc()` antes de ir para `innerHTML`.
- [ ] Nada de JavaScript inline nem `eval`; estilos inline evitados.
- [ ] Ficheiros enviados pelas pessoas: tipo e tamanho limitados, nome gerado pelo servidor, guardados em `DADOS`, servidos só com sessão.
- [ ] Dados sensíveis cifrados com `cifrar()` quando o disco ou as cópias os expõem.
- [ ] Limites (`app.limites.dentro(...)`) nas ações que se podem repetir em massa.
- [ ] Erros não mostram detalhes internos (o servidor responde "Erro no servidor." e regista o resto).

## Repositório

- [ ] `git log -p` sem palavras-passe, chaves, tokens, dados pessoais, bases de dados.
- [ ] Commits com o noreply pessoal (`git log --format='%ae' | sort -u`).
- [ ] `.gitignore` com `dados/`, `*.db*`, `segredos.env`, `.env`.
- [ ] Repositório privado, só o dono como colaborador, sem webhooks; GitHub Actions desligado se não for usado.

## Servidor

- [ ] Porta só em `127.0.0.1` (`ss -ltnp | grep <porta>`); da rede local não responde.
- [ ] Tailscale `serve` (não `funnel`) salvo app pública; confirmar de fora.
- [ ] Deploy key **sem** escrita; `chave/` montada `:ro`.
- [ ] Permissões: `chave/ dados/ dados-dev/ copias/` 700; chave, `segredos.env`, cópias e `app.db` 600.
- [ ] `npx base-apps infra` diz "Iguais à base".
- [ ] `npx base-apps versao` sem versões major em atraso.
- [ ] Cron das cópias e do dev a correr (ver os `.log`); testar repor uma cópia de vez em quando.
- [ ] Superadmin com a app de autenticação ligada; códigos de recuperação guardados.

## Testes de fora (com curl ou o browser)

- [ ] `/api/<rota>` sem sessão → 401.
- [ ] `/%2e%2e/servidor/app.env`, `/.git/config`, `/servidor.mjs` → 404.
- [ ] `POST` com `Origin: https://outro.site` → 403; com `Content-Type: text/plain` → 415.
- [ ] Cabeçalhos (`curl -I`): CSP, HSTS, `X-Frame-Options`, `nosniff`, sem `X-Powered-By`.
- [ ] 6 palavras-passe/códigos errados seguidos → 429.
