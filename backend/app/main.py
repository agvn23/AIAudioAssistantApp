from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from . import models  # noqa: F401  (registers the tables with Base)
from .db import Base, engine
from .routers import analyses, auth, tracks, users
from .services.analysis_runner import mark_interrupted


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Simple table creation for now. Switch to Alembic migrations once the models settle.
    Base.metadata.create_all(engine)
    mark_interrupted()  # analyses left pending/running by a previous process can never finish
    yield


app = FastAPI(title="AI Audio Assistant API", lifespan=lifespan)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(tracks.router)
app.include_router(analyses.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
