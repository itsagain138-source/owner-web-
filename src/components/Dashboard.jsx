import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

function startOfHour(date) {
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  return next;
}

export function DashboardView({ data, guards, activeAlerts }) {
  const totals = data.overview?.totals || {};
  const attendance = data.attendance || [];
  const live = data.live || [];
  const activity = data.activity || [];

  const chartData = useMemo(() => {
    const buckets = new Map();
    const now = new Date();
    for (let index = 23; index >= 0; index -= 1) {
      const hour = new Date(now);
      hour.setHours(now.getHours() - index, 0, 0, 0);
      buckets.set(hour.toISOString(), {
        key: hour.toISOString(),
        time: hour.toLocaleTimeString([], { hour: 'numeric' }),
        count: 0,
      });
    }

    attendance.forEach((item) => {
      const recordedAt = item.check_in_at || item.created_at;
      if (!recordedAt) {
        return;
      }
      const bucketKey = startOfHour(new Date(recordedAt)).toISOString();
      const bucket = buckets.get(bucketKey);
      if (bucket) {
        bucket.count += 1;
      }
    });

    return Array.from(buckets.values());
  }, [attendance]);

  const approvalRate = totals.attendance_records
    ? `${((Number(totals.approved_attendance || 0) / Number(totals.attendance_records)) * 100).toFixed(1)}%`
    : '0.0%';

  const metrics = [
    {
      label: 'Total Guards',
      icon: 'group',
      value: totals.guards || guards.length || 0,
      accent: `${(data.users || []).length} workforce`,
      iconClass: 'bg-primary/10 text-primary',
    },
    {
      label: 'Live Guards',
      icon: 'radar',
      value: live.length,
      accent: `${live.filter((item) => item.status === 'out_of_radius').length} outside radius`,
      iconClass: 'bg-primary text-white',
    },
    {
      label: 'Protected Sites',
      icon: 'location_on',
      value: totals.sites || (data.sites || []).length || 0,
      accent: `${(data.sites || []).filter((site) => site.is_active !== false).length} active`,
      iconClass: 'bg-tertiary/10 text-tertiary',
    },
    {
      label: 'Attendance Reviews',
      icon: 'event_available',
      value: `${attendance.filter((item) => item.status === 'pending_review').length}`,
      accent: `${totals.attendance_records || attendance.length || 0} total sessions`,
      iconClass: 'bg-secondary/10 text-secondary',
    },
    {
      label: 'Approval Rate',
      icon: 'verified',
      value: approvalRate,
      accent: `${activeAlerts.length} open alerts`,
      iconClass: 'bg-primary/10 text-primary',
    },
  ];

  const recentActivity = activity.slice(0, 6);

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
        {metrics.map((metric) => (
          <div key={metric.label} className="glass-card p-5 rounded-2xl flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div className={`p-2 rounded-lg flex items-center justify-center ${metric.iconClass}`}>
                <span className="material-symbols-outlined">{metric.icon}</span>
              </div>
              <span className="text-on-surface-variant font-bold text-label-sm">{metric.accent}</span>
            </div>
            <div className="mt-4">
              <h3 className="text-on-surface-variant font-label-md">{metric.label}</h3>
              <p className="font-headline-md text-headline-md mt-1">{metric.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 glass-card rounded-2xl p-6 relative overflow-hidden">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="font-title-lg text-title-lg text-on-surface">Attendance Volume</h2>
              <p className="text-on-surface-variant text-body-md">Real check-ins captured during the last 24 hours</p>
            </div>
            <div className="px-3 py-1 bg-primary/10 text-primary rounded-full font-label-sm">
              {(totals.attendance_records || attendance.length || 0)} sessions
            </div>
          </div>
          <div className="h-64 mt-4 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0058be" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0058be" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.1)" tick={{ fill: '#727785', fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(10, 12, 16, 0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px' }} itemStyle={{ color: '#0058be' }} />
                <Area type="monotone" dataKey="count" stroke="#0058be" strokeWidth={3} fillOpacity={1} fill="url(#chartGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 glass-card rounded-2xl p-6 border-error/10">
          <div className="flex items-center space-x-2 mb-6">
            <div className="w-3 h-3 rounded-full bg-error pulse-primary shadow-[0_0_10px_rgba(186,26,26,0.5)]"></div>
            <h2 className="font-title-lg text-title-lg text-on-surface">Security Pulse</h2>
          </div>
          <div className="space-y-4">
            {activeAlerts.slice(0, 4).map((item, index) => (
              <div key={item.id || index} className="p-4 rounded-xl bg-error/5 border border-error/10 relative overflow-hidden">
                <div className="flex justify-between items-start relative z-10">
                  <div>
                    <p className="text-error font-bold font-label-sm tracking-widest uppercase">{item.severity || 'alert'}</p>
                    <h4 className="font-title-lg text-on-surface text-[16px] mt-1">{item.title || 'Alert'}</h4>
                    <p className="text-on-surface-variant text-body-md mt-1">{item.description || 'Review required'}</p>
                  </div>
                  <span className="material-symbols-outlined text-error" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                </div>
              </div>
            ))}
            {activeAlerts.length === 0 && (
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 text-center text-primary font-body-md">
                No active threats detected.
              </div>
            )}
          </div>
        </div>

        <WorkforceRoleBreakdown users={data.users || []} />

        <div className="lg:col-span-12 glass-card rounded-2xl p-0 overflow-hidden">
          <div className="p-6 border-b border-on-surface/5 flex justify-between items-center">
            <h2 className="font-title-lg text-title-lg text-on-surface">Recent Activity</h2>
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              <span className="text-on-surface-variant font-label-sm uppercase tracking-widest">Backend synced every 20s</span>
            </div>
          </div>
          <div className="scrolling-feed max-h-[400px] overflow-y-auto px-6">
            <table className="w-full text-left">
              <thead>
                <tr className="text-on-surface-variant font-label-sm border-b border-on-surface/5">
                  <th className="py-4 font-semibold uppercase tracking-wider">Event</th>
                  <th className="py-4 font-semibold uppercase tracking-wider">Subject</th>
                  <th className="py-4 font-semibold uppercase tracking-wider">Details</th>
                  <th className="py-4 font-semibold uppercase tracking-wider">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-on-surface/5">
                {recentActivity.map((item, idx) => (
                  <tr key={item.id || idx} className="group hover:bg-surface-container-low transition-colors">
                    <td className="py-4">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-primary/10 text-primary rounded-lg group-hover:bg-primary group-hover:text-white transition-colors flex items-center justify-center">
                          <span className="material-symbols-outlined text-[18px]">info</span>
                        </div>
                        <span className="text-body-md font-medium">{item.action || 'Activity'}</span>
                      </div>
                    </td>
                    <td className="py-4">
                      <span className="text-body-md">{item.user_name || 'System'}</span>
                    </td>
                    <td className="py-4">
                      <span className="text-body-md text-on-surface-variant">{item.message || item.description || 'No detail'}</span>
                    </td>
                    <td className="py-4">
                      <span className="text-label-md font-mono text-on-surface-variant">
                        {item.created_at ? new Date(item.created_at).toLocaleString() : '--'}
                      </span>
                    </td>
                  </tr>
                ))}
                {recentActivity.length === 0 && (
                  <tr>
                    <td className="py-6 text-on-surface-variant text-center" colSpan="4">No recent activity available.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

const roleIcons = {
  guard: 'shield_person',
  supervisor: 'badge',
  admin: 'admin_panel_settings',
  owner: 'star',
  'Security Guard': 'shield_person',
  'Electrician': 'bolt',
  'Housekeeping': 'cleaning_services',
  'Technician': 'engineering',
  'Receptionist': 'support_agent',
  'Loader': 'forklift',
  'Driver': 'local_shipping',
  'Maintenance Staff': 'build',
};

const roleColors = [
  'bg-blue-500/10 text-blue-600',
  'bg-emerald-500/10 text-emerald-600',
  'bg-purple-500/10 text-purple-600',
  'bg-amber-500/10 text-amber-600',
  'bg-rose-500/10 text-rose-600',
  'bg-cyan-500/10 text-cyan-600',
  'bg-indigo-500/10 text-indigo-600',
  'bg-teal-500/10 text-teal-600',
];

function WorkforceRoleBreakdown({ users }) {
  const breakdown = useMemo(() => {
    const counts = {};
    users.forEach(u => {
      const role = u.permissions?.custom_role || u.role || 'guard';
      counts[role] = (counts[role] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([role, count], i) => ({
        role,
        count,
        icon: roleIcons[role] || 'person',
        colorClass: roleColors[i % roleColors.length],
      }));
  }, [users]);

  if (breakdown.length === 0) return null;

  return (
    <div className="lg:col-span-12 glass-card rounded-2xl p-6">
      <div className="flex justify-between items-center mb-5">
        <div>
          <h2 className="font-title-lg text-title-lg text-on-surface">Workforce Role Distribution</h2>
          <p className="text-on-surface-variant text-body-md">Enterprise-wide personnel breakdown by assigned role.</p>
        </div>
        <div className="px-3 py-1 bg-primary/10 text-primary rounded-full font-label-sm font-bold">{users.length} Total</div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
        {breakdown.map(item => (
          <div key={item.role} className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/10 flex flex-col items-center gap-2 hover:shadow-md hover:scale-[1.02] transition-all cursor-default">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.colorClass}`}>
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>{item.icon}</span>
            </div>
            <span className="font-headline-md text-headline-md text-on-surface">{item.count}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant text-center leading-tight capitalize">{item.role}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
