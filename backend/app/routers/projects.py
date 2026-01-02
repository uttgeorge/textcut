from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from ulid import ULID
import os

from app.database import get_db
from app.models import Project
from app.schemas import (
    APIResponse, ProjectCreate, ProjectUpdate, ProjectResponse,
    ProjectListResponse, StatusResponse, ProcessingStep, ProjectStatus
)
from app.config import settings
from app.services.storage import storage_service
from app.tasks.transcribe import process_media

router = APIRouter()


@router.post("", response_model=APIResponse)
async def create_project(
    data: ProjectCreate,
    db: AsyncSession = Depends(get_db)
):
    """创建新项目"""
    project = Project(
        id=f"proj_{ULID()}",
        name=data.name,
        status=ProjectStatus.EMPTY.value,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    
    return APIResponse(data=ProjectResponse.model_validate(project))


@router.get("", response_model=APIResponse)
async def list_projects(
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db)
):
    """获取项目列表"""
    page_size = min(page_size, 100)
    offset = (page - 1) * page_size
    
    # Count total
    count_stmt = select(func.count(Project.id))
    total = (await db.execute(count_stmt)).scalar() or 0
    
    # Get items
    stmt = (
        select(Project)
        .order_by(Project.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    result = await db.execute(stmt)
    projects = result.scalars().all()
    
    return APIResponse(data=ProjectListResponse(
        items=[ProjectResponse.model_validate(p) for p in projects],
        total=total,
        page=page,
        page_size=page_size,
    ))


@router.get("/{project_id}", response_model=APIResponse)
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """获取项目详情"""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail={
            "code": "PROJECT_NOT_FOUND",
            "message": "项目不存在"
        })
    
    return APIResponse(data=ProjectResponse.model_validate(project))


@router.patch("/{project_id}", response_model=APIResponse)
async def update_project(
    project_id: str,
    data: ProjectUpdate,
    db: AsyncSession = Depends(get_db)
):
    """更新项目信息"""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail={
            "code": "PROJECT_NOT_FOUND",
            "message": "项目不存在"
        })
    
    if data.name is not None:
        project.name = data.name
    
    await db.commit()
    await db.refresh(project)
    
    return APIResponse(data=ProjectResponse.model_validate(project))


@router.delete("/{project_id}", response_model=APIResponse)
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """删除项目"""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail={
            "code": "PROJECT_NOT_FOUND",
            "message": "项目不存在"
        })
    
    # Delete storage files
    if project.video_key:
        await storage_service.delete(project.video_key)
    
    await db.delete(project)
    await db.commit()
    
    return APIResponse(data={"deleted": True})


@router.post("/{project_id}/upload", response_model=APIResponse)
async def upload_video(
    project_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """上传视频文件"""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail={
            "code": "PROJECT_NOT_FOUND",
            "message": "项目不存在"
        })
    
    if project.status != ProjectStatus.EMPTY.value:
        raise HTTPException(status_code=422, detail={
            "code": "PROJECT_NOT_EMPTY",
            "message": "项目已有视频，请先删除"
        })
    
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail={
            "code": "INVALID_FILE",
            "message": "文件名不能为空"
        })
    
    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=422, detail={
            "code": "INVALID_FILE_TYPE",
            "message": f"不支持的文件格式，仅支持 {', '.join(settings.ALLOWED_EXTENSIONS)}"
        })
    
    # Update status
    project.status = ProjectStatus.UPLOADING.value
    await db.commit()
    
    try:
        # Save file
        file_key = f"videos/{project_id}/original.{ext}"
        video_url = await storage_service.upload(file, file_key)
        
        project.video_key = file_key
        project.video_url = video_url
        project.status = ProjectStatus.PROCESSING.value
        await db.commit()
        
        # Trigger transcription task
        task = process_media.delay(project_id, file_key)
        
        return APIResponse(data={
            "project_id": project_id,
            "status": ProjectStatus.PROCESSING.value,
            "estimated_time": 600,
            "task_id": task.id,
        })
        
    except Exception as e:
        project.status = ProjectStatus.ERROR.value
        project.error_message = str(e)
        await db.commit()
        raise HTTPException(status_code=500, detail={
            "code": "UPLOAD_FAILED",
            "message": f"上传失败: {str(e)}"
        })


@router.get("/{project_id}/status", response_model=APIResponse)
async def get_project_status(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """获取处理状态"""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail={
            "code": "PROJECT_NOT_FOUND",
            "message": "项目不存在"
        })
    
    # Build steps based on progress
    progress = project.processing_progress
    steps = [
        ProcessingStep(
            name="uploading",
            status="completed" if progress > 0 else "pending",
        ),
        ProcessingStep(
            name="extracting_audio",
            status="completed" if progress >= 10 else ("in_progress" if progress > 0 else "pending"),
            progress=min(100, progress * 10) if progress < 10 else 100,
        ),
        ProcessingStep(
            name="transcribing",
            status="completed" if progress >= 70 else ("in_progress" if progress >= 10 else "pending"),
            progress=max(0, min(100, (progress - 10) * 100 // 60)) if 10 <= progress < 70 else (100 if progress >= 70 else 0),
        ),
        ProcessingStep(
            name="aligning",
            status="completed" if progress >= 85 else ("in_progress" if progress >= 70 else "pending"),
            progress=max(0, min(100, (progress - 70) * 100 // 15)) if 70 <= progress < 85 else (100 if progress >= 85 else 0),
        ),
        ProcessingStep(
            name="detecting_silence",
            status="completed" if progress >= 100 else ("in_progress" if progress >= 85 else "pending"),
            progress=max(0, min(100, (progress - 85) * 100 // 15)) if 85 <= progress < 100 else (100 if progress >= 100 else 0),
        ),
    ]
    
    current_step = None
    for step in steps:
        if step.status == "in_progress":
            current_step = step.name
            break
    
    # Estimate remaining time (rough estimate)
    estimated_remaining = None
    if project.status == ProjectStatus.PROCESSING.value:
        estimated_remaining = max(0, (100 - progress) * 6)  # ~6 seconds per percent
    
    return APIResponse(data=StatusResponse(
        status=project.status,
        progress=progress,
        current_step=current_step,
        steps=steps,
        estimated_remaining=estimated_remaining,
    ))
