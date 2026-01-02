import { useEffect, useCallback, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, Sparkles, Film, FileText } from 'lucide-react'
import { useProjectStore } from '@/store/project'
import { getProject, getTranscript, getEDL, getProjectStatus, saveEDL } from '@/lib/api'
import { UploadZone } from '@/components/UploadZone'
import { ProcessingStatus } from '@/components/ProcessingStatus'
import { ExportModal } from '@/components/ExportModal'
import { debounce, cn } from '@/lib/utils'

// 新组件
import { PreviewPanel } from '@/components/editor/PreviewPanel'
import { SourcePanel } from '@/components/editor/SourcePanel'
import { TimelineTrack } from '@/components/editor/TimelineTrack'
import { AIPanel } from '@/components/editor/AIPanel'

type LeftPanelTab = 'source' | 'ai'

export function Editor() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [showExportModal, setShowExportModal] = useState(false)
  const [leftPanelTab, setLeftPanelTab] = useState<LeftPanelTab>('source')

  const {
    project,
    setProject,
    transcript,
    setTranscript,
    setTranscriptLoading,
    updateProjectStatus,
    setEDLVersion,
    applyOperations,
    getOperations,
    edlVersion,
    undo,
    redo,
    timeline,
    clearTimeline,
  } = useProjectStore()

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load project data
  useEffect(() => {
    if (!projectId) return

    async function loadProject() {
      try {
        const projectData = await getProject(projectId!)
        setProject(projectData)

        if (projectData.status === 'READY') {
          setTranscriptLoading(true)
          const [transcriptData, edlData] = await Promise.all([
            getTranscript(projectId!),
            getEDL(projectId!),
          ])
          setTranscript(transcriptData)
          setEDLVersion(edlData.version)
          applyOperations(edlData.operations)
          setTranscriptLoading(false)
        } else if (projectData.status === 'PROCESSING') {
          startPolling()
        }
      } catch (error) {
        console.error('Failed to load project:', error)
      }
    }

    loadProject()

    return () => {
      stopPolling()
      setProject(null)
      setTranscript(null)
      clearTimeline()
    }
  }, [projectId])

  // Polling for processing status
  function startPolling() {
    if (pollingRef.current) return

    pollingRef.current = setInterval(async () => {
      if (!projectId) return

      try {
        const status = await getProjectStatus(projectId)
        updateProjectStatus(status.status, status.progress)

        if (status.status === 'READY') {
          stopPolling()
          setTranscriptLoading(true)
          const [transcriptData, edlData] = await Promise.all([
            getTranscript(projectId),
            getEDL(projectId),
          ])
          setTranscript(transcriptData)
          setEDLVersion(edlData.version)
          applyOperations(edlData.operations)
          setTranscriptLoading(false)
        } else if (status.status === 'ERROR') {
          stopPolling()
        }
      } catch (error) {
        console.error('Polling error:', error)
      }
    }, 2000)
  }

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  // Auto-save EDL
  const debouncedSave = useCallback(
    debounce(async () => {
      if (!projectId || !transcript) return

      try {
        const operations = getOperations()
        await saveEDL(projectId, edlVersion + 1, operations)
        setEDLVersion(edlVersion + 1)
      } catch (error) {
        console.error('Failed to save EDL:', error)
      }
    }, 1000),
    [projectId, transcript, edlVersion]
  )

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const cmdKey = isMac ? e.metaKey : e.ctrlKey

      if (cmdKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (cmdKey && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        redo()
      } else if (cmdKey && e.key === 'e') {
        e.preventDefault()
        setShowExportModal(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="h-screen bg-[#1a1a1c] flex flex-col overflow-hidden">
      {/* Header - 深色工具栏 */}
      <header className="h-12 bg-[#2d2d30] border-b border-[#3e3e42] flex items-center px-3 gap-3 flex-shrink-0">
        <button
          onClick={() => navigate('/')}
          className="p-1.5 rounded text-[#cccccc] hover:text-white hover:bg-[#3e3e42] transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-[#3e3e42] flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-medium text-[#cccccc] truncate">{project.name}</h1>
        </div>

        {project.status === 'READY' && (
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0e639c] hover:bg-[#1177bb] rounded text-white text-sm font-medium transition-colors flex-shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            导出
          </button>
        )}
      </header>

      {/* Main Content */}
      {project.status === 'EMPTY' ? (
        <UploadZone projectId={project.id} onUploadStart={startPolling} />
      ) : project.status === 'PROCESSING' || project.status === 'UPLOADING' ? (
        <ProcessingStatus />
      ) : project.status === 'ERROR' ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-400 text-lg mb-2">处理失败</p>
            <p className="text-[#808080]">{project.error_message}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* 上半部分：三栏布局 */}
          <div className="flex-1 flex min-h-0">
            {/* 左侧面板：素材库 / AI 助手 - 固定宽度 */}
            <div className="w-64 flex-shrink-0 bg-[#252526] border-r border-[#3e3e42] flex flex-col min-h-0">
              {/* 面板切换标签 */}
              <div className="h-9 bg-[#2d2d30] border-b border-[#3e3e42] flex flex-shrink-0">
                <button
                  onClick={() => setLeftPanelTab('source')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors',
                    leftPanelTab === 'source'
                      ? 'text-white bg-[#37373d]'
                      : 'text-[#808080] hover:text-[#cccccc]'
                  )}
                >
                  <Film className="w-3.5 h-3.5" />
                  素材
                </button>
                <button
                  onClick={() => setLeftPanelTab('ai')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors',
                    leftPanelTab === 'ai'
                      ? 'text-white bg-[#37373d]'
                      : 'text-[#808080] hover:text-[#cccccc]'
                  )}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  AI 剪辑
                </button>
              </div>

              {/* 面板内容 */}
              <div className="flex-1 min-h-0 overflow-hidden">
                {leftPanelTab === 'source' ? (
                  <SourcePanel />
                ) : (
                  <AIPanel projectId={project.id} />
                )}
              </div>
            </div>

            {/* 中间：预览区 - 自适应宽度 */}
            <div className="flex-1 bg-[#1e1e1e] flex flex-col min-w-0 min-h-0">
              <PreviewPanel />
            </div>

            {/* 右侧：文稿/属性 - 固定宽度 */}
            <div className="w-72 flex-shrink-0 bg-[#252526] border-l border-[#3e3e42] flex flex-col min-h-0">
              <div className="h-9 bg-[#2d2d30] border-b border-[#3e3e42] flex items-center justify-between px-3 flex-shrink-0">
                <div className="flex items-center">
                  <FileText className="w-3.5 h-3.5 text-[#808080] mr-2" />
                  <span className="text-xs font-medium text-[#cccccc]">文稿</span>
                </div>
                {/* 显示当前模式 */}
                {timeline.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[#4fc3f7]">剪辑模式</span>
                    <button
                      onClick={clearTimeline}
                      className="text-[10px] text-[#808080] hover:text-[#cccccc] underline"
                    >
                      重置
                    </button>
                  </div>
                )}
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <TranscriptPanel onEdit={debouncedSave} />
              </div>
            </div>
          </div>

          {/* 下半部分：时间线 - 固定高度 */}
          <div className="h-44 flex-shrink-0 bg-[#252526] border-t border-[#3e3e42]">
            <TimelineTrack />
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <ExportModal projectId={project.id} onClose={() => setShowExportModal(false)} />
      )}
    </div>
  )
}

// 简化的文稿面板
function TranscriptPanel({ }: { onEdit?: () => void }) {
  const {
    transcript,
    isTranscriptLoading,
    currentTime,
    deletedSegmentIds,
    timeline,
  } = useProjectStore()

  if (isTranscriptLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#0e639c] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!transcript) {
    return (
      <div className="h-full flex items-center justify-center text-[#808080] text-sm">
        暂无文稿
      </div>
    )
  }

  // 如果有 timeline，显示剪辑后的片段
  const displaySegments = timeline.length > 0
    ? timeline.map((clip, index) => ({
        id: `timeline-${index}`,
        start: clip.start,
        end: clip.end,
        text: clip.text,
        repeat: clip.repeat,
        speed: clip.speed,
      }))
    : transcript.segments.filter(s => !deletedSegmentIds.has(s.id))

  return (
    <div className="h-full overflow-y-auto p-3 space-y-2">
      {displaySegments.map((segment, index) => {
        const isActive = currentTime >= segment.start && currentTime < segment.end

        return (
          <div
            key={segment.id || index}
            onClick={() => {
              const seekTo = (window as any).seekTo
              seekTo?.(segment.start)
            }}
            className={cn(
              'p-2 rounded cursor-pointer transition-all text-sm',
              isActive && 'bg-[#264f78] border-l-2 border-[#0e639c]',
              !isActive && 'hover:bg-[#2a2d2e]'
            )}
          >
            <p className={cn(
              'text-[#cccccc] leading-relaxed',
              isActive && 'text-white'
            )}>
              {segment.text}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-[#808080] font-mono">
                {formatTime(segment.start)}
              </span>
              {'repeat' in segment && segment.repeat && segment.repeat > 1 && (
                <span className="text-[10px] text-[#4fc3f7]">×{segment.repeat}</span>
              )}
              {'speed' in segment && segment.speed && segment.speed !== 1 && (
                <span className="text-[10px] text-[#ffb74d]">{segment.speed}x</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
