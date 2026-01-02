"""
转写任务 - 使用 WhisperX + Pyannote.audio
"""
# 必须在最开始 patch torch.load，在任何其他导入之前
import torch
_original_torch_load = torch.load
def _patched_torch_load(*args, **kwargs):
    if 'weights_only' not in kwargs:
        kwargs['weights_only'] = False
    return _original_torch_load(*args, **kwargs)
torch.load = _patched_torch_load

import os
import subprocess
import json
from pathlib import Path
from ulid import ULID

from app.tasks import celery_app
from app.config import settings
from app.models import Project, Transcript
from app.schemas import ProjectStatus
from app.services.transcription import transcription_service

# 同步数据库会话（Celery 任务中使用）
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sync_engine = create_engine(
    settings.DATABASE_URL.replace("+asyncpg", ""),
    echo=settings.DEBUG,
)
SyncSessionLocal = sessionmaker(bind=sync_engine)


def update_progress(project_id: str, progress: int, status: str = None, message: str = None):
    """更新项目进度"""
    with SyncSessionLocal() as db:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            project.processing_progress = progress
            if status:
                project.status = status
            db.commit()


@celery_app.task(bind=True, max_retries=3)
def process_media(self, project_id: str, video_key: str):
    """
    处理上传的视频文件
    1. 提取音频
    2. 使用 WhisperX 转写
    3. 使用 Pyannote 说话人分离
    4. 检测静音
    5. 保存结果
    """
    try:
        # 获取本地文件路径
        storage_path = Path(settings.LOCAL_STORAGE_PATH)
        video_path = storage_path / video_key
        
        if not video_path.exists():
            raise FileNotFoundError(f"Video file not found: {video_path}")
        
        # 创建临时目录
        temp_dir = storage_path / "temp" / project_id
        temp_dir.mkdir(parents=True, exist_ok=True)
        audio_path = temp_dir / "audio.wav"
        
        # Step 1: 提取音频 (0-10%)
        update_progress(project_id, 5, message="提取音频...")
        extract_audio(str(video_path), str(audio_path))
        update_progress(project_id, 10, message="音频提取完成")
        
        # Step 2-4: 转写 + 对齐 + 说话人分离 (10-90%)
        def progress_callback(progress: int, message: str):
            # 映射进度到 10-90%
            mapped_progress = 10 + int(progress * 0.8)
            update_progress(project_id, mapped_progress, message=message)
        
        result = transcription_service.transcribe(
            str(audio_path),
            language=None,  # 自动检测语言
            progress_callback=progress_callback,
        )
        
        segments = result["segments"]
        silences = result["silences"]
        detected_language = result["language"]
        duration = result["duration"]
        
        update_progress(project_id, 95, message="保存结果...")
        
        # Step 5: 保存结果 (95-100%)
        with SyncSessionLocal() as db:
            # 创建 Transcript 记录
            transcript = Transcript(
                id=f"trans_{ULID()}",
                project_id=project_id,
                language=detected_language,
                duration=duration,
                segments=segments,
                silences=silences,
                word_count=sum(len(seg.get("words", [])) for seg in segments),
                segment_count=len(segments),
            )
            db.add(transcript)
            
            # 更新项目状态
            project = db.query(Project).filter(Project.id == project_id).first()
            if project:
                project.status = ProjectStatus.READY.value
                project.processing_progress = 100
                project.duration = duration
            
            db.commit()
        
        # 清理临时文件
        if audio_path.exists():
            audio_path.unlink()
        
        return {"status": "success", "project_id": project_id}
        
    except Exception as e:
        # 更新错误状态
        with SyncSessionLocal() as db:
            project = db.query(Project).filter(Project.id == project_id).first()
            if project:
                project.status = ProjectStatus.ERROR.value
                project.error_message = str(e)
            db.commit()
        
        raise self.retry(exc=e, countdown=60)


def extract_audio(video_path: str, audio_path: str):
    """使用 FFmpeg 提取音频为 16kHz WAV"""
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-vn",  # 不处理视频
        "-acodec", "pcm_s16le",  # PCM 格式
        "-ar", "16000",  # 16kHz 采样率 (WhisperX 要求)
        "-ac", "1",  # 单声道
        audio_path
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg failed: {result.stderr}")


def get_video_duration(video_path: str) -> float:
    """获取视频时长"""
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "json",
        video_path
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return 0.0
    
    try:
        data = json.loads(result.stdout)
        return float(data["format"]["duration"])
    except (json.JSONDecodeError, KeyError, ValueError):
        return 0.0
