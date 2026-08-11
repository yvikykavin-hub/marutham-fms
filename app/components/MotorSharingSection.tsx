"use client";

import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { getValidationMessage } from "../lib/validation";
import { calculateCurrentTurn, formatTurnEndTime, generateSchedule } from "../lib/motorTurnCalculator";
import DeleteConfirmDialog from "./DeleteConfirmDialog";
import { useDeleteConfirm } from "../hooks/useDeleteConfirm";

interface Partner {
  id?: string;
  partner_name: string;
  partner_phone: string;
  turn_days: number;
}

interface MotorSharing {
  id?: string;
  farm_id: string;
  is_shared: boolean;
  current_turn_owner: string;
  current_turn_start: string;
  current_turn_days: number;
  notes?: string;
}

export type MotorSharingSectionHandle = {
  save: () => Promise<void>;
};

const DAY_OPTIONS = [1, 2, 3, 4, 5];
const HOUR_OPTIONS = [1, 2, 3, 6, 12];
const HOURS_PER_DAY = 24;

const labelCls = "text-xs text-gray-600 dark:text-gray-400";
const valueInputCls =
  "w-full border border-gray-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 block";
const sectionTitleCls = "text-base font-semibold text-gray-700 dark:text-gray-300";

const MotorSharingSection = forwardRef<MotorSharingSectionHandle, { farmId: string; language?: "ta" | "en" }>(
  function MotorSharingSection({ farmId, language = "en" }, ref) {
    const [sharing, setSharing] = useState<MotorSharing | null>(null);
    const [partners, setPartners] = useState<Partner[]>([]);
    const [isShared, setIsShared] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showSchedule, setShowSchedule] = useState(false);
    const [showAddPartner, setShowAddPartner] = useState(false);
    const [showTurnDetails, setShowTurnDetails] = useState(false); // collapsed by default
    const { isOpen: deleteOpen, confirmDelete, handleConfirm: handleDeleteConfirm, handleCancel: handleDeleteCancel } = useDeleteConfirm();

    // Form states
    const [turnOwner, setTurnOwner] = useState("me");
    const [turnStart, setTurnStart] = useState("");
    const [durationType, setDurationType] = useState<"hours" | "days">("days");
    const [turnDays, setTurnDays] = useState(2);
    const [turnHours, setTurnHours] = useState(12);
    const [newPartnerName, setNewPartnerName] = useState("");
    const [newPartnerPhone, setNewPartnerPhone] = useState("");
    const [newPartnerDays, setNewPartnerDays] = useState(2);

    const effectiveTurnDays = durationType === "hours" ? turnHours / HOURS_PER_DAY : turnDays;

    useEffect(() => {
      fetchMotorSharing();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [farmId]);

    const fetchMotorSharing = async () => {
      setLoading(true);
      const { data: sharingData } = await supabase
        .from("motor_sharing")
        .select("*")
        .eq("farm_id", farmId)
        .maybeSingle();

      if (sharingData) {
        setSharing(sharingData);
        setIsShared(sharingData.is_shared);
        setTurnOwner(sharingData.current_turn_owner || "me");
        setTurnStart(sharingData.current_turn_start ? new Date(sharingData.current_turn_start).toISOString().slice(0, 16) : "");

        const storedDays = Number(sharingData.current_turn_days) || 2;
        if (storedDays < 1) {
          setDurationType("hours");
          setTurnHours(Math.round(storedDays * HOURS_PER_DAY));
        } else {
          setDurationType("days");
          setTurnDays(Math.round(storedDays));
        }

        const { data: partnersData } = await supabase
          .from("motor_sharing_neighbors")
          .select("*")
          .eq("motor_sharing_id", sharingData.id);

        if (partnersData) {
          setPartners(
            partnersData.map((p) => ({
              id: p.id,
              partner_name: p.neighbor_name,
              partner_phone: p.neighbor_phone,
              turn_days: p.turn_days,
            }))
          );
        }
      }
      setLoading(false);
    };

    const saveSharing = async () => {
      try {
        if (sharing?.id) {
          await supabase
            .from("motor_sharing")
            .update({
              is_shared: isShared,
              current_turn_owner: turnOwner,
              current_turn_start: turnStart || null,
              current_turn_days: effectiveTurnDays,
              updated_at: new Date().toISOString(),
            })
            .eq("id", sharing.id);
        } else {
          const { data } = await supabase
            .from("motor_sharing")
            .insert({
              farm_id: farmId,
              is_shared: isShared,
              current_turn_owner: turnOwner,
              current_turn_start: turnStart || null,
              current_turn_days: effectiveTurnDays,
            })
            .select()
            .single();

          if (data) setSharing(data);
        }
        fetchMotorSharing();
      } catch (err) {
        console.error("Error saving motor sharing:", err);
        throw err;
      }
    };

    useImperativeHandle(ref, () => ({ save: saveSharing }));

    const addPartner = async () => {
      if (!newPartnerName.trim() || newPartnerName.trim().length < 2) {
        toast.error(getValidationMessage("partner_name", language));
        return;
      }
      if (!sharing?.id) {
        toast.error(
          language === "ta" ? "முதலில் மேலே உள்ள 'மாற்றங்களை சேமி' பொத்தானை அழுத்தவும்" : "Please click 'Save Changes' above first"
        );
        return;
      }

      const { error } = await supabase.from("motor_sharing_neighbors").insert({
        motor_sharing_id: sharing.id,
        neighbor_name: newPartnerName,
        neighbor_phone: newPartnerPhone || null,
        turn_days: newPartnerDays,
      });

      if (!error) {
        toast.success(language === "ta" ? "பகிர்வு கூட்டாளி சேர்க்கப்பட்டார்!" : "Shared partner added!");
        setShowAddPartner(false);
        setNewPartnerName("");
        setNewPartnerPhone("");
        setNewPartnerDays(2);
        fetchMotorSharing();
      } else {
        console.error("Error adding partner:", error);
        toast.error(language === "ta" ? "சேர்க்க முடியவில்லை" : "Could not add partner");
      }
    };

    const removePartner = (id: string) => {
      confirmDelete(async () => {
        await supabase.from("motor_sharing_neighbors").delete().eq("id", id);
        toast.success(language === "ta" ? "நீக்கப்பட்டது!" : "Removed!");
        fetchMotorSharing();
      });
    };

    // Display name for owner — "me" reads as "You"/"நீங்கள்", everyone else
    // (a shared partner's actual name) passes through unchanged.
    const getDisplayName = (name: string) => (name === "me" ? (language === "ta" ? "நீங்கள்" : "You") : name);

    if (loading) return null;

    // Turn hand-off happens at 6 PM, not midnight — calculateCurrentTurn walks
    // the rotation using the real current time so this stays correct no matter
    // how long ago the rotation was originally configured. Both the status
    // banner and the schedule below are derived from this same saved
    // sharing/partners data, so they can never disagree with each other.
    const partnersList = partners.map((p) => ({ name: p.partner_name, days: Number(p.turn_days) || 2 }));
    const turnStatus =
      isShared && sharing?.current_turn_start
        ? calculateCurrentTurn(
            sharing.current_turn_start,
            sharing.current_turn_owner,
            Number(sharing.current_turn_days) || 2,
            partnersList
          )
        : null;
    const isMyTurnNow = turnStatus?.isMyTurn ?? false;

    // Full upcoming/past schedule — last 3 days through next 30 days —
    // computed from the same saved sharing data as turnStatus above.
    const scheduleEntries =
      isShared && sharing?.current_turn_start
        ? generateSchedule(
            sharing.current_turn_start,
            sharing.current_turn_owner,
            Number(sharing.current_turn_days) || 2,
            partnersList
          )
        : [];
    const displayNameMap: Record<string, string> = { me: getDisplayName("me") };
    partners.forEach((p) => {
      displayNameMap[p.partner_name] = p.partner_name;
    });

    return (
      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700">
        {/* Header with toggle */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={sectionTitleCls}>{language === "ta" ? "🚰 பகிர்வு மோட்டார்" : "🚰 Shared Motor"}</span>
            {isMyTurnNow && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium animate-pulse">
                🟢 {language === "ta" ? "உங்கள் முறை!" : "Your turn!"}
              </span>
            )}
          </div>

          {/* Toggle */}
          <button
            onClick={() => setIsShared(!isShared)}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${isShared ? "bg-green-500" : "bg-gray-300 dark:bg-slate-600"}`}
          >
            <div
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                isShared ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {/* Today's Turn status banner */}
        {isShared && turnStatus && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className={`relative overflow-hidden rounded-2xl p-4 mb-4 ${
              turnStatus.isMyTurn ? "bg-gradient-to-r from-green-500 to-emerald-500" : "bg-gradient-to-r from-slate-500 to-slate-600"
            }`}
          >
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.15, 0.25, 0.15] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white"
            />
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.1, 0.2, 0.1] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              className="absolute -bottom-6 -left-6 w-32 h-32 rounded-full bg-white"
            />

            <div className="relative z-10">
              <div className="flex items-center gap-3">
                <motion.div
                  animate={turnStatus.isMyTurn ? { scale: [1, 1.1, 1] } : {}}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    turnStatus.isMyTurn ? "bg-white/25" : "bg-white/20"
                  }`}
                >
                  <span className="text-2xl">{turnStatus.isMyTurn ? "🚰" : "👤"}</span>
                </motion.div>

                <div className="flex-1">
                  <motion.p
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-white font-semibold text-sm leading-tight"
                  >
                    {turnStatus.isMyTurn
                      ? turnStatus.justStarted
                        ? language === "ta" ? "✅ உங்கள் முறை தொடங்கியது!" : "✅ Your Turn Has Started!"
                        : turnStatus.endsToday
                          ? language === "ta" ? "⏰ உங்கள் முறை இன்று முடியும்" : "⏰ Your Turn Ends Today"
                          : language === "ta" ? "✅ உங்கள் முறை தொடர்கிறது" : "✅ Your Turn is Active"
                      : language === "ta" ? `💧 ${getDisplayName(turnStatus.ownerName)} முறை தொடர்கிறது` : `💧 ${getDisplayName(turnStatus.ownerName)}'s Turn is Active`}
                  </motion.p>
                  <motion.p
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-white/80 text-xs mt-0.5"
                  >
                    {turnStatus.isMyTurn
                      ? turnStatus.justStarted
                        ? language === "ta"
                          ? `உங்கள் முறை ${formatTurnEndTime(turnStatus.turnEndTime, language)} வரை தொடரும்`
                          : `Your turn continues until ${formatTurnEndTime(turnStatus.turnEndTime, language)}`
                        : turnStatus.endsToday
                          ? language === "ta"
                            ? "இன்று மாலை 6:00 மணிக்கு முடியும். பாசனம் முடிக்கவும்."
                            : "Ends today at 6:00 PM. Complete your watering."
                          : language === "ta"
                            ? `${formatTurnEndTime(turnStatus.turnEndTime, language)} வரை உங்கள் முறை`
                            : `Ends ${formatTurnEndTime(turnStatus.turnEndTime, language)}`
                      : language === "ta"
                        ? `அவர்கள் முறை ${formatTurnEndTime(turnStatus.turnEndTime, language)} முடியும்`
                        : `Their turn ends ${formatTurnEndTime(turnStatus.turnEndTime, language)}`}
                  </motion.p>
                </div>

                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4 }}
                  className="bg-white/25 rounded-xl px-2.5 py-1.5 text-center flex-shrink-0"
                >
                  {turnStatus.endingSoon ? (
                    <>
                      <p className="text-white font-bold text-xl leading-none">{Math.ceil(turnStatus.hoursRemaining)}</p>
                      <p className="text-white/80 text-xs">{language === "ta" ? "மணி" : "hrs"}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-white font-bold text-xl leading-none">{turnStatus.daysRemaining}</p>
                      <p className="text-white/80 text-xs">{language === "ta" ? "நாள்" : "days"}</p>
                    </>
                  )}
                </motion.div>
              </div>

              {turnStatus.isMyTurn && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="flex items-center gap-1.5 mt-2.5"
                >
                  <motion.div
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    className="w-2 h-2 rounded-full bg-white"
                  />
                  <p className="text-white/90 text-xs">
                    {turnStatus.endingSoon
                      ? language === "ta" ? "விரைவில் பாசனம் முடிக்கவும்!" : "Finish your watering soon!"
                      : language === "ta" ? "இப்போதே தண்ணீர் பாசனம் செய்யலாம்" : "You can water your fields now"}
                  </p>
                </motion.div>
              )}

              {/* Next turn info */}
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="text-white/70 text-xs mt-1.5">
                {turnStatus.isMyTurn
                  ? language === "ta"
                    ? `அடுத்து: ${getDisplayName(turnStatus.nextOwnerName)} முறை ${formatTurnEndTime(turnStatus.nextTurnStartTime, language)} முதல்`
                    : `Next: ${getDisplayName(turnStatus.nextOwnerName)}'s turn from ${formatTurnEndTime(turnStatus.nextTurnStartTime, language)}`
                  : language === "ta"
                    ? `உங்கள் அடுத்த முறை ${formatTurnEndTime(turnStatus.nextTurnStartTime, language)} தொடங்கும்`
                    : `Your next turn starts ${formatTurnEndTime(turnStatus.nextTurnStartTime, language)}`}
              </motion.p>
            </div>
          </motion.div>
        )}

        {/* Shared motor details */}
        {isShared && (
          <div className="space-y-2">
            {/* Collapsible Turn Details */}
            <div>
              <button
                onClick={() => setShowTurnDetails(!showTurnDetails)}
                className="w-full flex items-center justify-between py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
              >
                <span className="flex items-center gap-2">
                  ⚙️ <span>{language === "ta" ? "முறை விவரங்கள்" : "Turn Details"}</span>
                </span>
                <motion.span
                  animate={{ rotate: showTurnDetails ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-gray-400 text-xs"
                >
                  ▼
                </motion.span>
              </button>

              <AnimatePresence>
                {showTurnDetails && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 space-y-2 mt-1">
                      {/* Initial Turn selector */}
                      <div>
                        <label className={`${labelCls} mb-0.5 block`}>{language === "ta" ? "தொடக்க முறை" : "Initial Turn"}</label>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 mb-2">
                          {language === "ta"
                            ? "இந்த தேதியிலிருந்து யார் முதலில் தொடங்குகிறார்?"
                            : "Who starts the first turn from the selected date?"}
                        </p>
                        <label className={`${labelCls} mb-1 block`}>{language === "ta" ? "முதலில் யார் முறை?" : "Who starts first?"}</label>
                        <select
                          value={turnOwner}
                          onChange={(e) => setTurnOwner(e.target.value)}
                          className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        >
                          <option value="me">{language === "ta" ? "என் முறை" : "My Turn"}</option>
                          {partners.map((partner) => (
                            <option key={partner.id} value={partner.partner_name}>
                              {partner.partner_name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Turn start date/time */}
                      <div>
                        <label className={`${labelCls} mb-1 block`}>{language === "ta" ? "முறை தொடங்கிய நேரம்" : "Turn Started"}</label>
                        <input
                          type="datetime-local"
                          value={turnStart}
                          onChange={(e) => setTurnStart(e.target.value)}
                          className={valueInputCls}
                          style={{ colorScheme: "light", minWidth: 0, width: "100%" }}
                        />
                        {turnStart && (
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(turnStart).toLocaleString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true,
                            })}
                          </p>
                        )}
                      </div>

                      {/* Turn duration — hours or days */}
                      <div>
                        <label className={`${labelCls} mb-1 block`}>{language === "ta" ? "கால அளவு" : "Duration"}</label>

                        <div className="flex gap-2 mb-2">
                          <button
                            onClick={() => setDurationType("hours")}
                            className={`flex-1 text-sm py-1.5 rounded-lg font-medium transition-all ${
                              durationType === "hours" ? "bg-green-600 text-white" : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400"
                            }`}
                          >
                            {language === "ta" ? "மணி நேரம்" : "Hours"}
                          </button>
                          <button
                            onClick={() => setDurationType("days")}
                            className={`flex-1 text-sm py-1.5 rounded-lg font-medium transition-all ${
                              durationType === "days" ? "bg-green-600 text-white" : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400"
                            }`}
                          >
                            {language === "ta" ? "நாட்கள்" : "Days"}
                          </button>
                        </div>

                        {durationType === "hours" && (
                          <div className="flex gap-1 flex-wrap">
                            {HOUR_OPTIONS.map((hour) => (
                              <button
                                key={hour}
                                onClick={() => setTurnHours(hour)}
                                className={`px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                  turnHours === hour ? "bg-green-600 text-white" : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400"
                                }`}
                              >
                                {hour}
                                {language === "ta" ? "மணி" : "hr"}
                              </button>
                            ))}
                          </div>
                        )}

                        {durationType === "days" && (
                          <div className="flex gap-1">
                            {DAY_OPTIONS.map((day) => (
                              <button
                                key={day}
                                onClick={() => setTurnDays(day)}
                                className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${
                                  turnDays === day ? "bg-green-600 text-white" : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400"
                                }`}
                              >
                                {day}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Schedule preview */}
                      <div>
                        <button
                          onClick={() => setShowSchedule(!showSchedule)}
                          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium mt-2"
                        >
                          📅 {showSchedule ? (language === "ta" ? "அட்டவணையை மறை" : "Hide Schedule") : language === "ta" ? "அட்டவணை காட்டு" : "View Schedule"}
                          <span>{showSchedule ? "▲" : "▼"}</span>
                        </button>

                        {showSchedule && (
                          <div className="mt-2 space-y-2">
                            {scheduleEntries.map((entry, index) => {
                              const startStr = entry.startTime.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
                              const startTimeStr = entry.startTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
                              const endStr = entry.endTime.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
                              const endTimeStr = entry.endTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
                              const displayName = displayNameMap[entry.ownerName] || entry.ownerName;

                              return (
                                <div
                                  key={index}
                                  className={`rounded-xl p-3 border transition-all ${
                                    entry.isCurrent
                                      ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700/50 shadow-sm"
                                      : entry.isPast
                                        ? "bg-gray-50 dark:bg-slate-700/30 border-gray-100 dark:border-slate-600/30 opacity-60"
                                        : "bg-white dark:bg-slate-700/50 border-gray-100 dark:border-slate-600/30"
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      {entry.isCurrent && (
                                        <motion.div
                                          animate={{ opacity: [1, 0.3, 1] }}
                                          transition={{ duration: 1.5, repeat: Infinity }}
                                          className="w-2 h-2 rounded-full bg-green-500"
                                        />
                                      )}

                                      <div>
                                        <p
                                          className={`text-sm font-semibold ${
                                            entry.isCurrent
                                              ? "text-green-700 dark:text-green-400"
                                              : entry.isMe
                                                ? "text-blue-700 dark:text-blue-400"
                                                : "text-gray-700 dark:text-gray-300"
                                          }`}
                                        >
                                          {entry.isMe ? (language === "ta" ? "👤 நீங்கள்" : "👤 You") : `👤 ${displayName}`}
                                          {entry.isCurrent && (
                                            <span className="ml-1.5 text-xs font-normal text-green-600 dark:text-green-400">
                                              {language === "ta" ? "(தொடர்கிறது)" : "(Active)"}
                                            </span>
                                          )}
                                        </p>

                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                          {startStr} {startTimeStr}
                                          {" → "}
                                          {endStr} {endTimeStr}
                                        </p>
                                      </div>
                                    </div>

                                    <div
                                      className={`text-xs px-2 py-1 rounded-lg font-medium ${
                                        entry.isCurrent
                                          ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400"
                                          : "bg-gray-100 dark:bg-slate-600/50 text-gray-400 dark:text-gray-400"
                                      }`}
                                    >
                                      {entry.isPast
                                        ? language === "ta" ? "முடிந்தது" : "Done"
                                        : entry.isCurrent
                                          ? language === "ta" ? "இப்போது" : "Now"
                                          : language === "ta" ? "வரும்" : "Upcoming"}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {scheduleEntries.length === 0 && (
                              <p className="text-xs text-center text-gray-400 dark:text-gray-500 py-4">
                                {language === "ta" ? "அட்டவணை இல்லை" : "No schedule available"}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Shared Partners section */}
            <div>
              <p className={`${sectionTitleCls} mb-2`}>👥 {language === "ta" ? "பகிர்வு கூட்டாளிகள்" : "Shared Partners"}</p>

              {/* Existing partners */}
              {partners.map((partner) => (
                <div key={partner.id} className="flex items-center justify-between bg-gray-50 dark:bg-slate-700 rounded-lg px-3 py-2 mb-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{partner.partner_name}</p>
                    <p className={labelCls}>
                      {partner.partner_phone && `📞 ${partner.partner_phone} • `}
                      {partner.turn_days} {language === "ta" ? "நாட்கள்" : "days/turn"}
                    </p>
                  </div>
                  <button onClick={() => removePartner(partner.id!)} className="min-h-[44px] min-w-[44px] text-red-400 hover:text-red-600 text-sm ml-2">
                    🗑️
                  </button>
                </div>
              ))}

              {/* Add partner toggle */}
              <button
                onClick={() => setShowAddPartner(true)}
                className="text-sm text-green-600 hover:text-green-700 font-medium flex items-center gap-1 mt-2"
              >
                + {language === "ta" ? "பகிர்வு கூட்டாளி சேர்க்கவும்" : "Add Shared Partner"}
              </button>

              {showAddPartner && (
                <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-3 space-y-2 mt-2">
                  <input
                    type="text"
                    value={newPartnerName}
                    onChange={(e) => setNewPartnerName(e.target.value)}
                    placeholder={language === "ta" ? "பெயர் *" : "Name *"}
                    className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <input
                    type="tel"
                    value={newPartnerPhone}
                    onChange={(e) => setNewPartnerPhone(e.target.value)}
                    placeholder={language === "ta" ? "தொலைபேசி (விருப்பமானது)" : "Phone (optional)"}
                    className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500">{language === "ta" ? "நாட்கள்:" : "Days:"}</span>
                    {DAY_OPTIONS.map((day) => (
                      <button
                        key={day}
                        onClick={() => setNewPartnerDays(day)}
                        className={`w-7 h-7 rounded-lg text-sm font-medium ${
                          newPartnerDays === day ? "bg-green-600 text-white" : "bg-gray-100 dark:bg-slate-600 text-gray-600 dark:text-gray-300"
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setShowAddPartner(false);
                        setNewPartnerName("");
                        setNewPartnerPhone("");
                        setNewPartnerDays(2);
                      }}
                      className="flex-1 text-sm font-medium py-2 rounded-lg bg-gray-100 dark:bg-slate-600 text-gray-600 dark:text-gray-300"
                    >
                      {language === "ta" ? "ரத்து" : "Cancel"}
                    </button>
                    <button onClick={addPartner} className="flex-1 text-sm py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium">
                      {language === "ta" ? "சேர்" : "Add"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        <DeleteConfirmDialog isOpen={deleteOpen} onConfirm={handleDeleteConfirm} onCancel={handleDeleteCancel} language={language} />
      </div>
    );
  }
);

export default MotorSharingSection;
