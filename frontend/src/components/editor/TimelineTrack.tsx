import { useRef, useEffect, useState, useMemo } from 'react'
import { useProjectStore } from '@/store/project'
import { cn } from '@/lib/utils'
import { Layers, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'

export function TimelineTrack() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1) // 1 = 100px per 10 seconds

  const {
    project,
    transcript,
    timeline,
    currentTime,
    deletedSegmentIds,
    clearTimeline,
  } = useProjectStore()

  const pixelsPerSecond = zoom * 10 // 默认每秒10像素

  // 计算显示的片段和总时长
  const { displaySegments, totalDuration } = useMemo(() => {
    if (timeline.length > 0) {
      // 剪辑模式：按顺序排列片段
      let currentOffset = 0
      const segments = timeline.map((clip, index) => {
        const clipDuration = (clip.end - clip.start) * (clip.repeat || 1) / (clip.speed || 1)
        const segment = {
          id: `timeline-${index}`,
          segment_id: clip.segment_id,
          originalStart: clip.start,
          originalEnd: clip.end,
          displayStart: currentOffset,
          displayEnd: currentOffset + clipDuration,
          text: clip.text,
          repeat: clip.repeat || 1,
          speed: clip.speed || 1,
        }
        currentOffset += clipDuration
        return segment
      })
      return { displaySegments: segments, totalDuration: currentOffset }
    } else {
      // 素材模式：按原始时间排列
      const segments = (transcript?.segments || [])
        .filter(s => !deletedSegmentIds.has(s.id))
        .map(s => ({
          id: `source-${s.id}`,
          segment_id: s.id,
          originalStart: s.start,
          originalEnd: s.end,
          displayStart: s.start,
          displayEnd: s.end,
          text: s.text,
          repeat: 1,
          speed: 1,
        }))
      return { displaySegments: segments, totalDuration: project?.duration || 0 }
    }
  }, [timeline, transcript, deletedSegmentIds, project])

  // 点击时间线跳转
  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left + containerRef.current.scrollLeft
    const clickTime = x / pixelsPerSecond

    // 找到点击位置对应的片段
    const clickedSegment = displaySegments.find(
      s => clickTime >= s.displayStart && clickTime < s.displayEnd
    )

    if (clickedSegment) {
      // 计算在原始视频中的时间
      const offsetInSegment = clickTime - clickedSegment.displayStart
      const originalTime = clickedSegment.originalStart + offsetInSegment * clickedSegment.speed
      const seekTo = (window as any).seekTo
      seekTo?.(Math.max(0, originalTime))
    }
  }

  // 自动滚动到当前时间
  useEffect(() => {
    if (!containerRef.current || timeline.length === 0) return

    // 在剪辑模式下，找到当前时间对应的显示位置
    const currentSegment = displaySegments.find(
      s => currentTime >= s.originalStart && currentTime < s.originalEnd
    )
    if (!currentSegment) return

    const offsetInSegment = (currentTime - currentSegment.originalStart) / currentSegment.speed
    const displayTime = currentSegment.displayStart + offsetInSegment
    const playheadPosition = displayTime * pixelsPerSecond

    const containerWidth = containerRef.current.clientWidth
    const scrollLeft = containerRef.current.scrollLeft

    if (playheadPosition < scrollLeft || playheadPosition > scrollLeft + containerWidth - 100) {
      containerRef.current.scrollTo({
        left: playheadPosition - containerWidth / 2,
        behavior: 'smooth',
      })
    }
  }, [currentTime, pixelsPerSecond, displaySegments, timeline])

  // 计算播放头位置
  const playheadPosition = useMemo(() => {
    if (timeline.length > 0) {
      // 剪辑模式：根据当前时间找到对应的显示位置
      for (const segment of displaySegments) {
        if (currentTime >= segment.originalStart && currentTime < segment.originalEnd) {
          const offsetInSegment = (currentTime - segment.originalStart) / segment.speed
          return (segment.displayStart + offsetInSegment) * pixelsPerSecond
        }
      }
      return 0
    } else {
      // 素材模式：直接使用当前时间
      return currentTime * pixelsPerSecond
    }
  }, [currentTime, displaySegments, timeline, pixelsPerSecond])

  const totalWidth = Math.max(totalDuration * pixelsPerSecond, 100)

  // 颜色数组
  const colors = [
    '#4fc3f7', '#81c784', '#ffb74d', '#f06292', '#ba68c8',
    '#4db6ac', '#aed581', '#ff8a65', '#9575cd', '#7986cb',
  ]

  return (
    <div className="h-full flex flex-col">
      {/* 时间线工具栏 */}
      <div className="h-8 bg-[#2d2d30] border-b border-[#3e3e42] flex items-center px-3 gap-2 flex-shrink-0">
        <Layers className="w-3.5 h-3.5 text-[#808080]" />
        <span className="text-xs font-medium text-[#cccccc]">
          {timeline.length > 0 ? '剪辑时间线' : '素材时间线'}
        </span>

        {/* 剪辑模式信息 */}
        {timeline.length > 0 && (
          <>
            <span className="text-[10px] text-[#4fc3f7] bg-[#4fc3f7]/10 px-1.5 py-0.5 rounded">
              {timeline.length} 个片段
            </span>
            <span className="text-[10px] text-[#808080]">
              {formatTime(totalDuration)}
            </span>
            <button
              onClick={clearTimeline}
              className="flex items-center gap-1 text-[10px] text-[#808080] hover:text-[#cccccc] transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              重置
            </button>
          </>
        )}

        <div className="flex-1" />

        {/* 缩放控制 */}
        <button
          onClick={() => setZoom(Math.max(0.5, zoom - 0.5))}
          className="p-1 rounded text-[#808080] hover:text-[#cccccc] hover:bg-[#3e3e42] transition-colors"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] text-[#808080] w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom(Math.min(4, zoom + 0.5))}
          className="p-1 rounded text-[#808080] hover:text-[#cccccc] hover:bg-[#3e3e42] transition-colors"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 时间刻度 */}
      <div className="h-6 bg-[#1e1e1e] border-b border-[#3e3e42] overflow-hidden flex-shrink-0">
        <div
          className="h-full relative"
          style={{ width: totalWidth }}
        >
          {Array.from({ length: Math.ceil(totalDuration / 5) + 1 }).map((_, i) => {
            const time = i * 5
            return (
              <div
                key={i}
                className="absolute top-0 h-full flex flex-col items-center"
                style={{ left: time * pixelsPerSecond }}
              >
                <div className="w-px h-2 bg-[#3e3e42]" />
                <span className="text-[9px] text-[#808080] font-mono mt-0.5">
                  {formatTime(time)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 时间线轨道 */}
      <div
        ref={containerRef}
        className="flex-1 bg-[#1e1e1e] overflow-x-auto overflow-y-hidden relative"
        onClick={handleTimelineClick}
      >
        <div
          className="h-full relative"
          style={{ width: totalWidth, minWidth: '100%' }}
        >
          {/* 片段 */}
          <div className="absolute top-3 left-0 right-0 h-12">
            {displaySegments.map((segment, index) => {
              const left = segment.displayStart * pixelsPerSecond
              const width = (segment.displayEnd - segment.displayStart) * pixelsPerSecond
              const isActive = currentTime >= segment.originalStart && currentTime < segment.originalEnd

              const color = colors[index % colors.length]

              return (
                <div
                  key={segment.id}
                  className={cn(
                    'absolute h-full rounded overflow-hidden cursor-pointer transition-all',
                    'border-2',
                    isActive ? 'border-white shadow-lg' : 'border-transparent hover:border-[#808080]'
                  )}
                  style={{
                    left,
                    width: Math.max(width, 4),
                    backgroundColor: color + '40',
                    borderColor: isActive ? 'white' : color + '80',
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    const seekTo = (window as any).seekTo
                    seekTo?.(segment.originalStart)
                  }}
                >
                  {/* 片段内容 */}
                  <div
                    className="h-full px-1.5 py-1 overflow-hidden"
                    style={{ backgroundColor: color + '60' }}
                  >
                    <p className="text-[10px] text-white font-medium truncate">
                      {segment.text?.slice(0, 30) || `片段 ${index + 1}`}
                    </p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {segment.repeat > 1 && (
                        <span className="text-[9px] text-white/80 bg-white/20 px-1 rounded">
                          ×{segment.repeat}
                        </span>
                      )}
                      {segment.speed !== 1 && (
                        <span className="text-[9px] text-white/80 bg-white/20 px-1 rounded">
                          {segment.speed}x
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 播放头 */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-[#e51400] z-10 pointer-events-none"
            style={{ left: playheadPosition }}
          >
            {/* 播放头顶部三角 */}
            <div
              className="absolute -top-0 left-1/2 -translate-x-1/2 w-0 h-0"
              style={{
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderTop: '6px solid #e51400',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
