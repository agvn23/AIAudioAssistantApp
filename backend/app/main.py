from fastapi import FastAPI

app = FastAPI(title="AI Audio Assistant API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
