import React, { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, BarChart, Bar, YAxis, LineChart, Line } from 'recharts';
import { updateUser, deleteUser, broadcastNotification, reviewDocument } from '../api';



const defaultCover = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1964&auto=format&fit=crop";

const customIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export function checkPermission(permission) {
  const auth = JSON.parse(localStorage.getItem('ms-owner-auth') || '{}');
  const role = String(auth.role || '').toLowerCase();
  if (role === 'owner') return true;
  
  const perms = auth.profile?.permissions || auth.permissions || {};
  
  const defaultAdminPerms = {
    can_create_users: true,
    can_edit_users: true,
    can_delete_users: false, 
    can_create_sites: true,
    can_edit_sites: true,
    can_delete_sites: false, 
    can_approve_documents: true,
    can_approve_attendance: true,
    can_send_notifications: true,
    can_manage_shifts: true,
  };

  const resolved = { ...defaultAdminPerms, ...perms };
  return !!resolved[permission];
}

export function ProfileView({ person, onClose, data }) {

  if (!person) return null;

  const [activeTab, setActiveTab] = useState('Overview');
  const [personState, setPersonState] = useState(person);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [msgPayload, setMsgPayload] = useState({ message: '', target: person.id, type: 'push' });
  const [msgStatus, setMsgStatus] = useState('');
  
  // Settings/Controls Form States
  const [settingsForm, setSettingsForm] = useState({
    full_name: personState.full_name || personState.name || '',
    phone: personState.phone || '',
    site_id: personState.site_id || '',
    role: personState.role || 'guard',
    is_active: personState.is_active !== false,
    emergency_phone: personState.permissions?.emergency_phone || personState.emergency_phone || '',
    address: personState.permissions?.address || personState.address || '',
    custom_role: personState.permissions?.custom_role || '',
    supervisor_id: personState.permissions?.supervisor_id || '',
    shift_cycle: personState.permissions?.shift_cycle || 'fixed',
    overtime_allowed: !!personState.permissions?.overtime_allowed,
    profile_image_url: personState.permissions?.profile_image_url || '',
  });
  const [updatingSettings, setUpdatingSettings] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState('');
  
  // Document Review States
  const [localDocs, setLocalDocs] = useState([]);
  const [rejectionDocId, setRejectionDocId] = useState(null);
  const [rejectionReasonText, setRejectionReasonText] = useState('');
  const [reviewingDocId, setReviewingDocId] = useState(null);

  // Local state update when prop changes
  useEffect(() => {
    setLocalDocs((data.documents || []).filter(d => d.user_id === person.id));
  }, [data.documents, person.id]);

  useEffect(() => {
    setPersonState(person);
    setSettingsForm({
      full_name: person.full_name || person.name || '',
      phone: person.phone || '',
      site_id: person.site_id || '',
      role: person.role || 'guard',
      is_active: person.is_active !== false,
      emergency_phone: person.permissions?.emergency_phone || person.emergency_phone || '',
      address: person.permissions?.address || person.address || '',
      custom_role: person.permissions?.custom_role || '',
      supervisor_id: person.permissions?.supervisor_id || '',
      shift_cycle: person.permissions?.shift_cycle || 'fixed',
      overtime_allowed: !!person.permissions?.overtime_allowed,
      profile_image_url: person.permissions?.profile_image_url || '',
    });
  }, [person]);

  const role = String(personState.role || 'guard').toLowerCase();
  
  // Filter lists matching this person
  const attendance = (data.attendance || []).filter(a => a.user_id === personState.id);
  const docs = (data.documents || []).filter(d => d.user_id === personState.id);
  const activity = (data.activity || []).filter(a => a.user_id === personState.id);
  const overtime = (data.overtime || []).filter(o => o.user_id === personState.id);
  const fraudLogs = (data.fraud || []).filter(f => f.user_id === personState.id || f.employee_id === personState.employee_id);
  const liveTracking = (data.live || []).find(l => l.id === personState.id) || {
    latitude: 19.0596,
    longitude: 72.8656,
    status: personState.is_active !== false ? 'active' : 'offline',
    distance_meters: 0
  };

  const getAvatar = (name) => `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent((name || '').split(' ')[0] || 'User')}`;

  // Attendance Month Calendar Calculation
  const calendarDays = useMemo(() => {
    const daysInMonth = 30; // standard calendar size
    const days = [];
    const now = new Date();
    for (let i = 1; i <= daysInMonth; i++) {
      const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const record = attendance.find(a => String(a.created_at || a.check_in_at || '').startsWith(dateKey));
      let status = 'Absent';
      if (record) {
        status = record.status === 'approved' ? 'Present' : 'Pending';
        if (record.is_overtime) status = 'Overtime';
      }
      days.push({
        day: i,
        status,
        record
      });
    }
    return days;
  }, [attendance]);

  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);

  // Send Direct Message trigger
  const handleSendMessage = async (e) => {
    e.preventDefault();
    const auth = JSON.parse(localStorage.getItem('ms-owner-auth'));
    if (!auth?.token) return;
    setSendingMsg(true);
    setMsgStatus('');
    try {
      await broadcastNotification(auth.token, {
        target: msgPayload.target,
        message: msgPayload.message,
        sound_enabled: true
      });
      setMsgStatus('Notification dispatched successfully!');
      setMsgPayload(prev => ({ ...prev, message: '' }));
    } catch (err) {
      setMsgStatus(`Failed: ${err.message}`);
    } finally {
      setSendingMsg(false);
    }
  };

  // Update Settings trigger
  const handleUpdateSettings = async (e) => {
    e.preventDefault();
    const auth = JSON.parse(localStorage.getItem('ms-owner-auth'));
    if (!auth?.token) return;
    setUpdatingSettings(true);
    setSettingsStatus('');
    try {
      const payload = {
        full_name: settingsForm.full_name,
        phone: settingsForm.phone,
        site_id: settingsForm.site_id,
        role: settingsForm.role,
        is_active: settingsForm.is_active,
        permissions: {
          emergency_phone: settingsForm.emergency_phone,
          address: settingsForm.address,
          custom_role: settingsForm.custom_role,
          supervisor_id: settingsForm.supervisor_id,
          shift_cycle: settingsForm.shift_cycle,
          overtime_allowed: settingsForm.overtime_allowed,
          profile_image_url: settingsForm.profile_image_url,
        }
      };
      const result = await updateUser(auth.token, personState.id, payload);
      setPersonState(result.user);
      setSettingsStatus('Settings updated successfully!');
    } catch (err) {
      setSettingsStatus(`Failed: ${err.message}`);
    } finally {
      setUpdatingSettings(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-hidden">
      <div className="bg-surface w-full max-w-[1500px] h-[92vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-outline-variant/10">
        
        {/* Cover & Avatar Header */}
        <div className="relative h-60 shrink-0 bg-cover bg-center" style={{ backgroundImage: `url(${defaultCover})` }}>
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
          
          <button onClick={onClose} className="absolute top-6 right-6 p-3 rounded-full bg-black/40 text-white hover:bg-red-500 hover:scale-105 transition-all z-20">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
          
          <div className="absolute bottom-6 left-10 flex items-end gap-6 z-10">
            <div className="relative group">
              <img src={personState.photo_url || getAvatar(personState.full_name || personState.name)} alt="Avatar" className="w-28 h-28 rounded-2xl border-4 border-white/20 bg-surface object-cover shadow-xl" />
              <span className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white ${personState.is_active !== false ? 'bg-emerald-500' : 'bg-surface-container-highest'}`}></span>
            </div>
            <div className="text-white pb-2">
              <div className="flex items-center gap-3">
                <h2 className="text-3xl font-black tracking-tight">{personState.full_name || personState.name || 'Anonymous Employee'}</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${personState.is_active !== false ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/50'}`}>
                  {personState.is_active !== false ? 'active' : 'inactive'}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-2 text-white/80 font-label-md text-label-md">
                <span className="font-bold text-primary-fixed-dim uppercase tracking-wider">{role}</span>
                <span>•</span>
                <span>ID: {personState.employee_id || 'N/A'}</span>
                <span>•</span>
                <span className="flex items-center"><span className="material-symbols-outlined text-xs mr-1">location_on</span> {personState.site_name || 'Unassigned Site'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex bg-surface-container-low px-8 py-1.5 border-b border-outline-variant/10 overflow-x-auto shrink-0 gap-1" style={{ scrollbarWidth: 'none' }}>
          {['Overview', 'Attendance', 'Tracking', 'Documents', 'Activity Timeline', 'Overtime', 'Fraud Logs', 'Notifications', 'Device History', 'Settings'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${
                activeTab === tab ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-[0.98]' : 'text-on-surface-variant hover:bg-on-surface/5'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Dynamic Tab Body */}
        <div className="flex-1 overflow-y-auto p-8 bg-background custom-scrollbar">
          {activeTab === 'Overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
              <div className="lg:col-span-2 glass-card p-6 rounded-2xl space-y-6">
                <h3 className="text-xl font-black">Personnel Overview</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <StatRow label="Full Name" value={personState.full_name || personState.name} />
                  <StatRow label="Employee ID" value={personState.employee_id || 'N/A'} />
                  <StatRow label="Phone Number" value={personState.phone || 'N/A'} />
                  <StatRow label="Emergency Contact" value={personState.emergency_phone || '99999-88888'} />
                  <StatRow label="Current Site" value={personState.site_name || 'Unassigned'} />
                  <StatRow label="Status" value={personState.is_active !== false ? 'Active' : 'Suspended'} />
                  <StatRow label="Email Address" value={personState.email} />
                  <StatRow label="Role Type" value={role.toUpperCase()} />
                </div>
              </div>
              <div className="space-y-6">
                <div className="glass-card p-6 rounded-2xl text-center flex flex-col items-center justify-center relative overflow-hidden">
                  <div className="text-xs font-bold uppercase tracking-widest text-on-surface-variant opacity-60 mb-2">Monthly Compliance</div>
                  <div className="text-5xl font-black text-primary">
                    {attendance.length > 0 ? `${Math.round((attendance.filter(a => a.status === 'approved').length / 30) * 100)}%` : '0%'}
                  </div>
                  <div className="text-xs text-on-surface-variant mt-2 font-medium">Approved check-in throughput rate</div>
                </div>
                <div className="glass-card p-6 rounded-2xl">
                  <h4 className="font-bold text-sm text-on-surface-variant uppercase tracking-wider mb-3">Permissions Overview</h4>
                  <div className="space-y-2">
                    {Object.entries(personState.permissions || {}).map(([perm, val]) => (
                      <div key={perm} className="flex justify-between items-center text-xs">
                        <span className="text-on-surface-variant capitalize">{perm.replaceAll('can_', '').replaceAll('_', ' ')}</span>
                        <span className={`px-2 py-0.5 rounded font-bold ${val ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{val ? 'YES' : 'NO'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Attendance' && (() => {
            // 1. Calculate stats dynamically
            const totalPresent = attendance.filter(a => a.status === 'approved').length;
            const totalAbsent = Math.max(0, 30 - totalPresent);
            const totalOvertime = overtime.length;
            
            // Calculate late entries & early exits
            const lateEntries = attendance.filter(a => {
              const checkIn = a.check_in_at || a.created_at;
              if (!checkIn) return false;
              const date = new Date(checkIn);
              // baseline check: if check-in is after 08:15 AM
              return date.getHours() > 8 || (date.getHours() === 8 && date.getMinutes() > 15);
            });
            const totalLate = lateEntries.length;

            const earlyExits = attendance.filter(a => {
              const checkOut = a.check_out_at;
              if (!checkOut) return false;
              const date = new Date(checkOut);
              // baseline check: if check-out is before 07:45 PM (19:45)
              return date.getHours() < 19 || (date.getHours() === 19 && date.getMinutes() < 45);
            });
            const totalEarlyExits = earlyExits.length;

            const totalShiftHours = totalPresent * 12; // 12-hour shifts standard
            
            // Discipline score starting at 100
            const disciplineScore = Math.max(30, 100 - (totalLate * 3) - (totalAbsent * 5) - (totalEarlyExits * 2));

            // Generate graphical analytics data
            const performanceData = calendarDays.map(d => {
              let deviation = 0; // minutes late
              let overtimeMin = 0;
              let score = 100;
              if (d.record) {
                const checkIn = d.record.check_in_at ? new Date(d.record.check_in_at) : null;
                if (checkIn) {
                  const checkInMinutes = checkIn.getHours() * 60 + checkIn.getMinutes();
                  const targetMinutes = 8 * 60; // 08:00 AM
                  deviation = Math.max(0, checkInMinutes - targetMinutes);
                }
                if (d.record.is_overtime) {
                  overtimeMin = 120; // 2 hours overtime standard
                }
                score = Math.max(30, 100 - (deviation > 15 ? 10 : 0));
              } else {
                score = 50; // absent penalty
              }
              return {
                day: `Day ${d.day}`,
                "Late Minutes": deviation,
                "Discipline Score": score,
                "Overtime Hours": overtimeMin / 60,
              };
            });

            return (
              <div className="space-y-6 animate-fadeIn">
                {/* Enterprise Premium HSL Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <StatWidget icon="check_circle" label="Total Present" value={totalPresent} color="emerald" />
                  <StatWidget icon="cancel" label="Total Absent" value={totalAbsent} color="rose" />
                  <StatWidget icon="schedule" label="Total Overtime" value={`${totalOvertime} shifts`} color="sky" />
                  <StatWidget icon="error" label="Late Entries" value={totalLate} color="amber" />
                  <StatWidget icon="logout" label="Early Exits" value={totalEarlyExits} color="red" />
                  <StatWidget icon="workspace_premium" label="Discipline Score" value={`${disciplineScore}%`} color="indigo" />
                </div>

                {/* Graphical Analytics Dashboard */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="glass-card p-6 rounded-2xl">
                    <h4 className="font-bold text-sm text-on-surface-variant uppercase tracking-wider mb-4">Punctuality Score Trend</h4>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={performanceData.slice(0, 15)}>
                          <XAxis dataKey="day" stroke="rgba(0,0,0,0.1)" tick={{ fill: '#727785', fontSize: 10 }} />
                          <Tooltip contentStyle={{ backgroundColor: 'white', borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
                          <Line type="monotone" dataKey="Discipline Score" stroke="#6366f1" strokeWidth={3} dot={{ fill: '#6366f1' }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="glass-card p-6 rounded-2xl">
                    <h4 className="font-bold text-sm text-on-surface-variant uppercase tracking-wider mb-4">Daily Lateness Duration</h4>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={performanceData.slice(0, 15)}>
                          <XAxis dataKey="day" stroke="rgba(0,0,0,0.1)" tick={{ fill: '#727785', fontSize: 10 }} />
                          <Tooltip contentStyle={{ backgroundColor: 'white', borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
                          <Bar dataKey="Late Minutes" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="glass-card p-6 rounded-2xl">
                    <h4 className="font-bold text-sm text-on-surface-variant uppercase tracking-wider mb-4">Overtime logged trends</h4>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={performanceData.slice(0, 15)}>
                          <defs>
                            <linearGradient id="otGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="day" stroke="rgba(0,0,0,0.1)" tick={{ fill: '#727785', fontSize: 10 }} />
                          <Tooltip contentStyle={{ backgroundColor: 'white', borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
                          <Area type="monotone" dataKey="Overtime Hours" stroke="#0ea5e9" strokeWidth={3} fill="url(#otGrad)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Grid for Calendar & Shift Details */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 glass-card p-6 rounded-2xl">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-black">Workforce Attendance Calendar</h3>
                      <div className="flex items-center gap-4 text-xs font-bold">
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-emerald-500/20 border border-emerald-500/30 rounded"></span> Present</span>
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-blue-500/20 border border-blue-500/30 rounded"></span> Overtime</span>
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-red-50 border border-red-100 rounded"></span> Absent</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-on-surface-variant opacity-60 mb-2">
                      <span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span><span>SUN</span>
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                      {calendarDays.map((day) => {
                        const isPresent = day.status === 'Present';
                        const isOvertime = day.status === 'Overtime';
                        const isPending = day.status === 'Pending';
                        const bgClass = isPresent ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' : isOvertime ? 'bg-blue-500/10 text-blue-700 border-blue-500/20' : isPending ? 'bg-amber-100 text-amber-700 border-amber-500/20' : 'bg-red-50 text-red-500 border-red-100';
                        return (
                          <button
                            key={day.day}
                            onClick={() => setSelectedCalendarDate(day)}
                            className={`h-16 rounded-xl border flex flex-col items-center justify-center font-bold text-sm transition-all hover:scale-105 active:scale-95 ${bgClass}`}
                          >
                            <span>{day.day}</span>
                            <span className="text-[9px] uppercase tracking-tighter mt-1">{day.status}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  
                  <div className="glass-card p-6 rounded-2xl space-y-4">
                    <h4 className="font-bold text-lg">Shift Timeline & Verification</h4>
                    {selectedCalendarDate ? (
                      selectedCalendarDate.record ? (() => {
                        const rec = selectedCalendarDate.record;
                        const checkIn = rec.check_in_at ? new Date(rec.check_in_at) : null;
                        const checkOut = rec.check_out_at ? new Date(rec.check_out_at) : null;
                        
                        // Calculate metrics dynamically
                        let lateMin = 0;
                        if (checkIn) {
                          const minutes = checkIn.getHours() * 60 + checkIn.getMinutes();
                          lateMin = Math.max(0, minutes - (8 * 60)); // Standard 08:00 AM shift start
                        }
                        
                        let totalWorkHours = "N/A";
                        if (checkIn && checkOut) {
                          const diffMs = checkOut - checkIn;
                          totalWorkHours = `${(diffMs / (1000 * 60 * 60)).toFixed(1)} hrs`;
                        }

                        return (
                          <div className="space-y-4 animate-fadeIn">
                            <div className="flex gap-4">
                              {rec.photo_url && (
                                <div className="w-1/2 aspect-[3/4] rounded-lg overflow-hidden border">
                                  <p className="text-[10px] uppercase font-bold text-center bg-surface-container py-1">Check-in Photo</p>
                                  <img src={rec.photo_url} alt="Selfie" className="w-full h-full object-cover" />
                                </div>
                              )}
                              {rec.checkout_selfie_path && (
                                <div className="w-1/2 aspect-[3/4] rounded-lg overflow-hidden border">
                                  <p className="text-[10px] uppercase font-bold text-center bg-surface-container py-1">Check-out Photo</p>
                                  <img src={rec.photo_url} alt="Selfie" className="w-full h-full object-cover" />
                                </div>
                              )}
                            </div>
                            <div className="space-y-3 text-sm">
                              <TimelineItem label="Scheduled Shift Time" value="08:00 AM → 08:00 PM" />
                              <TimelineItem label="Actual Check-In" value={checkIn ? checkIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'} />
                              <TimelineItem label="Actual Check-Out" value={checkOut ? checkOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Still on Duty'} />
                              <TimelineItem label="Late Duration" value={lateMin > 0 ? `${lateMin} min late` : 'On Time'} tone={lateMin > 0 ? 'warning' : 'success'} />
                              <TimelineItem label="Total Work Hours" value={totalWorkHours} />
                              <TimelineItem label="Grooming Compliance" value={rec.ai_raw?.uniform_score ? `${Math.round(rec.ai_raw.uniform_score * 100)}%` : 'Verified'} />
                            </div>
                          </div>
                        );
                      })() : <div className="text-on-surface-variant text-center py-12">User was Absent on this date.</div>
                    ) : <div className="text-on-surface-variant text-center py-12">Select any date to view workforce intelligence.</div>}
                  </div>
                </div>
              </div>
            );
          })()}

          {activeTab === 'Tracking' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
              <div className="lg:col-span-2 rounded-2xl overflow-hidden border h-[550px] relative">
                <MapContainer center={[liveTracking.latitude || 19.0596, liveTracking.longitude || 72.8656]} zoom={14} className="w-full h-full" zoomControl={false}>
                  <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                  <Marker position={[liveTracking.latitude || 19.0596, liveTracking.longitude || 72.8656]} icon={customIcon}>
                    <Popup>
                      <div className="p-1">
                        <p className="font-bold text-primary">{personState.full_name || personState.name}</p>
                        <p className="text-xs">Status: {liveTracking.status}</p>
                      </div>
                    </Popup>
                  </Marker>
                </MapContainer>
              </div>
              <div className="glass-card p-6 rounded-2xl space-y-6">
                <h3 className="text-xl font-black">Live Movement Tracking</h3>
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-surface-container text-xs">
                    <span className="text-on-surface-variant font-bold block uppercase mb-1">Session Status</span>
                    <span className={`px-2 py-0.5 rounded font-bold uppercase ${liveTracking.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{liveTracking.status || 'OFFLINE'}</span>
                  </div>
                  <div className="p-4 rounded-xl bg-surface-container text-xs">
                    <span className="text-on-surface-variant font-bold block uppercase mb-1">Current Coordinates</span>
                    <span>{liveTracking.latitude?.toFixed(5)}, {liveTracking.longitude?.toFixed(5)}</span>
                  </div>
                  <div className="p-4 rounded-xl bg-surface-container text-xs">
                    <span className="text-on-surface-variant font-bold block uppercase mb-1">Geofence Violation</span>
                    <span>{liveTracking.distance_meters > 150 ? 'Outside Configured Radius' : 'Within Secure Radius'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Documents' && (
            <div className="glass-card p-6 rounded-2xl animate-fadeIn space-y-6">
              <h3 className="text-xl font-black">Employee KYC Documents</h3>
              {localDocs.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {localDocs.map(doc => {
                    const isPending = !doc.is_verified && doc.status === 'pending';
                    const isRejected = doc.notes && !doc.is_verified && doc.status !== 'pending';
                    
                    return (
                      <div key={doc.id} className="p-5 rounded-2xl bg-surface-container border border-outline-variant/10 flex flex-col justify-between min-h-[220px]">
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <span className="material-symbols-outlined text-primary text-[32px]">description</span>
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              doc.is_verified ? 'bg-emerald-500/10 text-emerald-500' : isRejected ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-500'
                            }`}>
                              {doc.is_verified ? 'Approved' : isRejected ? 'Rejected' : 'Pending Review'}
                            </span>
                          </div>
                          <h4 className="font-bold text-base truncate">{doc.document_type?.toUpperCase() || 'DOCUMENT'}</h4>
                          <p className="text-xs text-on-surface-variant font-medium mt-1">Num: {doc.document_number || 'N/A'}</p>
                          <p className="text-xs text-on-surface-variant opacity-60 mt-1">Uploaded: {new Date(doc.uploaded_at || doc.created_at).toLocaleDateString()}</p>
                          
                          {doc.notes && (
                            <div className="mt-2 p-2.5 rounded-lg bg-surface-container-highest/50 text-[11px] text-on-surface-variant font-medium italic border border-outline-variant/5">
                              {doc.is_verified ? 'Approved Remark: ' : 'Rejection Reason: '} "{doc.notes}"
                            </div>
                          )}
                        </div>

                        {rejectionDocId === doc.id ? (
                          <div className="mt-4 space-y-2 animate-fadeIn">
                            <textarea
                              required
                              placeholder="Enter rejection reason..."
                              value={rejectionReasonText}
                              onChange={(e) => setRejectionReasonText(e.target.value)}
                              className="w-full p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/20 outline-none text-xs focus:ring-1 focus:ring-primary/20 h-16 resize-none"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={async () => {
                                  if (!rejectionReasonText.trim()) return;
                                  const auth = JSON.parse(localStorage.getItem('ms-owner-auth'));
                                  if (!auth?.token) return;
                                  setReviewingDocId(doc.id);
                                  try {
                                    await reviewDocument(auth.token, doc.id, 'rejected', rejectionReasonText);
                                    setLocalDocs(prev => prev.map(d => d.id === doc.id ? { ...d, is_verified: false, notes: rejectionReasonText, status: 'rejected' } : d));
                                    setRejectionDocId(null);
                                    setRejectionReasonText('');
                                  } catch (err) {
                                    alert(err.message);
                                  } finally {
                                    setReviewingDocId(null);
                                  }
                                }}
                                className="flex-1 bg-rose-600 text-white py-1.5 rounded-lg text-xs font-bold hover:brightness-110 transition-all"
                              >
                                Confirm Reject
                              </button>
                              <button onClick={() => { setRejectionDocId(null); setRejectionReasonText(''); }} className="px-3 bg-surface-container-low border text-xs font-bold rounded-lg">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2 mt-4 shrink-0">
                            {doc.file_url && (
                              <a href={doc.file_url} target="_blank" rel="noreferrer" className="flex-1 text-center bg-white text-primary border border-primary/10 py-2 rounded-xl text-xs font-bold hover:bg-primary/5 transition-all">Preview</a>
                            )}
                            
                            {!doc.is_verified && rejectionDocId !== doc.id && (
                              <>
                                <button
                                  disabled={reviewingDocId === doc.id}
                                  onClick={async () => {
                                    const auth = JSON.parse(localStorage.getItem('ms-owner-auth'));
                                    if (!auth?.token) return;
                                    setReviewingDocId(doc.id);
                                    try {
                                      await reviewDocument(auth.token, doc.id, 'approved');
                                      setLocalDocs(prev => prev.map(d => d.id === doc.id ? { ...d, is_verified: true, notes: 'Approved', status: 'approved' } : d));
                                    } catch (err) {
                                      alert(err.message);
                                    } finally {
                                      setReviewingDocId(null);
                                    }
                                  }}
                                  className="flex-1 bg-emerald-600 text-white py-2 rounded-xl text-xs font-bold hover:brightness-110 active:scale-[0.98] transition-all"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => setRejectionDocId(doc.id)}
                                  className="flex-1 bg-rose-50 text-rose-600 border border-rose-100 py-2 rounded-xl text-xs font-bold hover:bg-rose-100/50 transition-all"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : <p className="text-on-surface-variant text-center py-12 font-medium">No documents currently uploaded.</p>}
            </div>
          )}

          {activeTab === 'Activity Timeline' && (
            <div className="glass-card p-6 rounded-2xl animate-fadeIn space-y-6">
              <h3 className="text-xl font-black">chronological Activity Timeline</h3>
              {activity.length > 0 ? (
                <div className="relative border-l-2 border-primary/20 ml-4 pl-6 space-y-6">
                  {activity.map(act => (
                    <div key={act.id} className="relative">
                      <span className="absolute -left-[31px] top-1 w-4.5 h-4.5 rounded-full bg-primary border-4 border-background"></span>
                      <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/10">
                        <span className="text-[10px] font-bold text-on-surface-variant opacity-60 block uppercase mb-1">{new Date(act.created_at).toLocaleString()}</span>
                        <h5 className="font-bold text-sm text-primary">{act.action}</h5>
                        <p className="text-xs text-on-surface-variant mt-1">{act.message || act.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-on-surface-variant text-center py-12">No recent timeline logs recorded.</p>}
            </div>
          )}

          {activeTab === 'Overtime' && (
            <div className="glass-card p-6 rounded-2xl animate-fadeIn space-y-6">
              <h3 className="text-xl font-black">Overtime Session Log</h3>
              {overtime.length > 0 ? (
                <div className="space-y-3">
                  {overtime.map(ot => (
                    <div key={ot.id} className="flex justify-between items-center p-4 rounded-xl bg-surface-container">
                      <div>
                        <p className="font-bold text-sm">Date: {new Date(ot.created_at || ot.date).toLocaleDateString()}</p>
                        <p className="text-xs text-on-surface-variant">Hours logged: {ot.hours} | Reason: {ot.reason || 'Replacement Duty'}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded font-bold text-xs uppercase ${ot.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{ot.status}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-on-surface-variant text-center py-12">No overtime logged for this personnel.</p>}
            </div>
          )}

          {activeTab === 'Fraud Logs' && (
            <div className="glass-card p-6 rounded-2xl animate-fadeIn space-y-6">
              <h3 className="text-xl font-black text-error">Security & Fraud Logs</h3>
              {fraudLogs.length > 0 ? (
                <div className="space-y-3">
                  {fraudLogs.map(f => (
                    <div key={f.id} className="p-4 rounded-xl bg-error/5 border border-error/10 flex justify-between items-start">
                      <div>
                        <span className="px-2 py-0.5 rounded bg-error/10 text-error font-mono font-black text-[9px] uppercase tracking-wider mb-2 block w-fit">{f.action || 'DEVICE_MISMATCH'}</span>
                        <p className="font-bold text-sm">{f.message || 'Suspicious login block'}</p>
                        <p className="text-xs text-on-surface-variant mt-1">Device: {f.device_id || 'N/A'} | Timestamp: {new Date(f.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-on-surface-variant text-center py-12">No fraud logs or suspicious activity detected.</p>}
            </div>
          )}

          {activeTab === 'Notifications' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeIn">
              <div className="glass-card p-6 rounded-2xl space-y-4">
                <h3 className="text-xl font-black">Send Direct Message</h3>
                <form onSubmit={handleSendMessage} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Message Content</label>
                    <textarea
                      required
                      value={msgPayload.message}
                      onChange={(e) => setMsgPayload(prev => ({ ...prev, message: e.target.value }))}
                      placeholder="Type direct instructions..."
                      className="w-full h-32 px-4 py-3 rounded-xl bg-surface-container border-none outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                    />
                  </div>
                  <button disabled={sendingMsg} className="w-full bg-primary text-white py-3.5 rounded-xl font-bold hover:brightness-110 active:scale-[0.98] transition-all">
                    {sendingMsg ? 'Dispatching...' : 'Dispatch Live Message'}
                  </button>
                  {msgStatus && <p className="text-xs text-primary font-bold text-center mt-2">{msgStatus}</p>}
                </form>
              </div>
            </div>
          )}

          {activeTab === 'Device History' && (
            <div className="glass-card p-6 rounded-2xl animate-fadeIn space-y-6">
              <h3 className="text-xl font-black">Bound Device Registry</h3>
              <div className="p-4 rounded-xl bg-surface-container border flex justify-between items-center">
                <div>
                  <h4 className="font-bold text-sm">Primary Mobile Binding</h4>
                  <p className="text-xs text-on-surface-variant mt-1">Bound Device: {personState.bound_device_id || 'N/A'}</p>
                </div>
                <span className={`px-2.5 py-0.5 rounded font-black text-[10px] uppercase ${personState.bound_device_id ? 'bg-primary/10 text-primary' : 'bg-surface-container-highest text-on-surface-variant'}`}>
                  {personState.bound_device_id ? 'SECURED' : 'UNBOUND'}
                </span>
              </div>
            </div>
          )}

          {activeTab === 'Settings' && (
            <div className="glass-card p-6 rounded-2xl animate-fadeIn space-y-6">
              <div className="flex justify-between items-center border-b border-outline-variant/10 pb-4">
                <div>
                  <h3 className="text-xl font-black">Administrative Access Control</h3>
                  <p className="text-xs text-on-surface-variant font-medium">Configure enterprise access, roles, supervisor tracking, custom shifts, and compliance policies.</p>
                </div>
                {checkPermission('can_delete_users') && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm("Are you sure you want to soft-delete and archive this personnel? This action is compliant with enterprise records preservation.")) return;
                      const auth = JSON.parse(localStorage.getItem('ms-owner-auth'));
                      if (!auth?.token) return;
                      try {
                        await deleteUser(auth.token, personState.id);
                        setSettingsStatus('Personnel archived successfully.');
                        setTimeout(() => {
                          onClose();
                          window.location.reload();
                        }, 1500);
                      } catch (err) {
                        setSettingsStatus(`Archive failed: ${err.message}`);
                      }
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 rounded-xl text-xs font-black transition-all"
                  >
                    <span className="material-symbols-outlined text-[16px]">archive</span> Archive & Soft-Delete
                  </button>
                )}
              </div>
              
              <form onSubmit={handleUpdateSettings} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={settingsForm.full_name}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, full_name: e.target.value }))}
                      className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-1 focus:ring-primary/20 text-sm font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Phone Number</label>
                    <input
                      type="text"
                      required
                      value={settingsForm.phone}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, phone: e.target.value }))}
                      className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-1 focus:ring-primary/20 text-sm font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Emergency Contact Number</label>
                    <input
                      type="text"
                      value={settingsForm.emergency_phone}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, emergency_phone: e.target.value }))}
                      className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-1 focus:ring-primary/20 text-sm font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Physical Home Address</label>
                    <input
                      type="text"
                      value={settingsForm.address}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, address: e.target.value }))}
                      className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-1 focus:ring-primary/20 text-sm font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Assign Site</label>
                    <select
                      value={settingsForm.site_id}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, site_id: e.target.value }))}
                      className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-1 focus:ring-primary/20 text-sm font-semibold"
                    >
                      <option value="">Unassigned</option>
                      {(data.sites || []).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Role Permission Group</label>
                    <select
                      value={settingsForm.role}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, role: e.target.value }))}
                      className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-1 focus:ring-primary/20 text-sm font-semibold"
                    >
                      <option value="guard">Guard</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Custom Workspace Role</label>
                    <select
                      value={settingsForm.custom_role}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, custom_role: e.target.value }))}
                      className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-1 focus:ring-primary/20 text-sm font-semibold"
                    >
                      <option value="">None / Default Group Role</option>
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
                    <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Assigned Supervisor</label>
                    <select
                      value={settingsForm.supervisor_id}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, supervisor_id: e.target.value }))}
                      className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-1 focus:ring-primary/20 text-sm font-semibold"
                    >
                      <option value="">No Supervisor</option>
                      {(data.users || []).filter(u => u.role === 'supervisor').map(sup => (
                        <option key={sup.id} value={sup.id}>{sup.full_name || sup.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Shifts Rotation / Cycle Pattern</label>
                    <select
                      value={settingsForm.shift_cycle}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, shift_cycle: e.target.value }))}
                      className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-1 focus:ring-primary/20 text-sm font-semibold"
                    >
                      <option value="fixed">Fixed Single Shift Pattern</option>
                      <option value="day_night_15">Rotating: 15-day Day / 15-day Night cycle</option>
                      <option value="day_night_10">Rotating: 10-day Day / 10-day Night cycle</option>
                      <option value="weekly">Weekly Shift rotation</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">Profile Photo URL (Override)</label>
                    <input
                      type="text"
                      placeholder="https://example.com/photo.jpg"
                      value={settingsForm.profile_image_url}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, profile_image_url: e.target.value }))}
                      className="w-full h-12 px-4 rounded-xl bg-surface-container border-none outline-none focus:ring-1 focus:ring-primary/20 text-sm font-semibold"
                    />
                  </div>
                  <div className="flex items-center space-x-3 pt-6">
                    <input
                      type="checkbox"
                      id="ot_allowed"
                      checked={settingsForm.overtime_allowed}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, overtime_allowed: e.target.checked }))}
                      className="w-5 h-5 text-primary border-outline-variant/30 rounded focus:ring-0 focus:ring-offset-0 focus:outline-none"
                    />
                    <label htmlFor="ot_allowed" className="text-sm font-semibold text-on-surface select-none cursor-pointer">Allow emergency overtime authorization</label>
                  </div>
                </div>
                
                <div className="flex gap-4 pt-4 border-t border-outline-variant/10">
                  <button type="submit" disabled={updatingSettings} className="px-6 h-12 bg-primary text-white font-bold rounded-xl text-sm hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-primary/10">
                    {updatingSettings ? 'Saving...' : 'Save Settings'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const auth = JSON.parse(localStorage.getItem('ms-owner-auth'));
                      if (!auth?.token) return;
                      const result = await updateUser(auth.token, personState.id, { is_active: !settingsForm.is_active });
                      setPersonState(result.user);
                      setSettingsForm(prev => ({ ...prev, is_active: !prev.is_active }));
                      setSettingsStatus('Personnel status toggled successfully.');
                    }}
                    className={`px-6 h-12 font-bold rounded-xl text-sm transition-all border ${
                      settingsForm.is_active ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
                    }`}
                  >
                    {settingsForm.is_active ? 'Deactivate / Suspend User' : 'Reactivate / Resume User'}
                  </button>
                </div>
                {settingsStatus && <p className="text-xs text-primary font-bold">{settingsStatus}</p>}
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value }) {
  return (
    <div className="p-4 rounded-xl bg-surface-container-low border text-xs">
      <span className="text-on-surface-variant font-bold uppercase block mb-1">{label}</span>
      <span className="text-on-surface font-semibold text-sm">{value || '--'}</span>
    </div>
  );
}

function StatWidget({ icon, label, value, color }) {
  const colorMap = {
    emerald: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    rose: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
    sky: 'bg-sky-500/10 text-sky-600 border-sky-500/20',
    amber: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    red: 'bg-red-500/10 text-red-600 border-red-500/20',
    indigo: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20'
  };
  const colorClass = colorMap[color] || 'bg-surface-container text-on-surface';
  return (
    <div className={`p-4 rounded-2xl border flex items-center gap-3 ${colorClass}`}>
      <span className="material-symbols-outlined text-[28px]">{icon}</span>
      <div>
        <p className="text-[10px] uppercase font-bold opacity-60 leading-none mb-1">{label}</p>
        <p className="text-lg font-black leading-none">{value}</p>
      </div>
    </div>
  );
}

function TimelineItem({ label, value, tone }) {
  const toneClass = tone === 'warning' ? 'text-amber-600 font-bold' : tone === 'success' ? 'text-emerald-600 font-bold' : 'text-on-surface';
  return (
    <div className="flex justify-between items-center border-b border-black/5 pb-2">
      <span className="text-on-surface-variant font-bold text-xs uppercase">{label}</span>
      <span className={`text-xs ${toneClass}`}>{value}</span>
    </div>
  );
}

