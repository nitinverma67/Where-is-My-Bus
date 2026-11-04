
(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  const KEYS = {
    data: "wimb_management_data_v1",
    notices: "wimb_demo_notices_v2",
    session: "wimb_management_session_v1"
  };

  const LOGIN = {
    username: "admin",
    password: "admin123",
    name: "Bus Administrator"
  };

  const originalData = window.APP_DATA || {};
  let data = loadSavedData();
  let routes = data.routes;
  let buses = data.buses;
  let drivers = data.drivers;
  let notices = loadNotices();
  let selectedRouteId = "";
  let selectedBusId = "";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function loadSavedData() {
    try {
      const saved = localStorage.getItem(KEYS.data);
      const parsed = saved ? JSON.parse(saved) : null;

      if (parsed && Array.isArray(parsed.routes) && Array.isArray(parsed.buses)) {
        return {
          routes: parsed.routes,
          buses: parsed.buses,
          drivers: Array.isArray(parsed.drivers) ? parsed.drivers : []
        };
      }
    } catch (error) {
      console.error("Could not load saved management data:", error);
    }

    return {
      routes: clone(originalData.routes || []),
      buses: clone(originalData.buses || []),
      drivers: clone(originalData.drivers || [])
    };
  }

  function loadNotices() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEYS.notices) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  }

  function saveData() {
    data = { routes, buses, drivers };

    try {
      localStorage.setItem(KEYS.data, JSON.stringify(data));
      window.APP_DATA = data;
      window.dispatchEvent(new CustomEvent("wimb:data-updated", {
        detail: { key: KEYS.data }
      }));
      return true;
    } catch (error) {
      console.error("Could not save data:", error);
      alert("Could not save changes. Check your browser storage.");
      return false;
    }
  }

  function saveNotices() {
    try {
      localStorage.setItem(KEYS.notices, JSON.stringify(notices));
      return true;
    } catch (error) {
      console.error("Could not save alerts:", error);
      alert("Could not save the alert. Check your browser storage.");
      return false;
    }
  }

  function text(value) {
    return String(value ?? "");
  }

  function escapeHTML(value) {
    return text(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function makeId(prefix) {
    return prefix + "-" + Date.now() + "-" +
      Math.random().toString(36).slice(2, 7);
  }

  function getRoute(id) {
    return routes.find(route => text(route.id) === text(id));
  }

  function getBus(id) {
    return buses.find(bus => text(bus.id) === text(id));
  }

  function getDriver(id) {
    return drivers.find(driver => text(driver.id) === text(id));
  }

  function getBusForRoute(route) {
    if (!route) return null;

    return buses.find(bus =>
      text(bus.id) === text(route.assignedBusId) ||
      text(bus.assignedRouteId) === text(route.id)
    ) || null;
  }

  function getDriverForBus(bus) {
    if (!bus) return null;

    return getDriver(bus.assignedDriverId) ||
      drivers.find(driver =>
        text(driver.assignedBusId) === text(bus.id) ||
        text(driver.busId) === text(bus.id)
      ) || null;
  }

  function getStopName(stop) {
    return text(stop.name || stop.stopName || stop.location);
  }

  function getStopLandmark(stop) {
    return text(stop.landmark || stop.nearbyLandmark);
  }

  function setVisible(element, visible) {
    if (element) element.classList.toggle("hidden", !visible);
  }

  function fillSelect(select, items, placeholder, getId, getLabel) {
    if (!select) return;

    const oldValue = select.value;
    select.innerHTML = "";

    const option = document.createElement("option");
    option.value = "";
    option.textContent = placeholder;
    select.appendChild(option);

    items.forEach(item => {
      const itemOption = document.createElement("option");
      itemOption.value = text(getId(item));
      itemOption.textContent = text(getLabel(item));
      select.appendChild(itemOption);
    });

    if (items.some(item => text(getId(item)) === oldValue)) {
      select.value = oldValue;
    }
  }

  function routeLabel(route) {
    return `${route.routeCode || route.id || "Route"} - ${
      route.routeName || `${route.startPoint || ""} to ${route.destination || ""}`
    }`;
  }

  function busLabel(bus) {
    return `${bus.busNumber || bus.id || "Bus"}${
      bus.model ? " - " + bus.model : ""
    }`;
  }

  function showFeedback(element, message) {
    if (!element) return;
    element.textContent = message;
    setVisible(element, true);
  }

  function renderStats() {
    $("#routeCount").textContent = routes.length;
    $("#busCount").textContent = buses.length;
    $("#driverCount").textContent = drivers.length;
  }

  function renderSelectors() {
    fillSelect(
      $("#routeSelector"),
      routes,
      "Select a route",
      route => route.id,
      routeLabel
    );

    fillSelect(
      $("#assignedBus"),
      buses,
      "No bus assigned",
      bus => bus.id,
      busLabel
    );

    fillSelect(
      $("#busSelector"),
      buses,
      "Select a bus",
      bus => bus.id,
      busLabel
    );

    fillSelect(
      $("#noticeRoute"),
      routes,
      "All routes",
      route => route.id,
      routeLabel
    );

    $("#noticeRoute").querySelector('option[value=""]').value = "all";
  }

  function renderAll() {
    renderStats();
    renderSelectors();
    renderRouteList();
    renderNoticeList();
  }

  function renderRouteList() {
    const container = $("#routeList");
    if (!container) return;

    if (!routes.length) {
      container.innerHTML = '<p class="muted">No routes are available.</p>';
      return;
    }

    container.innerHTML = routes.map(route => {
      const bus = getBusForRoute(route);
      const stops = Array.isArray(route.stops) ? route.stops : [];

      return `
        <article class="route-card">
          <h3>${escapeHTML(route.routeCode || route.id)}:
              ${escapeHTML(route.routeName || "Unnamed route")}</h3>
          <p><strong>From:</strong> ${escapeHTML(route.startPoint)}</p>
          <p><strong>To:</strong> ${escapeHTML(route.destination)}</p>
          <p><strong>Departure:</strong>
              ${escapeHTML(route.scheduledStartTime || route.departureTime || "Not set")}</p>
          <p><strong>Arrival:</strong>
              ${escapeHTML(route.scheduledArrivalTime || route.arrivalTime || "Not set")}</p>
          <p><strong>Bus:</strong> ${escapeHTML(bus ? bus.busNumber : "Not assigned")}</p>
          <p><strong>Stops:</strong> ${stops.length}</p>
          <div class="actions">
            <button type="button" data-edit-route="${escapeHTML(route.id)}">
              Edit route
            </button>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderNoticeList() {
    const container = $("#noticeList");
    if (!container) return;

    if (!notices.length) {
      container.innerHTML = '<p class="muted">No management alerts have been published.</p>';
      return;
    }

    container.innerHTML = notices.slice().reverse().map(notice => {
      const audience = {
        both: "Students and drivers",
        student: "Students only",
        driver: "Drivers only"
      }[notice.audience] || notice.audience || "All users";

      const route = notice.routeId && notice.routeId !== "all"
        ? getRoute(notice.routeId)
        : null;

      return `
        <article class="notice-card">
          <h3>${escapeHTML(notice.title)}</h3>
          <p>${escapeHTML(notice.body)}</p>
          <p class="muted">
            Audience: ${escapeHTML(audience)} |
            Route: ${escapeHTML(route ? routeLabel(route) : "All routes")}
          </p>
          <p class="muted">${escapeHTML(notice.createdAt || "")}</p>
        </article>
      `;
    }).join("");
  }

  function openRouteEditor(routeId) {
    const route = getRoute(routeId);
    if (!route) return;

    selectedRouteId = text(route.id);
    $("#routeSelector").value = selectedRouteId;

    $("#routeCode").value = text(route.routeCode);
    $("#routeName").value = text(route.routeName);
    $("#startPoint").value = text(route.startPoint);
    $("#destination").value = text(route.destination);

    $("#departureTime").value = text(
      route.scheduledStartTime || route.departureTime
    );

    $("#arrivalTime").value = text(
      route.scheduledArrivalTime || route.arrivalTime
    );

    $("#distanceKm").value = route.totalDistanceKm ?? route.distanceKm ?? "";

    const assignedBus = getBusForRoute(route);
    $("#assignedBus").value = assignedBus ? text(assignedBus.id) : "";

    renderStopsEditor(route);
    setVisible($("#routeEditor"), true);
  }

  function renderStopsEditor(route) {
    const container = $("#stopsEditor");
    const stops = Array.isArray(route.stops) ? route.stops : [];

    if (!stops.length) {
      container.innerHTML = '<p class="muted">No stops added yet. Use Add stop.</p>';
      return;
    }

    container.innerHTML = stops.map((stop, index) => `
      <div class="stop-editor" data-stop-index="${index}">
        <div class="top-actions">
          <strong>Stop ${index + 1}</strong>
          <button type="button" class="danger" data-remove-stop="${index}">
            Remove stop
          </button>
        </div>

        <div class="form-grid">
          <div class="field">
            <label>Stop name</label>
            <input data-stop-field="name" value="${escapeHTML(getStopName(stop))}" required>
          </div>

          <div class="field">
            <label>Landmark</label>
            <input data-stop-field="landmark" value="${escapeHTML(getStopLandmark(stop))}">
          </div>

          <div class="field">
            <label>Scheduled time</label>
            <input data-stop-field="scheduledTime"
              value="${escapeHTML(stop.scheduledTime || stop.time || "")}"
              placeholder="07:10 AM">
          </div>

          <div class="field">
            <label>Sequence order</label>
            <input data-stop-field="sequenceOrder" type="number" min="1"
              value="${escapeHTML(stop.sequenceOrder ?? index + 1)}">
          </div>

          <div class="field">
            <label>Latitude</label>
            <input data-stop-field="lat" type="number" step="any"
              value="${escapeHTML(stop.lat ?? "")}">
          </div>

          <div class="field">
            <label>Longitude</label>
            <input data-stop-field="lng" type="number" step="any"
              value="${escapeHTML(stop.lng ?? "")}">
          </div>
        </div>
      </div>
    `).join("");
  }

  function readStopsFromEditor() {
    const cards = [...$("#stopsEditor").querySelectorAll(".stop-editor")];

    return cards.map((card, index) => {
      const oldStop = getRoute(selectedRouteId)?.stops?.[index] || {};
      const getValue = field =>
        card.querySelector(`[data-stop-field="${field}"]`)?.value.trim() ?? "";

      const stop = {
        ...oldStop,
        id: oldStop.id || makeId("stop"),
        name: getValue("name"),
        landmark: getValue("landmark"),
        scheduledTime: getValue("scheduledTime"),
        sequenceOrder: Number(getValue("sequenceOrder")) || index + 1
      };

      const lat = getValue("lat");
      const lng = getValue("lng");

      if (lat !== "") stop.lat = Number(lat);
      else delete stop.lat;

      if (lng !== "") stop.lng = Number(lng);
      else delete stop.lng;

      return stop;
    }).sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  }

  function saveRoute(event) {
    event.preventDefault();

    const route = getRoute(selectedRouteId);
    if (!route) return;

    const assignedBusId = $("#assignedBus").value;

    route.routeCode = $("#routeCode").value.trim();
    route.routeName = $("#routeName").value.trim();
    route.startPoint = $("#startPoint").value.trim();
    route.destination = $("#destination").value.trim();
    route.scheduledStartTime = $("#departureTime").value.trim();
    route.scheduledArrivalTime = $("#arrivalTime").value.trim();

    const distance = $("#distanceKm").value;
    route.totalDistanceKm = distance === "" ? null : Number(distance);
    route.stops = readStopsFromEditor();
    route.assignedBusId = assignedBusId || "";

    if (route.departureTime !== undefined) {
      route.departureTime = route.scheduledStartTime;
    }

    if (route.arrivalTime !== undefined) {
      route.arrivalTime = route.scheduledArrivalTime;
    }

    buses.forEach(bus => {
      if (text(bus.assignedRouteId) === text(route.id)) {
        bus.assignedRouteId = "";
      }
    });

    const bus = getBus(assignedBusId);
    if (bus) {
      bus.assignedRouteId = route.id;
      // Keep both sides of the route/bus relationship in sync.
      route.assignedBusId = bus.id;
      const assignedDriver = getDriverForBus(bus);
      if (assignedDriver) {
        route.assignedDriverId = assignedDriver.id;
        bus.driverName = assignedDriver.name || bus.driverName || "";
        bus.driverPhone = assignedDriver.phone || bus.driverPhone || "";
      }
    } else {
      route.assignedBusId = "";
      delete route.assignedDriverId;
    }

    if (saveData()) {
      renderAll();
      openRouteEditor(route.id);
      alert("Route changes saved successfully.");
    }
  }

  function addStop() {
    const route = getRoute(selectedRouteId);
    if (!route) {
      alert("Select a route first.");
      return;
    }

    const stops = readStopsFromEditor();
    stops.push({
      id: makeId("stop"),
      name: "",
      landmark: "",
      scheduledTime: "",
      sequenceOrder: stops.length + 1
    });

    route.stops = stops;
    renderStopsEditor(route);
  }

  function removeStop(index) {
    const route = getRoute(selectedRouteId);
    if (!route) return;

    const stops = readStopsFromEditor();
    stops.splice(index, 1);
    stops.forEach((stop, i) => stop.sequenceOrder = i + 1);

    route.stops = stops;
    renderStopsEditor(route);
  }

  function openBusEditor(busId) {
    const bus = getBus(busId);
    if (!bus) return;

    selectedBusId = text(bus.id);
    $("#busSelector").value = selectedBusId;

    const driver = getDriverForBus(bus);

    $("#busNumber").value = text(bus.busNumber);
    $("#busModel").value = text(bus.model);
    $("#busCapacity").value = bus.capacity ?? "";
    $("#driverName").value = text(
      driver?.name || bus.driverName || bus.assignedDriverName
    );
    $("#driverPhone").value = text(
      driver?.phone || bus.driverPhone || bus.assignedDriverPhone
    );
    $("#busStatus").value = text(bus.status || "available");

    setVisible($("#busForm"), true);
  }

  function saveBus(event) {
    event.preventDefault();

    const bus = getBus(selectedBusId);
    if (!bus) return;

    bus.busNumber = $("#busNumber").value.trim();
    bus.model = $("#busModel").value.trim();
    bus.capacity = $("#busCapacity").value === ""
      ? null
      : Number($("#busCapacity").value);
    bus.status = $("#busStatus").value;

    const name = $("#driverName").value.trim();
    const phone = $("#driverPhone").value.trim();

    let driver = getDriverForBus(bus);

    if (!driver) {
      driver = {
        id: makeId("driver"),
        assignedBusId: bus.id
      };
      drivers.push(driver);
    }

    driver.name = name;
    driver.phone = phone;
    driver.assignedBusId = bus.id;

    bus.assignedDriverId = driver.id;
    bus.driverName = name;
    bus.driverPhone = phone;

    // Store the driver's current route on the driver record as well.
    const linkedRoute = routes.find(route =>
      text(route.assignedBusId) === text(bus.id) ||
      text(route.id) === text(bus.assignedRouteId)
    );
    if (linkedRoute) {
      driver.routeId = linkedRoute.id;
      driver.assignedRouteId = linkedRoute.id;
      linkedRoute.assignedBusId = bus.id;
      linkedRoute.assignedDriverId = driver.id;
    }

    if (saveData()) {
      renderAll();
      openBusEditor(bus.id);
      alert("Bus and driver details saved successfully.");
    }
  }

  function publishNotice(event) {
    event.preventDefault();

    const title = $("#noticeTitle").value.trim();
    const body = $("#noticeBody").value.trim();
    const audience = $("#noticeAudience").value;
    const routeId = $("#noticeRoute").value || "all";

    if (!title || !body) {
      alert("Enter an alert title and message.");
      return;
    }

    const notice = {
      id: makeId("notice"),
      title,
      body,
      audience,
      routeId,
      createdAt: new Date().toLocaleString()
    };

    notices.push(notice);

    if (!saveNotices()) {
      notices.pop();
      return;
    }

    $("#noticeForm").reset();
    $("#noticeRoute").value = "all";

    showFeedback(
      $("#noticeFeedback"),
      "Alert saved in this browser. To deliver it to other students and drivers, connect this portal to a shared database and notification system."
    );

    renderNoticeList();
  }

  function exportBackup() {
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      routes,
      buses,
      drivers,
      notices
    };

    const blob = new Blob(
      [JSON.stringify(backup, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "bus-management-backup.json";
    anchor.click();
    URL.revokeObjectURL(url);

    showFeedback($("#backupFeedback"), "Backup exported.");
  }

  function importBackupFile(file) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const backup = JSON.parse(reader.result);

        if (!Array.isArray(backup.routes) || !Array.isArray(backup.buses)) {
          throw new Error("The file does not contain valid routes and buses.");
        }

        if (!confirm("Importing will replace the current browser data. Continue?")) {
          return;
        }

        routes = backup.routes;
        buses = backup.buses;
        drivers = Array.isArray(backup.drivers) ? backup.drivers : [];
        notices = Array.isArray(backup.notices) ? backup.notices : [];

        if (saveData()) {
          saveNotices();
          selectedRouteId = "";
          selectedBusId = "";
          setVisible($("#routeEditor"), false);
          setVisible($("#busForm"), false);
          renderAll();
          showFeedback($("#backupFeedback"), "Backup imported successfully.");
        }
      } catch (error) {
        showFeedback(
          $("#backupFeedback"),
          "Import failed: " + error.message
        );
      }
    };

    reader.onerror = () => {
      showFeedback($("#backupFeedback"), "Could not read the selected file.");
    };

    reader.readAsText(file);
  }

  function login(event) {
    event.preventDefault();

    const username = $("#managerUsername").value.trim();
    const password = $("#managerPassword").value;

    if (username !== LOGIN.username || password !== LOGIN.password) {
      $("#loginError").textContent = "Invalid username or password.";
      return;
    }

    localStorage.setItem(KEYS.session, JSON.stringify({
      username,
      name: LOGIN.name
    }));

    openManagement();
  }

  function openManagement() {
    setVisible($("#loginScreen"), false);
    setVisible($("#managementApp"), true);
    setVisible($("#logoutBtn"), true);

    $("#managerName").textContent = LOGIN.name;
    $("#loginError").textContent = "";

    renderAll();
  }

  function logout() {
    localStorage.removeItem(KEYS.session);

    setVisible($("#managementApp"), false);
    setVisible($("#loginScreen"), true);
    setVisible($("#logoutBtn"), false);

    $("#managerName").textContent = "";
    $("#loginForm").reset();
  }

  function restoreSession() {
    try {
      const session = JSON.parse(localStorage.getItem(KEYS.session) || "null");

      if (session?.username === LOGIN.username) {
        openManagement();
      } else {
        setVisible($("#managementApp"), false);
        setVisible($("#loginScreen"), true);
        setVisible($("#logoutBtn"), false);
      }
    } catch {
      logout();
    }
  }

  function wireEvents() {
    $("#loginForm").addEventListener("submit", login);
    $("#logoutBtn").addEventListener("click", logout);

    $("#routeSelector").addEventListener("change", event => {
      if (!event.target.value) {
        selectedRouteId = "";
        setVisible($("#routeEditor"), false);
        return;
      }

      openRouteEditor(event.target.value);
    });

    $("#routeForm").addEventListener("submit", saveRoute);
    $("#addStopBtn").addEventListener("click", addStop);

    $("#stopsEditor").addEventListener("click", event => {
      const button = event.target.closest("[data-remove-stop]");
      if (!button) return;

      removeStop(Number(button.dataset.removeStop));
    });

    $("#routeList").addEventListener("click", event => {
      const button = event.target.closest("[data-edit-route]");
      if (!button) return;

      openRouteEditor(button.dataset.editRoute);
      window.scrollTo({ top: $("#routeEditor").offsetTop, behavior: "smooth" });
    });

    $("#busSelector").addEventListener("change", event => {
      if (!event.target.value) {
        selectedBusId = "";
        setVisible($("#busForm"), false);
        return;
      }

      openBusEditor(event.target.value);
    });

    $("#busForm").addEventListener("submit", saveBus);
    $("#noticeForm").addEventListener("submit", publishNotice);

    $("#exportBtn").addEventListener("click", exportBackup);

    $("#importBtn").addEventListener("click", () => {
      $("#importFile").click();
    });

    $("#importFile").addEventListener("change", event => {
      importBackupFile(event.target.files?.[0]);
      event.target.value = "";
    });
  }

  function initialize() {
    setVisible($("#logoutBtn"), false);

    if (!routes.length) {
      console.warn("No routes found. Check data.js and its APP_DATA structure.");
    }

    wireEvents();
    restoreSession();
  }

  initialize();

  // Seed the shared database with the current/default management data only
  // when no shared record exists yet. Existing cloud data takes precedence.
  if (window.WIMBCloud && window.database) {
    window.WIMBCloud.seed("wimb_management_data_v1", {
      routes: routes,
      buses: buses,
      drivers: drivers
    });
    if (notices.length) {
      window.WIMBCloud.seed("wimb_demo_notices_v2", notices);
    }
  }
})();
