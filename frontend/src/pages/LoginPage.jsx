import { useState } from 'react'
import { login } from '../api.js'
import { TOKEN_KEY } from '../constants.js'
import styles from './LoginPage.module.css'

export default function LoginPage({ onLogin, sessionExpired = false }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!password) return
    setLoading(true)
    setError(null)
    try {
      const { access_token } = await login(password)
      localStorage.setItem(TOKEN_KEY, access_token)
      onLogin(access_token)
    } catch {
      setError('Incorrect password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.backdrop}>
      <div className={styles.card}>
        <img src="/favicon.svg" alt="EzyChart" className={styles.logo} />
        <h1 className={styles.title}>EzyChart</h1>
        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            className={styles.input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            autoFocus
          />
          <button className={styles.button} type="submit" disabled={loading}>
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </form>
        {sessionExpired && !error && (
          <p className={styles.error}>Your session has expired. Please log in again.</p>
        )}
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  )
}
