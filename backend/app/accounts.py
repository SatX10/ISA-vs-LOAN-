"""Persistent profiles and opaque, revocable browser sessions."""

import hashlib
import hmac
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from threading import Lock
from uuid import uuid4

SESSION_SECONDS = 7 * 24 * 60 * 60
SOCIAL_ONLY = "!oidc"
PROFILE_FIELDS = "display_name, email, monthly_budget_inr, priority"
SCHEMA = (
    """CREATE TABLE IF NOT EXISTS account_profiles (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        monthly_budget_inr INTEGER,
        priority TEXT NOT NULL DEFAULT 'total_cost'
    )""",
    """CREATE TABLE IF NOT EXISTS account_sessions (
        token_hash TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES account_profiles(id) ON DELETE CASCADE,
        expires_at BIGINT NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS account_sessions_expires ON account_sessions (expires_at)",
    """CREATE TABLE IF NOT EXISTS account_identities (
        provider TEXT NOT NULL,
        issuer TEXT NOT NULL,
        subject TEXT NOT NULL,
        account_id TEXT NOT NULL REFERENCES account_profiles(id) ON DELETE CASCADE,
        PRIMARY KEY (provider, issuer, subject)
    )""",
    """CREATE TABLE IF NOT EXISTS account_expenses (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES account_profiles(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
        spent_on TEXT NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS account_expenses_by_month ON account_expenses (account_id, spent_on, id)",
    """CREATE TABLE IF NOT EXISTS expense_repayment_links (
        expense_id TEXT PRIMARY KEY REFERENCES account_expenses(id) ON DELETE CASCADE,
        offer_id TEXT NOT NULL,
        repayment_month INTEGER NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS expense_repayment_links_by_offer ON expense_repayment_links (offer_id, repayment_month)",
    """CREATE TABLE IF NOT EXISTS account_workspaces (
        account_id TEXT PRIMARY KEY REFERENCES account_profiles(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL,
        updated_at BIGINT NOT NULL,
        snapshot TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS workspace_reviewer_codes (
        account_id TEXT PRIMARY KEY REFERENCES account_profiles(id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL UNIQUE,
        expires_at BIGINT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS workspace_reports (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES account_profiles(id) ON DELETE CASCADE,
        reviewer_id TEXT NOT NULL REFERENCES account_profiles(id) ON DELETE CASCADE,
        slot INTEGER NOT NULL,
        created_at BIGINT NOT NULL,
        snapshot TEXT NOT NULL,
        UNIQUE (owner_id, slot)
    )""",
    "CREATE INDEX IF NOT EXISTS workspace_reports_by_reviewer ON workspace_reports (reviewer_id, created_at)",
    """CREATE TABLE IF NOT EXISTS workspace_report_invites (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES account_profiles(id) ON DELETE CASCADE,
        recipient_email TEXT NOT NULL,
        code_hash TEXT NOT NULL UNIQUE,
        expires_at BIGINT NOT NULL,
        slot INTEGER NOT NULL,
        snapshot TEXT NOT NULL,
        UNIQUE (owner_id, slot)
    )""",
)


def password_digest(password, salt):
    return hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=5).hex()


def session_digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


class AccountStore:
    def __init__(self):
        self.database_url = os.getenv("DATABASE_URL")
        self.hosted = os.getenv("RENDER", "").lower() == "true"
        default_path = Path(__file__).resolve().parents[1] / "data" / "accounts.db"
        self.path = Path(os.getenv("ACCOUNT_DB_PATH", str(default_path)))
        self.available = bool(self.database_url) or not self.hosted
        self._schema_lock = Lock()
        self._initialized = False

    @contextmanager
    def connection(self):
        if self.database_url:
            import psycopg
            from psycopg.rows import dict_row

            connection = psycopg.connect(self.database_url, connect_timeout=5, row_factory=dict_row)
        else:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            connection = sqlite3.connect(self.path, timeout=5)
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA foreign_keys = ON")
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def query(self, connection, statement, *parameters):
        if self.database_url:
            statement = statement.replace("?", "%s")
        return connection.execute(statement, parameters)

    def initialize(self):
        if self._initialized:
            return
        with self._schema_lock:
            if self._initialized:
                return
            with self.connection() as connection:
                if self.database_url:
                    # Serialize first-time schema creation across server instances.
                    connection.execute("SELECT pg_advisory_xact_lock(274639158)")
                for statement in SCHEMA:
                    connection.execute(statement)
            self._initialized = True

    def new_session(self, connection, account_id, old_token):
        now = int(time.time())
        token = secrets.token_urlsafe(32)
        self.query(connection, "DELETE FROM account_sessions WHERE expires_at <= ?", now)
        if old_token:
            self.query(connection, "DELETE FROM account_sessions WHERE token_hash = ?", session_digest(old_token))
        self.query(
            connection, "INSERT INTO account_sessions VALUES (?, ?, ?)",
            session_digest(token), account_id, now + SESSION_SECONDS,
        )
        return token

    def register(self, email, display_name, password, old_token):
        self.initialize()
        account_id = str(uuid4())
        salt = secrets.token_bytes(16)
        encoded = f"{salt.hex()}:{password_digest(password, salt)}"
        with self.connection() as connection:
            inserted = self.query(
                connection,
                "INSERT INTO account_profiles (id, email, display_name, password_hash) VALUES (?, ?, ?, ?) "
                "ON CONFLICT (email) DO NOTHING",
                account_id, email, display_name, encoded,
            )
            if inserted.rowcount != 1:
                return None
            return self.new_session(connection, account_id, old_token)

    def authenticate(self, email, password, old_token):
        self.initialize()
        with self.connection() as connection:
            account = self.query(
                connection, "SELECT id, password_hash FROM account_profiles WHERE email = ?", email,
            ).fetchone()
        password_enabled = account and account["password_hash"] != SOCIAL_ONLY
        salt, expected = account["password_hash"].split(":") if password_enabled else ("00" * 16, "00" * 64)
        matches = hmac.compare_digest(password_digest(password, bytes.fromhex(salt)), expected)
        if not password_enabled or not matches:
            return None
        with self.connection() as connection:
            return self.new_session(connection, account["id"], old_token)

    def authenticate_identity(self, provider, issuer, subject, email, name, old_token):
        self.initialize()
        identity_query = "SELECT account_id FROM account_identities WHERE provider = ? AND issuer = ? AND subject = ?"
        identity = (provider, issuer, subject)
        with self.connection() as connection:
            record = self.query(connection, identity_query, *identity).fetchone()
            if record:
                return self.new_session(connection, record["account_id"], old_token)
            if not email:
                return None
            account_id = str(uuid4())
            inserted = self.query(
                connection,
                "INSERT INTO account_profiles (id, email, display_name, password_hash) VALUES (?, ?, ?, ?) "
                "ON CONFLICT (email) DO NOTHING",
                account_id, email, name, SOCIAL_ONLY,
            )
            if inserted.rowcount != 1:
                record = self.query(connection, identity_query, *identity).fetchone()
                return self.new_session(connection, record["account_id"], old_token) if record else None
            linked = self.query(
                connection, "INSERT INTO account_identities VALUES (?, ?, ?, ?) "
                "ON CONFLICT (provider, issuer, subject) DO NOTHING",
                *identity, account_id,
            )
            if linked.rowcount != 1:
                self.query(connection, "DELETE FROM account_profiles WHERE id = ?", account_id)
                record = self.query(connection, identity_query, *identity).fetchone()
                return self.new_session(connection, record["account_id"], old_token)
            return self.new_session(connection, account_id, old_token)

    def profile(self, token, changes=None):
        if not self.available or not token:
            return None
        self.initialize()
        with self.connection() as connection:
            account_id = self.session_account(connection, token)
            if not account_id:
                return None
            if changes is not None:
                self.query(
                    connection, "UPDATE account_profiles SET display_name = ?, monthly_budget_inr = ?, "
                    "priority = ? WHERE id = ?",
                    changes.display_name, changes.monthly_budget_inr, changes.priority, account_id,
                )
            row = self.query(
                connection, f"SELECT {PROFILE_FIELDS} FROM account_profiles WHERE id = ?", account_id,
            ).fetchone()
            return dict(row)

    def session_account(self, connection, token):
        if not token:
            return None
        session = self.query(
            connection, "SELECT account_id FROM account_sessions WHERE token_hash = ? AND expires_at > ?",
            session_digest(token), int(time.time()),
        ).fetchone()
        return session["account_id"] if session else None

    def revoke(self, token):
        if self.available and token:
            self.initialize()
            with self.connection() as connection:
                self.query(connection, "DELETE FROM account_sessions WHERE token_hash = ?", session_digest(token))
