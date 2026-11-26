#!/bin/sh
# Cópia de segurança diária dos dados da app, pelo cron do servidor. Igual em todas as apps (base-apps/infra).
#   <min> 4 * * * sh $HOME/<nome>/repo/servidor/copia-dados.sh >> $HOME/<nome>/copias.log 2>&1
# Guarda os últimos COPIAS_DIAS (30) dias em ~/<nome>/copias/ (no mesmo disco: protege de erros, não de avarias).
# As bases de dados SQLite são copiadas com VACUUM INTO, para saírem inteiras mesmo com a app a correr.
# Os ficheiros cifrados vão cifrados; a chave (~/<nome>/segredos.env) NÃO vai na cópia: guarda-a à parte.
# Para repor: docker stop <nome>; extrair a cópia por cima de ~/<nome>/dados; docker start <nome>.
AQUI=$(cd "$(dirname "$0")" && pwd)
. "$AQUI/app.env"
A="$HOME/$NOME"
mkdir -p "$A/copias" && chmod 700 "$A/copias"
tmp=$(mktemp -d) || exit 1
if docker exec "$NOME" node node_modules/base-apps/bin/base-apps.mjs copiar-dados /dados /tmp/copia-dados >/dev/null; then
  docker cp "$NOME:/tmp/copia-dados" "$tmp/dados" >/dev/null
  docker exec "$NOME" rm -rf /tmp/copia-dados
else
  echo "$(date '+%F %T') o $NOME não está a correr: cópia direta da pasta"
  cp -a "$A/dados" "$tmp/dados"
fi
f="$A/copias/dados-$(date +%F).tar.gz"
tar czf "$f" -C "$tmp" dados && chmod 600 "$f" && echo "$(date '+%F %T') cópia feita: $(du -h "$f" | cut -f1)"
rm -rf "$tmp"
ls -1t "$A"/copias/dados-*.tar.gz | tail -n +$(( ${COPIAS_DIAS:-30} + 1 )) | xargs -r rm --
