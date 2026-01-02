"""
AI 视频剪辑助手 - ReAct 模式

核心概念：
- 素材（Source）: 原始视频 + 转录的 segments，永不改变
- 时间线（Timeline）: 剪辑后的片段列表，引用素材的时间点
- 渲染（Render）: 根据时间线生成新视频

AI 的工作是：理解用户需求 -> 构建时间线 -> 渲染输出
"""
import json
import subprocess
from pathlib import Path
from typing import Optional
from openai import AsyncOpenAI

from app.config import settings


# 定义剪辑工具 - 操作时间线，支持任意时间段
EDITING_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_timeline",
            "description": "创建剪辑时间线。可以选择任意时间段组合成新视频。支持两种方式：1) 通过 segment_id 引用素材片段；2) 直接指定 start/end 时间（秒）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "clips": {
                        "type": "array",
                        "description": "时间线上的片段列表，按播放顺序排列",
                        "items": {
                            "type": "object",
                            "properties": {
                                "segment_id": {"type": "integer", "description": "引用的素材片段ID（可选，如果提供则使用该片段的时间范围）"},
                                "start": {"type": "number", "description": "开始时间（秒），可以是任意时间点"},
                                "end": {"type": "number", "description": "结束时间（秒），可以是任意时间点"},
                                "text": {"type": "string", "description": "片段对应的文字内容（可选，用于显示）"},
                                "repeat": {"type": "integer", "description": "重复次数，默认1"},
                                "speed": {"type": "number", "description": "播放速度，默认1.0"}
                            },
                            "required": []
                        }
                    }
                },
                "required": ["clips"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "finish_editing",
            "description": "完成剪辑并渲染输出视频。当时间线构建完成后调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "summary": {
                        "type": "string",
                        "description": "剪辑完成的总结说明"
                    }
                },
                "required": ["summary"]
            }
        }
    },
]


class AIAgent:
    """AI 视频剪辑助手 - ReAct 模式"""
    
    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=settings.DEEPSEEK_API_KEY,
            base_url=settings.DEEPSEEK_BASE_URL,
        ) if settings.DEEPSEEK_API_KEY else None
        
        self.model = settings.DEEPSEEK_MODEL
        self.max_iterations = 10
    
    def _get_system_prompt(self, segments: list[dict], silences: list[dict]) -> str:
        """构建系统提示词"""
        total_duration = segments[-1]["end"] if segments else 0
        
        # 构建素材片段信息
        segment_info = []
        for seg in segments[:100]:  # 最多100个片段
            segment_info.append({
                "id": seg["id"],
                "start": round(seg["start"], 2),
                "end": round(seg["end"], 2),
                "duration": round(seg["end"] - seg["start"], 2),
                "text": seg["text"],
            })
        
        return f"""你是一个专业的视频剪辑助手。

## 核心概念
- **素材**: 原始视频的转录片段，每个片段有唯一ID、时间范围和文字内容
- **时间线**: 你要创建的剪辑结果，可以是任意时间段的组合
- 剪辑不会修改素材，只是选择和组合时间段

## 你的任务
根据用户的需求，分析素材内容，创建一个新的时间线。你可以：
1. 选择任意时间段（不必局限于预设片段的边界）
2. 组合多个时间段
3. 重复播放某个时间段
4. 调整播放速度

## 素材信息
- 总时长: {total_duration:.1f} 秒
- 片段数: {len(segments)} 个

## 素材片段（供参考，你可以选择任意时间段）
```json
{json.dumps(segment_info, ensure_ascii=False, indent=2)}
```

## 可用工具
1. `create_timeline`: 创建时间线
   - 可以通过 segment_id 引用预设片段
   - 也可以直接指定 start/end 时间（秒），选择任意时间段
   - 支持设置 repeat（重复次数）和 speed（播放速度）
2. `finish_editing`: 完成剪辑并渲染视频

## 示例

### 示例1：选择预设片段
```json
{{"clips": [{{"segment_id": 0}}, {{"segment_id": 5}}, {{"segment_id": 10}}]}}
```

### 示例2：选择任意时间段
```json
{{"clips": [
  {{"start": 10.5, "end": 15.2, "text": "精彩片段1"}},
  {{"start": 30.0, "end": 35.5, "text": "精彩片段2"}},
  {{"start": 50.0, "end": 52.0, "text": "重复片段", "repeat": 3}}
]}}
```

### 示例3：混合使用
```json
{{"clips": [
  {{"segment_id": 0}},
  {{"start": 20.0, "end": 25.0, "text": "自定义片段"}},
  {{"segment_id": 10, "repeat": 2, "speed": 1.5}}
]}}
```

## 重要规则
1. 直接执行，不要询问确认
2. 根据内容语义选择片段，不要随机选
3. 时间线中的片段按播放顺序排列
4. 可以重复使用同一个时间段（设置 repeat）
5. 可以调整播放速度（设置 speed）
6. 选择时间段时，可以精确到小数点（如 10.5 秒）"""
    
    async def run(
        self,
        message: str,
        segments: list[dict],
        silences: list[dict],
        video_path: str,
        project_id: str,
        history: list[dict] = None,
    ) -> dict:
        """
        ReAct 模式运行
        
        Returns:
            {
                "reply": "最终回复",
                "timeline": [...],  # 时间线
                "output_video": "输出视频路径" | None,
                "finished": bool,
            }
        """
        if not self.client:
            return {
                "reply": "AI 服务未配置，请设置 DEEPSEEK_API_KEY",
                "timeline": [],
                "output_video": None,
                "finished": False,
            }
        
        # 初始化
        messages = [
            {"role": "system", "content": self._get_system_prompt(segments, silences)},
        ]
        
        if history:
            for h in history[-10:]:
                messages.append({"role": h["role"], "content": h["content"]})
        
        messages.append({"role": "user", "content": message})
        
        timeline = []  # 当前时间线
        iteration = 0
        final_reply = ""
        output_video = None
        finished = False
        
        print(f"\n{'='*80}")
        print(f"[ReAct] Starting: {message}")
        print(f"{'='*80}\n")
        
        # ReAct 循环
        while iteration < self.max_iterations:
            iteration += 1
            print(f"\n[ReAct] Iteration {iteration}")
            
            try:
                response = await self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    tools=EDITING_TOOLS,
                    tool_choice="auto",
                    temperature=0.3,
                    max_tokens=4096,
                )
                
                assistant_message = response.choices[0].message
                print(f"[ReAct] Response: content={bool(assistant_message.content)}, tool_calls={bool(assistant_message.tool_calls)}")
                
                # 没有工具调用，结束循环
                if not assistant_message.tool_calls:
                    final_reply = assistant_message.content or "完成"
                    print(f"[ReAct] No tool calls, ending")
                    break
                
                # 处理工具调用
                tool_results = []
                for tool_call in assistant_message.tool_calls:
                    tool_name = tool_call.function.name
                    tool_args = json.loads(tool_call.function.arguments)
                    
                    print(f"[ReAct] Tool: {tool_name}")
                    
                    if tool_name == "create_timeline":
                        # 创建时间线
                        clips = tool_args.get("clips", [])
                        timeline = self._build_timeline(clips, segments)
                        
                        result = {
                            "success": True,
                            "timeline_length": len(timeline),
                            "total_duration": sum(
                                (c["end"] - c["start"]) * c.get("repeat", 1) / c.get("speed", 1.0)
                                for c in timeline
                            ),
                            "message": f"时间线已创建，包含 {len(timeline)} 个片段"
                        }
                        print(f"[ReAct] Timeline created: {len(timeline)} clips")
                        
                    elif tool_name == "finish_editing":
                        # 渲染视频
                        summary = tool_args.get("summary", "剪辑完成")
                        
                        if not timeline:
                            result = {"success": False, "error": "时间线为空，请先创建时间线"}
                        else:
                            output_video = await self._render_video(
                                video_path=video_path,
                                project_id=project_id,
                                timeline=timeline,
                                segments=segments,
                            )
                            
                            if output_video:
                                final_reply = f"{summary}\n\n视频已渲染完成。"
                                finished = True
                                result = {"success": True, "output": output_video}
                                print(f"[ReAct] Finished! Output: {output_video}")
                            else:
                                result = {"success": False, "error": "渲染失败"}
                        
                        if finished:
                            break
                    else:
                        result = {"error": f"未知工具: {tool_name}"}
                    
                    tool_results.append({
                        "tool_call_id": tool_call.id,
                        "output": json.dumps(result, ensure_ascii=False),
                    })
                
                if finished:
                    break
                
                # 添加到对话历史
                messages.append({
                    "role": "assistant",
                    "content": assistant_message.content,
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            }
                        }
                        for tc in assistant_message.tool_calls
                    ],
                })
                
                for tr in tool_results:
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tr["tool_call_id"],
                        "content": tr["output"],
                    })
                
            except Exception as e:
                print(f"[ReAct] Error: {e}")
                import traceback
                traceback.print_exc()
                final_reply = f"处理出错: {str(e)}"
                break
        
        if iteration >= self.max_iterations:
            final_reply = "达到最大迭代次数"
        
        return {
            "reply": final_reply,
            "timeline": timeline,
            "output_video": output_video,
            "finished": finished,
        }
    
    def _build_timeline(self, clips: list[dict], segments: list[dict]) -> list[dict]:
        """根据 clips 构建时间线，支持任意时间段"""
        segment_map = {s["id"]: s for s in segments}
        timeline = []
        
        for clip in clips:
            # 方式1：通过 segment_id 引用预设片段
            seg_id = clip.get("segment_id")
            if seg_id is not None and seg_id in segment_map:
                seg = segment_map[seg_id]
                timeline.append({
                    "segment_id": seg_id,
                    "start": seg["start"],
                    "end": seg["end"],
                    "text": seg["text"],
                    "repeat": clip.get("repeat", 1),
                    "speed": clip.get("speed", 1.0),
                })
            # 方式2：直接指定 start/end 时间
            elif "start" in clip and "end" in clip:
                start = float(clip["start"])
                end = float(clip["end"])
                if end > start:
                    timeline.append({
                        "segment_id": None,  # 自定义时间段，没有 segment_id
                        "start": start,
                        "end": end,
                        "text": clip.get("text", f"{start:.1f}s - {end:.1f}s"),
                        "repeat": clip.get("repeat", 1),
                        "speed": clip.get("speed", 1.0),
                    })
        
        return timeline
    
    async def _render_video(
        self,
        video_path: str,
        project_id: str,
        timeline: list[dict],
        segments: list[dict],
    ) -> Optional[str]:
        """根据时间线渲染视频"""
        try:
            if not timeline:
                print("[Render] Empty timeline")
                return None
            
            # 路径处理
            storage_path = Path(settings.LOCAL_STORAGE_PATH)
            output_dir = storage_path / "renders" / project_id
            output_dir.mkdir(parents=True, exist_ok=True)
            
            if video_path.startswith("/storage/"):
                actual_video_path = str(storage_path / video_path.lstrip("/storage/"))
            elif video_path.startswith("storage/"):
                actual_video_path = str(storage_path / video_path.lstrip("storage/"))
            else:
                actual_video_path = video_path
            
            print(f"[Render] Video: {actual_video_path}")
            print(f"[Render] Timeline: {len(timeline)} clips")
            
            import time
            output_filename = f"output_{int(time.time())}.mp4"
            output_path = output_dir / output_filename
            
            # 构建 FFmpeg filter complex
            filter_parts = []
            concat_inputs = []
            
            for clip in timeline:
                start = clip["start"]
                end = clip["end"]
                speed = clip.get("speed", 1.0)
                repeat = clip.get("repeat", 1)
                
                for _ in range(repeat):
                    idx = len(concat_inputs)
                    
                    # 裁剪
                    filter_parts.append(f"[0:v]trim=start={start}:end={end},setpts=PTS-STARTPTS[v{idx}];")
                    filter_parts.append(f"[0:a]atrim=start={start}:end={end},asetpts=PTS-STARTPTS[a{idx}];")
                    
                    # 变速
                    if speed != 1.0:
                        filter_parts.append(f"[v{idx}]setpts={1/speed}*PTS[v{idx}s];")
                        filter_parts.append(f"[a{idx}]atempo={speed}[a{idx}s];")
                        concat_inputs.append(f"[v{idx}s][a{idx}s]")
                    else:
                        concat_inputs.append(f"[v{idx}][a{idx}]")
            
            # 拼接
            filter_parts.append(f"{''.join(concat_inputs)}concat=n={len(concat_inputs)}:v=1:a=1[outv][outa]")
            filter_complex = "".join(filter_parts)
            
            cmd = [
                "ffmpeg", "-y",
                "-i", actual_video_path,
                "-filter_complex", filter_complex,
                "-map", "[outv]",
                "-map", "[outa]",
                "-c:v", "libx264",
                "-c:a", "aac",
                str(output_path),
            ]
            
            print(f"[Render] Running FFmpeg...")
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode != 0:
                print(f"[Render] FFmpeg error: {result.stderr[:500]}")
                return None
            
            # 返回相对路径
            relative_path = f"storage/renders/{project_id}/{output_filename}"
            print(f"[Render] Success: {relative_path}")
            return relative_path
            
        except Exception as e:
            print(f"[Render] Error: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    # === 兼容旧接口 ===
    
    async def chat(
        self,
        message: str,
        segments: list[dict],
        silences: list[dict],
        history: list[dict] = None,
    ) -> dict:
        """兼容旧接口"""
        return {
            "reply": "请使用 /ai/edit 接口进行 End-to-End 剪辑",
            "action": None,
        }
    
    async def process_instruction(
        self,
        instruction: str,
        segments: list[dict],
        silences: list[dict],
        context: Optional[dict] = None,
    ) -> dict:
        """兼容旧接口"""
        return {
            "action": "no_action",
            "description": "请使用 /ai/edit 接口",
        }


ai_agent = AIAgent()
