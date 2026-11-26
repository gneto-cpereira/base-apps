# Imagem comum das apps (base-apps). O código não vai na imagem: vem do repositório montado em /repo,
# por isso um git pull chega para atualizar. Só é preciso reconstruir se este ficheiro mudar:
#   docker compose up -d --build
# A imagem node:24-alpine já tem o utilizador 1000 ("node"), de que o ssh do git pull precisa.
FROM node:24-alpine
RUN apk add --no-cache git openssh-client
