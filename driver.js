
(() => {
  const $ = selector => document.querySelector(selector);
  const PORTAL_ROLE = 'driver';

  const DB_KEYS = {
    pickups: 'wimb_demo_pickups_v2',
    notices: 'wimb_demo_notices_v2',
    session: 'wimb_demo_session_v2',
    management: 'wimb_management_data_v1'
  };

  function loadAppData() {
    try {
      const saved = JSON.parse(
        localStorage.getItem(DB_KEYS.management) || 'null'
      );

      if (saved && Array.isArray(saved.routes) && Array.isArray(saved.buses)) {
        return saved;
      }
    } catch (error) {
      console.error('Could not load management data:', error);
    }

    return window.APP_DATA || {};
  }

  const appData = loadAppData();
  const buses = appData.buses || [];
  const routes = appData.routes || [];
  const drivers = appData.drivers || [];

  const demoUsers = {
    student: {
      username: 'student',
      password: 'student123',
      role: 'student',
      name: 'Demo Student',
      routeId: null
    },
    driver: {
      username: 'driver',
      password: 'driver123',
      role: 'driver',
      name: 'Rajesh Sharma',
      routeId: null
    }
  };

  let currentUser = null;
  let selectedRouteId = null;

  let studentMap = null;
  let driverMap = null;
  let studentRouteLine = null;
  let driverRouteLine = null;
  let studentStopsLayer = null;
  let studentPickupLayer = null;
  let driverPickupsLayer = null;
  let pickupMarker = null;
  let draftPoint = null;

  function read(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function show(element, visible) {
    if (element) {
      element.classList.toggle('hidden', !visible);
    }
  }

  function routeById(id) {
    return routes.find(route => String(route.id) === String(id)) || null;
  }

  function getBusForRoute(route) {
    if (!route) return null;

    return buses.find(bus =>
      String(bus.id) === String(route.assignedBusId) ||
      String(bus.assignedRouteId) === String(route.id)
    ) || null;
  }

  function getRouteForBus(bus) {
    if (!bus) return null;

    return routes.find(route =>
      String(route.id) === String(bus.assignedRouteId) ||
      String(route.assignedBusId) === String(bus.id)
    ) || null;
  }

  function getRouteForUser() {
    if (!currentUser) return null;

    const directRoute = routeById(currentUser.routeId);
    if (directRoute) return directRoute;

    const assignedBus = buses.find(bus =>
      String(bus.assignedDriverId) === String(currentUser.driverId) ||
      String(bus.assignedDriverId) === String(currentUser.username)
    );

    return getRouteForBus(assignedBus);
  }

  function getRouteDisplayName(route) {
    if (!route) return 'Route not available';

    return route.routeName ||
      `${route.startPoint || 'Start'} ⇄ ${route.destination || 'Destination'}`;
  }

  function getRouteStops(route) {
    return (route?.stops || [])
      .slice()
      .sort((a, b) =>
        Number(a.sequenceOrder || 0) - Number(b.sequenceOrder || 0)
      );
  }

  function getRoutePath(route) {
    return getRouteStops(route)
      .filter(stop =>
        stop.lat != null &&
        stop.lng != null &&
        Number.isFinite(Number(stop.lat)) &&
        Number.isFinite(Number(stop.lng))
      )
      .map(stop => [Number(stop.lat), Number(stop.lng)]);
  }

  function getDriverForRoute(route) {
    const bus = getBusForRoute(route);
    if (!bus) return null;

    return drivers.find(driver =>
      String(driver.id) === String(bus.assignedDriverId)
    ) || null;
  }

  function getDriverName(route) {
    const driver = getDriverForRoute(route);

    if (driver) {
      return driver.name || driver.driverName || 'Driver name unavailable';
    }

    if (
      currentUser?.role === 'driver' &&
      String(currentUser.routeId) === String(route?.id)
    ) {
      return currentUser.name;
    }

    return 'Not available in data.js';
  }

  function getDriverPhone(route) {
    const driver = getDriverForRoute(route);

    return driver?.phone ||
      driver?.phoneNumber ||
      driver?.contact ||
      '';
  }

  // Search route names, places, stops, landmarks, and bus numbers.
  function searchRoutes(query) {
    const search = query.trim().toLowerCase();
    if (!search) return [];

    return routes.filter(route => {
      const bus = getBusForRoute(route);

      const searchableParts = [
        route.routeCode,
        route.routeName,
        route.startPoint,
        route.destination,
        bus?.busNumber,
        bus?.model,
        ...getRouteStops(route).flatMap(stop => [
          stop.name,
          stop.landmark
        ])
      ];

      const searchableText = searchableParts
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(search);
    });
  }

  function renderRouteResults(query = '') {
    const container = $('#routeResults');
    if (!container) return;

    if (!query.trim()) {
      container.innerHTML =
        '<p class="empty">Search a place, such as Berasia, Fanda, Sehore, or Bhopal, to find buses serving that area.</p>';
      return;
    }

    const matchingRoutes = searchRoutes(query);

    if (!matchingRoutes.length) {
      container.innerHTML =
        '<p class="empty">No matching buses found. Check the spelling or try a stop name or landmark.</p>';
      return;
    }

    container.innerHTML = matchingRoutes.map(route => {
      const bus = getBusForRoute(route);
      const selected = String(route.id) === String(selectedRouteId);

      return `
        <article class="route-result">
          <h3>${esc(route.routeCode || 'Bus route')}</h3>
          <p>${esc(getRouteDisplayName(route))}</p>
          <p>Bus: ${esc(bus?.busNumber || 'Not assigned')}</p>
          <p>Departure: ${esc(route.scheduledStartTime || 'Not set')}</p>
          <p>Arrival: ${esc(route.scheduledArrivalTime || 'Not set')}</p>
          <button type="button" data-route-id="${esc(route.id)}">
            ${selected ? 'Selected bus' : 'Select this bus'}
          </button>
        </article>
      `;
    }).join('');
  }

  function showRouteDetails(routeId) {
    const route = routeById(routeId);
    if (!route) return;

    selectedRouteId = route.id;

    const bus = getBusForRoute(route);
    const driverName = getDriverName(route);
    const driverPhone = getDriverPhone(route);
    const stops = getRouteStops(route);
    const details = $('#routeDetails');

    if (details) {
      details.innerHTML = `
        <div class="panel-heading">
          <div>
            <h2>${esc(getRouteDisplayName(route))}</h2>
            <p class="muted">${esc(route.routeCode || '')} · College bus</p>
          </div>
          <span class="pill blue-pill">Selected</span>
        </div>

        <div class="route-details-grid">
          <div class="detail-item">
            <small>Bus number</small>
            <b>${esc(bus?.busNumber || 'Not assigned')}</b>
          </div>
          <div class="detail-item">
            <small>Bus model</small>
            <b>${esc(bus?.model || 'Not available')}</b>
          </div>
          <div class="detail-item">
            <small>Departure</small>
            <b>${esc(route.scheduledStartTime || 'Not set')}</b>
          </div>
          <div class="detail-item">
            <small>Arrival</small>
            <b>${esc(route.scheduledArrivalTime || 'Not set')}</b>
          </div>
          <div class="detail-item">
            <small>Driver</small>
            <b>${esc(driverName)}</b>
          </div>
          <div class="detail-item">
            <small>Driver contact</small>
            <b>${
              driverPhone
                ? `<a href="tel:${esc(driverPhone.replace(/\s/g, ''))}">${esc(driverPhone)}</a>`
                : 'Not available in data.js'
            }</b>
          </div>
          <div class="detail-item">
            <small>Start point</small>
            <b>${esc(route.startPoint || 'Not specified')}</b>
          </div>
          <div class="detail-item">
            <small>Destination</small>
            <b>${esc(route.destination || 'Not specified')}</b>
          </div>
          <div class="detail-item">
            <small>Total distance</small>
            <b>${route.totalDistanceKm != null ? `${esc(route.totalDistanceKm)} km` : 'Not available'}</b>
          </div>
        </div>

        <h3>Bus stops</h3>
        <div class="stops-list">
          ${stops.length ? stops.map(stop => `
            <div class="stop-item">
              <strong>${esc(stop.name || 'Unnamed stop')}</strong>
              <p>${esc(stop.landmark || '')}</p>
              <span>${esc(stop.scheduledTime || 'Time not set')}</span>
            </div>
          `).join('') : '<p class="empty">No stops available.</p>'}
        </div>
      `;
    }

    renderRouteResults($('#routeSearch')?.value || '');
    renderStudentNotices();
    renderManagementAnnouncements();
    updateStudentMap();
    loadPickupForSelectedRoute();

    if (studentMap) {
      setTimeout(() => studentMap.invalidateSize(), 100);
    }
  }

  function selectStudentRoute(routeId) {
    if (!routeById(routeId)) return;
    showRouteDetails(routeId);
  }

  function renderManagementAnnouncements() {
    const studentContainer = $('#studentManagementNotices');
    const driverContainer = $('#driverManagementNotices');
    const route = currentUser?.role === 'driver'
      ? getRouteForUser()
      : routeById(selectedRouteId);
    const routeId = route?.id ?? selectedRouteId;

    const announcements = read(DB_KEYS.notices)
      .filter(notice => {
        const audience = notice.audience || 'both';
        const audienceMatches = audience === 'both' ||
          (currentUser?.role === 'student' && audience === 'student') ||
          (currentUser?.role === 'driver' && audience === 'driver');
        const routeMatches = !notice.routeId || notice.routeId === 'all' ||
          (routeId != null && String(notice.routeId) === String(routeId));
        // Management-created notices have createdAt; driver alerts have driverName/sender.
        const isManagement = !notice.driverName &&
          (!notice.sender || /management|admin/i.test(notice.sender));
        return isManagement && audienceMatches && routeMatches;
      })
      .slice()
      .reverse();

    const markup = announcements.length
      ? announcements.map(notice => `
          <article class="notice">
            <h3>${esc(notice.title)}</h3>
            <p>${esc(notice.body)}</p>
            <small>Management · ${esc(notice.createdAt || notice.date || '')}</small>
          </article>
        `).join('')
      : '<p class="empty">No management announcements for this route yet.</p>';

    if (studentContainer) {
      studentContainer.innerHTML = routeId == null
        ? '<p class="empty">Select a route to view management announcements.</p>'
        : markup;
    }
    if (driverContainer) driverContainer.innerHTML = markup;
  }

  function renderStudentNotices() {
    const container = $('#studentNotices');
    if (!container || !selectedRouteId) return;

    const notices = read(DB_KEYS.notices)
      .filter(notice =>
        (String(notice.routeId) === String(selectedRouteId) ||
          notice.routeId === 'all') &&
        (!notice.audience ||
          notice.audience === 'student' ||
          notice.audience === 'both')
      )
      .reverse();

    container.innerHTML = notices.length
      ? notices.map(notice => `
          <article class="notice">
            <h3>${esc(notice.title)}</h3>
            <p>${esc(notice.body)}</p>
            <small>${esc(notice.driverName || notice.sender || 'Management')} · ${esc(notice.date || '')}</small>
          </article>
        `).join('')
      : '<p class="empty">No notices for this route yet.</p>';
  }

  // LOGIN

  function login(event) {
    event.preventDefault();

    const username = $('#username')?.value.trim().toLowerCase();
    const password = $('#password')?.value;
    const user = demoUsers[username];

    if (!user || user.password !== password || user.role !== PORTAL_ROLE) {
      if ($('#loginError')) {
        $('#loginError').textContent = 'Use the driver demo account shown below.';
      }
      return;
    }

    currentUser = { ...user };

    if (user.role === 'driver') {
      const bus = buses.find(item =>
        item.assignedDriverId &&
        drivers.some(driver =>
          String(driver.id) === String(item.assignedDriverId) &&
          String(driver.username || '').toLowerCase() === username
        )
      );

      const route = getRouteForBus(bus);
      if (route) currentUser.routeId = route.id;
      else currentUser.routeId = user.routeId || routes[0]?.id || null;
    }

    localStorage.setItem(DB_KEYS.session, JSON.stringify(currentUser));

    if ($('#loginError')) $('#loginError').textContent = '';

    openApp();
  }

  function logout() {
    currentUser = null;
    localStorage.removeItem(DB_KEYS.session);
    destroyMaps();

    show($('#appScreen'), false);
    show($('#loginScreen'), true);

    if ($('#password')) $('#password').value = '';
  }

  function openApp() {
    if (!currentUser) return;

    show($('#loginScreen'), false);
    show($('#appScreen'), true);
    show($('#studentPage'), currentUser.role === 'student');
    show($('#driverPage'), currentUser.role === 'driver');

    if ($('#userName')) $('#userName').textContent = currentUser.name;

    if ($('#userRole')) {
      $('#userRole').textContent =
        currentUser.role === 'student' ? 'Student account' : 'Driver account';
    }

    if ($('#userBadge')) {
      $('#userBadge').textContent =
        currentUser.role === 'student' ? 'S' : 'D';
    }

    if (currentUser.role === 'student') {
      selectedRouteId = null;

      if ($('#routeSearch')) $('#routeSearch').value = '';
      renderRouteResults('');
      renderManagementAnnouncements();

      if ($('#routeDetails')) {
        $('#routeDetails').innerHTML =
          '<p class="empty">Search for a place and select a bus to see its details.</p>';
      }

      if ($('#studentNotices')) {
        $('#studentNotices').innerHTML =
          '<p class="empty">Select a bus to view route notices.</p>';
      }

      setTimeout(initStudentMap, 120);
    } else {
      const route = getRouteForUser();

      if (!route && routes.length) {
        currentUser.routeId = routes[0].id;
      }

      renderDriver();
      setTimeout(initDriverMap, 120);
    }
  }

  // MAP HELPERS

  function createMap(elementId, route) {
    if (!window.L || !document.getElementById(elementId)) return null;

    const path = getRoutePath(route);
    const initialPoint = path.length ? path[0] : [23.2599, 77.4126];

    const map = L.map(elementId).setView(initialPoint, 10);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    return map;
  }

  // One student map is used for route viewing and pickup selection.

  function initStudentMap() {
    if (!window.L || !$('#studentMap')) return;

    if ($('#pickupMap')) {
      $('#pickupMap').classList.add('hidden');
    }

    const firstRoute = routes.find(route => getRoutePath(route).length);

    if (!studentMap) {
      studentMap = createMap('studentMap', firstRoute);
      if (!studentMap) return;

      studentStopsLayer = L.layerGroup().addTo(studentMap);
      studentPickupLayer = L.layerGroup().addTo(studentMap);

      studentMap.on('click', event => {
        if (!selectedRouteId) {
          if ($('#pickupMessage')) {
            $('#pickupMessage').textContent = 'Search for a place and select a bus first.';
          }
          return;
        }

        setDraftPoint(event.latlng);
      });
    }

    if (selectedRouteId) {
      updateStudentMap();
      loadPickupForSelectedRoute();
    }

    setTimeout(() => studentMap?.invalidateSize(), 100);
  }

  function updateStudentMap() {
    if (!studentMap) return;

    if (studentRouteLine) {
      studentMap.removeLayer(studentRouteLine);
      studentRouteLine = null;
    }

    studentStopsLayer?.clearLayers();

    const route = routeById(selectedRouteId);
    if (!route) return;

    const path = getRoutePath(route);
    if (!path.length) return;

    studentRouteLine = L.polyline(path, {
      color: '#2563eb',
      weight: 5
    }).addTo(studentMap);

    getRouteStops(route).forEach(stop => {
      if (stop.lat == null || stop.lng == null) return;

      L.circleMarker([Number(stop.lat), Number(stop.lng)], {
        radius: 5,
        color: '#ffffff',
        weight: 2,
        fillColor: '#2563eb',
        fillOpacity: 1
      })
        .addTo(studentStopsLayer)
        .bindTooltip(esc(stop.name || 'Bus stop'));
    });

    studentMap.fitBounds(studentRouteLine.getBounds(), { padding: [20, 20] });
  }

  function loadPickupForSelectedRoute() {
    if (!studentMap || !selectedRouteId || !currentUser) return;

    const route = routeById(selectedRouteId);
    if (!getRoutePath(route).length) return;

    const existing = read(DB_KEYS.pickups).find(pickup =>
      pickup.studentUsername === currentUser.username &&
      String(pickup.routeId) === String(selectedRouteId)
    );

    if (existing) {
      draftPoint = [Number(existing.lat), Number(existing.lng)];

      if ($('#pickupLabel')) $('#pickupLabel').value = existing.label || '';
      if ($('#pickupLandmark')) $('#pickupLandmark').value = existing.landmark || '';

      if ($('#myPickup')) {
        $('#myPickup').textContent =
          `Your saved pickup: ${existing.label || 'Pickup point'} ` +
          `(${Number(existing.lat).toFixed(5)}, ${Number(existing.lng).toFixed(5)})`;
      }

      setDraftPoint({ lat: draftPoint[0], lng: draftPoint[1] }, false);
    } else {
      draftPoint = null;

      if (pickupMarker) {
        studentMap.removeLayer(pickupMarker);
        pickupMarker = null;
      }

      if ($('#pickupLabel')) $('#pickupLabel').value = '';
      if ($('#pickupLandmark')) $('#pickupLandmark').value = '';

      if ($('#myPickup')) {
        $('#myPickup').textContent = 'Click the selected route on the map to choose your pickup point.';
      }
    }
  }

  function nearestOnSegment(point, a, b) {
    const meanLat = (a[0] + b[0] + point.lat) / 3;
    const xScale = Math.cos(meanLat * Math.PI / 180);

    const px = point.lng * xScale;
    const py = point.lat;
    const ax = a[1] * xScale;
    const ay = a[0];
    const bx = b[1] * xScale;
    const by = b[0];

    const dx = bx - ax;
    const dy = by - ay;
    const denominator = dx * dx + dy * dy;

    const t = denominator
      ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denominator))
      : 0;

    return {
      lat: ay + t * dy,
      lng: (ax + t * dx) / xScale
    };
  }

  function snapToRoute(point) {
    const route = routeById(selectedRouteId);
    const path = getRoutePath(route);

    if (!path.length) return null;

    if (path.length === 1) {
      return { lat: path[0][0], lng: path[0][1] };
    }

    let best = null;
    let bestDistance = Infinity;

    for (let i = 0; i < path.length - 1; i++) {
      const candidate = nearestOnSegment(point, path[i], path[i + 1]);
      const dLat = candidate.lat - point.lat;
      const dLng = (candidate.lng - point.lng) *
        Math.cos(point.lat * Math.PI / 180);
      const distance = dLat * dLat + dLng * dLng;

      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }

    return best;
  }

  function setDraftPoint(point, pan = true) {
    if (!studentMap || !selectedRouteId) return;

    const snapped = snapToRoute(point);
    if (!snapped) return;

    draftPoint = [snapped.lat, snapped.lng];

    if (!pickupMarker) {
      pickupMarker = L.marker(draftPoint, { draggable: true }).addTo(studentMap);

      pickupMarker.on('drag', event => {
        const snappedPoint = snapToRoute(event.target.getLatLng());
        if (!snappedPoint) return;

        event.target.setLatLng(snappedPoint);
        draftPoint = [snappedPoint.lat, snappedPoint.lng];
      });

      pickupMarker.on('dragend', event => {
        const snappedPoint = snapToRoute(event.target.getLatLng());
        if (!snappedPoint) return;

        event.target.setLatLng(snappedPoint);
        draftPoint = [snappedPoint.lat, snappedPoint.lng];
      });
    } else {
      pickupMarker.setLatLng(draftPoint);

      if (!studentMap.hasLayer(pickupMarker)) {
        pickupMarker.addTo(studentMap);
      }
    }

    pickupMarker.bindTooltip('Your proposed pickup point');

    if (pan) studentMap.panTo(draftPoint);

    if ($('#pickupMessage')) {
      $('#pickupMessage').textContent =
        'Pickup pin placed on the selected route. Save to submit it.';
    }
  }

  function resetPickupPin() {
    const path = getRoutePath(routeById(selectedRouteId));
    if (!path.length) return;

    const point = path[Math.min(2, path.length - 1)];
    setDraftPoint({ lat: point[0], lng: point[1] });

    if ($('#pickupMessage')) {
      $('#pickupMessage').textContent =
        'Pin reset to the selected route. Drag it to adjust.';
    }
  }

  function savePickup(event) {
    event.preventDefault();

    if (!currentUser || currentUser.role !== 'student') return;

    if (!selectedRouteId || !routeById(selectedRouteId)) {
      if ($('#pickupMessage')) {
        $('#pickupMessage').textContent = 'Search for a place and select a bus first.';
      }
      return;
    }

    if (!draftPoint) {
      if ($('#pickupMessage')) {
        $('#pickupMessage').textContent = 'Choose a pickup point on the map first.';
      }
      return;
    }

    const pickups = read(DB_KEYS.pickups);

    const existingIndex = pickups.findIndex(pickup =>
      pickup.studentUsername === currentUser.username &&
      String(pickup.routeId) === String(selectedRouteId)
    );

    const pickup = {
      id: `${currentUser.username}-${selectedRouteId}`,
      studentUsername: currentUser.username,
      studentName: currentUser.name,
      routeId: selectedRouteId,
      label: $('#pickupLabel')?.value.trim() || 'My pickup point',
      landmark: $('#pickupLandmark')?.value.trim() || '',
      lat: draftPoint[0],
      lng: draftPoint[1],
      updatedAt: new Date().toLocaleString()
    };

    if (existingIndex >= 0) pickups[existingIndex] = pickup;
    else pickups.push(pickup);

    write(DB_KEYS.pickups, pickups);

    if ($('#pickupMessage')) {
      $('#pickupMessage').textContent = 'Pickup point saved for the selected route.';
    }

    if ($('#myPickup')) {
      $('#myPickup').textContent =
        `Your saved pickup: ${pickup.label} ` +
        `(${pickup.lat.toFixed(5)}, ${pickup.lng.toFixed(5)})`;
    }
  }

  // DRIVER MAP

  function initDriverMap() {
    if (!window.L) return;

    const route = getRouteForUser();
    if (!route || !getRoutePath(route).length) return;

    if (!driverMap) {
      driverMap = createMap('driverMap', route);
      if (!driverMap) return;

      driverPickupsLayer = L.layerGroup().addTo(driverMap);
    }

    renderDriverMap();
    setTimeout(() => driverMap?.invalidateSize(), 100);
  }

  function renderDriverMap() {
    if (!driverMap) return;

    const route = getRouteForUser();
    if (!route) return;

    const path = getRoutePath(route);
    if (!path.length) return;

    if (driverRouteLine) driverMap.removeLayer(driverRouteLine);
    driverPickupsLayer?.clearLayers();

    driverRouteLine = L.polyline(path, {
      color: '#2563eb',
      weight: 5
    }).addTo(driverMap);

    const pickups = read(DB_KEYS.pickups)
      .filter(pickup => String(pickup.routeId) === String(route.id));

    pickups.forEach(pickup => {
      L.marker([Number(pickup.lat), Number(pickup.lng)])
        .addTo(driverPickupsLayer)
        .bindPopup(`
          <b>${esc(pickup.label)}</b><br>
          ${esc(pickup.studentName)}<br>
          ${esc(pickup.landmark || 'No extra instructions')}<br>
          <small>${Number(pickup.lat).toFixed(5)}, ${Number(pickup.lng).toFixed(5)}</small>
        `);
    });

    driverMap.fitBounds(driverRouteLine.getBounds(), { padding: [25, 25] });

    const bus = getBusForRoute(route);

    if ($('#driverRouteTitle')) {
      $('#driverRouteTitle').textContent = getRouteDisplayName(route);
    }

    if ($('#driverRouteInfo')) {
      $('#driverRouteInfo').textContent =
        `${route.routeCode || ''} · ${bus?.busNumber || 'Bus not assigned'} · ` +
        `Driver: ${getDriverName(route)} · ${pickups.length} pickup point(s)`;
    }
  }

  function renderDriver() {
    const route = getRouteForUser();

    if (!route) {
      if ($('#driverRouteTitle')) $('#driverRouteTitle').textContent = 'No assigned route found';
      if ($('#driverPickups')) {
        $('#driverPickups').innerHTML = '<p class="empty">No route is assigned to this driver.</p>';
      }
      if ($('#pickupCount')) $('#pickupCount').textContent = '0';
      return;
    }

    const pickups = read(DB_KEYS.pickups)
      .filter(pickup => String(pickup.routeId) === String(route.id));

    if ($('#pickupCount')) $('#pickupCount').textContent = pickups.length;

    if ($('#driverPickups')) {
      $('#driverPickups').innerHTML = pickups.length
        ? pickups.map(pickup => `
            <article class="pickup-item">
              <b>${esc(pickup.label)} · ${esc(pickup.studentName)}</b>
              <small>${esc(pickup.landmark || 'No extra instructions')}</small>
              <small>Coordinates: ${Number(pickup.lat).toFixed(5)}, ${Number(pickup.lng).toFixed(5)}</small>
              <small>Updated: ${esc(pickup.updatedAt || 'Recently')}</small>
            </article>
          `).join('')
        : '<p class="empty">No pickup points submitted for this route yet.</p>';
    }

    const notices = read(DB_KEYS.notices)
      .filter(notice =>
        (String(notice.routeId) === String(route.id) || notice.routeId === 'all') &&
        (!notice.audience ||
          notice.audience === 'driver' ||
          notice.audience === 'both')
      )
      .reverse();

    if ($('#driverNotices')) {
      $('#driverNotices').innerHTML = notices.length
        ? notices.map(notice => `
            <article class="notice">
              <h3>${esc(notice.title)}</h3>
              <p>${esc(notice.body)}</p>
              <small>${esc(notice.sender || notice.driverName || 'Management')} · ${esc(notice.date || '')}</small>
            </article>
          `).join('')
        : '<p class="empty">You have not received any notices yet.</p>';
    }

    renderManagementAnnouncements();
    renderDriverMap();
  }

  function sendNotice(event) {
    event.preventDefault();

    if (!currentUser || currentUser.role !== 'driver') return;

    const route = getRouteForUser();

    if (!route) {
      if ($('#noticeFeedback')) {
        $('#noticeFeedback').textContent = 'No assigned route found for this driver.';
      }
      return;
    }

    const title = $('#noticeTitle')?.value.trim();
    const body = $('#noticeBody')?.value.trim();

    if (!title || !body) {
      if ($('#noticeFeedback')) {
        $('#noticeFeedback').textContent = 'Enter both a notice title and message.';
      }
      return;
    }

    const notices = read(DB_KEYS.notices);

    notices.push({
      id: Date.now(),
      routeId: route.id,
      audience: 'student',
      sender: currentUser.name,
      driverName: currentUser.name,
      title,
      body,
      date: new Date().toLocaleString()
    });

    write(DB_KEYS.notices, notices);

    if ($('#noticeFeedback')) {
      $('#noticeFeedback').textContent = 'Notice saved for students on your route.';
    }

    $('#noticeForm')?.reset();
    renderDriver();
  }

  function destroyMaps() {
    [studentMap, driverMap].forEach(map => {
      if (map) map.remove();
    });

    studentMap = null;
    driverMap = null;
    studentRouteLine = null;
    driverRouteLine = null;
    studentStopsLayer = null;
    studentPickupLayer = null;
    driverPickupsLayer = null;
    pickupMarker = null;
    draftPoint = null;
    selectedRouteId = null;
  }

  // EVENT LISTENERS

  $('#loginForm')?.addEventListener('submit', login);
  $('#logoutBtn')?.addEventListener('click', logout);

  $('#routeSearch')?.addEventListener('input', event => {
    selectedRouteId = null;
    renderRouteResults(event.target.value);

    if ($('#routeDetails')) {
      $('#routeDetails').innerHTML =
        '<p class="empty">Select a matching bus to see its details and map.</p>';
    }

    renderStudentNotices();
    renderManagementAnnouncements();
    updateStudentMap();

    if (pickupMarker && studentMap) {
      studentMap.removeLayer(pickupMarker);
      pickupMarker = null;
    }

    draftPoint = null;
  });

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-route-id]');
    if (!button || !$('#routeResults')?.contains(button)) return;

    selectStudentRoute(button.dataset.routeId);
  });

  $('#resetPinBtn')?.addEventListener('click', resetPickupPin);

  $('#savePickupBtn')?.addEventListener('click', () => {
    $('#pickupForm')?.requestSubmit();
  });

  $('#pickupForm')?.addEventListener('submit', savePickup);
  $('#noticeForm')?.addEventListener('submit', sendNotice);


  window.addEventListener('wimb:data-updated', event => {
    const key = event.detail?.key;
    if (!key || key === DB_KEYS.notices || key === DB_KEYS.pickups || key === DB_KEYS.management) {
      if (currentUser?.role === 'student') {
        renderStudentNotices();
        renderManagementAnnouncements();
        if (selectedRouteId) loadPickupForSelectedRoute();
      } else if (currentUser?.role === 'driver') {
        renderDriver();
      }
    }
  });

  window.addEventListener('storage', event => {
    if ([DB_KEYS.notices, DB_KEYS.pickups, DB_KEYS.management].includes(event.key)) {
      window.dispatchEvent(new CustomEvent('wimb:data-updated', { detail: { key: event.key } }));
    }
  });

  // RESTORE SAVED SESSION

  try {
    const saved = JSON.parse(localStorage.getItem(DB_KEYS.session) || 'null');

    if (
      saved &&
      demoUsers[saved.username] &&
      saved.role === demoUsers[saved.username].role &&
      saved.role === PORTAL_ROLE
    ) {
      currentUser = {
        ...demoUsers[saved.username],
        ...saved
      };

      openApp();
    }
  } catch {
    // Start at the login screen if the saved session is invalid.
  }
})();
