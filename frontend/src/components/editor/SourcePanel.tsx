import { useRef, useEffect } from 'react'
import { useProjectStore } from '@/store/project'
import { cn, formatTime } from '@/lib/utils'

export function SourcePanel() {
  const containerRef = useRef<HTMLDivElement>(null)
  
  const {
    transcript,
    currentTime,
    deletedSegmentIds,
    deletedWordIds,
    selectedWordIds,
    selectWord,
    restoreSegment,
    restoreWord,
    clearSelection,
  } = useProjectStore()

  // 自动滚动到当前播放的词
  useEffect(() => {
    if (!containerRef.current || !transcript) return

    const activeWord = containerRef.current.querySelector('.word--active')
    if (activeWord) {
      activeWord.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentTime, transcript])

  // 判断词是否正在播放
  function isWordActive(start: number, end: number): boolean {
    return currentTime >= start && currentTime < end
  }

  // 点击词
  function handleWordClick(segmentId: number, wordIndex: number, e: React.MouseEvent) {
    const wordId = `${segmentId}-${wordIndex}`
    const isDeleted = deletedWordIds.has(wordId)
    const segment = transcript?.segments.find((s) => s.id === segmentId)

    if (isDeleted) {
      // 恢复词
      restoreWord(segmentId, wordIndex)
    } else if (deletedSegmentIds.has(segmentId)) {
      // 恢复整个片段
      restoreSegment(segmentId)
    } else {
      // 选择词
      selectWord(segmentId, wordIndex, e.shiftKey || e.metaKey || e.ctrlKey)

      // 跳转到词的时间点
      if (segment) {
        const word = segment.words[wordIndex]
        if (word) {
          const seekTo = (window as unknown as { seekTo?: (time: number) => void }).seekTo
          seekTo?.(word.start)
        }
      }
    }
  }

  // ESC 清除选择
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }
      if (e.key === 'Escape') {
        clearSelection()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clearSelection])

  if (!transcript) {
    return (
      <div className="h-full flex items-center justify-center text-[#808080] text-sm">
        暂无素材
      </div>
    )
  }

  return (
    <div ref={containerRef} className="h-full overflow-y-auto">
      <div className="p-3 space-y-4">
        {transcript.segments.map((segment) => {
          const isSegmentDeleted = deletedSegmentIds.has(segment.id)

          return (
            <div
              key={segment.id}
              className={cn(
                'segment',
                isSegmentDeleted && 'opacity-30'
              )}
            >
              {/* 说话人 & 时间 */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-medium text-[#4ec9b0] bg-[#4ec9b0]/10 px-2 py-0.5 rounded">
                  {segment.speaker}
                </span>
                <span className="text-[10px] text-[#808080] font-mono">
                  {formatTime(segment.start)}
                </span>
              </div>

              {/* 逐字文稿 - 每个字都可点击 */}
              <div className="leading-relaxed text-sm">
                {segment.words.map((word, wordIndex) => {
                  const wordId = `${segment.id}-${wordIndex}`
                  const isDeleted = isSegmentDeleted || deletedWordIds.has(wordId)
                  const isSelected = selectedWordIds.has(wordId)
                  const isActive = !isDeleted && isWordActive(word.start, word.end)

                  return (
                    <span
                      key={wordIndex}
                      onClick={(e) => handleWordClick(segment.id, wordIndex, e)}
                      className={cn(
                        'inline cursor-pointer transition-all rounded-sm px-0.5',
                        // 默认状态
                        'text-[#cccccc] hover:bg-[#3e3e42]',
                        // 正在播放
                        isActive && 'bg-[#264f78] text-white word--active',
                        // 已删除
                        isDeleted && 'line-through text-[#808080] opacity-50',
                        // 已选中
                        isSelected && 'bg-[#0e639c] text-white',
                      )}
                    >
                      {word.word}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* 底部统计 */}
      <div className="sticky bottom-0 bg-[#252526] border-t border-[#3e3e42] px-3 py-2">
        <div className="flex items-center justify-between text-[10px] text-[#808080]">
          <span>共 {transcript.segments.length} 个片段</span>
          <span>总时长 {formatDuration(transcript.duration)}</span>
        </div>
      </div>
    </div>
  )
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}分${secs}秒`
}
