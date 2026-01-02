import { create } from 'zustand'
import type {
  Project,
  ProjectStatus,
  Transcript,
  EDLOperation,
  ChatMessage,
  AISuggestion,
} from '@/types'

interface SkippedSegment {
  start: number
  end: number
}

// AI 剪辑生成的时间线片段
interface TimelineClip {
  segment_id: number
  start: number
  end: number
  text: string
  repeat?: number
  speed?: number
}

type PlaybackMode = 'original' | 'preview' | 'selection'

interface ProjectStore {
  // Project
  project: Project | null
  setProject: (project: Project | null) => void
  updateProjectStatus: (status: ProjectStatus, progress?: number) => void

  // Transcript
  transcript: Transcript | null
  isTranscriptLoading: boolean
  setTranscript: (transcript: Transcript | null) => void
  setTranscriptLoading: (loading: boolean) => void

  // EDL
  edlVersion: number
  deletedSegmentIds: Set<number>
  deletedWordIds: Set<string> // "segmentId-wordIndex"
  textCorrections: Map<string, string> // wordId -> correctedText
  // New: Duplicate, reorder, speed
  duplicatedSegments: Map<number, number> // segment_id -> repeat_count
  customSegmentOrder: number[] // custom order of segment IDs
  segmentSpeeds: Map<number, number> // segment_id -> speed multiplier
  globalSpeed: number
  setEDLVersion: (version: number) => void
  deleteSegment: (segmentId: number) => void
  restoreSegment: (segmentId: number) => void
  deleteWord: (segmentId: number, wordIndex: number) => void
  restoreWord: (segmentId: number, wordIndex: number) => void
  deleteTimeRange: (start: number, end: number) => void
  duplicateSegment: (segmentId: number, repeatCount: number) => void
  reorderSegments: (newOrder: number[]) => void
  setSegmentSpeed: (segmentId: number, speed: number) => void
  setGlobalSpeed: (speed: number) => void
  getOperations: () => EDLOperation[]
  applyOperations: (operations: EDLOperation[]) => void
  clearEDL: () => void

  // Player
  currentTime: number
  isPlaying: boolean
  playbackMode: PlaybackMode
  skippedSegments: SkippedSegment[]
  setCurrentTime: (time: number) => void
  setIsPlaying: (playing: boolean) => void
  setPlaybackMode: (mode: PlaybackMode) => void
  updateSkippedSegments: () => void

  // Selection
  selectedWordIds: Set<string>
  selectionRange: { start: number; end: number } | null
  selectWord: (segmentId: number, wordIndex: number, multi?: boolean) => void
  selectRange: (startSegmentId: number, startWordIndex: number, endSegmentId: number, endWordIndex: number) => void
  clearSelection: () => void
  deleteSelection: () => void

  // AI Chat
  chatMessages: ChatMessage[]
  isAIProcessing: boolean
  pendingSuggestion: AISuggestion | null
  addChatMessage: (message: ChatMessage) => void
  setAIProcessing: (processing: boolean) => void
  setPendingSuggestion: (suggestion: AISuggestion | null) => void
  applySuggestionDirect: (suggestion: AISuggestion) => void
  applyAISuggestion: () => void
  rejectAISuggestion: () => void

  // History (for undo/redo)
  history: EDLOperation[][]
  historyIndex: number
  undo: () => void
  redo: () => void
  pushHistory: () => void

  // AI Timeline
  timeline: TimelineClip[]
  setTimeline: (timeline: TimelineClip[]) => void
  clearTimeline: () => void
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  // Project
  project: null,
  setProject: (project) => set({ project }),
  updateProjectStatus: (status, progress) =>
    set((state) => ({
      project: state.project
        ? { ...state.project, status, processing_progress: progress ?? state.project.processing_progress }
        : null,
    })),

  // Transcript
  transcript: null,
  isTranscriptLoading: false,
  setTranscript: (transcript) => set({ transcript }),
  setTranscriptLoading: (loading) => set({ isTranscriptLoading: loading }),

  // EDL
  edlVersion: 0,
  deletedSegmentIds: new Set(),
  deletedWordIds: new Set(),
  textCorrections: new Map(),
  // New state for advanced editing
  duplicatedSegments: new Map(),
  customSegmentOrder: [],
  segmentSpeeds: new Map(),
  globalSpeed: 1.0,
  setEDLVersion: (version) => set({ edlVersion: version }),

  // New methods for advanced editing
  duplicateSegment: (segmentId, repeatCount) => {
    const { duplicatedSegments, pushHistory } = get()
    pushHistory()
    const newMap = new Map(duplicatedSegments)
    newMap.set(segmentId, repeatCount)
    set({ duplicatedSegments: newMap })
    get().updateSkippedSegments()
    console.log(`[Store] Duplicated segment ${segmentId} x${repeatCount}`)
  },

  reorderSegments: (newOrder) => {
    const { pushHistory } = get()
    pushHistory()
    set({ customSegmentOrder: newOrder })
    console.log(`[Store] Reordered segments:`, newOrder)
  },

  setSegmentSpeed: (segmentId, speed) => {
    const { segmentSpeeds, pushHistory } = get()
    pushHistory()
    const newMap = new Map(segmentSpeeds)
    newMap.set(segmentId, speed)
    set({ segmentSpeeds: newMap })
    console.log(`[Store] Set segment ${segmentId} speed to ${speed}x`)
  },

  setGlobalSpeed: (speed) => {
    const { pushHistory } = get()
    pushHistory()
    set({ globalSpeed: speed })
    console.log(`[Store] Set global speed to ${speed}x`)
  },

  deleteSegment: (segmentId) => {
    const { deletedSegmentIds, pushHistory } = get()
    pushHistory()
    const newSet = new Set(deletedSegmentIds)
    newSet.add(segmentId)
    set({ deletedSegmentIds: newSet })
    get().updateSkippedSegments()
  },

  restoreSegment: (segmentId) => {
    const { deletedSegmentIds, pushHistory } = get()
    pushHistory()
    const newSet = new Set(deletedSegmentIds)
    newSet.delete(segmentId)
    set({ deletedSegmentIds: newSet })
    get().updateSkippedSegments()
  },

  deleteWord: (segmentId, wordIndex) => {
    const { deletedWordIds, pushHistory } = get()
    pushHistory()
    const wordId = `${segmentId}-${wordIndex}`
    const newSet = new Set(deletedWordIds)
    newSet.add(wordId)
    set({ deletedWordIds: newSet })
    get().updateSkippedSegments()
  },

  restoreWord: (segmentId, wordIndex) => {
    const { deletedWordIds, pushHistory } = get()
    pushHistory()
    const wordId = `${segmentId}-${wordIndex}`
    const newSet = new Set(deletedWordIds)
    newSet.delete(wordId)
    set({ deletedWordIds: newSet })
    get().updateSkippedSegments()
  },

  deleteTimeRange: (start, end) => {
    const { transcript, pushHistory } = get()
    if (!transcript) return

    pushHistory()

    const newDeletedSegmentIds = new Set(get().deletedSegmentIds)
    const newDeletedWordIds = new Set(get().deletedWordIds)

    for (const segment of transcript.segments) {
      // Check if segment is fully within the range
      if (segment.start >= start && segment.end <= end) {
        newDeletedSegmentIds.add(segment.id)
      } else {
        // Check individual words
        for (let i = 0; i < segment.words.length; i++) {
          const word = segment.words[i]
          if (word.start >= start && word.end <= end) {
            newDeletedWordIds.add(`${segment.id}-${i}`)
          }
        }
      }
    }

    set({
      deletedSegmentIds: newDeletedSegmentIds,
      deletedWordIds: newDeletedWordIds,
    })
    get().updateSkippedSegments()
  },

  getOperations: () => {
    const { deletedSegmentIds, deletedWordIds, textCorrections } = get()
    const operations: EDLOperation[] = []

    if (deletedSegmentIds.size > 0) {
      operations.push({
        type: 'delete_segments',
        segment_ids: Array.from(deletedSegmentIds),
        created_at: new Date().toISOString(),
      })
    }

    if (deletedWordIds.size > 0) {
      const wordsBySegment = new Map<number, number[]>()
      for (const wordId of deletedWordIds) {
        const [segId, wordIdx] = wordId.split('-').map(Number)
        if (!wordsBySegment.has(segId)) {
          wordsBySegment.set(segId, [])
        }
        wordsBySegment.get(segId)!.push(wordIdx)
      }

      operations.push({
        type: 'delete_words',
        items: Array.from(wordsBySegment.entries()).map(([segment_id, word_indices]) => ({
          segment_id,
          word_indices,
        })),
        created_at: new Date().toISOString(),
      })
    }

    if (textCorrections.size > 0) {
      const items = Array.from(textCorrections.entries()).map(([wordId, corrected]) => {
        const [segId, wordIdx] = wordId.split('-').map(Number)
        return {
          segment_id: segId,
          word_index: wordIdx,
          original: '', // Would need to look up original
          corrected,
        }
      })

      operations.push({
        type: 'correct_text',
        items,
        created_at: new Date().toISOString(),
      })
    }

    return operations
  },

  applyOperations: (operations) => {
    const newDeletedSegmentIds = new Set<number>()
    const newDeletedWordIds = new Set<string>()
    const newTextCorrections = new Map<string, string>()

    for (const op of operations) {
      if (op.type === 'delete_segments') {
        for (const id of op.segment_ids) {
          newDeletedSegmentIds.add(id)
        }
      } else if (op.type === 'delete_words') {
        for (const item of op.items) {
          for (const idx of item.word_indices) {
            newDeletedWordIds.add(`${item.segment_id}-${idx}`)
          }
        }
      } else if (op.type === 'delete_silences') {
        // Apply silence deletions to segments/words
        const { transcript } = get()
        if (transcript) {
          for (const range of op.time_ranges) {
            for (const segment of transcript.segments) {
              if (segment.start >= range.start && segment.end <= range.end) {
                newDeletedSegmentIds.add(segment.id)
              }
            }
          }
        }
      } else if (op.type === 'correct_text') {
        for (const item of op.items) {
          newTextCorrections.set(`${item.segment_id}-${item.word_index}`, item.corrected)
        }
      }
    }

    set({
      deletedSegmentIds: newDeletedSegmentIds,
      deletedWordIds: newDeletedWordIds,
      textCorrections: newTextCorrections,
    })
    get().updateSkippedSegments()
  },

  clearEDL: () => {
    set({
      edlVersion: 0,
      deletedSegmentIds: new Set(),
      deletedWordIds: new Set(),
      textCorrections: new Map(),
      history: [],
      historyIndex: -1,
    })
    get().updateSkippedSegments()
  },

  // Player
  currentTime: 0,
  isPlaying: false,
  playbackMode: 'preview',
  skippedSegments: [],
  setCurrentTime: (time) => set({ currentTime: time }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setPlaybackMode: (mode) => set({ playbackMode: mode }),

  updateSkippedSegments: () => {
    const { transcript, deletedSegmentIds, deletedWordIds, playbackMode } = get()
    if (!transcript || playbackMode === 'original') {
      set({ skippedSegments: [] })
      return
    }

    const skipped: SkippedSegment[] = []

    // Add deleted segments
    for (const segment of transcript.segments) {
      if (deletedSegmentIds.has(segment.id)) {
        skipped.push({ start: segment.start, end: segment.end })
      } else {
        // Check for deleted words
        for (let i = 0; i < segment.words.length; i++) {
          if (deletedWordIds.has(`${segment.id}-${i}`)) {
            skipped.push({
              start: segment.words[i].start,
              end: segment.words[i].end,
            })
          }
        }
      }
    }

    // Merge overlapping segments
    skipped.sort((a, b) => a.start - b.start)
    const merged: SkippedSegment[] = []
    for (const seg of skipped) {
      if (merged.length > 0 && seg.start <= merged[merged.length - 1].end) {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, seg.end)
      } else {
        merged.push({ ...seg })
      }
    }

    set({ skippedSegments: merged })
  },

  // Selection
  selectedWordIds: new Set(),
  selectionRange: null,

  selectWord: (segmentId, wordIndex, multi = false) => {
    const { selectedWordIds } = get()
    const wordId = `${segmentId}-${wordIndex}`

    if (multi) {
      const newSet = new Set(selectedWordIds)
      if (newSet.has(wordId)) {
        newSet.delete(wordId)
      } else {
        newSet.add(wordId)
      }
      set({ selectedWordIds: newSet })
    } else {
      set({ selectedWordIds: new Set([wordId]) })
    }
  },

  selectRange: (startSegmentId, startWordIndex, endSegmentId, endWordIndex) => {
    const { transcript } = get()
    if (!transcript) return

    const newSelected = new Set<string>()
    let inRange = false

    for (const segment of transcript.segments) {
      for (let i = 0; i < segment.words.length; i++) {
        const isStart = segment.id === startSegmentId && i === startWordIndex
        const isEnd = segment.id === endSegmentId && i === endWordIndex

        if (isStart || isEnd) {
          inRange = !inRange || isEnd
          newSelected.add(`${segment.id}-${i}`)
        } else if (inRange) {
          newSelected.add(`${segment.id}-${i}`)
        }
      }
    }

    set({ selectedWordIds: newSelected })
  },

  clearSelection: () => set({ selectedWordIds: new Set(), selectionRange: null }),

  deleteSelection: () => {
    const { selectedWordIds, transcript, pushHistory } = get()
    if (selectedWordIds.size === 0 || !transcript) return

    pushHistory()

    const newDeletedWordIds = new Set(get().deletedWordIds)
    const newDeletedSegmentIds = new Set(get().deletedSegmentIds)

    // Group by segment
    const wordsBySegment = new Map<number, Set<number>>()
    for (const wordId of selectedWordIds) {
      const [segId, wordIdx] = wordId.split('-').map(Number)
      if (!wordsBySegment.has(segId)) {
        wordsBySegment.set(segId, new Set())
      }
      wordsBySegment.get(segId)!.add(wordIdx)
    }

    // Check if entire segment is selected
    for (const segment of transcript.segments) {
      const selectedWords = wordsBySegment.get(segment.id)
      if (selectedWords && selectedWords.size === segment.words.length) {
        // Delete entire segment
        newDeletedSegmentIds.add(segment.id)
      } else if (selectedWords) {
        // Delete individual words
        for (const idx of selectedWords) {
          newDeletedWordIds.add(`${segment.id}-${idx}`)
        }
      }
    }

    set({
      deletedSegmentIds: newDeletedSegmentIds,
      deletedWordIds: newDeletedWordIds,
      selectedWordIds: new Set(),
    })
    get().updateSkippedSegments()
  },

  // AI Chat
  chatMessages: [],
  isAIProcessing: false,
  pendingSuggestion: null,

  addChatMessage: (message) =>
    set((state) => ({
      chatMessages: [...state.chatMessages, message],
    })),

  setAIProcessing: (processing) => set({ isAIProcessing: processing }),
  setPendingSuggestion: (suggestion) => set({ pendingSuggestion: suggestion }),

  // Direct apply - accepts suggestion parameter to avoid race condition
  applySuggestionDirect: (suggestion: AISuggestion) => {
    if (!suggestion) return

    const { pushHistory, transcript, duplicateSegment, reorderSegments, setSegmentSpeed, setGlobalSpeed } = get()

    console.log('[DEBUG] applySuggestionDirect action:', suggestion.action, suggestion)

    // Handle different action types
    switch (suggestion.action) {
      case 'duplicate_segments': {
        // Handle duplicate operations
        const items = suggestion.duplicate_items || []
        for (const item of items) {
          duplicateSegment(item.segment_id, item.repeat_count)
        }
        console.log('[DEBUG] Applied duplicate_segments:', items.length, 'items')
        return
      }

      case 'reorder_segments': {
        // Handle reorder operation
        const newOrder = suggestion.new_segment_order || []
        if (newOrder.length > 0) {
          reorderSegments(newOrder)
        }
        console.log('[DEBUG] Applied reorder_segments:', newOrder.length, 'segments')
        return
      }

      case 'set_speed': {
        // Handle speed operation
        const speedItems = suggestion.speed_items || []
        const globalSpd = suggestion.global_speed

        if (globalSpd && globalSpd !== 1.0) {
          setGlobalSpeed(globalSpd)
        }
        for (const item of speedItems) {
          setSegmentSpeed(item.segment_id, item.speed)
        }
        console.log('[DEBUG] Applied set_speed:', speedItems.length, 'items, global:', globalSpd)
        return
      }

      case 'extract_highlights': {
        // Extract highlights returns suggested duplicates for ghost video effect
        const highlightSegments = suggestion.highlight_segments || []
        const suggestedDuplicates = suggestion.suggested_duplicates || []

        console.log('[DEBUG] extract_highlights:', {
          highlightSegments,
          suggestedDuplicates,
          highlightInfo: suggestion.highlight_info
        })

        // If there are suggested duplicates, apply them automatically
        if (suggestedDuplicates.length > 0) {
          for (const dup of suggestedDuplicates) {
            duplicateSegment(dup.segment_id, dup.repeat_count)
          }
          console.log('[DEBUG] Applied suggested duplicates:', suggestedDuplicates.length)
        }

        return
      }

      case 'no_action': {
        console.log('[DEBUG] No action required')
        return
      }

      default: {
        // Handle delete operations (delete_segments, delete_silences, delete_words, keep_segments)
        pushHistory()

        const newDeletedSegmentIds = new Set(get().deletedSegmentIds)
        const newDeletedWordIds = new Set(get().deletedWordIds)

        // Support both nested preview format and flat format from tool calling
        const segmentsToDelete = suggestion.preview?.segments_to_delete || suggestion.segments_to_delete || []
        const wordsToDelete = suggestion.preview?.words_to_delete || suggestion.words_to_delete || []
        const timeRangesToDelete = suggestion.preview?.time_ranges_to_delete || suggestion.time_ranges_to_delete || []

        console.log('[DEBUG] applySuggestionDirect delete:', { segmentsToDelete, wordsToDelete, timeRangesToDelete })

        // Apply segment deletions
        for (const segId of segmentsToDelete) {
          newDeletedSegmentIds.add(segId)
        }

        // Apply word deletions
        for (const item of wordsToDelete) {
          for (const idx of item.word_indices) {
            newDeletedWordIds.add(`${item.segment_id}-${idx}`)
          }
        }

        // Apply time range deletions (for silences and time-based cuts)
        if (transcript && timeRangesToDelete.length > 0) {
          for (const range of timeRangesToDelete) {
            // Find and delete segments that fall within the time range
            for (const segment of transcript.segments) {
              if (segment.start >= range.start && segment.end <= range.end) {
                newDeletedSegmentIds.add(segment.id)
              }
            }
          }

          // Also add time ranges directly to skipped segments for playback
          const currentSkipped = get().skippedSegments
          const newSkipped = [...currentSkipped]
          for (const range of timeRangesToDelete) {
            newSkipped.push({ start: range.start, end: range.end })
          }
          // Merge and sort
          newSkipped.sort((a, b) => a.start - b.start)
          const merged: { start: number; end: number }[] = []
          for (const seg of newSkipped) {
            if (merged.length > 0 && seg.start <= merged[merged.length - 1].end + 0.1) {
              merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, seg.end)
            } else {
              merged.push({ ...seg })
            }
          }
          set({ skippedSegments: merged })
        }

        set({
          deletedSegmentIds: newDeletedSegmentIds,
          deletedWordIds: newDeletedWordIds,
          pendingSuggestion: null,
        })
        get().updateSkippedSegments()
        console.log('[DEBUG] Applied delete suggestion, new skippedSegments:', get().skippedSegments)
      }
    }
  },

  applyAISuggestion: () => {
    const { pendingSuggestion, pushHistory, transcript } = get()
    if (!pendingSuggestion) return

    pushHistory()

    const newDeletedSegmentIds = new Set(get().deletedSegmentIds)
    const newDeletedWordIds = new Set(get().deletedWordIds)

    // Support both nested preview format and flat format from tool calling
    const segmentsToDelete = pendingSuggestion.preview?.segments_to_delete || pendingSuggestion.segments_to_delete || []
    const wordsToDelete = pendingSuggestion.preview?.words_to_delete || pendingSuggestion.words_to_delete || []
    const timeRangesToDelete = pendingSuggestion.preview?.time_ranges_to_delete || pendingSuggestion.time_ranges_to_delete || []

    // Apply segment deletions
    for (const segId of segmentsToDelete) {
      newDeletedSegmentIds.add(segId)
    }

    // Apply word deletions
    for (const item of wordsToDelete) {
      for (const idx of item.word_indices) {
        newDeletedWordIds.add(`${item.segment_id}-${idx}`)
      }
    }

    // Apply time range deletions (for silences)
    if (transcript && timeRangesToDelete.length > 0) {
      for (const range of timeRangesToDelete) {
        // Mark silences for skip (using segments that overlap with the silence range)
        for (const segment of transcript.segments) {
          // Check if segment end overlaps with silence start or segment start overlaps with silence end
          if (segment.end >= range.start && segment.start <= range.end) {
            // This segment overlaps with the silence, check words
            for (let i = 0; i < segment.words.length; i++) {
              const word = segment.words[i]
              // Check if there's a gap after this word that falls in the silence range
              const nextWord = segment.words[i + 1]
              if (nextWord) {
                const gapStart = word.end
                const gapEnd = nextWord.start
                if (gapStart >= range.start && gapEnd <= range.end && gapEnd - gapStart > 0.1) {
                  // This is a silence gap, we'll handle by storing the time range
                }
              }
            }
          }
        }
      }
      // Store time ranges for skipping during playback
      const currentSkipped = get().skippedSegments
      const newSkipped = [...currentSkipped]
      for (const range of timeRangesToDelete) {
        newSkipped.push({ start: range.start, end: range.end })
      }
      // Merge and sort
      newSkipped.sort((a, b) => a.start - b.start)
      const merged: { start: number; end: number }[] = []
      for (const seg of newSkipped) {
        if (merged.length > 0 && seg.start <= merged[merged.length - 1].end + 0.1) {
          merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, seg.end)
        } else {
          merged.push({ ...seg })
        }
      }
      set({ skippedSegments: merged })
    }

    set({
      deletedSegmentIds: newDeletedSegmentIds,
      deletedWordIds: newDeletedWordIds,
      pendingSuggestion: null,
    })
    get().updateSkippedSegments()
  },

  rejectAISuggestion: () => set({ pendingSuggestion: null }),

  // History
  history: [],
  historyIndex: -1,

  pushHistory: () => {
    const { history, historyIndex, getOperations } = get()
    const currentOps = getOperations()
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(currentOps)
    set({ history: newHistory, historyIndex: newHistory.length - 1 })
  },

  undo: () => {
    const { history, historyIndex, applyOperations } = get()
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      applyOperations(history[newIndex])
      set({ historyIndex: newIndex })
    } else if (historyIndex === 0) {
      // Restore to initial state
      set({
        deletedSegmentIds: new Set(),
        deletedWordIds: new Set(),
        textCorrections: new Map(),
        historyIndex: -1,
      })
      get().updateSkippedSegments()
    }
  },

  redo: () => {
    const { history, historyIndex, applyOperations } = get()
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      applyOperations(history[newIndex])
      set({ historyIndex: newIndex })
    }
  },

  // AI Timeline
  timeline: [],
  setTimeline: (timeline) => set({ timeline }),
  clearTimeline: () => set({ timeline: [] }),
}))
