from sqlalchemy import Column, String, Integer, Text, DECIMAL, TIMESTAMP, ForeignKey, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database import Base


class Project(Base):
    __tablename__ = "projects"
    
    id = Column(String(50), primary_key=True)
    name = Column(String(255), nullable=False)
    status = Column(String(20), nullable=False, default="EMPTY")
    # EMPTY, UPLOADING, PROCESSING, READY, EXPORTING, ERROR
    video_url = Column(Text, nullable=True)
    video_key = Column(String(255), nullable=True)
    duration = Column(DECIMAL(10, 2), nullable=True)
    thumbnail_url = Column(Text, nullable=True)
    processing_progress = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    transcript = relationship("Transcript", back_populates="project", uselist=False)
    edls = relationship("EDL", back_populates="project")
    exports = relationship("Export", back_populates="project")


class Transcript(Base):
    __tablename__ = "transcripts"
    
    id = Column(String(50), primary_key=True)
    project_id = Column(String(50), ForeignKey("projects.id", ondelete="CASCADE"), unique=True, nullable=False)
    language = Column(String(10), default="zh")
    duration = Column(DECIMAL(10, 2), nullable=True)
    segments = Column(JSON, nullable=False, default=list)
    silences = Column(JSON, nullable=True)
    word_count = Column(Integer, nullable=True)
    segment_count = Column(Integer, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    project = relationship("Project", back_populates="transcript")


class EDL(Base):
    __tablename__ = "edls"
    
    id = Column(String(50), primary_key=True)
    project_id = Column(String(50), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    version = Column(Integer, nullable=False, default=1)
    operations = Column(JSON, nullable=False, default=list)
    created_at = Column(TIMESTAMP, server_default=func.now())
    
    # Relationships
    project = relationship("Project", back_populates="edls")


class Export(Base):
    __tablename__ = "exports"
    
    id = Column(String(50), primary_key=True)
    project_id = Column(String(50), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    format = Column(String(20), nullable=False)  # fcpxml, premiere_xml, edl, mp4
    status = Column(String(20), nullable=False, default="pending")
    # pending, processing, completed, failed
    file_url = Column(Text, nullable=True)
    file_key = Column(String(255), nullable=True)
    file_size = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    expires_at = Column(TIMESTAMP, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    
    # Relationships
    project = relationship("Project", back_populates="exports")


class CeleryTask(Base):
    __tablename__ = "celery_tasks"
    
    id = Column(String(255), primary_key=True)
    project_id = Column(String(50), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    task_type = Column(String(50), nullable=False)  # transcribe, render, ai_process
    status = Column(String(20), nullable=False, default="pending")
    progress = Column(Integer, default=0)
    result = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
