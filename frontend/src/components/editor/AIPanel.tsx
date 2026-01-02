import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, Sparkles, CheckCircle, Play } from 'lucide-react'
import { useProjectStore } from '@/store/project'
import { cn } from '@/lib/utils'

interface AIPanelProps {
  projectId: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timeline?: any[]
  outputVideo?: string
  finished?: boolean
}

export function AIPanel({ projectId }: AIPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { setTimeline, timeline } = useProjectStore()

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 自动调整输入框高度
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 100) + 'px'
    }
  }, [input])

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()

    const trimmedInput = input.trim()
    if (!trimmedInput || isLoading) return

    // 添加用户消息
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: trimmedInput,
    }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch(`/api/v1/projects/${projectId}/ai/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: trimmedInput }),
      })

      const data = await response.json()

      if (data.success) {
        const result = data.data
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: result.reply,
          timeline: result.timeline,
          outputVideo: result.output_video,
          finished: result.finished,
        }
        setMessages(prev => [...prev, assistantMessage])

        // 如果有时间线，自动更新到 store（直接显示在时间线上）
        if (result.timeline && result.timeline.length > 0) {
          setTimeline(result.timeline)
        }
      } else {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `错误: ${data.error?.message || '请求失败'}`,
        }
        setMessages(prev => [...prev, errorMessage])
      }
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '网络错误，请重试',
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // 应用某条消息的时间线
  function applyTimeline(msgTimeline: any[]) {
    if (msgTimeline && msgTimeline.length > 0) {
      setTimeline(msgTimeline)
    }
  }

  // 快捷指令
  const quickCommands = [
    { label: '删除静音', prompt: '删除所有静音片段' },
    { label: '提取精华', prompt: '提取最精彩的30秒内容' },
    { label: '鬼畜视频', prompt: '做一个鬼畜视频，把有节奏感的句子重复几次' },
  ]

  return (
    <div className="h-full flex flex-col">
      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <div className="w-10 h-10 rounded-full bg-[#0e639c]/20 flex items-center justify-center mb-3">
              <Sparkles className="w-5 h-5 text-[#0e639c]" />
            </div>
            <h3 className="text-xs font-medium text-[#cccccc] mb-1">AI 剪辑助手</h3>
            <p className="text-[10px] text-[#808080] mb-3">
              告诉我你想要的剪辑效果
            </p>

            {/* 快捷指令 */}
            <div className="flex flex-col gap-1.5 w-full">
              {quickCommands.map((cmd) => (
                <button
                  key={cmd.label}
                  onClick={() => setInput(cmd.prompt)}
                  className="px-2 py-1.5 text-[10px] bg-[#3e3e42] hover:bg-[#4e4e52] text-[#cccccc] rounded transition-colors text-left"
                >
                  {cmd.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={cn(
                  'max-w-[90%] rounded-lg px-2.5 py-2',
                  message.role === 'user'
                    ? 'bg-[#0e639c] text-white'
                    : 'bg-[#3e3e42] text-[#cccccc]'
                )}
              >
                <p className="text-[11px] whitespace-pre-wrap leading-relaxed">{message.content}</p>

                {/* 完成状态 + 时间线信息 */}
                {message.finished && message.timeline && message.timeline.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-white/10">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle className="w-3 h-3 text-green-400" />
                        <span className="text-[10px] text-green-400">
                          {message.timeline.length} 个片段
                        </span>
                      </div>
                      {/* 应用按钮（如果当前时间线不是这个） */}
                      {timeline !== message.timeline && (
                        <button
                          onClick={() => applyTimeline(message.timeline!)}
                          className="flex items-center gap-1 text-[10px] text-[#4fc3f7] hover:text-[#81d4fa] transition-colors"
                        >
                          <Play className="w-3 h-3" />
                          应用
                        </button>
                      )}
                    </div>
                    
                    {/* 时间线预览 */}
                    <div className="flex gap-0.5 flex-wrap">
                      {message.timeline.slice(0, 8).map((clip: any, i: number) => (
                        <div
                          key={i}
                          className="h-1.5 rounded-sm bg-[#4fc3f7]"
                          style={{
                            width: Math.max(4, Math.min((clip.end - clip.start) * 2, 20)),
                          }}
                          title={clip.text?.slice(0, 30)}
                        />
                      ))}
                      {message.timeline.length > 8 && (
                        <span className="text-[9px] text-[#808080]">
                          +{message.timeline.length - 8}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {/* 加载状态 */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-[#3e3e42] rounded-lg px-2.5 py-2 flex items-center gap-2">
              <Loader2 className="w-3 h-3 text-[#0e639c] animate-spin" />
              <span className="text-[10px] text-[#808080]">AI 正在剪辑...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入区 */}
      <div className="p-2 border-t border-[#3e3e42] flex-shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-1.5">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述剪辑效果..."
            rows={1}
            className="flex-1 bg-[#3e3e42] border border-[#3e3e42] focus:border-[#0e639c] rounded px-2 py-1.5 text-[11px] text-[#cccccc] placeholder-[#808080] resize-none outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className={cn(
              'p-1.5 rounded transition-colors flex-shrink-0',
              input.trim() && !isLoading
                ? 'bg-[#0e639c] hover:bg-[#1177bb] text-white'
                : 'bg-[#3e3e42] text-[#808080] cursor-not-allowed'
            )}
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
