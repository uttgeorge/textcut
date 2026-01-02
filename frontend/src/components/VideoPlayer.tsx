import { useRef, useEffect, useState } from 'react'
import { Play, Pause, Volume2, VolumeX, Maximize, SkipForward } from 'lucide-react'
import { useProjectStore } from '@/store/project'
import { formatTime, cn } from '@/lib/utils'

export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [skipIndicator, setSkipIndicator] = useState<{ visible: boolean; duration: number }>({
    visible: false,
    duration: 0,
  })

  const {
    project,
    currentTime,
    setCurrentTime,
    isPlaying,
    setIsPlaying,
    playbackMode,
    setPlaybackMode,
    skippedSegments,
  } = useProjectStore()

  // Sync video with store
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      const time = video.currentTime
      setCurrentTime(time)

      // Check for skipped segments
      if (playbackMode === 'preview') {
        for (const seg of skippedSegments) {
          if (time >= seg.start && time < seg.end) {
            video.currentTime = seg.end
            setSkipIndicator({
              visible: true,
              duration: seg.end - seg.start,
            })
            setTimeout(() => setSkipIndicator({ visible: false, duration: 0 }), 2000)
            break
          }
        }
      }
    }

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => setIsPlaying(false)

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
  }, [playbackMode, skippedSegments])

  // Play/Pause control
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
    setIsPlaying(!isPlaying)
  }

  function toggleMute() {
    const video = videoRef.current
    if (!video) return

    video.muted = !isMuted
    setIsMuted(!isMuted)
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current
    if (!video) return

    const newVolume = parseFloat(e.target.value)
    video.volume = newVolume
    setVolume(newVolume)
    setIsMuted(newVolume === 0)
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current
    if (!video) return

    const time = parseFloat(e.target.value)
    video.currentTime = time
    setCurrentTime(time)
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

  function seekTo(time: number) {
    const video = videoRef.current
    if (!video) return

    video.currentTime = time
    setCurrentTime(time)
  }

  // Expose seekTo globally for transcript clicks
  useEffect(() => {
    (window as unknown as { seekTo: (time: number) => void }).seekTo = seekTo
    return () => {
      delete (window as unknown as { seekTo?: (time: number) => void }).seekTo
    }
  }, [])

  const duration = project?.duration || 0

  return (
    <div className="h-full flex flex-col">
      {/* Video Container */}
      <div className="flex-1 bg-black rounded-lg overflow-hidden relative">
        <video
          ref={videoRef}
          src={project?.video_url || undefined}
          className="w-full h-full object-contain"
        />

        {/* Skip Indicator */}
        {skipIndicator.visible && (
          <div className="absolute bottom-4 right-4 bg-surface/90 backdrop-blur-sm px-3 py-2 rounded-lg flex items-center gap-2 text-sm">
            <SkipForward className="w-4 h-4 text-primary" />
            <span>跳过了 {skipIndicator.duration.toFixed(1)} 秒</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mt-3 space-y-2">
        {/* Progress Bar */}
        <div className="relative group">
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1 bg-border rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
            style={{
              background: `linear-gradient(to right, #3b82f6 ${(currentTime / duration) * 100}%, #27272a ${(currentTime / duration) * 100}%)`,
            }}
          />
        </div>

        {/* Control Buttons */}
        <div className="flex items-center gap-4">
          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className="p-2 rounded-lg text-text-primary hover:bg-surface-hover transition-colors"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>

          {/* Time Display */}
          <span className="text-sm text-text-secondary font-mono">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Playback Mode */}
          <div className="flex items-center gap-1 bg-surface rounded-lg p-1">
            <button
              onClick={() => setPlaybackMode('original')}
              className={cn(
                'px-3 py-1 rounded text-sm transition-colors',
                playbackMode === 'original'
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:text-text-primary'
              )}
            >
              原始
            </button>
            <button
              onClick={() => setPlaybackMode('preview')}
              className={cn(
                'px-3 py-1 rounded text-sm transition-colors',
                playbackMode === 'preview'
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:text-text-primary'
              )}
            >
              预览
            </button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-20 h-1 bg-border rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full"
            />
          </div>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <Maximize className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
