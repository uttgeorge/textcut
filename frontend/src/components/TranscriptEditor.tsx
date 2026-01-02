import { useRef, useEffect } from 'react'
import { useProjectStore } from '@/store/project'
import { cn, formatTime } from '@/lib/utils'

interface TranscriptEditorProps {
  onEdit?: () => void
}

export function TranscriptEditor({ onEdit }: TranscriptEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const {
    transcript,
    isTranscriptLoading,
    currentTime,
    deletedSegmentIds,
    deletedWordIds,
    selectedWordIds,
    pendingSuggestion,
    selectWord,
    deleteSelection,
    restoreSegment,
    restoreWord,
    clearSelection,
  } = useProjectStore()

  // Auto-scroll to current word
  useEffect(() => {
    if (!containerRef.current || !transcript) return

    const activeWord = containerRef.current.querySelector('.word--active')
    if (activeWord) {
      activeWord.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentTime])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedWordIds.size > 0) {
        e.preventDefault()
        deleteSelection()
        onEdit?.()
      } else if (e.key === 'Escape') {
        clearSelection()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedWordIds, deleteSelection, clearSelection, onEdit])

  function handleWordClick(segmentId: number, wordIndex: number, e: React.MouseEvent) {
    const wordId = `${segmentId}-${wordIndex}`
    const isDeleted = deletedWordIds.has(wordId)
    const segment = transcript?.segments.find((s) => s.id === segmentId)

    if (isDeleted) {
      // Restore word
      restoreWord(segmentId, wordIndex)
      onEdit?.()
    } else if (deletedSegmentIds.has(segmentId)) {
      // Restore segment
      restoreSegment(segmentId)
      onEdit?.()
    } else {
      // Select word
      selectWord(segmentId, wordIndex, e.shiftKey || e.metaKey || e.ctrlKey)

      // Seek to word time
      if (segment) {
        const word = segment.words[wordIndex]
        if (word) {
          const seekTo = (window as unknown as { seekTo?: (time: number) => void }).seekTo
          seekTo?.(word.start)
        }
      }
    }
  }

  function isWordActive(start: number, end: number): boolean {
    return currentTime >= start && currentTime < end
  }

  function isWordSuggested(segmentId: number, wordIndex: number): boolean {
    if (!pendingSuggestion?.preview) return false

    // Check time ranges
    const segment = transcript?.segments.find((s) => s.id === segmentId)
    if (segment) {
      const word = segment.words[wordIndex]
      const timeRanges = pendingSuggestion.preview.time_ranges_to_delete || []
      for (const range of timeRanges) {
        if (word.start >= range.start && word.end <= range.end) {
          return true
        }
      }
    }

    // Check specific words
    const wordsToDelete = pendingSuggestion.preview.words_to_delete || []
    for (const item of wordsToDelete) {
      if (item.segment_id === segmentId && item.word_indices.includes(wordIndex)) {
        return true
      }
    }

    return false
  }

  function isSegmentSuggested(segmentId: number): boolean {
    if (!pendingSuggestion?.preview) return false
    const segmentsToDelete = pendingSuggestion.preview.segments_to_delete || []
    return segmentsToDelete.includes(segmentId)
  }

  if (isTranscriptLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!transcript) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary">
        暂无文稿
      </div>
    )
  }

  return (
    <div ref={containerRef} className="h-full overflow-y-auto p-4 space-y-4">
      {transcript.segments.map((segment) => {
        const isSegmentDeleted = deletedSegmentIds.has(segment.id)
        const isSegmentSuggestedDelete = isSegmentSuggested(segment.id)

        return (
          <div
            key={segment.id}
            className={cn(
              'segment',
              isSegmentDeleted && 'segment--deleted',
              isSegmentSuggestedDelete && 'bg-error/10'
            )}
          >
            {/* Speaker & Time */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
                {segment.speaker}
              </span>
              <span className="text-xs text-text-muted font-mono">
                {formatTime(segment.start)}
              </span>
            </div>

            {/* Words */}
            <div className="leading-relaxed">
              {segment.words.map((word, wordIndex) => {
                const wordId = `${segment.id}-${wordIndex}`
                const isDeleted = isSegmentDeleted || deletedWordIds.has(wordId)
                const isSelected = selectedWordIds.has(wordId)
                const isActive = !isDeleted && isWordActive(word.start, word.end)
                const isSuggested = isWordSuggested(segment.id, wordIndex) || isSegmentSuggestedDelete

                return (
                  <span
                    key={wordIndex}
                    onClick={(e) => handleWordClick(segment.id, wordIndex, e)}
                    className={cn(
                      'word',
                      isActive && 'word--active',
                      isDeleted && 'word--deleted',
                      isSelected && 'word--selected',
                      isSuggested && !isDeleted && 'word--suggested'
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
  )
}
