/* Navigation only.
   Your existing management.js continues to handle:
   - Login
   - Bus and driver data
   - Route editing
   - Alerts
   - Firebase and cloud sync
*/

(() => {
  const app = document.getElementById("managementApp");
  const menu = document.getElementById("sideMenu");
  const backdrop = document.getElementById("menuBackdrop");
  const toggle = document.getElementById("menuToggle");

  const pages = [...document.querySelectorAll(".page-view")];
  const items = [...document.querySelectorAll(".nav-item[data-page]")];

  function closeMenu() {
    menu?.classList.remove("open");
    backdrop?.classList.remove("show");
    toggle?.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    menu?.classList.add("open");
    backdrop?.classList.add("show");
    toggle?.setAttribute("aria-expanded", "true");
  }

  function showPage(pageId) {
    const selectedPage = pages.find(page => page.id === pageId);

    if (!selectedPage) return;

    pages.forEach(page => {
      page.classList.toggle("active-page", page.id === pageId);
    });

    items.forEach(item => {
      item.classList.toggle("active", item.dataset.page === pageId);
    });

    closeMenu();

    if (pageId === "profilePage") {
      const managerName = document
        .getElementById("managerName")
        ?.textContent.trim();

      if (managerName) {
        document.getElementById("profileManagerName").textContent =
          managerName;
      }
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  // Open and close menu
  toggle?.addEventListener("click", () => {
    if (menu?.classList.contains("open")) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  document.getElementById("menuClose")?.addEventListener(
    "click",
    closeMenu
  );

  backdrop?.addEventListener("click", closeMenu);

  // Switch pages
  items.forEach(item => {
    item.addEventListener("click", () => {
      showPage(item.dataset.page);
    });
  });

  // Dashboard shortcut buttons
  document.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => {
      showPage(button.dataset.go);
    });
  });

  // Close menu with Escape key
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });

  // Show home page after successful login
  if (app) {
    const observer = new MutationObserver(() => {
      if (!app.classList.contains("hidden")) {
        showPage("homePage");
      }
    });

    observer.observe(app, {
      attributes: true,
      attributeFilter: ["class", "style"]
    });

    if (!app.classList.contains("hidden")) {
      showPage("homePage");
    }
  }
})();