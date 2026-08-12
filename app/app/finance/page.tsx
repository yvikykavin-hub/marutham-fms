"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  BarChart,
  ComposedChart,
  Bar,
  Line,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from "recharts";
import hotToast from "react-hot-toast";
import Sidebar from "../../components/Sidebar";
import AnimatedCard from "../../components/AnimatedCard";
import { FadeIn } from "../../components/AnimatedContainer";
import EmptyState from "../../components/EmptyState";
import { SkeletonCard } from "../../components/Skeleton";
import ExportButton from "../../components/ExportButton";
import PullToRefresh from "../../components/PullToRefresh";
import { supabase } from "../../lib/supabase";
import { useLang } from "../../lib/useLang";

type Cultivation = { id: string; farm_id: string; crop_type: string };
type Farm = { id: string; name: string };
type Row = { cultivation_id: string; year: string; amount: number };

const CROP_LABELS: Record<string, { en: string; ta: string; emoji: string }> = {
  coconut: { en: "Coconut", ta: "தேங்காய்", emoji: "🥥" },
  sugarcane: { en: "Sugarcane", ta: "கரும்பு", emoji: "🎋" },
  turmeric: { en: "Turmeric", ta: "மஞ்சள்", emoji: "🟡" },
  ellu: { en: "Ellu", ta: "எள்ளு", emoji: "🌿" },
  kuchi_kilangu: { en: "Kuchi Kilangu", ta: "குச்சிக்கிழங்கு", emoji: "🥔" },
  onion: { en: "Onion", ta: "வெங்காயம்", emoji: "🧅" },
  fodder_corn: { en: "Fodder Corn", ta: "மக்காச்சோளம்", emoji: "🌽" },
  nell: { en: "Nell (Rice)", ta: "நெல்", emoji: "🌾" },
  groundnut: { en: "Groundnut", ta: "நிலக்கடலை", emoji: "🥜" },
};

const cropEmoji = (cropType: string) => CROP_LABELS[cropType]?.emoji ?? "🌱";
const cropLabel = (cropType: string, lang: "ta" | "en") => {
  const l = CROP_LABELS[cropType];
  return l ? (lang === "ta" ? l.ta : l.en) : cropType;
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const inrAxis = (value: number) =>
  value >= 0 ? `₹${(value / 100000).toFixed(1)}L` : `-₹${(Math.abs(value) / 100000).toFixed(1)}L`;
const yearlyAxisFormatter = (value: number) => {
  const abs = Math.abs(value);
  const formatted = abs >= 100000 ? `₹${(abs / 100000).toFixed(1)}L` : `₹${(abs / 1000).toFixed(0)}K`;
  return value < 0 ? `-${formatted}` : formatted;
};

type TooltipPayloadItem = { dataKey: string; value: number };

const CustomTooltip = ({
  active,
  payload,
  label,
  L,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  L: (en: string, ta: string) => string;
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const income = payload.find((p) => p.dataKey === "income")?.value ?? 0;
  const expense = payload.find((p) => p.dataKey === "expense")?.value ?? 0;
  const net = payload.find((p) => p.dataKey === "net")?.value ?? 0;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-900 mb-2">{label}</p>
      <p className="text-blue-600">💰 {L("Income", "வருமானம்")}: {inr(income)}</p>
      <p className="text-amber-600">📤 {L("Expense", "செலவு")}: {inr(expense)}</p>
      <p className={net >= 0 ? "text-green-600" : "text-red-600"}>
        {net >= 0 ? `📈 ${L("Profit", "இலாபம்")}` : `📉 ${L("Loss", "நஷ்டம்")}`}: {inr(Math.abs(net))}
      </p>
    </div>
  );
};

const toggleIn = (arr: string[], val: string) => (arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);

export default function FinancePage() {
  const [lang, setLang] = useLang();
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cultivations, setCultivations] = useState<Cultivation[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [incomeRows, setIncomeRows] = useState<Row[]>([]);
  const [expenseRows, setExpenseRows] = useState<Row[]>([]);

  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [selectedCrops, setSelectedCrops] = useState<string[]>([]);
  const [selectedFarms, setSelectedFarms] = useState<string[]>([]);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setLoading(true);
    const [
      { data: cultivationsData },
      { data: farmsData },
      { data: incomeData },
      { data: expenseData },
      { data: riceIncomeData },
      { data: groundnutIncomeData },
      { data: groundnutExpenseData },
    ] = await Promise.all([
      supabase.from("cultivations").select("id, farm_id, crop_type"),
      supabase.from("farms").select("id, name").order("name", { ascending: true }),
      supabase.from("income_records").select("cultivation_id, income_date, amount"),
      supabase.from("expense_records").select("cultivation_id, expense_date, amount"),
      supabase.from("rice_income").select("cultivation_id, date, total_amount"),
      supabase.from("groundnut_income").select("cultivation_id, harvest_date, total_amount"),
      supabase.from("groundnut_expenses").select("cultivation_id, expense_date, amount"),
    ]);

    if (cultivationsData) setCultivations(cultivationsData);
    if (farmsData) setFarms(farmsData);

    const income: Row[] = [
      ...(incomeData ?? []).map((r) => ({ cultivation_id: r.cultivation_id, year: String(r.income_date).slice(0, 4), amount: Number(r.amount) })),
      ...(riceIncomeData ?? []).map((r) => ({ cultivation_id: r.cultivation_id, year: String(r.date).slice(0, 4), amount: Number(r.total_amount) })),
      ...(groundnutIncomeData ?? []).map((r) => ({ cultivation_id: r.cultivation_id, year: String(r.harvest_date).slice(0, 4), amount: Number(r.total_amount) })),
    ];
    const expense: Row[] = [
      ...(expenseData ?? []).map((r) => ({
        cultivation_id: r.cultivation_id,
        year: String(r.expense_date).slice(0, 4),
        amount: Number(r.amount),
      })),
      ...(groundnutExpenseData ?? []).map((r) => ({
        cultivation_id: r.cultivation_id,
        year: String(r.expense_date).slice(0, 4),
        amount: Number(r.amount),
      })),
    ];

    setIncomeRows(income);
    setExpenseRows(expense);
    setLoading(false);
    if (isRefresh) {
      setIsRefreshing(false);
      hotToast.success(L("Data updated!", "தரவு புதுப்பிக்கப்பட்டது!"));
    }
  };

  const cultivationMap = useMemo(() => {
    const map = new Map<string, Cultivation>();
    cultivations.forEach((c) => map.set(c.id, c));
    return map;
  }, [cultivations]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    [...incomeRows, ...expenseRows].forEach((r) => {
      if (/^\d{4}$/.test(r.year)) years.add(r.year);
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [incomeRows, expenseRows]);

  const matchesFilters = (r: Row) => {
    const c = cultivationMap.get(r.cultivation_id);
    if (!c) return false;
    if (selectedYears.length > 0 && !selectedYears.includes(r.year)) return false;
    if (selectedCrops.length > 0 && !selectedCrops.includes(c.crop_type)) return false;
    if (selectedFarms.length > 0 && !selectedFarms.includes(c.farm_id)) return false;
    return true;
  };

  const filteredIncome = useMemo(() => incomeRows.filter(matchesFilters), [incomeRows, selectedYears, selectedCrops, selectedFarms, cultivationMap]);
  const filteredExpense = useMemo(() => expenseRows.filter(matchesFilters), [expenseRows, selectedYears, selectedCrops, selectedFarms, cultivationMap]);

  const chartData = useMemo(() => {
    const totals = new Map<string, { income: number; expense: number }>();
    filteredIncome.forEach((r) => {
      const c = cultivationMap.get(r.cultivation_id);
      if (!c) return;
      const entry = totals.get(c.crop_type) ?? { income: 0, expense: 0 };
      entry.income += r.amount;
      totals.set(c.crop_type, entry);
    });
    filteredExpense.forEach((r) => {
      const c = cultivationMap.get(r.cultivation_id);
      if (!c) return;
      const entry = totals.get(c.crop_type) ?? { income: 0, expense: 0 };
      entry.expense += r.amount;
      totals.set(c.crop_type, entry);
    });
    return Array.from(totals.entries())
      .filter(([, v]) => v.income > 0 || v.expense > 0)
      .map(([cropType, v]) => ({
        cropType,
        label: `${cropEmoji(cropType)} ${cropLabel(cropType, lang)}`,
        income: v.income,
        expense: v.expense,
        net: v.income - v.expense,
      }))
      .sort((a, b) => b.net - a.net);
  }, [filteredIncome, filteredExpense, cultivationMap, lang]);

  // Yearly comparison intentionally ignores the year pill-filter (respecting
  // only crop/farm selection) — filtering it down to one year would defeat
  // the purpose of a year-over-year comparison chart.
  const matchesCropFarmFilters = (r: Row) => {
    const c = cultivationMap.get(r.cultivation_id);
    if (!c) return false;
    if (selectedCrops.length > 0 && !selectedCrops.includes(c.crop_type)) return false;
    if (selectedFarms.length > 0 && !selectedFarms.includes(c.farm_id)) return false;
    return true;
  };

  const yearlyData = useMemo(() => {
    const totals = new Map<string, { income: number; expense: number }>();
    incomeRows.filter(matchesCropFarmFilters).forEach((r) => {
      if (!/^\d{4}$/.test(r.year)) return;
      const entry = totals.get(r.year) ?? { income: 0, expense: 0 };
      entry.income += r.amount;
      totals.set(r.year, entry);
    });
    expenseRows.filter(matchesCropFarmFilters).forEach((r) => {
      if (!/^\d{4}$/.test(r.year)) return;
      const entry = totals.get(r.year) ?? { income: 0, expense: 0 };
      entry.expense += r.amount;
      totals.set(r.year, entry);
    });
    return Array.from(totals.entries())
      .map(([year, v]) => ({ year, income: v.income, expense: v.expense, net: v.income - v.expense }))
      .sort((a, b) => a.year.localeCompare(b.year));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomeRows, expenseRows, cultivationMap, selectedCrops, selectedFarms]);

  const totalIncome = chartData.reduce((s, c) => s + c.income, 0);
  const totalExpense = chartData.reduce((s, c) => s + c.expense, 0);
  const totalNet = totalIncome - totalExpense;
  const bestCrop = chartData.length > 0 ? chartData[0] : null;
  const worstCrop = chartData.length > 0 ? chartData[chartData.length - 1] : null;

  const pillCls = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
      active ? "bg-primary text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
    }`;

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <Sidebar lang={lang} setLang={setLang} />

      <main className="flex-1 overflow-y-auto p-4">
        <PullToRefresh onRefresh={() => fetchAll(true)} language={lang}>
        <div className="max-w-6xl mx-auto flex flex-col gap-4">

          <div className="flex items-center justify-between flex-wrap gap-2">
            <Link href="/" className="text-primary hover:text-primary text-sm font-semibold">
              ← {L("Back to Dashboard", "முகப்புக்கு திரும்பு")}
            </Link>
            <h1 className="text-xl font-bold text-primary">💰 {L("Finance", "நிதி நிலை")}</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchAll(true)}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-sm font-medium transition-all duration-200 border border-green-200"
              >
                <span className={isRefreshing ? "animate-spin" : ""}>🔄</span>
                {isRefreshing ? L("Refreshing...", "புதுப்பிக்கிறது...") : L("Refresh", "புதுப்பி")}
              </button>
              <button
                onClick={() => setLang(lang === "ta" ? "en" : "ta")}
                className="px-3 py-1.5 rounded-lg border border-primary/40 text-primary text-sm font-medium hover:bg-green-50 transition"
              >
                {lang === "ta" ? "English" : "தமிழ்"}
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 flex flex-col gap-2">
            <div className="flex justify-end">
              <ExportButton data={chartData} filename="Finance-Report" sheetName="Finance" language={lang} />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">{L("Year", "ஆண்டு")}</p>
              <div className="flex flex-wrap gap-2">
                {availableYears.map((y) => (
                  <button key={y} onClick={() => setSelectedYears(toggleIn(selectedYears, y))} className={pillCls(selectedYears.includes(y))}>
                    {y}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">{L("Crop", "பயிர்")}</p>
              <div className="flex flex-wrap gap-2">
                {Object.keys(CROP_LABELS).map((ct) => (
                  <button key={ct} onClick={() => setSelectedCrops(toggleIn(selectedCrops, ct))} className={pillCls(selectedCrops.includes(ct))}>
                    {cropEmoji(ct)} {cropLabel(ct, lang)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">{L("Farm", "நிலம்")}</p>
              <div className="flex flex-wrap gap-2">
                {farms.map((f) => (
                  <button key={f.id} onClick={() => setSelectedFarms(toggleIn(selectedFarms, f.id))} className={pillCls(selectedFarms.includes(f.id))}>
                    {f.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
              <div className="h-80 rounded-2xl shimmer" />
            </div>
          ) : chartData.length === 0 ? (
            <EmptyState
              type="finance"
              title={L("No data found for selected filters", "தேர்ந்தெடுக்கப்பட்ட வடிகட்டிகளுக்கு தரவு இல்லை")}
              subtitle={L("Try adjusting the year, crop, or farm filters above", "மேலே உள்ள ஆண்டு, பயிர் அல்லது நிலம் வடிகட்டிகளை மாற்றி முயற்சிக்கவும்")}
            />
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 transition-all">
                <AnimatedCard delay={0}>
                <div className="bg-white rounded-2xl shadow-sm p-5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-green-50 rounded-full -mr-8 -mt-8" />
                  <p className="text-xs text-gray-500">{L("Total Income", "மொத்த வருமானம்")}</p>
                  <p className="text-xl font-bold text-green-600">{inr(totalIncome)}</p>
                </div>
                </AnimatedCard>
                <AnimatedCard delay={0.1}>
                <div className="bg-white rounded-2xl shadow-sm p-5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-red-50 rounded-full -mr-8 -mt-8" />
                  <p className="text-xs text-gray-500">{L("Total Expense", "மொத்த செலவு")}</p>
                  <p className="text-xl font-bold text-red-500">{inr(totalExpense)}</p>
                </div>
                </AnimatedCard>
                <AnimatedCard delay={0.2}>
                <div className="bg-white rounded-2xl shadow-sm p-5">
                  <p className="text-xs text-gray-500">{L("Net Profit/Loss", "நிகர லாப/நஷ்டம்")}</p>
                  <p className={`text-base font-bold ${totalNet >= 0 ? "text-emerald-600" : "text-orange-500"}`}>{inr(totalNet)}</p>
                </div>
                </AnimatedCard>
              </div>

              {/* Chart card */}
              <FadeIn className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-md p-6">
                <h2 className="text-sm font-semibold text-gray-800 mb-3">
                  {L("Crop-wise Financial Overview", "பயிர் வாரியான நிதி கண்ணோட்டம்")}
                </h2>

                <div className="flex gap-4 flex-wrap mb-4 justify-center">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0" />
                    <span className="text-sm text-gray-700 font-medium">{L("Income", "வருமானம்")}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-amber-400 flex-shrink-0" />
                    <span className="text-sm text-gray-700 font-medium">{L("Expense", "செலவு")}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />
                    <span className="text-sm text-gray-700 font-medium">{L("Profit", "இலாபம்")}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" />
                    <span className="text-sm text-gray-700 font-medium">{L("Loss", "நஷ்டம்")}</span>
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <div style={{ minWidth: Math.max(600, chartData.length * 140), height: 350 }}>
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                        <YAxis tickFormatter={inrAxis} tick={{ fontSize: 12 }} />
                        <Tooltip content={<CustomTooltip L={L} />} />
                        <ReferenceLine y={0} stroke="#374151" strokeWidth={1.5} />
                        <Bar dataKey="income" name="income" fill="#3B82F6" radius={[4, 4, 0, 0]} isAnimationActive={true} animationBegin={0} animationDuration={600} animationEasing="ease-out" legendType="none" />
                        <Bar dataKey="expense" name="expense" fill="#F59E0B" radius={[4, 4, 0, 0]} isAnimationActive={true} animationBegin={0} animationDuration={600} animationEasing="ease-out" legendType="none" />
                        <Bar dataKey="net" name="net" radius={[4, 4, 0, 0]} isAnimationActive={true} animationBegin={0} animationDuration={600} animationEasing="ease-out" legendType="none">
                          {chartData.map((entry, i) => (
                            <Cell key={i} fill={entry.net >= 0 ? "#22C55E" : "#EF4444"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </FadeIn>

              {/* Best/Worst performing crop cards */}
              {(bestCrop || (worstCrop && worstCrop !== bestCrop)) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 transition-all">
                  {bestCrop && (
                    <AnimatedCard delay={0}>
                    <div className="bg-white rounded-2xl shadow-sm p-5">
                      <p className="text-xs text-gray-500">{L("Best Performing Crop", "சிறந்த செயல்திறன் பயிர்")}</p>
                      <p className="text-sm font-semibold text-emerald-600">{bestCrop.label}</p>
                      <p className="text-xs text-gray-500">{inr(bestCrop.net)}</p>
                    </div>
                    </AnimatedCard>
                  )}
                  {worstCrop && worstCrop !== bestCrop && (
                    <AnimatedCard delay={0.1}>
                    <div className="bg-white rounded-2xl shadow-sm p-5">
                      <p className="text-xs text-gray-500">{L("Worst Performing Crop", "குறைந்த செயல்திறன் பயிர்")}</p>
                      <p className="text-sm font-semibold text-orange-500">{worstCrop.label}</p>
                      <p className="text-xs text-gray-500">{inr(worstCrop.net)}</p>
                    </div>
                    </AnimatedCard>
                  )}
                </div>
              )}

              {/* Yearly Comparison chart */}
              {yearlyData.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm p-5 mt-6">
                  <h3 className="text-base font-semibold text-gray-800 mb-4">
                    📅 {L("Yearly Comparison", "ஆண்டு வாரியான ஒப்பீடு")}
                  </h3>

                  <div className="overflow-x-auto">
                    <ComposedChart width={Math.max(300, yearlyData.length * 120)} height={300} data={yearlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={yearlyAxisFormatter} tick={{ fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip L={L} />} />
                      <Legend />

                      <Bar dataKey="income" name={L("Income", "வருமானம்")} fill="#3B82F6" radius={[4, 4, 0, 0]} isAnimationActive={true} animationBegin={0} animationDuration={800} animationEasing="ease-out" />
                      <Bar dataKey="expense" name={L("Expense", "செலவு")} fill="#F59E0B" radius={[4, 4, 0, 0]} isAnimationActive={true} animationBegin={0} animationDuration={800} animationEasing="ease-out" />
                      <Line
                        dataKey="net"
                        name={L("Net Profit", "நிகர லாபம்")}
                        stroke="#22C55E"
                        strokeWidth={2}
                        dot={{ fill: "#22C55E", r: 4 }}
                        isAnimationActive={true}
                        animationBegin={0}
                        animationDuration={1000}
                        animationEasing="ease-out"
                      />
                    </ComposedChart>
                  </div>

                  {/* Year summary below chart */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                    {yearlyData.map((year) => (
                      <div key={year.year} className="bg-gray-50 rounded-xl p-3 text-center">
                        <p className="text-xs text-gray-500">{year.year}</p>
                        <p className={`text-base font-bold mt-1 ${year.net >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {year.net >= 0 ? "+" : "-"}₹{Math.abs(year.net).toLocaleString("en-IN")}
                        </p>
                        <p className="text-xs text-gray-400">{year.net >= 0 ? L("Profit", "இலாபம்") : L("Loss", "நஷ்டம்")}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        </PullToRefresh>
      </main>
    </div>
  );
}
