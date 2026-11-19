"""
SQLite persistence layer (stdlib sqlite3) for saved ISA-vs-Loan contracts.
"""

from __future__ import annotations
from contextlib import closing
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

DB_PATH = Path(__file__).parent.parent / "data" / "contracts.db"


def _get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create tables if they don't exist."""
    with closing(_get_conn()) as conn, conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS contracts (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                label      TEXT NOT NULL,
                isa_params TEXT NOT NULL,   -- JSON
                loan_params TEXT NOT NULL,  -- JSON
                created_at TEXT NOT NULL
            )
            """
        )


def save_contract(
    label: str, isa_params: Dict[str, Any], loan_params: Dict[str, Any]
) -> int:
    """
    Persist a contract to the DB and return the new row ID.
    """
    created_at = datetime.now(timezone.utc).isoformat()
    with closing(_get_conn()) as conn, conn:
        cur = conn.execute(
            "INSERT INTO contracts (label, isa_params, loan_params, created_at) VALUES (?, ?, ?, ?)",
            (label, json.dumps(isa_params), json.dumps(loan_params), created_at),
        )
        return cur.lastrowid  # type: ignore[return-value]


def list_contracts(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    """Return a page of saved contracts, newest first."""
    with closing(_get_conn()) as conn:
        rows = conn.execute(
            "SELECT * FROM contracts ORDER BY id DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
    return [
        {
            "id": r["id"],
            "label": r["label"],
            "isa_params": json.loads(r["isa_params"]),
            "loan_params": json.loads(r["loan_params"]),
            "created_at": r["created_at"],
        }
        for r in rows
    ]


def get_contract(contract_id: int) -> Optional[Dict[str, Any]]:
    """Fetch a single contract by ID, or None if not found."""
    with closing(_get_conn()) as conn:
        row = conn.execute(
            "SELECT * FROM contracts WHERE id = ?", (contract_id,)
        ).fetchone()
    if row is None:
        return None
    return {
        "id": row["id"],
        "label": row["label"],
        "isa_params": json.loads(row["isa_params"]),
        "loan_params": json.loads(row["loan_params"]),
        "created_at": row["created_at"],
    }


def delete_contract(contract_id: int) -> bool:
    """Delete a contract. Returns True if a row was removed."""
    with closing(_get_conn()) as conn, conn:
        cur = conn.execute("DELETE FROM contracts WHERE id = ?", (contract_id,))
        return cur.rowcount > 0

