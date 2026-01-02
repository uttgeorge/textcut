import { useState } from 'react'
import { MessageSquare, FileText, Film } from 'lucide-react'
import { AIChat } from './AIChat'
import { cn } from '@/lib/utils'

type TabType = 'chat' | 'transcript' | 'media'

export function Sidebar() {
  const [activeTab, setActiveTab] = useState<TabType>('chat')

  const tabs = [
    { id: 'chat' as const, icon: MessageSquare, label: 'AI 助手' },
    { id: 'transcript' as const, icon: FileText, label: '文稿' },
    { id: 'media' as const, icon: Film, label: '媒体' },
  ]

  return (
    <div className="w-80 border-r border-border flex flex-col bg-surface">
      {/* Tab Navigation */}
      <div className="flex border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'text-primary border-b-2 border-primary'
                : 'text-text-secondary hover:text-text-primary'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'chat' && <AIChat />}
        {activeTab === 'transcript' && <TranscriptList />}
        {activeTab === 'media' && <MediaPanel />}
      </div>
    </div>
  )
}

function TranscriptList() {
  const { transcript, currentTime, deletedSegmentIds } = useProjectStore()

  if (!transcript) {
    return (
      <div className="p-4 text-center text-text-secondary">
        暂无文稿
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-2">
      {transcript.segments.map((segment) => {
        const isDeleted = deletedSegmentIds.has(segment.id)
        const isActive = currentTime >= segment.start && currentTime < segment.end

        return (
          <div
            key={segment.id}
            onClick={() => {
              const seekTo = (window as unknown as { seekTo?: (time: number) => void }).seekTo
              seekTo?.(segment.start)
            }}
            className={cn(
              'p-2 rounded-lg cursor-pointer transition-colors text-sm',
              isActive && 'bg-primary/10 border border-primary/30',
              isDeleted && 'opacity-40 line-through',
              !isActive && !isDeleted && 'hover:bg-surface-hover'
            )}
          >
            <p className="line-clamp-2 text-text-primary">{segment.text}</p>
            <span className="text-xs text-text-muted mt-1 block">
              {formatTime(segment.start)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function MediaPanel() {
  const { project } = useProjectStore()

  return (
    <div className="p-4">
      <div className="aspect-video bg-background rounded-lg overflow-hidden mb-4">
        {project?.thumbnail_url ? (
          <img
            src={project.thumbnail_url}
            alt="Thumbnail"
            className="w-full h-full object-cover"
          />
        ) : project?.video_url ? (
          <video
            src={project.video_url}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-muted">
            <Film className="w-12 h-12" />
          </div>
        )}
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-text-secondary">文件名</span>
          <span className="text-text-primary">{project?.name}</span>
        </div>
        {project?.duration && (
          <div className="flex justify-between">
            <span className="text-text-secondary">时长</span>
            <span className="text-text-primary">{formatDuration(project.duration)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

import { useProjectStore } from '@/store/project'
import { formatTime, formatDuration } from '@/lib/utils'
