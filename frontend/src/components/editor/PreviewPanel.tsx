import { useRef, useEffect, useState, useMemo } from 'react'
import { Play, Pause, Volume2, VolumeX, Maximize, SkipBack, SkipForward } from 'lucide-react'
import { useProjectStore } from '@/store/project'

interface ClipInfo {
  segment_id: number
  start: number
  end: number
  text: string
  repeat: number
  speed: number
  // 计算后的属性
  timelineStart: number
  timelineEnd: number
}

export function PreviewPanel() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [currentClipIndex, setCurrentClipIndex] = useState(0)
  const [currentRepeat, setCurrentRepeat] = useState(0)

  const {
    project,
    currentTime,
    setCurrentTime,
    isPlaying,
    setIsPlaying,
    timeline,
  } = useProjectStore()

  // 计算时间线片段信息
  const clips: ClipInfo[] = useMemo(() => {
    if (timeline.length === 0) return []

    let offset = 0
    return timeline.map((clip) => {
      const repeat = clip.repeat || 1
      const speed = clip.speed || 1
      const clipDuration = ((clip.end - clip.start) / speed) * repeat
      const info: ClipInfo = {
        segment_id: clip.segment_id,
        start: clip.start,
        end: clip.end,
        text: clip.text,
        repeat,
        speed,
        timelineStart: offset,
        timelineEnd: offset + clipDuration,
      }
      offset += clipDuration
      return info
    })
  }, [timeline])

  const totalDuration = useMemo(() => {
    if (clips.length === 0) return project?.duration || 0
    return clips[clips.length - 1]?.timelineEnd || 0
  }, [clips, project])

  // 计算当前时间线位置
  const timelinePosition = useMemo(() => {
    if (clips.length === 0) return currentTime

    const clip = clips[currentClipIndex]
    if (!clip) return 0

    const speed = clip.speed
    const singleClipDuration = (clip.end - clip.start) / speed
    const offsetInClip = (currentTime - clip.start) / speed
    
    return clip.timelineStart + currentRepeat * singleClipDuration + offsetInClip
  }, [currentTime, clips, currentClipIndex, currentRepeat])

  // 监听视频时间更新
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      const time = video.currentTime
      setCurrentTime(time)

      // 剪辑模式下，检查是否需要跳转
      if (clips.length > 0 && isPlaying) {
        const clip = clips[currentClipIndex]
        if (!clip) return

        // 检查是否到达片段末尾
        if (time >= clip.end - 0.1) {
          // 检查是否需要重复
          if (currentRepeat < clip.repeat - 1) {
            // 还需要重复，跳回片段开头
            video.currentTime = clip.start
            setCurrentRepeat(currentRepeat + 1)
          } else {
            // 跳到下一个片段
            if (currentClipIndex < clips.length - 1) {
              const nextClip = clips[currentClipIndex + 1]
              video.currentTime = nextClip.start
              video.playbackRate = nextClip.speed
              setCurrentClipIndex(currentClipIndex + 1)
              setCurrentRepeat(0)
            } else {
              // 播放完毕
              setIsPlaying(false)
              setCurrentClipIndex(0)
              setCurrentRepeat(0)
            }
          }
        }
      }
    }

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => {
      setIsPlaying(false)
      if (clips.length > 0) {
        setCurrentClipIndex(0)
        setCurrentRepeat(0)
      }
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('ended', handleEnded)

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('ended', handleEnded)
    }
  }, [clips, currentClipIndex, currentRepeat, isPlaying, setCurrentTime, setIsPlaying])

  // 播放/暂停控制
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (isPlaying && video.paused) {
      video.play()
    } else if (!isPlaying && !video.paused) {
      video.pause()
    }
  }, [isPlaying])

  function togglePlay() {
    const video = videoRef.current
    if (!video) return

    if (!isPlaying && clips.length > 0) {
      // 剪辑模式下开始播放
      const clip = clips[currentClipIndex]
      if (clip) {
        video.currentTime = clip.start
        video.playbackRate = clip.speed
      }
    }
    setIsPlaying(!isPlaying)
  }

  function toggleMute() {
    const video = videoRef.current
    if (!video) return
    video.muted = !isMuted
    setIsMuted(!isMuted)
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current
    if (!video) return

    const newPosition = parseFloat(e.target.value)

    if (clips.length > 0) {
      // 剪辑模式：找到对应的片段和位置
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i]
        if (newPosition >= clip.timelineStart && newPosition < clip.timelineEnd) {
          const offsetInTimeline = newPosition - clip.timelineStart
          const singleClipDuration = (clip.end - clip.start) / clip.speed
          const repeatIndex = Math.floor(offsetInTimeline / singleClipDuration)
          const offsetInClip = offsetInTimeline - repeatIndex * singleClipDuration
          const originalTime = clip.start + offsetInClip * clip.speed

          video.currentTime = originalTime
          video.playbackRate = clip.speed
          setCurrentTime(originalTime)
          setCurrentClipIndex(i)
          setCurrentRepeat(repeatIndex)
          return
        }
      }
    } else {
      video.currentTime = newPosition
      setCurrentTime(newPosition)
    }
  }

  function seekTo(time: number) {
    const video = videoRef.current
    if (!video) return

    if (clips.length > 0) {
      // 剪辑模式：找到包含这个时间的片段
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i]
        if (time >= clip.start && time < clip.end) {
          video.currentTime = time
          video.playbackRate = clip.speed
          setCurrentTime(time)
          setCurrentClipIndex(i)
          setCurrentRepeat(0)
          return
        }
      }
      // 如果没找到，跳到第一个片段
      if (clips.length > 0) {
        const firstClip = clips[0]
        video.currentTime = firstClip.start
        video.playbackRate = firstClip.speed
        setCurrentTime(firstClip.start)
        setCurrentClipIndex(0)
        setCurrentRepeat(0)
      }
    } else {
      video.currentTime = time
      setCurrentTime(time)
    }
  }

  function skipBackward() {
    const video = videoRef.current
    if (!video) return

    if (clips.length > 0) {
      // 剪辑模式：跳到上一个片段
      if (currentClipIndex > 0) {
        const prevClip = clips[currentClipIndex - 1]
        video.currentTime = prevClip.start
        video.playbackRate = prevClip.speed
        setCurrentClipIndex(currentClipIndex - 1)
        setCurrentRepeat(0)
      } else {
        // 已经是第一个片段，跳到开头
        const firstClip = clips[0]
        video.currentTime = firstClip.start
        setCurrentRepeat(0)
      }
    } else {
      video.currentTime = Math.max(0, currentTime - 5)
    }
  }

  function skipForward() {
    const video = videoRef.current
    if (!video) return

    if (clips.length > 0) {
      // 剪辑模式：跳到下一个片段
      if (currentClipIndex < clips.length - 1) {
        const nextClip = clips[currentClipIndex + 1]
        video.currentTime = nextClip.start
        video.playbackRate = nextClip.speed
        setCurrentClipIndex(currentClipIndex + 1)
        setCurrentRepeat(0)
      }
    } else {
      video.currentTime = Math.min(totalDuration, currentTime + 5)
    }
  }

  function toggleFullscreen() {
    const video = videoRef.current
    if (!video) return

    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      video.requestFullscreen()
    }
  }

  // Expose seekTo globally
  useEffect(() => {
    (window as any).seekTo = seekTo
    return () => {
      delete (window as any).seekTo
    }
  }, [clips])

  // 显示的时间
  const displayTime = clips.length > 0 ? timelinePosition : currentTime
  const displayDuration = totalDuration

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 预览标题 */}
      <div className="h-8 bg-[#2d2d30] border-b border-[#3e3e42] flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-medium text-[#cccccc]">
          {clips.length > 0 ? '剪辑预览' : '素材预览'}
        </span>
        {clips.length > 0 && (
          <span className="ml-2 text-[10px] text-[#4fc3f7]">
            片段 {currentClipIndex + 1}/{clips.length}
            {clips[currentClipIndex]?.repeat > 1 && ` (${currentRepeat + 1}/${clips[currentClipIndex].repeat})`}
          </span>
        )}
      </div>

      {/* 视频容器 */}
      <div className="flex-1 bg-black flex items-center justify-center min-h-0 overflow-hidden">
        <video
          ref={videoRef}
          src={project?.video_url || undefined}
          className="max-w-full max-h-full object-contain"
        />
      </div>

      {/* 控制栏 */}
      <div className="bg-[#2d2d30] border-t border-[#3e3e42] px-3 py-2 flex-shrink-0">
        {/* 进度条 */}
        <div className="mb-2">
          <input
            type="range"
            min={0}
            max={displayDuration || 1}
            step={0.1}
            value={displayTime}
            onChange={handleSeek}
            className="w-full h-1 bg-[#3e3e42] rounded-full appearance-none cursor-pointer 
              [&::-webkit-slider-thumb]:appearance-none 
              [&::-webkit-slider-thumb]:w-3 
              [&::-webkit-slider-thumb]:h-3 
              [&::-webkit-slider-thumb]:bg-[#0e639c] 
              [&::-webkit-slider-thumb]:rounded-full 
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:hover:bg-[#1177bb]"
            style={{
              background: displayDuration > 0
                ? `linear-gradient(to right, #0e639c ${(displayTime / displayDuration) * 100}%, #3e3e42 ${(displayTime / displayDuration) * 100}%)`
                : '#3e3e42',
            }}
          />
        </div>

        {/* 控制按钮 */}
        <div className="flex items-center gap-1">
          {/* 后退/上一个片段 */}
          <button
            onClick={skipBackward}
            className="p-1 rounded text-[#cccccc] hover:text-white hover:bg-[#3e3e42] transition-colors"
            title={clips.length > 0 ? '上一个片段' : '后退5秒'}
          >
            <SkipBack className="w-4 h-4" />
          </button>

          {/* 播放/暂停 */}
          <button
            onClick={togglePlay}
            className="p-1.5 rounded bg-[#0e639c] hover:bg-[#1177bb] text-white transition-colors"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>

          {/* 前进/下一个片段 */}
          <button
            onClick={skipForward}
            className="p-1 rounded text-[#cccccc] hover:text-white hover:bg-[#3e3e42] transition-colors"
            title={clips.length > 0 ? '下一个片段' : '前进5秒'}
          >
            <SkipForward className="w-4 h-4" />
          </button>

          {/* 时间显示 */}
          <span className="text-[11px] text-[#808080] font-mono ml-2">
            {formatTime(displayTime)} / {formatTime(displayDuration)}
          </span>

          {/* 占位 */}
          <div className="flex-1" />

          {/* 音量 */}
          <button
            onClick={toggleMute}
            className="p-1 rounded text-[#808080] hover:text-[#cccccc] hover:bg-[#3e3e42] transition-colors"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* 全屏 */}
          <button
            onClick={toggleFullscreen}
            className="p-1 rounded text-[#808080] hover:text-[#cccccc] hover:bg-[#3e3e42] transition-colors"
          >
            <Maximize className="w-4 h-4" />
          </button>
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
