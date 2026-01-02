import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, MessageCircle } from 'lucide-react'
import { useProjectStore } from '@/store/project'
import { chatWithAI } from '@/lib/api'
import { cn } from '@/lib/utils'

export function AIChat() {
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState<string | undefined>()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    project,
    chatMessages,
    isAIProcessing,
    addChatMessage,
    setAIProcessing,
    applySuggestionDirect,
  } = useProjectStore()

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  async function handleSend() {
    if (!input.trim() || isAIProcessing || !project) return

    const userMessage = {
      id: `msg_${Date.now()}`,
      role: 'user' as const,
      content: input.trim(),
      timestamp: new Date().toISOString(),
    }

    addChatMessage(userMessage)
    setInput('')
    setAIProcessing(true)

    try {
      // 使用对话式 API
      const response = await chatWithAI(project.id, userMessage.content, sessionId)

      // 保存 session ID
      if (response.session_id) {
        setSessionId(response.session_id)
      }

      const assistantMessage = {
        id: `msg_${Date.now()}`,
        role: 'assistant' as const,
        content: response.reply,
        timestamp: new Date().toISOString(),
        suggestion: response.action || undefined,
      }

      addChatMessage(assistantMessage)

      // Auto-apply suggestion immediately without confirmation
      if (response.action && response.action.action !== 'no_action') {
        console.log('[DEBUG] AIChat: Applying suggestion directly:', response.action)
        applySuggestionDirect(response.action)

        // Add applied message
        addChatMessage({
          id: `msg_${Date.now() + 1}`,
          role: 'assistant' as const,
          content: `✅ 已应用：${response.action.description || '编辑操作'}`,
          timestamp: new Date().toISOString(),
        })
      }
    } catch (error) {
      const errorMessage = {
        id: `msg_${Date.now()}`,
        role: 'assistant' as const,
        content: '抱歉，处理请求时出错了。请稍后重试。',
        timestamp: new Date().toISOString(),
      }
      addChatMessage(errorMessage)
    } finally {
      setAIProcessing(false)
    }
  }

  const suggestions = [
    '剪掉前30秒',
    '删除所有静音',
    '只保留1分钟到3分钟的内容',
    '裁剪成2分钟',
    '分析一下视频讲了什么',
  ]

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <MessageCircle className="w-5 h-5 text-primary" />
        <span className="font-medium text-text-primary">AI 助手</span>
        <span className="text-xs text-text-muted ml-auto">DeepSeek</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatMessages.length === 0 ? (
          <div className="text-center py-8">
            <Bot className="w-12 h-12 text-primary mx-auto mb-4" />
            <p className="text-text-primary font-medium mb-2">AI 剪辑助手</p>
            <p className="text-text-secondary text-sm mb-6">
              我可以帮你快速剪辑视频，试试说：
            </p>
            <div className="space-y-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="block w-full text-left px-4 py-2 bg-surface-hover rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  "{suggestion}"
                </button>
              ))}
            </div>
          </div>
        ) : (
          chatMessages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex gap-3',
                message.role === 'user' ? 'flex-row-reverse' : ''
              )}
            >
              {/* Avatar */}
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                  message.role === 'user' ? 'bg-primary' : 'bg-surface-hover'
                )}
              >
                {message.role === 'user' ? (
                  <User className="w-4 h-4 text-white" />
                ) : (
                  <Bot className="w-4 h-4 text-primary" />
                )}
              </div>

              {/* Content */}
              <div
                className={cn(
                  'max-w-[80%] rounded-lg px-4 py-2',
                  message.role === 'user'
                    ? 'bg-primary text-white'
                    : 'bg-surface-hover text-text-primary'
                )}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>

                {/* Show applied action info */}
                {message.suggestion && message.suggestion.action !== 'no_action' && (
                  <div className="mt-2 text-xs text-text-muted">
                    影响 {message.suggestion.segments_affected || 0} 处，
                    共 {(message.suggestion.total_duration_removed || 0).toFixed(1)} 秒
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {/* Loading */}
        {isAIProcessing && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="bg-surface-hover rounded-lg px-4 py-2 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm text-text-secondary">正在思考...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="输入指令或问题..."
            disabled={isAIProcessing}
            className="flex-1 px-4 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isAIProcessing}
            className="p-2 bg-primary hover:bg-primary-hover rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
