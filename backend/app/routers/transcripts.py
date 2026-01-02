from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ulid import ULID
from datetime import datetime

from app.database import get_db
from app.models import Project, Transcript, EDL
from app.schemas import (
    APIResponse, TranscriptResponse, Segment, Word, Silence,
    EDLRequest, EDLResponse, ProjectStatus
)

router = APIRouter()


@router.get("/{project_id}/transcript", response_model=APIResponse)
async def get_transcript(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """获取完整文稿"""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail={
            "code": "PROJECT_NOT_FOUND",
            "message": "项目不存在"
        })
    
    if project.status != ProjectStatus.READY:
        raise HTTPException(status_code=422, detail={
            "code": "TRANSCRIPT_NOT_READY",
            "message": "文稿尚未生成完成"
        })
    
    # Get transcript
    stmt = select(Transcript).where(Transcript.project_id == project_id)
    result = await db.execute(stmt)
    transcript = result.scalar_one_or_none()
    
    if not transcript:
        raise HTTPException(status_code=404, detail={
            "code": "TRANSCRIPT_NOT_FOUND",
            "message": "文稿不存在"
        })
    
    # Parse segments
    segments = []
    for seg in transcript.segments:
        words = [Word(**w) for w in seg.get("words", [])]
        segments.append(Segment(
            id=seg["id"],
            speaker=seg.get("speaker", "SPEAKER_01"),
            start=seg["start"],
            end=seg["end"],
            text=seg["text"],
            words=words,
        ))
    
    # Parse silences
    silences = []
    for sil in (transcript.silences or []):
        silences.append(Silence(
            start=sil["start"],
            end=sil["end"],
            duration=sil.get("duration", sil["end"] - sil["start"]),
        ))
    
    return APIResponse(data=TranscriptResponse(
        project_id=project_id,
        duration=float(transcript.duration or 0),
        language=transcript.language,
        segments=segments,
        silences=silences,
    ))


@router.get("/{project_id}/edl", response_model=APIResponse)
async def get_edl(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """获取当前 EDL"""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail={
            "code": "PROJECT_NOT_FOUND",
            "message": "项目不存在"
        })
    
    # Get latest EDL
    stmt = (
        select(EDL)
        .where(EDL.project_id == project_id)
        .order_by(EDL.version.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    edl = result.scalar_one_or_none()
    
    if not edl:
        # Return empty EDL
        return APIResponse(data=EDLResponse(
            version=0,
            updated_at=datetime.utcnow(),
            operations=[],
        ))
    
    return APIResponse(data=EDLResponse(
        version=edl.version,
        updated_at=edl.created_at,
        operations=edl.operations,
    ))


@router.put("/{project_id}/edl", response_model=APIResponse)
async def save_edl(
    project_id: str,
    data: EDLRequest,
    db: AsyncSession = Depends(get_db)
):
    """保存 EDL"""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail={
            "code": "PROJECT_NOT_FOUND",
            "message": "项目不存在"
        })
    
    # Check version conflict
    stmt = (
        select(EDL)
        .where(EDL.project_id == project_id)
        .order_by(EDL.version.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    latest_edl = result.scalar_one_or_none()
    
    current_version = latest_edl.version if latest_edl else 0
    if data.version != current_version + 1:
        raise HTTPException(status_code=409, detail={
            "code": "VERSION_CONFLICT",
            "message": f"版本冲突，当前版本为 {current_version}，请先获取最新版本"
        })
    
    # Validate segment IDs if transcript exists
    stmt = select(Transcript).where(Transcript.project_id == project_id)
    result = await db.execute(stmt)
    transcript = result.scalar_one_or_none()
    
    if transcript:
        valid_segment_ids = {seg["id"] for seg in transcript.segments}
        for op in data.operations:
            if op.get("type") == "delete_segments":
                for seg_id in op.get("segment_ids", []):
                    if seg_id not in valid_segment_ids:
                        raise HTTPException(status_code=422, detail={
                            "code": "INVALID_SEGMENT_ID",
                            "message": f"引用了不存在的 segment_id: {seg_id}"
                        })
    
    # Create new EDL version
    edl = EDL(
        id=f"edl_{ULID()}",
        project_id=project_id,
        version=data.version,
        operations=data.operations,
    )
    db.add(edl)
    await db.commit()
    await db.refresh(edl)
    
    return APIResponse(data=EDLResponse(
        version=edl.version,
        updated_at=edl.created_at,
        operations=edl.operations,
    ))
