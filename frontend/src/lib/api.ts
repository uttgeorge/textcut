import axios from 'axios'
import type {
  APIResponse,
  Project,
  Transcript,
  EDL,
  AISuggestion,
  ExportRecord,
  ProcessingStatus,
  ExportFormat,
} from '@/types'

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.detail?.message || error.message
    console.error('API Error:', message)
    return Promise.reject(error)
  }
)

// Projects
export async function createProject(name: string): Promise<Project> {
  const res = await api.post<APIResponse<Project>>('/projects', { name })
  return res.data.data
}

export async function getProjects(page = 1, pageSize = 20): Promise<{
  items: Project[]
  total: number
  page: number
  page_size: number
}> {
  const res = await api.get<APIResponse<{
    items: Project[]
    total: number
    page: number
    page_size: number
  }>>('/projects', { params: { page, page_size: pageSize } })
  return res.data.data
}

export async function getProject(projectId: string): Promise<Project> {
  const res = await api.get<APIResponse<Project>>(`/projects/${projectId}`)
  return res.data.data
}

export async function updateProject(projectId: string, name: string): Promise<Project> {
  const res = await api.patch<APIResponse<Project>>(`/projects/${projectId}`, { name })
  return res.data.data
}

export async function deleteProject(projectId: string): Promise<void> {
  await api.delete(`/projects/${projectId}`)
}

export async function uploadVideo(
  projectId: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ task_id: string }> {
  const formData = new FormData()
  formData.append('file', file)

  const res = await api.post<APIResponse<{ project_id: string; status: string; task_id: string }>>(
    `/projects/${projectId}/upload`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (e.total && onProgress) {
          onProgress(Math.round((e.loaded * 100) / e.total))
        }
      },
    }
  )
  return res.data.data
}

export async function getProjectStatus(projectId: string): Promise<ProcessingStatus> {
  const res = await api.get<APIResponse<ProcessingStatus>>(`/projects/${projectId}/status`)
  return res.data.data
}

// Transcripts
export async function getTranscript(projectId: string): Promise<Transcript> {
  const res = await api.get<APIResponse<Transcript>>(`/projects/${projectId}/transcript`)
  return res.data.data
}

// EDL
export async function getEDL(projectId: string): Promise<EDL> {
  const res = await api.get<APIResponse<EDL>>(`/projects/${projectId}/edl`)
  return res.data.data
}

export async function saveEDL(
  projectId: string,
  version: number,
  operations: EDL['operations']
): Promise<EDL> {
  const res = await api.put<APIResponse<EDL>>(`/projects/${projectId}/edl`, {
    version,
    operations,
  })
  return res.data.data
}

// AI
export async function sendAIInstruction(
  projectId: string,
  instruction: string,
  context?: Record<string, unknown>
): Promise<AISuggestion> {
  const res = await api.post<APIResponse<AISuggestion>>(`/projects/${projectId}/ai/instruction`, {
    instruction,
    context,
  })
  return res.data.data
}

export async function confirmAISuggestion(
  projectId: string,
  actionId: string,
  confirmed: boolean
): Promise<{ edl_version?: number; applied: boolean }> {
  const res = await api.post<APIResponse<{ edl_version?: number; applied: boolean }>>(
    `/projects/${projectId}/ai/confirm`,
    { action_id: actionId, confirmed }
  )
  return res.data.data
}

export interface AIChatResponse {
  reply: string
  action: AISuggestion | null
  session_id: string
}

export async function chatWithAI(
  projectId: string,
  message: string,
  sessionId?: string
): Promise<AIChatResponse> {
  const res = await api.post<APIResponse<AIChatResponse>>(`/projects/${projectId}/ai/chat`, {
    message,
    session_id: sessionId,
  })
  return res.data.data
}

// Exports
export async function createExport(
  projectId: string,
  format: ExportFormat,
  options?: { include_subtitles?: boolean; frame_rate?: number }
): Promise<ExportRecord> {
  const res = await api.post<APIResponse<ExportRecord>>(`/projects/${projectId}/export`, {
    format,
    options,
  })
  return res.data.data
}

export async function getExportStatus(projectId: string, exportId: string): Promise<ExportRecord> {
  const res = await api.get<APIResponse<ExportRecord>>(
    `/projects/${projectId}/export/${exportId}`
  )
  return res.data.data
}

export async function getExports(projectId: string): Promise<{ items: ExportRecord[] }> {
  const res = await api.get<APIResponse<{ items: ExportRecord[] }>>(
    `/projects/${projectId}/exports`
  )
  return res.data.data
}
