(() => {
  let map = null;
  let markers = new Map();
  let liveRef = null;
  let lastLocations = {};

  function ensureMap() {
    const element = document.getElementById('managementMap');
    if (!element || !window.L || map) return;
    map = L.map(element).setView([23.2599, 77.4126], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    setTimeout(() => map?.invalidateSize(), 180);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function render(locations) {
    if (!map) return;
    const activeKeys = new Set();
    Object.entries(locations || {}).forEach(([routeId, item]) => {
      if (!item || !item.active || !Number.isFinite(Number(item.lat)) || !Number.isFinite(Number(item.lng))) return;
      if (Date.now() - Number(item.updatedAt || 0) > 90000) return;
      activeKeys.add(routeId);
      const point = [Number(item.lat), Number(item.lng)];
      let marker = markers.get(routeId);
      if (!marker) {
        marker = L.marker(point).addTo(map);
        markers.set(routeId, marker);
      } else marker.setLatLng(point);
      marker.bindPopup(`<strong>${escapeHtml(item.busNumber || 'Bus')}</strong><br>Route: ${escapeHtml(routeId)}<br>Driver: ${escapeHtml(item.driverName || 'Driver')}<br>Updated: ${new Date(Number(item.updatedAt)).toLocaleTimeString()}`);
    });
    for (const [routeId, marker] of markers) {
      if (!activeKeys.has(routeId)) {
        map.removeLayer(marker);
        markers.delete(routeId);
      }
    }
    if (activeKeys.size) {
      const points = [...markers.values()].map(marker => marker.getLatLng());
      if (points.length === 1) map.setView(points[0], 14);
      else map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 14 });
    }
  }

  function connect() {
    if (!window.database || liveRef) return;
    liveRef = window.database.ref('liveLocations');
    liveRef.on('value', snapshot => {
      lastLocations = snapshot.val() || {};
      if (map) render(lastLocations);
    }, error => console.error('[WIMB management map] GPS read failed:', error));
  }

  function refresh() {
    const page = document.getElementById('mapPage');
    if (!page || !page.classList.contains('active-page')) return;
    ensureMap();
    if (map) {
      setTimeout(() => { map.invalidateSize(); render(lastLocations); }, 160);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    connect();
    const app = document.getElementById('managementApp');
    if (app) new MutationObserver(refresh).observe(app, { attributes: true, attributeFilter: ['class'] });
    document.querySelectorAll('[data-page="mapPage"]').forEach(button => button.addEventListener('click', () => setTimeout(refresh, 100)));
    window.addEventListener('resize', () => map?.invalidateSize());
  });
})();
