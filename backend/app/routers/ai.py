from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ulid import ULID
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel
import json

from app.database import get_db
from app.models import Project, Transcript, EDL
from app.schemas import (
    APIResponse, AIInstructionRequest, AIInstructionResponse,
    AIConfirmRequest, AISuggestionPreview, AISuggestionSummary,
    EDLResponse, ProjectStatus
)
from app.services.ai_agent import ai_agent

router = APIRouter()

# In-memory cache for pending AI suggestions (in production, use Redis)
pending_suggestions: dict[str, dict] = {}

# Chat history cache (in production, use Redis)
chat_histories: dict[str, list] = {}


class AIChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


class AIChatResponse(BaseModel):
    reply: str
    action: Optional[dict] = None
    session_id: str


class AIEditRequest(BaseModel):
    """End-to-End AI 剪辑请求"""
    instruction: str  # 用户的剪辑指令


class AIEditResponse(BaseModel):
    """End-to-End AI 剪辑响应"""
    reply: str
    timeline: list[dict]  # 时间线（剪辑结果）
    output_video: Optional[str] = None  # 输出视频路径
    finished: bool


@router.post("/{project_id}/ai/instruction", response_model=APIResponse)
async def send_ai_instruction(
    project_id: str,
    data: AIInstructionRequest,
    db: AsyncSession = Depends(get_db)
):
    """发送 AI 指令"""
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
    
    # Process instruction with AI
    try:
        ai_result = await ai_agent.process_instruction(
            instruction=data.instruction,
            segments=transcript.segments,
            silences=transcript.silences or [],
            context=data.context,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail={
            "code": "AI_PROCESSING_FAILED",
            "message": f"AI 处理失败: {str(e)}"
        })
    
    # Generate action ID
    action_id = f"action_{ULID()}"
    expires_at = datetime.utcnow() + timedelta(minutes=5)
    
    # Store pending suggestion
    pending_suggestions[action_id] = {
        "project_id": project_id,
        "result": ai_result,
        "expires_at": expires_at,
    }
    
    return APIResponse(data=AIInstructionResponse(
        action_id=action_id,
        action=ai_result["action"],
        description=ai_result["description"],
        preview=AISuggestionPreview(
            segments_to_delete=ai_result.get("segments_to_delete", []),
            words_to_delete=ai_result.get("words_to_delete", []),
            time_ranges_to_delete=ai_result.get("time_ranges_to_delete", []),
        ),
        summary=AISuggestionSummary(
            total_duration_removed=ai_result.get("total_duration_removed", 0),
            segments_affected=ai_result.get("segments_affected", 0),
        ),
        requires_confirmation=ai_result["action"] != "no_action",
        expires_at=expires_at,
    ))


@router.post("/{project_id}/ai/confirm", response_model=APIResponse)
async def confirm_ai_suggestion(
    project_id: str,
    data: AIConfirmRequest,
    db: AsyncSession = Depends(get_db)
):
    """确认 AI 建议"""
    # Check if suggestion exists
    suggestion = pending_suggestions.get(data.action_id)
    if not suggestion:
        raise HTTPException(status_code=404, detail={
            "code": "ACTION_NOT_FOUND",
            "message": "找不到对应的 AI 建议"
        })
    
    # Check if expired
    if datetime.utcnow() > suggestion["expires_at"]:
        del pending_suggestions[data.action_id]
        raise HTTPException(status_code=422, detail={
            "code": "ACTION_EXPIRED",
            "message": "AI 建议已过期（超过 5 分钟未确认）"
        })
    
    # Check project match
    if suggestion["project_id"] != project_id:
        raise HTTPException(status_code=422, detail={
            "code": "PROJECT_MISMATCH",
            "message": "项目不匹配"
        })
    
    if not data.confirmed:
        # User rejected the suggestion
        del pending_suggestions[data.action_id]
        return APIResponse(data={
            "applied": False,
        })
    
    # Apply the suggestion to EDL
    ai_result = suggestion["result"]
    
    # Get current EDL version
    stmt = (
        select(EDL)
        .where(EDL.project_id == project_id)
        .order_by(EDL.version.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    latest_edl = result.scalar_one_or_none()
    
    current_version = latest_edl.version if latest_edl else 0
    new_version = current_version + 1
    
    # Build operation based on action type
    operation = {
        "created_at": datetime.utcnow().isoformat(),
    }
    
    if ai_result["action"] == "delete_silences":
        operation["type"] = "delete_silences"
        operation["threshold"] = ai_result.get("threshold", 0)
        operation["time_ranges"] = ai_result.get("time_ranges_to_delete", [])
    elif ai_result["action"] == "delete_segments":
        operation["type"] = "delete_segments"
        operation["segment_ids"] = ai_result.get("segments_to_delete", [])
    elif ai_result["action"] == "delete_words":
        operation["type"] = "delete_words"
        operation["items"] = ai_result.get("words_to_delete", [])
    else:
        # no_action or keep_segments
        del pending_suggestions[data.action_id]
        return APIResponse(data={
            "applied": False,
            "reason": "无需操作"
        })
    
    # Get existing operations
    existing_operations = latest_edl.operations if latest_edl else []
    new_operations = existing_operations + [operation]
    
    # Create new EDL
    edl = EDL(
        id=f"edl_{ULID()}",
        project_id=project_id,
        version=new_version,
        operations=new_operations,
    )
    db.add(edl)
    await db.commit()
    
    # Clean up
    del pending_suggestions[data.action_id]
    
    return APIResponse(data={
        "edl_version": new_version,
        "applied": True,
    })


@router.post("/{project_id}/ai/chat", response_model=APIResponse)
async def chat_with_ai(
    project_id: str,
    data: AIChatRequest,
    db: AsyncSession = Depends(get_db)
):
    """与 AI 助手对话"""
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
    
    # Get or create session
    session_id = data.session_id or f"chat_{ULID()}"
    history = chat_histories.get(session_id, [])
    
    # Chat with AI
    try:
        chat_result = await ai_agent.chat(
            message=data.message,
            segments=transcript.segments,
            silences=transcript.silences or [],
            history=history,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail={
            "code": "AI_PROCESSING_FAILED",
            "message": f"AI 处理失败: {str(e)}"
        })
    
    # Update history
    history.append({"role": "user", "content": data.message})
    history.append({"role": "assistant", "content": chat_result["reply"]})
    chat_histories[session_id] = history[-20:]  # Keep last 20 messages
    
    # If there's an action, store it for confirmation and format properly for frontend
    formatted_action = None
    if chat_result.get("action"):
        action_id = f"action_{ULID()}"
        expires_at = datetime.utcnow() + timedelta(minutes=5)
        raw_action = chat_result["action"]
        
        # Store the raw action for confirmation endpoint
        pending_suggestions[action_id] = {
            "project_id": project_id,
            "result": raw_action,
            "expires_at": expires_at,
        }
        
        # Format the action to match frontend AISuggestion type
        # Include all fields from raw_action, plus structured preview/summary
        formatted_action = {
            "action_id": action_id,
            "action": raw_action.get("action", "no_action"),
            "description": raw_action.get("description", ""),
            # Standard preview fields
            "preview": {
                "segments_to_delete": raw_action.get("segments_to_delete", []),
                "words_to_delete": raw_action.get("words_to_delete", []),
                "time_ranges_to_delete": raw_action.get("time_ranges_to_delete", []),
            },
            "summary": {
                "total_duration_removed": raw_action.get("total_duration_removed", 0),
                "segments_affected": raw_action.get("segments_affected", 0),
            },
            # Pass through all other fields for new action types
            "segments_to_delete": raw_action.get("segments_to_delete", []),
            "words_to_delete": raw_action.get("words_to_delete", []),
            "time_ranges_to_delete": raw_action.get("time_ranges_to_delete", []),
            "segments_affected": raw_action.get("segments_affected", 0),
            "total_duration_removed": raw_action.get("total_duration_removed", 0),
            # New action type fields
            "highlight_segments": raw_action.get("highlight_segments"),
            "highlight_info": raw_action.get("highlight_info"),
            "suggested_duplicates": raw_action.get("suggested_duplicates"),
            "duplicate_items": raw_action.get("duplicate_items"),
            "total_duration_added": raw_action.get("total_duration_added"),
            "new_segment_order": raw_action.get("new_segment_order"),
            "speed_items": raw_action.get("speed_items"),
            "global_speed": raw_action.get("global_speed"),
            "threshold": raw_action.get("threshold"),
            # Metadata
            "requires_confirmation": raw_action.get("action", "no_action") != "no_action",
            "expires_at": expires_at.isoformat(),
        }
    
    return APIResponse(data=AIChatResponse(
        reply=chat_result["reply"],
        action=formatted_action,
        session_id=session_id,
    ))


@router.post("/{project_id}/ai/edit", response_model=APIResponse)
async def ai_edit_video(
    project_id: str,
    data: AIEditRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    End-to-End AI 视频剪辑
    
    AI 会根据用户指令自动完成所有剪辑操作并渲染输出视频。
    这是一个 ReAct 模式的接口，AI 会循环执行直到任务完成。
    """
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
    
    # Run AI agent in ReAct mode
    try:
        edit_result = await ai_agent.run(
            message=data.instruction,
            segments=transcript.segments,
            silences=transcript.silences or [],
            video_path=project.video_url,
            project_id=project_id,
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail={
            "code": "AI_PROCESSING_FAILED",
            "message": f"AI 处理失败: {str(e)}"
        })
    
    # 如果完成了，保存时间线到 EDL
    if edit_result.get("finished") and edit_result.get("timeline"):
        # Get current EDL version
        stmt = (
            select(EDL)
            .where(EDL.project_id == project_id)
            .order_by(EDL.version.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        latest_edl = result.scalar_one_or_none()
        
        current_version = latest_edl.version if latest_edl else 0
        new_version = current_version + 1
        
        # 将时间线保存为 EDL
        timeline = edit_result["timeline"]
        edl = EDL(
            id=f"edl_{ULID()}",
            project_id=project_id,
            version=new_version,
            operations=[{
                "type": "timeline",
                "clips": timeline,
                "created_at": datetime.utcnow().isoformat(),
            }],
        )
        db.add(edl)
        await db.commit()
    
    return APIResponse(data=AIEditResponse(
        reply=edit_result["reply"],
        timeline=edit_result.get("timeline", []),
        output_video=edit_result.get("output_video"),
        finished=edit_result.get("finished", False),
    ))
