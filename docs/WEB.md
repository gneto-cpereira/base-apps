# Ecrãs da base no browser

Os ecrãs de entrada, conta e administração **funcionam da mesma maneira em todas as apps**, mas **o aspeto é de
cada app**. A base dá o funcionamento (HTML com classes `ba-*` e o comportamento); a app dá o estilo.

O servidor da base serve estes ficheiros em `/base/…` (a CSP aceita-os porque são da própria origem):

| Ficheiro | Exporta | Para quê |
|---|---|---|
| `/base/api.js` | `pedir(rota, corpo)`, `obter(rota)`, `sessaoAtual()`, `esc()`, `haQuanto()`, `dispositivo()` | Falar com a API. Lança `Error` com a mensagem do servidor. Emite `ba:sessao-terminou` (401) e `ba:dois-passos` (403) em `window` |
| `/base/entrada.js` | `mostrarEntrada(el, { marca, aoEntrar })`, `ligarDoisPassos(el, { obrigatorio, marca, titulo, depois })` | Ecrã de entrada completo (email/código, palavra-passe, "Tenho um código", segundo passo, ligar a app de autenticação, códigos de recuperação) |
| `/base/conta.js` | `mostrarConta(el)` | Página da conta: as minhas sessões, dois passos, mudar palavra-passe, sair |
| `/base/admin.js` | `mostrarUtilizadores(el)`, `mostrarRegisto(el)`, `mostrarInterruptorDev(el)` | Superadmin: gerir contas, registo de segurança, interruptor da versão de testes |
| `/base/qr.js` | `qrSvg(texto)`, `qrMatriz(texto)` | QR code sem dependências (usado no ecrã dos dois passos) |
| `/base/base.css` | — | **Opcional.** Aspeto neutro, mudável pelas variáveis `--ba-*` |

## Duas maneiras de dar o aspeto da app

1. **Carregar `/base/base.css` e mudar as variáveis** no `estilo.css` da app:
   `--ba-cor`, `--ba-cor-texto`, `--ba-fundo`, `--ba-texto`, `--ba-suave`, `--ba-linha`, `--ba-cartao`,
   `--ba-erro`, `--ba-ok`, `--ba-raio`, `--ba-letra`.
2. **Não carregar `base.css`** e estilizar as classes abaixo à maneira da app (ex.: o Elmer com o seu estilo de recortes).

O topo de cada ecrã (logótipo, nome) é HTML da app: `marca` em `mostrarEntrada` e `ligarDoisPassos`.

## Personalidade da app nos ecrãs de entrada (v1.2.0)

`mostrarEntrada(el, opcoes)` e `ligarDoisPassos(el, opcoes)` aceitam:

| Opção | Para quê |
|---|---|
| `marca` | HTML do topo, ou função `(passo) => HTML`. Passos: `email`, `codigo`, `senha`, `definir-senha`, `totp`, `dois-passos`, `recuperacao` |
| `aoDesenhar(el, passo)` | chamada depois de cada ecrã ser desenhado (ex.: desenhar a mascote em SVG) |
| `reagir(estado)` | `'a-enviar'`, `'erro'` ou `'entrou'` (ex.: a mascote pensa, fica preocupada, festeja) |

Exemplo (Grão a Grão): a galinha muda de reação com `reagir`, e `aoDesenhar` volta a pintá-la.

## Classes (contrato estável: só mudam numa versão major)

| Classe | Onde |
|---|---|
| `ba-entrada` | formulário de cada passo da entrada |
| `ba-dois-passos`, `ba-passos`, `ba-qr`, `ba-chave`, `ba-recuperacao`, `ba-confirmar` | ligar a app de autenticação |
| `ba-conta`, `ba-utilizadores`, `ba-ficha`, `ba-registo` | páginas da conta e da administração |
| `ba-marca`, `ba-titulo`, `ba-texto`, `ba-nota` | topo, títulos, textos, textos pequenos |
| `ba-campo` | `<label>` com o `<input>`/`<select>` lá dentro |
| `ba-codigo` | campo de código (letras espaçadas) |
| `ba-botao`, `ba-principal`, `ba-pequeno`, `ba-perigo`, `ba-a-carregar` | botões |
| `ba-ligacao`, `ba-ligacoes`, `ba-acoes` | botões com ar de ligação e grupos de botões |
| `ba-erro`, `ba-ok` | mensagens de erro e de sucesso |
| `ba-cartao`, `ba-formulario`, `ba-linha-form`, `ba-lista`, `ba-linha`, `ba-etiqueta`, `ba-papel-<papel>` | blocos, listas e etiquetas |
| `ba-interruptor`, `ba-desligado`, `ba-dev` | interruptor da versão de testes e a etiqueta DEV |
| `ba-codigo-dado` | código para escolher a palavra-passe, mostrado ao superadmin |

## Textos

Todos os textos estão em português de Portugal, com "tu". Se uma app precisar de outro texto num ecrã da base,
pede-se uma opção nova na base (minor), em vez de copiar e alterar o ficheiro.
