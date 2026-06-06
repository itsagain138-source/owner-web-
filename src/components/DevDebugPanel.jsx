import { useState, useEffect, useCallback } from 'react';
import { getDebugLogs, clearDebugLogs, onDebugUpdate } from '../api';

export default function DevDebugPanel() {
  const [logs, setLogs] = useState(getDebugLogs());
  const [visible, setVisible] = useState(false);
  const [filter, setFilter] = useState('all'); // all | green | yellow | red

  useEffect(() => {
    const unsub = onDebugUpdate(setLogs);
    return unsub;
  }, []);

  // Keyboard shortcut: Ctrl+Shift+D to toggle
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setVisible(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const filtered = filter === 'all' ? logs : logs.filter(l => l.indicator === filter);

  const stats = {
    total: logs.length,
    green: logs.filter(l => l.indicator === 'green').length,
    yellow: logs.filter(l => l.indicator === 'yellow').length,
    red: logs.filter(l => l.indicator === 'red').length,
    avgTime: logs.length ? Math.round(logs.reduce((s, l) => s + (l.time_ms || 0), 0) / logs.length) : 0,
  };

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        title="Developer Debug Panel (Ctrl+Shift+D)"
        style={{
          position: 'fixed', bottom: 16, right: 16, zIndex: 99999,
          width: 48, height: 48, borderRadius: '50%',
          background: stats.red > 0 ? '#ef4444' : stats.yellow > 0 ? '#eab308' : '#22c55e',
          color: '#fff', border: 'none', cursor: 'pointer',
          fontSize: 18, fontWeight: 700,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s',
        }}
      >
        <span style={{ fontSize: 12 }}>{stats.total}</span>
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 0, right: 0, zIndex: 99999,
      width: '100%', maxWidth: 680, height: '50vh',
      background: '#0f172a', color: '#e2e8f0',
      borderTopLeftRadius: 16, borderTopRightRadius: 16,
      boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Inter', 'SF Mono', monospace", fontSize: 12,
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid #1e293b',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#38bdf8' }}>
          🔧 API Debug Panel
        </span>
        <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, background: '#166534', color: '#86efac' }}>
          ✓ {stats.green}
        </span>
        <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, background: '#854d0e', color: '#fde047' }}>
          ⚠ {stats.yellow}
        </span>
        <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, background: '#991b1b', color: '#fca5a5' }}>
          ✗ {stats.red}
        </span>
        <span style={{ fontSize: 11, color: '#64748b' }}>
          avg: {stats.avgTime}ms
        </span>
        <div style={{ flex: 1 }} />
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{
            background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155',
            borderRadius: 6, padding: '3px 8px', fontSize: 11,
          }}
        >
          <option value="all">All</option>
          <option value="green">✓ Success</option>
          <option value="yellow">⚠ Slow</option>
          <option value="red">✗ Failed</option>
        </select>
        <button onClick={clearDebugLogs} style={{
          background: '#1e293b', color: '#94a3b8', border: '1px solid #334155',
          borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 11,
        }}>Clear</button>
        <button onClick={() => setVisible(false)} style={{
          background: '#1e293b', color: '#94a3b8', border: '1px solid #334155',
          borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 11,
        }}>✕</button>
      </div>

      {/* Logs */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: '#475569' }}>
            No API calls logged yet. Navigate the dashboard to see requests.
          </div>
        )}
        {filtered.map((log, i) => {
          const bg = log.indicator === 'red' ? '#1c1017' : log.indicator === 'yellow' ? '#1c1a0f' : '#0f1c15';
          const statusColor = log.indicator === 'red' ? '#f87171' : log.indicator === 'yellow' ? '#fbbf24' : '#4ade80';
          const time = new Date(log.timestamp).toLocaleTimeString();

          return (
            <div key={i} style={{
              padding: '6px 16px', borderBottom: '1px solid #1e293b',
              background: bg, display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: statusColor, flexShrink: 0,
              }} />
              <span style={{ color: '#94a3b8', width: 60, flexShrink: 0 }}>{time}</span>
              <span style={{ color: statusColor, width: 44, fontWeight: 700, flexShrink: 0 }}>
                {log.status}
              </span>
              <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {log.api}
              </span>
              <span style={{ color: '#64748b', width: 60, textAlign: 'right', flexShrink: 0 }}>
                {log.time_ms}ms
              </span>
              <span style={{ color: '#475569', width: 50, textAlign: 'right', flexShrink: 0 }}>
                {log.payload_bytes > 1024 ? `${(log.payload_bytes / 1024).toFixed(1)}KB` : `${log.payload_bytes}B`}
              </span>
              <span style={{
                color: '#475569', width: 50, textAlign: 'right', flexShrink: 0,
                fontSize: 10,
              }}>
                {log.backend}
              </span>
              {log.attempt > 1 && (
                <span style={{
                  background: '#854d0e', color: '#fde047', padding: '1px 5px',
                  borderRadius: 4, fontSize: 10, flexShrink: 0,
                }}>
                  ×{log.attempt}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: '6px 16px', borderTop: '1px solid #1e293b',
        display: 'flex', alignItems: 'center', gap: 12,
        fontSize: 10, color: '#475569',
      }}>
        <span>Core: {CORE_URL.replace('https://', '')}</span>
        <span>|</span>
        <span>Ops: {OPS_URL.replace('https://', '')}</span>
        <div style={{ flex: 1 }} />
        <span>Ctrl+Shift+D to toggle</span>
      </div>
    </div>
  );
}
