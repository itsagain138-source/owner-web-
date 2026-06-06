import React, { useEffect, useMemo, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getTrackingHistory } from '../api';

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

const historyIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const getLocalDateString = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().split('T')[0];
};

// Haversine formula to compute distance in meters (needed for stop duration detection)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
}

export function MonitoringView({ data, token }) {
  // Navigation: "live" vs "history"
  const [viewMode, setViewMode] = useState('live');

  // Live state
  const [live, setLive] = useState(data.live || []);
  const [alerts, setAlerts] = useState(data.alerts || []);

  // History parameters
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedDateType, setSelectedDateType] = useState('today'); // 'today', 'yesterday', 'custom'
  const [customDate, setCustomDate] = useState(getLocalDateString(0));
  const [historyLocations, setHistoryLocations] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState('');

  // History playback
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 1x, 2x, 5x
  const playbackTimerRef = useRef(null);

  // Sync initial live/alerts data
  useEffect(() => {
    setLive(data.live || []);
    setAlerts(data.alerts || []);
  }, [data]);

  // Set default selected user
  useEffect(() => {
    if (data.users && data.users.length > 0 && !selectedUserId) {
      // Find first user with guard or supervisor role
      const firstGuard = data.users.find(u => u.role === 'guard' || u.role === 'supervisor');
      if (firstGuard) {
        setSelectedUserId(firstGuard.id);
      } else {
        setSelectedUserId(data.users[0].id);
      }
    }
  }, [data.users, selectedUserId]);

  // Live WebSockets connection
  useEffect(() => {
    const wsUrl = (import.meta.env.VITE_API_BASE_URL_OPERATIONS || 'https://ms-security-gateway.onrender.com').replace(/^http/, 'ws') + '/ws/tracking';
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

  // Fetch History method
  const handleFetchHistory = async () => {
    if (!selectedUserId || !token) return;
    setIsLoadingHistory(true);
    setHistoryError('');
    setIsPlaying(false);
    setPlaybackIndex(0);

    let queryDate = '';
    if (selectedDateType === 'today') {
      queryDate = getLocalDateString(0);
    } else if (selectedDateType === 'yesterday') {
      queryDate = getLocalDateString(1);
    } else {
      queryDate = customDate;
    }

    try {
      const result = await getTrackingHistory(token, selectedUserId, queryDate);
      // Backend returns desc. Reverse to make it chronological (oldest to newest)
      const chronologically = [...result].reverse();
      setHistoryLocations(chronologically);
      setPlaybackIndex(chronologically.length > 0 ? chronologically.length - 1 : 0);
      if (chronologically.length === 0) {
        setHistoryError('No tracking points found for the selected date.');
      }
    } catch (err) {
      setHistoryError(err.message || 'Failed to load tracking history.');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Autoplay handler
  useEffect(() => {
    if (isPlaying) {
      const intervalTime = 1000 / playbackSpeed;
      playbackTimerRef.current = setInterval(() => {
        setPlaybackIndex((prevIndex) => {
          if (prevIndex >= historyLocations.length - 1) {
            setIsPlaying(false);
            return prevIndex;
          }
          return prevIndex + 1;
        });
      }, intervalTime);
    } else {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
      }
    }

    return () => {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
      }
    };
  }, [isPlaying, playbackSpeed, historyLocations]);

  // Center mapping
  const mapCenter = useMemo(() => {
    if (viewMode === 'history' && historyLocations.length > 0) {
      const activeLoc = historyLocations[playbackIndex] || historyLocations[0];
      return [activeLoc.latitude, activeLoc.longitude];
    }
    const firstLive = live.find((item) => item.latitude && item.longitude);
    if (firstLive) {
      return [firstLive.latitude, firstLive.longitude];
    }
    return [28.6139, 77.209];
  }, [viewMode, live, historyLocations, playbackIndex]);

  // Timeline & Stop Calculations
  const timelineEvents = useMemo(() => {
    if (historyLocations.length === 0) return [];
    
    const events = [];
    let currentStopStart = historyLocations[0];
    let stopDurationMin = 0;

    for (let i = 1; i < historyLocations.length; i++) {
      const prev = historyLocations[i - 1];
      const curr = historyLocations[i];
      const dist = calculateDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
      const timeDiffMs = new Date(curr.recorded_at) - new Date(prev.recorded_at);
      const timeDiffMin = timeDiffMs / 60000;

      // If moved less than 15 meters, we consider it the same stop/location
      if (dist < 15) {
        stopDurationMin += timeDiffMin;
      } else {
        // Complete current stop event if it was significant (at least 2 mins)
        events.push({
          type: 'stop',
          lat: currentStopStart.latitude,
          lng: currentStopStart.longitude,
          time: new Date(currentStopStart.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          duration: Math.round(stopDurationMin + timeDiffMin),
          recorded_at: currentStopStart.recorded_at,
          index: i - 1
        });
        
        // Travel event
        events.push({
          type: 'travel',
          distance: Math.round(dist),
          duration: Math.round(timeDiffMin),
          time: new Date(prev.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          index: i
        });

        currentStopStart = curr;
        stopDurationMin = 0;
      }
    }

    // Push the final location state
    const lastPoint = historyLocations[historyLocations.length - 1];
    events.push({
      type: 'stop',
      lat: lastPoint.latitude,
      lng: lastPoint.longitude,
      time: new Date(lastPoint.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      duration: Math.round(stopDurationMin),
      recorded_at: lastPoint.recorded_at,
      index: historyLocations.length - 1
    });

    return events;
  }, [historyLocations]);

  const outOfRadiusCount = live.filter((item) => item.status === 'out_of_radius').length;
  const idleCount = live.filter((item) => item.status === 'idle').length;

  return (
    <div className="relative h-[calc(100vh-112px)] rounded-2xl overflow-hidden -mx-4 -mb-4 lg:mx-0 lg:mb-0 flex">
      {/* Map Area */}
      <div className="flex-1 h-full relative z-0">
        <MapContainer center={mapCenter} zoom={14} className="w-full h-full" zoomControl={false} style={{ background: '#0a0c10' }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; <a href="https://carto.com/">Carto</a>' />
          
          {viewMode === 'live' && (
            <>
              {live.map((guard, index) => (
                <Marker key={`guard-${guard.id || index}`} position={[guard.latitude || mapCenter[0], guard.longitude || mapCenter[1]]} icon={guardIcon}>
                  <Popup>
                    <div className="p-2 text-on-surface">
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
                    <div className="p-2 text-on-surface">
                      <h4 className="font-bold text-error">{alert.title || 'Critical Alert'}</h4>
                      <p className="text-sm">{alert.description || 'Review required'}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </>
          )}

          {viewMode === 'history' && historyLocations.length > 0 && (
            <>
              {/* Route Trail */}
              <Polyline 
                positions={historyLocations.map(loc => [loc.latitude, loc.longitude])} 
                pathOptions={{ color: '#0058be', weight: 4, opacity: 0.8, dashArray: '5, 8' }} 
              />
              
              {/* Path Dot Markers */}
              {historyLocations.map((loc, idx) => (
                <CircleMarker 
                  key={`history-dot-${idx}`} 
                  center={[loc.latitude, loc.longitude]} 
                  radius={idx === playbackIndex ? 8 : 4} 
                  pathOptions={{ 
                    color: idx === playbackIndex ? '#4caf50' : '#ff9800', 
                    fillColor: idx === playbackIndex ? '#c8e6c9' : '#ffe0b2',
                    fillOpacity: 0.9 
                  }}
                >
                  <Popup>
                    <div className="p-2 text-on-surface">
                      <p className="font-bold">Point {idx + 1}</p>
                      <p className="text-sm">Time: {new Date(loc.recorded_at).toLocaleTimeString()}</p>
                      <p className="text-sm">Battery: {loc.battery_level}%</p>
                      <p className="text-sm">Status: {loc.status}</p>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}

              {/* Active Replay Position Marker */}
              {historyLocations[playbackIndex] && (
                <Marker 
                  position={[historyLocations[playbackIndex].latitude, historyLocations[playbackIndex].longitude]} 
                  icon={historyIcon}
                >
                  <Popup>
                    <div className="p-2 text-on-surface">
                      <h4 className="font-bold text-success">Replay Position</h4>
                      <p className="text-sm">Time: {new Date(historyLocations[playbackIndex].recorded_at).toLocaleTimeString()}</p>
                      <p className="text-sm">Battery: {historyLocations[playbackIndex].battery_level}%</p>
                    </div>
                  </Popup>
                </Marker>
              )}
            </>
          )}
        </MapContainer>
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-transparent to-black/40 z-[1000]"></div>
      </div>

      {/* Side Control / Timeline Panel */}
      <div className="w-88 h-full bg-[#0d1117]/95 border-l border-white/10 text-white flex flex-col z-[1001] backdrop-blur-md">
        {/* Toggle tabs */}
        <div className="flex border-b border-white/10">
          <button 
            onClick={() => setViewMode('live')}
            className={`flex-1 py-4 font-bold text-center border-b-2 transition-colors ${viewMode === 'live' ? 'border-primary text-primary' : 'border-transparent text-white/60 hover:text-white'}`}
          >
            Live Tracking
          </button>
          <button 
            onClick={() => setViewMode('history')}
            className={`flex-1 py-4 font-bold text-center border-b-2 transition-colors ${viewMode === 'history' ? 'border-primary text-primary' : 'border-transparent text-white/60 hover:text-white'}`}
          >
            Route Replay
          </button>
        </div>

        {/* Live Panel Content */}
        {viewMode === 'live' && (
          <div className="flex-1 flex flex-col overflow-hidden p-4 space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-title-md">Deployment Overview</h3>
                <span className="px-2 py-0.5 bg-primary/20 text-primary rounded text-xs font-bold">{live.length} ONLINE</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                  <p className="text-white/60 text-xs">Open Alerts</p>
                  <p className="text-red-400 text-lg font-bold">{alerts.length}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                  <p className="text-white/60 text-xs">Outside Radius</p>
                  <p className="text-amber-400 text-lg font-bold">{outOfRadiusCount}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-2 border border-white/5 col-span-2">
                  <p className="text-white/60 text-xs">Idle Staff</p>
                  <p className="text-white text-lg font-bold">{idleCount}</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1" style={{ scrollbarWidth: 'thin' }}>
              {live.map((guard, index) => (
                <div key={guard.id || index} className="bg-white/5 border border-white/10 rounded-xl p-3 hover:bg-white/10 transition-colors">
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full border border-primary/40 bg-[#161b22] flex items-center justify-center overflow-hidden">
                        {guard.photo_url ? (
                          <img src={guard.photo_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="material-symbols-outlined text-white/60">person</span>
                        )}
                      </div>
                      <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border border-[#0d1117] ${guard.status === 'out_of_radius' ? 'bg-red-500' : guard.status === 'idle' ? 'bg-amber-400' : 'bg-green-500'}`}></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-white font-bold text-sm truncate">{guard.name || 'Staff Member'}</h4>
                      <p className="text-white/40 text-xs truncate uppercase tracking-widest">{guard.site_name || 'UNASSIGNED'}</p>
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-white/60">
                    <span>Status: <strong className="text-white capitalize">{String(guard.status || 'active').replaceAll('_', ' ')}</strong></span>
                    <span>Distance: <strong className="text-primary">{Math.round(guard.distance_meters || 0)}m</strong></span>
                  </div>
                </div>
              ))}
              {live.length === 0 && (
                <div className="text-white/40 text-center py-8 text-sm">No live tracking stream updates.</div>
              )}
            </div>

            <div className="bg-white/5 border border-white/10 p-3 rounded-xl flex items-center justify-center space-x-2">
              <span className="material-symbols-outlined text-[18px] animate-spin text-primary">sync</span>
              <span className="text-xs text-white/80 font-medium">Realtime stream active</span>
            </div>
          </div>
        )}

        {/* History Panel Content */}
        {viewMode === 'history' && (
          <div className="flex-1 flex flex-col overflow-hidden p-4 space-y-4">
            {/* Filter controls */}
            <div className="space-y-3 bg-white/5 p-3 rounded-xl border border-white/10">
              <div>
                <label className="block text-xs font-bold text-white/60 mb-1">Select Employee</label>
                <select 
                  value={selectedUserId} 
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full h-10 px-3 bg-[#161b22] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {data.users.map(u => (
                    <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-white/60 mb-1">Select Date</label>
                <div className="grid grid-cols-3 gap-1">
                  {['today', 'yesterday', 'custom'].map((dt) => (
                    <button
                      key={dt}
                      onClick={() => setSelectedDateType(dt)}
                      className={`h-8 rounded-lg text-xs font-bold capitalize transition-colors ${selectedDateType === dt ? 'bg-primary text-white' : 'bg-[#161b22] text-white/60 hover:text-white'}`}
                    >
                      {dt}
                    </button>
                  ))}
                </div>
              </div>

              {selectedDateType === 'custom' && (
                <div>
                  <input 
                    type="date" 
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full h-10 px-3 bg-[#161b22] border border-white/10 rounded-lg text-sm text-white focus:outline-none"
                  />
                </div>
              )}

              <button
                onClick={handleFetchHistory}
                disabled={isLoadingHistory || !selectedUserId}
                className="w-full h-10 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white rounded-lg font-bold text-sm transition-all flex items-center justify-center space-x-2"
              >
                {isLoadingHistory ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">history</span>
                    <span>Query History</span>
                  </>
                )}
              </button>
            </div>

            {/* Error or Alert messages */}
            {historyError && (
              <div className="bg-red-900/20 border border-red-500/30 text-red-300 p-3 rounded-lg text-xs text-center">
                {historyError}
              </div>
            )}

            {/* Replay Player Controls */}
            {historyLocations.length > 0 && (
              <div className="bg-[#161b22] p-3 rounded-xl border border-white/10 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-white/60">Playback Progress</span>
                  <span>{playbackIndex + 1} / {historyLocations.length} points</span>
                </div>
                
                <input 
                  type="range" 
                  min="0" 
                  max={historyLocations.length - 1} 
                  value={playbackIndex}
                  onChange={(e) => setPlaybackIndex(parseInt(e.target.value))}
                  className="w-full accent-primary bg-white/10 rounded-lg appearance-none h-1.5 cursor-pointer"
                />

                <div className="flex justify-between items-center">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center hover:bg-primary-dark transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {isPlaying ? 'pause' : 'play_arrow'}
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        setIsPlaying(false);
                        setPlaybackIndex(0);
                      }}
                      className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px]">stop</span>
                    </button>
                  </div>

                  <div className="flex space-x-1">
                    {[1, 2, 5].map((speed) => (
                      <button
                        key={speed}
                        onClick={() => setPlaybackSpeed(speed)}
                        className={`px-2 py-1 rounded text-xs font-bold transition-colors ${playbackSpeed === speed ? 'bg-primary text-white' : 'bg-white/10 text-white/60 hover:text-white'}`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Timeline */}
            {historyLocations.length > 0 && (
              <div className="flex-1 overflow-hidden flex flex-col">
                <h4 className="text-xs font-bold text-white/60 mb-2">Duty Timeline Events</h4>
                <div className="flex-1 overflow-y-auto space-y-3 pr-1" style={{ scrollbarWidth: 'thin' }}>
                  {timelineEvents.map((event, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => setPlaybackIndex(event.index)}
                      className={`cursor-pointer p-3 rounded-lg border transition-all ${playbackIndex === event.index ? 'bg-primary/20 border-primary' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold text-white/80 flex items-center space-x-1">
                          <span className={`w-2 h-2 rounded-full ${event.type === 'stop' ? 'bg-green-500' : 'bg-amber-500'}`}></span>
                          <span>{event.type === 'stop' ? 'Stationary Stop' : 'Movement Segment'}</span>
                        </span>
                        <span className="text-[10px] text-white/40">{event.time}</span>
                      </div>
                      
                      {event.type === 'stop' ? (
                        <p className="text-xs text-white/60">
                          Idle duration: <strong className="text-white">{event.duration} mins</strong> at coordinate point.
                        </p>
                      ) : (
                        <p className="text-xs text-white/60">
                          Traveled <strong className="text-primary">{event.distance}m</strong> in {event.duration} mins.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {historyLocations.length === 0 && !isLoadingHistory && (
              <div className="flex-1 flex flex-col items-center justify-center text-white/40 text-center py-12">
                <span className="material-symbols-outlined text-[48px] opacity-40 mb-2">map</span>
                <p className="text-sm">Query a route history to visualize historical movement replay.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
