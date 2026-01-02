import os
import json
from pathlib import Path
from datetime import datetime, timedelta
from ulid import ULID
import xml.etree.ElementTree as ET
from xml.dom import minidom

from app.tasks import celery_app
from app.config import settings
from app.models import Project, Transcript, EDL, Export
from app.schemas import ExportStatus

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sync_engine = create_engine(
    settings.DATABASE_URL.replace("+asyncpg", ""),
    echo=settings.DEBUG,
)
SyncSessionLocal = sessionmaker(bind=sync_engine)


@celery_app.task(bind=True, max_retries=3)
def export_project(self, export_id: str, project_id: str, format: str, options: dict):
    """导出项目"""
    try:
        with SyncSessionLocal() as db:
            # 更新状态为处理中
            export = db.query(Export).filter(Export.id == export_id).first()
            if export:
                export.status = ExportStatus.PROCESSING.value
                db.commit()
            
            # 获取项目数据
            project = db.query(Project).filter(Project.id == project_id).first()
            transcript = db.query(Transcript).filter(Transcript.project_id == project_id).first()
            edl = (
                db.query(EDL)
                .filter(EDL.project_id == project_id)
                .order_by(EDL.version.desc())
                .first()
            )
            
            if not project or not transcript:
                raise ValueError("Project or transcript not found")
            
            # 计算保留的片段
            segments = transcript.segments
            operations = edl.operations if edl else []
            
            # 应用 EDL 操作，获取要删除的时间范围
            deleted_ranges = calculate_deleted_ranges(segments, operations)
            
            # 生成导出文件
            storage_path = Path(settings.LOCAL_STORAGE_PATH)
            export_dir = storage_path / "exports" / project_id
            export_dir.mkdir(parents=True, exist_ok=True)
            
            if format == "fcpxml":
                output_path = export_dir / f"{export_id}.fcpxml"
                generate_fcpxml(
                    output_path=str(output_path),
                    project_name=project.name,
                    video_path=project.video_url,
                    duration=float(transcript.duration or 0),
                    deleted_ranges=deleted_ranges,
                    frame_rate=options.get("frame_rate", 30),
                )
            elif format == "premiere_xml":
                output_path = export_dir / f"{export_id}.xml"
                generate_premiere_xml(
                    output_path=str(output_path),
                    project_name=project.name,
                    video_path=project.video_url,
                    duration=float(transcript.duration or 0),
                    deleted_ranges=deleted_ranges,
                    frame_rate=options.get("frame_rate", 30),
                )
            elif format == "edl":
                output_path = export_dir / f"{export_id}.edl"
                generate_edl_file(
                    output_path=str(output_path),
                    project_name=project.name,
                    duration=float(transcript.duration or 0),
                    deleted_ranges=deleted_ranges,
                    frame_rate=options.get("frame_rate", 30),
                )
            else:
                raise ValueError(f"Unsupported format: {format}")
            
            # 更新导出记录
            file_size = output_path.stat().st_size if output_path.exists() else 0
            export.status = ExportStatus.COMPLETED.value
            export.file_url = f"/storage/exports/{project_id}/{output_path.name}"
            export.file_key = f"exports/{project_id}/{output_path.name}"
            export.file_size = file_size
            export.expires_at = datetime.utcnow() + timedelta(days=7)
            db.commit()
            
            return {"status": "success", "export_id": export_id}
            
    except Exception as e:
        with SyncSessionLocal() as db:
            export = db.query(Export).filter(Export.id == export_id).first()
            if export:
                export.status = ExportStatus.FAILED.value
                export.error_message = str(e)
                db.commit()
        
        raise self.retry(exc=e, countdown=30)


def calculate_deleted_ranges(segments: list, operations: list) -> list:
    """根据 EDL 操作计算要删除的时间范围"""
    deleted_ranges = []
    
    # 创建 segment ID 到时间的映射
    segment_map = {seg["id"]: seg for seg in segments}
    
    for op in operations:
        op_type = op.get("type")
        
        if op_type == "delete_segments":
            for seg_id in op.get("segment_ids", []):
                if seg_id in segment_map:
                    seg = segment_map[seg_id]
                    deleted_ranges.append({
                        "start": seg["start"],
                        "end": seg["end"],
                    })
        
        elif op_type == "delete_silences":
            for tr in op.get("time_ranges", []):
                deleted_ranges.append({
                    "start": tr["start"],
                    "end": tr["end"],
                })
        
        elif op_type == "delete_words":
            for item in op.get("items", []):
                seg_id = item.get("segment_id")
                word_indices = item.get("word_indices", [])
                if seg_id in segment_map:
                    seg = segment_map[seg_id]
                    words = seg.get("words", [])
                    for idx in word_indices:
                        if 0 <= idx < len(words):
                            word = words[idx]
                            deleted_ranges.append({
                                "start": word["start"],
                                "end": word["end"],
                            })
    
    # 合并重叠的范围
    deleted_ranges.sort(key=lambda x: x["start"])
    merged = []
    for r in deleted_ranges:
        if merged and r["start"] <= merged[-1]["end"]:
            merged[-1]["end"] = max(merged[-1]["end"], r["end"])
        else:
            merged.append(r)
    
    return merged


def generate_fcpxml(
    output_path: str,
    project_name: str,
    video_path: str,
    duration: float,
    deleted_ranges: list,
    frame_rate: int = 30,
):
    """生成 Final Cut Pro XML"""
    
    # 计算保留的片段
    kept_ranges = calculate_kept_ranges(duration, deleted_ranges)
    
    # 创建 FCPXML 结构
    fcpxml = ET.Element("fcpxml", version="1.10")
    
    # Resources
    resources = ET.SubElement(fcpxml, "resources")
    
    # Format
    format_elem = ET.SubElement(resources, "format")
    format_elem.set("id", "r1")
    format_elem.set("name", f"FFVideoFormat{frame_rate}p")
    format_elem.set("frameDuration", f"1/{frame_rate}s")
    format_elem.set("width", "1920")
    format_elem.set("height", "1080")
    
    # Asset
    asset = ET.SubElement(resources, "asset")
    asset.set("id", "r2")
    asset.set("name", project_name)
    asset.set("src", video_path or "")
    asset.set("duration", f"{duration}s")
    asset.set("hasVideo", "1")
    asset.set("hasAudio", "1")
    
    # Library
    library = ET.SubElement(fcpxml, "library")
    
    # Event
    event = ET.SubElement(library, "event", name=project_name)
    
    # Project
    project = ET.SubElement(event, "project", name=project_name)
    
    # Sequence
    sequence = ET.SubElement(project, "sequence")
    sequence.set("format", "r1")
    
    # Spine
    spine = ET.SubElement(sequence, "spine")
    
    # Add clips for kept ranges
    for i, r in enumerate(kept_ranges):
        clip = ET.SubElement(spine, "clip")
        clip.set("name", f"Clip {i + 1}")
        clip.set("offset", f"{r['start']}s")
        clip.set("duration", f"{r['end'] - r['start']}s")
        clip.set("start", f"{r['start']}s")
        
        # Video reference
        video = ET.SubElement(clip, "video")
        video.set("ref", "r2")
        video.set("offset", f"{r['start']}s")
        video.set("duration", f"{r['end'] - r['start']}s")
    
    # Write to file
    tree = ET.ElementTree(fcpxml)
    xml_str = ET.tostring(fcpxml, encoding="unicode")
    pretty_xml = minidom.parseString(xml_str).toprettyxml(indent="  ")
    
    with open(output_path, "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n')
        f.write('<!DOCTYPE fcpxml>\n')
        # Remove the XML declaration from minidom output
        lines = pretty_xml.split("\n")[1:]
        f.write("\n".join(lines))


def generate_premiere_xml(
    output_path: str,
    project_name: str,
    video_path: str,
    duration: float,
    deleted_ranges: list,
    frame_rate: int = 30,
):
    """生成 Adobe Premiere XML"""
    
    kept_ranges = calculate_kept_ranges(duration, deleted_ranges)
    
    # 创建 Premiere XML 结构
    xmeml = ET.Element("xmeml", version="5")
    
    # Sequence
    sequence = ET.SubElement(xmeml, "sequence")
    ET.SubElement(sequence, "name").text = project_name
    ET.SubElement(sequence, "duration").text = str(int(duration * frame_rate))
    
    # Rate
    rate = ET.SubElement(sequence, "rate")
    ET.SubElement(rate, "timebase").text = str(frame_rate)
    ET.SubElement(rate, "ntsc").text = "FALSE"
    
    # Media
    media = ET.SubElement(sequence, "media")
    video = ET.SubElement(media, "video")
    
    # Track
    track = ET.SubElement(video, "track")
    
    # Add clips
    for i, r in enumerate(kept_ranges):
        clipitem = ET.SubElement(track, "clipitem")
        clipitem.set("id", f"clipitem-{i + 1}")
        
        ET.SubElement(clipitem, "name").text = f"Clip {i + 1}"
        ET.SubElement(clipitem, "start").text = str(int(r["start"] * frame_rate))
        ET.SubElement(clipitem, "end").text = str(int(r["end"] * frame_rate))
        ET.SubElement(clipitem, "in").text = str(int(r["start"] * frame_rate))
        ET.SubElement(clipitem, "out").text = str(int(r["end"] * frame_rate))
        
        # File reference
        file_elem = ET.SubElement(clipitem, "file")
        file_elem.set("id", "file-1")
        ET.SubElement(file_elem, "pathurl").text = video_path or ""
    
    # Write to file
    tree = ET.ElementTree(xmeml)
    xml_str = ET.tostring(xmeml, encoding="unicode")
    pretty_xml = minidom.parseString(xml_str).toprettyxml(indent="  ")
    
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(pretty_xml)


def generate_edl_file(
    output_path: str,
    project_name: str,
    duration: float,
    deleted_ranges: list,
    frame_rate: int = 30,
):
    """生成 CMX3600 EDL 文件"""
    
    kept_ranges = calculate_kept_ranges(duration, deleted_ranges)
    
    lines = [
        f"TITLE: {project_name}",
        f"FCM: NON-DROP FRAME",
        "",
    ]
    
    timeline_pos = 0.0
    
    for i, r in enumerate(kept_ranges):
        edit_num = str(i + 1).zfill(3)
        
        # Convert times to timecode
        src_in = seconds_to_timecode(r["start"], frame_rate)
        src_out = seconds_to_timecode(r["end"], frame_rate)
        rec_in = seconds_to_timecode(timeline_pos, frame_rate)
        rec_out = seconds_to_timecode(timeline_pos + (r["end"] - r["start"]), frame_rate)
        
        line = f"{edit_num}  001      V     C        {src_in} {src_out} {rec_in} {rec_out}"
        lines.append(line)
        
        timeline_pos += r["end"] - r["start"]
    
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def calculate_kept_ranges(duration: float, deleted_ranges: list) -> list:
    """计算保留的时间范围"""
    if not deleted_ranges:
        return [{"start": 0, "end": duration}]
    
    kept = []
    current = 0.0
    
    for d in sorted(deleted_ranges, key=lambda x: x["start"]):
        if d["start"] > current:
            kept.append({"start": current, "end": d["start"]})
        current = max(current, d["end"])
    
    if current < duration:
        kept.append({"start": current, "end": duration})
    
    return kept


def seconds_to_timecode(seconds: float, frame_rate: int = 30) -> str:
    """将秒数转换为时间码"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    frames = int((seconds % 1) * frame_rate)
    
    return f"{hours:02d}:{minutes:02d}:{secs:02d}:{frames:02d}"
