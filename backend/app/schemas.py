from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime
from enum import Enum


# Enums
class ProjectStatus(str, Enum):
    EMPTY = "EMPTY"
    UPLOADING = "UPLOADING"
    PROCESSING = "PROCESSING"
    READY = "READY"
    EXPORTING = "EXPORTING"
    ERROR = "ERROR"


class ExportFormat(str, Enum):
    FCPXML = "fcpxml"
    PREMIERE_XML = "premiere_xml"
    EDL = "edl"
    MP4 = "mp4"


class ExportStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


# Base Response
class APIResponse(BaseModel):
    success: bool = True
    data: Optional[Any] = None
    error: Optional[dict] = None


# Project Schemas
class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)


class ProjectResponse(BaseModel):
    id: str
    name: str
    status: ProjectStatus
    video_url: Optional[str] = None
    duration: Optional[float] = None
    thumbnail_url: Optional[str] = None
    processing_progress: int = 0
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProjectListResponse(BaseModel):
    items: list[ProjectResponse]
    total: int
    page: int
    page_size: int


# Transcript Schemas
class Word(BaseModel):
    word: str
    start: float
    end: float


class Segment(BaseModel):
    id: int
    speaker: str
    start: float
    end: float
    text: str
    words: list[Word]


class Silence(BaseModel):
    start: float
    end: float
    duration: float


class TranscriptResponse(BaseModel):
    project_id: str
    duration: float
    language: str
    segments: list[Segment]
    silences: list[Silence]


# Status Schemas
class ProcessingStep(BaseModel):
    name: str
    status: str  # pending, in_progress, completed
    progress: Optional[int] = None


class StatusResponse(BaseModel):
    status: ProjectStatus
    progress: int
    current_step: Optional[str] = None
    steps: list[ProcessingStep]
    estimated_remaining: Optional[int] = None


# EDL Schemas
class DeleteSegmentsOperation(BaseModel):
    type: str = "delete_segments"
    segment_ids: list[int]
    created_at: Optional[str] = None


class DeleteWordsOperation(BaseModel):
    type: str = "delete_words"
    items: list[dict]  # [{segment_id, word_indices}]
    created_at: Optional[str] = None


class DeleteSilencesOperation(BaseModel):
    type: str = "delete_silences"
    threshold: float
    time_ranges: list[dict]  # [{start, end}]
    created_at: Optional[str] = None


class EDLRequest(BaseModel):
    version: int
    operations: list[dict]


class EDLResponse(BaseModel):
    version: int
    updated_at: datetime
    operations: list[dict]


# AI Schemas
class AIInstructionRequest(BaseModel):
    instruction: str
    context: Optional[dict] = None


class AISuggestionPreview(BaseModel):
    segments_to_delete: list[int] = []
    words_to_delete: list[dict] = []
    time_ranges_to_delete: list[dict] = []


class AISuggestionSummary(BaseModel):
    total_duration_removed: float
    segments_affected: int


class AIInstructionResponse(BaseModel):
    action_id: str
    action: str  # delete_silences, delete_segments, delete_words, keep_segments, no_action
    description: str
    preview: AISuggestionPreview
    summary: AISuggestionSummary
    requires_confirmation: bool = True
    expires_at: datetime


class AIConfirmRequest(BaseModel):
    action_id: str
    confirmed: bool


# Export Schemas
class ExportOptions(BaseModel):
    include_subtitles: bool = False
    frame_rate: int = 30


class ExportRequest(BaseModel):
    format: ExportFormat
    options: Optional[ExportOptions] = None


class ExportResponse(BaseModel):
    export_id: str
    status: ExportStatus
    format: ExportFormat
    download_url: Optional[str] = None
    expires_at: Optional[datetime] = None
    file_size: Optional[int] = None
    estimated_time: Optional[int] = None


class ExportListResponse(BaseModel):
    items: list[ExportResponse]
