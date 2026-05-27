import React, { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getSystemTelemetry, getOpsTelemetry } from '../api';

const POLL_MS = 20_000;

export function BackendControlCenterView() {
  const [activeTab, setActiveTab] = useState('System Health');
  const [coreStats, setCoreStats] = useState(null);
  const [opsStats, setOpsStats] = useState(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const auth = JSON.parse(localStorage.getItem('ms-owner-auth'));
    if (!auth?.token) {
      setError('Authorization credentials missing.');
      return undefined;
    }

    let cancelled = false;

    const fetchStats = async () => {
      try {
        const [core, ops] = await Promise.all([
          getSystemTelemetry(auth.token),
          getOpsTelemetry(auth.token),
        ]);
        if (cancelled) {
          return;
        }
        setCoreStats(core);
        setOpsStats(ops);
        setError('');
        setHistory((current) => {
          const next = [
            ...current,
            {
              label: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              coreLatency: Number(core.supabase?.latency_ms || 0),
              opsLatency: Number(ops.average_api_latency_ms || 0),
              wsCount: Number(ops.active_websockets || 0),
            },
          ];
          return next.slice(-12);
        });
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      }
    };

    fetchStats();
    const interval = window.setInterval(fetchStats, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const hw = coreStats?.hardware || {};
  const sb = coreStats?.supabase || {};
  const storage = coreStats?.storage || {};
  const opsHw = opsStats?.hardware || {};
  const wsCount = Number(opsStats?.active_websockets || 0);
  const avgLatency = Number(opsStats?.average_api_latency_ms || 0);

  return (
    <div className="text-on-surface antialiased -mt-6">
      <section className="flex flex-col md:flex-row items-start md:items-end justify-between bg-white rounded-xl p-8 border border-outline-variant/10 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.04)] relative overflow-hidden group mb-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-32 -mt-32 blur-3xl"></div>
        <div className="relative z-10">
          <p className="font-mono text-xs text-primary uppercase tracking-widest mb-2 font-bold">Dual backend cluster</p>
          <h2 className="text-3xl font-black flex items-center gap-3">
            <span className={`w-3.5 h-3.5 rounded-full ${sb.online === false ? 'bg-error' : 'bg-emerald-500'} animate-pulse`}></span>
            Operational Cluster Health
          </h2>
          <p className="text-on-surface-variant mt-2 text-sm font-medium">Telemetry refreshes every 20 seconds from both backend-core and backend-realtime.</p>
        </div>
        <div className="relative z-10 text-right mt-4 md:mt-0">
          <div className="text-5xl font-black text-primary tracking-tighter">{sb.online === false ? 'DEGRADED' : 'LIVE'}</div>
          <div className="font-mono text-xs text-on-surface-variant opacity-60 uppercase font-semibold">Supabase: {sb.latency_ms || 0}ms</div>
        </div>
      </section>

      {error && <div className="mb-6 p-4 rounded-xl bg-error/10 text-error">{error}</div>}

      <div className="flex overflow-x-auto bg-white/70 backdrop-blur border border-outline-variant/10 rounded-xl p-1 mb-8 space-x-1">
        {['System Health', 'API Latency', 'Database Pools', 'WS Streams', 'Logs Console'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
              activeTab === tab ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-[0.98]' : 'text-on-surface-variant hover:bg-on-surface/5'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'System Health' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <HealthCard title="Core CPU" value={`${hw.cpu_usage_percent || 0}%`} subtitle={`Memory ${hw.process_memory_mb || 0} MB`} icon="memory" />
            <HealthCard title="Core RAM" value={`${hw.ram_usage_percent || 0}%`} subtitle={`Disk ${hw.disk_usage_percent || 0}%`} icon="ram" />
            <HealthCard title="Ops CPU" value={`${opsHw.cpu_usage_percent || 0}%`} subtitle={`Ops memory ${opsHw.process_memory_mb || 0} MB`} icon="speed" />
            <HealthCard title="WebSocket Clients" value={wsCount} subtitle={`${opsStats?.total_requests_logged || 0} requests logged`} icon="rss_feed" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white/70 backdrop-blur p-6 rounded-2xl border border-white">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-black">Latency Timeline</h3>
                  <p className="text-xs text-on-surface-variant font-medium">Live telemetry history from both services</p>
                </div>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history}>
                    <defs>
                      <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0058be" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#0058be" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" tick={{ fill: '#727785', fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(10, 12, 16, 0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white' }} />
                    <Area type="monotone" dataKey="coreLatency" stroke="#0058be" strokeWidth={3} fillOpacity={1} fill="url(#latencyGrad)" />
                    <Area type="monotone" dataKey="opsLatency" stroke="#0ea5e9" strokeWidth={2} fillOpacity={0} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white/70 backdrop-blur p-6 rounded-2xl border border-white">
              <h3 className="text-lg font-black mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">storage</span> Storage Snapshot
              </h3>
              <div className="space-y-4">
                <StorageLine label="Supabase Limit" value={formatGb(storage.supabase?.limit_bytes)} />
                <StorageLine label="Render Limit" value={formatGb(storage.render_db?.limit_bytes)} />
                <StorageLine label="Render Used" value={formatGb(storage.render_db?.used_bytes)} />
                <StorageLine label="Fallback Photos" value={storage.render_db?.photo_count || 0} />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'API Latency' && (
        <div className="bg-white/70 backdrop-blur p-6 rounded-2xl border border-white animate-fadeIn">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <HealthCard title="Core Supabase" value={`${sb.latency_ms || 0}ms`} subtitle="Owner telemetry endpoint" icon="cloud" />
            <HealthCard title="Realtime Average" value={`${avgLatency}ms`} subtitle="Operations API latency" icon="bolt" />
            <HealthCard title="Ops Requests" value={opsStats?.total_requests_logged || 0} subtitle="Tracked since service boot" icon="timeline" />
          </div>
        </div>
      )}

      {activeTab === 'Database Pools' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
          <InfoCard title="Supabase Rest Endpoint" lines={[
            ['Online', sb.online ? 'Yes' : 'No'],
            ['Latency', `${sb.latency_ms || 0}ms`],
            ['Primary Role', 'backend-core'],
          ]} />
          <InfoCard title="Render PostgreSQL Fallback" lines={[
            ['Photo Count', storage.render_db?.photo_count || 0],
            ['Used Space', formatGb(storage.render_db?.used_bytes)],
            ['Primary Role', 'backend-realtime retention'],
          ]} />
        </div>
      )}

      {activeTab === 'WS Streams' && (
        <div className="bg-white/70 backdrop-blur p-6 rounded-2xl border border-white animate-fadeIn">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-black">WS Broadcasting Pool</h3>
              <p className="text-xs text-on-surface-variant font-medium">Connected telemetry listeners on backend-realtime</p>
            </div>
            <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold font-mono">{wsCount} Online</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <HealthCard title="Live Clients" value={wsCount} subtitle="Browser and dashboard listeners" icon="podcasts" />
            <HealthCard title="Latest Avg Latency" value={`${avgLatency}ms`} subtitle="Operations request average" icon="speed" />
            <HealthCard title="Ops Uptime" value={`${Math.round(Number(opsStats?.uptime_seconds || 0))}s`} subtitle="Realtime server runtime" icon="timer" />
          </div>
        </div>
      )}

      {activeTab === 'Logs Console' && (
        <div className="bg-[#0b0f19] border border-white/5 p-6 rounded-2xl shadow-2xl flex flex-col font-mono text-white min-h-[400px] animate-fadeIn">
          <div className="flex justify-between items-center mb-4 pb-4 border-b border-white/10">
            <h3 className="text-sm font-black tracking-widest text-primary uppercase">sentinel-core-shell</h3>
            <span className="w-2.5 h-2.5 bg-primary rounded-full animate-pulse"></span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-2 text-xs max-h-[350px]" style={{ scrollbarWidth: 'thin' }}>
            {history.slice().reverse().map((item, index) => (
              <div key={`${item.label}-${index}`} className="flex gap-4 p-2 hover:bg-white/5 transition-all rounded">
                <span className="text-on-surface-variant opacity-40 font-bold uppercase select-none">{item.label}</span>
                <span className="px-1.5 py-0.5 rounded font-bold uppercase text-[9px] bg-primary/20 text-primary-fixed-dim h-fit">SYNC</span>
                <span className="flex-1 leading-relaxed">
                  core={item.coreLatency}ms ops={item.opsLatency}ms ws={item.wsCount}
                </span>
              </div>
            ))}
            {history.length === 0 && <div className="text-on-surface-variant">Waiting for telemetry samples...</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function HealthCard({ title, value, subtitle, icon }) {
  return (
    <div className="bg-white/70 backdrop-blur p-5 rounded-2xl border border-white">
      <div className="flex justify-between items-start mb-4">
        <div className="bg-primary/10 p-2 rounded-lg text-primary">
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
      </div>
      <div className="text-on-surface-variant text-xs font-mono uppercase opacity-60 mb-1">{title}</div>
      <div className="text-2xl font-black">{value}</div>
      <div className="mt-2 text-xs text-on-surface-variant">{subtitle}</div>
    </div>
  );
}

function InfoCard({ title, lines }) {
  return (
    <div className="bg-white/70 backdrop-blur p-6 rounded-2xl border border-white">
      <h3 className="text-lg font-black mb-4">{title}</h3>
      <div className="space-y-4">
        {lines.map(([label, value]) => (
          <div key={label} className="flex justify-between">
            <span className="text-sm text-on-surface-variant font-medium">{label}</span>
            <span className="text-sm font-bold text-primary">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StorageLine({ label, value }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-on-surface-variant">{label}</span>
      <span className="font-bold text-on-surface">{value}</span>
    </div>
  );
}

function formatGb(bytes) {
  if (!bytes) {
    return '0.00 GB';
  }
  return `${(Number(bytes) / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
