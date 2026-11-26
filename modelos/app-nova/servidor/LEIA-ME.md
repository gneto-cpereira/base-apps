# {{TITULO}} no servidor

Pastas no `gneto-server` (norma das apps, ver `docs/NORMAS.md` da base-apps):

```
~/{{NOME}}/
  repo/          clone do ramo main (montado no contentor {{NOME}})
  repo-dev/      clone do ramo dev (montado no contentor {{NOME}}-dev)
  chave/         deploy + known_hosts: chave do GitHub só de leitura (700; a chave 600)
  dados/         app.db e ficheiros da app (700)
  dados-dev/     cópia dos dados para o dev (só com DEV_DADOS=copia)
  copias/        cópias diárias, 30 dias (700; cada cópia 600)
  segredos.env   CHAVE_CIFRA e afins, se a app os usar (600)
  *.log          registos do cron
```

## Instalar (uma vez)

```bash
A=~/{{NOME}}
mkdir -p $A/chave $A/dados $A/copias && chmod 700 $A/chave $A/dados $A/copias
ssh-keygen -t ed25519 -N '' -C '{{NOME}}-servidor' -f $A/chave/deploy
ssh-keyscan github.com > $A/chave/known_hosts
cat $A/chave/deploy.pub   # GitHub → repositório → Settings → Deploy keys → Add (SEM "Allow write access")
git -c core.sshCommand="ssh -i $A/chave/deploy -o UserKnownHostsFile=$A/chave/known_hosts" clone -b main git@github.com:gneto-cpereira/{{NOME}}.git $A/repo
git -c core.sshCommand="ssh -i $A/chave/deploy -o UserKnownHostsFile=$A/chave/known_hosts" clone -b dev  git@github.com:gneto-cpereira/{{NOME}}.git $A/repo-dev
cd $A/repo/servidor && docker compose up -d --build
docker exec -it {{NOME}} npx base-apps superadmin <o-teu-id> [o-teu-email]
```

Abrir no Tailscale (só os teus aparelhos; sem Funnel, a não ser que a app tenha de ser pública):

```bash
sudo tailscale serve --bg --https={{PORTA}} http://127.0.0.1:{{PORTA}}
```

Cron (`crontab -e`). Escolhe um minuto que nenhuma outra app use (ver `docs/NORMAS.md`):

```
*/5 * * * * sh $HOME/{{NOME}}/repo/servidor/dev-acordar.sh >> $HOME/{{NOME}}/dev-acordar.log 2>&1
<min> 4 * * * sh $HOME/{{NOME}}/repo/servidor/copia-dados.sh >> $HOME/{{NOME}}/copias.log 2>&1
```

## No dia a dia

| Para | Comando |
|---|---|
| Ver os registos | `docker logs --tail 100 {{NOME}}` |
| Contas | `docker exec -it {{NOME}} npx base-apps listar` (e `ajuda` para ver todos) |
| Ligar o email | `docker exec -it {{NOME}} npx base-apps email` (ver `docs/EMAIL.md` da base-apps) |
| Reconstruir a imagem | `cd ~/{{NOME}}/repo/servidor && docker compose up -d --build` |
| Repor uma cópia | `docker stop {{NOME}}`, extrair `copias/dados-AAAA-MM-DD.tar.gz` por cima de `~/{{NOME}}/dados`, `docker start {{NOME}}` |

O contentor vai buscar novidades ao GitHub a cada 5 minutos e reinicia-se sozinho quando as há.
