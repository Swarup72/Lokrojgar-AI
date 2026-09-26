from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.recommendations import router as recommendations_router

load_dotenv()

app = FastAPI(
    title="LokRozgar AI Service",
    description=(
        "Stateless recommendation/matching/ranking/explanation service. "
        "Owns no database - Node/Express remains the only owner of MongoDB "
        "and sends this service the data it needs per request."
    ),
)


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    # recommend_jobs_for_worker()/recommend_workers_for_job() raise a plain
    # ValueError for invalid top_k - this turns that into a 400 instead of
    # an unhandled 500, without adding any try/except inside the
    # recommendation layer itself.
    return JSONResponse(status_code=400, content={"detail": str(exc)})


app.include_router(recommendations_router)
