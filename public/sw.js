self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {
    title: "Remember",
    body: "Nuova notifica",
    tag: "remember-default",
    data: { url: "/" },
  };

  try {
    const parsed = event.data.json();
    payload = {
      title: parsed?.title || "Remember",
      body: parsed?.body || "Nuova notifica",
      tag: parsed?.tag || "remember-default",
      data: parsed?.data || { url: "/" },
    };
  } catch {
    payload = {
      title: "Remember",
      body: event.data.text() || "Nuova notifica",
      tag: "remember-default",
      data: { url: "/" },
    };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      renotify: true,
      requireInteraction: true,
      data: payload.data,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const payload = event.notification?.data ?? {};
  const targetUrl =
    payload?.url && typeof payload.url === "string" ? payload.url : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ("focus" in client) {
          client.postMessage({
            type: "REMEMBER_NOTIFICATION_CLICK",
            payload,
          });
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});