self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl =
    event.notification?.data?.url && typeof event.notification.data.url === "string"
      ? event.notification.data.url
      : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ("focus" in client) {
          client.postMessage({
            type: "REMEMBER_NOTIFICATION_CLICK",
            payload: event.notification?.data ?? null,
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