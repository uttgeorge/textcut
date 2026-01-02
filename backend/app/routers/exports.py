from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ulid import ULID
from datetime import datetime, timedelta

from app.database import get_db
from app.models import Project, Transcript, EDL, Export
from app.schemas import (
    APIResponse, ExportRequest, ExportResponse, ExportListResponse,
    ExportStatus, ProjectStatus
)
from app.tasks.export import export_project

router = APIRouter()


@router.post("/{project_id}/export", response_model=APIResponse)
async def create_export(
    project_id: str,
    data: ExportRequest,
    db: AsyncSession = Depends(get_db)
):
    """创建导出任务"""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail={
            "code": "PROJECT_NOT_FOUND",
            "message": "项目不存在"
        })
    
    if project.status != ProjectStatus.READY:
        raise HTTPException(status_code=422, detail={
            "code": "TRANSCRIPT_NOT_READY",
            "message": "项目尚未准备就绪"
        })
    
    # Create export record
    export = Export(
        id=f"export_{ULID()}",
        project_id=project_id,
        format=data.format.value,
        status=ExportStatus.PENDING.value,
    )
    db.add(export)
    await db.commit()
    await db.refresh(export)
    
    # Trigger export task
    task = export_project.delay(
        export_id=export.id,
        project_id=project_id,
        format=data.format.value,
        options=data.options.model_dump() if data.options else {},
    )
    
    # Estimate time based on format
    estimated_time = 30 if data.format.value in ["fcpxml", "premiere_xml", "edl"] else 300
    
    return APIResponse(data=ExportResponse(
        export_id=export.id,
        status=ExportStatus.PENDING,
        format=data.format,
        estimated_time=estimated_time,
    ))


@router.get("/{project_id}/export/{export_id}", response_model=APIResponse)
async def get_export_status(
    project_id: str,
    export_id: str,
    db: AsyncSession = Depends(get_db)
):
    """获取导出状态"""
    export = await db.get(Export, export_id)
    if not export or export.project_id != project_id:
        raise HTTPException(status_code=404, detail={
            "code": "EXPORT_NOT_FOUND",
            "message": "导出任务不存在"
        })
    
    # Check if expired
    if export.expires_at and datetime.utcnow() > export.expires_at:
        raise HTTPException(status_code=422, detail={
            "code": "EXPORT_EXPIRED",
            "message": "导出文件已过期，请重新导出"
        })
    
    return APIResponse(data=ExportResponse(
        export_id=export.id,
        status=ExportStatus(export.status),
        format=export.format,
        download_url=export.file_url,
        expires_at=export.expires_at,
        file_size=export.file_size,
    ))


@router.get("/{project_id}/exports", response_model=APIResponse)
async def list_exports(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """获取项目的所有导出记录"""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail={
            "code": "PROJECT_NOT_FOUND",
            "message": "项目不存在"
        })
    
    stmt = (
        select(Export)
        .where(Export.project_id == project_id)
        .order_by(Export.created_at.desc())
    )
    result = await db.execute(stmt)
    exports = result.scalars().all()
    
    items = [
        ExportResponse(
            export_id=e.id,
            status=ExportStatus(e.status),
            format=e.format,
            download_url=e.file_url if e.status == ExportStatus.COMPLETED.value else None,
            expires_at=e.expires_at,
            file_size=e.file_size,
        )
        for e in exports
    ]
    
    return APIResponse(data=ExportListResponse(items=items))
