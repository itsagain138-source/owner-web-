import { useEffect, useMemo, useState } from 'react';
import { loadOwnerData, login, updateControls } from './api';

import { DashboardView } from './components/Dashboard';
import { MonitoringView } from './components/Monitoring';
import { AnalyticsView, PeopleView, SitesView } from './components/AnalyticsPeopleSites';
import { FraudView, ReportsView, VerificationView, SettingsView, StorageManagementView, NotificationsView } from './components/MiscViews';
import { BackendControlCenterView } from './components/BackendControlCenter';

const REFRESH_INTERVAL_MS = 20_000;

const navItems = [
  { name: 'Dashboard', icon: 'dashboard' },
  { name: 'Backend Control Center', icon: 'developer_board' },
  { name: 'Monitoring', icon: 'radar' },
  { name: 'All Workforce', icon: 'groups' },
  { name: 'Guards', icon: 'group' },
  { name: 'Supervisors', icon: 'badge' },
  { name: 'Admins', icon: 'admin_panel_settings' },
  { name: 'Sites', icon: 'location_on' },
  { name: 'Analytics', icon: 'monitoring' },
  { name: 'Fraud Center', icon: 'security' },
  { name: 'Verification', icon: 'verified' },
  { name: 'Reports', icon: 'description' },
  { name: 'Storage Management', icon: 'storage' },
  { name: 'Notifications', icon: 'notifications_active' },
  { name: 'Settings', icon: 'settings' },
];

const defaultData = {
  overview: { totals: {} },
  users: [],
  sites: [],
  documents: [],
  attendance: [],
  controls: {
    attendance_enabled: true,
    maintenance_mode: false,
    maintenance_message: '',
    update_required: false,
    update_message: '',
    tracking_interval_seconds: 60,
    attendance_photo_retention_hours: 1440,
    grooming_photo_retention_hours: 1440,
    deleted_photo_retention_hours: 2160,
  },
  live: [],
  grooming: [],
  overtime: [],
  alerts: [],
  fraud: [],
  activity: [],
};

function App() {
  const [activePage, setActivePage] = useState('Dashboard');
  const [auth, setAuth] = useState(() => {
    const saved = localStorage.getItem('ms-owner-auth');
    return saved ? JSON.parse(saved) : null;
  });
  const [form, setForm] = useState({ email: '', password: '', remember: true });
  const [query, setQuery] = useState('');
  const [data, setData] = useState(defaultData);
  const [loading, setLoading] = useState(Boolean(auth));
  const [error, setError] = useState('');
  const [savingControls, setSavingControls] = useState(false);

  useEffect(() => {
    if (!auth?.token) {
      return undefined;
    }

    let cancelled = false;

    const refresh = async (showBusy = false) => {
      if (showBusy) {
        setLoading(true);
      }
      try {
        const payload = await loadOwnerData(auth.token);
        if (!cancelled) {
          setData({ ...defaultData, ...payload });
          setError('');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled && showBusy) {
          setLoading(false);
        }
      }
    };

    refresh(true);
    const intervalId = window.setInterval(() => refresh(false), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [auth]);

  const people = useMemo(() => data.users || [], [data.users]);
  const filteredPeople = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return people;
    }
    return people.filter((item) => {
      return [
        item.full_name,
        item.name,
        item.email,
        item.employee_id,
        item.site_name,
        item.role,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [people, query]);
  const guards = filteredPeople.filter((item) => item.role === 'guard');
  const supervisors = filteredPeople.filter((item) => item.role === 'supervisor');
  const admins = filteredPeople.filter((item) => item.role === 'admin' || item.role === 'owner');
  const filteredSites = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return data.sites || [];
    }
    return (data.sites || []).filter((site) =>
      [site.name, site.client_name, site.address].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [data.sites, query]);
  const activeAlerts = (data.alerts || []).filter((item) => item.status !== 'resolved');

  const onAuthSuccess = (response) => {
    const role = String(response.profile?.role || '').toLowerCase();
    if (!['owner', 'admin', 'supervisor'].includes(role)) {
      throw new Error('This web workspace is available only for owner, admin, or supervisor accounts.');
    }
    const nextAuth = {
      token: response.access_token || response.token,
      profile: response.profile,
      role: role,
      permissions: response.profile?.permissions || {},
    };
    setAuth(nextAuth);
    if (form.remember) {
      localStorage.setItem('ms-owner-auth', JSON.stringify(nextAuth));
    } else {
      localStorage.removeItem('ms-owner-auth');
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await login(form.email, form.password);
      onAuthSuccess(response);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  function handleLogout() {
    localStorage.removeItem('ms-owner-auth');
    setAuth(null);
    setData(defaultData);
    setActivePage('Dashboard');
    setError('');
  }

  async function handleSaveControls(nextControls) {
    if (!auth?.token) {
      return;
    }
    setSavingControls(true);
    try {
      const updated = await updateControls(auth.token, nextControls);
      setData((current) => ({ ...current, controls: updated }));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingControls(false);
    }
  }

  if (!auth?.token) {
    return (
      <div className="bg-surface text-on-surface flex items-center justify-center min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 z-0 bg-animate bg-gradient-to-br from-[#f0f4ff] via-[#ffffff] to-[#e8eeff]"></div>
        <div className="absolute inset-0 z-0 overflow-hidden">
          <img className="w-full h-full object-cover opacity-20 blur-[100px]" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCsPpYrgQQLe_angNgTQiTvgr8iGFQgzX9qbaOkFuHxqUyU03Nv0B_fw_3exrSW9tCa3dpqev_sWdH_VeJCIs4S6iZyWnT6FEItBgJ0__V1TMbMmmWrg5YU7YpybFFZjfo0WEiWjY7te2U-qOhzYn_JHTt9zIgcR6kCac-COiBPNsMCL--lHRZ5PfgTYruzTcyqD56_PYbuJExTBoOdHKClso5anqnKkU5sEboqq8w9qFqboltYAfs3vK2KaLyrXFxop5NMR0bnYmui" alt="Background" />
        </div>

        <main className="relative z-10 w-full max-w-[480px] px-6">
          <div className="glass-card rounded-[2rem] p-10 md:p-12 flex flex-col items-center">
            <div className="mb-10 text-center">
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                  <span className="material-symbols-outlined text-white text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>shield</span>
                </div>
              </div>
              <h1 className="font-title-lg text-title-lg font-black tracking-tight text-primary uppercase">MS Security</h1>
              <p className="font-label-md text-label-md text-on-surface-variant mt-1">Command Center Access</p>
            </div>

            {error && <div className="w-full bg-error/10 border border-error/20 text-error p-3 rounded-lg mb-4 text-center text-body-md font-medium">{error}</div>}

            <form className="w-full space-y-6" onSubmit={handleLogin}>
              <div className="space-y-4">
                <div className="relative group">
                  <label className="block font-label-md text-label-md text-on-surface-variant mb-1.5 ml-1">Email Address</label>
                  <input className="w-full h-14 px-5 rounded-xl input-glass font-body-md text-body-md outline-none focus:ring-0" placeholder="name@company.com" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required />
                </div>
                <div className="relative group">
                  <label className="block font-label-md text-label-md text-on-surface-variant mb-1.5 ml-1">Password</label>
                  <input className="w-full h-14 px-5 rounded-xl input-glass font-body-md text-body-md outline-none focus:ring-0" placeholder="••••••••" type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} required />
                </div>
              </div>

              <div className="flex items-center justify-between px-1">
                <label className="flex items-center space-x-2 cursor-pointer group">
                  <div className="relative">
                    <input className="sr-only peer" type="checkbox" checked={form.remember} onChange={(event) => setForm((current) => ({ ...current, remember: event.target.checked }))} />
                    <div className="w-10 h-6 bg-surface-container-highest rounded-full peer peer-checked:bg-primary transition-colors"></div>
                    <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4"></div>
                  </div>
                  <span className="font-label-md text-label-md text-on-surface-variant group-hover:text-on-surface transition-colors">Remember device</span>
                </label>
                <span className="font-label-md text-label-md text-primary">Realtime workspace</span>
              </div>

              <button className="w-full h-14 rounded-xl premium-gradient text-white font-title-lg text-body-lg font-bold shadow-xl shadow-primary/20 hover:shadow-2xl hover:shadow-primary/30 transform transition-all flex items-center justify-center" type="submit" disabled={loading}>
                {loading ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="bg-background text-on-surface antialiased overflow-x-hidden min-h-screen">
      <aside className="fixed left-4 top-4 bottom-4 w-64 rounded-xl bg-white/75 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.04)] flex flex-col py-6 px-4 space-y-8 z-50">
        <div className="flex items-center space-x-3 px-2">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center text-white shadow-lg">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>shield</span>
          </div>
          <div>
            <h1 className="font-title-lg text-title-lg font-bold text-primary tracking-tight">MS Security</h1>
            <p className="font-label-md text-label-md text-on-surface-variant opacity-70">Command Center</p>
          </div>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
          {navItems.map((item) => {
            const isActive = activePage === item.name;
            return (
              <button
                key={item.name}
                onClick={() => setActivePage(item.name)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-300 ${
                  isActive
                    ? 'text-primary font-bold shadow-[0_0_15px_rgba(0,88,190,0.2)] bg-primary/5 scale-[0.98]'
                    : 'text-on-surface-variant hover:bg-primary/5 hover:text-primary font-label-md text-label-md'
                }`}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span>{item.name}</span>
              </button>
            );
          })}
        </nav>

        <div className="pt-6 border-t border-on-surface/5 space-y-2">
          <button onClick={() => setActivePage('Notifications')} className="w-full flex items-center space-x-3 px-4 py-2 text-on-surface-variant hover:text-primary transition-colors">
            <span className="material-symbols-outlined">support_agent</span>
            <span className="font-label-md text-label-md">Broadcasts</span>
          </button>
          <button onClick={handleLogout} className="w-full flex items-center space-x-3 px-4 py-2 text-on-surface-variant hover:text-error transition-colors">
            <span className="material-symbols-outlined">logout</span>
            <span className="font-label-md text-label-md">Log Out</span>
          </button>
        </div>
      </aside>

      <header className="fixed top-4 left-72 right-4 rounded-xl h-16 bg-white/75 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.04)] flex justify-between items-center px-6 z-40">
        <div className="flex items-center w-1/2">
          <div className="relative w-full max-w-md">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
            <input className="w-full bg-surface-container-low border-none rounded-lg py-2 pl-10 pr-4 text-body-md focus:ring-2 ring-primary/20 outline-none transition-all" placeholder="Search personnel, sites, or roles..." type="text" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <button onClick={() => setActivePage('Fraud Center')} className="p-2 text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-colors relative">
            <span className="material-symbols-outlined">notifications</span>
            {activeAlerts.length > 0 && <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full animate-ping"></span>}
          </button>
          <button onClick={() => setActivePage('Settings')} className="p-2 text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-colors">
            <span className="material-symbols-outlined">settings</span>
          </button>
          <div className="h-8 w-[1px] bg-on-surface/10 mx-2"></div>
          <div className="flex items-center space-x-3">
            <div className="text-right hidden sm:block">
              <p className="font-label-md text-label-md font-bold text-on-surface">{auth.profile?.full_name || 'Owner User'}</p>
              <p className="text-[10px] uppercase tracking-widest text-primary font-bold">{String(auth.profile?.role || 'owner')}</p>
            </div>
            <div className="w-10 h-10 rounded-full border-2 border-primary/20 bg-primary/10 flex items-center justify-center overflow-hidden">
              <span className="material-symbols-outlined text-primary">person</span>
            </div>
          </div>
        </div>
      </header>

      <main className="pt-24 pl-72 pr-4 pb-8 min-h-screen">
        {error && <div className="mb-6 p-4 bg-error/10 border border-error/20 text-error rounded-xl font-body-md flex items-center"><span className="material-symbols-outlined mr-2">error</span>{error}</div>}
        {loading && <div className="mb-6 p-6 glass-card rounded-2xl flex justify-center items-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div><span className="ml-3 text-on-surface-variant font-label-md">Loading workspace...</span></div>}

        {!loading && activePage === 'Dashboard' && <DashboardView data={data} guards={guards} activeAlerts={activeAlerts} />}
        {!loading && activePage === 'Backend Control Center' && <BackendControlCenterView />}
        {!loading && activePage === 'Verification' && <VerificationView data={data} />}
        {!loading && activePage === 'Monitoring' && <MonitoringView data={data} />}
        {!loading && activePage === 'Analytics' && <AnalyticsView data={data} />}
        {!loading && activePage === 'All Workforce' && <PeopleView title="Workforce Management — All Roles" people={filteredPeople} data={data} />}
        {!loading && activePage === 'Guards' && <PeopleView title="Guard Management" people={guards} data={data} />}
        {!loading && activePage === 'Supervisors' && <PeopleView title="Supervisor Management" people={supervisors} data={data} />}
        {!loading && activePage === 'Admins' && <PeopleView title="Admin Management" people={admins} data={data} />}
        {!loading && activePage === 'Sites' && <SitesView sites={filteredSites} live={data.live || []} users={data.users || []} />}
        {!loading && activePage === 'Fraud Center' && <FraudView data={data} />}
        {!loading && activePage === 'Reports' && <ReportsView data={data} />}
        {!loading && activePage === 'Storage Management' && <StorageManagementView />}
        {!loading && activePage === 'Notifications' && <NotificationsView />}
        {!loading && activePage === 'Settings' && <SettingsView controls={data.controls} onSave={handleSaveControls} saving={savingControls} />}
      </main>
    </div>
  );
}

export default App;
