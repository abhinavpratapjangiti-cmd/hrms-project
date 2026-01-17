/* ======================================================
   SIDEBAR COLLAPSE CONTROLLER
   SPA + DOM SAFE (ES6-BASIC, CSS-ALIGNED FINAL)
====================================================== */

(() => {
  if (window.__sidebarInitialized) return;
  window.__sidebarInitialized = true;

  const MOBILE_WIDTH = 768;

  const initSidebar = () => {
    const sidebar = document.querySelector(".sidebar");
    const toggleBtn = document.getElementById("sidebarToggle");

    if (!sidebar || !toggleBtn) {
      return false; // SPA retry
    }

    console.log("✅ Sidebar JS wired (CSS-aligned)");

    const isMobile = () => window.innerWidth <= MOBILE_WIDTH;

    const collapse = () => {
      document.body.classList.add("sidebar-collapsed");
      localStorage.setItem("sidebarCollapsed", "true");
    };

    const expand = () => {
      document.body.classList.remove("sidebar-collapsed");
      localStorage.setItem("sidebarCollapsed", "false");
    };

    const toggle = () => {
      document.body.classList.contains("sidebar-collapsed")
        ? expand()
        : collapse();
    };

    const initState = () => {
      const saved = localStorage.getItem("sidebarCollapsed");
      if (isMobile() || saved === "true") collapse();
      else expand();
    };

    toggleBtn.addEventListener("click", toggle);

    sidebar.addEventListener("click", e => {
      const link = e.target.closest && e.target.closest("a");
      if (link && isMobile()) collapse();
    });

    window.addEventListener("resize", initState);
    initState();

    return true;
  };

  // SPA-safe wait
  const waitForSidebar = () => {
    if (initSidebar()) return;

    const observer = new MutationObserver(() => {
      if (initSidebar()) observer.disconnect();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForSidebar);
  } else {
    waitForSidebar();
  }
})();
/* ======================================================       
    END SIDEBAR COLLAPSE CONTROLLER     
====================================================== */