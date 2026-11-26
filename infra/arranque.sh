#!/bin/sh
# Corre dentro do contentor (main ou dev). Igual em todas as apps (base-apps/infra; não editar na app:
# "npx base-apps infra" diz se está diferente da base e "--atualizar" volta a copiá-lo).
# 1. instala as dependências quando o package.json ou o package-lock.json mudam;
# 2. corre "npm run construir", se a app o tiver;
# 3. serve a app (node servidor.mjs) e vai buscar novidades ao GitHub a cada 5 minutos;
#    quando as há, reinicia o contentor (kill 1) para carregar o código novo: o Docker volta a ligá-lo.
cd /repo || exit 1
. ./servidor/app.env
git config --global --add safe.directory /repo
# As dependências do GitHub (base-apps) vêm por https, sem chaves; o git pull da app usa a chave de leitura.
git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"

marca=$(cat package.json package-lock.json 2>/dev/null | sha1sum | cut -c1-40)
if [ "$(cat node_modules/.instalado 2>/dev/null)" != "$marca" ]; then
  echo "$(date '+%F %T') a instalar dependências"
  if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund; else npm install --omit=dev --no-audit --no-fund; fi \
    && echo "$marca" > node_modules/.instalado || echo "$(date '+%F %T') instalação das dependências falhou"
fi
npm run --if-present construir

export GIT_SSH_COMMAND="ssh -i /chave/deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/chave/known_hosts"
(
  while true; do
    sleep "${INTERVALO:-300}"
    antes=$(git rev-parse HEAD)
    git pull --ff-only -q || echo "$(date '+%F %T') pull falhou"
    if [ "$(git rev-parse HEAD)" != "$antes" ]; then
      echo "$(date '+%F %T') novidades: $(git log -1 --format=%s)"
      kill 1
    fi
  done
) &

exec node servidor.mjs
