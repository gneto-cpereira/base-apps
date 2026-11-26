#!/bin/sh
# Corre no servidor (fora dos contentores), pelo cron, a cada 5 minutos. Igual em todas as apps (base-apps/infra).
#   */5 * * * * sh $HOME/<nome>/repo/servidor/dev-acordar.sh >> $HOME/<nome>/dev-acordar.log 2>&1
# Liga o contentor <nome>-dev só quando o ramo dev tem novidades que o main ainda não tem, e desliga-o
# (a dormir, 0 MB de memória) quando os dois ramos ficam iguais.
# Com DEV_DADOS=copia (servidor/app.env), sempre que o dev acorda os dados dele (~/<nome>/dados-dev) são
# substituídos por uma cópia fresca dos verdadeiros: nada do que se faz no dev chega aos dados verdadeiros.
AQUI=$(cd "$(dirname "$0")" && pwd)
. "$AQUI/app.env"
A="$HOME/$NOME"
export GIT_SSH_COMMAND="ssh -i $A/chave/deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=$A/chave/known_hosts"
cd "$A/repo-dev" || exit 1
git fetch -q origin main dev || { echo "$(date '+%F %T') fetch falhou"; exit 1; }
novidades=$(git rev-list --count origin/main..origin/dev)
a_correr=$(docker inspect -f '{{.State.Running}}' "$NOME-dev" 2>/dev/null || echo false)
if [ "$novidades" -gt 0 ]; then
  if [ "$a_correr" != true ]; then
    git pull --ff-only -q || git reset -q --hard origin/dev # o ramo dev pode ter sido refeito a partir do main
    if [ "${DEV_DADOS:-copia}" = copia ]; then
      if docker exec "$NOME" node node_modules/base-apps/bin/base-apps.mjs copiar-dados /dados /tmp/copia-dev >/dev/null; then
        rm -rf "$A/dados-dev" && docker cp "$NOME:/tmp/copia-dev" "$A/dados-dev" >/dev/null && chmod 700 "$A/dados-dev"
        docker exec "$NOME" rm -rf /tmp/copia-dev
      else
        echo "$(date '+%F %T') não consegui copiar os dados para o dev (o $NOME está a correr?)"; exit 1
      fi
    fi
    docker compose -f "$A/repo/servidor/docker-compose.yml" --profile dev up -d "$NOME-dev" >/dev/null 2>&1
    echo "$(date '+%F %T') dev acordou ($novidades novidade(s) em relação ao main)"
  fi
elif [ "$a_correr" = true ]; then
  docker stop "$NOME-dev" >/dev/null
  echo "$(date '+%F %T') dev a dormir (igual ao main)"
fi
