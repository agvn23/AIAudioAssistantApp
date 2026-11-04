from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError, ProgrammingError

from . import models  # noqa: F401  (registers the tables with Base)
from .config import settings
from .error_handling import ERROR_RESPONSES, install_error_handling
from .request_limits import BodySizeLimitMiddleware, request_limit_bytes
from .routers import analyses, auth, tracks, users
from .services.analysis_runner import mark_interrupted


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # The schema is created by Alembic (`alembic upgrade head`), not by the app. The tests
    # create their tables themselves (see tests/conftest.py).
    try:
        # Analyses left pending/running by a previous process can never finish.
        mark_interrupted()
    except (OperationalError, ProgrammingError) as exc:
        raise RuntimeError(
            "The database has no tables yet, or they are out of date. "
            "Run `alembic upgrade head` from the backend directory, then start the server again."
        ) from exc
    yield


app = FastAPI(title="AI Audio Assistant API", lifespan=lifespan, responses=ERROR_RESPONSES)

# Middleware order matters: the one added LAST is the outermost. From the inside out:
#   body-size limit -> request id + catch-all 500 -> CORS
# CORS is outermost so that every response, including 413, 429 and 500, carries its headers.
app.add_middleware(BodySizeLimitMiddleware, limit_for=request_limit_bytes)
install_error_handling(app)  # adds the request id / catch-all middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,  # bearer tokens travel in a header; there are no cookies
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["X-Request-ID", "Retry-After"],
    max_age=600,
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(tracks.router)
app.include_router(analyses.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
