"""
转写服务 - 集成 WhisperX 和 Pyannote.audio
"""
import gc
import os

# 设置环境变量在导入 torch 之前
os.environ["TORCH_FORCE_WEIGHTS_ONLY_LOAD"] = "0"

import torch

# Monkey patch torch.load 以默认使用 weights_only=False
# 这是为了兼容 PyTorch 2.6+ 的变化
_original_torch_load = torch.load

def _patched_torch_load(*args, **kwargs):
    if 'weights_only' not in kwargs:
        kwargs['weights_only'] = False
    return _original_torch_load(*args, **kwargs)

torch.load = _patched_torch_load

import whisperx
import numpy as np
from pathlib import Path
from typing import Optional, Callable

from app.config import settings


class TranscriptionService:
    """语音转写服务"""
    
    _model = None
    _diarize_model = None
    _align_model = None
    _align_metadata = None
    
    @classmethod
    def get_model(cls):
        """懒加载 WhisperX 模型"""
        if cls._model is None:
            device = settings.WHISPERX_DEVICE
            compute_type = settings.WHISPERX_COMPUTE_TYPE
            
            # 加载 WhisperX 模型
            cls._model = whisperx.load_model(
                settings.WHISPERX_MODEL,
                device=device,
                compute_type=compute_type,
            )
        return cls._model
    
    @classmethod
    def get_diarize_model(cls):
        """懒加载说话人分离模型 (Pyannote)"""
        if cls._diarize_model is None and settings.HF_TOKEN:
            try:
                from pyannote.audio import Pipeline
                cls._diarize_model = Pipeline.from_pretrained(
                    "pyannote/speaker-diarization-3.1",
                    use_auth_token=settings.HF_TOKEN,
                )
                # 设置设备
                if settings.WHISPERX_DEVICE == "cuda":
                    import torch
                    cls._diarize_model.to(torch.device("cuda"))
            except Exception as e:
                print(f"Failed to load diarization model: {e}")
                cls._diarize_model = None
        return cls._diarize_model
    
    @classmethod
    def transcribe(
        cls,
        audio_path: str,
        language: Optional[str] = None,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> dict:
        """
        转写音频文件
        
        Args:
            audio_path: 音频文件路径
            language: 语言代码 (zh, en 等)，None 为自动检测
            progress_callback: 进度回调函数 (progress: int, message: str)
        
        Returns:
            {
                "segments": [...],
                "silences": [...],
                "language": "zh",
                "duration": 120.5
            }
        """
        device = settings.WHISPERX_DEVICE
        
        if progress_callback:
            progress_callback(10, "加载音频文件...")
        
        # 1. 加载音频
        audio = whisperx.load_audio(audio_path)
        duration = len(audio) / 16000  # 16kHz 采样率
        
        if progress_callback:
            progress_callback(15, "开始转写...")
        
        # 2. 转写
        model = cls.get_model()
        result = model.transcribe(
            audio,
            batch_size=settings.WHISPERX_BATCH_SIZE,
            language=language,
        )
        
        detected_language = result.get("language", language or "zh")
        
        if progress_callback:
            progress_callback(40, "对齐词级时间戳...")
        
        # 3. 词级对齐
        try:
            align_model, align_metadata = whisperx.load_align_model(
                language_code=detected_language,
                device=device,
            )
            
            result = whisperx.align(
                result["segments"],
                align_model,
                align_metadata,
                audio,
                device,
                return_char_alignments=False,
            )
            
            # 释放对齐模型内存
            del align_model
            gc.collect()
            if device == "cuda":
                torch.cuda.empty_cache()
                
        except Exception as e:
            # 某些语言可能不支持对齐，继续处理
            print(f"Alignment failed for language {detected_language}: {e}")
        
        if progress_callback:
            progress_callback(60, "说话人分离...")
        
        # 4. 说话人分离 (如果配置了 HF_TOKEN)
        diarize_model = cls.get_diarize_model()
        if diarize_model:
            try:
                # 使用 pyannote 进行说话人分离
                diarize_result = diarize_model(audio_path)
                
                # 将说话人信息分配给片段
                result = cls._assign_speakers(result, diarize_result)
            except Exception as e:
                print(f"Diarization failed: {e}")
        
        if progress_callback:
            progress_callback(80, "检测静音片段...")
        
        # 5. 检测静音
        silences = cls._detect_silences(result.get("segments", []), duration)
        
        if progress_callback:
            progress_callback(90, "整理结果...")
        
        # 6. 格式化输出
        segments = cls._format_segments(result.get("segments", []))
        
        return {
            "segments": segments,
            "silences": silences,
            "language": detected_language,
            "duration": duration,
        }
    
    @classmethod
    def _assign_speakers(cls, result: dict, diarization) -> dict:
        """将说话人信息分配给转写片段"""
        segments = result.get("segments", [])
        
        for segment in segments:
            seg_start = segment.get("start", 0)
            seg_end = segment.get("end", 0)
            seg_mid = (seg_start + seg_end) / 2
            
            # 找到与片段中点重叠的说话人
            speaker = "SPEAKER_00"
            for turn, _, spk in diarization.itertracks(yield_label=True):
                if turn.start <= seg_mid <= turn.end:
                    speaker = spk
                    break
            
            segment["speaker"] = speaker
        
        result["segments"] = segments
        return result
    
    @classmethod
    def _format_segments(cls, raw_segments: list) -> list:
        """格式化片段数据"""
        segments = []
        
        for i, seg in enumerate(raw_segments):
            segment = {
                "id": 1001 + i,
                "speaker": seg.get("speaker", "SPEAKER_01"),
                "start": round(seg.get("start", 0), 2),
                "end": round(seg.get("end", 0), 2),
                "text": seg.get("text", "").strip(),
                "words": [],
            }
            
            # 处理词级时间戳
            for word_info in seg.get("words", []):
                if "start" in word_info and "end" in word_info:
                    segment["words"].append({
                        "word": word_info.get("word", ""),
                        "start": round(word_info.get("start", 0), 2),
                        "end": round(word_info.get("end", 0), 2),
                    })
            
            segments.append(segment)
        
        return segments
    
    @classmethod
    def _detect_silences(
        cls,
        segments: list,
        duration: float,
        min_silence_duration: float = 0.5,
    ) -> list:
        """
        检测静音片段
        
        Args:
            segments: 转写片段
            duration: 总时长
            min_silence_duration: 最小静音时长阈值（秒）
        """
        silences = []
        
        if not segments:
            return silences
        
        # 按开始时间排序
        sorted_segments = sorted(segments, key=lambda x: x.get("start", 0))
        
        # 检测开头静音
        first_start = sorted_segments[0].get("start", 0)
        if first_start >= min_silence_duration:
            silences.append({
                "start": 0,
                "end": round(first_start, 2),
                "duration": round(first_start, 2),
            })
        
        # 检测片段之间的静音
        for i in range(len(sorted_segments) - 1):
            current_end = sorted_segments[i].get("end", 0)
            next_start = sorted_segments[i + 1].get("start", 0)
            gap = next_start - current_end
            
            if gap >= min_silence_duration:
                silences.append({
                    "start": round(current_end, 2),
                    "end": round(next_start, 2),
                    "duration": round(gap, 2),
                })
        
        # 检测结尾静音
        last_end = sorted_segments[-1].get("end", 0)
        if duration - last_end >= min_silence_duration:
            silences.append({
                "start": round(last_end, 2),
                "end": round(duration, 2),
                "duration": round(duration - last_end, 2),
            })
        
        return silences
    
    @classmethod
    def cleanup(cls):
        """释放模型内存"""
        if cls._model is not None:
            del cls._model
            cls._model = None
        
        if cls._diarize_model is not None:
            del cls._diarize_model
            cls._diarize_model = None
        
        gc.collect()
        if settings.WHISPERX_DEVICE == "cuda":
            torch.cuda.empty_cache()


# 单例
transcription_service = TranscriptionService()
