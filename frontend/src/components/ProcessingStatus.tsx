import { Loader2, Check, Circle } from 'lucide-react'
import { useProjectStore } from '@/store/project'
import { cn } from '@/lib/utils'

const STEPS = [
  { key: 'uploading', label: '上传文件' },
  { key: 'extracting_audio', label: '提取音频' },
  { key: 'transcribing', label: '语音识别' },
  { key: 'aligning', label: '时间对齐' },
  { key: 'detecting_silence', label: '静音检测' },
]

export function ProcessingStatus() {
  const { project } = useProjectStore()

  if (!project) return null

  const progress = project.processing_progress

  // Determine step statuses
  function getStepStatus(stepKey: string): 'pending' | 'in_progress' | 'completed' {
    const stepIndex = STEPS.findIndex((s) => s.key === stepKey)
    const stepProgress = [0, 10, 70, 85, 100]

    if (progress >= stepProgress[stepIndex + 1]) {
      return 'completed'
    } else if (progress >= stepProgress[stepIndex]) {
      return 'in_progress'
    }
    return 'pending'
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-md space-y-8">
        {/* Progress Circle */}
        <div className="relative w-32 h-32 mx-auto">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="56"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              className="text-border"
            />
            <circle
              cx="64"
              cy="64"
              r="56"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              strokeDasharray={2 * Math.PI * 56}
              strokeDashoffset={2 * Math.PI * 56 * (1 - progress / 100)}
              strokeLinecap="round"
              className="text-primary transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-3xl font-bold text-text-primary">{progress}%</span>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {STEPS.map((step) => {
            const status = getStepStatus(step.key)

            return (
              <div
                key={step.key}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg transition-colors',
                  status === 'in_progress' && 'bg-primary/10'
                )}
              >
                {/* Icon */}
                {status === 'completed' ? (
                  <div className="w-6 h-6 rounded-full bg-success flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                ) : status === 'in_progress' ? (
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                ) : (
                  <Circle className="w-6 h-6 text-text-muted" />
                )}

                {/* Label */}
                <span
                  className={cn(
                    'text-sm',
                    status === 'completed' && 'text-text-primary',
                    status === 'in_progress' && 'text-primary font-medium',
                    status === 'pending' && 'text-text-muted'
                  )}
                >
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Estimated Time */}
        <p className="text-center text-sm text-text-secondary">
          预计还需 {Math.max(1, Math.round((100 - progress) * 0.1))} 分钟
        </p>
      </div>
    </div>
  )
}
