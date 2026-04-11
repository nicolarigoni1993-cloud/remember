self.addEventListener("install", (event) => {
  console.log("Service Worker installato");
});

self.addEventListener("activate", (event) => {
  console.log("Service Worker attivo");
});

self.addEventListener("fetch", (event) => {
  // base, non tocchiamo ancora cache
});