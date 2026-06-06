const _BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api'

function _ship(level, message, context) {
  fetch(`${_BASE}/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, message, context }),
    keepalive: true,
  }).catch(() => {}) // never surface logging errors to the caller
}

function _emit(level, message, context = {}) {
  const entry = { ts: new Date().toISOString(), level, msg: message, ...context }
  if (level === 'error') {
    console.error(JSON.stringify(entry))
    _ship(level, message, context)
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry))
  } else {
    console.info(JSON.stringify(entry))
  }
}

export const logger = {
  info:  (msg, ctx) => _emit('info',  msg, ctx),
  warn:  (msg, ctx) => _emit('warn',  msg, ctx),
  error: (msg, ctx) => _emit('error', msg, ctx),
}
