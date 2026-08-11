"use client";

import { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { getTractorOilStatus } from "../lib/tractorOilStatus";
import { calculateCurrentTurn, formatTurnEndTime } from "../lib/motorTurnCalculator";

type Severity = "danger" | "warning" | "info";

type NotificationItem = {
  id: string;
  severity: Severity;
  icon: string;
  title: string;
  message: string;
};

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));

const getUserLanguage = (): "ta" | "en" => {
  if (typeof window !== "undefined") {
    return window.localStorage.getItem("marutham_lang") === "ta" ? "ta" : "en";
  }
  return "en";
};

type FarmRef = { name: string | null; name_tamil: string | null } | null;

const getFarmName = (farm: FarmRef): string => {
  const lang = getUserLanguage();
  if (lang === "ta" && farm?.name_tamil) {
    return farm.name_tamil;
  }
  return farm?.name || (lang === "ta" ? "உங்கள் பண்ணை" : "Your Farm");
};

// Season buckets by month index (0 = Jan): Dec–Feb winter, Mar–May summer,
// Jun–Nov monsoon (rainy season through harvest — kept as one bucket per
// the simplified 3-season model).
const SEASON_TIPS: Record<"winter" | "summer" | "monsoon", { icon: string; en: string; ta: string; msgEn: string; msgTa: string }> = {
  monsoon: {
    icon: "🌧️",
    en: "Monsoon Season Tip",
    ta: "மழைக்கால குறிப்பு",
    msgEn: "Monsoon season - avoid spraying pesticides",
    msgTa: "மழைக்காலம் - பூச்சிக்கொல்லி தெளிக்க சரியான நேரம் அல்ல",
  },
  summer: {
    icon: "☀️",
    en: "Summer Season Tip",
    ta: "கோடைகால குறிப்பு",
    msgEn: "Water in morning or evening only",
    msgTa: "காலை அல்லது மாலை நேரத்தில் பாசனம் செய்யவும்",
  },
  winter: {
    icon: "🌿",
    en: "Winter Season Tip",
    ta: "குளிர்கால குறிப்பு",
    msgEn: "Great time to plant coconut and turmeric!",
    msgTa: "தேங்காய், மஞ்சள் பயிர் செய்ய சிறந்த நேரம்!",
  },
};

const seasonForMonth = (month: number): "winter" | "summer" | "monsoon" => {
  if (month === 11 || month === 0 || month === 1) return "winter";
  if (month >= 2 && month <= 4) return "summer";
  return "monsoon";
};

// ISO-ish week number, used to fold a "-YYYY-Www" suffix into seasonal/crop tip
// ids so a dismissal only lasts for the current week rather than forever —
// once the week rolls over, the id changes and the tip is eligible to show again.
const getWeekId = (): string => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${weekNumber}`;
};

const DISMISSED_KEY = "marutham_dismissed_notifications";

const getDismissedIds = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]");
  } catch {
    return [];
  }
};

export default function NotificationBell({ language = "en" }: { language?: "ta" | "en" }) {
  const L = (en: string, ta: string) => (language === "ta" ? ta : en);

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
      setLoading(true);
      const [
        { data: tractors },
        { data: pendingPayments },
        { data: activeCrops },
        { data: farms },
        { data: motorData },
      ] = await Promise.all([
        supabase.from("tractors").select("id, name").eq("is_active", true),
        supabase.from("milk_payments").select("id").eq("payment_status", "pending"),
        supabase.from("cultivations").select("id, farm_id, crop_type, start_date").is("end_date", null),
        supabase.from("farms").select("id, name"),
        supabase.from("motor_sharing").select("*, motor_sharing_neighbors(*), farms(name, name_tamil)").eq("is_shared", true),
      ]);

      const detected: NotificationItem[] = [];
      const lang = getUserLanguage();
      const weekId = getWeekId();

      // Tractor oil change — two tiers per tractor: urgent (very low) vs warning (soon)
      for (const tractor of tractors ?? []) {
        const status = await getTractorOilStatus(tractor.id);
        const hoursRemaining = Math.max(status.hoursRemaining, 0);
        // Bucket the hours into the id so dismissing a "20h left" warning
        // doesn't also silence the later "5h left" urgent alert — a genuinely
        // new range gets a new id, an oil change (hours jump back up) does too.
        const tractorBucket = Math.floor(hoursRemaining / 10);
        if (status.isUrgent) {
          detected.push({
            id: `tractor-oil-${tractor.id}-${tractorBucket}`,
            severity: "danger",
            icon: "🚨",
            title: lang === "ta" ? `🚨 ${tractor.name} - ஆயில் மாற்றம் அவசியம்!` : `🚨 ${tractor.name} - Oil Change Urgent!`,
            message: lang === "ta" ? `வெறும் ${hoursRemaining.toFixed(1)} மணி நேரம் மட்டுமே உள்ளது!` : `Only ${hoursRemaining.toFixed(1)} hours remaining!`,
          });
        } else if (status.isWarning) {
          detected.push({
            id: `tractor-oil-${tractor.id}-${tractorBucket}`,
            severity: "warning",
            icon: "⚠️",
            title: lang === "ta" ? `⚠️ ${tractor.name} - ஆயில் விரைவில் மாற்றவும்` : `⚠️ ${tractor.name} - Oil Change Soon`,
            message: lang === "ta" ? `${hoursRemaining.toFixed(1)} மணி நேரம் மட்டுமே உள்ளது` : `${hoursRemaining.toFixed(1)} hours remaining`,
          });
        }
      }

      // Milk payment pending
      if (pendingPayments && pendingPayments.length > 0) {
        detected.push({
          id: "milk-payment",
          severity: "info",
          icon: "💰",
          title: lang === "ta" ? "💰 பால் பணம் நிலுவை உள்ளது" : "💰 Milk Payment Pending",
          message: lang === "ta" ? `${pendingPayments.length} நிலுவை பணம் உள்ளது` : `${pendingPayments.length} payment(s) pending`,
        });
      }

      // Crop tips — fertilizer milestones for active crops
      const farmName = (farmId: string) => farms?.find((f) => f.id === farmId)?.name ?? "";
      (activeCrops ?? []).forEach((crop) => {
        if (!crop.start_date) return;
        const days = daysSince(crop.start_date);
        const label = `${crop.crop_type}${farmName(crop.farm_id) ? ` — ${farmName(crop.farm_id)}` : ""}`;

        // Turmeric gets its own staged tips instead of the generic milestones.
        if (crop.crop_type === "turmeric") {
          if (days >= 40 && days <= 50) {
            detected.push({
              id: `crop-turmeric-fertilizer-${crop.id}-${weekId}`,
              severity: "warning",
              icon: "🌱",
              title: lang === "ta" ? "🌱 மஞ்சள் உர குறிப்பு" : "🌱 Turmeric Fertilizer Tip",
              message:
                lang === "ta"
                  ? `${label} — மஞ்சள் ${days} நாட்கள். பொட்டாசியம் உரம் இட நேரம்!`
                  : `${label} — Turmeric is ${days} days. Time to apply potassium!`,
            });
          } else if (days >= 240) {
            detected.push({
              id: `crop-turmeric-harvest-${crop.id}-${weekId}`,
              severity: "info",
              icon: "🌾",
              title: lang === "ta" ? "🌾 மஞ்சள் அறுவடை நேரம்" : "🌾 Turmeric Harvest Time",
              message:
                lang === "ta"
                  ? `${label} — மஞ்சள் ${days} நாட்கள். அறுவடைக்கு தயாராகுங்கள்!`
                  : `${label} — Turmeric ${days} days old. Prepare for harvest!`,
            });
          }
          return;
        }

        let milestone: "first" | "second" | null = null;
        if (days >= 60) milestone = "second";
        else if (days >= 30) milestone = "first";
        if (!milestone) return;

        detected.push({
          // Milestone included so dismissing "First" doesn't also silence
          // the later, genuinely different "Second" fertilizer notice; week
          // included so a dismissed tip reappears next week rather than never.
          id: `crop-fertilizer-${crop.id}-${milestone}-${weekId}`,
          severity: "warning",
          icon: "🌱",
          title:
            milestone === "first"
              ? L(`First Fertilizer Due for ${label}`, `${label} க்கு முதல் உரம் தேவை`)
              : L(`Second Fertilizer Due for ${label}`, `${label} க்கு இரண்டாம் உரம் தேவை`),
          message: L("Fertilizer application due", "உரம் இடும் நேரம் வந்துவிட்டது"),
        });
      });

      // Motor sharing — turn starting/ending soon, and whose turn is TODAY.
      // Turn hand-off happens at 6 PM, not midnight — calculateCurrentTurn
      // walks the rotation using the real current time to stay accurate.
      (motorData ?? []).forEach((motor) => {
        if (!motor.current_turn_start) return;

        const partnersList = (motor.motor_sharing_neighbors || []).map(
          (n: { partner_name?: string; neighbor_name?: string; turn_days: number }) => ({
            name: n.partner_name || n.neighbor_name || "Neighbor",
            days: Number(n.turn_days) || 2,
          })
        );

        const turnStatus = calculateCurrentTurn(
          motor.current_turn_start,
          motor.current_turn_owner,
          Number(motor.current_turn_days) || 2,
          partnersList
        );
        if (!turnStatus) return;

        const motorFarmName = getFarmName(motor.farms as FarmRef);

        // Ending/starting within 2 hours — more urgent variant
        if (turnStatus.isMyTurn && turnStatus.hoursRemaining > 0 && turnStatus.hoursRemaining <= 2) {
          detected.push({
            // current_turn_start included so dismissing "ending soon" for
            // this turn doesn't also silence the same alert on the next
            // turn cycle (the row is reused/updated in place per rotation).
            id: `motor-ending-${motor.id}-${motor.current_turn_start}`,
            severity: "danger",
            icon: "⏰",
            title: lang === "ta" ? `⏰ ${motorFarmName} - மோட்டார் முறை முடியும்!` : `⏰ ${motorFarmName} - Motor Turn Ending Soon!`,
            message:
              lang === "ta"
                ? `${Math.round(turnStatus.hoursRemaining)} மணி நேரத்தில் முடியும்`
                : `Ends in ${Math.round(turnStatus.hoursRemaining)} hour(s)`,
          });
        } else if (!turnStatus.isMyTurn && turnStatus.hoursRemaining > 0 && turnStatus.hoursRemaining <= 2) {
          detected.push({
            id: `motor-my-turn-${motor.id}-${motor.current_turn_start}`,
            severity: "warning",
            icon: "🚰",
            title:
              lang === "ta"
                ? `🚰 ${motorFarmName} - உங்கள் மோட்டார் முறை தொடங்கும்!`
                : `🚰 ${motorFarmName} - Your Motor Turn Starting Soon!`,
            message:
              lang === "ta"
                ? `${Math.round(turnStatus.hoursRemaining)} மணி நேரத்தில் தொடங்கும்`
                : `Starts in ${Math.round(turnStatus.hoursRemaining)} hour(s)`,
          });
        }

        // Whose turn is TODAY — the id is date-scoped so dismissing today's
        // card doesn't hide tomorrow's.
        const todayStr = new Date().toISOString().split("T")[0];

        if (turnStatus.isMyTurn) {
          // Staged wording so the card reads differently right after the
          // turn starts, on its last day, tomorrow, or an ordinary active
          // day — using the actual end time (not a bare day-count) so it
          // never reads as confusing right after the turn begins.
          let myTurnTitle: string;
          let myTurnMessage: string;
          if (turnStatus.justStarted) {
            const endStr = formatTurnEndTime(turnStatus.turnEndTime, lang);
            myTurnTitle = lang === "ta" ? `🚰 ${motorFarmName} - உங்கள் முறை தொடங்கியது!` : `🚰 ${motorFarmName} - Your Turn Has Started!`;
            myTurnMessage =
              lang === "ta"
                ? `இன்று மாலை 6:00 மணிக்கு தொடங்கியது. ${endStr} வரை உங்கள் முறை.`
                : `Started today at 6:00 PM. Your turn continues until ${endStr}.`;
          } else if (turnStatus.endsToday) {
            myTurnTitle = lang === "ta" ? `🚰 ${motorFarmName} - இன்று முறை முடியும்` : `🚰 ${motorFarmName} - Turn Ends Today`;
            myTurnMessage =
              lang === "ta"
                ? "உங்கள் பகிர்வு மோட்டார் முறை இன்று மாலை 6:00 மணிக்கு முடியும்."
                : "Your shared motor turn ends today at 6:00 PM.";
          } else if (turnStatus.daysRemaining === 1) {
            myTurnTitle = lang === "ta" ? `🚰 ${motorFarmName} - நாளை முறை முடியும்` : `🚰 ${motorFarmName} - Turn Ends Tomorrow`;
            myTurnMessage =
              lang === "ta"
                ? "உங்கள் பகிர்வு மோட்டார் முறை நாளை மாலை 6:00 மணிக்கு முடியும்."
                : "Your shared motor turn ends tomorrow at 6:00 PM.";
          } else {
            const endStr = formatTurnEndTime(turnStatus.turnEndTime, lang);
            myTurnTitle = lang === "ta" ? `🚰 ${motorFarmName} - உங்கள் முறை தொடர்கிறது` : `🚰 ${motorFarmName} - Your Turn is Active`;
            myTurnMessage = lang === "ta" ? `உங்கள் முறை ${endStr} வரை தொடரும்.` : `Your turn continues until ${endStr}.`;
          }

          detected.push({
            id: `motor-my-turn-${motor.id}-${todayStr}`,
            severity: "warning",
            icon: "🚰",
            title: myTurnTitle,
            message: myTurnMessage,
          });
        } else {
          const endStr = formatTurnEndTime(turnStatus.turnEndTime, lang);
          const myNextStr = formatTurnEndTime(turnStatus.nextTurnStartTime, lang);
          detected.push({
            id: `motor-neighbor-turn-${motor.id}-${todayStr}`,
            severity: "info",
            icon: "💧",
            title:
              lang === "ta"
                ? `${motorFarmName} - இன்று ${turnStatus.ownerName} முறை`
                : `${motorFarmName} - Today is ${turnStatus.ownerName}'s Turn`,
            message:
              lang === "ta"
                ? `அவர்கள் முறை ${endStr} முடியும். உங்கள் அடுத்த முறை ${myNextStr} தொடங்கும்.`
                : `Their turn ends ${endStr}. Your next turn starts ${myNextStr}.`,
          });
        }
      });

      // Seasonal tip based on current month
      const season = seasonForMonth(new Date().getMonth());
      const seasonTip = SEASON_TIPS[season];
      detected.push({
        id: `seasonal-${season}-${weekId}`,
        severity: "info",
        icon: seasonTip.icon,
        title: lang === "ta" ? seasonTip.ta : seasonTip.en,
        message: lang === "ta" ? seasonTip.msgTa : seasonTip.msgEn,
      });

      const dismissedIds = getDismissedIds();
      setItems(detected.filter((n) => !dismissedIds.includes(n.id)));
      setLoading(false);
  };

  const dismiss = (id: string) => {
    const dismissedIds = getDismissedIds();
    if (!dismissedIds.includes(id)) {
      dismissedIds.push(id);
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissedIds));
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const clearAllDismissed = () => {
    // Permanently dismiss every currently-shown notification (rather than
    // wiping the dismissed list) — ids are week-scoped where it makes sense
    // to reappear later (crop tips, seasonal tips), so this never silences a
    // genuinely new alert forever, it just clears what's visible right now.
    const currentIds = items.map((i) => i.id);
    const existing = getDismissedIds();
    const updated = Array.from(new Set([...existing, ...currentIds]));
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(updated));

    setItems([]);

    toast.success(language === "ta" ? "அனைத்தும் அழிக்கப்பட்டன" : "All cleared");
  };

  const handleRefresh = () => {
    // Keep the dismissed list intact — just regenerate whatever's still true.
    fetchNotifications();
  };

  const severityCls: Record<Severity, string> = {
    danger: "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-800 dark:text-red-300",
    warning: "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300",
    info: "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-800 dark:text-blue-300",
  };

  const handleBellClick = () => {
    // Refresh whenever the dropdown is opened, so anything that changed since
    // the last fetch (or the last dismissal) shows up immediately. Computed
    // from the current `open` value directly rather than inside the setState
    // updater — updater functions must stay pure (React can invoke them more
    // than once), so a side effect like a network fetch can't safely live there.
    if (!open) fetchNotifications();
    setOpen((o) => !o);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={handleBellClick}
        className="relative w-9 h-9 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 transition-all duration-200"
        title={L("Notifications", "அறிவிப்புகள்")}
      >
        <span className="text-lg">🔔</span>
        {items.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {items.length > 9 ? "9+" : items.length}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed sm:absolute z-50 top-[60px] left-2 right-2 sm:top-11 sm:left-auto sm:right-0
                     w-auto max-w-[320px] ml-auto sm:w-80 sm:ml-0
                     bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-100 dark:border-slate-700
                     max-h-96 overflow-y-auto"
        >
          <div className="p-3 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-800">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">🔔 {L("Notifications", "அறிவிப்புகள்")}</h3>
            <div className="flex items-center gap-2">
              {items.length > 0 ? (
                <button onClick={clearAllDismissed} className="text-xs text-red-400 hover:text-red-600">
                  {L("Clear all", "அனைத்தும் அழி")}
                </button>
              ) : (
                <span className="text-xs text-gray-400">{L("No notifications", "அறிவிப்புகள் இல்லை")}</span>
              )}
              <button
                onClick={handleRefresh}
                className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-lg"
              >
                🔄 {L("Refresh", "புதுப்பி")}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="p-3 space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-14 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-xs text-gray-400">
              {L("You're all caught up!", "அனைத்தும் புதுப்பித்தது!")}
            </div>
          ) : (
            <div className="p-2 space-y-1.5">
              {items.map((item) => {
                const isMotorMyTurn = item.id.startsWith("motor-my-turn");
                const isMotorNeighborTurn = item.id.startsWith("motor-neighbor-turn");
                const isMotorNotification = isMotorMyTurn || isMotorNeighborTurn;

                return (
                  <div
                    key={item.id}
                    className={`p-2.5 rounded-xl text-sm border transition-all duration-200 ${
                      isMotorMyTurn
                        ? "bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-900/30 dark:to-cyan-900/30 border-teal-200 dark:border-teal-700/50"
                        : isMotorNeighborTurn
                          ? "bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600/50"
                          : severityCls[item.severity]
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {isMotorNotification ? (
                        <div
                          className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center ${
                            isMotorMyTurn ? "bg-teal-100 dark:bg-teal-900/40" : "bg-slate-100 dark:bg-slate-600/40"
                          }`}
                        >
                          <span className="text-base">{item.icon}</span>
                        </div>
                      ) : (
                        <span className="text-base shrink-0">{item.icon}</span>
                      )}

                      <div className="flex-1 min-w-0">
                        <p
                          className={`font-medium leading-tight ${
                            isMotorMyTurn
                              ? "text-teal-800 dark:text-teal-300"
                              : isMotorNeighborTurn
                                ? "text-slate-700 dark:text-slate-300"
                                : ""
                          }`}
                        >
                          {item.title}
                        </p>
                        <p
                          className={`text-xs mt-0.5 leading-relaxed ${
                            isMotorMyTurn
                              ? "text-teal-600 dark:text-teal-400"
                              : isMotorNeighborTurn
                                ? "text-slate-500 dark:text-slate-400"
                                : "opacity-70"
                          }`}
                        >
                          {item.message}
                        </p>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          dismiss(item.id);
                        }}
                        className="min-h-[24px] min-w-[24px] flex items-center justify-center text-current opacity-60 hover:opacity-100 shrink-0"
                      >
                        ×
                      </button>
                    </div>

                    {/* Special bottom bar for MY turn */}
                    {isMotorMyTurn && (
                      <div className="mt-2 pt-2 border-t border-teal-100 dark:border-teal-800/30 flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                        <p className="text-xs text-teal-600 dark:text-teal-400 font-medium">
                          {language === "ta" ? "இப்போதே பாசனம் செய்யலாம்" : "Water your fields now"}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
