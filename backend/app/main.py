from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os

from app.config import settings
from app.database import init_db
from app.routers import projects, transcripts, ai, exports


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup - 表已创建，跳过初始化
    # await init_db()
    yield
    # Shutdown


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Routers
app.include_router(projects.router, prefix="/api/v1/projects", tags=["projects"])
app.include_router(transcripts.router, prefix="/api/v1/projects", tags=["transcripts"])
app.include_router(ai.router, prefix="/api/v1/projects", tags=["ai"])
app.include_router(exports.router, prefix="/api/v1/projects", tags=["exports"])


@app.get("/api/v1/health")
async def health_check():
    return {"status": "ok", "service": settings.APP_NAME}


# Mount storage directory for serving video files
storage_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "storage")
if os.path.exists(storage_path):
    app.mount("/storage", StaticFiles(directory=storage_path), name="storage")
