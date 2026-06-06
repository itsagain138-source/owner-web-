import React, { useState, useEffect } from 'react';
import { getMediaStats, getMediaList, deleteMedia } from '../api';

export default function MediaManager({ token }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [viewingType, setViewingType] = useState(null);
  const [mediaList, setMediaList] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    loadStats();
  }, [token]);

  const loadStats = async () => {
    try {
      setLoading(true);
      const data = await getMediaStats(token);
      setStats(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadMediaList = async (type) => {
    try {
      setListLoading(true);
      setViewingType(type);
      setSelectedKeys(new Set());
      const data = await getMediaList(token, type);
      setMediaList(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setListLoading(false);
    }
  };

  const toggleSelect = (key) => {
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedKeys(next);
  };

  const selectAll = () => {
    if (selectedKeys.size === mediaList.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(mediaList.map(m => m.key)));
    }
  };

  const handleDelete = async (keys) => {
    if (!window.confirm(`Are you sure you want to delete ${keys.length} items?`)) return;
    try {
      setListLoading(true);
      await deleteMedia(token, viewingType, keys);
      setSelectedKeys(new Set());
      await loadStats();
      if (viewingType) await loadMediaList(viewingType);
    } catch (err) {
      alert('Delete failed: ' + err.message);
    } finally {
      setListLoading(false);
    }
  };

  if (loading) return <div className="text-on-surface p-4">Loading media...</div>;
  if (error) return <div className="p-4 bg-error/10 text-error rounded-xl">{error}</div>;
  if (!stats) return null;

  return (
    <div>
      <h3 className="font-title-lg font-bold text-on-surface mb-6">Media Manager</h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Attendance', key: 'attendance', count: stats.attendance_photos_count || 0 },
          { label: 'Documents', key: 'documents', count: stats.documents_count || 0 },
          { label: 'Profile', key: 'login-selfies', count: stats.profile_photos_count || 0 }
        ].map(cat => (
          <div 
            key={cat.key} 
            className="p-4 rounded-xl border border-on-surface/10 bg-surface-container-low cursor-pointer hover:bg-surface-container transition-colors"
            onClick={() => loadMediaList(cat.key)}
          >
            <div className="text-on-surface-variant font-label-sm uppercase tracking-wider">{cat.label}</div>
            <h2 className="text-display-sm font-bold text-on-surface mt-2">{cat.count}</h2>
            {viewingType === cat.key && <div className="mt-2 text-primary font-label-sm">Viewing Now</div>}
          </div>
        ))}
      </div>

      {viewingType && (
        <div className="rounded-xl border border-on-surface/10 overflow-hidden bg-surface-container-lowest">
          <div className="flex justify-between items-center p-4 border-b border-on-surface/10 bg-surface-container-low">
            <span className="font-title-md font-bold text-on-surface uppercase">{viewingType} Media</span>
            {selectedKeys.size > 0 && (
              <button 
                className="px-4 py-2 bg-error text-white rounded-lg font-label-md"
                onClick={() => handleDelete(Array.from(selectedKeys))}
              >
                Delete Selected ({selectedKeys.size})
              </button>
            )}
          </div>
          <div className="p-0">
            {listLoading ? (
              <div className="p-6 text-center text-on-surface-variant">Loading items...</div>
            ) : mediaList.length === 0 ? (
              <div className="p-6 text-center text-on-surface-variant">No media found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-on-surface/10 text-on-surface-variant font-label-sm">
                      <th className="p-3 w-12 text-center">
                        <input type="checkbox" className="rounded border-on-surface/30"
                          checked={selectedKeys.size === mediaList.length && mediaList.length > 0} 
                          onChange={selectAll} 
                        />
                      </th>
                      <th className="p-3">Preview</th>
                      <th className="p-3">File Key</th>
                      <th className="p-3">Size</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mediaList.map(item => (
                      <tr 
                        key={item.key} 
                        onClick={() => toggleSelect(item.key)} 
                        className="border-b border-on-surface/5 hover:bg-surface-container-low cursor-pointer transition-colors text-body-md text-on-surface"
                      >
                        <td className="p-3 text-center">
                          <input type="checkbox" className="rounded border-on-surface/30"
                            checked={selectedKeys.has(item.key)} readOnly />
                        </td>
                        <td className="p-3">
                          <div 
                            className="w-10 h-10 bg-cover bg-center rounded overflow-hidden shadow-sm"
                            style={{ backgroundImage: `url(${item.url})` }}
                            onClick={(e) => { e.stopPropagation(); setPreviewUrl(item.url); }}
                          />
                        </td>
                        <td className="p-3 max-w-[200px] truncate" title={item.key}>{item.key}</td>
                        <td className="p-3">{(item.size / 1024).toFixed(1)} KB</td>
                        <td className="p-3 text-right">
                          <button 
                            className="p-2 text-error hover:bg-error/10 rounded transition-colors"
                            onClick={(e) => { e.stopPropagation(); handleDelete([item.key]); }}
                          >
                            <span className="material-symbols-outlined text-[20px]">delete</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Image Preview Modal overlay */}
      {previewUrl && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="relative max-w-4xl max-h-screen">
            <button 
              className="absolute -top-12 right-0 text-white p-2 hover:bg-white/20 rounded-full transition-colors"
              onClick={() => setPreviewUrl(null)}
            >
              <span className="material-symbols-outlined text-[32px]">close</span>
            </button>
            <img src={previewUrl} className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" alt="Preview" />
          </div>
        </div>
      )}
    </div>
  );
}
