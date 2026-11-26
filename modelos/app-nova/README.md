# {{TITULO}}

(O que é a app, numa ou duas frases.)

Feita sobre a [base-apps](https://github.com/gneto-cpereira/base-apps) v{{VERSAO_BASE}}: entrada (código por
email ou palavra-passe + app de autenticação), contas, segurança, contentores main/dev e cópias diárias.

## No PC

```
npm install
npx base-apps superadmin <o-teu-id>     # dá um código: na app, "Tenho um código"
npm start                               # http://localhost:{{PORTA}}
npm test
```

- Os dados locais ficam em `dados/` (fora do git).
- Entrada por email sem Gmail, para testar: `BASE_EMAIL_CONSOLA=1 npm start` (os códigos aparecem na consola).

## Organização

Segue as normas da base (`node_modules/base-apps/docs/NORMAS.md`):
`servidor.mjs` + `lib/` (servidor), `web/` (browser), `servidor/` (contentores e scripts), `test/`.

## No servidor

Ver [servidor/LEIA-ME.md](servidor/LEIA-ME.md) e [servidor/SEGURANCA.md](servidor/SEGURANCA.md).

## Versão da base

```
npx base-apps versao       # declarada, instalada e a mais recente
npx base-apps infra        # scripts do servidor iguais aos da base?
```
