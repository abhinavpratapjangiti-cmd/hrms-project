/* =====================================================
   GLOBAL MODAL HELPER (BOOTSTRAP 5)
===================================================== */

window.showModal = function (title, bodyHtml) {
  var modalEl = document.getElementById("globalModal");
  var titleEl = document.getElementById("globalModalTitle");
  var bodyEl = document.getElementById("globalModalBody");

  if (!modalEl || !titleEl || !bodyEl) {
    console.error("Modal DOM not found");
    return;
  }

  titleEl.innerText = title || "";
  bodyEl.innerHTML = bodyHtml || "";

  var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
};
/* =====================================================
   SPA + DOM SAFE (FINAL)
====================================================== */