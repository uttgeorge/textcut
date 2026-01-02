import { useState, useRef } from 'react'
import { Upload, Video, X } from 'lucide-react'
import { uploadVideo } from '@/lib/api'
import { useProjectStore } from '@/store/project'
import { formatFileSize, cn } from '@/lib/utils'

interface UploadZoneProps {
  projectId: string
  onUploadStart?: () => void
}

export function UploadZone({ projectId, onUploadStart }: UploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { updateProjectStatus } = useProjectStore()

  const allowedTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska']
  const maxSize = 2 * 1024 * 1024 * 1024 // 2GB

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      validateAndSetFile(file)
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      validateAndSetFile(file)
    }
  }

  function validateAndSetFile(file: File) {
    setError(null)

    if (!allowedTypes.includes(file.type)) {
      setError('不支持的文件格式，请上传 MP4, MOV, WEBM 或 MKV 格式的视频')
      return
    }

    if (file.size > maxSize) {
      setError('文件过大，最大支持 2GB')
      return
    }

    setSelectedFile(file)
  }

  async function handleUpload() {
    if (!selectedFile) return

    setIsUploading(true)
    setError(null)
    updateProjectStatus('UPLOADING')

    try {
      await uploadVideo(projectId, selectedFile, (progress) => {
        setUploadProgress(progress)
      })

      updateProjectStatus('PROCESSING', 0)
      onUploadStart?.()
    } catch (err) {
      setError('上传失败，请重试')
      updateProjectStatus('EMPTY')
      setIsUploading(false)
    }
  }

  function handleClear() {
    setSelectedFile(null)
    setUploadProgress(0)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-xl">
        {/* Upload Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !selectedFile && fileInputRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer',
            isDragging && 'border-primary bg-primary/5',
            !isDragging && !selectedFile && 'border-border hover:border-border-light',
            selectedFile && 'border-primary/50 bg-primary/5 cursor-default'
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
            onChange={handleFileSelect}
            className="hidden"
          />

          {selectedFile ? (
            <div className="space-y-4">
              <div className="w-16 h-16 bg-primary/20 rounded-xl flex items-center justify-center mx-auto">
                <Video className="w-8 h-8 text-primary" />
              </div>

              <div>
                <p className="font-medium text-text-primary">{selectedFile.name}</p>
                <p className="text-sm text-text-secondary mt-1">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>

              {isUploading ? (
                <div className="space-y-2">
                  <div className="h-2 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-sm text-text-secondary">上传中 {uploadProgress}%</p>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleUpload()
                    }}
                    className="px-6 py-2 bg-primary hover:bg-primary-hover rounded-lg text-white font-medium transition-colors"
                  >
                    开始上传
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleClear()
                    }}
                    className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-16 h-16 bg-surface-hover rounded-xl flex items-center justify-center mx-auto">
                <Upload className="w-8 h-8 text-text-muted" />
              </div>

              <div>
                <p className="font-medium text-text-primary">
                  拖放视频文件到这里，或点击选择
                </p>
                <p className="text-sm text-text-secondary mt-2">
                  支持 MP4, MOV, WEBM, MKV 格式，最大 2GB
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-4 bg-error/10 border border-error/30 rounded-lg text-error text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
