import { useState, useEffect, useMemo } from 'react';
import { getMediaGallery } from '../api';

export function MediaCenterView() {
  const [auth] = useState(() => JSON.parse(localStorage.getItem('ms-owner-auth')));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [gallery, setGallery] = useState([]);
  
  // Filtering states
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [filterRole, setFilterRole] = useState('All');

  // Lightbox state
  const [previewMedia, setPreviewMedia] = useState(null);

  useEffect(() => {
    async function fetchGallery() {
      if (!auth?.token) return;
      try {
        setLoading(true);
        const data = await getMediaGallery(auth.token, 1000);
        setGallery(data);
      } catch (err) {
        setError(err.message || 'Failed to load media gallery');
      } finally {
        setLoading(false);
      }
    }
    fetchGallery();
  }, [auth]);

  const allTypes = useMemo(() => {
    const types = new Set(gallery.map(m => m.type));
    return ['All', ...Array.from(types).sort()];
  }, [gallery]);

  const allRoles = useMemo(() => {
    const roles = new Set(gallery.map(m => String(m.role || 'Unknown').toLowerCase()));
    return ['All', ...Array.from(roles).sort()];
  }, [gallery]);

  const filteredGallery = useMemo(() => {
    return gallery.filter(item => {
      // Search
      if (query) {
        const q = query.toLowerCase();
        const matchesQuery = 
          (item.employee_name && item.employee_name.toLowerCase().includes(q)) ||
          (item.employee_id && item.employee_id.toLowerCase().includes(q)) ||
          (item.site_name && item.site_name.toLowerCase().includes(q));
        if (!matchesQuery) return false;
      }
      // Filter Type
      if (filterType !== 'All' && item.type !== filterType) return false;
      // Filter Role
      if (filterRole !== 'All' && String(item.role || '').toLowerCase() !== filterRole) return false;
      
      return true;
    });
  }, [gallery, query, filterType, filterRole]);

  if (loading && gallery.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-title-lg font-bold text-on-surface">Media Center</h2>
          <p className="text-on-surface-variant font-body-md">Unified view of all employee photos, documents, and attendance selfies.</p>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <select 
            value={filterRole}
            onChange={e => setFilterRole(e.target.value)}
            className="px-3 py-2 bg-surface-container-low rounded-lg border-none focus:ring-2 ring-primary/20 outline-none text-body-sm"
          >
            {allRoles.map(r => (
              <option key={r} value={r}>{r === 'All' ? 'All Roles' : r}</option>
            ))}
          </select>
          <select 
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="px-3 py-2 bg-surface-container-low rounded-lg border-none focus:ring-2 ring-primary/20 outline-none text-body-sm"
          >
            {allTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
            <input 
              type="text" 
              placeholder="Search by name, ID or site..." 
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="pl-9 pr-3 py-2 bg-surface-container-low rounded-lg border-none focus:ring-2 ring-primary/20 outline-none text-body-sm w-64"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-error/10 border border-error/20 text-error rounded-xl font-body-md">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filteredGallery.map(media => (
          <div key={media.id} className="glass-card rounded-xl overflow-hidden group cursor-pointer" onClick={() => setPreviewMedia(media)}>
            <div className="relative aspect-square overflow-hidden bg-surface-container-highest">
              <img 
                src={media.url} 
                alt={media.type} 
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
                onError={(e) => { e.target.onerror = null; e.target.src = '/placeholder-image.png'; }}
              />
              <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">
                {media.type}
              </div>
            </div>
            <div className="p-3">
              <p className="font-label-md font-bold text-on-surface truncate" title={media.employee_name}>{media.employee_name}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-on-surface-variant font-medium truncate">{media.employee_id}</span>
                <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded uppercase font-bold">{media.role}</span>
              </div>
              <div className="flex items-center mt-2 text-[10px] text-on-surface-variant">
                <span className="material-symbols-outlined text-[12px] mr-1">location_on</span>
                <span className="truncate">{media.site_name}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {filteredGallery.length === 0 && !loading && (
        <div className="text-center py-12 text-on-surface-variant">
          <span className="material-symbols-outlined text-[48px] opacity-20 mb-4">image_not_supported</span>
          <p className="font-body-lg">No media found matching your filters.</p>
        </div>
      )}

      {/* Lightbox Preview */}
      {previewMedia && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col" onClick={() => setPreviewMedia(null)}>
          <div className="flex justify-between items-center p-4">
            <div className="text-white">
              <h3 className="font-title-md font-bold">{previewMedia.employee_name} ({previewMedia.employee_id})</h3>
              <p className="text-white/70 text-sm">{previewMedia.type} • {previewMedia.site_name} • {new Date(previewMedia.uploaded_at).toLocaleString()}</p>
            </div>
            <button className="p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10" onClick={() => setPreviewMedia(null)}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="flex-1 flex justify-center items-center p-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <img 
              src={previewMedia.url} 
              alt={previewMedia.type} 
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          </div>
          <div className="p-4 flex justify-center gap-4">
            <a 
              href={previewMedia.url} 
              target="_blank" 
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark"
            >
              <span className="material-symbols-outlined text-[20px]">download</span>
              Download Original
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
