from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(
        title="Bloom API",
        version="0.1.0",
        description="Configurable web interface backend for robot supervision and control.",
    )

    @app.get("/health", tags=["system"])
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "bloom-api"}

    return app


app = create_app()

