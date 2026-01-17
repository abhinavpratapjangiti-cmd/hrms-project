
(async function loadProfile() {
  try {
    const res = await fetch("/api/profile/me", {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      }
    });

    if (!res.ok) return;

    const data = await res.json();

    document.getElementById("summary").value =
      data.professional_summary || "";

    document.getElementById("skills").value =
      data.skills || "";

    document.getElementById("certifications").value =
      data.certifications || "";

  } catch (e) {
    console.warn("Profile preload failed");
  }
})();


/* =====================================================
   Professional Profile Builder — JS
===================================================== */
async function saveProfile() {
  const payload = {
    summary: document.getElementById("summary").value,
    skills: document.getElementById("skills").value,
    certifications: document.getElementById("certifications").value
  };

  try {
    const res = await fetch("/api/profile/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + localStorage.getItem("token")
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error();

    alert("Profile saved successfully");

  } catch {
    alert("Failed to save profile");
  }
}

/* ======================================================       
    END Professional Profile Builder — JS   
====================================================== */