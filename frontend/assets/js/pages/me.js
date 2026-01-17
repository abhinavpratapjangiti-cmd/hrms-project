/* =====================================================
   me.js — FINAL, ZIP-COMPATIBLE, BACKEND-ALIGNED
   🔒 DO NOT REMOVE GLOBAL FUNCTIONS
===================================================== */
(function () {
  if (window.__meLoaded) return;
  window.__meLoaded = true;

  console.log("👤 me.js loaded");

  const token = localStorage.getItem("token") || "";

  function authHeaders() {
    return { Authorization: "Bearer " + token };
  }

  function el(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    const e = el(id);
    if (e) e.innerText = value ?? "—";
  }

  /* =========================
     SAFE TOAST (ZIP SAFE)
  ========================== */
  function safeToast(message, type = "info") {
    if (typeof window.showToast === "function") {
      window.showToast(message, type);
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }

  /* =========================
     PAGE INIT (SPA SAFE)
  ========================== */
  async function initMe() {
    if (initMe.__ran) return;
    initMe.__ran = true;

    if (!el("profileNameHeader")) return;

    initProfileTabs();
    bindCVUpload();
    bindCVView();

    await loadEmployeeProfile();
    await loadProfessionalProfile();

    loadProfileTimeline();
    loadProfileAnalytics();
    loadProfileDecisions();
  }

  /* =========================
     EMPLOYEE CORE PROFILE
     API: /api/employees/me
  ========================== */
  async function loadEmployeeProfile() {
    try {
      const res = await fetch("/api/employees/me", {
        headers: authHeaders()
      });
      if (!res.ok) throw new Error();

      const emp = await res.json();

      setText("profileNameHeader", emp.name);
      setText("profileEmail", emp.email);
      setText("profileDesignationHeader", emp.designation);

      setText("jobDepartment", emp.department);
      setText("jobDesignation", emp.designation);
      setText("jobType", emp.employment_type);

      setText("lastLogin", "Today");
      setText("profileStatus", emp.status || "Active");

      const badge = document.querySelector(".status-badge");
      if (badge) badge.innerText = emp.status || "Active";

      const avatar = el("profileAvatar");
      const initialsEl = el("profileInitials");

      if (emp.profile_photo && avatar) {
        avatar.style.backgroundImage = `url(${emp.profile_photo})`;
        avatar.classList.add("has-image");
        if (initialsEl) initialsEl.style.display = "none";
      } else if (initialsEl && emp.name) {
        initialsEl.innerText = emp.name
          .split(" ")
          .map(w => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();
        initialsEl.style.display = "block";
      }

      checkCVStatus();

    } catch (err) {
      console.error("Employee profile load failed", err);
    }
  }

  /* =========================
     PROFESSIONAL PROFILE
     API: /api/profile/me
  ========================== */
  async function loadProfessionalProfile() {
    try {
      const res = await fetch("/api/profile/me", {
        headers: authHeaders()
      });
      if (!res.ok) throw new Error();

      const p = await res.json();

      if (el("professionalSummary")) {
        el("professionalSummary").value = p.summary || "";
      }

      if (el("certifications") && Array.isArray(p.certifications)) {
        el("certifications").value = p.certifications.join(", ");
      }

      if (el("keySkills") && Array.isArray(p.skills)) {
        el("keySkills").value = p.skills.join(", ");
      }

    } catch {
      console.warn("Professional profile unavailable");
    }
  }

  /* =========================
     SAVE PROFESSIONAL PROFILE
     API: /api/profile/save
  ========================== */
  async function saveProfile() {
    const summary = el("professionalSummary")?.value || "";

    const certifications = (el("certifications")?.value || "")
      .split(",")
      .map(c => c.trim())
      .filter(Boolean);

    const skills = (el("keySkills")?.value || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/profile/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token
        },
        body: JSON.stringify({
          summary,
          certifications,
          skills
        })
      });

      if (!res.ok) throw new Error();

      safeToast("Profile updated successfully", "success");

    } catch {
      safeToast("Failed to update profile", "error");
    }
  }

  /* =====================================================
     🔒 GLOBAL FUNCTIONS (ZIP + TIMESHEETS SAFE)
     ❗ DO NOT REMOVE
  ===================================================== */

  window.openEditProfile = saveProfile;
  window.openProfileBuilder = saveProfile; // ZIP legacy
  window.downloadGeneratedResume = function () {
    safeToast("Resume generation is in progress", "info");
  };

  /* =========================
     CV STATUS + UPLOAD + VIEW
  ========================== */
  async function checkCVStatus() {
    const statusEl = el("cvStatus");
    if (!statusEl) return;

    try {
      const res = await fetch("/api/documents/cv/my", {
        headers: authHeaders()
      });
      statusEl.innerText = res.ok ? "Uploaded" : "Not uploaded";
    } catch {
      statusEl.innerText = "Not uploaded";
    }
  }

  function bindCVUpload() {
    const uploadBtn = el("uploadCvBtn");
    const fileInput = el("cvFile");
    const statusEl = el("cvStatus");

    if (!uploadBtn || !fileInput) return;

    uploadBtn.onclick = () => fileInput.click();

    fileInput.onchange = async () => {
      if (!fileInput.files[0]) return;

      const fd = new FormData();
      fd.append("cv", fileInput.files[0]);

      if (statusEl) statusEl.innerText = "Uploading…";

      try {
        const res = await fetch("/api/documents/cv", {
          method: "POST",
          headers: authHeaders(),
          body: fd
        });
        if (!res.ok) throw new Error();
        if (statusEl) statusEl.innerText = "Uploaded";
      } catch {
        if (statusEl) statusEl.innerText = "Upload failed";
      } finally {
        fileInput.value = "";
      }
    };
  }

  function bindCVView() {
    const btn = el("viewCvBtn");
    if (!btn) return;

    btn.onclick = async () => {
      try {
        const res = await fetch("/api/documents/cv/my", {
          headers: authHeaders()
        });
        if (!res.ok) throw new Error();
        window.open(URL.createObjectURL(await res.blob()), "_blank");
      } catch {
        alert("CV not available");
      }
    };
  }

  /* =========================
     TABS
  ========================== */
  function initProfileTabs() {
    const tabs = document.querySelectorAll(".top-tabs .tab");
    const contents = document.querySelectorAll(".tab-content");
    if (!tabs.length) return;

    activate("profile");

    tabs.forEach(t => t.onclick = () => activate(t.dataset.tab));

    function activate(name) {
      tabs.forEach(t => t.classList.remove("active"));
      contents.forEach(c => c.classList.remove("active"));
      document.querySelector(`[data-tab="${name}"]`)?.classList.add("active");
      el(`tab-${name}`)?.classList.add("active");
    }
  }

  /* =========================
     OPTIONAL / SAFE
  ========================== */
  async function loadProfileTimeline() {}
  async function loadProfileAnalytics() {}
  async function loadProfileDecisions() {}

  window.openChangePassword = () => {
    window.location.hash = "#/change-password";
  };

  window.initMe = initMe;
})();
/* =====================================================
   END me.js
===================================================== */