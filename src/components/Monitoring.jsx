import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const guardIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const alertIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export function MonitoringView({ data }) {
  const [live, setLive] = useState(data.live || []);
  const [alerts, setAlerts] = useState(data.alerts || []);

  useEffect(() => {
    setLive(data.live || []);
    setAlerts(data.alerts || []);
  }, [data]);

  useEffect(() => {
    const wsUrl = (import.meta.env.VITE_API_BASE_URL_OPERATIONS || 'https://backend-2-sqc7.onrender.com').replace(/^http/, 'ws') + '/ws/tracking';
    let ws;

    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => ws.send(JSON.stringify({ type: 'owner_web.subscribe', source: 'owner_web' }));
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type !== 'tracking.heartbeat') {
            return;
          }
          setLive((current) => {
            const next = [...current];
            const index = next.findIndex((item) => item.id === payload.user_id);
            const updated = {
              id: payload.user_id,
              name: current[index]?.name || payload.user_id,
              latitude: payload.latitude,
              longitude: payload.longitude,
              distance_meters: payload.distance_meters,
              status: payload.status,
              site_id: payload.site_id,
              site_name: current[index]?.site_name || 'Live patrol',
            };
            if (index >= 0) {
              next[index] = { ...next[index], ...updated };
              return next;
            }
            return [...current, updated];
          });
        } catch (error) {
          console.error('WS parse error', error);
        }
      };
    } catch (error) {
      console.warn('Could not connect to tracking WS', error);
    }

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, []);

  const mapCenter = useMemo(() => {
    const firstLive = live.find((item) => item.latitude && item.longitude);
    if (firstLive) {
      return [firstLive.latitude, firstLive.longitude];
    }
    return [28.6139, 77.209];
  }, [live]);

  const outOfRadiusCount = live.filter((item) => item.status === 'out_of_radius').length;
  const idleCount = live.filter((item) => item.status === 'idle').length;

  return (
    <div className="relative h-[calc(100vh-112px)] rounded-2xl overflow-hidden -mx-4 -mb-4 lg:mx-0 lg:mb-0">
      <div className="absolute inset-0 bg-[#0a0c10] border border-white/5 rounded-2xl overflow-hidden shadow-2xl z-0">
        <MapContainer center={mapCenter} zoom={12} className="w-full h-full" zoomControl={false} style={{ background: '#0a0c10' }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; <a href="https://carto.com/">Carto</a>' />
          {live.map((guard, index) => (
            <Marker key={`guard-${guard.id || index}`} position={[guard.latitude || mapCenter[0], guard.longitude || mapCenter[1]]} icon={guardIcon}>
              <Popup>
                <div className="p-2">
                  <h4 className="font-bold text-primary">{guard.name || 'Guard'}</h4>
                  <p className="text-sm">Status: {guard.status || 'active'}</p>
                  <p className="text-sm">Site: {guard.site_name || 'N/A'}</p>
                  <p className="text-sm">Distance: {Math.round(guard.distance_meters || 0)}m</p>
                </div>
              </Popup>
            </Marker>
          ))}
          {alerts.map((alert, index) => (
            <Marker key={`alert-${alert.id || index}`} position={[alert.latitude || mapCenter[0], alert.longitude || mapCenter[1]]} icon={alertIcon}>
              <Popup>
                <div className="p-2">
                  <h4 className="font-bold text-error">{alert.title || 'Critical Alert'}</h4>
                  <p className="text-sm">{alert.description || 'Review required'}</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-transparent to-black/40 z-[1000]"></div>
      </div>

      <div className="absolute right-6 top-6 bottom-6 w-80 flex flex-col gap-4">
        <div className="bg-white/10 border border-white/10 rounded-xl p-4 text-white backdrop-blur-md">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-title-lg text-title-lg">Live Deployment</h3>
            <span className="px-2 py-0.5 bg-primary/20 text-primary-fixed-dim rounded text-label-sm">{live.length} ONLINE</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/5 rounded-lg p-2 border border-white/5">
              <p className="text-white/60 text-label-sm">Open Alerts</p>
              <p className="text-error text-title-lg font-bold">{alerts.length}</p>
            </div>
            <div className="bg-white/5 rounded-lg p-2 border border-white/5">
              <p className="text-white/60 text-label-sm">Outside Radius</p>
              <p className="text-amber-300 text-title-lg font-bold">{outOfRadiusCount}</p>
            </div>
            <div className="bg-white/5 rounded-lg p-2 border border-white/5 col-span-2">
              <p className="text-white/60 text-label-sm">Idle Guards</p>
              <p className="text-white text-title-lg font-bold">{idleCount}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-2" style={{ scrollbarWidth: 'thin' }}>
          {live.map((guard, index) => (
            <div key={guard.id || index} className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur-md">
              <div className="flex items-center space-x-3 mb-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full border-2 border-primary/40 bg-surface-container flex items-center justify-center overflow-hidden text-on-surface">
                    {guard.photo_url ? <img src={guard.photo_url} alt="Guard" className="w-full h-full object-cover" /> : <span className="material-symbols-outlined">person</span>}
                  </div>
                  <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${guard.status === 'out_of_radius' ? 'bg-error' : guard.status === 'idle' ? 'bg-amber-400' : 'bg-primary'}`}></div>
                </div>
                <div className="flex-1">
                  <h4 className="text-white font-bold text-body-md">{guard.name || 'Guard'}</h4>
                  <p className="text-white/60 text-label-sm uppercase tracking-widest">{guard.site_name || 'UNASSIGNED'}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-label-sm">
                  <span className="text-white/60">Status</span>
                  <span className="text-white capitalize">{String(guard.status || 'active').replaceAll('_', ' ')}</span>
                </div>
                <div className="flex justify-between text-label-sm">
                  <span className="text-white/60">Distance</span>
                  <span className="text-primary-fixed-dim">{Math.round(guard.distance_meters || 0)}m</span>
                </div>
              </div>
            </div>
          ))}
          {live.length === 0 && (
            <div className="text-white/60 text-center p-4">No active assets currently.</div>
          )}
        </div>

        <div className="w-full bg-white/10 border border-white/10 text-white py-3 rounded-xl font-bold flex items-center justify-center space-x-2 backdrop-blur-md">
          <span className="material-symbols-outlined text-[20px]">sync</span>
          <span className="font-label-md">Realtime tracking stream connected</span>
        </div>
      </div>
    </div>
  );
}
