/* Where Is My Bus: road routing, landmark lookup and GPS helpers. */
(function () {
  'use strict';

  const ROUTE_CACHE_PREFIX = 'wimb_road_route_v1_';

  function validPoints(points) {
    return (points || []).filter(point => Array.isArray(point) &&
      Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])));
  }

  async function getRoadRoute(points) {
    const clean = validPoints(points);
    if (clean.length < 2) return null;

    const key = ROUTE_CACHE_PREFIX + clean.map(p => p.map(n => Number(n).toFixed(5)).join(',')).join('|');
    try {
      const cached = sessionStorage.getItem(key);
      if (cached) return JSON.parse(cached);
    } catch (_) {}

    // OSRM's public demo server accepts ordered route waypoints, not arbitrary bus schedules.
    const coordinates = clean.slice(0, 90).map(([lat, lng]) => `${lng},${lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Road routing service returned ${response.status}`);
    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes?.[0]?.geometry?.coordinates?.length) {
      throw new Error('No drivable road route was returned for these stops.');
    }
    const result = {
      path: data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distanceKm: data.routes[0].distance / 1000,
      durationMinutes: data.routes[0].duration / 60,
      source: 'OSRM / OpenStreetMap'
    };
    try { sessionStorage.setItem(key, JSON.stringify(result)); } catch (_) {}
    return result;
  }

  function nearestPointOnPath(point, path) {
    if (!path?.length) return null;
    if (path.length === 1) return { lat: path[0][0], lng: path[0][1], distanceMeters: 0 };
    const lat = Number(point.lat), lng = Number(point.lng);
    const cos = Math.cos(lat * Math.PI / 180);
    let best = null;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const ax = a[1] * cos, ay = a[0], bx = b[1] * cos, by = b[0];
      const px = lng * cos, py = lat;
      const dx = bx - ax, dy = by - ay;
      const den = dx * dx + dy * dy;
      const t = den ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / den)) : 0;
      const candidateLat = ay + t * dy;
      const candidateLng = (ax + t * dx) / (cos || 1);
      const dLat = (candidateLat - lat) * 111320;
      const dLng = (candidateLng - lng) * 111320 * cos;
      const distanceMeters = Math.hypot(dLat, dLng);
      if (!best || distanceMeters < best.distanceMeters) {
        best = { lat: candidateLat, lng: candidateLng, distanceMeters };
      }
    }
    return best;
  }

  async function getPopularLandmarks(path) {
    if (!path?.length) return [];
    const lats = path.map(p => p[0]), lngs = path.map(p => p[1]);
    const south = Math.min(...lats) - 0.004, north = Math.max(...lats) + 0.004;
    const west = Math.min(...lngs) - 0.004, east = Math.max(...lngs) + 0.004;
    const query = `[out:json][timeout:20];(node[amenity~"^(hospital|college|university|bus_station|fuel|police|marketplace)$"](${south},${west},${north},${east});way[amenity~"^(hospital|college|university|bus_station|marketplace)$"](${south},${west},${north},${east});node[tourism~"^(attraction|museum)$"](${south},${west},${north},${east});node[public_transport=station](${south},${west},${north},${east});node[railway=station](${south},${west},${north},${east}););out center 60;`;
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: 'data=' + encodeURIComponent(query)
    });
    if (!response.ok) throw new Error('Landmark service is temporarily unavailable.');
    const data = await response.json();
    return (data.elements || []).map(item => ({
      name: item.tags?.name,
      lat: item.lat ?? item.center?.lat,
      lng: item.lon ?? item.center?.lon,
      type: item.tags?.amenity || item.tags?.tourism || item.tags?.railway || 'landmark'
    })).filter(item => item.name && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng)))
      .filter(item => {
        const nearest = nearestPointOnPath({ lat: Number(item.lat), lng: Number(item.lng) }, path);
        return nearest && nearest.distanceMeters <= 450;
      }).slice(0, 35);
  }

  window.WIMBMapServices = { getRoadRoute, nearestPointOnPath, getPopularLandmarks };
})();
