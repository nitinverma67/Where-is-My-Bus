
(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const PORTAL_ROLE = 'student';

  const DB_KEYS = {
    pickups: 'wimb_demo_pickups_v2',
    notices: 'wimb_demo_notices_v2',
    session: 'wimb_demo_session_v2',
    management: 'wimb_management_data_v1'
  };

  // --------------------------------------------------
  // LOAD APPLICATION DATA
  // --------------------------------------------------

  function loadAppData() {
    try {
      const saved = JSON.parse(
        localStorage.getItem(DB_KEYS.management) || 'null'
      );

      if (
        saved &&
        Array.isArray(saved.routes) &&
        Array.isArray(saved.buses)
      ) {
        return saved;
      }
    } catch (error) {
      console.error('Management data error:', error);
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

  // --------------------------------------------------
  // MAP VARIABLES
  // --------------------------------------------------

  let studentMap = null;
  let driverMap = null;

  let studentRouteLine = null;
  let driverRouteLine = null;

  let studentStopsLayer = null;
  let studentPickupLayer = null;
  let driverPickupsLayer = null;
  let landmarkLayer = null;

  let pickupMarker = null;
  let liveBusMarker = null;

  let draftPoint = null;
  let roadRoutePath = [];
  let routeDistanceKm = null;

  let liveBusRef = null;
  let liveBusListener = null;

  let roadRouteRequestId = 0;
  let landmarkRequestId = 0;

  let studentMapObserver = null;
  let mapRefreshTimer = null;

  // --------------------------------------------------
  // GENERAL HELPERS
  // --------------------------------------------------

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
    return routes.find(
      route => String(route.id) === String(id)
    ) || null;
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
        Number(a.sequenceOrder || 0) -
        Number(b.sequenceOrder || 0)
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
      .map(stop => [
        Number(stop.lat),
        Number(stop.lng)
      ]);
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
      return driver.name ||
        driver.driverName ||
        'Driver name unavailable';
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

  // --------------------------------------------------
  // ROUTE SEARCH
  // --------------------------------------------------

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

      return searchableParts
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(search);
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
      const selected =
        String(route.id) === String(selectedRouteId);

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

  // --------------------------------------------------
  // NOTICES
  // --------------------------------------------------

  function renderManagementAnnouncements() {
    const studentContainer = $('#studentManagementNotices');
    const driverContainer = $('#driverManagementNotices');

    const route = currentUser?.role === 'driver'
      ? getRouteForUser()
      : routeById(selectedRouteId);

    const routeId = route?.id ?? selectedRouteId;

    const announcements = read(DB_KEYS.notices)
      .filter(notice => {
        const audience = String(
          notice.audience || 'both'
        ).toLowerCase();

        const audienceMatches = [
          'both',
          'student',
          'students',
          'all',
          'everyone'
        ].includes(audience);

        const noticeRoute =
          notice.routeId == null || notice.routeId === ''
            ? 'all'
            : String(notice.routeId);

        const routeMatches =
          noticeRoute === 'all' ||
          routeId == null ||
          noticeRoute === String(routeId);

        const isManagement =
          !notice.driverName &&
          (!notice.sender ||
            /management|admin/i.test(String(notice.sender)));

        return isManagement &&
          audienceMatches &&
          routeMatches;
      })
      .slice()
      .reverse();

    const markup = announcements.length
      ? announcements.map(notice => `
          <article class="notice">
            <h3>${esc(notice.title || 'Management announcement')}</h3>
            <p>${esc(notice.body || notice.message || '')}</p>
            <small>Management · ${esc(notice.createdAt || notice.date || '')}</small>
          </article>
        `).join('')
      : '<p class="empty">No management announcements available.</p>';

    if (studentContainer) {
      studentContainer.innerHTML = markup;
    }

    if (driverContainer) {
      driverContainer.innerHTML = markup;
    }
  }

  function renderStudentNotices() {
    const container = $('#studentNotices');
    if (!container) return;

    if (!selectedRouteId) {
      container.innerHTML =
        '<p class="empty">Select a bus to view route notices.</p>';
      return;
    }

    const notices = read(DB_KEYS.notices)
      .filter(notice =>
        (
          String(notice.routeId) === String(selectedRouteId) ||
          notice.routeId === 'all'
        ) &&
        (
          !notice.audience ||
          notice.audience === 'student' ||
          notice.audience === 'both'
        )
      )
      .reverse();

    container.innerHTML = notices.length
      ? notices.map(notice => `
          <article class="notice">
            <h3>${esc(notice.title)}</h3>
            <p>${esc(notice.body)}</p>
            <small>
              ${esc(notice.driverName || notice.sender || 'Management')}
              · ${esc(notice.date || '')}
            </small>
          </article>
        `).join('')
      : '<p class="empty">No notices for this route yet.</p>';
  }

  // --------------------------------------------------
  // ROUTE DETAILS
  // --------------------------------------------------

  function showRouteDetails(routeId) {
    const route = routeById(routeId);
    if (!route) return;

    selectedRouteId = route.id;

    roadRoutePath = [];
    routeDistanceKm = null;

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
            <b>
              ${
                driverPhone
                  ? `<a href="tel:${esc(driverPhone.replace(/\s/g, ''))}">${esc(driverPhone)}</a>`
                  : 'Not available in data.js'
              }
            </b>
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
            <b>${route.totalDistanceKm != null
              ? `${esc(route.totalDistanceKm)} km`
              : 'Calculating road distance...'}</b>
          </div>
        </div>

        <h3>Bus stops</h3>

        <div class="stops-list">
          ${
            stops.length
              ? stops.map(stop => `
                  <div class="stop-item">
                    <strong>${esc(stop.name || 'Unnamed stop')}</strong>
                    <p>${esc(stop.landmark || '')}</p>
                    <span>${esc(stop.scheduledTime || 'Time not set')}</span>
                  </div>
                `).join('')
              : '<p class="empty">No stops available.</p>'
          }
        </div>
      `;
    }

    renderRouteResults($('#routeSearch')?.value || '');
    renderStudentNotices();
    renderManagementAnnouncements();

    loadPickupForSelectedRoute();

    // Draw the map if it is already visible.
    refreshStudentMap();
  }

  function selectStudentRoute(routeId) {
    if (!routeById(routeId)) return;
    showRouteDetails(routeId);
  }

  // --------------------------------------------------
  // LOGIN AND LOGOUT
  // --------------------------------------------------

  function login(event) {
    event.preventDefault();

    const username = $('#username')?.value.trim().toLowerCase();
    const password = $('#password')?.value;

    const user = demoUsers[username];

    if (
      !user ||
      user.password !== password ||
      user.role !== PORTAL_ROLE
    ) {
      if ($('#loginError')) {
        $('#loginError').textContent =
          'Use the student demo account shown below.';
      }
      return;
    }

    currentUser = { ...user };

    localStorage.setItem(
      DB_KEYS.session,
      JSON.stringify(currentUser)
    );

    if ($('#loginError')) {
      $('#loginError').textContent = '';
    }

    openApp();
  }

  function logout() {
    currentUser = null;

    localStorage.removeItem(DB_KEYS.session);

    destroyMaps();

    show($('#appScreen'), false);
    show($('#loginScreen'), true);

    if ($('#password')) {
      $('#password').value = '';
    }
  }

  function openApp() {
    if (!currentUser) return;

    show($('#loginScreen'), false);
    show($('#appScreen'), true);

    show($('#studentPage'), currentUser.role === 'student');
    show($('#driverPage'), currentUser.role === 'driver');

    if ($('#userName')) {
      $('#userName').textContent = currentUser.name;
    }

    if ($('#userRole')) {
      $('#userRole').textContent =
        currentUser.role === 'student'
          ? 'Student account'
          : 'Driver account';
    }

    if ($('#userBadge')) {
      $('#userBadge').textContent =
        currentUser.role === 'student' ? 'S' : 'D';
    }

    if (currentUser.role === 'student') {
      selectedRouteId = null;

      if ($('#routeSearch')) {
        $('#routeSearch').value = '';
      }

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

      activateStudentHome();

      setTimeout(() => {
        if (isMapSectionVisible()) {
          initStudentMap();
        }
      }, 350);

    } else {
      const route = getRouteForUser();

      if (!route && routes.length) {
        currentUser.routeId = routes[0].id;
      }

      renderDriver();

      setTimeout(initDriverMap, 300);
    }
  }

  // --------------------------------------------------
  // STUDENT NAVIGATION
  // Compatible with the sidebar in the supplied HTML.
  // --------------------------------------------------

  function activateStudentHome() {
    const home = $('#homeSection');

    if (!home) return;

    document.querySelectorAll(
      '#studentPage .content-section'
    ).forEach(section => {
      section.style.display =
        section.id === 'homeSection' ? 'block' : 'none';

      section.classList.toggle(
        'page-active',
        section.id === 'homeSection'
      );
    });

    document.querySelectorAll(
      '#studentSidebar .nav-link'
    ).forEach(link => {
      link.classList.toggle(
        'active',
        link.dataset.section === 'homeSection'
      );
    });

    if (location.hash !== '#homeSection') {
      history.replaceState(null, '', '#homeSection');
    }
  }

  function isMapSectionVisible() {
    const mapElement = $('#studentMap');
    const section = $('#liveMapSection');

    if (!mapElement || !section) return false;

    const studentPage = $('#studentPage');

    if (
      studentPage &&
      studentPage.classList.contains('hidden')
    ) {
      return false;
    }

    if (
      section.classList.contains('hidden') ||
      getComputedStyle(section).display === 'none' ||
      getComputedStyle(section).visibility === 'hidden'
    ) {
      return false;
    }

    const rect = mapElement.getBoundingClientRect();

    return rect.width > 0 && rect.height > 0;
  }

  function refreshStudentMap() {
    clearTimeout(mapRefreshTimer);

    mapRefreshTimer = setTimeout(() => {
      if (!isMapSectionVisible()) return;

      if (!studentMap) {
        initStudentMap();
        return;
      }

      requestAnimationFrame(() => {
        if (!studentMap || !isMapSectionVisible()) return;

        studentMap.invalidateSize(true);

        if (selectedRouteId) {
          updateStudentMap();
        }
      });
    }, 250);
  }

  // --------------------------------------------------
  // MAP CREATION
  // --------------------------------------------------

  function createMap(elementId, route) {
    if (!window.L) {
      console.error('Leaflet JavaScript is not loaded.');
      return null;
    }

    const element = document.getElementById(elementId);

    if (!element) {
      console.error('Map container not found:', elementId);
      return null;
    }

    // Give Leaflet a real height even if CSS has not loaded correctly.
    if (element.getBoundingClientRect().height < 250) {
      element.style.height = '500px';
      element.style.minHeight = '400px';
    }

    const path = getRoutePath(route);

    const initialPoint = path.length
      ? path[0]
      : [23.2599, 77.4126];

    const map = L.map(elementId, {
      zoomControl: true,
      scrollWheelZoom: true,
      preferCanvas: true
    }).setView(initialPoint, 10);

    const tileLayer = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
        crossOrigin: true
      }
    );

    tileLayer.on('tileerror', event => {
      console.warn(
        '[WIMB] Map tile failed to load:',
        event.tile?.src
      );
    });

    tileLayer.addTo(map);

    tileLayer.on('load', () => {
      console.log('[WIMB] Map tiles loaded:', elementId);
    });

    map.whenReady(() => {
      setTimeout(() => {
        map.invalidateSize(true);
      }, 250);
    });

    return map;
  }

  // --------------------------------------------------
  // STUDENT MAP INITIALIZATION
  // --------------------------------------------------

  function initStudentMap() {
    if (!window.L || !$('#studentMap')) return;

    if (!isMapSectionVisible()) return;

    if ($('#pickupMap')) {
      $('#pickupMap').classList.add('hidden');
    }

    const firstRoute = routes.find(
      route => getRoutePath(route).length
    );

    if (!studentMap) {
      studentMap = createMap('studentMap', firstRoute);

      if (!studentMap) return;

      studentStopsLayer = L.layerGroup().addTo(studentMap);
      studentPickupLayer = L.layerGroup().addTo(studentMap);
      landmarkLayer = L.layerGroup().addTo(studentMap);

      studentMap.on('click', event => {
        if (!selectedRouteId) {
          if ($('#pickupMessage')) {
            $('#pickupMessage').textContent =
              'Search for a place and select a bus first.';
          }
          return;
        }

        setDraftPoint(event.latlng);
      });

      const status = document.createElement('p');
      status.id = 'studentMapStatus';
      status.className = 'map-note';
      status.textContent =
        'Road route will appear after selecting a bus.';

      $('#studentMap').insertAdjacentElement(
        'afterend',
        status
      );

      const gps = document.createElement('p');
      gps.id = 'studentGpsStatus';
      gps.className = 'map-note';
      gps.textContent = 'Waiting for driver GPS…';

      status.insertAdjacentElement('afterend', gps);
    }

    setTimeout(() => {
      if (!studentMap || !isMapSectionVisible()) return;

      studentMap.invalidateSize(true);

      if (selectedRouteId) {
        updateStudentMap();
        loadPickupForSelectedRoute();
      }
    }, 300);
  }

  // --------------------------------------------------
  // ROAD ROUTING
  // --------------------------------------------------

  async function updateStudentMap() {
    if (!studentMap || !isMapSectionVisible()) return;

    const route = routeById(selectedRouteId);
    if (!route) return;

    const requestId = ++roadRouteRequestId;
    const stopPath = getRoutePath(route);

    if (stopPath.length < 2) {
      if ($('#studentMapStatus')) {
        $('#studentMapStatus').textContent =
          'This route needs at least two stops with valid coordinates.';
      }
      return;
    }

    if ($('#studentMapStatus')) {
      $('#studentMapStatus').textContent =
        'Calculating road route…';
    }

    let result = null;

    try {
      if (window.WIMBMapServices?.getRoadRoute) {
        result = await window.WIMBMapServices.getRoadRoute(stopPath);
      }

      if (
        result &&
        Array.isArray(result.path) &&
        result.path.length >= 2
      ) {
        roadRoutePath = result.path;
        routeDistanceKm = Number(result.distanceKm);

        if ($('#studentMapStatus')) {
          $('#studentMapStatus').textContent =
            `Road route · ${routeDistanceKm.toFixed(1)} km · ${result.source || 'Road routing'}`;
        }
      } else {
        throw new Error('Road routing returned no valid path.');
      }

    } catch (error) {
      console.warn('[WIMB] Road routing failed:', error);

      roadRoutePath = stopPath;
      routeDistanceKm = null;

      if ($('#studentMapStatus')) {
        $('#studentMapStatus').textContent =
          'Road routing unavailable. Showing stop-to-stop fallback route.';
      }
    }

    if (
      requestId !== roadRouteRequestId ||
      !studentMap
    ) {
      return;
    }

    if (studentRouteLine) {
      studentMap.removeLayer(studentRouteLine);
    }

    studentStopsLayer?.clearLayers();
    landmarkLayer?.clearLayers();

    studentRouteLine = L.polyline(
      roadRoutePath,
      {
        color: '#c62828',
        weight: 6,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }
    ).addTo(studentMap);

    getRouteStops(route).forEach(stop => {
      if (
        stop.lat == null ||
        stop.lng == null
      ) {
        return;
      }

      L.circleMarker(
        [Number(stop.lat), Number(stop.lng)],
        {
          radius: 6,
          color: '#ffffff',
          weight: 2,
          fillColor: '#c62828',
          fillOpacity: 1
        }
      )
        .addTo(studentStopsLayer)
        .bindTooltip(
          esc(stop.name || stop.landmark || 'Bus stop')
        );
    });

    // Fit the complete route inside the visible map.
    const bounds = studentRouteLine.getBounds();

    if (bounds.isValid()) {
      studentMap.fitBounds(bounds, {
        padding: [35, 35],
        maxZoom: 15,
        animate: true
      });
    }

    updateRouteDistanceDisplay();

    // Load popular landmarks along the route.
    const landmarkId = ++landmarkRequestId;

    if (window.WIMBMapServices?.getPopularLandmarks) {
      window.WIMBMapServices
        .getPopularLandmarks(roadRoutePath)
        .then(items => {
          if (
            landmarkId !== landmarkRequestId ||
            requestId !== roadRouteRequestId ||
            !landmarkLayer
          ) {
            return;
          }

          landmarkLayer.clearLayers();

          (items || []).forEach(item => {
            if (
              !Number.isFinite(Number(item.lat)) ||
              !Number.isFinite(Number(item.lng))
            ) {
              return;
            }

            L.circleMarker(
              [Number(item.lat), Number(item.lng)],
              {
                radius: 5,
                color: '#ffffff',
                weight: 1,
                fillColor: '#7c3aed',
                fillOpacity: 0.95
              }
            )
              .bindPopup(
                `<b>${esc(item.name)}</b><br><small>${esc(item.type || 'Landmark')}</small>`
              )
              .addTo(landmarkLayer);
          });
        })
        .catch(error => {
          console.warn(
            '[WIMB] Landmark lookup unavailable:',
            error
          );
        });
    }

    startStudentLiveBusTracking(route);

    // Keep the map dimensions correct after drawing the route.
    setTimeout(() => {
      studentMap?.invalidateSize(true);
    }, 200);
  }

  function updateRouteDistanceDisplay() {
    const details = $('#routeDetails');
    if (!details || routeDistanceKm == null) return;

    const distanceElement = [...details.querySelectorAll('.detail-item')]
      .find(item =>
        item.querySelector('small')?.textContent === 'Total distance'
      );

    if (distanceElement) {
      const value = distanceElement.querySelector('b');

      if (value) {
        value.textContent = `${routeDistanceKm.toFixed(1)} km (road distance)`;
      }
    }
  }

  // --------------------------------------------------
  // FIREBASE LIVE BUS TRACKING
  // --------------------------------------------------

  function getFirebaseDatabase() {
    if (window.database) {
      return window.database;
    }

    try {
      if (window.firebase?.apps?.length) {
        return window.firebase.database();
      }
    } catch (error) {
      console.warn('[WIMB] Firebase database unavailable:', error);
    }

    return null;
  }

  function stopStudentLiveBusTracking() {
    if (liveBusRef && liveBusListener) {
      liveBusRef.off('value', liveBusListener);
    }

    liveBusRef = null;
    liveBusListener = null;

    if (liveBusMarker && studentMap) {
      studentMap.removeLayer(liveBusMarker);
    }

    liveBusMarker = null;
  }

  function startStudentLiveBusTracking(route) {
    stopStudentLiveBusTracking();

    const bus = getBusForRoute(route);
    const database = getFirebaseDatabase();

    if (!bus?.id || !database) {
      if ($('#studentGpsStatus')) {
        $('#studentGpsStatus').textContent =
          'Live GPS unavailable. Check Firebase configuration.';
      }
      return;
    }

    liveBusRef = database.ref(
      `liveBusLocations/${bus.id}`
    );

    liveBusListener = snapshot => {
      const value = snapshot.val();

      if (
        !value ||
        !Number.isFinite(Number(value.lat)) ||
        !Number.isFinite(Number(value.lng))
      ) {
        if ($('#studentGpsStatus')) {
          $('#studentGpsStatus').textContent =
            'Waiting for driver GPS…';
        }
        return;
      }

      const point = [
        Number(value.lat),
        Number(value.lng)
      ];

      if (!liveBusMarker) {
        liveBusMarker = L.marker(point, {
          title: 'Live bus location'
        }).addTo(studentMap);
      } else {
        liveBusMarker.setLatLng(point);
      }

      const accuracy = Number(value.accuracy || 0);
      const timestamp = Number(value.timestamp || 0);

      liveBusMarker.bindPopup(`
        <b>Live bus location</b><br>
        GPS accuracy: ±${Math.round(accuracy)} m<br>
        Updated: ${
          timestamp
            ? new Date(timestamp).toLocaleTimeString()
            : 'Unknown'
        }
      `);

      const age = timestamp
        ? Date.now() - timestamp
        : Infinity;

      if ($('#studentGpsStatus')) {
        $('#studentGpsStatus').textContent =
          age < 30000
            ? `Bus live · GPS ±${Math.round(accuracy)} m`
            : 'Bus location is delayed';
      }
    };

    liveBusRef.on(
      'value',
      liveBusListener,
      error => {
        console.error(
          '[WIMB] Student live GPS read failed:',
          error
        );

        if ($('#studentGpsStatus')) {
          $('#studentGpsStatus').textContent =
            'Live GPS unavailable. Check Firebase rules.';
        }
      }
    );
  }

  // --------------------------------------------------
  // PICKUP POINTS
  // --------------------------------------------------

  function loadPickupForSelectedRoute() {
    if (
      !selectedRouteId ||
      !currentUser
    ) {
      return;
    }

    const route = routeById(selectedRouteId);

    if (!getRoutePath(route).length) return;

    const existing = read(DB_KEYS.pickups).find(pickup =>
      pickup.studentUsername === currentUser.username &&
      String(pickup.routeId) === String(selectedRouteId)
    );

    if (existing) {
      draftPoint = [
        Number(existing.lat),
        Number(existing.lng)
      ];

      if ($('#pickupLabel')) {
        $('#pickupLabel').value = existing.label || '';
      }

      if ($('#pickupLandmark')) {
        $('#pickupLandmark').value = existing.landmark || '';
      }

      if ($('#myPickup')) {
        $('#myPickup').textContent =
          `Your saved pickup: ${existing.label || 'Pickup point'} ` +
          `(${Number(existing.lat).toFixed(5)}, ${Number(existing.lng).toFixed(5)})`;
      }

      if (studentMap && isMapSectionVisible()) {
        setDraftPoint(
          {
            lat: draftPoint[0],
            lng: draftPoint[1]
          },
          false
        );
      }

    } else {
      draftPoint = null;

      if (pickupMarker && studentMap) {
        studentMap.removeLayer(pickupMarker);
        pickupMarker = null;
      }

      if ($('#pickupLabel')) {
        $('#pickupLabel').value = '';
      }

      if ($('#pickupLandmark')) {
        $('#pickupLandmark').value = '';
      }

      if ($('#myPickup')) {
        $('#myPickup').textContent =
          'You have not submitted a pickup point.';
      }
    }
  }

  function distanceBetweenPoints(a, b) {
    const earthRadius = 6371000;

    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;

    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;

    const value =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) ** 2;

    return 2 * earthRadius *
      Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }

  function nearestOnSegment(point, a, b) {
    const meanLat =
      (a[0] + b[0] + point.lat) / 3;

    const xScale = Math.cos(
      meanLat * Math.PI / 180
    );

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
      ? Math.max(
          0,
          Math.min(
            1,
            ((px - ax) * dx + (py - ay) * dy) /
            denominator
          )
        )
      : 0;

    return {
      lat: ay + t * dy,
      lng: (ax + t * dx) / xScale
    };
  }

  function snapToRoute(point) {
    const route = routeById(selectedRouteId);

    const path = roadRoutePath.length
      ? roadRoutePath
      : getRoutePath(route);

    if (path.length < 2) return null;

    if (window.WIMBMapServices?.nearestPointOnPath) {
      const nearest =
        window.WIMBMapServices.nearestPointOnPath(
          point,
          path
        );

      if (
        nearest &&
        Number(nearest.distanceMeters) <= 35
      ) {
        return nearest;
      }

      return null;
    }

    let best = null;
    let bestDistance = Infinity;

    for (let i = 0; i < path.length - 1; i++) {
      const candidate = nearestOnSegment(
        point,
        path[i],
        path[i + 1]
      );

      const distance = distanceBetweenPoints(
        point,
        candidate
      );

      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }

    if (!best || bestDistance > 35) {
      return null;
    }

    return {
      lat: best.lat,
      lng: best.lng,
      distanceMeters: bestDistance
    };
  }

  function setDraftPoint(point, pan = true) {
    if (!selectedRouteId) return;

    const snapped = snapToRoute(point);

    if (!snapped) {
      if ($('#pickupMessage')) {
        $('#pickupMessage').textContent =
          'Choose a point within 35 metres of the selected bus route.';
      }
      return;
    }

    draftPoint = [
      Number(snapped.lat),
      Number(snapped.lng)
    ];

    if (!studentMap) return;

    if (!pickupMarker) {
      pickupMarker = L.marker(draftPoint, {
        draggable: true,
        title: 'Your pickup point'
      }).addTo(studentMap);

      pickupMarker.on('drag', event => {
        const snappedPoint = snapToRoute(
          event.target.getLatLng()
        );

        if (!snappedPoint) return;

        const location = [
          snappedPoint.lat,
          snappedPoint.lng
        ];

        event.target.setLatLng(location);
        draftPoint = location;
      });

      pickupMarker.on('dragend', event => {
        const snappedPoint = snapToRoute(
          event.target.getLatLng()
        );

        if (!snappedPoint) {
          if ($('#pickupMessage')) {
            $('#pickupMessage').textContent =
              'The pickup point must remain within 35 metres of the route.';
          }

          if (draftPoint) {
            event.target.setLatLng(draftPoint);
          }

          return;
        }

        draftPoint = [
          snappedPoint.lat,
          snappedPoint.lng
        ];

        event.target.setLatLng(draftPoint);
      });

    } else {
      pickupMarker.setLatLng(draftPoint);

      if (!studentMap.hasLayer(pickupMarker)) {
        pickupMarker.addTo(studentMap);
      }
    }

    pickupMarker.bindTooltip(
      'Your proposed pickup point'
    );

    if (pan) {
      studentMap.panTo(draftPoint);
    }

    if ($('#pickupMessage')) {
      $('#pickupMessage').textContent =
        'Pickup pin placed on the selected route. Save to submit it.';
    }
  }

  function resetPickupPin() {
    const path = roadRoutePath.length
      ? roadRoutePath
      : getRoutePath(routeById(selectedRouteId));

    if (!path.length) return;

    const point = path[
      Math.min(2, path.length - 1)
    ];

    setDraftPoint({
      lat: point[0],
      lng: point[1]
    });

    if ($('#pickupMessage')) {
      $('#pickupMessage').textContent =
        'Pin reset to the selected route. Drag it to adjust.';
    }
  }

  function savePickup(event) {
    event.preventDefault();

    if (
      !currentUser ||
      currentUser.role !== 'student'
    ) {
      return;
    }

    if (
      !selectedRouteId ||
      !routeById(selectedRouteId)
    ) {
      if ($('#pickupMessage')) {
        $('#pickupMessage').textContent =
          'Search for a place and select a bus first.';
      }
      return;
    }

    if (!draftPoint) {
      if ($('#pickupMessage')) {
        $('#pickupMessage').textContent =
          'Choose a pickup point on the map first.';
      }
      return;
    }

    // Validate the point again before saving.
    const verified = snapToRoute({
      lat: draftPoint[0],
      lng: draftPoint[1]
    });

    if (!verified) {
      if ($('#pickupMessage')) {
        $('#pickupMessage').textContent =
          'Your pickup point is not close enough to the selected route. Please select it again.';
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
      lat: verified.lat,
      lng: verified.lng,
      updatedAt: new Date().toLocaleString()
    };

    if (existingIndex >= 0) {
      pickups[existingIndex] = pickup;
    } else {
      pickups.push(pickup);
    }

    write(DB_KEYS.pickups, pickups);

    if ($('#pickupMessage')) {
      $('#pickupMessage').textContent =
        'Pickup point saved for the selected route.';
    }

    if ($('#myPickup')) {
      $('#myPickup').textContent =
        `Your saved pickup: ${pickup.label} ` +
        `(${pickup.lat.toFixed(5)}, ${pickup.lng.toFixed(5)})`;
    }
  }

  // --------------------------------------------------
  // DRIVER MAP
  // --------------------------------------------------

  function initDriverMap() {
    if (!window.L) return;

    const route = getRouteForUser();

    if (!route || !getRoutePath(route).length) {
      return;
    }

    if (!driverMap) {
      driverMap = createMap('driverMap', route);

      if (!driverMap) return;

      driverPickupsLayer = L.layerGroup().addTo(driverMap);
    }

    renderDriverMap();

    setTimeout(() => {
      driverMap?.invalidateSize(true);
    }, 300);
  }

  function renderDriverMap() {
    if (!driverMap) return;

    const route = getRouteForUser();
    if (!route) return;

    const path = getRoutePath(route);
    if (!path.length) return;

    if (driverRouteLine) {
      driverMap.removeLayer(driverRouteLine);
    }

    driverPickupsLayer?.clearLayers();

    driverRouteLine = L.polyline(path, {
      color: '#c62828',
      weight: 5
    }).addTo(driverMap);

    const pickups = read(DB_KEYS.pickups)
      .filter(pickup =>
        String(pickup.routeId) === String(route.id)
      );

    pickups.forEach(pickup => {
      L.marker([
        Number(pickup.lat),
        Number(pickup.lng)
      ])
        .addTo(driverPickupsLayer)
        .bindPopup(`
          <b>${esc(pickup.label)}</b><br>
          ${esc(pickup.studentName)}<br>
          ${esc(pickup.landmark || 'No extra instructions')}<br>
          <small>
            ${Number(pickup.lat).toFixed(5)},
            ${Number(pickup.lng).toFixed(5)}
          </small>
        `);
    });

    const bounds = driverRouteLine.getBounds();

    if (bounds.isValid()) {
      driverMap.fitBounds(bounds, {
        padding: [25, 25]
      });
    }

    const bus = getBusForRoute(route);

    if ($('#driverRouteTitle')) {
      $('#driverRouteTitle').textContent =
        getRouteDisplayName(route);
    }

    if ($('#driverRouteInfo')) {
      $('#driverRouteInfo').textContent =
        `${route.routeCode || ''} · ` +
        `${bus?.busNumber || 'Bus not assigned'} · ` +
        `Driver: ${getDriverName(route)} · ` +
        `${pickups.length} pickup point(s)`;
    }
  }

  function renderDriver() {
    const route = getRouteForUser();

    if (!route) {
      if ($('#driverRouteTitle')) {
        $('#driverRouteTitle').textContent =
          'No assigned route found';
      }

      if ($('#driverPickups')) {
        $('#driverPickups').innerHTML =
          '<p class="empty">No route is assigned to this driver.</p>';
      }

      if ($('#pickupCount')) {
        $('#pickupCount').textContent = '0';
      }

      return;
    }

    const pickups = read(DB_KEYS.pickups)
      .filter(pickup =>
        String(pickup.routeId) === String(route.id)
      );

    if ($('#pickupCount')) {
      $('#pickupCount').textContent = pickups.length;
    }

    if ($('#driverPickups')) {
      $('#driverPickups').innerHTML = pickups.length
        ? pickups.map(pickup => `
            <article class="pickup-item">
              <b>${esc(pickup.label)} · ${esc(pickup.studentName)}</b>
              <small>${esc(pickup.landmark || 'No extra instructions')}</small>
              <small>
                Coordinates:
                ${Number(pickup.lat).toFixed(5)},
                ${Number(pickup.lng).toFixed(5)}
              </small>
              <small>Updated: ${esc(pickup.updatedAt || 'Recently')}</small>
            </article>
          `).join('')
        : '<p class="empty">No pickup points submitted for this route yet.</p>';
    }

    const notices = read(DB_KEYS.notices)
      .filter(notice =>
        (
          String(notice.routeId) === String(route.id) ||
          notice.routeId === 'all'
        ) &&
        (
          !notice.audience ||
          notice.audience === 'driver' ||
          notice.audience === 'both'
        )
      )
      .reverse();

    if ($('#driverNotices')) {
      $('#driverNotices').innerHTML = notices.length
        ? notices.map(notice => `
            <article class="notice">
              <h3>${esc(notice.title)}</h3>
              <p>${esc(notice.body)}</p>
              <small>
                ${esc(notice.sender || notice.driverName || 'Management')}
                · ${esc(notice.date || '')}
              </small>
            </article>
          `).join('')
        : '<p class="empty">You have not received any notices yet.</p>';
    }

    renderManagementAnnouncements();
    renderDriverMap();
  }

  // --------------------------------------------------
  // DRIVER NOTICES
  // --------------------------------------------------

  function sendNotice(event) {
    event.preventDefault();

    if (
      !currentUser ||
      currentUser.role !== 'driver'
    ) {
      return;
    }

    const route = getRouteForUser();

    if (!route) {
      if ($('#noticeFeedback')) {
        $('#noticeFeedback').textContent =
          'No assigned route found for this driver.';
      }
      return;
    }

    const title = $('#noticeTitle')?.value.trim();
    const body = $('#noticeBody')?.value.trim();

    if (!title || !body) {
      if ($('#noticeFeedback')) {
        $('#noticeFeedback').textContent =
          'Enter both a notice title and message.';
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
      $('#noticeFeedback').textContent =
        'Notice saved for students on your route.';
    }

    $('#noticeForm')?.reset();

    renderDriver();
  }

  // --------------------------------------------------
  // DESTROY MAPS
  // --------------------------------------------------

  function destroyMaps() {
    stopStudentLiveBusTracking();

    if (studentMapObserver) {
      studentMapObserver.disconnect();
      studentMapObserver = null;
    }

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
    landmarkLayer = null;

    pickupMarker = null;
    draftPoint = null;

    roadRoutePath = [];
    routeDistanceKm = null;

    selectedRouteId = null;

    roadRouteRequestId++;
    landmarkRequestId++;
  }

  // --------------------------------------------------
  // EVENT LISTENERS
  // --------------------------------------------------

  $('#loginForm')?.addEventListener('submit', login);

  $('#logoutBtn')?.addEventListener('click', logout);

  $('#routeSearch')?.addEventListener('input', event => {
    selectedRouteId = null;

    roadRoutePath = [];
    routeDistanceKm = null;

    roadRouteRequestId++;

    stopStudentLiveBusTracking();

    renderRouteResults(event.target.value);

    if ($('#routeDetails')) {
      $('#routeDetails').innerHTML =
        '<p class="empty">Select a matching bus to see its details and map.</p>';
    }

    renderStudentNotices();
    renderManagementAnnouncements();

    if (studentRouteLine && studentMap) {
      studentMap.removeLayer(studentRouteLine);
      studentRouteLine = null;
    }

    studentStopsLayer?.clearLayers();
    landmarkLayer?.clearLayers();

    if (pickupMarker && studentMap) {
      studentMap.removeLayer(pickupMarker);
      pickupMarker = null;
    }

    draftPoint = null;

    if ($('#pickupMessage')) {
      $('#pickupMessage').textContent = '';
    }
  });

  // Clear search button from supplied HTML.
  $('#clearSearch')?.addEventListener('click', () => {
    if ($('#routeSearch')) {
      $('#routeSearch').value = '';
      $('#routeSearch').dispatchEvent(
        new Event('input', { bubbles: true })
      );
    }
  });

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-route-id]');

    if (
      !button ||
      !$('#routeResults')?.contains(button)
    ) {
      return;
    }

    selectStudentRoute(button.dataset.routeId);
  });

  $('#resetPinBtn')?.addEventListener(
    'click',
    resetPickupPin
  );

  $('#savePickupBtn')?.addEventListener('click', () => {
    $('#pickupForm')?.requestSubmit();
  });

  $('#pickupForm')?.addEventListener(
    'submit',
    savePickup
  );

  $('#noticeForm')?.addEventListener(
    'submit',
    sendNotice
  );

  // --------------------------------------------------
  // SIDEBAR AND MAP CONNECTION
  // Uses the navigation IDs in your supplied HTML.
  // --------------------------------------------------

  document.addEventListener('click', event => {
    const link = event.target.closest(
      '#studentSidebar .nav-link, .brand, a[href="#liveMapSection"]'
    );

    if (!link) return;

    const sectionId =
      link.dataset.section ||
      link.getAttribute('href')?.replace('#', '');

    if (sectionId === 'liveMapSection') {
      setTimeout(refreshStudentMap, 350);
      setTimeout(refreshStudentMap, 800);
    }
  });

  window.addEventListener('hashchange', () => {
    if (location.hash === '#liveMapSection') {
      refreshStudentMap();
    }
  });

  window.addEventListener('resize', () => {
    refreshStudentMap();

    if (driverMap) {
      setTimeout(() => {
        driverMap?.invalidateSize(true);
      }, 250);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshStudentMap();
    }
  });

  // Detect when the HTML navigation script makes Live Map visible.
  function observeStudentMapSection() {
    const section = $('#liveMapSection');

    if (!section || studentMapObserver) return;

    studentMapObserver = new MutationObserver(() => {
      if (isMapSectionVisible()) {
        refreshStudentMap();
      }
    });

    studentMapObserver.observe(section, {
      attributes: true,
      attributeFilter: [
        'class',
        'style',
        'hidden'
      ]
    });
  }

  observeStudentMapSection();

  // --------------------------------------------------
  // DATA SYNC EVENTS
  // --------------------------------------------------

  window.addEventListener('wimb:data-updated', event => {
    const key = event.detail?.key;

    if (
      !key ||
      key === DB_KEYS.notices ||
      key === DB_KEYS.pickups ||
      key === DB_KEYS.management
    ) {
      if (currentUser?.role === 'student') {
        renderStudentNotices();
        renderManagementAnnouncements();

        if (selectedRouteId) {
          loadPickupForSelectedRoute();
        }

      } else if (currentUser?.role === 'driver') {
        renderDriver();
      }
    }
  });

  window.addEventListener('storage', event => {
    if (
      [
        DB_KEYS.notices,
        DB_KEYS.pickups,
        DB_KEYS.management
      ].includes(event.key)
    ) {
      window.dispatchEvent(
        new CustomEvent('wimb:data-updated', {
          detail: { key: event.key }
        })
      );
    }
  });

  // --------------------------------------------------
  // PROFILE INFORMATION
  // --------------------------------------------------

  function syncProfile() {
    const name = (
      $('#userName')?.textContent || 'Student'
    ).trim();

    [
      'welcomeName',
      'profileName',
      'profileNameDetail'
    ].forEach(id => {
      const element = document.getElementById(id);

      if (element) {
        element.textContent = name;
      }
    });

    const avatar = $('#profileAvatar');

    if (avatar) {
      avatar.textContent =
        name.charAt(0).toUpperCase() || 'S';
    }
  }

  function setupProfileObserver() {
    const userName = $('#userName');

    if (!userName || userName.dataset.profileObserver) {
      return;
    }

    userName.dataset.profileObserver = '1';

    new MutationObserver(syncProfile).observe(userName, {
      childList: true,
      characterData: true,
      subtree: true
    });

    syncProfile();
  }

  setupProfileObserver();

  // --------------------------------------------------
  // RESTORE SAVED SESSION
  // --------------------------------------------------

  try {
    const saved = JSON.parse(
      localStorage.getItem(DB_KEYS.session) || 'null'
    );

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

  } catch (error) {
    console.warn(
      '[WIMB] Could not restore saved session:',
      error
    );
  }

})();
