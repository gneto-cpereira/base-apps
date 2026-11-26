// Base de dados da app: um ficheiro SQLite (node:sqlite, sem dependências) em <DADOS>/app.db.
// A base cria as tabelas das contas; a app cria as suas com migrar() (mesma base de dados, mesmo ficheiro).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export function abrirBd(ficheiro) {
  if (ficheiro !== ':memory:') {
    mkdirSync(dirname(ficheiro), { recursive: true, mode: 0o700 });
    const novo = !existsSync(ficheiro);
    var bd = new DatabaseSync(ficheiro);
    if (novo) try { chmodSync(ficheiro, 0o600); } catch {}
  } else bd = new DatabaseSync(':memory:');
  bd.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  bd.exec('CREATE TABLE IF NOT EXISTS esquema (modulo TEXT PRIMARY KEY, versao INTEGER NOT NULL)');
  migrar(bd, 'base-apps', ESQUEMA_BASE);
  return bd;
}

/**
 * Aplica as migrações que ainda faltam a um módulo. `passos` é uma lista de textos SQL (ou funções (bd) => {}):
 * nunca se altera um passo antigo, só se acrescentam passos novos no fim.
 */
export function migrar(bd, modulo, passos) {
  const atual = bd.prepare('SELECT versao FROM esquema WHERE modulo = ?').get(modulo)?.versao ?? 0;
  for (let i = atual; i < passos.length; i++) {
    transacao(bd, () => {
      if (typeof passos[i] === 'function') passos[i](bd); else bd.exec(passos[i]);
      bd.prepare('INSERT INTO esquema (modulo, versao) VALUES (?, ?) ON CONFLICT(modulo) DO UPDATE SET versao = excluded.versao').run(modulo, i + 1);
    });
  }
}

/** Corre fn dentro de uma transação (tudo ou nada). */
export function transacao(bd, fn) {
  bd.exec('BEGIN IMMEDIATE');
  try { const r = fn(); bd.exec('COMMIT'); return r; }
  catch (e) { try { bd.exec('ROLLBACK'); } catch {} throw e; }
}

/** Copia a base de dados inteira para outro ficheiro, mesmo com a app a correr (para as cópias de segurança).
 *  A cópia fica só legível pelo dono (0600), como o original. */
export function copiarBd(origem, destino) {
  const bd = new DatabaseSync(origem, { readOnly: true });
  try { bd.prepare('VACUUM INTO ?').run(destino); } finally { bd.close(); }
  try { chmodSync(destino, 0o600); } catch {}
}

// Datas em milissegundos (Date.now()) em todas as tabelas da base.
const ESQUEMA_BASE = [
  `CREATE TABLE contas (
     id TEXT PRIMARY KEY,                -- identificador para entrar: minúsculas, números, . _ -
     nome TEXT NOT NULL,                 -- nome para mostrar (pode ter acentos e espaços)
     email TEXT UNIQUE,                  -- obrigatório quando se entra por email
     papel TEXT NOT NULL DEFAULT 'user', -- user | admin | superadmin
     senha TEXT,                         -- scrypt$N$r$p$sal$hash (só quando se entra com palavra-passe)
     totp TEXT, totp_novo TEXT, totp_passo INTEGER NOT NULL DEFAULT -1,
     criada INTEGER NOT NULL
   );
   CREATE TABLE recuperacao (conta TEXT NOT NULL REFERENCES contas(id) ON DELETE CASCADE ON UPDATE CASCADE, hash TEXT NOT NULL, PRIMARY KEY (conta, hash));
   CREATE TABLE sessoes (
     hash TEXT PRIMARY KEY, conta TEXT NOT NULL REFERENCES contas(id) ON DELETE CASCADE ON UPDATE CASCADE,
     criada INTEGER NOT NULL, vista INTEGER NOT NULL, ip TEXT, agente TEXT
   );
   CREATE INDEX sessoes_conta ON sessoes(conta);
   CREATE TABLE desafios (hash TEXT PRIMARY KEY, conta TEXT NOT NULL REFERENCES contas(id) ON DELETE CASCADE, metodo TEXT, expira INTEGER NOT NULL, falhas INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE codigos_email (email TEXT PRIMARY KEY, conta TEXT NOT NULL REFERENCES contas(id) ON DELETE CASCADE, hash TEXT NOT NULL, expira INTEGER NOT NULL, falhas INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE codigos_senha (hash TEXT PRIMARY KEY, conta TEXT NOT NULL REFERENCES contas(id) ON DELETE CASCADE ON UPDATE CASCADE, expira INTEGER NOT NULL, criado_por TEXT);
   CREATE TABLE emergencia (conta TEXT PRIMARY KEY REFERENCES contas(id) ON DELETE CASCADE, hash TEXT NOT NULL, expira INTEGER NOT NULL);
   CREATE TABLE tentativas (chave TEXT PRIMARY KEY, falhas INTEGER NOT NULL DEFAULT 0, bloqueios INTEGER NOT NULL DEFAULT 0, ate INTEGER NOT NULL DEFAULT 0, ultima INTEGER NOT NULL);
   CREATE TABLE janelas (chave TEXT NOT NULL, em INTEGER NOT NULL);
   CREATE INDEX janelas_chave ON janelas(chave, em);
   CREATE TABLE registo_seguranca (id INTEGER PRIMARY KEY, em INTEGER NOT NULL, tipo TEXT NOT NULL, conta TEXT, ip TEXT, detalhe TEXT);
   CREATE TABLE definicoes (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);`,
];
