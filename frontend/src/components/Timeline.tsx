import { useRef, useEffect, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { useProjectStore } from '@/store/project'

export function Timeline() {
  const containerRef = useRef<HTMLDivElement>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const [isReady, setIsReady] = useState(false)

  const {
    project,
    currentTime,
    setCurrentTime,
    isPlaying,
    setIsPlaying,
    skippedSegments,
    deletedSegmentIds,
    transcript,
  } = useProjectStore()

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current || !project?.video_url) return

    let isMounted = true

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#3f3f46',
      progressColor: '#3b82f6',
      cursorColor: '#3b82f6',
      cursorWidth: 2,
      height: 60,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      interact: true,
      hideScrollbar: true,
    })

    wavesurfer.load(project.video_url).catch((err) => {
      // Ignore errors if component was unmounted during load
      if (isMounted && err.name !== 'AbortError') {
        console.error('WaveSurfer load error:', err)
      }
    })

    wavesurfer.on('ready', () => {
      if (isMounted) {
        setIsReady(true)
      }
    })

    wavesurfer.on('click', (relativeX) => {
      if (!isMounted) return
      const duration = wavesurfer.getDuration()
      const time = relativeX * duration
      setCurrentTime(time)

      // Sync with video
      const seekTo = (window as unknown as { seekTo?: (time: number) => void }).seekTo
      seekTo?.(time)
    })

    wavesurferRef.current = wavesurfer

    return () => {
      isMounted = false
      wavesurferRef.current = null
      // Unsubscribe all events before destroying to prevent errors
      wavesurfer.unAll()
      try {
        wavesurfer.destroy()
      } catch {
        // Ignore destroy errors - can happen in React Strict Mode
      }
    }
  }, [project?.video_url, setCurrentTime])

  // Sync playhead position
  useEffect(() => {
    if (!wavesurferRef.current || !isReady) return

    const duration = wavesurferRef.current.getDuration()
    if (duration > 0) {
      wavesurferRef.current.seekTo(currentTime / duration)
    }
  }, [currentTime, isReady])

  // Draw deleted regions overlay
  const deletedRegions = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!deletedRegions.current || !project?.duration || !transcript) return

    const duration = project.duration

    // Build regions from deleted segments
    const regions: Array<{ start: number; end: number }> = []

    for (const segment of transcript.segments) {
      if (deletedSegmentIds.has(segment.id)) {
        regions.push({ start: segment.start, end: segment.end })
      }
    }

    // Add skipped segments (silences)
    for (const seg of skippedSegments) {
      regions.push(seg)
    }

    // Merge overlapping
    regions.sort((a, b) => a.start - b.start)
    const merged: Array<{ start: number; end: number }> = []
    for (const r of regions) {
      if (merged.length > 0 && r.start <= merged[merged.length - 1].end) {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, r.end)
      } else {
        merged.push({ ...r })
      }
    }

    // Render regions
    deletedRegions.current.innerHTML = merged
      .map((r) => {
        const left = (r.start / duration) * 100
        const width = ((r.end - r.start) / duration) * 100
        return `<div class="absolute top-0 bottom-0 bg-error/20" style="left: ${left}%; width: ${width}%"></div>`
      })
      .join('')
  }, [deletedSegmentIds, skippedSegments, project?.duration, transcript])

  return (
    <div className="h-20 border-t border-border bg-surface px-4 py-2">
      <div className="relative h-full">
        {/* Waveform */}
        <div ref={containerRef} className="h-full" />

        {/* Deleted regions overlay */}
        <div ref={deletedRegions} className="absolute inset-0 pointer-events-none" />

        {/* Loading state */}
        {!isReady && project?.video_url && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  )
}
