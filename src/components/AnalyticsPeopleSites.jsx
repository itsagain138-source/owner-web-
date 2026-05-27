import React, { useMemo, useState } from 'react';
import { ProfileView, checkPermission } from './ProfileViews';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, BarChart, Bar, YAxis } from 'recharts';
import { createUser, createSite, updateSite, deleteSite } from '../api';

function downloadCsv(filename, rows) {

  const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function getAvatar(name) {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent((name || '').split(' ')[0] || 'User')}`;
}

function getPersonStats(person, data) {
  const documents = (data.documents || []).filter((item) => item.user_id === person.id);
  const attendance = (data.attendance || []).filter((item) => item.user_id === person.id);
  const grooming = (data.grooming || []).filter((item) => item.user_id === person.id);
  const latestAttendance = attendance[0];
  const latestGrooming = grooming[0];

  return {
    documents,
    attendance,
    grooming,
    documentStatus: documents.some((item) => item.status === 'approved') ? 'verified' : documents.some((item) => item.status === 'pending_review') ? 'pending_review' : 'missing',
    attendanceStatus: latestAttendance?.status || 'not_started',
    groomingStatus: latestGrooming?.rating || 'not_recorded',
  };
}

export function AnalyticsView({ data }) {
  const totals = data.overview?.totals || {};
  const attendance = data.attendance || [];
  const alerts = data.alerts || [];
  const overtime = data.overtime || [];
  const documents = data.documents || [];

  const chartData = useMemo(() => {
    const days = [];
    const now = new Date();
    for (let index = 6; index >= 0; index -= 1) {
      const date = new Date(now);
      date.setDate(now.getDate() - index);
      const key = date.toISOString().slice(0, 10);
      const matches = attendance.filter((item) => String(item.check_in_at || item.created_at || '').startsWith(key));
      days.push({
        name: date.toLocaleDateString([], { weekday: 'short' }).toUpperCase(),
        count: matches.length,
      });
    }
    return days;
  }, [attendance]);

  const statusData = [
    { name: 'Approved', total: attendance.filter((item) => item.status === 'approved').length },
    { name: 'Pending', total: attendance.filter((item) => item.status === 'pending_review').length },
    { name: 'Rejected', total: attendance.filter((item) => item.status === 'rejected').length },
  ];

  const insights = [
    overtime.length
      ? `${overtime.filter((item) => item.status === 'pending').length} overtime requests are still waiting for review.`
      : 'No overtime requests are pending right now.',
    alerts.length
      ? `${alerts.filter((item) => item.status !== 'resolved').length} live alerts are open across the network.`
      : 'No open alert requires escalation.',
    documents.length
      ? `${documents.filter((item) => item.status === 'pending_review').length} documents still need compliance review.`
      : 'Document compliance is fully cleared.',
  ];

  const activeWorkforce = (data.live || []).filter((item) => item.status === 'active').length;
  const attendanceRate = totals.attendance_records
    ? `${((Number(totals.approved_attendance || 0) / Number(totals.attendance_records)) * 100).toFixed(1)}%`
    : '0.0%';
  const overtimeHours = Number(totals.overtime_hours || overtime.reduce((sum, item) => sum + Number(item.hours || 0), 0)).toFixed(1);

  return (
    <div className="pb-12">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col justify-center">
            <h2 className="font-headline-lg text-headline-lg tracking-tight text-on-surface">Operations Analytics</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mt-2">Live backend metrics for attendance throughput, alert pressure, and workforce deployment.</p>
          </div>
          <div className="glass-card rounded-xl p-5 border-primary/10 bg-primary/5 relative overflow-hidden">
            <div className="absolute -right-8 -top-8 w-32 h-32 bg-primary/10 rounded-full blur-3xl"></div>
            <div className="flex items-center space-x-2 text-primary mb-3">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>insights</span>
              <span className="font-label-md text-label-md font-bold uppercase tracking-widest">Live Signals</span>
            </div>
            <ul className="space-y-3 relative z-10">
              {insights.map((item) => (
                <li key={item} className="flex items-start space-x-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2"></span>
                  <p className="font-body-md text-body-md">{item}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard label="Active Workforce" value={activeWorkforce} accent={`${(data.live || []).length} in live map`} />
          <MetricCard label="Attendance Approval" value={attendanceRate} accent={`${attendance.length} attendance records`} />
          <MetricCard label="Overtime Hours" value={overtimeHours} accent={`${overtime.length} overtime requests`} tone="error" />
          <MetricCard label="Documents Approved" value={documents.filter((item) => item.status === 'approved').length} accent={`${documents.length} total documents`} />
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="glass-card rounded-xl p-8 flex flex-col">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h4 className="font-title-lg text-title-lg text-on-surface">Weekly Attendance</h4>
                <p className="font-body-md text-body-md text-on-surface-variant">Recorded attendance sessions over the last seven days</p>
              </div>
            </div>
            <div className="flex-1 min-h-[300px] mt-4 relative">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="analyticsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0058be" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0058be" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" stroke="rgba(0,0,0,0.1)" tick={{ fill: '#727785', fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'white', borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
                  <Area type="monotone" dataKey="count" stroke="#0058be" strokeWidth={3} fillOpacity={1} fill="url(#analyticsGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass-card rounded-xl p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h4 className="font-title-lg text-title-lg text-on-surface">Review Breakdown</h4>
                <p className="font-body-md text-body-md text-on-surface-variant">Current status distribution from the core attendance workflow</p>
              </div>
            </div>
            <div className="relative h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusData}>
                  <XAxis dataKey="name" tick={{ fill: '#727785', fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fill: '#727785', fontSize: 12 }} />
                  <Tooltip cursor={{ fill: 'transparent' }} />
                  <Bar dataKey="total" fill="#0058be" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ label, value, accent, tone = 'primary' }) {
  const toneClass = tone === 'error' ? 'text-error bg-error/10' : 'text-primary bg-primary/10';
  return (
    <div className="glass-card rounded-xl p-6 transition-transform hover:scale-[1.02] duration-300">
      <p className="font-label-md text-label-md text-on-surface-variant">{label}</p>
      <div className="flex items-end justify-between mt-1">
        <h3 className={`font-headline-lg text-headline-lg font-black ${tone === 'error' ? 'text-error' : 'text-primary'}`}>{value}</h3>
        <span className={`font-bold text-[12px] flex items-center px-2 py-0.5 rounded-full mb-1 ${toneClass}`}>{accent}</span>
      </div>
    </div>
  );
}

export function PeopleView({ title, people, data }) {
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [showFullProfile, setShowFullProfile] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [siteFilter, setSiteFilter] = useState('all');
  
  // Create User Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'guard',
    site_id: '',
    phone: '',
  });
  const [creatingUser, setCreatingUser] = useState(false);
  const [createError, setCreateError] = useState('');

  const filteredPeople = people.filter((person) => {
    if (statusFilter === 'active' && person.is_active === false) return false;
    if (statusFilter === 'inactive' && person.is_active !== false) return false;
    if (siteFilter !== 'all' && person.site_id !== siteFilter) return false;
    return true;
  });

  const handleExport = () => {
    downloadCsv(`${title.toLowerCase().replaceAll(' ', '_')}.csv`, [
      ['Name', 'Role', 'Employee ID', 'Email', 'Site', 'Active'],
      ...filteredPeople.map((person) => [
        person.full_name || person.name || '',
        person.role || '',
        person.employee_id || '',
        person.email || '',
        person.site_name || '',
        person.is_active !== false ? 'Yes' : 'No',
      ]),
    ]);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    const auth = JSON.parse(localStorage.getItem('ms-owner-auth'));
    if (!auth?.token) return;
    setCreatingUser(true);
    setCreateError('');
    try {
      const result = await createUser(auth.token, createForm);
      people.unshift({
        ...result.user,
        site_name: (data.sites || []).find(s => s.id === createForm.site_id)?.name || 'Unassigned'
      });
      setShowCreateModal(false);
      setCreateForm({ email: '', password: '', full_name: '', role: 'guard', site_id: '', phone: '' });
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreatingUser(false);
    }
  };

  return (
    <div className="pb-12">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">{title} Directory</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">Monitor {filteredPeople.length} personnel using live backend records.</p>
        </div>
        <div className="flex gap-3">
          {checkPermission('can_create_users') && (
            <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-primary text-white shadow-lg hover:brightness-110 active:scale-95 transition-all">
              <span className="material-symbols-outlined text-[18px]">person_add</span> Create Personnel
            </button>
          )}
          <button onClick={handleExport} className="glass-card flex items-center gap-2 px-4 py-2 rounded-lg font-label-md text-label-md text-primary border border-primary/10 hover:bg-primary/5 transition-all">
            <span className="material-symbols-outlined text-[18px]">download</span> Export CSV
          </button>
        </div>

      </div>

      <div className="flex gap-4 mb-6">
        <div className="glass-card flex items-center gap-2 px-4 py-2 rounded-xl text-body-md font-body-md text-on-surface-variant shadow-none">
          <span className="material-symbols-outlined text-[18px]">filter_list</span>
          <span>Status:</span>
          <select className="bg-transparent border-none p-0 text-on-surface font-semibold focus:ring-0 cursor-pointer outline-none appearance-none" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All Personnel</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
        <div className="glass-card flex items-center gap-2 px-4 py-2 rounded-xl text-body-md font-body-md text-on-surface-variant shadow-none">
          <span className="material-symbols-outlined text-[18px]">business</span>
          <span>Site:</span>
          <select className="bg-transparent border-none p-0 text-on-surface font-semibold focus:ring-0 cursor-pointer outline-none appearance-none" value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)}>
            <option value="all">All Sites</option>
            {(data.sites || []).map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 glass-card rounded-2xl overflow-hidden transition-all duration-500">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-black/5 bg-surface-container-low/50">
                <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Details</th>
                <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Workspace Role</th>
                <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Current Site</th>
                <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Verification</th>
                <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Status</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {filteredPeople.map((person, index) => {
                const stats = getPersonStats(person, data);
                return (
                  <tr key={person.id || index} className={`group cursor-pointer transition-colors ${selectedPerson?.id === person.id ? 'bg-primary/[0.04] border-l-4 border-primary' : 'hover:bg-primary/[0.02]'}`} onClick={() => setSelectedPerson(person)}>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl overflow-hidden shadow-sm bg-surface-container flex items-center justify-center">
                          <img alt="Photo" className="w-full h-full object-cover" src={person.photo_url || getAvatar(person.full_name || person.name)} />
                        </div>
                        <div>
                          <p className="font-title-lg text-[15px] font-bold text-on-surface leading-tight">{person.full_name || person.name || 'Unknown'}</p>
                          <p className="font-label-md text-label-md text-on-surface-variant opacity-60">ID: {person.employee_id || 'N/A'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1">
                        <span className="font-label-md text-label-md font-bold text-on-surface capitalize">{person.permissions?.custom_role || person.role || 'Guard'}</span>
                        {person.permissions?.shift_cycle && person.permissions.shift_cycle !== 'fixed' && (
                          <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded w-fit font-bold uppercase tracking-wider">{person.permissions.shift_cycle.replace(/_/g, ' ')}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className="font-body-md text-body-md text-on-surface">{person.site_name || 'Unassigned'}</span>
                    </td>
                    <td className="px-6 py-5">
                      <div className={`px-3 py-1 rounded-full w-fit font-label-sm text-label-sm uppercase ${stats.documentStatus === 'verified' ? 'bg-primary/10 text-primary' : stats.documentStatus === 'pending_review' ? 'bg-amber-100 text-amber-700' : 'bg-surface-container text-on-surface-variant'}`}>
                        {stats.documentStatus.replaceAll('_', ' ')}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        {person.is_active !== false ? (
                          <><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span><span className="font-body-md text-body-md">Active</span></>
                        ) : (
                          <><span className="w-2 h-2 rounded-full bg-on-surface-variant opacity-40"></span><span className="font-body-md text-body-md text-on-surface-variant">Inactive</span></>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <button className="p-2 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-primary/10 text-primary transition-all">
                        <span className="material-symbols-outlined">chevron_right</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredPeople.length === 0 && <tr><td colSpan="7" className="px-6 py-8 text-center text-on-surface-variant">No personnel found.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className={`${selectedPerson ? 'w-[420px] opacity-100 ml-6' : 'w-0 opacity-0'} overflow-hidden glass-card rounded-2xl transition-all duration-500 ease-in-out flex flex-col`} style={{ padding: 0 }}>
          <div className="p-6 border-b border-black/5 flex justify-between items-start">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg border-2 border-primary/10">
                <img alt="Guard Photo" className="w-full h-full object-cover" src={selectedPerson?.photo_url || getAvatar(selectedPerson?.full_name || selectedPerson?.name)} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h3 className="font-headline-md text-headline-md text-on-surface leading-tight truncate">{selectedPerson?.full_name || selectedPerson?.name || 'Unknown'}</h3>
                <p className="font-body-md text-body-md text-primary font-semibold truncate">{selectedPerson?.site_name || 'Unassigned'}</p>
              </div>
            </div>
            <button className="p-2 rounded-full hover:bg-surface-container-low transition-colors shrink-0" onClick={() => setSelectedPerson(null)}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6" style={{ scrollbarWidth: 'none' }}>
            {selectedPerson && (() => {
              const stats = getPersonStats(selectedPerson, data);
              return (
                <>
                  <InfoRow label="Attendance Sessions" value={stats.attendance.length} />
                  <InfoRow label="Approved Documents" value={stats.documents.filter((item) => item.status === 'approved').length} />
                  <InfoRow label="Latest Grooming" value={stats.groomingStatus.replaceAll('_', ' ')} />
                  <InfoRow label="Latest Attendance Status" value={stats.attendanceStatus.replaceAll('_', ' ')} />
                </>
              );
            })()}
          </div>

          <div className="p-6 border-t border-black/5 bg-surface-container-low/20 flex gap-3">
            <button className="flex-1 bg-primary text-white py-3 rounded-xl font-label-md text-label-md font-bold shadow-lg shadow-primary/10 hover:brightness-110 active:scale-[0.98] transition-all" onClick={() => setShowFullProfile(true)}>Open Full Profile</button>
          </div>
        </div>
      </div>

      {showFullProfile && (
        <ProfileView person={selectedPerson} data={data || {}} onClose={() => setShowFullProfile(false)} />
      )}

      {/* Create Personnel Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface w-full max-w-lg rounded-3xl p-8 border shadow-2xl space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-black">Create New Personnel</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-2 rounded-full hover:bg-surface-container-low"><span className="material-symbols-outlined">close</span></button>
            </div>
            {createError && <p className="text-xs text-error font-bold">{createError}</p>}
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Full Name</label>
                <input type="text" required value={createForm.full_name} onChange={(e) => setCreateForm(prev => ({ ...prev, full_name: e.target.value }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Email Address</label>
                <input type="email" required value={createForm.email} onChange={(e) => setCreateForm(prev => ({ ...prev, email: e.target.value }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Initial Password</label>
                <input type="password" required value={createForm.password} onChange={(e) => setCreateForm(prev => ({ ...prev, password: e.target.value }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Permission Group</label>
                  <select value={createForm.role} onChange={(e) => setCreateForm(prev => ({ ...prev, role: e.target.value }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold">
                    <option value="guard">Guard</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Phone</label>
                  <input type="text" value={createForm.phone} onChange={(e) => setCreateForm(prev => ({ ...prev, phone: e.target.value }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Custom Workspace Role (Optional)</label>
                <select value={createForm.shift_type || ''} onChange={(e) => setCreateForm(prev => ({ ...prev, shift_type: e.target.value }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold">
                  <option value="">Default (from Permission Group)</option>
                  <option value="Security Guard">Security Guard</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Electrician">Electrician</option>
                  <option value="Housekeeping">Housekeeping</option>
                  <option value="Technician">Technician</option>
                  <option value="Receptionist">Receptionist</option>
                  <option value="Loader">Loader</option>
                  <option value="Driver">Driver</option>
                  <option value="Maintenance Staff">Maintenance Staff</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Assign Site</label>
                <select value={createForm.site_id} onChange={(e) => setCreateForm(prev => ({ ...prev, site_id: e.target.value }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold">
                  <option value="">Unassigned</option>
                  {(data.sites || []).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <button disabled={creatingUser} className="w-full bg-primary text-white py-3.5 rounded-xl font-bold hover:brightness-110 active:scale-95 transition-all">
                {creatingUser ? 'Registering...' : 'Register Personnel'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="p-4 rounded-xl bg-surface-container-low/50">
      <p className="font-label-md text-label-md text-on-surface-variant">{label}</p>
      <p className="font-title-lg text-title-lg text-on-surface capitalize">{value}</p>
    </div>
  );
}

export function SitesView({ sites, live = [], users = [] }) {
  const liveBySite = new Map();
  live.forEach((item) => {
    if (!item.site_id) {
      return;
    }
    liveBySite.set(item.site_id, (liveBySite.get(item.site_id) || 0) + 1);
  });

  // Create Site states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    client_name: '',
    address: '',
    latitude: 19.0596,
    longitude: 72.8656,
    radius_meters: 150,
    shift_start: '08:00',
    shift_end: '20:00',
  });
  const [creatingSite, setCreatingSite] = useState(false);
  const [createError, setCreateError] = useState('');

  // QR Viewer states
  const [viewingQrSite, setViewingQrSite] = useState(null);

  const handleCreateSite = async (e) => {
    e.preventDefault();
    const auth = JSON.parse(localStorage.getItem('ms-owner-auth'));
    if (!auth?.token) return;
    setCreatingSite(true);
    setCreateError('');
    try {
      const result = await createSite(auth.token, createForm);
      sites.unshift(result.site);
      setShowCreateModal(false);
      setCreateForm({ name: '', client_name: '', address: '', latitude: 19.0596, longitude: 72.8656, radius_meters: 150, shift_start: '08:00', shift_end: '20:00' });
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreatingSite(false);
    }
  };

  // Edit Site states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    client_name: '',
    address: '',
    latitude: 19.0596,
    longitude: 72.8656,
    radius_meters: 150,
    shift_start: '08:00',
    shift_end: '20:00',
    is_active: true,
  });
  const [updatingSite, setUpdatingSite] = useState(false);
  const [editError, setEditError] = useState('');

  const handleEditClick = (site) => {
    setEditingSite(site);
    setEditForm({
      name: site.name || '',
      client_name: site.client_name || '',
      address: site.address || '',
      latitude: site.latitude || 19.0596,
      longitude: site.longitude || 72.8656,
      radius_meters: site.radius_meters || 150,
      shift_start: site.shift_start || '08:00',
      shift_end: site.shift_end || '20:00',
      is_active: site.is_active !== false,
      shift_rotation: site.overtime_rules?.shift_rotation || 'fixed',
      overtime_rule: site.overtime_rules?.overtime_rule || 'none',
    });
    setShowEditModal(true);
  };

  const handleUpdateSite = async (e) => {
    e.preventDefault();
    const auth = JSON.parse(localStorage.getItem('ms-owner-auth'));
    if (!auth?.token || !editingSite) return;
    setUpdatingSite(true);
    setEditError('');
    try {
      const result = await updateSite(auth.token, editingSite.id, editForm);
      const idx = sites.findIndex(s => s.id === editingSite.id);
      if (idx !== -1) {
        sites[idx] = result.site;
      }
      setShowEditModal(false);
      setEditingSite(null);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setUpdatingSite(false);
    }
  };

  const handleDeleteSite = async (siteId) => {
    if (!window.confirm("Are you sure you want to delete or deactivate this secure site?")) return;
    const auth = JSON.parse(localStorage.getItem('ms-owner-auth'));
    if (!auth?.token) return;
    try {
      await deleteSite(auth.token, siteId);
      window.location.reload();
    } catch (err) {
      alert(`Failed to delete site: ${err.message}`);
    }
  };

  return (
    <div className="pb-12">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Site Directory</h2>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">Review live sites, configured radius, and active deployment counts.</p>
        </div>
        {checkPermission('can_create_sites') && (
          <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-primary text-white shadow-lg hover:brightness-110 active:scale-95 transition-all">
            <span className="material-symbols-outlined text-[18px]">add_location</span> Create Site
          </button>
        )}

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sites.map((site, index) => (
          <div key={site.id || index} className="glass-card rounded-2xl overflow-hidden transition-all duration-500 hover:shadow-[0_12px_48px_rgba(0,0,0,0.08)] hover:-translate-y-1">
            <div className="relative h-40 bg-gradient-to-br from-primary/15 via-white to-primary/5">
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"></div>
              <div className="absolute top-4 right-4 flex gap-2 z-10">
                <button onClick={() => setViewingQrSite(site)} className="bg-white/90 text-primary p-1.5 rounded-full hover:scale-105 active:scale-95 transition-all shadow-md flex items-center justify-center">
                  <span className="material-symbols-outlined text-sm">qr_code_2</span>
                </button>
                {checkPermission('can_edit_sites') && (
                  <button onClick={() => handleEditClick(site)} className="bg-white/90 text-primary p-1.5 rounded-full hover:scale-105 active:scale-95 transition-all shadow-md flex items-center justify-center">
                    <span className="material-symbols-outlined text-sm">edit</span>
                  </button>
                )}
                {checkPermission('can_delete_sites') && (
                  <button onClick={() => handleDeleteSite(site.id)} className="bg-white/90 text-rose-600 p-1.5 rounded-full hover:scale-105 active:scale-95 transition-all shadow-md flex items-center justify-center">
                    <span className="material-symbols-outlined text-sm">delete</span>
                  </button>
                )}
                <div className="bg-emerald-500/90 text-white px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase flex items-center space-x-1.5 shadow-lg">
                  <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
                  <span>{site.is_active === false ? 'Inactive' : 'Secure'}</span>
                </div>
              </div>
              <div className="absolute bottom-4 left-4 text-white">
                <h3 className="font-title-lg text-title-lg">{site.name}</h3>
                <p className="text-xs opacity-80 flex items-center"><span className="material-symbols-outlined text-xs mr-1">business</span>{site.client_name || 'Corporate'}</p>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-4 gap-2">
                <SiteStat label="Live" value={liveBySite.get(site.id) || 0} />
                <SiteStat label="Assigned" value={site.assigned_count || users.filter(u => u.site_id === site.id).length} />
                <SiteStat label="Radius" value={`${Math.round(site.radius_meters || 0)}m`} />
                <SiteStat label="Shift" value={`${site.shift_start || '--'}-${site.shift_end || '--'}`} />
              </div>
              <div className="text-sm text-on-surface-variant">{site.address || 'Address unavailable'}</div>
            </div>
          </div>
        ))}
        {sites.length === 0 && (
          <div className="col-span-12 text-center py-12 text-on-surface-variant bg-surface-container-low rounded-2xl">
            <span className="material-symbols-outlined text-4xl mb-2 opacity-50">location_off</span>
            <p>No sites configured yet.</p>
          </div>
        )}
      </div>

      {/* Create Site Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface w-full max-w-lg rounded-3xl p-8 border shadow-2xl space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-black">Create New Secure Site</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-2 rounded-full hover:bg-surface-container-low"><span className="material-symbols-outlined">close</span></button>
            </div>
            {createError && <p className="text-xs text-error font-bold">{createError}</p>}
            <form onSubmit={handleCreateSite} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Site Name</label>
                <input type="text" required value={createForm.name} onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Client / Company Name</label>
                <input type="text" required value={createForm.client_name} onChange={(e) => setCreateForm(prev => ({ ...prev, client_name: e.target.value }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Physical Address</label>
                <input type="text" required value={createForm.address} onChange={(e) => setCreateForm(prev => ({ ...prev, address: e.target.value }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Latitude</label>
                  <input type="number" step="any" required value={createForm.latitude} onChange={(e) => setCreateForm(prev => ({ ...prev, latitude: parseFloat(e.target.value) }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Longitude</label>
                  <input type="number" step="any" required value={createForm.longitude} onChange={(e) => setCreateForm(prev => ({ ...prev, longitude: parseFloat(e.target.value) }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Radius (m)</label>
                  <input type="number" required value={createForm.radius_meters} onChange={(e) => setCreateForm(prev => ({ ...prev, radius_meters: parseInt(e.target.value) }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Shift Start</label>
                  <input type="text" required placeholder="08:00" value={createForm.shift_start} onChange={(e) => setCreateForm(prev => ({ ...prev, shift_start: e.target.value }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Shift End</label>
                  <input type="text" required placeholder="20:00" value={createForm.shift_end} onChange={(e) => setCreateForm(prev => ({ ...prev, shift_end: e.target.value }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold" />
                </div>
              </div>
              <button disabled={creatingSite} className="w-full bg-primary text-white py-3.5 rounded-xl font-bold hover:brightness-110 active:scale-95 transition-all">
                {creatingSite ? 'Creating...' : 'Initialize Secure Site'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Site Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface w-full max-w-lg rounded-3xl p-8 border shadow-2xl space-y-6 animate-fadeIn">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-black">Edit Secure Site</h3>
              <button onClick={() => { setShowEditModal(false); setEditingSite(null); }} className="p-2 rounded-full hover:bg-surface-container-low"><span className="material-symbols-outlined">close</span></button>
            </div>
            {editError && <p className="text-xs text-error font-bold">{editError}</p>}
            <form onSubmit={handleUpdateSite} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Site Name</label>
                <input type="text" required value={editForm.name} onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Client / Company Name</label>
                <input type="text" required value={editForm.client_name} onChange={(e) => setEditForm(prev => ({ ...prev, client_name: e.target.value }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Physical Address</label>
                <input type="text" required value={editForm.address} onChange={(e) => setEditForm(prev => ({ ...prev, address: e.target.value }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Latitude</label>
                  <input type="number" step="any" required value={editForm.latitude} onChange={(e) => setEditForm(prev => ({ ...prev, latitude: parseFloat(e.target.value) }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Longitude</label>
                  <input type="number" step="any" required value={editForm.longitude} onChange={(e) => setEditForm(prev => ({ ...prev, longitude: parseFloat(e.target.value) }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Radius (m)</label>
                  <input type="number" required value={editForm.radius_meters} onChange={(e) => setEditForm(prev => ({ ...prev, radius_meters: parseInt(e.target.value) }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Shift Start</label>
                  <input type="text" required placeholder="08:00" value={editForm.shift_start} onChange={(e) => setEditForm(prev => ({ ...prev, shift_start: e.target.value }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Shift End</label>
                  <input type="text" required placeholder="20:00" value={editForm.shift_end} onChange={(e) => setEditForm(prev => ({ ...prev, shift_end: e.target.value }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold" />
                </div>
              </div>
              <div className="flex items-center gap-3 py-2">
                <input
                  type="checkbox"
                  id="edit_is_active"
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm(prev => ({ ...prev, is_active: e.target.checked }))}
                  className="w-5 h-5 text-primary border-outline-variant/30 rounded focus:ring-0"
                />
                <label htmlFor="edit_is_active" className="text-sm font-bold text-on-surface cursor-pointer select-none">Site is active and secure</label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Shift Rotation</label>
                  <select value={editForm.shift_rotation || 'fixed'} onChange={(e) => setEditForm(prev => ({ ...prev, shift_rotation: e.target.value }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold">
                    <option value="fixed">Fixed (No Rotation)</option>
                    <option value="15_day">15-Day Rotation</option>
                    <option value="10_day">10-Day Rotation</option>
                    <option value="weekly">Weekly Rotation</option>
                    <option value="custom">Custom Cycle</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Overtime Rule</label>
                  <select value={editForm.overtime_rule || 'none'} onChange={(e) => setEditForm(prev => ({ ...prev, overtime_rule: e.target.value }))} className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-0 text-sm font-semibold">
                    <option value="none">No Overtime Allowed</option>
                    <option value="manual_approval">Manual Approval Required</option>
                    <option value="auto_2hr">Auto-approve up to 2 hrs</option>
                    <option value="auto_4hr">Auto-approve up to 4 hrs</option>
                    <option value="unlimited">Unlimited Extension</option>
                  </select>
                </div>
              </div>
              <button disabled={updatingSite} className="w-full bg-primary text-white py-3.5 rounded-xl font-bold hover:brightness-110 active:scale-95 transition-all">
                {updatingSite ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* QR Viewer Overlay */}
      {viewingQrSite && (() => {
        const qrDataStr = JSON.stringify({ type: 'site_verification', site_id: viewingQrSite.id, name: viewingQrSite.name });
        const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrDataStr)}`;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-surface rounded-3xl p-8 border shadow-2xl text-center max-w-sm w-full space-y-6">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-lg">Site Authentication QR</span>
                <button onClick={() => setViewingQrSite(null)} className="p-2 rounded-full hover:bg-surface-container-low"><span className="material-symbols-outlined">close</span></button>
              </div>
              <div className="bg-surface-container-low p-4 rounded-2xl border-2 border-dashed flex items-center justify-center">
                <img src={qrImgUrl} alt="QR Code" className="w-64 h-64" />
              </div>
              <div>
                <h4 className="font-black text-xl">{viewingQrSite.name}</h4>
                <p className="text-xs text-on-surface-variant mt-2 font-medium">Scans authorize coordinates and geofences for secure shifts.</p>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function SiteStat({ label, value }) {
  return (
    <div className="bg-surface-container-low p-3 rounded-xl border border-outline-variant/10 text-center">
      <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-tighter">{label}</p>
      <p className="font-title-lg text-primary">{value}</p>
    </div>
  );
}
