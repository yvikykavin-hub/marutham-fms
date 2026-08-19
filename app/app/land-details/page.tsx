"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sidebar from "../../components/Sidebar";
import AnimatedCard from "../../components/AnimatedCard";
import EmptyState from "../../components/EmptyState";
import { SkeletonList } from "../../components/Skeleton";
import { supabase } from "../../lib/supabase";
import { useLang } from "../../lib/useLang";

type Farm = {
  id: string;
  name: string | null;
  name_tamil: string | null;
  owner_name: string | null;
  area: number | null;
  total_area: number | null;
  survey_numbers: string | null;
  patta_number: string | null;
  well: boolean | null;
  has_well: boolean | null;
  well_depth: string | null;
  motor: boolean | null;
  has_motor: boolean | null;
  motor_details: string | null;
  motor_hp: string | null;
  soil_type: string | null;
  water_source: string | null;
};

// Farms created via the Dashboard's "Add Farm" form / the legacy /farms/[id] page
// write to total_area/has_well/has_motor, while Land Details reads/writes
// area/well/motor. Fall back to the legacy columns so older farm rows still
// display correctly here without needing a data migration.
const effectiveArea = (f: Farm) => f.area ?? f.total_area;
const effectiveWell = (f: Farm) => f.well ?? f.has_well ?? false;
const effectiveMotor = (f: Farm) => f.motor ?? f.has_motor ?? false;

const SOIL_LABELS: Record<string, { en: string; ta: string }> = {
  red: { en: "Red Soil", ta: "செம்மண்" },
  black: { en: "Black Soil", ta: "கரிசல் மண்" },
  sandy: { en: "Sandy Soil", ta: "மணல் மண்" },
  clay: { en: "Clay Soil", ta: "களி மண்" },
  loamy: { en: "Loamy Soil", ta: "வண்டல் மண்" },
  mixed: { en: "Mixed", ta: "கலவை" },
};

const WATER_SOURCE_LABELS: Record<string, { en: string; ta: string }> = {
  borewell: { en: "Borewell", ta: "துளை கிணறு" },
  open_well: { en: "Open Well", ta: "திறந்த கிணறு" },
  canal: { en: "Canal", ta: "கால்வாய்" },
  rain_fed: { en: "Rain Fed", ta: "மழை நீர்" },
  tank: { en: "Tank", ta: "ஏரி" },
  other: { en: "Other", ta: "மற்றவை" },
};

export default function LandDetailsPage() {
  const router = useRouter();
  const [lang, setLang] = useLang();
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);

  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchFarms();
  }, []);

  const fetchFarms = async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setLoading(true);
    const { data, error } = await supabase
      .from("farms")
      .select("*")
      .order("created_at", { ascending: true });
    if (!error && data) setFarms(data);
    if (error) console.error("Error fetching farms:", error);
    setLoading(false);
    setIsRefreshing(false);
  };

  const filteredLandDetails = useMemo(() => {
    if (!searchQuery.trim()) return farms;
    const q = searchQuery.trim().toLowerCase();
    return farms.filter((farm) =>
      farm.name?.toLowerCase().includes(q) ||
      farm.name_tamil?.toLowerCase().includes(q) ||
      farm.survey_numbers?.toLowerCase().includes(q) ||
      farm.patta_number?.toLowerCase().includes(q) ||
      farm.owner_name?.toLowerCase().includes(q)
    );
  }, [farms, searchQuery]);

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <Sidebar lang={lang} setLang={setLang} />

      <main className="flex-1 overflow-y-auto p-4">
        <div className="max-w-5xl mx-auto flex flex-col gap-4">

          <div className="flex items-center justify-between flex-wrap gap-2">
            <Link href="/" className="text-primary hover:text-primary text-sm font-semibold">
              ← {L("Back to Dashboard", "முகப்புக்கு திரும்பு")}
            </Link>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-primary">🗺️ {L("Land Details", "நில விவரம்")}</h1>
              <button
                onClick={() => fetchFarms(true)}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-sm font-medium transition-all duration-200 border border-green-200"
              >
                <span className={isRefreshing ? "animate-spin" : ""}>🔄</span>
                {isRefreshing ? L("Refreshing...", "புதுப்பிக்கிறது...") : L("Refresh", "புதுப்பி")}
              </button>
            </div>
            <button
              onClick={() => setLang(lang === "ta" ? "en" : "ta")}
              className="px-3 py-1.5 rounded-lg border border-primary/40 text-primary text-sm font-medium hover:bg-green-50 transition"
            >
              {lang === "ta" ? "English" : "தமிழ்"}
            </button>
          </div>

          {!loading && farms.length > 0 && (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={L("Search by name, survey no., patta no., owner...", "பெயர், சர்வே எண், பட்டா எண், உரிமையாளர் மூலம் தேடுங்கள்...")}
                className="w-full border border-gray-300 dark:border-gray-700 rounded-lg pl-9 pr-9 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={L("Clear search", "தேடலை அழி")}
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {loading ? (
            <SkeletonList count={4} />
          ) : farms.length === 0 ? (
            <EmptyState
              type="land"
              title={L("No farms added yet", "நிலங்கள் சேர்க்கப்படவில்லை")}
              subtitle={L("Add a farm from the Dashboard to see its land details here", "இங்கே நில விவரங்களைக் காண முகப்புத் திரையில் இருந்து நிலம் சேர்க்கவும்")}
              action={{ label: L("Go to Dashboard", "முகப்புக்கு செல்"), onClick: () => router.push("/") }}
            />
          ) : filteredLandDetails.length === 0 && searchQuery ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <span className="text-3xl">🔍</span>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {L(`No results for "${searchQuery}"`, `"${searchQuery}" க்கு முடிவுகள் இல்லை`)}
              </p>
              <button
                onClick={() => setSearchQuery("")}
                className="text-xs font-semibold text-primary hover:underline"
              >
                {L("Clear search", "தேடலை அழி")}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredLandDetails.map((f, i) => {
                const soil = f.soil_type ? SOIL_LABELS[f.soil_type] : null;
                const water = f.water_source ? WATER_SOURCE_LABELS[f.water_source] : null;
                const area = effectiveArea(f);
                const well = effectiveWell(f);
                const motor = effectiveMotor(f);
                return (
                  <AnimatedCard key={f.id} delay={Math.min(i, 5) * 0.06}>
                    <Link href={`/land-details/${f.id}`}>
                      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer active:scale-[0.99] flex flex-col gap-1.5 h-full">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-gray-900">🌾 {f.name || "—"}</p>
                          <span className="text-xs font-medium text-gray-700">{area ?? "—"} {L("Acres", "ஏக்கர்")}</span>
                        </div>
                        <p className="text-xs text-gray-600">
                          {L("Survey", "சர்வே")}: {f.survey_numbers || "—"} • {L("Patta", "பட்டா")}: {f.patta_number || "—"}
                        </p>
                        {f.owner_name && (
                          <p className="text-xs text-gray-600">{L("Owner", "உரிமையாளர்")}: {f.owner_name}</p>
                        )}
                        {soil && (
                          <p className="text-xs text-gray-600">{L("Soil", "மண்")}: {L(soil.en, soil.ta)}</p>
                        )}
                        {water && (
                          <p className="text-xs text-gray-600">{L("Water Source", "நீர் ஆதாரம்")}: {L(water.en, water.ta)}</p>
                        )}
                        <p className="text-xs text-gray-700">
                          {well
                            ? `🟢 ${L("Well", "கிணறு")}: ${L("Yes", "உண்டு")}${f.well_depth ? ` (${f.well_depth})` : ""}`
                            : `⭕ ${L("Well", "கிணறு")}: ${L("No", "இல்லை")}`}
                        </p>
                        <p className="text-xs text-gray-700">
                          {motor
                            ? `🟢 ${L("Motor", "மோட்டார்")}: ${L("Yes", "உண்டு")}${f.motor_details ? ` • ${f.motor_details}` : ""}${
                                f.motor_hp ? ` • ${f.motor_hp} HP` : ""
                              }`
                            : `⭕ ${L("Motor", "மோட்டார்")}: ${L("No", "இல்லை")}`}
                        </p>
                        <div className="flex justify-end mt-1">
                          <span className="text-xs font-semibold text-primary">{L("View Details", "விவரம் காண")} →</span>
                        </div>
                      </div>
                    </Link>
                  </AnimatedCard>
                );
              })}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
