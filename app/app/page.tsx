"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { AnimatePresence, motion } from "framer-motion";
import Sidebar from "../components/Sidebar";
import { StaggerContainer, StaggerItem } from "../components/AnimatedContainer";
import { SuccessCheckmark } from "../components/SuccessAnimation";
import EmptyState from "../components/EmptyState";
import DeleteConfirmDialog from "../components/DeleteConfirmDialog";
import { useDeleteConfirm } from "../hooks/useDeleteConfirm";
import { SkeletonDashboard } from "../components/Skeleton";
import DarkModeToggle from "../components/DarkModeToggle";
import NotificationBell from "../components/NotificationBell";
import VoiceAgent from "../components/VoiceAgent";
import ChatWidget from "../components/ChatWidget";
import WeatherWidget from "../components/WeatherWidget";
import PullToRefresh from "../components/PullToRefresh";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { ActivityLog } from "../lib/activityLog";
import { getValidationMessage } from "../lib/validation";
import { supabase } from "../lib/supabase";
import { useLang } from "../lib/useLang";

const farmGradients = [
  "from-green-50 to-emerald-50 border-green-100 dark:from-green-900/20 dark:to-emerald-900/20 dark:border-green-800/40",
  "from-amber-50 to-yellow-50 border-amber-100 dark:from-amber-900/20 dark:to-yellow-900/20 dark:border-amber-800/40",
  "from-blue-50 to-sky-50 border-blue-100 dark:from-blue-900/20 dark:to-sky-900/20 dark:border-blue-800/40",
  "from-orange-50 to-red-50 border-orange-100 dark:from-orange-900/20 dark:to-red-900/20 dark:border-orange-800/40",
  "from-teal-50 to-cyan-50 border-teal-100 dark:from-teal-900/20 dark:to-cyan-900/20 dark:border-teal-800/40",
  "from-purple-50 to-fuchsia-50 border-purple-100 dark:from-purple-900/20 dark:to-fuchsia-900/20 dark:border-purple-800/40",
];

const farmAccentColors = ["bg-green-500", "bg-amber-500", "bg-blue-500", "bg-orange-500", "bg-teal-500", "bg-purple-500"];

type Farm = {
  id: string;
  name: string;
  total_area: number;
  has_well: boolean;
  has_motor: boolean;
};

export default function Dashboard() {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useLang();
  const [activeCropsCount, setActiveCropsCount] = useState<number>(0);

  // Add farm form
  const [farmName, setFarmName] = useState("");
  const [area, setArea] = useState("");
  const [hasWell, setHasWell] = useState(true);
  const [hasMotor, setHasMotor] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showAddFarmModal, setShowAddFarmModal] = useState(false);
  const { isOpen: deleteOpen, confirmDelete, handleConfirm: handleDeleteConfirm, handleCancel: handleDeleteCancel } = useDeleteConfirm();

  useEffect(() => {
    fetchFarms();
    fetchActiveCropsCount();
  }, []);

  const fetchFarms = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("farms")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setFarms(data);
    setLoading(false);
  };

  const fetchActiveCropsCount = async () => {
    const { count: cropCount } = await supabase
      .from("cultivations")
      .select("*", { count: "exact", head: true })
      .is("end_date", null);
    setActiveCropsCount(cropCount || 0);
  };

  const addFarm = async () => {
    if (!farmName.trim() || !area) {
      toast.error(lang === "ta" ? "நிலம் பெயர் மற்றும் பரப்பளவு தேவை" : "Farm name and area are required");
      return;
    }
    if (farmName.trim().length < 2) {
      toast.error(getValidationMessage("min_chars", lang));
      return;
    }
    if (farmName.length > 50) {
      toast.error(getValidationMessage("max_chars", lang));
      return;
    }
    const areaVal = Number(area);
    if (!areaVal || areaVal <= 0) {
      toast.error(getValidationMessage("min_area", lang));
      return;
    }

    const payload = {
      name: farmName.trim(),
      total_area: parseFloat(area),
      has_well: hasWell,
      has_motor: hasMotor,
    };

    setSaving(true);
    try {
      const { error } = await supabase.from("farms").insert(payload);
      if (error) {
        toast.error("Error saving farm: " + error.message);
      } else {
        toast.success(lang === "ta" ? "சேமிக்கப்பட்டது!" : "Saved successfully!");
        await ActivityLog.added("Farm", `New farm: ${farmName.trim()}`);
        setFarmName("");
        setArea("");
        setHasWell(true);
        setHasMotor(true);
        setShowAddFarmModal(false);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
        fetchFarms();
      }
    } catch (err) {
      console.error("Unexpected error saving farm:", err);
      toast.error("Unexpected error saving farm: " + (err instanceof Error ? err.message : String(err)));
    }
    setSaving(false);
  };

  const deleteFarm = (e: React.MouseEvent, farm: Farm) => {
    e.preventDefault();
    e.stopPropagation();
    confirmDelete(async () => {
      const { error } = await supabase.from("farms").delete().eq("id", farm.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(lang === "ta" ? "நிலம் நீக்கப்பட்டது" : "Farm deleted successfully");
      await ActivityLog.deleted("Farm", `Farm deleted: ${farm.name}`);
      fetchFarms();
    });
  };

  const totalArea = farms.reduce((sum, f) => sum + Number(f.total_area), 0);

  const t = {
    title: lang === "ta" ? "மருதம் பண்ணை மேலாண்மை அமைப்பு" : "Marutham Farm Management System",
    tagline: lang === "ta" ? "உழைப்பே உயர்வு" : "Rooted in Tradition, Driven by Data",
    totalFarms: lang === "ta" ? "மொத்த நிலங்கள்" : "Total Farms",
    totalArea: lang === "ta" ? "மொத்த பரப்பு" : "Total Area",
    activeCrops: lang === "ta" ? "செயலில் உள்ள பயிர்கள்" : "Active Crops",
    addFarm: lang === "ta" ? "நிலம் சேர்க்க" : "Add Farm",
    farmName: lang === "ta" ? "நிலத்தின் பெயர்" : "Farm Name",
    areaAcres: lang === "ta" ? "பரப்பளவு (ஏக்கர்)" : "Area (Acres)",
    well: lang === "ta" ? "கிணறு" : "Well",
    motor: lang === "ta" ? "மோட்டார்" : "Motor",
    save: lang === "ta" ? "சேமி" : "Save Farm",
    myFarms: lang === "ta" ? "என் நிலங்கள்" : "My Farms",
    yes: lang === "ta" ? "உண்டு" : "Yes",
    no: lang === "ta" ? "இல்லை" : "No",
    loading: lang === "ta" ? "ஏற்றுகிறது..." : "Loading...",
    noFarms: lang === "ta" ? "நிலங்கள் எதுவும் இல்லை. மேலே சேர்க்கவும்." : "No farms yet. Add one above.",
    acres: lang === "ta" ? "ஏக்கர்" : "Acres",
    addNewFarm: lang === "ta" ? "புதிய பண்ணை சேர்" : "Add New Farm",
    cancel: lang === "ta" ? "ரத்து" : "Cancel",
  };

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <Sidebar lang={lang} setLang={setLang} />

      <main className="flex-1 p-3 overflow-y-auto overflow-x-hidden flex flex-col pb-20">
        <PullToRefresh
          onRefresh={async () => {
            await Promise.all([fetchFarms(), fetchActiveCropsCount()]);
          }}
          language={lang}
        >
        <div className="max-w-6xl mx-auto w-full flex flex-col gap-3">

          {/* Header */}
          <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-3 flex flex-col gap-3 shrink-0">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-4xl shrink-0">👨‍🌾</span>
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t.title}</h1>
                  <p className="text-xs text-gray-500 mt-0.5">{t.tagline}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <DarkModeToggle />
                <VoiceAgent language={lang} />
                <NotificationBell language={lang} />
              </div>
            </div>

            {/* Weather banner BELOW title */}
            <WeatherWidget language={lang} />
          </div>

          {loading ? (
            <SkeletonDashboard />
          ) : (
          <>
          {/* Stats Cards */}
          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 shrink-0">
            {[
              { label: t.totalFarms, value: farms.length, decimals: 0, suffix: "", color: "text-primary", bg: "bg-green-50", icon: "🌳" },
              { label: t.totalArea, value: totalArea, decimals: 2, suffix: ` ${t.acres}`, color: "text-blue-700", bg: "bg-blue-50", icon: "📐" },
              { label: t.activeCrops, value: activeCropsCount, decimals: 0, suffix: "", color: "text-amber-700", bg: "bg-amber-50", icon: "🌾" },
            ].map((card) => (
              <StaggerItem key={card.label}>
                <div className={`${card.bg} rounded-2xl p-5 border border-white shadow-sm relative overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5`}>
                  <div className="absolute top-0 right-0 w-20 h-20 bg-white/40 rounded-full -mr-8 -mt-8" />
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-sm text-gray-700">{card.label}</p>
                    <span className="text-base">{card.icon}</span>
                  </div>
                  <p className={`text-2xl font-bold ${card.color}`}>
                    <AnimatedNumber value={card.value} decimals={card.decimals} suffix={card.suffix} />
                  </p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>

          {/* Farms List */}
          <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <span className="w-6 h-6 bg-green-100 rounded-lg flex items-center justify-center text-xs">🌳</span>
                {t.myFarms}
              </h2>
              <button
                onClick={() => setShowAddFarmModal(true)}
                className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-white rounded-xl px-3 py-1.5 text-xs font-medium transition shadow-sm active:scale-95"
              >
                + {t.addFarm}
              </button>
            </div>

            {farms.length === 0 ? (
              <EmptyState
                type="land"
                title={lang === "ta" ? "நிலங்கள் இல்லை" : "No farms added yet"}
                subtitle={t.noFarms}
              />
            ) : (
              <StaggerContainer className="space-y-2">
                {farms.map((farm, i) => (
                  <StaggerItem key={farm.id}>
                    <Link href={`/farms/${farm.id}`}>
                      <div className={`relative overflow-hidden flex flex-wrap justify-between items-center gap-2 p-3 rounded-2xl border bg-gradient-to-br ${farmGradients[i % farmGradients.length]} hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 cursor-pointer active:scale-[0.99] group`}>
                        <span className={`absolute left-0 top-0 bottom-0 w-1 ${farmAccentColors[i % farmAccentColors.length]}`} />
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 bg-white/70 dark:bg-slate-800/60 rounded-xl flex items-center justify-center text-lg transition shrink-0">
                            🌳
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-sm text-primary truncate">{farm.name}</h3>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                              {t.well}: {farm.has_well ? t.yes : t.no} &nbsp;|&nbsp;
                              {t.motor}: {farm.has_motor ? t.yes : t.no}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <span className="text-primary text-xs">{farm.total_area}</span>
                            <span className="text-primary text-xs ml-1">{t.acres}</span>
                          </div>
                          <button
                            onClick={(e) => deleteFarm(e, farm)}
                            title={lang === "ta" ? "நீக்கு" : "Delete"}
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-red-400 hover:text-red-600 text-xs font-medium shrink-0 transition-colors"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </Link>
                  </StaggerItem>
                ))}
              </StaggerContainer>
            )}
          </div>
          </>
          )}

        </div>
        </PullToRefresh>
      </main>

      {/* Add Farm Modal */}
      <AnimatePresence>
        {showAddFarmModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddFarmModal(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-x-4 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md bg-white dark:bg-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl z-50 p-5 pb-8 sm:pb-5"
            >
              {/* Handle bar (mobile) */}
              <div className="flex justify-center mb-4 sm:hidden">
                <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-slate-600" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  🏡 {t.addNewFarm}
                </h2>
                <button
                  onClick={() => setShowAddFarmModal(false)}
                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-gray-500 text-sm active:scale-95"
                >
                  ✕
                </button>
              </div>

              {/* Form fields - same as before */}
              <div className="space-y-3">
                <div>
                  <label className="block mb-0.5 text-xs text-gray-600 dark:text-gray-400">
                    {t.farmName}
                  </label>
                  <input
                    type="text"
                    placeholder={t.farmName}
                    value={farmName}
                    onChange={(e) => setFarmName(e.target.value)}
                    className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block mb-0.5 text-xs text-gray-600 dark:text-gray-400">
                    {t.areaAcres}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    onKeyDown={(e) => { if (e.key === "-") e.preventDefault(); }}
                    placeholder="0.00"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={hasWell ? "yes" : "no"}
                    onChange={(e) => setHasWell(e.target.value === "yes")}
                    className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                  >
                    <option className="text-gray-900" value="yes">{t.well}: {t.yes}</option>
                    <option className="text-gray-900" value="no">{t.well}: {t.no}</option>
                  </select>
                  <select
                    value={hasMotor ? "yes" : "no"}
                    onChange={(e) => setHasMotor(e.target.value === "yes")}
                    className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                  >
                    <option className="text-gray-900" value="yes">{t.motor}: {t.yes}</option>
                    <option className="text-gray-900" value="no">{t.motor}: {t.no}</option>
                  </select>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setShowAddFarmModal(false)}
                    className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-slate-700 text-sm font-medium text-gray-600 dark:text-gray-400 active:scale-95 transition-all"
                  >
                    {t.cancel}
                  </button>
                  <button
                    onClick={addFarm}
                    disabled={saving}
                    className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white text-sm font-medium active:scale-95 transition-all"
                  >
                    {saving ? "..." : t.save}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ChatWidget language={lang} />
      <SuccessCheckmark show={showSuccess} message={lang === "ta" ? "சேமிக்கப்பட்டது!" : "Saved!"} />
      <DeleteConfirmDialog isOpen={deleteOpen} onConfirm={handleDeleteConfirm} onCancel={handleDeleteCancel} language={lang} />
    </div>
  );
}
