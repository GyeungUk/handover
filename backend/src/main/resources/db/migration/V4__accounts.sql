-- Employee-number accounts, replacing the ChatGPT proxy as the source of identity.
--
-- A person signs in with their employee number (digits only) and a password they set themselves the
-- first time. `handover.auth.admin-employee-ids` / `member-employee-ids` decide who may do that at
-- all, so this table holds credentials, never permissions.
--
-- `email` is registration data rather than identity: it is where "비밀번호 찾기" sends its code, and
-- it remains the key `handover_documents` files a document under — which is why it is unique.
CREATE TABLE IF NOT EXISTS accounts (
    employee_id   text        NOT NULL,
    name          text        NOT NULL,
    email         text        NOT NULL,
    -- pbkdf2-sha256$<iterations>$<salt>$<hash>; see PasswordHasher.
    password_hash text        NOT NULL,
    created_at    timestamptz NOT NULL,
    updated_at    timestamptz NOT NULL,
    CONSTRAINT accounts_pkey PRIMARY KEY (employee_id),
    CONSTRAINT accounts_email_key UNIQUE (email),
    CONSTRAINT accounts_employee_id_digits_check CHECK (employee_id ~ '^[0-9]{1,32}$')
);

-- One row per signed-in browser. Only the SHA-256 of the cookie value is stored, so a copy of this
-- table is not a set of usable logins. Rows rather than signed cookies so that signing out — and
-- changing a password — can actually revoke a session.
CREATE TABLE IF NOT EXISTS account_sessions (
    token_hash  text        NOT NULL,
    employee_id text        NOT NULL,
    created_at  timestamptz NOT NULL,
    expires_at  timestamptz NOT NULL,
    CONSTRAINT account_sessions_pkey PRIMARY KEY (token_hash),
    CONSTRAINT account_sessions_account_fkey
        FOREIGN KEY (employee_id) REFERENCES accounts (employee_id) ON DELETE CASCADE
);

-- A pending "비밀번호 찾기". `attempts` is what keeps a six-digit code from being guessable inside
-- its validity window; `used_at` is what stops one being replayed.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash  text        NOT NULL,
    employee_id text        NOT NULL,
    created_at  timestamptz NOT NULL,
    expires_at  timestamptz NOT NULL,
    used_at     timestamptz,
    attempts    integer     NOT NULL DEFAULT 0,
    CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (token_hash),
    CONSTRAINT password_reset_tokens_account_fkey
        FOREIGN KEY (employee_id) REFERENCES accounts (employee_id) ON DELETE CASCADE,
    CONSTRAINT password_reset_tokens_attempts_check CHECK (attempts >= 0)
);

-- Revoking every session an account holds, and sweeping expired rows, are the only two queries that
-- do not arrive by primary key.
CREATE INDEX IF NOT EXISTS account_sessions_employee_idx ON account_sessions (employee_id);
CREATE INDEX IF NOT EXISTS account_sessions_expires_idx ON account_sessions (expires_at);
CREATE INDEX IF NOT EXISTS password_reset_tokens_employee_idx
    ON password_reset_tokens (employee_id, created_at);

COMMENT ON TABLE accounts IS 'workspace accounts, keyed by employee number; email is contact data, not identity';
