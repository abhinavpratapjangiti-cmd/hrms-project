/* =====================================================
   websocket.js — HRMS FE REALTIME (FINAL, FIXED)
   GUARANTEES:
   - No reconnect loop after logout
   - No reconnect on JWT expiry
   - Single active socket only
   - SPA-safe
===================================================== */
(function () {
  if (window.__wsInitialized) return;
  window.__wsInitialized = true;

  var ws = null;
  var reconnectTimer = null;
  var reconnectDelay = 3000;
  var explicitlyClosed = false;

  /* =========================
     UTILS
  ========================= */
  function getToken() {
    return localStorage.getItem("token");
  }

  function clearReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function safeLogout(reason) {
    console.warn("🔐 WebSocket logout:", reason);
    explicitlyClosed = true;
    clearReconnect();

    try {
      if (ws) ws.close();
    } catch (_) {}

    if (typeof forceLogout === "function") {
      forceLogout(reason);
    }
  }

  /* =========================
     WAIT FOR TOKEN
  ========================= */
  function waitForToken() {
    var token = getToken();

    if (!token) {
      setTimeout(waitForToken, 500);
      return;
    }

    if (typeof isTokenExpired === "function" && isTokenExpired(token)) {
      safeLogout("JWT expired (WebSocket init)");
      return;
    }

    startWebSocket(token);
  }

  /* =========================
     START WEBSOCKET
  ========================= */
  function startWebSocket(token) {
    function connect() {
      clearReconnect();

      // 🔒 Guard before connect
      if (!getToken()) return;
      if (typeof isTokenExpired === "function" && isTokenExpired(token)) {
        safeLogout("JWT expired (WebSocket reconnect)");
        return;
      }

      explicitlyClosed = false;

      ws = new WebSocket(
        (location.protocol === "https:" ? "wss://" : "ws://") +
          location.host +
          "/?token=" + encodeURIComponent(token)
      );

      ws.onopen = function () {
        console.log("🔌 WebSocket connected");

        window.socket = ws;
        window.dispatchEvent(new Event("ws:ready"));
      };

      ws.onmessage = function (evt) {
  try {
    var msg = JSON.parse(evt.data);

    // generic message bus (keep this)
    window.dispatchEvent(
      new CustomEvent("ws:message", {
        detail: msg
      })
    );

    // 🔥 attendance realtime push
    if (msg.type === "attendance:update") {
      window.dispatchEvent(
        new CustomEvent("attendance:update", {
          detail: msg.payload
        })
      );
    }

  } catch (e) {
    console.warn("WS message parse failed", evt.data);
  }
};


      ws.onclose = function (evt) {
        console.warn("🔌 WS closed", evt.code, evt.reason);

        ws = null;

        // ❌ intentional close (logout / tab close)
        if (explicitlyClosed) return;

        // ❌ auth failure → logout
        if (evt.code === 1008 || evt.code === 4001) {
          safeLogout("WebSocket auth failed");
          return;
        }

        // 🔁 network / server restart
        reconnectTimer = setTimeout(connect, reconnectDelay);
      };

      ws.onerror = function () {
        // allow onclose to handle reconnection logic
        try {
          ws.close();
        } catch (_) {}
      };
    }

    connect();
  }

  /* =========================
     CLEANUP ON LOGOUT / TAB CLOSE
  ========================= */
  window.addEventListener("beforeunload", function () {
    explicitlyClosed = true;
    clearReconnect();
    try {
      if (ws) ws.close();
    } catch (_) {}
  });

  /* =========================
     INIT
  ========================= */
  waitForToken();
})();
/* =====================================================
   END websocket.js
===================================================== */