import styles from './Skeleton.module.css'

function Line({ width = '100%', height = '14px' }) {
  return <div className={styles.line} style={{ width, height }} />
}

export function SkeletonQuoteCard() {
  return (
    <div className={styles.quoteCard}>
      <div className={styles.symbolRow}>
        <Line width="72px" height="28px" />
        <Line width="130px" height="18px" />
      </div>
      <div className={styles.quoteItems}>
        {[80, 80, 80, 80, 80].map((w, i) => (
          <div key={i} className={styles.quoteItem}>
            <Line width="56px" height="11px" />
            <Line width={`${w}px`} height="22px" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function SkeletonMetricsGroup({ rows = 6 }) {
  return (
    <div className={styles.metricsCard}>
      <Line width="110px" height="15px" />
      <div className={styles.metricsRows}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={styles.metricsRow}>
            <Line width="150px" height="13px" />
            <Line width="70px" height="13px" />
          </div>
        ))}
      </div>
    </div>
  )
}
