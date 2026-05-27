import React, { useEffect, useMemo, useState } from 'react';
import { getStorageStats, cleanupStorage, broadcastNotification, reviewDocument, reviewAttendance } from '../api';

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

export function FraudView({ data }) {
  const alerts = useMemo(() => {
    return [...(data.fraud || []), ...(data.alerts || [])].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }, [data]);

  return (
    <div className="pb-12">
      <div className="grid grid-cols-12 gap-6 pb-8">
        <div className="col-span-12 lg:col-span-8 glass-card rounded-xl p-8 relative overflow-hidden">
          <div className="flex flex-col h-full">
            <h2 className="font-headline-md text-headline-md mb-2 flex items-center gap-2 text-on-surface">
              Risk Overview
              <span className={`w-3 h-3 rounded-full ${alerts.length ? 'bg-error' : 'bg-emerald-500'}`}></span>
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant mb-10">Live geofence and anomaly events collected from the operations backend.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <RiskCard label="Open Flags" value={alerts.filter((item) => item.status !== 'resolved').length} />
              <RiskCard label="Critical" value={alerts.filter((item) => item.severity === 'critical').length} />
              <RiskCard label="High" value={alerts.filter((item) => item.severity === 'high').length} />
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 glass-card rounded-xl p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-title-lg text-title-lg text-on-surface">Critical Alerts</h3>
            <span className="bg-error text-white text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-tighter">Live</span>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
            {alerts.slice(0, 6).map((item, index) => (
              <div key={item.id || index} className="p-4 rounded-xl bg-error/5 border border-error/10">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-label-sm text-label-sm text-error font-bold">{item.title || item.action || 'ALERT'}</span>
                  <span className="text-[10px] opacity-40 text-on-surface-variant">
                    {item.created_at ? new Date(item.created_at).toLocaleTimeString() : 'Just now'}
                  </span>
                </div>
                <p className="font-body-md text-body-md font-semibold text-on-surface">{item.user_name || 'System'}</p>
                <p className="font-label-md text-label-md text-on-surface-variant">{item.description || 'System anomaly detected.'}</p>
              </div>
            ))}
            {alerts.length === 0 && <div className="p-4 text-center text-on-surface-variant">No active fraud alerts.</div>}
          </div>
        </div>

        <div className="col-span-12 glass-card rounded-xl overflow-hidden" style={{ padding: 0 }}>
          <div className="px-8 py-6 border-b border-black/5 flex items-center justify-between">
            <div>
              <h3 className="font-title-lg text-title-lg text-on-surface">Forensics Feed</h3>
              <p className="font-label-md text-label-md text-on-surface-variant">Backend-originated fraud and alert events.</p>
            </div>
          </div>
          <div className="w-full">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low/30">
                  <th className="px-8 py-4 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Timestamp</th>
                  <th className="px-8 py-4 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Severity</th>
                  <th className="px-8 py-4 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Subject</th>
                  <th className="px-8 py-4 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((item, index) => (
                  <tr key={item.id || index} className="border-t border-black/5">
                    <td className="px-8 py-5 font-body-md text-body-md text-on-surface">{item.created_at ? new Date(item.created_at).toLocaleString() : '--'}</td>
                    <td className="px-8 py-5"><span className="bg-error/10 text-error px-2 py-1 rounded text-[11px] font-bold uppercase">{item.severity || item.action || 'alert'}</span></td>
                    <td className="px-8 py-5 font-body-md text-body-md text-on-surface">{item.user_name || item.title || 'System'}</td>
                    <td className="px-8 py-5 font-body-md text-body-md text-on-surface">{item.status || 'open'}</td>
                  </tr>
                ))}
                {alerts.length === 0 && <tr><td colSpan="4" className="px-8 py-5 text-center text-on-surface-variant">No records available.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function RiskCard({ label, value }) {
  return (
    <div className="rounded-xl border border-outline/10 bg-surface-container-low p-5">
      <p className="font-label-md text-label-md text-on-surface-variant">{label}</p>
      <p className="font-headline-lg text-headline-lg text-on-surface">{value}</p>
    </div>
  );
}

export function ReportsView({ data }) {
  const exports = [
    {
      title: 'Attendance',
      description: 'Check-ins, approvals, and site coverage.',
      rows: [
        ['ID', 'User', 'Site', 'Status', 'Check In', 'Check Out'],
        ...(data.attendance || []).map((item) => [item.id, item.user_name, item.site_name, item.status, item.check_in_at, item.check_out_at]),
      ],
    },
    {
      title: 'Fraud Analysis',
      description: 'Fraud and alert signal feed.',
      rows: [
        ['ID', 'Title', 'User', 'Severity', 'Status', 'Created At'],
        ...([...(data.fraud || []), ...(data.alerts || [])]).map((item) => [item.id, item.title || item.action, item.user_name, item.severity, item.status, item.created_at]),
      ],
    },
    {
      title: 'Overtime',
      description: 'Requested and approved extra-duty hours.',
      rows: [
        ['ID', 'User', 'Site', 'Hours', 'Status', 'Date'],
        ...(data.overtime || []).map((item) => [item.id, item.user_name, item.site_name, item.hours, item.status, item.overtime_date]),
      ],
    },
    {
      title: 'Documents',
      description: 'Compliance document review queue and approvals.',
      rows: [
        ['ID', 'User', 'Type', 'Document Number', 'Status'],
        ...(data.documents || []).map((item) => [item.id, item.user_name, item.document_type, item.document_number, item.status]),
      ],
    },
  ];

  return (
    <div className="pb-12 max-w-7xl mx-auto space-y-6">
      <div>
        <h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Export Hub</h2>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl">Generate CSV exports directly from live backend data.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {exports.map((item) => (
          <div key={item.title} className="glass-card rounded-2xl p-6">
            <h3 className="font-title-lg text-title-lg text-on-surface mb-2">{item.title}</h3>
            <p className="font-body-md text-body-md text-on-surface-variant mb-6">{item.description}</p>
            <button className="w-full py-3 rounded-lg bg-primary text-white font-body-md hover:bg-primary/90 transition-all" onClick={() => downloadCsv(`${item.title.toLowerCase().replaceAll(' ', '_')}.csv`, item.rows)}>
              Download CSV
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function VerificationView({ data }) {
  const [docs, setDocs] = useState(data.documents || []);
  const [attendance, setAttendance] = useState(data.attendance || []);
  const [grooming, setGrooming] = useState(data.grooming || []);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    setDocs(data.documents || []);
    setAttendance(data.attendance || []);
    setGrooming(data.grooming || []);
  }, [data]);

  const pendingDocs = docs.filter((item) => item.status === 'pending_review');
  const pendingAtt = attendance.filter((item) => item.status === 'pending_review' || item.status === 'manual_review');
  const groomingPhotos = grooming.filter((item) => item.photo_url || item.photo_path);

  const handleDocReview = async (id, decision) => {
    const auth = JSON.parse(localStorage.getItem('ms-owner-auth'));
    setWorking(true);
    try {
      await reviewDocument(auth.token, id, decision);
      setDocs((current) => current.filter((item) => item.id !== id));
      setPreviewDoc(null);
    } catch (err) {
      window.alert(`Error reviewing document: ${err.message}`);
    } finally {
      setWorking(false);
    }
  };

  const handleAttendanceReview = async (item, decision) => {
    const auth = JSON.parse(localStorage.getItem('ms-owner-auth'));
    setWorking(true);
    try {
      await reviewAttendance(auth.token, item.id, decision);
      setAttendance((current) => current.filter((entry) => entry.id !== item.id));
      setPreviewPhoto(null);
    } catch (err) {
      window.alert(`Error reviewing attendance: ${err.message}`);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 relative">
      {previewDoc && (
        <PreviewModal title={`Document Preview: ${previewDoc.document_type}`} onClose={() => setPreviewDoc(null)}>
          <div className="w-full h-[60vh] bg-surface-container-low mb-6 rounded-xl flex items-center justify-center border border-outline/10">
            {previewDoc.file_url ? <img src={previewDoc.file_url} alt="Document Preview" className="max-w-full max-h-full object-contain" /> : <span className="text-on-surface-variant">No image preview available</span>}
          </div>
          <div className="flex gap-4 w-full">
            <button className="flex-1 py-3 bg-surface-container hover:bg-surface-container-high rounded-xl font-bold" onClick={() => setPreviewDoc(null)}>Cancel</button>
            <button className="flex-1 py-3 bg-error/10 text-error hover:bg-error/20 rounded-xl font-bold" disabled={working} onClick={() => handleDocReview(previewDoc.id, 'rejected')}>Reject</button>
            <button className="flex-1 py-3 bg-emerald-500 text-white hover:bg-emerald-600 rounded-xl font-bold" disabled={working} onClick={() => handleDocReview(previewDoc.id, 'approved')}>Approve</button>
          </div>
        </PreviewModal>
      )}

      {previewPhoto && (
        <PreviewModal title={`Photo Preview: ${previewPhoto.vtype}`} onClose={() => setPreviewPhoto(null)}>
          <div className="w-full h-[60vh] bg-black mb-6 rounded-xl flex items-center justify-center overflow-hidden border border-outline/10">
            <img src={previewPhoto.photo_url || previewPhoto.photo_path} alt="Preview" className="w-full h-full object-cover" />
          </div>
          {previewPhoto.vtype === 'Attendance' ? (
            <div className="flex gap-4 w-full">
              <button className="flex-1 py-3 bg-surface-container hover:bg-surface-container-high rounded-xl font-bold" onClick={() => setPreviewPhoto(null)}>Cancel</button>
              <button className="flex-1 py-3 bg-error/10 text-error hover:bg-error/20 rounded-xl font-bold" disabled={working} onClick={() => handleAttendanceReview(previewPhoto, 'rejected')}>Reject</button>
              <button className="flex-1 py-3 bg-emerald-500 text-white hover:bg-emerald-600 rounded-xl font-bold" disabled={working} onClick={() => handleAttendanceReview(previewPhoto, 'approved')}>Approve</button>
            </div>
          ) : (
            <div className="w-full rounded-xl bg-surface-container-low p-4 text-on-surface-variant">
              Grooming records are displayed from the operations backend for audit visibility. Supervisor-submitted entries are viewable here, while approval flow currently applies to attendance and documents.
            </div>
          )}
        </PreviewModal>
      )}

      <VerificationTable
        title="Document Verification"
        badge={`${pendingDocs.length} Pending`}
        columns={['Type', 'Name', 'Document No.', 'Action']}
        rows={pendingDocs.map((doc) => ({
          key: doc.id,
          cells: [doc.document_type?.toUpperCase(), doc.user_name || 'Staff', doc.document_number || 'N/A'],
          action: (
            <>
              <button className="px-4 py-2 bg-primary/10 text-primary rounded-lg font-label-md hover:bg-primary/20 transition-colors mr-2" onClick={() => handleDocReview(doc.id, 'approved')}>Approve Quick</button>
              <button className="px-4 py-2 bg-primary text-white rounded-lg font-label-md hover:bg-primary/90 transition-colors" onClick={() => setPreviewDoc(doc)}>Review</button>
            </>
          ),
        }))}
        emptyText="No pending documents."
      />

      <VerificationTable
        title="Attendance Photo Review"
        badge={`${pendingAtt.length} Pending`}
        columns={['Type', 'Name', 'Site', 'Action']}
        rows={pendingAtt.map((item) => ({
          key: item.id,
          cells: ['Attendance', item.user_name || 'Staff', item.site_name || 'Site'],
          action: <button className="px-4 py-2 bg-primary text-white rounded-lg font-label-md hover:bg-primary/90 transition-colors" onClick={() => setPreviewPhoto({ ...item, vtype: 'Attendance' })}>Review Image</button>,
        }))}
        emptyText="No pending attendance photo reviews."
      />

      <VerificationTable
        title="Grooming Photo Audit"
        badge={`${groomingPhotos.length} Captured`}
        columns={['Type', 'Name', 'Site', 'Action']}
        rows={groomingPhotos.map((item) => ({
          key: item.id,
          cells: ['Grooming', item.user?.full_name || item.user_name || 'Staff', item.site?.name || item.site_name || 'Site'],
          action: <button className="px-4 py-2 bg-primary text-white rounded-lg font-label-md hover:bg-primary/90 transition-colors" onClick={() => setPreviewPhoto({ ...item, vtype: 'Grooming' })}>Open Photo</button>,
        }))}
        emptyText="No grooming photos available."
      />
    </div>
  );
}

function PreviewModal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-3xl rounded-3xl p-6 shadow-2xl flex flex-col items-center">
        <div className="w-full flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-container">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function VerificationTable({ title, badge, columns, rows, emptyText }) {
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="mb-6 flex justify-between items-center">
        <h3 className="font-title-lg text-title-lg text-on-surface">{title}</h3>
        <span className="bg-tertiary-container text-on-tertiary-container px-3 py-1 rounded-full text-label-md font-bold">{badge}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-black/5">
              {columns.map((column) => <th key={column} className="py-3 font-label-md text-on-surface-variant uppercase">{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-b border-black/5" key={row.key}>
                {row.cells.map((cell, index) => <td key={`${row.key}-${index}`} className="py-3 text-on-surface-variant">{cell}</td>)}
                <td className="py-3 text-right">{row.action}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={columns.length} className="py-4 text-center text-on-surface-variant">{emptyText}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SettingsView({ controls, onSave, saving }) {
  const [local, setLocal] = useState(() => controls || {});
  const [adminPerms, setAdminPerms] = useState(() => {
    const saved = controls?.admin_permissions || {};
    return {
      can_create_users: saved.can_create_users ?? true,
      can_edit_users: saved.can_edit_users ?? true,
      can_delete_users: saved.can_delete_users ?? false,
      can_create_sites: saved.can_create_sites ?? true,
      can_edit_sites: saved.can_edit_sites ?? true,
      can_delete_sites: saved.can_delete_sites ?? false,
      can_approve_documents: saved.can_approve_documents ?? true,
      can_approve_attendance: saved.can_approve_attendance ?? true,
      can_send_notifications: saved.can_send_notifications ?? true,
      can_manage_shifts: saved.can_manage_shifts ?? true,
      can_view_analytics: saved.can_view_analytics ?? true,
      can_view_fraud: saved.can_view_fraud ?? false,
      can_access_backend_control: saved.can_access_backend_control ?? false,
    };
  });

  useEffect(() => {
    setLocal(controls || {});
  }, [controls]);

  const handleSaveAll = () => {
    onSave({ ...local, admin_permissions: adminPerms });
  };

  const permLabels = {
    can_create_users: { label: 'Create Users', desc: 'Can create new personnel accounts.' },
    can_edit_users: { label: 'Edit Users', desc: 'Can modify existing personnel profiles.' },
    can_delete_users: { label: 'Delete Users', desc: 'Can archive or permanently remove users.' },
    can_create_sites: { label: 'Create Sites', desc: 'Can register new operational sites.' },
    can_edit_sites: { label: 'Edit Sites', desc: 'Can modify site configurations.' },
    can_delete_sites: { label: 'Delete Sites', desc: 'Can deactivate or remove sites.' },
    can_approve_documents: { label: 'Approve Documents', desc: 'Can review and approve compliance docs.' },
    can_approve_attendance: { label: 'Approve Attendance', desc: 'Can review and approve check-in photos.' },
    can_send_notifications: { label: 'Send Broadcasts', desc: 'Can send push notifications to devices.' },
    can_manage_shifts: { label: 'Manage Shifts', desc: 'Can create and reassign shift schedules.' },
    can_view_analytics: { label: 'View Analytics', desc: 'Can access the analytics dashboard.' },
    can_view_fraud: { label: 'View Fraud Center', desc: 'Can access fraud and alert feeds.' },
    can_access_backend_control: { label: 'Backend Control', desc: 'Can access the backend control center.' },
  };

  return (
    <div className="pb-12 max-w-[1200px] mx-auto space-y-6">
      <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
        <div className="px-6 py-5 border-b border-surface-variant/30 flex items-center justify-between">
          <div>
            <h2 className="font-headline-md text-headline-md text-on-surface">General Settings</h2>
            <p className="text-body-md text-on-surface-variant">Owner-level system controls and retention policies.</p>
          </div>
          <button className="bg-primary text-white px-5 py-2.5 rounded-xl font-label-md text-label-md hover:bg-primary-container transition-all shadow-lg shadow-primary/20" type="button" disabled={saving} onClick={handleSaveAll}>
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
        <div className="p-6 space-y-6">
          <ToggleRow label="Attendance System" description="Enable or disable check-ins globally." checked={Boolean(local.attendance_enabled)} onChange={(value) => setLocal((current) => ({ ...current, attendance_enabled: value }))} />
          <ToggleRow label="Maintenance Mode" description="Show maintenance state across mobile clients." checked={Boolean(local.maintenance_mode)} onChange={(value) => setLocal((current) => ({ ...current, maintenance_mode: value }))} />

          <InputRow label="Maintenance Message" value={local.maintenance_message || ''} onChange={(value) => setLocal((current) => ({ ...current, maintenance_message: value }))} />
          <InputRow label="Update Message" value={local.update_message || ''} onChange={(value) => setLocal((current) => ({ ...current, update_message: value }))} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <InputRow type="number" label="Tracking Interval (seconds)" value={local.tracking_interval_seconds || 60} onChange={(value) => setLocal((current) => ({ ...current, tracking_interval_seconds: Number(value) }))} />
            <InputRow type="number" label="Attendance Retention (hours)" value={local.attendance_photo_retention_hours || 1440} onChange={(value) => setLocal((current) => ({ ...current, attendance_photo_retention_hours: Number(value) }))} />
            <InputRow type="number" label="Deleted Photo Retention (hours)" value={local.deleted_photo_retention_hours || 2160} onChange={(value) => setLocal((current) => ({ ...current, deleted_photo_retention_hours: Number(value) }))} />
          </div>
        </div>
      </div>

      <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
        <div className="px-6 py-5 border-b border-surface-variant/30 flex items-center justify-between">
          <div>
            <h2 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">admin_panel_settings</span>
              Admin Role Permissions
            </h2>
            <p className="text-body-md text-on-surface-variant">Configure what admins can access. Only Owner can change these.</p>
          </div>
          <span className="text-[10px] uppercase tracking-wider font-bold bg-amber-100 text-amber-700 px-3 py-1 rounded-full">RBAC Engine</span>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(permLabels).map(([key, meta]) => (
            <div key={key} className="flex items-center justify-between p-4 bg-surface-container-low rounded-xl border border-outline-variant/10 hover:border-primary/20 transition-all">
              <div>
                <span className="font-body-md text-on-surface block font-bold">{meta.label}</span>
                <span className="font-label-sm text-on-surface-variant text-xs">{meta.desc}</span>
              </div>
              <input type="checkbox" className="w-5 h-5 text-primary bg-surface-container-high rounded border-none focus:ring-primary focus:ring-offset-surface" checked={!!adminPerms[key]} onChange={(e) => setAdminPerms(prev => ({ ...prev, [key]: e.target.checked }))} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-xl border border-outline-variant/20">
      <div>
        <span className="font-body-md text-on-surface block font-bold">{label}</span>
        <span className="font-label-sm text-on-surface-variant">{description}</span>
      </div>
      <input type="checkbox" className="w-5 h-5 text-primary bg-surface-container-high rounded border-none focus:ring-primary focus:ring-offset-surface" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </div>
  );
}

function InputRow({ label, value, onChange, type = 'text' }) {
  return (
    <div className="space-y-2">
      <label className="block font-label-md text-on-surface-variant font-bold">{label}</label>
      <input className="w-full bg-surface-container-low border border-transparent rounded-lg p-3 text-body-md focus:ring-2 focus:ring-primary/20 focus:border-primary/30 outline-none text-on-surface transition-all" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

export function StorageManagementView() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = JSON.parse(localStorage.getItem('ms-owner-auth'));
    if (auth?.token) {
      getStorageStats(auth.token).then(setStats).catch(console.error).finally(() => setLoading(false));
    }
  }, []);

  const handleCleanup = async () => {
    const auth = JSON.parse(localStorage.getItem('ms-owner-auth'));
    if (auth?.token) {
      setLoading(true);
      await cleanupStorage(auth.token).catch(console.error);
      getStorageStats(auth.token).then(setStats).catch(console.error).finally(() => setLoading(false));
    }
  };

  if (loading) return <div className="glass-card rounded-2xl p-6 text-on-surface">Loading storage stats...</div>;
  if (!stats) return <div className="p-4 bg-error/10 text-error rounded-xl font-body-md">Failed to load storage stats.</div>;

  const renderGb = (bytes) => `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="glass-card rounded-2xl p-6">
        <h3 className="font-title-lg text-on-surface mb-4">Primary Storage (Supabase)</h3>
        <p className="text-on-surface-variant mb-2">Limit: <span className="text-on-surface font-bold">{renderGb(stats.supabase.limit_bytes)}</span></p>
        <p className="text-on-surface-variant">Usage: <span className="text-primary font-bold">Managed by bucket dashboard</span></p>
      </div>
      <div className="glass-card rounded-2xl p-6">
        <h3 className="font-title-lg text-on-surface mb-4">Fallback Storage (PostgreSQL)</h3>
        <p className="text-on-surface-variant mb-2">Limit: <span className="text-on-surface font-bold">{renderGb(stats.render_db.limit_bytes)}</span></p>
        <p className="text-on-surface-variant mb-2">Usage: <span className="text-on-surface font-bold">{renderGb(stats.render_db.used_bytes)}</span></p>
        <p className="text-on-surface-variant mb-6">Stored Photos: <span className="text-primary font-bold">{stats.render_db.photo_count}</span></p>
        <button className="px-6 py-2 bg-primary text-white rounded-lg font-label-md hover:bg-primary/90 transition-colors" onClick={handleCleanup}>Force Cleanup Expired</button>
      </div>
    </div>
  );
}

export function NotificationsView() {
  const [target, setTarget] = useState('all');
  const [message, setMessage] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [broadcastHistory, setBroadcastHistory] = useState([]);

  const handleSend = async (event) => {
    event.preventDefault();
    const auth = JSON.parse(localStorage.getItem('ms-owner-auth'));
    if (!auth?.token) {
      return;
    }
    setLoading(true);
    setStatus('');
    try {
      const response = await broadcastNotification(auth.token, { target, message, sound_enabled: soundEnabled });
      setStatus(`Broadcast saved for ${response.dispatched_to}.`);
      setBroadcastHistory(prev => [{ target, message, sound: soundEnabled, time: new Date().toLocaleString() }, ...prev]);
      setMessage('');
    } catch (err) {
      setStatus(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pb-12 max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Notification Control Center</h2>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">Role-based, site-based, and shift-based enterprise broadcast system.</p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 glass-card rounded-2xl p-8 space-y-6">
          <div className="flex items-center gap-3 border-b border-outline-variant/10 pb-4">
            <div className="w-10 h-10 bg-error/10 rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-error" style={{ fontVariationSettings: "'FILL' 1" }}>campaign</span>
            </div>
            <div>
              <h3 className="font-title-lg text-title-lg text-on-surface">Broadcast Message</h3>
              <p className="text-xs text-on-surface-variant">Push alerts through the owner broadcast endpoint.</p>
            </div>
          </div>
          {status && <div className="p-3 rounded-xl bg-primary/10 text-primary text-sm font-bold">{status}</div>}
          <form onSubmit={handleSend} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block font-label-md text-on-surface-variant font-bold uppercase tracking-wider text-xs">Target Audience</label>
                <select className="w-full bg-surface-container-low border-none rounded-xl p-3.5 text-sm font-semibold focus:ring-2 focus:ring-primary/20 outline-none text-on-surface" value={target} onChange={(event) => setTarget(event.target.value)}>
                  <optgroup label="By Role">
                    <option value="all">All Devices</option>
                    <option value="guards">Guards Only</option>
                    <option value="supervisors">Supervisors Only</option>
                    <option value="admins">Admins Only</option>
                  </optgroup>
                  <optgroup label="By Workspace Role">
                    <option value="role:Security Guard">Security Guards</option>
                    <option value="role:Electrician">Electricians</option>
                    <option value="role:Housekeeping">Housekeeping Staff</option>
                    <option value="role:Technician">Technicians</option>
                    <option value="role:Driver">Drivers</option>
                    <option value="role:Maintenance Staff">Maintenance Staff</option>
                  </optgroup>
                  <optgroup label="By Shift">
                    <option value="shift:day">Day Shift Personnel</option>
                    <option value="shift:night">Night Shift Personnel</option>
                    <option value="shift:morning">Morning Shift Personnel</option>
                    <option value="shift:evening">Evening Shift Personnel</option>
                  </optgroup>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block font-label-md text-on-surface-variant font-bold uppercase tracking-wider text-xs">Priority Level</label>
                <select className="w-full bg-surface-container-low border-none rounded-xl p-3.5 text-sm font-semibold focus:ring-2 focus:ring-primary/20 outline-none text-on-surface">
                  <option value="normal">Normal — Standard notification</option>
                  <option value="high">High — Alert banner on device</option>
                  <option value="critical">Critical — Full-screen takeover</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="block font-label-md text-on-surface-variant font-bold uppercase tracking-wider text-xs">Message Content</label>
              <textarea className="w-full bg-surface-container-low border-none rounded-xl p-3.5 text-sm font-semibold focus:ring-2 focus:ring-primary/20 outline-none text-on-surface resize-none" value={message} onChange={(event) => setMessage(event.target.value)} required rows={4} placeholder="Enter your critical broadcast message..."></textarea>
            </div>
            <div className="flex items-center space-x-3 p-4 bg-error/5 rounded-xl border border-error/10">
              <input type="checkbox" className="w-5 h-5 text-error bg-surface-container-high rounded border-none focus:ring-error" checked={soundEnabled} onChange={(event) => setSoundEnabled(event.target.checked)} />
              <span className="font-body-md text-on-surface font-bold">Play high-priority sound on device</span>
            </div>
            <button className="w-full px-6 py-4 bg-error text-white rounded-xl font-bold shadow-lg shadow-error/20 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2" type="submit" disabled={loading}>
              <span className="material-symbols-outlined text-[20px]">send</span>
              {loading ? 'Sending Broadcast...' : 'Send Emergency Broadcast'}
            </button>
          </form>
        </div>
        
        <div className="lg:col-span-2 glass-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-outline-variant/10 pb-4">
            <span className="material-symbols-outlined text-primary">history</span>
            <h4 className="font-bold text-sm">Recent Broadcasts</h4>
          </div>
          {broadcastHistory.length > 0 ? (
            <div className="space-y-3 max-h-[500px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
              {broadcastHistory.map((item, idx) => (
                <div key={idx} className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/10">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full">{item.target}</span>
                    <span className="text-[10px] text-on-surface-variant opacity-60">{item.time}</span>
                  </div>
                  <p className="text-xs text-on-surface font-medium line-clamp-2">{item.message}</p>
                  {item.sound && <span className="text-[9px] text-error font-bold mt-1 block">🔊 Sound Enabled</span>}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-on-surface-variant">
              <span className="material-symbols-outlined text-3xl opacity-30 block mb-2">notifications_off</span>
              <p className="text-xs font-medium">No broadcasts sent in this session.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

