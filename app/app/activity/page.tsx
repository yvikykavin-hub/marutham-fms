"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import Sidebar from "../../components/Sidebar";
import PullToRefresh from "../../components/PullToRefresh";
import { SkeletonList } from "../../components/Skeleton";
import { supabase } from "../../lib/supabase";
import { useLang } from "../../lib/useLang";

const MAX_LOG_ENTRIES = 50;

type ActivityLogRow = {
  id: string;
  username: string;
  display_name: string | null;
  action: string;
  module: string;
  description: string;
  record_id: string | null;
  created_at: string;
};

export default function ActivityPage() {
  const [lang, setLang] = useLang();
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);

  const [logs, setLogs] = useState<ActivityLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUser, setFilterUser] = useState("all");
  const [filterModule, setFilterModule] = useState("all");
  const [filterDate, setFilterDate] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const cleanupOldLogs = async () => {
    const { count } = await supabase.from("activity_logs").select("*", { count: "exact", head: true });
    if (!count || count <= MAX_LOG_ENTRIES) return;

    // The Nth-newest row's created_at is the cutoff — everything older gets deleted.
    const { data: cutoff } = await supabase
      .from("activity_logs")
      .select("created_at")
      .order("created_at", { ascending: false })
      .range(MAX_LOG_ENTRIES - 1, MAX_LOG_ENTRIES - 1)
      .single();
    if (!cutoff) return;

    const { error } = await supabase.from("activity_logs").delete().lt("created_at", cutoff.created_at);
    if (error) console.error("Activity log cleanup failed:", error);
  };

  // Keeps the table from growing forever — runs once per page load, before
  // the first fetch, so a freshly-trimmed table is what gets displayed.
  useEffect(() => {
    cleanupOldLogs();
  }, []);

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterUser, filterModule, filterDate]);

  const fetchLogs = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setSelectedIds([]);
    setSelectMode(false);

    let query = supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(MAX_LOG_ENTRIES);

    if (filterUser !== "all") {
      query = query.eq("username", filterUser);
    }
    if (filterModule !== "all") {
      query = query.eq("module", filterModule);
    }
    if (filterDate === "today") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query = query.gte("created_at", today.toISOString());
    } else if (filterDate === "week") {
      const week = new Date();
      week.setDate(week.getDate() - 7);
      query = query.gte("created_at", week.toISOString());
    } else if (filterDate === "month") {
      const month = new Date();
      month.setDate(month.getDate() - 30);
      query = query.gte("created_at", month.toISOString());
    }

    const { data } = await query;
    if (data) setLogs(data);

    if (isRefresh) setRefreshing(false);
    else setLoading(false);
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.length === logs.length ? [] : logs.map((l) => l.id)));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return;

    const { error } = await supabase.from("activity_logs").delete().in("id", selectedIds);

    if (error) {
      toast.error(L("Delete failed. Try again.", "நீக்க முடியவில்லை."));
      return;
    }

    setLogs((prev) => prev.filter((l) => !selectedIds.includes(l.id)));
    toast.success(L(`${selectedIds.length} entries deleted`, `${selectedIds.length} பதிவுகள் நீக்கப்பட்டன`));
    setSelectedIds([]);
    setSelectMode(false);
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case "added":
        return "➕";
      case "updated":
        return "✏️";
      case "deleted":
        return "🗑️";
      default:
        return "📝";
    }
  };

  const getActionStyle = (action: string) => {
    switch (action) {
      case "added":
        return "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-100 dark:border-green-800/30";
      case "updated":
        return "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-800/30";
      case "deleted":
        return "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-800/30";
      default:
        return "bg-gray-50 dark:bg-slate-700 text-gray-600 border border-gray-100 dark:border-slate-600";
    }
  };

  const getUserStyle = (username: string) => {
    const styles: Record<string, string> = {
      kavin: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
      sachin: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
      madhu: "bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400",
    };
    return styles[username] || "bg-gray-100 dark:bg-slate-600 text-gray-600 dark:text-gray-300";
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return L("Just now", "இப்போதே");
    if (minutes < 60) return `${minutes}m ${L("ago", "முன்பு")}`;
    if (hours < 24) return `${hours}h ${L("ago", "முன்பு")}`;
    if (days < 7) return `${days}d ${L("ago", "முன்பு")}`;

    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <Sidebar lang={lang} setLang={setLang} />

      <main className="flex-1 overflow-y-auto p-4">
        <PullToRefresh onRefresh={() => fetchLogs(true)} language={lang}>
          <div className="max-w-2xl mx-auto flex flex-col gap-4">
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between flex-wrap gap-2"
            >
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-primary">
                  📋 {L("Activity Log", "செயல்பாடு பதிவு")}
                </h1>
                {logs.length > 0 && (
                  <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
                    {logs.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchLogs(true)}
                  disabled={refreshing}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-gray-100 dark:bg-slate-700 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50 min-h-[44px] sm:min-h-0"
                >
                  <span className={refreshing ? "animate-spin" : ""}>🔄</span>
                  <span className="hidden sm:block text-xs">{L("Refresh", "புதுப்பி")}</span>
                </button>
                <button
                  onClick={() => setLang(lang === "ta" ? "en" : "ta")}
                  className="px-3 py-1.5 rounded-lg border border-primary/40 text-primary text-sm font-medium hover:bg-green-50 transition"
                >
                  {lang === "ta" ? "English" : "தமிழ்"}
                </button>
              </div>
            </motion.div>

            {/* Filters */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* User filter */}
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                    👤 {L("User", "பயனர்")}
                  </label>
                  <select
                    value={filterUser}
                    onChange={(e) => setFilterUser(e.target.value)}
                    className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="all">{L("All Users", "அனைவரும்")}</option>
                    <option value="kavin">Kavin</option>
                    <option value="sachin">Sachin</option>
                    <option value="madhu">Madhu</option>
                  </select>
                </div>

                {/* Module filter */}
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                    📁 {L("Module", "பிரிவு")}
                  </label>
                  <select
                    value={filterModule}
                    onChange={(e) => setFilterModule(e.target.value)}
                    className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="all">{L("All Modules", "அனைத்து பிரிவு")}</option>

                    <optgroup label={L("🐄 Livestock", "🐄 கால்நடை")}>
                      <option value="Milk Collection">{L("Milk Collection", "பால் சேகரிப்பு")}</option>
                      <option value="Milk Rate">{L("Milk Rate", "பால் விலை")}</option>
                      <option value="Milk Payment">{L("Milk Payment", "பால் பணம்")}</option>
                      <option value="Cow Expense">{L("Cow Expense", "மாடு செலவு")}</option>
                      <option value="Goat Income">{L("Goat Income", "ஆடு வருமானம்")}</option>
                      <option value="Goat Expense">{L("Goat Expense", "ஆடு செலவு")}</option>
                      <option value="Hen Income">{L("Hen Income", "கோழி வருமானம்")}</option>
                      <option value="Hen Expense">{L("Hen Expense", "கோழி செலவு")}</option>
                      <option value="Animal">{L("Animal", "கால்நடை")}</option>
                      <option value="Payment">{L("Payment", "பணம்")}</option>
                    </optgroup>

                    <optgroup label={L("🌾 Crops", "🌾 பயிர்கள்")}>
                      <option value="Farm">{L("Farm", "பண்ணை")}</option>
                      <option value="Crop">{L("Crop", "பயிர்")}</option>
                      <option value="Income">{L("Income", "வருமானம்")}</option>
                      <option value="Expense">{L("Expense", "செலவு")}</option>
                    </optgroup>

                    <optgroup label={L("🚜 Machinery", "🚜 இயந்திரங்கள்")}>
                      <option value="Tractor">{L("Tractor", "டிராக்டர்")}</option>
                      <option value="Tractor Diesel">{L("Tractor Diesel", "டிராக்டர் டீசல்")}</option>
                      <option value="Tractor Usage">{L("Tractor Usage", "டிராக்டர் பயன்பாடு")}</option>
                      <option value="Tractor Oil">{L("Tractor Oil", "டிராக்டர் எண்ணெய்")}</option>
                      <option value="Tractor Maintenance">{L("Tractor Maintenance", "டிராக்டர் பராமரிப்பு")}</option>
                    </optgroup>

                    <optgroup label={L("🗺️ Land", "🗺️ நிலம்")}>
                      <option value="Land Details">{L("Land Details", "நில விவரம்")}</option>
                      <option value="Land Document">{L("Land Document", "நில ஆவணம்")}</option>
                      <option value="Motor Sharing">{L("Motor Sharing", "மோட்டார் பகிர்வு")}</option>
                    </optgroup>
                  </select>
                </div>

                {/* Date filter */}
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                    📅 {L("Period", "காலம்")}
                  </label>
                  <select
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="all">{L("All Time", "எல்லா நேரமும்")}</option>
                    <option value="today">{L("Today", "இன்று")}</option>
                    <option value="week">{L("This Week", "இந்த வாரம்")}</option>
                    <option value="month">{L("This Month", "இந்த மாதம்")}</option>
                  </select>
                </div>
              </div>
            </motion.div>

            {/* Select toolbar */}
            {!loading && logs.length > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectMode(!selectMode);
                      setSelectedIds([]);
                    }}
                    className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-colors ${
                      selectMode
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                        : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    {selectMode ? L("Cancel", "ரத்து") : L("Select", "தேர்வு")}
                  </button>

                  {selectMode && (
                    <button
                      onClick={toggleSelectAll}
                      className="text-xs px-3 py-1.5 rounded-xl font-medium bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400"
                    >
                      {selectedIds.length === logs.length ? L("Deselect All", "எல்லாம் நீக்கு") : L("Select All", "எல்லாம் தேர்வு")}
                    </button>
                  )}
                </div>

                {selectedIds.length > 0 && (
                  <button
                    onClick={deleteSelected}
                    className="text-xs px-3 py-1.5 rounded-xl font-medium bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center gap-1"
                  >
                    🗑️ {L(`Delete (${selectedIds.length})`, `நீக்கு (${selectedIds.length})`)}
                  </button>
                )}
              </div>
            )}

            {/* Log entries */}
            {loading ? (
              <SkeletonList count={5} />
            ) : logs.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-16"
              >
                <div className="text-5xl mb-3">📋</div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {L("No activity yet", "செயல்பாடு இல்லை")}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {L("Actions will appear here", "செயல்கள் இங்கே தெரியும்")}
                </p>
              </motion.div>
            ) : (
              <AnimatePresence mode="popLayout">
                <div className="space-y-2">
                  {logs.map((log, index) => (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.3 }}
                      onClick={() => {
                        if (selectMode) toggleSelect(log.id);
                      }}
                      className={`bg-white dark:bg-slate-800 rounded-2xl p-3 shadow-sm border border-gray-100 dark:border-slate-700 transition-all duration-200 ${
                        selectMode ? "cursor-pointer active:scale-[0.98]" : "hover:shadow-md"
                      } ${selectedIds.includes(log.id) ? "border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/10" : ""}`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox in select mode */}
                        {selectMode && (
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center mt-0.5 transition-all ${
                              selectedIds.includes(log.id) ? "bg-green-600 border-green-600" : "border-gray-300 dark:border-slate-500"
                            }`}
                          >
                            {selectedIds.includes(log.id) && (
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                <path d="M2 5 L4 7 L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                        )}

                        {/* Action icon */}
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm ${getActionStyle(log.action)}`}
                        >
                          {getActionIcon(log.action)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            {/* User badge */}
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getUserStyle(log.username)}`}>
                              {log.display_name || log.username}
                            </span>

                            {/* Module badge */}
                            <span className="text-xs bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
                              {log.module}
                            </span>
                          </div>

                          {/* Description */}
                          <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">{log.description}</p>

                          {/* Time */}
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            🕐 {formatTime(log.created_at)}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </AnimatePresence>
            )}

            {/* Bottom note */}
            {logs.length === MAX_LOG_ENTRIES && (
              <p className="text-xs text-center text-gray-400 dark:text-gray-500">
                {L(`Showing latest ${MAX_LOG_ENTRIES} entries`, `கடைசி ${MAX_LOG_ENTRIES} பதிவுகள் காட்டுகிறது`)}
              </p>
            )}
          </div>
        </PullToRefresh>
      </main>
    </div>
  );
}
