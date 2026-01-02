import { useState, useEffect } from 'react'
import { X, Download, FileVideo, FileText, Loader2, Check } from 'lucide-react'
import { createExport, getExportStatus } from '@/lib/api'
import type { ExportFormat, ExportRecord } from '@/types'
import { cn, formatFileSize } from '@/lib/utils'

interface ExportModalProps {
  projectId: string
  onClose: () => void
}

const EXPORT_OPTIONS: Array<{
  format: ExportFormat
  label: string
  description: string
  icon: typeof FileVideo
}> = [
  {
    format: 'fcpxml',
    label: 'Final Cut Pro XML',
    description: '适用于 Final Cut Pro X 10.4+',
    icon: FileText,
  },
  {
    format: 'premiere_xml',
    label: 'Adobe Premiere XML',
    description: '适用于 Adobe Premiere Pro',
    icon: FileText,
  },
  {
    format: 'edl',
    label: 'CMX3600 EDL',
    description: '通用剪辑决策列表格式',
    icon: FileText,
  },
]

export function ExportModal({ projectId, onClose }: ExportModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('fcpxml')
  const [isExporting, setIsExporting] = useState(false)
  const [exportRecord, setExportRecord] = useState<ExportRecord | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Poll export status
  useEffect(() => {
    if (!exportRecord || exportRecord.status === 'completed' || exportRecord.status === 'failed') {
      return
    }

    const interval = setInterval(async () => {
      try {
        const status = await getExportStatus(projectId, exportRecord.export_id)
        setExportRecord(status)

        if (status.status === 'completed' || status.status === 'failed') {
          clearInterval(interval)
        }
      } catch (err) {
        console.error('Failed to get export status:', err)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [exportRecord, projectId])

  async function handleExport() {
    setIsExporting(true)
    setError(null)

    try {
      const record = await createExport(projectId, selectedFormat)
      setExportRecord(record)
    } catch (err) {
      setError('导出失败，请重试')
    } finally {
      setIsExporting(false)
    }
  }

  function handleDownload() {
    if (exportRecord?.download_url) {
      window.open(exportRecord.download_url, '_blank')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-medium text-text-primary">导出项目</h2>
          <button
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-text-primary rounded-lg hover:bg-surface-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {exportRecord?.status === 'completed' ? (
            // Success state
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-success/20 rounded-full flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-success" />
              </div>
              <div>
                <p className="text-text-primary font-medium">导出完成</p>
                {exportRecord.file_size && (
                  <p className="text-sm text-text-secondary mt-1">
                    文件大小: {formatFileSize(exportRecord.file_size)}
                  </p>
                )}
              </div>
              <button
                onClick={handleDownload}
                className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-primary hover:bg-primary-hover rounded-lg text-white font-medium transition-colors"
              >
                <Download className="w-5 h-5" />
                下载文件
              </button>
            </div>
          ) : exportRecord?.status === 'processing' || isExporting ? (
            // Processing state
            <div className="text-center space-y-4 py-8">
              <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
              <div>
                <p className="text-text-primary font-medium">正在导出...</p>
                <p className="text-sm text-text-secondary mt-1">
                  请稍候，这可能需要几秒钟
                </p>
              </div>
            </div>
          ) : (
            // Selection state
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">选择导出格式：</p>

              <div className="space-y-2">
                {EXPORT_OPTIONS.map((option) => (
                  <button
                    key={option.format}
                    onClick={() => setSelectedFormat(option.format)}
                    className={cn(
                      'w-full flex items-center gap-4 p-4 rounded-lg border transition-colors text-left',
                      selectedFormat === option.format
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-border-light'
                    )}
                  >
                    <div
                      className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center',
                        selectedFormat === option.format
                          ? 'bg-primary/20 text-primary'
                          : 'bg-surface-hover text-text-muted'
                      )}
                    >
                      <option.icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-text-primary">{option.label}</p>
                      <p className="text-sm text-text-secondary">{option.description}</p>
                    </div>
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                        selectedFormat === option.format
                          ? 'border-primary bg-primary'
                          : 'border-border'
                      )}
                    >
                      {selectedFormat === option.format && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {error && (
                <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleExport}
                disabled={isExporting}
                className="w-full px-4 py-3 bg-primary hover:bg-primary-hover rounded-lg text-white font-medium transition-colors disabled:opacity-50"
              >
                开始导出
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
