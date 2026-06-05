import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { streamChatMessage } from '../../api.js'
import styles from './ResearchPanel.module.css'

const STARTERS = [
  "What's Apple's current price and analyst consensus?",
  "What are today's biggest stock gainers?",
  "What's the current price of NVDA?",
]

export default function ResearchPanel({ token }) {
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [history, open])

  const send = async (message) => {
    const msg = message.trim()
    if (!msg || loading) return
    setInput('')

    // Build history for the API: last 10 messages, 'ai' → 'assistant', skip errors
    const apiHistory = history
      .filter(m => !m.error)
      .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }))
      .slice(-10)

    // Append user message and empty AI placeholder in one update
    setHistory(h => [...h, { role: 'user', content: msg }, { role: 'ai', content: '' }])
    setLoading(true)

    try {
      for await (const chunk of streamChatMessage(msg, apiHistory, token)) {
        setHistory(h => {
          const updated = [...h]
          const last = updated[updated.length - 1]
          updated[updated.length - 1] = { ...last, content: last.content + chunk }
          return updated
        })
      }
    } catch (e) {
      setHistory(h => {
        const updated = [...h]
        updated[updated.length - 1] = { role: 'ai', content: `Error: ${e.message}`, error: true }
        return updated
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    send(input)
  }

  return (
    <>
      <button
        className={styles.toggleBtn}
        onClick={() => setOpen(o => !o)}
        aria-label="Toggle research panel"
      >
        {open ? '✕' : '💬'}
      </button>

      <div className={`${styles.panel} ${open ? styles.panelOpen : ''}`}>
        <div className={styles.header}>
          <span className={styles.title}>Research</span>
          <button className={styles.clearBtn} onClick={() => setHistory([])} disabled={history.length === 0}>
            Clear
          </button>
        </div>

        <div className={styles.messages}>
          {history.length === 0 && (
            <div className={styles.starters}>
              <p className={styles.startersLabel}>Try asking:</p>
              {STARTERS.map(q => (
                <button key={q} className={styles.starterBtn} onClick={() => send(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}
          {history.map((msg, i) => {
            const isLastAi = i === history.length - 1 && msg.role === 'ai'
            const showTyping = loading && isLastAi && !msg.content
            return (
              <div key={i} className={msg.role === 'user' ? styles.userMsg : msg.error ? styles.errorMsg : styles.aiMsg}>
                {showTyping
                  ? <span className={styles.typing}>●●●</span>
                  : msg.role === 'ai' && !msg.error
                    ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    : msg.content
                }
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        <form className={styles.inputRow} onSubmit={handleSubmit}>
          <input
            className={styles.input}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask anything..."
            disabled={loading}
            autoComplete="off"
          />
          <button className={styles.sendBtn} type="submit" disabled={loading || !input.trim()}>
            Send
          </button>
        </form>
      </div>
    </>
  )
}
