import { supabase } from "./supabase";

type PushSubscriptionRow = {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export function browserSupportsPush() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function ensureNotificationPermission() {
  if (!browserSupportsPush()) {
    return { ok: false as const, message: "Push non supportate su questo browser." };
  }

  if (Notification.permission === "granted") {
    return { ok: true as const, message: "Permesso notifiche già attivo." };
  }

  if (Notification.permission === "denied") {
    return { ok: false as const, message: "Permesso notifiche negato dal browser." };
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    return { ok: false as const, message: "Permesso notifiche non concesso." };
  }

  return { ok: true as const, message: "Permesso notifiche attivato." };
}

export async function subscribeCurrentDeviceToPush(userId: string) {
  if (!supabase) {
    return { ok: false as const, message: "Supabase non configurato." };
  }

  if (!userId?.trim()) {
    return { ok: false as const, message: "User ID mancante." };
  }

  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

  if (!publicKey) {
    return { ok: false as const, message: "Chiave VAPID pubblica mancante." };
  }

  if (!browserSupportsPush()) {
    return { ok: false as const, message: "Push non supportate su questo browser." };
  }

  const permissionResult = await ensureNotificationPermission();
  if (!permissionResult.ok) return permissionResult;

  const registration = await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const subscriptionJson = subscription.toJSON();
  const endpoint = subscription.endpoint;
  const p256dh = subscriptionJson.keys?.p256dh ?? "";
  const auth = subscriptionJson.keys?.auth ?? "";

  if (!endpoint || !p256dh || !auth) {
    return { ok: false as const, message: "Subscription push incompleta." };
  }

  const payload: PushSubscriptionRow = {
    user_id: userId,
    endpoint,
    p256dh,
    auth,
    user_agent: navigator.userAgent ?? "",
  };

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(payload, { onConflict: "endpoint" });

  if (error) {
    return { ok: false as const, message: error.message };
  }

  return { ok: true as const, message: "Dispositivo registrato alle notifiche push." };
}

export async function unsubscribeCurrentDeviceFromPush(userId: string) {
  if (!supabase) {
    return { ok: false as const, message: "Supabase non configurato." };
  }

  if (!browserSupportsPush()) {
    return { ok: false as const, message: "Push non supportate su questo browser." };
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    return { ok: true as const, message: "Nessuna subscription attiva su questo device." };
  }

  const endpoint = subscription.endpoint;

  await subscription.unsubscribe();

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", endpoint);

  if (error) {
    return { ok: false as const, message: error.message };
  }

  return { ok: true as const, message: "Dispositivo rimosso dalle notifiche push." };
}

export async function getCurrentPushSubscriptionInfo() {
  if (!browserSupportsPush()) {
    return { supported: false, subscribed: false };
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  return {
    supported: true,
    subscribed: Boolean(subscription),
    endpoint: subscription?.endpoint ?? null,
  };
}