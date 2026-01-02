import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Video, Clock, Trash2, MoreVertical } from 'lucide-react'
import { getProjects, createProject, deleteProject } from '@/lib/api'
import { formatDuration, formatRelativeTime } from '@/lib/utils'
import type { Project } from '@/types'

export function ProjectList() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => {
    loadProjects()
  }, [])

  async function loadProjects() {
    try {
      const data = await getProjects()
      setProjects(data.items)
    } catch (error) {
      console.error('Failed to load projects:', error)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleCreateProject() {
    if (!newProjectName.trim()) return

    setIsCreating(true)
    try {
      const project = await createProject(newProjectName.trim())
      setProjects([project, ...projects])
      setShowCreateModal(false)
      setNewProjectName('')
      navigate(`/project/${project.id}`)
    } catch (error) {
      console.error('Failed to create project:', error)
    } finally {
      setIsCreating(false)
    }
  }

  async function handleDeleteProject(projectId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('确定要删除这个项目吗？')) return

    try {
      await deleteProject(projectId)
      setProjects(projects.filter((p) => p.id !== projectId))
    } catch (error) {
      console.error('Failed to delete project:', error)
    }
  }

  function getStatusBadge(status: Project['status']) {
    const badges: Record<Project['status'], { label: string; className: string }> = {
      EMPTY: { label: '待上传', className: 'bg-gray-500/20 text-gray-400' },
      UPLOADING: { label: '上传中', className: 'bg-blue-500/20 text-blue-400' },
      PROCESSING: { label: '处理中', className: 'bg-yellow-500/20 text-yellow-400' },
      READY: { label: '就绪', className: 'bg-green-500/20 text-green-400' },
      EXPORTING: { label: '导出中', className: 'bg-purple-500/20 text-purple-400' },
      ERROR: { label: '错误', className: 'bg-red-500/20 text-red-400' },
    }
    const badge = badges[status]
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
        {badge.label}
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-surface">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Video className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-text-primary">TextCut</h1>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover rounded-lg text-white font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            新建项目
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <h2 className="text-lg font-medium text-text-primary mb-6">我的项目</h2>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20">
            <Video className="w-16 h-16 text-text-muted mx-auto mb-4" />
            <p className="text-text-secondary mb-4">还没有项目</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-primary hover:bg-primary-hover rounded-lg text-white font-medium transition-colors"
            >
              创建第一个项目
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                onClick={() => navigate(`/project/${project.id}`)}
                className="bg-surface border border-border rounded-xl p-4 hover:border-border-light cursor-pointer transition-colors group"
              >
                {/* Thumbnail */}
                <div className="aspect-video bg-background rounded-lg mb-4 flex items-center justify-center overflow-hidden">
                  {project.thumbnail_url ? (
                    <img
                      src={project.thumbnail_url}
                      alt={project.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Video className="w-12 h-12 text-text-muted" />
                  )}
                </div>

                {/* Info */}
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-text-primary truncate">{project.name}</h3>
                    <div className="flex items-center gap-3 mt-2 text-sm text-text-secondary">
                      {project.duration && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDuration(project.duration)}
                        </span>
                      )}
                      <span>{formatRelativeTime(project.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(project.status)}
                    <button
                      onClick={(e) => handleDeleteProject(project.id, e)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-error hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-text-primary mb-4">新建项目</h3>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="项目名称"
              className="w-full px-4 py-3 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
            />
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setNewProjectName('')
                }}
                className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreateProject}
                disabled={!newProjectName.trim() || isCreating}
                className="px-4 py-2 bg-primary hover:bg-primary-hover rounded-lg text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
