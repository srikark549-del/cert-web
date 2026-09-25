"""Postgres-backed storage for the certificate portal.

Replaces the old JSON-on-disk state (and template/generated-PDF files on
disk) with two small tables in your Neon Postgres database:

  certificate_portal_state  -- a single JSON blob holding all app state
  certificate_portal_files  -- raw bytes for uploaded templates and
                                generated certificate PDFs

Nothing about the API surface changes; this module is only called from
certificate_api.py.
"""

import os
from contextlib import contextmanager

import psycopg2
import psycopg2.extras

_DDL = """
CREATE TABLE IF NOT EXISTS certificate_portal_state (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS certificate_portal_files (
    key TEXT PRIMARY KEY,
    filename TEXT,
    content_type TEXT,
    data BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""

_STATE_KEY = "portal_state"
_initialized = False


def _dsn():
    for name in (
        "DATABASE_URL",
        "POSTGRES_URL",
        "POSTGRES_URL_NON_POOLING",
        "POSTGRES_PRISMA_URL",
        "NEON_DATABASE_URL",
    ):
        value = os.getenv(name)
        if value:
            return value
    raise RuntimeError(
        "No Postgres connection string found. Set DATABASE_URL "
        "(the Neon connection string) in your environment."
    )


@contextmanager
def _connect():
    conn = psycopg2.connect(_dsn())
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init():
    """Create the tables if they don't exist yet. Safe to call repeatedly."""
    global _initialized
    if _initialized:
        return
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(_DDL)
    _initialized = True


def load_state():
    """Return the saved state dict, or None if nothing has been saved yet."""
    init()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT value FROM certificate_portal_state WHERE key = %s",
                (_STATE_KEY,),
            )
            row = cur.fetchone()
    return row[0] if row else None


def save_state(state):
    init()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO certificate_portal_state (key, value, updated_at)
                VALUES (%s, %s, now())
                ON CONFLICT (key) DO UPDATE
                    SET value = EXCLUDED.value, updated_at = now()
                """,
                (_STATE_KEY, psycopg2.extras.Json(state)),
            )


def save_file(key, filename, data, content_type=None):
    """Store (or replace) the bytes for `key`."""
    init()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO certificate_portal_files (key, filename, content_type, data, created_at)
                VALUES (%s, %s, %s, %s, now())
                ON CONFLICT (key) DO UPDATE
                    SET filename = EXCLUDED.filename,
                        content_type = EXCLUDED.content_type,
                        data = EXCLUDED.data,
                        created_at = now()
                """,
                (key, filename, content_type, psycopg2.Binary(data)),
            )


def load_file(key):
    """Return {"filename", "content_type", "data"} for `key`, or None."""
    init()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT filename, content_type, data FROM certificate_portal_files WHERE key = %s",
                (key,),
            )
            row = cur.fetchone()
    if row is None:
        return None
    filename, content_type, data = row
    return {"filename": filename, "content_type": content_type, "data": bytes(data)}


def delete_file(key):
    init()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM certificate_portal_files WHERE key = %s", (key,))
