// base-apps: base comum das apps do gneto-server. Ver README.md.
export { criarApp, CSP, TIPOS } from './servidor.mjs';
export { Erro, espera, lerCorpo, lerCookies, ipDe, texto, esc, lerAppEnv, SEGUNDO, MINUTO, HORA, DIA } from './util.mjs';
export { abrirBd, migrar, transacao, copiarBd } from './bd.mjs';
export { PAPEIS, SEM_USO, pode, falta2passos, idValido, nomeLimpo } from './contas.mjs';
export { normalizarEmail, emailValido } from './email.mjs';
export { hashSenha, confereSenha, problemaSenha, novoToken, hashToken, codigoLegivel, iguais, cifrar, decifrar, estaCifrado, novaChaveCifra } from './cripto.mjs';
export { VERSAO_BASE, estadoVersao, compararSemver } from './versao.mjs';
