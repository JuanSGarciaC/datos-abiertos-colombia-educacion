"""Fija una base temporal ANTES de importar la app (el engine se crea al importar)."""
import os
import tempfile

os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
os.environ["LLM_PROVIDER"] = "mock"
