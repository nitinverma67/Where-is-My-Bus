(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const DB_KEYS = {
    pickups: "wimb_demo_pickups_v2",
    notices: "wimb_demo_notices_v2",
    session: "wimb_demo_session_v2",
    management: "wimb_management_data_v1"
  };

  const DEMO_DRIVER = {
    username: "driver",
    password: "driver123",
    name: "Rajesh Sharma",
    role: "driver"
  };

  let appData = {};
  let buses = [];
  let routes = [];
  let drivers = [];
  let currentUser = null;
  let driverBus = null;
  let driverRoute = null;
  let driverMap = null;
  let routeLayer = null;
  let pickupLayer = null;

  function readStorage(key, fallback = []) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function loadAppData() {
    const managementData = readStorage(DB_KEYS.management, null);

    if (
      managementData &&
      Array.isArray(managementData.routes) &&
      Array.isArray(managementData.buses)
    ) {
      appData = managementData;
    } else {
      appData = window.APP_DATA || {};
    }

    buses = Array.isArray(appData.buses) ? appData.buses : [];
    routes = Array.isArray(appData.routes) ? appData.routes : [];
    drivers = Array.isArray(appData.drivers) ? appData.drivers : [];
  }

  function getPickups() {
    const value = readStorage(DB_KEYS.pickups, []);
    return Array.isArray(value) ? value : [];
  }

  function getNotices() {
    const value = readStorage(DB_KEYS.notices, []);
    return Array.isArray(value) ? value : [];
  }

  function routeById(id) {
    return routes.find(route => String(route.id) === String(id));
  }

  function getBusForRoute(route) {
    if (!route) return null;

    return buses.find(bus =>
      String(bus.assignedRouteId) === String(route.id) ||
      String(bus.id) === String(route.assignedBusId)
    ) || null;
  }

  function getDriverForRoute(route) {
    const bus = getBusForRoute(route);
    if (!bus) return null;

    return drivers.find(driver =>
      String(driver.id) === String(bus.assignedDriverId)
    ) || null;
  }

  function findAssignedRoute() {
    if (!currentUser) return null;

    // First, check the driver's saved route ID.
    if (currentUser.routeId) {
      const savedRoute = routeById(currentUser.routeId);
      if (savedRoute) return savedRoute;
    }

    // Match the logged-in driver with a driver record.
    const driverRecord = drivers.find(driver =>
      (driver.username && String(driver.username).toLowerCase() ===
        String(currentUser.username || "").toLowerCase()) ||
      (currentUser.driverId && String(driver.id || "") === String(currentUser.driverId)) ||
      // The demo driver login represents Rajesh Sharma. Management assigns
      // the route through the driver's name, so resolve that record too.
      (driver.name && String(driver.name).trim().toLowerCase() ===
        String(currentUser.name || "").trim().toLowerCase()) ||
      (driver.driverName && String(driver.driverName).trim().toLowerCase() ===
        String(currentUser.name || "").trim().toLowerCase())
    );

    const driverIds = [
      currentUser.driverId,
      driverRecord?.id,
      currentUser.username,
      currentUser.name,
      driverRecord?.assignedBusId,
      driverRecord?.busId
    ].filter(Boolean).map(String);

    // Find a bus assigned to this driver.
    let assignedBus = buses.find(bus =>
      driverIds.includes(String(bus.assignedDriverId || "")) ||
      driverIds.includes(String(bus.id || "")) &&
        [driverRecord?.assignedBusId, driverRecord?.busId].filter(Boolean)
          .map(String).includes(String(bus.id)) ||
      String(bus.driverName || bus.assignedDriverName || "").trim().toLowerCase() ===
        String(currentUser.name || "").trim().toLowerCase()
    );

    // If there is only one bus and it has no driver assignment,
    // use it for the demo account.
    if (!assignedBus && buses.length === 1 &&
        !buses[0].assignedDriverId && !buses[0].driverName) {
      assignedBus = buses[0];
    }

    if (assignedBus) {
      driverBus = assignedBus;

      const assignedRoute = routeById(assignedBus.assignedRouteId);
      if (assignedRoute) return assignedRoute;

      const routeUsingBus = routes.find(route =>
        String(route.assignedBusId) === String(assignedBus.id)
      );

      if (routeUsingBus) return routeUsingBus;
    }

    // Check if a route has a driver assigned directly.
    const directRoute = routes.find(route =>
      driverIds.includes(String(route.assignedDriverId || ""))
    );

    if (directRoute) return directRoute;

    return null;
  }

  function getRouteStops(route) {
    if (!route || !Array.isArray(route.stops)) return [];

    return [...route.stops].sort((a, b) =>
      Number(a.sequenceOrder || 0) - Number(b.sequenceOrder || 0)
    );
  }

  function getRoutePath(route) {
    if (!route) return [];

    return getRouteStops(route)
      .filter(stop =>
        Number.isFinite(Number(stop.lat)) &&
        Number.isFinite(Number(stop.lng))
      )
      .map(stop => [Number(stop.lat), Number(stop.lng)]);
  }

  function getRouteId() {
    return driverRoute ? String(driverRoute.id) : "";
  }

  function getPickupRouteId(pickup) {
    return String(pickup.routeId ?? pickup.route_id ?? "");
  }

  function getMyPickups() {
    if (!driverRoute) return [];

    return getPickups().filter(pickup =>
      getPickupRouteId(pickup) === getRouteId()
    );
  }

  function getMyDriverNotices() {
    if (!driverRoute || !currentUser) return [];

    return getNotices().filter(notice => {
      const sameRoute =
        String(notice.routeId ?? "") === getRouteId();

      const sender = String(
        notice.driverName || notice.sender || ""
      ).toLowerCase();

      const isMine =
        notice.source === "driver" ||
        sender === currentUser.name.toLowerCase();

      return sameRoute && isMine;
    }).sort((a, b) =>
      new Date(b.date || b.createdAt || 0) -
      new Date(a.date || a.createdAt || 0)
    );
  }

  function getManagementNotices() {
    if (!driverRoute) return [];

    return getNotices().filter(notice => {
      const audience = String(notice.audience || "both").toLowerCase();

      const isManagement =
        notice.source === "management" ||
        notice.source === "admin" ||
        (!notice.driverName &&
          (!notice.sender || /management|admin/i.test(notice.sender)));

      const isForDriver =
        audience === "both" ||
        audience === "driver" ||
        audience === "drivers";

      const noticeRoute = String(notice.routeId ?? "all");
      const isForMyRoute =
        noticeRoute === "all" ||
        noticeRoute === "" ||
        noticeRoute === getRouteId();

      return isManagement && isForDriver && isForMyRoute;
    }).sort((a, b) =>
      new Date(b.date || b.createdAt || 0) -
      new Date(a.date || a.createdAt || 0)
    );
  }

  function showLogin() {
    $("loginScreen").style.display = "flex";
    $("appScreen").style.display = "none";
  }

  function showApp() {
    $("loginScreen").style.display = "none";
    $("appScreen").style.display = "block";
  }

  function setStatus(message, type = "") {
    const element = $("routeStatus");
    element.textContent = message;
    element.className = "status-message";

    if (type) element.classList.add(type);
  }

  function updateUserDetails() {
    const name = currentUser?.name || "Driver";
    const initial = name.charAt(0).toUpperCase();

    $("userName").textContent = name;
    $("welcomeName").textContent = name;
    $("sidebarName").textContent = name;

    $("sidebarAvatar").textContent = initial;
    $("topbarAvatar").textContent = initial;
    $("userRole").textContent = "Bus Driver";
  }

  function updateRouteDetails() {
    if (!driverRoute) {
      $("busNumber").textContent = "--";
      $("busModel").textContent = "No bus assigned";
      $("routeName").textContent = "Not assigned";
      $("routeCode").textContent = "No route available";
      $("departureTime").textContent = "--";
      $("arrivalTime").textContent = "Arrival: --";
      $("driverRouteTitle").textContent = "No route assigned to your account.";

      $("driverRouteInfo").innerHTML = `
        <div class="route-info-item">
          <span>Starting Point</span><strong>--</strong>
        </div>
        <div class="route-info-item">
          <span>Destination</span><strong>--</strong>
        </div>
        <div class="route-info-item">
          <span>Total Distance</span><strong>--</strong>
        </div>
        <div class="route-info-item">
          <span>Driver Contact</span><strong>--</strong>
        </div>
      `;

      setStatus(
        "No route is assigned to this driver. Ask management to assign a bus and route.",
        "error"
      );

      return;
    }

    driverBus = driverBus || getBusForRoute(driverRoute);

    const busNumber = driverBus?.busNumber || "--";
    const busModel = driverBus?.model || "--";
    const routeName =
      driverRoute.routeName ||
      `${driverRoute.startPoint || ""} - ${driverRoute.destination || ""}`;

    const startTime =
      driverRoute.scheduledStartTime ||
      driverRoute.departureTime || "--";

    const endTime =
      driverRoute.scheduledArrivalTime ||
      driverRoute.arrivalTime || "--";

    const driverRecord = getDriverForRoute(driverRoute);
    const phone =
      driverBus?.driverPhone ||
      driverBus?.phone ||
      driverRecord?.phone ||
      "--";

    $("busNumber").textContent = busNumber;
    $("busModel").textContent = busModel;
    $("routeName").textContent = routeName;
    $("routeCode").textContent = driverRoute.routeCode || "Assigned route";
    $("departureTime").textContent = startTime;
    $("arrivalTime").textContent = `Arrival: ${endTime}`;

    $("driverRouteTitle").textContent = routeName;

    $("driverRouteInfo").innerHTML = `
      <div class="route-info-item">
        <span>Starting Point</span>
        <strong>${escapeHTML(driverRoute.startPoint || "--")}</strong>
      </div>
      <div class="route-info-item">
        <span>Destination</span>
        <strong>${escapeHTML(driverRoute.destination || "--")}</strong>
      </div>
      <div class="route-info-item">
        <span>Total Distance</span>
        <strong>${escapeHTML(driverRoute.totalDistanceKm || "--")} km</strong>
      </div>
      <div class="route-info-item">
        <span>Driver Contact</span>
        <strong>${escapeHTML(phone)}</strong>
      </div>
    `;

    setStatus("Your assigned route is loaded.", "success");
  }

  function formatDate(dateValue) {
    if (!dateValue) return "Date not available";

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return String(dateValue);
    }

    return date.toLocaleString();
  }

  function getPickupName(pickup) {
    return pickup.pickupName ||
      pickup.location ||
      pickup.stopName ||
      pickup.landmark ||
      pickup.address ||
      "Pickup location";
  }

  function getPickupStudent(pickup) {
    return pickup.studentName ||
      pickup.name ||
      pickup.student ||
      "Student";
  }

  function renderPickups() {
    const pickups = getMyPickups();

    $("pickupCount").textContent = pickups.length;
    $("pickupCountLabel").textContent =
      `${pickups.length} Pickup${pickups.length === 1 ? "" : "s"}`;

    const container = $("driverPickups");

    if (!pickups.length) {
      container.innerHTML = `
        <div class="empty-state">
          No student pickup points are available for your route.
        </div>
      `;
      return;
    }

    container.innerHTML = pickups.map((pickup, index) => `
      <article class="pickup-item">
        <div class="pickup-number">${index + 1}</div>
        <div class="pickup-details">
          <strong>${escapeHTML(getPickupName(pickup))}</strong>
          <p>Student: ${escapeHTML(getPickupStudent(pickup))}</p>
          <p>${escapeHTML(pickup.phone || pickup.studentPhone || "Contact not available")}</p>
        </div>
      </article>
    `).join("");
  }

  function renderNotices() {
    const notices = getMyDriverNotices();
    const container = $("driverNotices");

    if (!notices.length) {
      container.innerHTML = `
        <div class="empty-state">You have not sent any notices yet.</div>
      `;
      return;
    }

    container.innerHTML = notices.map(notice => `
      <article class="notice-item">
        <strong>${escapeHTML(notice.title || "Route notice")}</strong>
        <p>${escapeHTML(notice.body || notice.message || "")}</p>
        <small>${escapeHTML(formatDate(notice.date || notice.createdAt))}</small>
      </article>
    `).join("");
  }

  function renderManagementAnnouncements() {
    const notices = getManagementNotices();
    const container = $("driverManagementNotices");

    if (!notices.length) {
      container.innerHTML = `
        <div class="empty-state">No management announcements available.</div>
      `;
      return;
    }

    container.innerHTML = notices.map(notice => `
      <article class="announcement-item">
        <strong>${escapeHTML(notice.title || "Management Announcement")}</strong>
        <p>${escapeHTML(notice.body || notice.message || "")}</p>
        <small>${escapeHTML(formatDate(notice.date || notice.createdAt))}</small>
      </article>
    `).join("");
  }

  function initDriverMap() {
    if (!window.L || driverMap) return;

    driverMap = L.map("driverMap").setView([22.7196, 75.8577], 11);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(driverMap);

    routeLayer = L.layerGroup().addTo(driverMap);
    pickupLayer = L.layerGroup().addTo(driverMap);
  }

  function renderDriverMap() {
    initDriverMap();

    if (!driverMap) return;

    routeLayer.clearLayers();
    pickupLayer.clearLayers();

    if (!driverRoute) {
      driverMap.setView([22.7196, 75.8577], 11);
      return;
    }

    const path = getRoutePath(driverRoute);

    if (path.length) {
      const line = L.polyline(path, {
        color: "#c62828",
        weight: 5,
        opacity: 0.85
      }).addTo(routeLayer);

      const stops = getRouteStops(driverRoute);

      stops.forEach((stop, index) => {
        if (!Number.isFinite(Number(stop.lat)) ||
            !Number.isFinite(Number(stop.lng))) return;

        L.marker([Number(stop.lat), Number(stop.lng)])
          .bindPopup(`
            <strong>${escapeHTML(stop.name || stop.landmark || "Route Stop")}</strong>
            <br>Stop ${index + 1}
            ${stop.scheduledTime ? `<br>Time: ${escapeHTML(stop.scheduledTime)}` : ""}
          `)
          .addTo(routeLayer);
      });

      driverMap.fitBounds(line.getBounds(), { padding: [25, 25] });
    }

    getMyPickups().forEach(pickup => {
      const lat = Number(pickup.lat ?? pickup.latitude);
      const lng = Number(pickup.lng ?? pickup.longitude);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      L.circleMarker([lat, lng], {
        radius: 8,
        color: "#ffffff",
        weight: 2,
        fillColor: "#2563eb",
        fillOpacity: 1
      })
        .bindPopup(`
          <strong>${escapeHTML(getPickupName(pickup))}</strong>
          <br>Student: ${escapeHTML(getPickupStudent(pickup))}
        `)
        .addTo(pickupLayer);
    });

    const refreshMapSize = () => {
      if (!driverMap) return;
      requestAnimationFrame(() => driverMap.invalidateSize({ pan: false }));
    };
    setTimeout(refreshMapSize, 100);
    setTimeout(refreshMapSize, 350);
    driverMap.off("zoomend", refreshMapSize);
    driverMap.on("zoomend", refreshMapSize);
  }

  function renderDriver() {
    loadAppData();

    driverBus = null;
    driverRoute = findAssignedRoute();

    updateUserDetails();
    updateRouteDetails();
    renderPickups();
    renderNotices();
    renderManagementAnnouncements();
    renderDriverMap();
  }

  function sendNotice(event) {
    event.preventDefault();

    if (!driverRoute) {
      $("noticeFeedback").textContent =
        "You cannot send a notice because no route is assigned.";
      $("noticeFeedback").className = "form-feedback error";
      return;
    }

    const title = $("noticeTitle").value.trim();
    const body = $("noticeBody").value.trim();

    if (!title || !body) return;

    const notices = getNotices();

    const newNotice = {
      id: "driver_" + Date.now(),
      source: "driver",
      audience: "student",
      routeId: driverRoute.id,
      sender: currentUser.name,
      driverName: currentUser.name,
      title,
      body,
      date: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    notices.push(newNotice);
    writeStorage(DB_KEYS.notices, notices);

    $("noticeForm").reset();

    $("noticeFeedback").textContent =
      "Notice sent successfully to students on your route.";

    $("noticeFeedback").className = "form-feedback success";

    renderNotices();

    window.dispatchEvent(new Event("wimb:data-updated"));
  }

  function login(event) {
    event.preventDefault();

    const username = $("username").value.trim();
    const password = $("password").value;

    const driverRecord = drivers.find(driver =>
      String(driver.username || "").toLowerCase() === username.toLowerCase() &&
      String(driver.password || "") === password
    );

    if (
      username === DEMO_DRIVER.username &&
      password === DEMO_DRIVER.password
    ) {
      currentUser = {
        username: DEMO_DRIVER.username,
        name: DEMO_DRIVER.name,
        role: "driver"
      };
    } else if (driverRecord) {
      currentUser = {
        username: driverRecord.username,
        password: driverRecord.password,
        name: driverRecord.name || driverRecord.driverName || "Driver",
        driverId: driverRecord.id,
        routeId: driverRecord.routeId || driverRecord.assignedRouteId,
        role: "driver"
      };
    } else {
      $("loginError").textContent = "Invalid username or password.";
      return;
    }

    writeStorage(DB_KEYS.session, currentUser);
    $("loginError").textContent = "";

    showApp();
    renderDriver();
  }

  function logout() {
    localStorage.removeItem(DB_KEYS.session);
    currentUser = null;
    driverRoute = null;
    driverBus = null;

    if (driverMap) {
      driverMap.remove();
      driverMap = null;
      routeLayer = null;
      pickupLayer = null;
    }

    $("loginForm").reset();
    showLogin();
  }

  function restoreSession() {
    const session = readStorage(DB_KEYS.session, null);

    if (!session || session.role !== "driver") {
      showLogin();
      return;
    }

    currentUser = session;
    showApp();
    renderDriver();
  }

  function setupNavigation() {
    const menuToggle = $("menuToggle");
    const sidebar = $("sidebar");

    menuToggle.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });

    document.querySelectorAll(".nav-link").forEach(link => {
      link.addEventListener("click", () => {
        document.querySelectorAll(".nav-link").forEach(item =>
          item.classList.remove("active")
        );

        link.classList.add("active");
        sidebar.classList.remove("open");
      });
    });

    document.addEventListener("click", event => {
      if (
        window.innerWidth <= 760 &&
        sidebar.classList.contains("open") &&
        !sidebar.contains(event.target) &&
        !menuToggle.contains(event.target)
      ) {
        sidebar.classList.remove("open");
      }
    });
  }

  function setupLiveUpdates() {
    const refreshDriverMap = () => {
      if (driverMap) {
        setTimeout(() => driverMap && driverMap.invalidateSize({ pan: false }), 120);
      }
    };
    window.addEventListener("resize", refreshDriverMap);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshDriverMap();
    });

    window.addEventListener("storage", event => {
      if (
        !event.key ||
        [
          DB_KEYS.pickups,
          DB_KEYS.notices,
          DB_KEYS.management
        ].includes(event.key)
      ) {
        if (currentUser) renderDriver();
      }
    });

    window.addEventListener("wimb:data-updated", () => {
      if (currentUser) renderDriver();
    });
  }

  function start() {
    loadAppData();

    $("loginForm").addEventListener("submit", login);
    $("logoutBtn").addEventListener("click", logout);
    $("noticeForm").addEventListener("submit", sendNotice);

    setupNavigation();
    setupLiveUpdates();
    restoreSession();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();