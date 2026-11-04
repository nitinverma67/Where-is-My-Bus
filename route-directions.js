/* Road-following route geometry shared by all portals.
   Uses the public OSRM routing service; the original stop coordinates remain
   untouched in data.js and Firebase. Results are cached for this page session. */
(() => {
  const cache = new Map();
  window.WIMBRoadRoute = async function (latLngPath) {
    if (!Array.isArray(latLngPath) || latLngPath.length < 2) return latLngPath || [];
    const key = latLngPath.map(p => `${Number(p[0]).toFixed(5)},${Number(p[1]).toFixed(5)}`).join(';');
    if (cache.has(key)) return cache.get(key);
    const coordinates = latLngPath.map(([lat, lng]) => `${Number(lng)},${Number(lat)}`).join(';');
    const request = fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`)
      .then(response => {
        if (!response.ok) throw new Error(`Routing service returned ${response.status}`);
        return response.json();
      })
      .then(data => {
        const points = data?.routes?.[0]?.geometry?.coordinates;
        if (!Array.isArray(points) || !points.length) throw new Error('No road route found');
        return points.map(([lng, lat]) => [lat, lng]);
      });
    cache.set(key, request);
    try { return await request; }
    catch (error) {
      cache.delete(key);
      console.warn('[WIMB map] Road routing unavailable; displaying the route stop path.', error);
      return latLngPath;
    }
  };
})();
