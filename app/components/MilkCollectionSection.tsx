"use client";

import toast from "react-hot-toast";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { extractMilkCardData, type MilkCardRow } from "../lib/geminiOCR";
import { t } from "../lib/labels";
import { milkRateWarning } from "../lib/validators";
import { isFutureDate, getValidationMessage } from "../lib/validation";
import { ActivityLog } from "../lib/activityLog";
import EmptyState from "./EmptyState";
import { SuccessCheckmark } from "./SuccessAnimation";
import DeleteConfirmDialog from "./DeleteConfirmDialog";
import { useDeleteConfirm } from "../hooks/useDeleteConfirm";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

const OCR_BATCH_SIZE = 10;
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1).padStart(2, "0"),
  label: new Date(2000, i, 1).toLocaleString("en", { month: "short" }),
}));

// Mobile camera photos are commonly 3-5MB; sending that as base64 JSON risks
// timing out the Gemini call and can exceed serverless request body limits.
// Downscale to a max width and re-encode as JPEG before it ever reaches the OCR API.
const compressImage = (file: File, maxWidth = 1024): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = URL.createObjectURL(file);
  });
};

type MilkRate = { id: string; rate_per_litre: number; effective_from: string; notes: string | null };
type MilkCollection = {
  id: string;
  collection_date: string;
  morning_litres: number;
  evening_litres: number;
  daily_income: number | null;
  animal_type: string | null;
  created_at: string;
  updated_at: string;
};

type Week = { weekNum: number; start: string; end: string; litres: number; income: number; isPaymentWeek: boolean };

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const formatDMY = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

// OCR frequently misreads the month/year printed on a milk card (or the card only
// prints day numbers at all). The day number is far more reliable than the month/year
// it guessed, so we only trust the day and always combine it with the month the user
// explicitly selected before uploading.
const dayNumberFromRow = (raw: string): number | null => {
  const trimmed = String(raw).trim();
  let day: number;
  if (trimmed.includes("/") || trimmed.includes(".")) {
    day = parseInt(trimmed.split(/[\/.]/)[0], 10);
  } else if (trimmed.includes("-")) {
    const parts = trimmed.split("-");
    day = parseInt(parts[parts.length - 1], 10);
  } else {
    day = parseInt(trimmed, 10);
  }
  if (Number.isNaN(day) || day < 1 || day > 31) return null;
  return day;
};

const buildDateForSelectedMonth = (dayNumber: number, monthYear: string): string | null => {
  const [yearStr, monthStr] = monthYear.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (!year || !month) return null;
  const daysInMonth = new Date(year, month, 0).getDate();
  if (dayNumber > daysInMonth) return null;
  return `${yearStr}-${monthStr.padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
};

const currentMonthYear = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const inputCls =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary";
const labelCls = "block mb-1 text-xs font-medium text-gray-700";

function CollapsibleSection({
  label,
  icon,
  isOpen,
  onToggle,
  badge,
  children,
}: {
  label: string;
  icon: string;
  isOpen: boolean;
  onToggle: () => void;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden w-full">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors min-h-[44px]"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span>{icon}</span>
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</span>
          {badge && <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">{badge}</span>}
        </div>
        <span className="text-gray-400 text-xs">{isOpen ? "▲" : "▼"}</span>
      </button>
      {isOpen && <div className="px-4 pb-4 border-t border-gray-100 dark:border-slate-700">{children}</div>}
    </div>
  );
}

export default function MilkCollectionSection({
  animalType,
  lang,
  onChanged,
}: {
  animalType: "cow" | "buffalo";
  lang: "ta" | "en";
  onChanged?: () => void;
}) {
  const router = useRouter();
  const rateTable = animalType === "buffalo" ? "buffalo_milk_rates" : "milk_rates";
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);

  const [rates, setRates] = useState<MilkRate[]>([]);
  const [collections, setCollections] = useState<MilkCollection[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const { isOpen: deleteOpen, confirmDelete, handleConfirm: handleDeleteConfirm, handleCancel: handleDeleteCancel } = useDeleteConfirm();

  useEffect(() => {
    fetchRates();
    fetchCollections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animalType]);

  // All sections default to collapsed and reset whenever the cow/buffalo tab changes,
  // so switching tabs never leaves a stale expanded section from the other animal.
  const [showMilkRate, setShowMilkRate] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryPeriod, setSummaryPeriod] = useState<"monthly" | "weekly" | "yearly">("monthly");
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    // Deferred via microtask rather than called synchronously in the effect body —
    // avoids the cascading-render lint warning while still resetting before paint.
    Promise.resolve().then(() => {
      setShowMilkRate(false);
      setShowSummary(false);
      setSummaryPeriod("monthly");
      setShowHistory(false);
    });
  }, [animalType]);

  const fetchRates = async () => {
    const { data } = await supabase.from(rateTable).select("*").order("effective_from", { ascending: false });
    if (data) setRates(data);
  };

  const fetchCollections = async () => {
    const query = supabase.from("milk_collections").select("*").order("collection_date", { ascending: false });
    const { data } =
      animalType === "cow"
        ? await query.or("animal_type.eq.cow,animal_type.is.null")
        : await query.eq("animal_type", "buffalo");
    if (data) setCollections(data);
  };

  const currentRate = rates.length ? Number(rates[0].rate_per_litre) : 0;
  // ratesList is sorted effective_from desc (both the cached `rates` state and the
  // fresh fetch below use that order), so ratesList[0] is always the most recent rate.
  const rateForDate = (date: string, ratesList: MilkRate[] = rates): number => {
    const applicable = ratesList.filter((r) => r.effective_from <= date).sort((a, b) => b.effective_from.localeCompare(a.effective_from));
    if (applicable.length) return Number(applicable[0].rate_per_litre);
    // No rate was in effect yet on this date — e.g. the rate was only added today
    // ("effective from today onward") but the card includes earlier days in the
    // same month, printed in descending order so the first row processed is the
    // most recent day and every day after it predates the rate. Fall back to the
    // most recent known rate rather than silently charging ₹0.
    return ratesList.length ? Number(ratesList[0].rate_per_litre) : 0;
  };

  // Bypasses the cached `rates` state entirely — used right before saving so a
  // rate added moments ago (or a stale/racy fetch) can never cause a save to use
  // an empty or out-of-date rate list.
  const fetchRatesFresh = async (): Promise<MilkRate[]> => {
    const { data, error } = await supabase.from(rateTable).select("*").order("effective_from", { ascending: false });
    if (error) {
      console.error(`Rate fetch error for ${animalType}:`, error);
      return rates;
    }
    return data ?? [];
  };

  // Shared between the OCR upload (dates are always built from this + the extracted
  // day number) and the monthly summary view below.
  const [selectedMonthYear, setSelectedMonthYear] = useState(currentMonthYear());

  // ---------------- Rate: add + edit ----------------
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [newRate, setNewRate] = useState("");
  const [newRateDate, setNewRateDate] = useState("");
  const [newRateNotes, setNewRateNotes] = useState("");
  const [savingRate, setSavingRate] = useState(false);

  const saveRate = async () => {
    if (!newRate || !newRateDate) {
      toast.error(t(lang, "rateDateRequired"));
      return;
    }
    const newRateVal = parseFloat(newRate);
    if (!newRateVal || newRateVal <= 0) {
      toast.error(getValidationMessage("zero_rate", lang));
      return;
    }
    if (newRateVal < 1) {
      toast.error(getValidationMessage("min_rate", lang));
      return;
    }
    if (isFutureDate(newRateDate)) {
      toast.error(getValidationMessage("future_date", lang));
      return;
    }
    setSavingRate(true);
    try {
      const { error } = await supabase.from(rateTable).insert({
        rate_per_litre: parseFloat(newRate),
        effective_from: newRateDate || null,
        notes: newRateNotes.trim() || null,
      });
      if (error) {
        console.error("Error saving rate: ", error);
        toast.error(t(lang, "saveFailedMessage"));
      } else {
        await ActivityLog.added("Milk Rate", `${animalType === "buffalo" ? "Buffalo" : "Cow"} rate: ₹${newRate}/L`);
        setRateModalOpen(false);
        setNewRate("");
        setNewRateDate("");
        setNewRateNotes("");
        fetchRates();
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error(t(lang, "saveFailedMessage"));
    }
    setSavingRate(false);
  };

  const [editingRate, setEditingRate] = useState<MilkRate | null>(null);
  const [editRateValue, setEditRateValue] = useState("");
  const [editRateDate, setEditRateDate] = useState("");
  const [savingRateEdit, setSavingRateEdit] = useState(false);
  const [affectedCount, setAffectedCount] = useState<number | null>(null);

  const openEditRate = (r: MilkRate) => {
    setEditingRate(r);
    setEditRateValue(String(r.rate_per_litre));
    setEditRateDate(r.effective_from);
  };

  // The rows attributed to a given rate are every collection between its
  // effective_from and the effective_from of the next rate above it (or open-ended
  // if it's the most recent rate) — mirrors how rateForDate() picks a rate for a date.
  const affectedDateRange = (fromDate: string) => {
    const nextEffectiveFrom = rates
      .filter((r) => r.id !== editingRate?.id && r.effective_from > fromDate)
      .map((r) => r.effective_from)
      .sort()[0];
    return { from: fromDate, to: nextEffectiveFrom ?? null };
  };

  // Resolves to null (no preview to show) rather than setting state directly, so the
  // effect below only ever calls setState from inside a .then() — never synchronously.
  const calculateAffected = async (): Promise<number | null> => {
    if (!editingRate || !editRateDate) return null;
    const { from, to } = affectedDateRange(editRateDate);
    let query = supabase.from("milk_collections").select("id", { count: "exact", head: true }).gte("collection_date", from);
    query = animalType === "cow" ? query.or("animal_type.eq.cow,animal_type.is.null") : query.eq("animal_type", "buffalo");
    if (to) query = query.lt("collection_date", to);
    const { count } = await query;
    return count ?? 0;
  };

  useEffect(() => {
    let cancelled = false;
    calculateAffected().then((count) => {
      if (!cancelled) setAffectedCount(count);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingRate, editRateDate]);

  const saveEditRate = async () => {
    if (!editingRate || !editRateValue || !editRateDate) return;
    const editRateVal = parseFloat(editRateValue);
    if (!editRateVal || editRateVal <= 0) {
      toast.error(getValidationMessage("zero_rate", lang));
      return;
    }
    if (editRateVal < 1) {
      toast.error(getValidationMessage("min_rate", lang));
      return;
    }
    if (isFutureDate(editRateDate)) {
      toast.error(getValidationMessage("future_date", lang));
      return;
    }
    setSavingRateEdit(true);
    try {
      const { error } = await supabase
        .from(rateTable)
        .update({ rate_per_litre: parseFloat(editRateValue), effective_from: editRateDate })
        .eq("id", editingRate.id);
      if (error) {
        console.error("Error updating rate: ", error);
        toast.error(t(lang, "saveFailedMessage"));
      } else {
        // Only rate_per_litre is sent — total_litres/daily_income are DB-generated
        // columns and recompute automatically once the new rate is applied.
        if (affectedCount && affectedCount > 0) {
          const { from, to } = affectedDateRange(editRateDate);
          let recalcQuery = supabase
            .from("milk_collections")
            .update({ rate_per_litre: parseFloat(editRateValue) })
            .gte("collection_date", from);
          recalcQuery =
            animalType === "cow" ? recalcQuery.or("animal_type.eq.cow,animal_type.is.null") : recalcQuery.eq("animal_type", "buffalo");
          if (to) recalcQuery = recalcQuery.lt("collection_date", to);
          const { error: recalcError } = await recalcQuery;
          if (recalcError) {
            console.error("Error recalculating collections: ", recalcError);
            toast.error(t(lang, "saveFailedMessage"));
          }
        }
        await ActivityLog.updated("Milk Rate", `${animalType === "buffalo" ? "Buffalo" : "Cow"} rate updated to ₹${editRateValue}/L`);
        setEditingRate(null);
        setAffectedCount(null);
        fetchRates();
        fetchCollections();
        onChanged?.();
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error(t(lang, "saveFailedMessage"));
    }
    setSavingRateEdit(false);
  };

  // ---------------- Manual entry ----------------
  const [manualDate, setManualDate] = useState("");
  const [manualMorning, setManualMorning] = useState("");
  const [manualEvening, setManualEvening] = useState("");
  const [savingManual, setSavingManual] = useState(false);

  const manualTotal = (parseFloat(manualMorning) || 0) + (parseFloat(manualEvening) || 0);
  const manualIncome = manualTotal * (manualDate ? rateForDate(manualDate) : currentRate);

  const saveManualCollection = async () => {
    if (!manualDate || !manualMorning || !manualEvening) {
      toast.error(t(lang, "collectionFieldsRequired"));
      return;
    }
    if (isFutureDate(manualDate)) {
      toast.error(getValidationMessage("future_date", lang));
      return;
    }
    const manualMorningVal = parseFloat(manualMorning) || 0;
    if (manualMorningVal < 0) {
      toast.error(getValidationMessage("negative", lang));
      return;
    }
    if (manualMorningVal > 999) {
      toast.error(getValidationMessage("max_litres", lang));
      return;
    }
    const manualEveningVal = parseFloat(manualEvening) || 0;
    if (manualEveningVal < 0) {
      toast.error(getValidationMessage("negative", lang));
      return;
    }
    if (manualEveningVal > 999) {
      toast.error(getValidationMessage("max_litres", lang));
      return;
    }
    setSavingManual(true);
    try {
      const freshRates = await fetchRatesFresh();
      if (freshRates.length === 0) {
        toast.error(
          lang === "ta"
            ? `${animalType === "buffalo" ? "எருமை" : "பசு"} பால் விலை சேர்க்கப்படவில்லை. முதலில் விலை சேர்க்கவும்.`
            : `No ${animalType === "buffalo" ? "buffalo" : "cow"} milk rate found. Please add rate first.`
        );
        setSavingManual(false);
        return;
      }
      const rate = rateForDate(manualDate, freshRates);
      const morning = parseFloat(manualMorning) || 0;
      const evening = parseFloat(manualEvening) || 0;

      // Look up an existing entry for this date first so re-entering the same day
      // (e.g. correcting an OCR row) updates it instead of creating a duplicate.
      const existingQuery = supabase.from("milk_collections").select("id").eq("collection_date", manualDate);
      const { data: existingRows } =
        animalType === "cow"
          ? await existingQuery.or("animal_type.eq.cow,animal_type.is.null").limit(1)
          : await existingQuery.eq("animal_type", "buffalo").limit(1);
      const existing = existingRows && existingRows.length > 0 ? existingRows[0] : null;

      // total_litres and daily_income are DB-generated columns (total_litres = morning + evening,
      // daily_income = total_litres * rate_per_litre) — sending them explicitly errors with 428C9.
      if (existing) {
        const { error } = await supabase
          .from("milk_collections")
          .update({
            morning_litres: morning,
            evening_litres: evening,
            rate_per_litre: rate,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (error) {
          console.error("Error updating collection: ", error);
          toast.error(t(lang, "saveFailedMessage"));
        } else {
          toast.success(lang === "ta" ? "✅ புதுப்பிக்கப்பட்டது!" : "✅ Updated!");
          await ActivityLog.updated("Milk Collection", `${animalType === "buffalo" ? "Buffalo" : "Cow"} milk: ${manualTotal.toFixed(1)}L`);
          setManualDate("");
          setManualMorning("");
          setManualEvening("");
          fetchCollections();
          onChanged?.();
        }
      } else {
        const payload = {
          farm_location: "Home",
          collection_date: manualDate,
          morning_litres: morning,
          evening_litres: evening,
          rate_per_litre: rate,
          animal_type: animalType,
          month_year: manualDate.slice(0, 7),
        };
        const { error } = await supabase.from("milk_collections").insert(payload);
        if (error) {
          console.error("Error saving collection: ", error);
          toast.error(t(lang, "saveFailedMessage"));
        } else {
          toast.success(lang === "ta" ? "✅ சேமிக்கப்பட்டது!" : "✅ Saved!");
          await ActivityLog.added("Milk Collection", `${animalType === "buffalo" ? "Buffalo" : "Cow"} milk: ${manualTotal.toFixed(1)}L`);
          setManualDate("");
          setManualMorning("");
          setManualEvening("");
          setShowSuccess(true);
          setTimeout(() => setShowSuccess(false), 2000);
          fetchCollections();
          onChanged?.();
        }
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error(t(lang, "saveFailedMessage"));
    }
    setSavingManual(false);
  };

  // ---------------- OCR ----------------
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrImage, setOcrImage] = useState<string | null>(null);
  const [ocrRows, setOcrRows] = useState<MilkCardRow[]>([]);
  const [savingOcr, setSavingOcr] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!selectedMonthYear) {
      toast.error(lang === "ta" ? "முதலில் மாதம் தேர்வு செய்யுங்கள்" : "Please select month first");
      return;
    }
    setSelectedFileName(file.name);
    setOcrLoading(true);
    try {
      const dataUrl = await compressImage(file);
      setOcrImage(dataUrl);
      const base64 = dataUrl.split(",")[1];
      const rows = await extractMilkCardData(base64);
      // Rebuild every date from the selected month/year + the extracted day number —
      // never trust whatever month/year the OCR itself guessed.
      const corrected = rows
        .map((row) => {
          const day = dayNumberFromRow(row.date);
          const isoDate = day != null ? buildDateForSelectedMonth(day, selectedMonthYear) : null;
          return isoDate ? { ...row, date: isoDate } : null;
        })
        .filter((row): row is MilkCardRow => row !== null);
      setOcrRows(corrected);
    } catch (err) {
      toast.error("OCR error: " + (err instanceof Error ? err.message : String(err)));
    }
    setOcrLoading(false);
  };

  const updateOcrRow = (idx: number, field: keyof MilkCardRow, value: string) => {
    setOcrRows((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: field === "date" ? value : parseFloat(value) || 0 } : row))
    );
  };

  const saveOcrRows = async () => {
    if (ocrRows.length === 0) return;
    if (!selectedMonthYear) {
      toast.error(lang === "ta" ? "முதலில் மாதம் தேர்வு செய்யுங்கள்" : "Please select month first");
      return;
    }
    setSavingOcr(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error(lang === "ta" ? "மீண்டும் உள்நுழையவும்" : "Please login again");
        router.push("/login");
        setSavingOcr(false);
        return;
      }

      // Re-derive every date from the day number + selected month/year one more time
      // (rather than trusting whatever text is currently in the row, in case it was
      // hand-edited afterward) and drop rows with no milk data.
      const validRows = ocrRows
        .map((row) => {
          const day = dayNumberFromRow(row.date);
          const isoDate = day != null ? buildDateForSelectedMonth(day, selectedMonthYear) : null;
          if (!isoDate || !(row.morning > 0 || row.evening > 0)) return null;
          return { isoDate, morning: row.morning, evening: row.evening };
        })
        .filter((row): row is { isoDate: string; morning: number; evening: number } => row !== null);

      if (validRows.length === 0) {
        toast.error(t(lang, "saveFailedMessage"));
        setSavingOcr(false);
        return;
      }

      // Fetch the rate history once for the whole batch (not per row — that's both
      // wasteful and how a slow/failed fetch on one row could silently zero it out),
      // then apply the correct historical rate to every row from that single fetch.
      const freshRates = await fetchRatesFresh();
      if (freshRates.length === 0) {
        toast.error(
          lang === "ta"
            ? `${animalType === "buffalo" ? "எருமை" : "பசு"} பால் விலை சேர்க்கப்படவில்லை. முதலில் விலை சேர்க்கவும்.`
            : `No ${animalType === "buffalo" ? "buffalo" : "cow"} milk rate found. Please add rate first.`
        );
        setSavingOcr(false);
        return;
      }

      // total_litres and daily_income are DB-generated columns (total_litres = morning + evening,
      // daily_income = total_litres * rate_per_litre) — sending them explicitly errors with 428C9.
      const payload = validRows.map((row) => ({
        farm_location: "Home",
        collection_date: row.isoDate,
        morning_litres: row.morning,
        evening_litres: row.evening,
        rate_per_litre: rateForDate(row.isoDate, freshRates),
        animal_type: animalType,
        month_year: selectedMonthYear,
      }));

      // Check for entries already saved this month before inserting, so re-uploading
      // the same card (or a card with overlapping dates) doesn't create duplicates.
      const existingQuery = supabase.from("milk_collections").select("id, collection_date").eq("month_year", selectedMonthYear);
      const { data: existing } =
        animalType === "cow"
          ? await existingQuery.or("animal_type.eq.cow,animal_type.is.null")
          : await existingQuery.eq("animal_type", "buffalo");

      let rowsToInsert = payload;

      if (existing && existing.length > 0) {
        const shouldReplace = window.confirm(
          lang === "ta"
            ? `இந்த மாதத்தில் ${existing.length} உள்ளீடுகள் உள்ளன. மாற்றவா?`
            : `${existing.length} entries exist for this month. Replace them?`
        );

        if (shouldReplace) {
          const deleteQuery = supabase.from("milk_collections").delete().eq("month_year", selectedMonthYear);
          const { error: deleteError } =
            animalType === "cow"
              ? await deleteQuery.or("animal_type.eq.cow,animal_type.is.null")
              : await deleteQuery.eq("animal_type", "buffalo");
          if (deleteError) {
            console.error("Error clearing existing month: ", deleteError);
            toast.error(t(lang, "saveFailedMessage"));
            setSavingOcr(false);
            return;
          }
        } else {
          const existingDates = new Set(existing.map((e) => e.collection_date));
          rowsToInsert = payload.filter((r) => !existingDates.has(r.collection_date));
          if (rowsToInsert.length === 0) {
            toast.error(lang === "ta" ? "அனைத்து தேதிகளும் ஏற்கனவே உள்ளன" : "All dates already exist");
            setSavingOcr(false);
            return;
          }
        }
      }

      // Save in small batches — more resilient than one large insert on unstable mobile networks.
      let savedCount = 0;
      for (let i = 0; i < rowsToInsert.length; i += OCR_BATCH_SIZE) {
        const batch = rowsToInsert.slice(i, i + OCR_BATCH_SIZE);
        const { error } = await supabase.from("milk_collections").insert(batch);
        if (error) {
          console.error("Batch save error: ", error);
          toast.error(t(lang, "saveFailedMessage"));
          setSavingOcr(false);
          return;
        }
        savedCount += batch.length;
      }

      toast.success(lang === "ta" ? `✅ ${savedCount} நாட்கள் சேமிக்கப்பட்டது!` : `✅ ${savedCount} days saved!`);
      await ActivityLog.added("Milk Collection", `${animalType === "buffalo" ? "Buffalo" : "Cow"} milk: ${savedCount} days uploaded`);
      setOcrRows([]);
      setOcrImage(null);
      setSelectedFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      fetchCollections();
      onChanged?.();
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error(t(lang, "saveFailedMessage"));
    }
    setSavingOcr(false);
  };

  const deleteCollection = (cid: string) => {
    confirmDelete(async () => {
      const { error } = await supabase.from("milk_collections").delete().eq("id", cid);
      if (error) {
        console.error("Error: ", error);
        toast.error(t(lang, "saveFailedMessage"));
      } else {
        toast.success(lang === "ta" ? "✅ நீக்கப்பட்டது!" : "✅ Deleted!");
        await ActivityLog.deleted("Milk Collection", "Deleted 1 milk record");
        fetchCollections();
        onChanged?.();
      }
    });
  };

  // ---------------- Bulk select + delete ----------------
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const bulkDeleteCollections = () => {
    confirmDelete(async () => {
      const { error } = await supabase.from("milk_collections").delete().in("id", selectedIds);
      if (error) {
        console.error("Bulk delete error: ", error);
        toast.error(t(lang, "saveFailedMessage"));
      } else {
        toast.success(lang === "ta" ? `✅ ${selectedIds.length} நீக்கப்பட்டது!` : `✅ ${selectedIds.length} deleted!`);
        await ActivityLog.deleted("Milk Collection", `Deleted ${selectedIds.length} milk records`);
        setSelectedIds([]);
        setSelectMode(false);
        fetchCollections();
        onChanged?.();
      }
    });
  };

  // ---------------- Monthly view + weekly breakdown ----------------
  const monthCollections = collections.filter((c) => c.collection_date.startsWith(selectedMonthYear));
  const sortedMonthCollections = [...monthCollections].sort((a, b) => a.collection_date.localeCompare(b.collection_date));
  const monthTotalLitres = monthCollections.reduce((s, c) => s + Number(c.morning_litres) + Number(c.evening_litres), 0);
  const monthTotalIncome = monthCollections.reduce((s, c) => s + Number(c.daily_income ?? 0), 0);
  const daysRecorded = monthCollections.length;

  // Buckets a chronologically-sorted set of rows into weeks ending on Wednesday
  // (the milkman's payment day) — shared between the monthly view and the export sheet.
  const weeklyBreakdownFor = (rows: MilkCollection[]): Week[] => {
    const weeks: Week[] = [];
    let bucket: MilkCollection[] = [];
    let weekNum = 1;
    rows.forEach((c, idx) => {
      bucket.push(c);
      const day = new Date(c.collection_date).getDay();
      const isPaymentDay = day === 3; // Wednesday
      const isLast = idx === rows.length - 1;
      if (isPaymentDay || isLast) {
        const litres = bucket.reduce((s, r) => s + Number(r.morning_litres) + Number(r.evening_litres), 0);
        const income = bucket.reduce((s, r) => s + Number(r.daily_income ?? 0), 0);
        weeks.push({
          weekNum,
          start: bucket[0].collection_date,
          end: bucket[bucket.length - 1].collection_date,
          litres,
          income,
          isPaymentWeek: isPaymentDay,
        });
        bucket = [];
        weekNum++;
      }
    });
    return weeks;
  };

  const weeks = weeklyBreakdownFor(sortedMonthCollections);

  // ---------------- Yearly summary + monthly charts ----------------
  const [chartYear, setChartYear] = useState(CURRENT_YEAR);

  const yearCollections = collections.filter((c) => c.collection_date.startsWith(String(chartYear)));
  const yearTotalLitres = yearCollections.reduce((s, c) => s + Number(c.morning_litres) + Number(c.evening_litres), 0);
  const yearTotalIncome = yearCollections.reduce((s, c) => s + Number(c.daily_income ?? 0), 0);

  const getMonthlyChartData = () =>
    MONTH_OPTIONS.map(({ value, label }) => {
      const prefix = `${chartYear}-${value}`;
      const rows = collections.filter((c) => c.collection_date.startsWith(prefix));
      return {
        month: label,
        litres: Number(rows.reduce((s, c) => s + Number(c.morning_litres) + Number(c.evening_litres), 0).toFixed(1)),
        income: Number(rows.reduce((s, c) => s + Number(c.daily_income ?? 0), 0).toFixed(2)),
      };
    });

  const monthlyChartData = getMonthlyChartData();

  // ---------------- Collection history: grouped by month ----------------
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const groupByMonth = (): [string, MilkCollection[]][] => {
    const map = new Map<string, MilkCollection[]>();
    collections.forEach((c) => {
      const key = c.collection_date.slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  };

  const monthGroups = groupByMonth();

  const toggleSelectAllInRows = (rows: MilkCollection[]) => {
    const ids = rows.map((r) => r.id);
    const allSelected = ids.every((id) => selectedIds.includes(id));
    setSelectedIds((prev) => (allSelected ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]))));
  };

  // ---------------- Export ----------------
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportYear, setExportYear] = useState(CURRENT_YEAR);
  const [exportMonth, setExportMonth] = useState("");
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const monthPrefix = exportMonth ? `${exportYear}-${exportMonth}` : String(exportYear);
      const filtered = collections.filter((c) => c.collection_date.startsWith(monthPrefix));

      const monthsToShow = exportMonth ? [exportMonth] : MONTH_OPTIONS.map((m) => m.value);
      const monthlySummaryRows = monthsToShow.map((m) => {
        const prefix = `${exportYear}-${m}`;
        const rows = collections.filter((c) => c.collection_date.startsWith(prefix));
        return {
          Month: prefix,
          "Total Litres": Number(rows.reduce((s, c) => s + Number(c.morning_litres) + Number(c.evening_litres), 0).toFixed(1)),
          "Total Income (₹)": Number(rows.reduce((s, c) => s + Number(c.daily_income ?? 0), 0).toFixed(2)),
          "Days Recorded": rows.length,
        };
      });

      const sortedFiltered = [...filtered].sort((a, b) => a.collection_date.localeCompare(b.collection_date));
      const dailyRows = sortedFiltered.map((c) => ({
        Date: formatDMY(c.collection_date),
        Morning: Number(c.morning_litres),
        Evening: Number(c.evening_litres),
        "Total Litres": Number(c.morning_litres) + Number(c.evening_litres),
        "Income (₹)": Number(c.daily_income ?? 0),
      }));

      const weeklyRows = weeklyBreakdownFor(sortedFiltered).map((w) => ({
        Week: w.weekNum,
        Start: formatDMY(w.start),
        End: formatDMY(w.end),
        "Total Litres": Number(w.litres.toFixed(1)),
        "Income (₹)": Number(w.income.toFixed(2)),
      }));

      // Real month lengths (not a literal "-31") — Postgres rejects an out-of-range
      // date literal like 2026-02-31 outright, so the upper bound must be computed.
      const fromDate = exportMonth ? `${exportYear}-${exportMonth}-01` : `${exportYear}-01-01`;
      const toDate = exportMonth
        ? `${exportYear}-${exportMonth}-${String(new Date(exportYear, parseInt(exportMonth, 10), 0).getDate()).padStart(2, "0")}`
        : `${exportYear}-12-31`;

      // cow_expenses has no `category` column — only `expense_type` — and isn't split
      // by animal_type, so the same shared cattle expenses are included for both tabs.
      const { data: expData } = await supabase
        .from("cow_expenses")
        .select("expense_date, expense_type, amount, vendor_name, description")
        .gte("expense_date", fromDate)
        .lte("expense_date", toDate);
      const expenseRows = (expData ?? []).map((e) => ({
        Date: formatDMY(e.expense_date),
        Type: e.expense_type,
        "Amount (₹)": Number(e.amount),
        Vendor: e.vendor_name ?? "—",
        Description: e.description ?? "—",
      }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthlySummaryRows), "Monthly Summary");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailyRows), "Daily Collection");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(weeklyRows), "Weekly Breakdown");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expenseRows), "Expenses");

      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], { type: "application/octet-stream" });
      saveAs(blob, `${animalType}_milk_${exportYear}${exportMonth ? "-" + exportMonth : ""}.xlsx`);

      toast.success(t(lang, "exportSuccess"));
      setExportModalOpen(false);
    } catch (err) {
      console.error("Export error:", err);
      toast.error(t(lang, "saveFailedMessage"));
    }
    setExporting(false);
  };

  // Preview-only figures shown above the Save button — computed from the same
  // cached rate history the row table already renders, so what's shown before
  // saving matches what will actually be charged.
  const ocrTotalExpectedIncome = ocrRows.reduce((sum, row) => {
    const total = (row.morning || 0) + (row.evening || 0);
    return sum + total * rateForDate(row.date);
  }, 0);

  // Shown on the collapsed header so the current rate stays visible without opening
  // the section — undefined (no badge) until a rate actually exists.
  const currentRateDisplay = rates.length ? `₹${currentRate}/L` : undefined;

  return (
    <div className="flex flex-col gap-3">
      {/* Current Milk Rate (collapsible, default collapsed) */}
      <CollapsibleSection
        label={t(lang, "currentMilkRate")}
        icon="💰"
        isOpen={showMilkRate}
        onToggle={() => setShowMilkRate(!showMilkRate)}
        badge={currentRateDisplay}
      >
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2 mt-3">
          <p className="text-sm font-bold text-success">
            {t(lang, "currentRate")}: {inr(currentRate)} / {t(lang, "perLitre")}
            {rates[0] && ` (${t(lang, "effectiveFrom")} ${formatDMY(rates[0].effective_from)})`}
          </p>
          <button onClick={() => setRateModalOpen(true)} className="text-xs font-semibold text-primary hover:text-primary/80">
            + {t(lang, "updateRate")}
          </button>
        </div>
        {rates.length > 0 && (
          <div className="overflow-x-auto max-h-32 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-1">{t(lang, "effectiveFromDate")}</th>
                  <th className="py-1">{t(lang, "rate")}/{t(lang, "perLitre")}</th>
                  <th className="py-1"></th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="py-1 text-gray-900">{formatDMY(r.effective_from)}</td>
                    <td className="py-1 text-gray-900 font-medium">{inr(Number(r.rate_per_litre))}</td>
                    <td className="py-1">
                      <button onClick={() => openEditRate(r)} className="hover:text-primary" title={t(lang, "editMilkRate")}>
                        ✏️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {/* Manual entry + OCR */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-2">{t(lang, "manualEntry")}</h2>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div>
              <label className={labelCls}>{t(lang, "date")}</label>
              <input
                type="date"
                max={new Date().toISOString().split("T")[0]}
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{t(lang, "morning")}</label>
              <input
                type="number"
                min="0"
                onKeyDown={(e) => { if (e.key === "-") e.preventDefault(); }}
                value={manualMorning}
                onChange={(e) => setManualMorning(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{t(lang, "evening")}</label>
              <input
                type="number"
                min="0"
                onKeyDown={(e) => { if (e.key === "-") e.preventDefault(); }}
                value={manualEvening}
                onChange={(e) => setManualEvening(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <p className="text-xs text-gray-600 mb-2">
            {t(lang, "totalLitres")}: {manualTotal.toFixed(1)} L · {t(lang, "expectedIncome")}: {inr(manualIncome)}
          </p>
          <button onClick={saveManualCollection} disabled={savingManual} className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-xs font-semibold transition">
            {savingManual ? "..." : t(lang, "save")}
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-gray-800">📷 {t(lang, "uploadMilkCard")}</h2>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">{t(lang, "month")}</label>
              <input
                type="month"
                value={selectedMonthYear}
                onChange={(e) => setSelectedMonthYear(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white text-gray-900"
              />
            </div>
          </div>
          <div className="relative mb-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-green-400 hover:bg-green-50 transition-colors duration-200">
              <div className="text-3xl mb-2">📷</div>
              <p className="text-gray-700 font-medium text-sm">{t(lang, "clickToUploadPhoto")}</p>
              <p className="text-gray-500 text-xs mt-1">{selectedFileName ? `✅ ${selectedFileName}` : t(lang, "jpgPngSupported")}</p>
            </div>
          </div>
          {ocrLoading && <p className="text-xs text-gray-500">{t(lang, "readingMilkCard")}</p>}
          {ocrImage && <img src={ocrImage} alt="Milk card" className="w-full max-h-32 object-contain rounded-lg border border-gray-200 mb-2" />}
          {ocrRows.length > 0 && (
            <>
              <div className="overflow-x-auto max-h-40 overflow-y-auto mb-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="py-1">{t(lang, "date")}</th>
                      <th className="py-1">{t(lang, "morning")}</th>
                      <th className="py-1">{t(lang, "evening")}</th>
                      <th className="py-1">{t(lang, "totalLitres")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ocrRows.map((row, idx) => {
                      const total = (row.morning || 0) + (row.evening || 0);
                      return (
                        <tr key={idx} className="border-b border-gray-50">
                          <td className="py-1">
                            <input type="text" value={row.date} onChange={(e) => updateOcrRow(idx, "date", e.target.value)} className="w-20 border border-gray-200 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500" />
                          </td>
                          <td className="py-1">
                            <input type="number" value={row.morning} onChange={(e) => updateOcrRow(idx, "morning", e.target.value)} className="w-14 border border-gray-200 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500" />
                          </td>
                          <td className="py-1">
                            <input type="number" value={row.evening} onChange={(e) => updateOcrRow(idx, "evening", e.target.value)} className="w-14 border border-gray-200 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500" />
                          </td>
                          <td className="py-1">{total.toFixed(1)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 mb-2">
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {lang === "ta" ? `பயன்படுத்தப்படும் விலை: ${inr(currentRate)}/L` : `Rate being used: ${inr(currentRate)}/L`}
                </p>
                <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">
                  {lang === "ta" ? `மொத்த வருமானம்: ${inr(ocrTotalExpectedIncome)}` : `Total expected income: ${inr(ocrTotalExpectedIncome)}`}
                </p>
              </div>
              <button onClick={saveOcrRows} disabled={savingOcr} className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-xs font-semibold transition">
                {savingOcr ? "..." : t(lang, "saveAllRows")}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Combined Summary Section (Monthly / Weekly / Yearly) */}
      <div className="border border-gray-100 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800">
        <button
          onClick={() => setShowSummary(!showSummary)}
          className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors min-h-[44px]"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            📊 {L("Summary", "சுருக்கம்")}
          </span>
          <motion.span
            animate={{ rotate: showSummary ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-gray-400 text-xs"
          >
            ▼
          </motion.span>
        </button>

        <AnimatePresence>
          {showSummary && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 pt-2 bg-white dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700">

                {/* Period toggle */}
                <div className="flex gap-1 bg-gray-100 dark:bg-slate-700 rounded-xl p-1 mb-4">
                  {(
                    [
                      { key: "monthly" as const, en: "Monthly", ta: "மாதாந்திர" },
                      { key: "weekly" as const, en: "Weekly", ta: "வாராந்திர" },
                      { key: "yearly" as const, en: "Yearly", ta: "ஆண்டு" },
                    ]
                  ).map((period) => (
                    <button
                      key={period.key}
                      onClick={() => setSummaryPeriod(period.key)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        summaryPeriod === period.key
                          ? "bg-white dark:bg-slate-600 text-green-700 dark:text-green-400 shadow-sm"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {L(period.en, period.ta)}
                    </button>
                  ))}
                </div>

                {/* Monthly content */}
                {summaryPeriod === "monthly" && (
                  <div>
                    <div className="flex justify-end mb-3">
                      <input
                        type="month"
                        value={selectedMonthYear}
                        onChange={(e) => setSelectedMonthYear(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-900"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">{t(lang, "totalLitres")}</p>
                        <p className="text-lg font-bold text-gray-800">{monthTotalLitres.toFixed(1)} L</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">{t(lang, "expectedIncome")}</p>
                        <p className="text-lg font-bold text-success">{inr(monthTotalIncome)}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">{t(lang, "daysRecorded")}</p>
                        <p className="text-lg font-bold text-gray-800">{daysRecorded}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Weekly content */}
                {summaryPeriod === "weekly" && (
                  <div>
                    {weeks.length === 0 ? (
                      <EmptyState type="milk" title={t(lang, "noRecordsYet")} className="py-4" />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-gray-500 uppercase text-[10px] tracking-wide border-b">
                              <th className="py-1 px-1">{t(lang, "week")}</th>
                              <th className="py-1 px-1">{t(lang, "date")}</th>
                              <th className="py-1 px-1">{t(lang, "totalLitres")}</th>
                              <th className="py-1 px-1">{t(lang, "expectedIncome")}</th>
                              <th className="py-1 px-1"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {weeks.map((w) => (
                              <tr key={w.weekNum} className="border-b border-gray-50 text-gray-900">
                                <td className="py-1 px-1 font-medium">{t(lang, "week")} {w.weekNum}</td>
                                <td className="py-1 px-1 text-gray-700">{formatDMY(w.start)} → {formatDMY(w.end)}</td>
                                <td className="py-1 px-1">{w.litres.toFixed(1)} L</td>
                                <td className="py-1 px-1 text-green-600 font-medium">{inr(w.income)}</td>
                                <td className="py-1 px-1">
                                  {w.isPaymentWeek && (
                                    <span className="bg-amber-100 text-amber-700 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
                                      💰 {t(lang, "paymentWeek")}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Yearly content */}
                {summaryPeriod === "yearly" && (
                  <div>
                    <div className="flex items-center justify-end mb-3 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={chartYear}
                          onChange={(e) => setChartYear(parseInt(e.target.value, 10))}
                          className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs sm:text-sm bg-white text-gray-900 min-h-[44px] sm:min-h-0 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500"
                        >
                          {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <button
                          onClick={fetchCollections}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-primary/40 text-primary text-xs sm:text-sm font-medium hover:bg-green-50 transition min-h-[44px] sm:min-h-0"
                        >
                          🔄 {t(lang, "refresh")}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">{t(lang, "totalLitres")}</p>
                        <p className="text-lg font-bold text-gray-800">{yearTotalLitres.toFixed(1)} L</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">{t(lang, "expectedIncome")}</p>
                        <p className="text-lg font-bold text-success">{inr(yearTotalIncome)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <h3 className="text-xs font-semibold text-gray-700 mb-2">{t(lang, "monthlyIncomeChart")}</h3>
                        <div className="overflow-x-auto">
                          <div style={{ minWidth: 320, height: 220 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={monthlyChartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                                <YAxis tick={{ fontSize: 10 }} />
                                <Tooltip formatter={(value) => inr(Number(value))} />
                                <Legend />
                                <Bar dataKey="income" name={t(lang, "income")} fill="#22c55e" isAnimationActive={true} animationBegin={0} animationDuration={800} animationEasing="ease-out" />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-xs font-semibold text-gray-700 mb-2">{t(lang, "monthlyLitresChart")}</h3>
                        <div className="overflow-x-auto">
                          <div style={{ minWidth: 320, height: 220 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={monthlyChartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                                <YAxis tick={{ fontSize: 10 }} />
                                <Tooltip formatter={(value) => `${value} L`} />
                                <Legend />
                                <Bar dataKey="litres" name={t(lang, "totalLitres")} fill="#3b82f6" isAnimationActive={true} animationBegin={0} animationDuration={800} animationEasing="ease-out" />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Collection History (collapsible) */}
      <CollapsibleSection
        label={t(lang, "collectionHistory")}
        icon="📋"
        isOpen={showHistory}
        onToggle={() => setShowHistory(!showHistory)}
        badge={`${collections.length} ${t(lang, "recordCount")}`}
      >
        <div className="flex items-center justify-end mb-2 gap-2 flex-wrap mt-3">
          <div className="flex items-center gap-2 flex-wrap">
            {selectMode && selectedIds.length > 0 && (
              <button
                onClick={bulkDeleteCollections}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-medium transition min-h-[44px] sm:min-h-0"
              >
                🗑️ {lang === "ta" ? `${selectedIds.length} நீக்கு` : `Delete ${selectedIds.length}`}
              </button>
            )}
            <button
              onClick={() => {
                setSelectMode(!selectMode);
                setSelectedIds([]);
              }}
              className="text-xs text-primary hover:underline font-medium"
            >
              {selectMode ? t(lang, "cancel") : t(lang, "select")}
            </button>
            <button
              onClick={() => setExportModalOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-primary/40 text-primary text-xs font-medium hover:bg-green-50 transition min-h-[44px] sm:min-h-0"
            >
              📤 {t(lang, "export")}
            </button>
          </div>
        </div>
        {collections.length === 0 ? (
          <EmptyState type="history" title={t(lang, "noRecordsYet")} />
        ) : (
          <div className="flex flex-col">
            {monthGroups.map(([monthKey, rows]) => {
              const isExpanded = expandedMonths.has(monthKey);
              const monthLitres = rows.reduce((s, c) => s + Number(c.morning_litres) + Number(c.evening_litres), 0);
              const monthIncome = rows.reduce((s, c) => s + Number(c.daily_income ?? 0), 0);
              return (
                <div key={monthKey} className="border-b border-gray-100">
                  <button
                    onClick={() => toggleMonth(monthKey)}
                    className="w-full flex items-center justify-between py-2 px-1 text-left hover:bg-gray-50 transition min-h-[44px] sm:min-h-0"
                  >
                    <span className="text-xs font-semibold text-gray-800">{isExpanded ? "▼" : "▶"} {monthKey}</span>
                    <span className="text-xs text-gray-500">
                      {monthLitres.toFixed(1)} L · <span className="text-green-600 font-medium">{inr(monthIncome)}</span>
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="overflow-x-auto max-h-72 overflow-y-auto">
                      <table className="w-full text-xs" style={{ minWidth: 480 }}>
                        <thead className="sticky top-0 bg-gray-50">
                          <tr className="text-left text-gray-500 uppercase text-[10px] tracking-wide">
                            {selectMode && (
                              <th className="py-1 px-1">
                                <input
                                  type="checkbox"
                                  checked={rows.every((r) => selectedIds.includes(r.id))}
                                  onChange={() => toggleSelectAllInRows(rows)}
                                  className="w-4 h-4 accent-green-600"
                                />
                              </th>
                            )}
                            <th className="py-1 px-1">{t(lang, "date")}</th>
                            <th className="py-1 px-1">{t(lang, "morning")}</th>
                            <th className="py-1 px-1">{t(lang, "evening")}</th>
                            <th className="py-1 px-1">{t(lang, "totalLitres")}</th>
                            <th className="py-1 px-1">{t(lang, "income")}</th>
                            <th className="py-1 px-1"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((c) => {
                            const total = Number(c.morning_litres) + Number(c.evening_litres);
                            const wasEdited = c.updated_at && c.created_at && c.updated_at !== c.created_at;
                            return (
                              <tr key={c.id} className="border-b border-gray-50 text-gray-900">
                                {selectMode && (
                                  <td className="py-1 px-1">
                                    <input
                                      type="checkbox"
                                      checked={selectedIds.includes(c.id)}
                                      onChange={() => toggleSelect(c.id)}
                                      className="w-4 h-4 accent-green-600"
                                    />
                                  </td>
                                )}
                                <td className="py-1 px-1 text-gray-700">
                                  {formatDMY(c.collection_date)}
                                  {wasEdited && (
                                    <span className="text-xs text-amber-500 ml-1" title={lang === "ta" ? "கைமுறையாக திருத்தப்பட்டது" : "Manually edited"}>
                                      ✏️
                                    </span>
                                  )}
                                </td>
                                <td className="py-1 px-1 font-medium">{c.morning_litres}</td>
                                <td className="py-1 px-1 font-medium">{c.evening_litres}</td>
                                <td className="py-1 px-1 font-medium">{total.toFixed(1)}</td>
                                <td className="py-1 px-1 font-medium text-green-600">{inr(Number(c.daily_income ?? 0))}</td>
                                <td className="py-1 px-1">
                                  {!selectMode && (
                                    <button onClick={() => deleteCollection(c.id)} className="hover:text-danger">🗑️</button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CollapsibleSection>

      {/* Add rate modal */}
      {rateModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-0">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-primary">{t(lang, "updateRate")}</h2>
              <button onClick={() => setRateModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{t(lang, "newRate")}</label>
                <input
                  type="number"
                  min="1"
                  onKeyDown={(e) => { if (e.key === "-") e.preventDefault(); }}
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                  className={inputCls}
                />
                {milkRateWarning(newRate, lang) && <p className="text-amber-600 text-xs mt-1">{milkRateWarning(newRate, lang)}</p>}
              </div>
              <div>
                <label className={labelCls}>{t(lang, "effectiveFromDate")}</label>
                <input
                  type="date"
                  max={new Date().toISOString().split("T")[0]}
                  value={newRateDate}
                  onChange={(e) => setNewRateDate(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{t(lang, "notes")}</label>
                <input type="text" value={newRateNotes} onChange={(e) => setNewRateNotes(e.target.value)} className={inputCls} />
              </div>
              <div className="flex gap-2">
                <button onClick={saveRate} disabled={savingRate} className="flex-1 bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg py-2 text-sm font-semibold transition">
                  {savingRate ? "..." : t(lang, "save")}
                </button>
                <button onClick={() => setRateModalOpen(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg py-2 text-sm font-semibold transition">
                  {t(lang, "cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit rate modal */}
      {editingRate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-0">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-primary">{t(lang, "editMilkRate")}</h2>
              <button onClick={() => setEditingRate(null)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{t(lang, "newRate")}</label>
                <input
                  type="number"
                  min="1"
                  onKeyDown={(e) => { if (e.key === "-") e.preventDefault(); }}
                  value={editRateValue}
                  onChange={(e) => setEditRateValue(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{t(lang, "effectiveFromDate")}</label>
                <input
                  type="date"
                  max={new Date().toISOString().split("T")[0]}
                  value={editRateDate}
                  onChange={(e) => setEditRateDate(e.target.value)}
                  className={inputCls}
                />
              </div>
              {affectedCount !== null && (
                <div
                  className={`rounded-lg p-3 text-xs ${
                    affectedCount > 0 ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-blue-50 text-blue-700 border border-blue-200"
                  }`}
                >
                  {affectedCount > 0 ? (
                    <>
                      ⚠️ {affectedCount} {t(lang, "affectedRecords")}
                      <br />
                      {t(lang, "recalculateWarning")}
                    </>
                  ) : (
                    <>ℹ️ {lang === "ta" ? "பாதிக்கப்படும் பதிவுகள் இல்லை" : "No existing records will be affected"}</>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={saveEditRate} disabled={savingRateEdit} className="flex-1 bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg py-2 text-sm font-semibold transition">
                  {savingRateEdit ? "..." : affectedCount && affectedCount > 0 ? t(lang, "saveAndRecalculate") : t(lang, "save")}
                </button>
                <button onClick={() => { setEditingRate(null); setAffectedCount(null); }} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg py-2 text-sm font-semibold transition">
                  {t(lang, "cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export modal */}
      {exportModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4 sm:p-0">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-primary">{t(lang, "exportData")}</h2>
              <button onClick={() => setExportModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{t(lang, "selectYear")}</label>
                <select value={exportYear} onChange={(e) => setExportYear(parseInt(e.target.value, 10))} className={inputCls}>
                  {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>{t(lang, "selectMonthOptional")}</label>
                <select value={exportMonth} onChange={(e) => setExportMonth(e.target.value)} className={inputCls}>
                  <option value="">{t(lang, "all")}</option>
                  {MONTH_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="flex-1 bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg py-2 text-sm font-semibold transition min-h-[44px] sm:min-h-0"
                >
                  {exporting ? "..." : `⬇ ${t(lang, "downloadExcel")}`}
                </button>
                <button
                  onClick={() => setExportModalOpen(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg py-2 text-sm font-semibold transition min-h-[44px] sm:min-h-0"
                >
                  {t(lang, "cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SuccessCheckmark show={showSuccess} message={lang === "ta" ? "சேமிக்கப்பட்டது!" : "Saved!"} />
      <DeleteConfirmDialog isOpen={deleteOpen} onConfirm={handleDeleteConfirm} onCancel={handleDeleteCancel} language={lang} />
    </div>
  );
}
