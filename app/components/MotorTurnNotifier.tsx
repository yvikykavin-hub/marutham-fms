"use client";

import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { getTractorOilStatus } from "../lib/tractorOilStatus";
import { calculateCurrentTurn, formatTurnEndTime, type TurnStatus } from "../lib/motorTurnCalculator";

const NOTIFICATION_CHECK_KEY = "marutham_last_notification_check";
const DISMISSED_KEY = "marutham_dismissed_notifications";

const getUserLanguage = (): string => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("marutham_lang") || "en";
  }
  return "en";
};

const getDismissedIds = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]");
  } catch {
    return [];
  }
};

const isDismissed = (tag: string): boolean => getDismissedIds().includes(tag);

type FarmRef = { name: string | null; name_tamil: string | null } | null;

const getFarmName = (farm: FarmRef): string => {
  const lang = getUserLanguage();
  if (lang === "ta" && farm?.name_tamil) {
    return farm.name_tamil;
  }
  return farm?.name || (lang === "ta" ? "உங்கள் பண்ணை" : "Your Farm");
};

// Builds the right bilingual title/body for whichever stage of a shared
// motor's turn is currently active — separate wording for "just started",
// "ends today", "ends tomorrow", "still active until a given time", and
// "not my turn" so a farmer glancing at the notification knows exactly
// where things stand without opening the app. Uses formatTurnEndTime so
// "active" never falls back to a bare day-count, which reads as confusing
// right after a turn starts (e.g. "1 day left" for a 2-day turn that just began).
const getMotorNotificationText = (
  turnStatus: TurnStatus,
  farmName: string,
  lang: string
): { title: string; body: string; urgent: boolean } => {
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);

  if (turnStatus.isMyTurn && turnStatus.justStarted) {
    const endStr = formatTurnEndTime(turnStatus.turnEndTime, lang);
    return {
      title: L(`🚰 ${farmName} - Your Turn Has Started!`, `🚰 ${farmName} - உங்கள் முறை தொடங்கியது!`),
      body: L(
        `Your shared motor turn has started today at 6:00 PM. Your turn continues until ${endStr}.`,
        `உங்கள் பகிர்வு மோட்டார் முறை இன்று மாலை 6:00 மணிக்கு தொடங்கியது. ${endStr} வரை உங்கள் முறை.`
      ),
      urgent: true,
    };
  }

  if (turnStatus.endsToday && turnStatus.isMyTurn) {
    return {
      title: L(`🚰 ${farmName} - Turn Ends Today`, `🚰 ${farmName} - இன்று முறை முடியும்`),
      body: L(
        "Your shared motor turn ends today at 6:00 PM. Finish watering soon.",
        "உங்கள் பகிர்வு மோட்டார் முறை இன்று மாலை 6:00 மணிக்கு முடியும். விரைவில் பாசனம் முடிக்கவும்."
      ),
      urgent: true,
    };
  }

  if (turnStatus.daysRemaining === 1 && turnStatus.isMyTurn) {
    return {
      title: L(`🚰 ${farmName} - Turn Ends Tomorrow`, `🚰 ${farmName} - நாளை முறை முடியும்`),
      body: L(
        "Your shared motor turn ends tomorrow at 6:00 PM.",
        "உங்கள் பகிர்வு மோட்டார் முறை நாளை மாலை 6:00 மணிக்கு முடியும்."
      ),
      urgent: false,
    };
  }

  if (turnStatus.isMyTurn) {
    const endStr = formatTurnEndTime(turnStatus.turnEndTime, lang);
    return {
      title: L(`🚰 ${farmName} - Your Turn is Active`, `🚰 ${farmName} - உங்கள் முறை தொடர்கிறது`),
      body: L(`Your shared motor turn is active until ${endStr}.`, `உங்கள் முறை ${endStr} வரை தொடரும்.`),
      urgent: false,
    };
  }

  const myNextStr = formatTurnEndTime(turnStatus.nextTurnStartTime, lang);
  return {
    title: L(`💧 ${farmName} - ${turnStatus.ownerName}'s Turn`, `💧 ${farmName} - ${turnStatus.ownerName} முறை`),
    body: L(
      `${turnStatus.ownerName}'s motor turn is active. Your next turn begins ${myNextStr}.`,
      `${turnStatus.ownerName} மோட்டார் முறை தொடர்கிறது. உங்கள் அடுத்த முறை ${myNextStr} தொடங்கும்.`
    ),
    urgent: false,
  };
};

export default function MotorTurnNotifier() {
  const checkInterval = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    const registerServiceWorker = async () => {
      if (!("serviceWorker" in navigator)) return;
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        console.log("SW registered:", registration.scope);
      } catch (err) {
        console.error("SW registration failed:", err);
      }
    };

    const requestNotificationPermission = async (): Promise<boolean> => {
      if (!("Notification" in window)) return false;
      if (Notification.permission === "granted") return true;
      if (Notification.permission === "denied") return false;
      const result = await Notification.requestPermission();
      return result === "granted";
    };

    const sendNotification = async (title: string, body: string, tag: string, url: string = "/", urgent = false) => {
      if (isDismissed(tag)) return;
      if (Notification.permission !== "granted") return;

      try {
        // Use the service worker's showNotification so alerts still land while
        // the PWA is backgrounded, not just while this tab is open.
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, {
          body,
          icon: "/icon-192x192.png",
          badge: "/icon-192x192.png",
          tag,
          renotify: false,
          vibrate: [200, 100, 200],
          data: { url },
          requireInteraction: urgent,
        } as NotificationOptions);
      } catch {
        if ("Notification" in window) {
          new Notification(title, { body, icon: "/icon-192x192.png", tag });
        }
      }
    };

    const checkTractorOil = async (lang: string) => {
      const { data: tractors } = await supabase.from("tractors").select("id, name").eq("is_active", true);
      if (!tractors) return;

      for (const tractor of tractors) {
        const status = await getTractorOilStatus(tractor.id);
        const hoursLeft = Math.max(status.hoursRemaining, 0);
        // Bucketed by 10-hr band, so a tractor doesn't spam a notification every
        // check while still re-alerting once it crosses into a more urgent band.
        const tag = `tractor-oil-${tractor.id}-${Math.floor(hoursLeft / 10)}`;

        if (status.isUrgent) {
          await sendNotification(
            lang === "ta" ? `🚨 ${tractor.name} - எண்ணெய் மாற்றம் அவசியம்!` : `🚨 ${tractor.name} - Oil Change Urgent!`,
            lang === "ta" ? `வெறும் ${hoursLeft.toFixed(1)} மணி மட்டுமே!` : `Only ${hoursLeft.toFixed(1)} hours left!`,
            tag,
            "/machinery/tractor",
            true
          );
        } else if (status.isWarning) {
          await sendNotification(
            lang === "ta" ? `⚠️ ${tractor.name} - எண்ணெய் விரைவில்` : `⚠️ ${tractor.name} - Oil Change Soon`,
            lang === "ta" ? `${hoursLeft.toFixed(1)} மணி மட்டுமே உள்ளது` : `${hoursLeft.toFixed(1)} hours remaining`,
            tag,
            "/machinery/tractor",
            false
          );
        }
      }
    };

    const checkMotorTurns = async (lang: string, hour: number, today: string) => {
      const { data: motorData } = await supabase
        .from("motor_sharing")
        .select("*, motor_sharing_neighbors(*), farms(name, name_tamil)")
        .eq("is_shared", true);

      if (!motorData) return;

      for (const motor of motorData) {
        if (!motor.current_turn_start) continue;

        const partnersList = (motor.motor_sharing_neighbors || []).map((n: { neighbor_name: string; turn_days: number }) => ({
          name: n.neighbor_name,
          days: Number(n.turn_days) || 2,
        }));

        // Turn hand-off happens at 6 PM, not midnight — calculateCurrentTurn
        // walks the rotation using the real current time to stay accurate.
        const turnStatus = calculateCurrentTurn(
          motor.current_turn_start,
          motor.current_turn_owner,
          Number(motor.current_turn_days) || 2,
          partnersList
        );
        if (!turnStatus) continue;

        const farmName = getFarmName(motor.farms as FarmRef);

        // 6 PM - turn starts right now. justStarted guards against firing
        // for a turn that was already mid-way through before this check
        // ran (e.g. clock skew) — only a turn that genuinely just began
        // (within the last 12 hours) counts as "starting now".
        if (hour === 18 && turnStatus.isMyTurn && turnStatus.justStarted) {
          const { title, body } = getMotorNotificationText(turnStatus, farmName, lang);
          await sendNotification(title, body, `motor-start-${motor.id}-${today}`, "/land-details", true);
        }

        // 6 PM - a NEIGHBOR's turn starts right now, so the farmer knows
        // watering isn't theirs today and exactly when it will be again.
        if (hour === 18 && !turnStatus.isMyTurn && turnStatus.justStarted) {
          const myNextStr = formatTurnEndTime(turnStatus.nextTurnStartTime, lang);
          await sendNotification(
            lang === "ta" ? `💧 ${farmName} - ${turnStatus.ownerName} முறை தொடங்கியது` : `💧 ${farmName} - ${turnStatus.ownerName}'s Turn Started`,
            lang === "ta"
              ? `${turnStatus.ownerName} மோட்டார் முறை தொடங்கியது. உங்கள் அடுத்த முறை ${myNextStr} தொடங்கும்.`
              : `${turnStatus.ownerName}'s motor turn has started. Your next turn begins ${myNextStr}.`,
            `motor-neighbor-${motor.id}-${today}`,
            "/land-details",
            false
          );
        }

        // Morning reminder — widened to a 6-9 AM window (matching
        // checkTodaysTurn's own window below) rather than exactly 7 AM, so
        // it still lands if the app wasn't opened at the exact hour.
        if (hour >= 6 && hour <= 9 && turnStatus.isMyTurn) {
          const { title, body } = getMotorNotificationText(turnStatus, farmName, lang);
          await sendNotification(title, body, `motor-morning-${motor.id}-${today}`, "/land-details", false);
        }

        // 5 PM - 1 hour warning
        if (turnStatus.isMyTurn && hour === 17 && turnStatus.endsToday) {
          const tag = `motor-end-${motor.id}-${today}`;
          await sendNotification(
            lang === "ta" ? `⏰ ${farmName} - 1 மணியில் முறை முடியும்!` : `⏰ ${farmName} - Turn Ends in 1 Hour!`,
            lang === "ta"
              ? "உங்கள் பகிர்வு மோட்டார் முறை இன்று மாலை 6:00 மணிக்கு முடியும். இப்போதே பாசனம் முடிக்கவும்."
              : "Your shared motor turn ends today at 6:00 PM. Finish your watering now.",
            tag,
            "/land-details",
            true
          );
        }
      }
    };

    const checkMilkPayments = async (lang: string) => {
      const { data: pending } = await supabase.from("milk_payments").select("id").eq("payment_status", "Pending").limit(5);

      if (pending && pending.length > 0) {
        const tag = `milk-payment-${new Date().toDateString()}`;
        await sendNotification(
          lang === "ta" ? "💰 பால் பணம் நிலுவை உள்ளது" : "💰 Milk Payment Pending",
          lang === "ta" ? `${pending.length} நிலுவை பணம் உள்ளது` : `${pending.length} payment(s) pending`,
          tag,
          "/livestock/cows",
          false
        );
      }
    };

    const checkAndSendNotifications = async () => {
      if (Notification.permission !== "granted") return;

      const lang = getUserLanguage();
      const now = new Date();
      const hour = now.getHours();
      const today = now.toDateString();

      // Prevent checking too frequently
      const lastCheck = localStorage.getItem(NOTIFICATION_CHECK_KEY);
      const lastCheckDate = lastCheck ? new Date(lastCheck) : null;
      const minutesSinceCheck = lastCheckDate ? (now.getTime() - lastCheckDate.getTime()) / (1000 * 60) : 999;

      if (minutesSinceCheck < 25) return;
      localStorage.setItem(NOTIFICATION_CHECK_KEY, now.toISOString());

      try {
        await checkTractorOil(lang);
        // checkMotorTurns already covers the 6-9 AM morning reminder (with
        // richer, context-aware text) — no separate "today's turn" check needed.
        await checkMotorTurns(lang, hour, today);
        if (now.getDay() === 3) {
          await checkMilkPayments(lang);
        }
      } catch (error) {
        console.error("Notification check error:", error);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkAndSendNotifications();
      }
    };

    const init = async () => {
      await registerServiceWorker();
      const hasPermission = await requestNotificationPermission();
      if (hasPermission) await checkAndSendNotifications();
    };

    init();

    // Check every 30 minutes when app is open
    checkInterval.current = setInterval(checkAndSendNotifications, 30 * 60 * 1000);

    // Also check when the page becomes visible again
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (checkInterval.current) clearInterval(checkInterval.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null; // No UI — runs in background
}
