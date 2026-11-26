# Ligar o envio de códigos por email (Gmail, grátis)

Enquanto isto não estiver feito, a app entra com identificador e palavra-passe. Depois, toda a gente entra com o
email e um código de 6 dígitos, sem palavras-passe. São cerca de 10 minutos, uma vez por app (ou um Gmail para
várias apps: a palavra-passe de app pode ser a mesma, mas é melhor uma por app).

## 1. Criar um Gmail para a app

1. <https://accounts.google.com/signup>: cria uma conta, ex.: `nome.da.app@gmail.com`. **Email pessoal, nunca o do trabalho** (a base recusa-o).
2. Palavra-passe forte, guardada no gestor de palavras-passe.

## 2. Ligar a verificação em 2 passos dessa conta Google

<https://myaccount.google.com/signinoptions/twosv>, com o telemóvel. A Google só deixa criar palavras-passe de app com isto ligado.

## 3. Criar uma palavra-passe de app

<https://myaccount.google.com/apppasswords> → nome da app → **Criar** → aparecem **16 letras**. Só servem para enviar emails.

## 4. Pôr a palavra-passe de app no servidor

```bash
ssh -t gneto-server docker exec -it <nome> npx base-apps email
```

Escreve o endereço Gmail e cola as 16 letras (não aparecem no ecrã). Ficam na base de dados da app, só legível
pelo teu utilizador no servidor; nunca passam pelo Claude nem pelo GitHub.

## 5. Testar

```bash
ssh gneto-server docker exec <nome> npx base-apps testar-email o-teu-email-pessoal@gmail.com
```

**Antes disto, confirma que todas as contas têm email** (`npx base-apps listar`): uma conta sem email não consegue entrar.

## Se alguma coisa falhar

| Problema | O que fazer |
|---|---|
| "palavra-passe de app errada" | Gera outra em apppasswords e repete o passo 4 |
| O código não chega | Vê no spam; o Registo de segurança mostra se o envio falhou |
| O email deixou de funcionar e ninguém entra | `npx base-apps emergencia <id>` dá um código de 8 dígitos (15 min): na app, email → "Já tenho um código" |
| Perdeste o telemóvel com a app de autenticação | Um código de recuperação. Sem eles: `npx base-apps repor-2passos <id>` |
| Voltar a entrar com palavra-passe | `npx base-apps desligar-email` e um `codigo-senha <id>` para quem não tiver palavra-passe |
