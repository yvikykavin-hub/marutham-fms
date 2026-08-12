"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import Sidebar from "../../components/Sidebar";
import AnimatedCard from "../../components/AnimatedCard";
import { SkeletonTable } from "../../components/Skeleton";
import ExportButton from "../../components/ExportButton";
import { supabase } from "../../lib/supabase";
import { useLang } from "../../lib/useLang";

type Cultivation = { id: string; farm_id: string; crop_type: string };
type Farm = { id: string; name: string };
type IncomeRow = { cultivation_id: string; date: string; amount: number };
type ExpenseRow = { cultivation_id: string; date: string; amount: number; category: string };

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

const CATEGORY_LABELS: Record<string, { en: string; ta: string; emoji: string }> = {
  seeds: { en: "Seeds", ta: "விதைகள்", emoji: "🌱" },
  fertilizer: { en: "Fertilizer", ta: "உரம்", emoji: "🧪" },
  labour: { en: "Labour", ta: "கூலி", emoji: "👷" },
  land_preparation: { en: "Land Preparation", ta: "நிலம் தயாரிப்பு", emoji: "🚜" },
  irrigation: { en: "Irrigation", ta: "நீர்ப்பாசனம்", emoji: "💧" },
  transport: { en: "Transport", ta: "போக்குவரத்து", emoji: "🚛" },
  machinery_repair: { en: "Machinery/Repair", ta: "இயந்திரம்/பழுது", emoji: "🔧" },
  diesel: { en: "Diesel", ta: "டீசல்", emoji: "⛽" },
  veterinary: { en: "Veterinary", ta: "கால்நடை மருத்துவம்", emoji: "💉" },
  storage: { en: "Storage", ta: "சேமிப்பு", emoji: "📦" },
  maintenance: { en: "Maintenance", ta: "பராமரிப்பு", emoji: "🛠️" },
  miscellaneous: { en: "Miscellaneous", ta: "இதர செலவு", emoji: "🔧" },
};

const cropEmoji = (cropType: string) => CROP_LABELS[cropType]?.emoji ?? "🌱";
const cropLabel = (cropType: string, lang: "ta" | "en") => {
  const l = CROP_LABELS[cropType];
  return l ? (lang === "ta" ? l.ta : l.en) : cropType;
};
const categoryLabel = (category: string, lang: "ta" | "en") => {
  const l = CATEGORY_LABELS[category];
  return l ? `${l.emoji} ${lang === "ta" ? l.ta : l.en}` : category;
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const formatDMY = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
};
const todayISO = () => new Date().toISOString().slice(0, 10);

const toggleIn = (arr: string[], val: string) => (arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);

const generateReportId = () => {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RPT-${ymd}-${rand}`;
};

type CropFarmRow = {
  cropType: string;
  farmId: string;
  farmName: string;
  income: number;
  expense: number;
  net: number;
  margin: number;
};

type CropTotal = {
  cropType: string;
  income: number;
  expense: number;
  net: number;
  categories: { category: string; amount: number; pct: number }[];
};

type ReportSnapshot = {
  id: string;
  generatedAt: string;
  periodLabel: string;
  farmLabel: string;
  cropLabel: string;
  rows: CropFarmRow[];
  cropTotals: CropTotal[];
  totalIncome: number;
  totalExpense: number;
  totalNet: number;
};

export default function ReportsPage() {
  const [lang, setLang] = useLang();
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cultivations, setCultivations] = useState<Cultivation[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [incomeRows, setIncomeRows] = useState<IncomeRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);

  const [selectedFarms, setSelectedFarms] = useState<string[]>([]);
  const [selectedCrops, setSelectedCrops] = useState<string[]>(Object.keys(CROP_LABELS));
  const [selectedYears, setSelectedYears] = useState<string[]>([String(new Date().getFullYear())]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<ReportSnapshot | null>(null);
  const [expandedCrops, setExpandedCrops] = useState<string[]>([]);
  const reportRef = useRef<HTMLDivElement>(null);

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
      supabase.from("expense_records").select("cultivation_id, expense_date, amount, category"),
      supabase.from("rice_income").select("cultivation_id, date, total_amount"),
      supabase.from("groundnut_income").select("cultivation_id, harvest_date, total_amount"),
      supabase.from("groundnut_expenses").select("cultivation_id, expense_date, amount, expense_type"),
    ]);

    if (cultivationsData) setCultivations(cultivationsData);
    if (farmsData) {
      setFarms(farmsData);
      setSelectedFarms((prev) => (prev.length === 0 ? farmsData.map((f) => f.id) : prev));
    }

    const income: IncomeRow[] = [
      ...(incomeData ?? []).map((r) => ({ cultivation_id: r.cultivation_id, date: String(r.income_date), amount: Number(r.amount) })),
      ...(riceIncomeData ?? []).map((r) => ({ cultivation_id: r.cultivation_id, date: String(r.date), amount: Number(r.total_amount) })),
      ...(groundnutIncomeData ?? []).map((r) => ({ cultivation_id: r.cultivation_id, date: String(r.harvest_date), amount: Number(r.total_amount) })),
    ];
    const expense: ExpenseRow[] = [
      ...(expenseData ?? []).map((r) => ({
        cultivation_id: r.cultivation_id,
        date: String(r.expense_date),
        amount: Number(r.amount),
        category: r.category ?? "miscellaneous",
      })),
      ...(groundnutExpenseData ?? []).map((r) => ({
        cultivation_id: r.cultivation_id,
        date: String(r.expense_date),
        amount: Number(r.amount),
        category: r.expense_type ?? "miscellaneous",
      })),
    ];

    setIncomeRows(income);
    setExpenseRows(expense);
    setLoading(false);
    setIsRefreshing(false);
  };

  const cultivationMap = useMemo(() => {
    const map = new Map<string, Cultivation>();
    cultivations.forEach((c) => map.set(c.id, c));
    return map;
  }, [cultivations]);

  const farmMap = useMemo(() => {
    const map = new Map<string, string>();
    farms.forEach((f) => map.set(f.id, f.name));
    return map;
  }, [farms]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    [...incomeRows, ...expenseRows].forEach((r) => {
      if (/^\d{4}/.test(r.date)) years.add(r.date.slice(0, 4));
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [incomeRows, expenseRows]);

  const matches = (r: { cultivation_id: string; date: string }) => {
    const c = cultivationMap.get(r.cultivation_id);
    if (!c) return false;
    if (selectedFarms.length > 0 && !selectedFarms.includes(c.farm_id)) return false;
    if (selectedCrops.length > 0 && !selectedCrops.includes(c.crop_type)) return false;
    if (dateFrom && dateTo) {
      if (r.date < dateFrom || r.date > dateTo) return false;
    } else if (selectedYears.length > 0) {
      if (!selectedYears.includes(r.date.slice(0, 4))) return false;
    }
    return true;
  };

  const generateReport = () => {
    setGenerating(true);
    setTimeout(() => {
      const filteredIncome = incomeRows.filter(matches);
      const filteredExpense = expenseRows.filter(matches);

      const rowMap = new Map<string, CropFarmRow>();
      filteredIncome.forEach((r) => {
        const c = cultivationMap.get(r.cultivation_id);
        if (!c) return;
        const key = `${c.crop_type}__${c.farm_id}`;
        const row = rowMap.get(key) ?? {
          cropType: c.crop_type,
          farmId: c.farm_id,
          farmName: farmMap.get(c.farm_id) ?? "—",
          income: 0,
          expense: 0,
          net: 0,
          margin: 0,
        };
        row.income += r.amount;
        rowMap.set(key, row);
      });
      filteredExpense.forEach((r) => {
        const c = cultivationMap.get(r.cultivation_id);
        if (!c) return;
        const key = `${c.crop_type}__${c.farm_id}`;
        const row = rowMap.get(key) ?? {
          cropType: c.crop_type,
          farmId: c.farm_id,
          farmName: farmMap.get(c.farm_id) ?? "—",
          income: 0,
          expense: 0,
          net: 0,
          margin: 0,
        };
        row.expense += r.amount;
        rowMap.set(key, row);
      });

      const rows = Array.from(rowMap.values())
        .filter((r) => r.income > 0 || r.expense > 0)
        .map((r) => ({
          ...r,
          net: r.income - r.expense,
          margin: r.income > 0 ? ((r.income - r.expense) / r.income) * 100 : 0,
        }))
        .sort((a, b) => b.net - a.net);

      // Crop-level totals (across farms) for expense breakdown + insights
      const cropMap = new Map<string, { income: number; expense: number; categories: Map<string, number> }>();
      filteredIncome.forEach((r) => {
        const c = cultivationMap.get(r.cultivation_id);
        if (!c) return;
        const entry = cropMap.get(c.crop_type) ?? { income: 0, expense: 0, categories: new Map() };
        entry.income += r.amount;
        cropMap.set(c.crop_type, entry);
      });
      filteredExpense.forEach((r) => {
        const c = cultivationMap.get(r.cultivation_id);
        if (!c) return;
        const entry = cropMap.get(c.crop_type) ?? { income: 0, expense: 0, categories: new Map() };
        entry.expense += r.amount;
        entry.categories.set(r.category, (entry.categories.get(r.category) ?? 0) + r.amount);
        cropMap.set(c.crop_type, entry);
      });

      const cropTotals: CropTotal[] = Array.from(cropMap.entries())
        .filter(([, v]) => v.income > 0 || v.expense > 0)
        .map(([cropType, v]) => ({
          cropType,
          income: v.income,
          expense: v.expense,
          net: v.income - v.expense,
          categories: Array.from(v.categories.entries())
            .map(([category, amount]) => ({ category, amount, pct: v.expense > 0 ? (amount / v.expense) * 100 : 0 }))
            .sort((a, b) => b.amount - a.amount),
        }))
        .sort((a, b) => b.net - a.net);

      const totalIncome = rows.reduce((s, r) => s + r.income, 0);
      const totalExpense = rows.reduce((s, r) => s + r.expense, 0);
      const totalNet = totalIncome - totalExpense;

      const periodLabel =
        dateFrom && dateTo
          ? `${formatDMY(dateFrom)} — ${formatDMY(dateTo)}`
          : selectedYears.length > 0
          ? selectedYears.slice().sort().join(", ")
          : L("All Time", "அனைத்து காலம்");

      const farmLabel =
        selectedFarms.length === 0 || selectedFarms.length === farms.length
          ? L("All", "அனைத்தும்")
          : selectedFarms.map((id) => farmMap.get(id) ?? "—").join(", ");

      const cropLabelText =
        selectedCrops.length === 0 || selectedCrops.length === Object.keys(CROP_LABELS).length
          ? L("All", "அனைத்தும்")
          : selectedCrops.map((c) => cropLabel(c, lang)).join(", ");

      setReport({
        id: generateReportId(),
        generatedAt: todayISO(),
        periodLabel,
        farmLabel,
        cropLabel: cropLabelText,
        rows,
        cropTotals,
        totalIncome,
        totalExpense,
        totalNet,
      });
      setExpandedCrops([]);
      setGenerating(false);
    }, 300);
  };

  const bestCrop = report && report.cropTotals.length > 0 ? report.cropTotals[0] : null;
  const worstCrop = report && report.cropTotals.length > 0 ? report.cropTotals[report.cropTotals.length - 1] : null;
  const highestIncomeCrop = report ? [...report.cropTotals].sort((a, b) => b.income - a.income)[0] : null;
  const highestExpenseCrop = report ? [...report.cropTotals].sort((a, b) => b.expense - a.expense)[0] : null;
  const overallMargin = report && report.totalIncome > 0 ? (report.totalNet / report.totalIncome) * 100 : 0;

  // Built with plain jsPDF text/shape drawing (no html2canvas) — Tailwind v4's
  // oklch() colors aren't parseable by html2canvas, so we avoid rasterizing the
  // DOM entirely and draw the PDF directly instead.
  const downloadPDF = async () => {
    if (!report) return;
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    let y = 20;

    pdf.setFontSize(18);
    pdf.setTextColor(45, 106, 79);
    pdf.text("Marutham Farm Management System", pageWidth / 2, y, { align: "center" });
    y += 8;

    pdf.setFontSize(10);
    pdf.setTextColor(100, 100, 100);
    pdf.text("Rooted in Tradition, Driven by Data", pageWidth / 2, y, { align: "center" });
    y += 10;

    pdf.setFontSize(14);
    pdf.setTextColor(0, 0, 0);
    pdf.text("Crop Profit & Loss Report", pageWidth / 2, y, { align: "center" });
    y += 8;

    pdf.setFontSize(9);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`Generated: ${new Date(report.generatedAt).toLocaleDateString("en-IN")}`, pageWidth / 2, y, { align: "center" });
    y += 6;
    pdf.text(`Report ID: ${report.id}`, pageWidth / 2, y, { align: "center" });
    y += 6;
    pdf.text(`Period: ${report.periodLabel}  |  Farm: ${report.farmLabel}  |  Crops: ${report.cropLabel}`, pageWidth / 2, y, { align: "center" });
    y += 15;

    pdf.setFontSize(11);
    pdf.setTextColor(0, 0, 0);
    pdf.text(`Total Income: Rs. ${Math.round(report.totalIncome).toLocaleString("en-IN")}`, 14, y);
    y += 7;
    pdf.text(`Total Expense: Rs. ${Math.round(report.totalExpense).toLocaleString("en-IN")}`, 14, y);
    y += 7;
    pdf.text(`Net Profit/Loss: Rs. ${Math.round(report.totalNet).toLocaleString("en-IN")}`, 14, y);
    y += 15;

    const drawTableHeader = () => {
      pdf.setFillColor(45, 106, 79);
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(9);
      pdf.rect(14, y, pageWidth - 28, 8, "F");
      pdf.text("Crop", 16, y + 5.5);
      pdf.text("Farm", 55, y + 5.5);
      pdf.text("Income (Rs.)", 90, y + 5.5);
      pdf.text("Expense (Rs.)", 125, y + 5.5);
      pdf.text("Net P/L (Rs.)", 160, y + 5.5);
      y += 10;
    };
    drawTableHeader();

    report.rows.forEach((row, index) => {
      if (y > 270) {
        pdf.addPage();
        y = 20;
        drawTableHeader();
      }
      const shade = index % 2 === 0 ? 248 : 255;
      pdf.setFillColor(shade, shade + 1, shade + 2);
      pdf.rect(14, y, pageWidth - 28, 7, "F");
      pdf.setFontSize(8);
      pdf.setTextColor(0, 0, 0);
      pdf.text(cropLabel(row.cropType, "en"), 16, y + 5);
      pdf.text(row.farmName, 55, y + 5);
      pdf.text(Math.round(row.income).toLocaleString("en-IN"), 90, y + 5);
      pdf.text(Math.round(row.expense).toLocaleString("en-IN"), 125, y + 5);

      if (row.net >= 0) pdf.setTextColor(22, 163, 74);
      else pdf.setTextColor(220, 38, 38);
      pdf.text(Math.round(row.net).toLocaleString("en-IN"), 160, y + 5);
      pdf.setTextColor(0, 0, 0);
      y += 7;
    });

    if (y > 270) {
      pdf.addPage();
      y = 20;
    }
    y += 3;
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(0, 0, 0);
    pdf.text("TOTAL", 16, y + 5);
    pdf.text(Math.round(report.totalIncome).toLocaleString("en-IN"), 90, y + 5);
    pdf.text(Math.round(report.totalExpense).toLocaleString("en-IN"), 125, y + 5);
    pdf.setTextColor(report.totalNet >= 0 ? 22 : 220, report.totalNet >= 0 ? 163 : 38, report.totalNet >= 0 ? 74 : 38);
    pdf.text(Math.round(report.totalNet).toLocaleString("en-IN"), 160, y + 5);
    pdf.setFont("helvetica", "normal");

    pdf.save(`MaruthamFMS-${report.id}.pdf`);
  };

  const pillCls = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
      active ? "bg-primary text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
    }`;

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <Sidebar lang={lang} setLang={setLang} />

      <main className="flex-1 overflow-y-auto p-4">
        <div className="max-w-6xl mx-auto flex flex-col gap-4">

          <div className="flex items-center justify-between flex-wrap gap-2">
            <Link href="/" className="text-primary hover:text-primary text-sm font-semibold">
              ← {L("Back to Dashboard", "முகப்புக்கு திரும்பு")}
            </Link>
            <h1 className="text-xl font-bold text-primary">📊 {L("Reports", "அறிக்கைகள்")}</h1>
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

          {/* Report type card */}
          <div className="bg-white rounded-2xl shadow-sm border-2 border-primary p-4">
            <p className="text-sm font-semibold text-gray-900">📈 {L("Crop Profit & Loss Report", "பயிர் இலாப நஷ்ட அறிக்கை")}</p>
            <span className="inline-block mt-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
              ✅ {L("Selected", "தேர்ந்தெடுக்கப்பட்டது")}
            </span>
          </div>

          {loading ? (
            <SkeletonTable rows={5} />
          ) : (
            <>
              {/* Filters */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 flex flex-col gap-2">
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
                  <p className="text-xs text-gray-500 mb-1">{L("Date Range (optional, overrides Year)", "தேதி வரம்பு (விருப்பம்)")}</p>
                  <div className="flex gap-2 flex-wrap">
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500" />
                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500" />
                  </div>
                </div>
                <button
                  onClick={generateReport}
                  disabled={generating}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-xl py-3 text-sm font-medium transition shadow-sm mt-1"
                >
                  {generating ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin">🔄</span> {L("Generating report...", "அறிக்கை தயாரிக்கிறது...")}
                    </span>
                  ) : (
                    `📊 ${L("Generate Report", "அறிக்கை தயாரி")}`
                  )}
                </button>
              </div>

              {report && (
                <>
                  {/* Action buttons */}
                  <div className="flex gap-3 flex-wrap">
                    <button className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium">
                      👁️ {L("View Report", "அறிக்கையை காண")}
                    </button>
                    <button onClick={downloadPDF} className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                      ⬇️ {L("Download PDF", "PDF பதிவிறக்கு")}
                    </button>
                    <ExportButton data={report.rows} filename="Marutham-Report" sheetName="Report" language={lang} />
                  </div>

                  <div id="report-content" ref={reportRef} className="bg-white rounded-2xl shadow-sm p-6 flex flex-col gap-4 overflow-x-auto">

                    <div className="flex justify-end">
                      <span className="text-xs text-gray-500">{L("Report ID", "அறிக்கை எண்")}: {report.id}</span>
                    </div>

                    {/* Report header */}
                    <div className="text-center border-b border-gray-200 pb-4">
                      <p className="text-lg font-bold text-primary">👨‍🌾 {L("Marutham Farm Management System", "மருதம் பண்ணை மேலாண்மை அமைப்பு")}</p>
                      <p className="text-xs text-gray-500">{L("Rooted in Tradition, Driven by Data", "உழைப்பே உயர்வு")}</p>
                      <p className="text-base font-semibold text-gray-900 mt-3">{L("Crop Profit & Loss Report", "பயிர் இலாப நஷ்ட அறிக்கை")}</p>
                      <div className="text-xs text-gray-600 mt-3 flex flex-col gap-0.5">
                        <p>{L("Generated", "தயாரிக்கப்பட்டது")}: {formatDMY(report.generatedAt)} &nbsp; {L("ID", "எண்")}: {report.id}</p>
                        <p>{L("Period", "காலம்")}: {report.periodLabel}</p>
                        <p>{L("Farm", "நிலம்")}: {report.farmLabel} | {L("Crops", "பயிர்கள்")}: {report.cropLabel}</p>
                      </div>
                    </div>

                    {/* Summary cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <AnimatedCard delay={0}>
                      <div className="bg-green-50 rounded-xl p-3">
                        <p className="text-xs text-gray-600">{L("Total Income", "மொத்த வருமானம்")}</p>
                        <p className="text-base font-bold text-green-600">{inr(report.totalIncome)}</p>
                      </div>
                      </AnimatedCard>
                      <AnimatedCard delay={0.1}>
                      <div className="bg-red-50 rounded-xl p-3">
                        <p className="text-xs text-gray-600">{L("Total Expense", "மொத்த செலவு")}</p>
                        <p className="text-base font-bold text-red-600">{inr(report.totalExpense)}</p>
                      </div>
                      </AnimatedCard>
                      <AnimatedCard delay={0.2}>
                      <div className={`rounded-xl p-3 ${report.totalNet >= 0 ? "bg-green-50" : "bg-red-50"}`}>
                        <p className="text-xs text-gray-600">{L("Net Profit/Loss", "நிகர லாப/நஷ்டம்")}</p>
                        <p className={`text-base font-bold ${report.totalNet >= 0 ? "text-green-700" : "text-red-600"}`}>{inr(report.totalNet)}</p>
                      </div>
                      </AnimatedCard>
                      <AnimatedCard delay={0.3}>
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs text-gray-600">{L("Best Performing Crop", "சிறந்த பயிர்")}</p>
                        {bestCrop ? (
                          <p className="text-base font-bold text-gray-900">{cropEmoji(bestCrop.cropType)} {cropLabel(bestCrop.cropType, lang)}<br /><span className="text-green-700">{inr(bestCrop.net)}</span></p>
                        ) : (
                          <p className="text-sm text-gray-500">—</p>
                        )}
                      </div>
                      </AnimatedCard>
                    </div>

                    {/* Crop-wise breakdown table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-gray-50 text-left text-gray-500 uppercase text-xs font-medium border-b">
                            <th className="py-2 px-2">{L("Crop", "பயிர்")}</th>
                            <th className="py-2 px-2">{L("Farm", "நிலம்")}</th>
                            <th className="py-2 px-2">{L("Income (₹)", "வருமானம் (₹)")}</th>
                            <th className="py-2 px-2">{L("Expense (₹)", "செலவு (₹)")}</th>
                            <th className="py-2 px-2">{L("Net P/L (₹)", "நிகர லா/ந (₹)")}</th>
                            <th className="py-2 px-2">{L("Margin %", "வரம்பு %")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.rows.length === 0 ? (
                            <tr><td colSpan={6} className="text-center py-6 text-gray-500">📊 {L("No data found for selected filters", "தரவு இல்லை")}</td></tr>
                          ) : (
                            report.rows.map((r, i) => (
                              <tr key={`${r.cropType}-${r.farmId}`} className={`border-b border-gray-100 ${i % 2 === 1 ? "bg-gray-50" : ""}`}>
                                <td className="py-1.5 px-2 text-gray-900">{cropEmoji(r.cropType)} {cropLabel(r.cropType, lang)}</td>
                                <td className="py-1.5 px-2 text-gray-700">{r.farmName}</td>
                                <td className="py-1.5 px-2 text-green-600">{inr(r.income)}</td>
                                <td className="py-1.5 px-2 text-red-600">{inr(r.expense)}</td>
                                <td className={`py-1.5 px-2 font-medium ${r.net >= 0 ? "text-green-700" : "text-red-600"}`}>
                                  {inr(r.net)} {r.net >= 0 ? "✅ " + L("Profit", "லாபம்") : "❌ " + L("Loss", "நஷ்டம்")}
                                </td>
                                <td className={`py-1.5 px-2 font-medium ${r.margin >= 0 ? "text-green-700" : "text-red-600"}`}>{r.margin.toFixed(0)}%</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        {report.rows.length > 0 && (
                          <tfoot>
                            <tr className="bg-gray-100 font-bold text-gray-900">
                              <td className="py-2 px-2">{L("TOTAL", "மொத்தம்")}</td>
                              <td className="py-2 px-2">—</td>
                              <td className="py-2 px-2 text-green-700">{inr(report.totalIncome)}</td>
                              <td className="py-2 px-2 text-red-600">{inr(report.totalExpense)}</td>
                              <td className={`py-2 px-2 ${report.totalNet >= 0 ? "text-green-700" : "text-red-600"}`}>{inr(report.totalNet)}</td>
                              <td className={`py-2 px-2 ${overallMargin >= 0 ? "text-green-700" : "text-red-600"}`}>{overallMargin.toFixed(0)}%</td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>

                    {/* Expense breakdown per crop */}
                    {report.cropTotals.filter((c) => c.categories.length > 0).length > 0 && (
                      <div className="flex flex-col gap-2">
                        <h3 className="text-base font-semibold text-gray-800">{L("Expense Breakdown by Crop", "பயிர் வாரியான செலவு பகுப்பு")}</h3>
                        {report.cropTotals.filter((c) => c.categories.length > 0).map((c) => {
                          const isOpen = expandedCrops.includes(c.cropType);
                          return (
                            <div key={c.cropType} className="border border-gray-100 rounded-lg overflow-hidden">
                              <button
                                onClick={() => setExpandedCrops(toggleIn(expandedCrops, c.cropType))}
                                className="w-full flex items-center justify-between bg-gray-50 px-3 py-2 text-left"
                              >
                                <span className="text-xs font-semibold text-gray-800">
                                  {cropEmoji(c.cropType)} {cropLabel(c.cropType, lang)} — {L("Expense Breakdown", "செலவு பகுப்பு")}
                                </span>
                                <span className="text-gray-400 text-xs">{isOpen ? "▲" : "▼"}</span>
                              </button>
                              {isOpen && (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-left text-gray-500 uppercase text-xs font-medium border-b">
                                      <th className="py-1.5 px-2">{L("Category", "வகை")}</th>
                                      <th className="py-1.5 px-2">{L("Amount", "தொகை")}</th>
                                      <th className="py-1.5 px-2">%</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {c.categories.map((cat) => (
                                      <tr key={cat.category} className="border-b border-gray-50">
                                        <td className="py-1.5 px-2 text-gray-900">{categoryLabel(cat.category, lang)}</td>
                                        <td className="py-1.5 px-2 text-red-600">{inr(cat.amount)}</td>
                                        <td className="py-1.5 px-2 text-gray-700">{cat.pct.toFixed(0)}%</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="bg-gray-100 font-bold text-gray-900">
                                      <td className="py-1.5 px-2">{L("TOTAL", "மொத்தம்")}</td>
                                      <td className="py-1.5 px-2 text-red-600">{inr(c.expense)}</td>
                                      <td className="py-1.5 px-2">100%</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Key insights */}
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <h3 className="text-base font-semibold text-gray-800 mb-2">💡 {L("Key Insights", "முக்கிய தகவல்கள்")}</h3>
                      <div className="flex flex-col gap-1 text-xs text-gray-700">
                        {bestCrop && (
                          <p>✅ {L("Most Profitable", "அதிக லாபம்")}: {cropLabel(bestCrop.cropType, lang)} ({inr(bestCrop.net)})</p>
                        )}
                        {worstCrop && worstCrop !== bestCrop && (
                          <p>❌ {L("Least Profitable", "குறைந்த லாபம்")}: {cropLabel(worstCrop.cropType, lang)} ({inr(worstCrop.net)})</p>
                        )}
                        <p>📈 {L("Overall Profit Margin", "மொத்த லாப வரம்பு")}: {overallMargin.toFixed(0)}%</p>
                        {highestIncomeCrop && (
                          <p>💰 {L("Highest Income Crop", "அதிக வருமான பயிர்")}: {cropLabel(highestIncomeCrop.cropType, lang)}</p>
                        )}
                        {highestExpenseCrop && (
                          <p>💸 {L("Highest Expense Crop", "அதிக செலவு பயிர்")}: {cropLabel(highestExpenseCrop.cropType, lang)}</p>
                        )}
                      </div>
                    </div>

                  </div>
                </>
              )}
            </>
          )}

        </div>
      </main>
    </div>
  );
}
