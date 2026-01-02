// Project types
export type ProjectStatus = 'EMPTY' | 'UPLOADING' | 'PROCESSING' | 'READY' | 'EXPORTING' | 'ERROR'

export interface Project {
  id: string
  name: string
  status: ProjectStatus
  video_url: string | null
  duration: number | null
  thumbnail_url: string | null
  processing_progress: number
  error_message: string | null
  created_at: string
  updated_at: string
}

// Transcript types
export interface Word {
  word: string
  start: number
  end: number
}

export interface Segment {
  id: number
  speaker: string
  start: number
  end: number
  text: string
  words: Word[]
}

export interface Silence {
  start: number
  end: number
  duration: number
}

export interface Transcript {
  project_id: string
  duration: number
  language: string
  segments: Segment[]
  silences: Silence[]
}

// EDL types - Extended for full editing capabilities
export type EDLOperationType =
  | 'delete_segments' | 'delete_words' | 'delete_silences' | 'correct_text'
  | 'duplicate_segments' | 'reorder_segments' | 'set_speed'

export interface DeleteSegmentsOperation {
  type: 'delete_segments'
  segment_ids: number[]
  created_at?: string
}

export interface DeleteWordsOperation {
  type: 'delete_words'
  items: Array<{ segment_id: number; word_indices: number[] }>
  created_at?: string
}

export interface DeleteSilencesOperation {
  type: 'delete_silences'
  threshold: number
  time_ranges: Array<{ start: number; end: number }>
  created_at?: string
}

export interface CorrectTextOperation {
  type: 'correct_text'
  items: Array<{
    segment_id: number
    word_index: number
    original: string
    corrected: string
  }>
  created_at?: string
}

// New operations
export interface DuplicateSegmentsOperation {
  type: 'duplicate_segments'
  items: Array<{ segment_id: number; repeat_count: number; insert_position?: string }>
  created_at?: string
}

export interface ReorderSegmentsOperation {
  type: 'reorder_segments'
  new_order: number[]
  created_at?: string
}

export interface SetSpeedOperation {
  type: 'set_speed'
  items: Array<{ segment_id: number; speed: number }>
  global_speed?: number
  created_at?: string
}

export type EDLOperation =
  | DeleteSegmentsOperation
  | DeleteWordsOperation
  | DeleteSilencesOperation
  | CorrectTextOperation
  | DuplicateSegmentsOperation
  | ReorderSegmentsOperation
  | SetSpeedOperation

export interface EDL {
  version: number
  updated_at: string
  operations: EDLOperation[]
}

// AI types
export interface AISuggestionPreview {
  segments_to_delete: number[]
  words_to_delete: Array<{ segment_id: number; word_indices: number[] }>
  time_ranges_to_delete: Array<{ start: number; end: number }>
}

export interface AISuggestionSummary {
  total_duration_removed: number
  segments_affected: number
}

export interface AISuggestion {
  action_id?: string
  action:
  | 'delete_silences' | 'delete_segments' | 'delete_words' | 'keep_segments'
  | 'duplicate_segments' | 'reorder_segments' | 'set_speed' | 'extract_highlights'
  | 'no_action'
  description: string
  preview?: AISuggestionPreview
  summary?: AISuggestionSummary
  // Delete operation fields
  segments_affected?: number
  total_duration_removed?: number
  segments_to_delete?: number[]
  words_to_delete?: Array<{ segment_id: number; word_indices: number[] }>
  time_ranges_to_delete?: Array<{ start: number; end: number }>
  threshold?: number
  // Duplicate operation fields
  duplicate_items?: Array<{ segment_id: number; repeat_count: number; insert_position?: string }>
  total_duration_added?: number
  // Reorder operation fields
  new_segment_order?: number[]
  // Speed operation fields
  speed_items?: Array<{ segment_id: number; speed: number }>
  global_speed?: number
  // Highlight operation fields
  highlight_segments?: number[]
  highlight_info?: Array<{ id: number; text: string; start: number; end: number }>
  suggested_duplicates?: Array<{ segment_id: number; repeat_count: number }>
  // Metadata
  requires_confirmation?: boolean
  expires_at?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  suggestion?: AISuggestion
}

// Export types
export type ExportFormat = 'fcpxml' | 'premiere_xml' | 'edl' | 'mp4'
export type ExportStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface ExportRecord {
  export_id: string
  status: ExportStatus
  format: ExportFormat
  download_url: string | null
  expires_at: string | null
  file_size: number | null
}

// API Response
export interface APIResponse<T> {
  success: boolean
  data: T
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  } | null
}

// Processing status
export interface ProcessingStep {
  name: string
  status: 'pending' | 'in_progress' | 'completed'
  progress?: number
}

export interface ProcessingStatus {
  status: ProjectStatus
  progress: number
  current_step: string | null
  steps: ProcessingStep[]
  estimated_remaining: number | null
}
