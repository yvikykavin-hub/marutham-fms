"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Sidebar from "../../components/Sidebar";
import PullToRefresh from "../../components/PullToRefresh";
import { StaggerContainer, StaggerItem } from "../../components/AnimatedContainer";
import EmptyState from "../../components/EmptyState";
import { supabase } from "../../lib/supabase";
import { useLang } from "../../lib/useLang";

type Cultivation = {
  id: string;
  farm_id: string;
  crop_type: string;
  area: number;
  start_date: string | null;
  end_date: string | null;
};

type Farm = {
  id: string;
  name: string;
};

const CROP_EMOJIS: Record<string, string> = {
  coconut: "🥥",
  sugarcane: "🎋",
  turmeric: "🟡",
  ellu: "🌿",
  kuchi_kilangu: "🥔",
  onion: "🧅",
  fodder_corn: "🌽",
  nell: "🌾",
  groundnut: "🥜",
};

const cropEmoji = (cropType: string) => CROP_EMOJIS[cropType] ?? "🌱";

const CROP_LABELS: Record<string, { en: string; ta: string }> = {
  coconut: { en: "Coconut", ta: "தேங்காய்" },
  sugarcane: { en: "Sugarcane", ta: "கரும்பு" },
  turmeric: { en: "Turmeric", ta: "மஞ்சள்" },
  ellu: { en: "Ellu", ta: "எள்ளு" },
  kuchi_kilangu: { en: "Kuchi Kilangu", ta: "குச்சிக்கிழங்கு" },
  onion: { en: "Onion", ta: "வெங்காயம்" },
  fodder_corn: { en: "Fodder Corn", ta: "மக்காச்சோளம்" },
  nell: { en: "Nell (Rice)", ta: "நெல்" },
  groundnut: { en: "Groundnut", ta: "நிலக்கடலை" },
};

const cropLabel = (cropType: string, lang: "ta" | "en") => {
  const l = CROP_LABELS[cropType];
  return l ? (lang === "ta" ? l.ta : l.en) : cropType;
};

const formatDMY = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

const daysBetween = (start: string, end: string) => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
};

export default function CropsPage() {
  const [lang, setLang] = useLang();
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);

  const [farms, setFarms] = useState<Farm[]>([]);
  const [activeCrops, setActiveCrops] = useState<Cultivation[]>([]);
  const [completedCrops, setCompletedCrops] = useState<Cultivation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);
  const [search, setSearch] = useState("");
  const [farmFilter, setFarmFilter] = useState("");

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setLoading(true);
    const [{ data: farmsData }, { data: activeData }, { data: completedData }] = await Promise.all([
      supabase.from("farms").select("id, name").order("name", { ascending: true }),
      supabase
        .from("cultivations")
        .select("id, farm_id, crop_type, area, start_date, end_date")
        .is("end_date", null)
        .order("start_date", { ascending: false }),
      supabase
        .from("cultivations")
        .select("id, farm_id, crop_type, area, start_date, end_date")
        .not("end_date", "is", null)
        .order("end_date", { ascending: false }),
    ]);
    if (farmsData) setFarms(farmsData);
    if (activeData) setActiveCrops(activeData);
    if (completedData) setCompletedCrops(completedData);
    setLoading(false);
    if (isRefresh) {
      setIsRefreshing(false);
      setJustUpdated(true);
      setTimeout(() => setJustUpdated(false), 1500);
    }
  };

  const farmName = (farmId: string) => farms.find((f) => f.id === farmId)?.name ?? "—";

  const matchesFilters = (c: Cultivation) => {
    const matchesSearch = search.trim()
      ? c.crop_type.toLowerCase().includes(search.trim().toLowerCase()) ||
        farmName(c.farm_id).toLowerCase().includes(search.trim().toLowerCase())
      : true;
    const matchesFarm = farmFilter ? c.farm_id === farmFilter : true;
    return matchesSearch && matchesFarm;
  };

  const filteredActive = useMemo(() => activeCrops.filter(matchesFilters), [activeCrops, search, farmFilter, farms]);
  const filteredCompleted = useMemo(() => completedCrops.filter(matchesFilters), [completedCrops, search, farmFilter, farms]);

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <Sidebar lang={lang} setLang={setLang} />

      <main className="flex-1 overflow-y-auto p-4">
        <PullToRefresh onRefresh={() => fetchAll(true)} language={lang}>
        <div className="max-w-6xl mx-auto flex flex-col gap-4">

          <Link href="/" className="text-primary hover:text-primary text-sm font-semibold">
            ← {L("Back to Dashboard", "முகப்புக்கு திரும்பு")}
          </Link>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-primary">🌾 {L("Crops", "பயிர்கள்")}</h1>
              <button
                onClick={() => fetchAll(true)}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-sm font-medium transition-all duration-200 border border-green-200"
              >
                <span className={isRefreshing ? "animate-spin" : ""}>🔄</span>
                {isRefreshing
                  ? L("Refreshing...", "புதுப்பிக்கிறது...")
                  : justUpdated
                  ? L("Updated!", "புதுப்பிக்கப்பட்டது!")
                  : L("Refresh", "புதுப்பி")}
              </button>
            </div>
            <button
              onClick={() => setLang(lang === "ta" ? "en" : "ta")}
              className="px-3 py-1.5 rounded-lg border border-primary/40 text-primary text-sm font-medium hover:bg-green-50 transition"
            >
              {lang === "ta" ? "English" : "தமிழ்"}
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={L("Search crops...", "பயிர் தேடு...")}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <select
              value={farmFilter}
              onChange={(e) => setFarmFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary sm:w-56"
            >
              <option value="">{L("All Farms", "அனைத்து நிலங்கள்")}</option>
              {farms.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-48 bg-gray-200 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Active Crops */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-800">🌱 {L("Active Crops", "செயலில் பயிர்கள்")}</h2>
                  <span className="text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full border border-green-100">
                    {filteredActive.length} {L("Active", "செயலில்")}
                  </span>
                </div>

                {filteredActive.length === 0 ? (
                  <EmptyState
                    type="crops"
                    title={L("No active crops", "செயலில் பயிர்கள் இல்லை")}
                    subtitle={L("Crops you start growing will show up here", "நீங்கள் பயிரிடும் பயிர்கள் இங்கே தோன்றும்")}
                  />
                ) : (
                  <StaggerContainer className="flex flex-col gap-2">
                    {filteredActive.map((c) => {
                      const day = c.start_date ? daysBetween(c.start_date, new Date().toISOString().slice(0, 10)) : null;
                      return (
                        <StaggerItem key={c.id}>
                          <div className="bg-white rounded-xl shadow-sm p-3 mb-2 border-l-4 border-green-500 hover:shadow-md hover:border-green-300 transition-all">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-gray-900">
                                {cropEmoji(c.crop_type)} {cropLabel(c.crop_type, lang)}
                              </p>
                              {day != null && (
                                <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                                  {L(`Day ${day}`, `நாள் ${day}`)} 🟢
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              📍 {farmName(c.farm_id)} &nbsp;•&nbsp; 📐 {c.area} {L("Acres", "ஏக்கர்")}
                            </p>
                            <p className="text-xs text-gray-500">
                              📅 {L("Started", "தொடக்கம்")}: {formatDMY(c.start_date)}
                            </p>
                          </div>
                        </StaggerItem>
                      );
                    })}
                  </StaggerContainer>
                )}
              </div>

              {/* Completed Crops */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-800">✅ {L("Completed Crops", "முடிந்த பயிர்கள்")}</h2>
                  <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
                    {filteredCompleted.length} {L("Completed", "முடிந்தது")}
                  </span>
                </div>

                {filteredCompleted.length === 0 ? (
                  <p className="text-sm font-semibold text-gray-500 text-center py-8">
                    {L("No completed crops", "முடிந்த பயிர்கள் இல்லை")} ✅
                  </p>
                ) : (
                  <StaggerContainer className="flex flex-col gap-2">
                    {filteredCompleted.map((c) => {
                      const duration = c.start_date && c.end_date ? daysBetween(c.start_date, c.end_date) : null;
                      return (
                        <StaggerItem key={c.id}>
                          <div className="bg-white rounded-xl shadow-sm p-3 mb-2 border-l-4 border-blue-400 hover:shadow-md hover:border-green-300 transition-all">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-gray-900">
                                {cropEmoji(c.crop_type)} {cropLabel(c.crop_type, lang)}
                              </p>
                              <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                                ✅ {L("Done", "முடிந்தது")}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              📍 {farmName(c.farm_id)} &nbsp;•&nbsp; 📐 {c.area} {L("Acres", "ஏக்கர்")}
                            </p>
                            <p className="text-xs text-gray-500">
                              📅 {formatDMY(c.start_date)} → {formatDMY(c.end_date)}
                            </p>
                            {duration != null && (
                              <p className="text-xs text-blue-600">
                                🗓️ {L("Duration", "கால அளவு")}: {duration} {L("days", "நாட்கள்")}
                              </p>
                            )}
                          </div>
                        </StaggerItem>
                      );
                    })}
                  </StaggerContainer>
                )}
              </div>
            </div>
          )}
        </div>
        </PullToRefresh>
      </main>
    </div>
  );
}
