"use client";

import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import AnimatedCard from "../../../components/AnimatedCard";
import { SkeletonList } from "../../../components/Skeleton";
import { useState, useEffect } from "react";
import Link from "next/link";
import Sidebar from "../../../components/Sidebar";
import PullToRefresh from "../../../components/PullToRefresh";
import EmptyState from "../../../components/EmptyState";
import { SuccessCheckmark } from "../../../components/SuccessAnimation";
import DeleteConfirmDialog from "../../../components/DeleteConfirmDialog";
import { useDeleteConfirm } from "../../../hooks/useDeleteConfirm";
import { supabase } from "../../../lib/supabase";
import { t } from "../../../lib/labels";
import { useLang } from "../../../lib/useLang";
import { isFutureDate, getValidationMessage } from "../../../lib/validation";
import { ActivityLog } from "../../../lib/activityLog";

type Hen = {
  id: string;
  name: string;
  tag_number: string | null;
  breed: string | null;
  gender: string | null;
  date_of_birth: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  weight_kg: number | null;
  current_status: string;
  sold_date: string | null;
  sold_price: number | null;
  notes: string | null;
};

type HenSale = {
  id: string;
  hen_id: string;
  sale_date: string;
  sale_type: string;
  weight_kg: number | null;
  rate_per_kg: number | null;
  number_sold: number | null;
  rate_per_bird: number | null;
  total_amount: number;
  buyer_name: string | null;
  remarks: string | null;
};

type HenExpense = {
  id: string;
  hen_id: string;
  expense_type: string;
  expense_date: string;
  quantity: number | null;
  unit: string | null;
  amount: number;
  description: string | null;
  notes: string | null;
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  sold: "bg-blue-100 text-blue-700",
  deceased: "bg-gray-200 text-gray-600",
};
const EXPENSE_TYPE_KEYS = ["feed", "medicine", "vaccination", "shedMaintenance", "miscellaneous", "other"] as const;

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const formatDMY = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

const inputCls =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary";
const labelCls = "block mb-1 text-xs text-gray-700";

const emptyForm = {
  name: "",
  tag_number: "",
  breed: "",
  gender: "",
  date_of_birth: "",
  purchase_date: "",
  purchase_price: "",
  weight_kg: "",
  current_status: "active",
  notes: "",
};

export default function HensListPage() {
  const [lang, setLang] = useLang();
  const [hens, setHens] = useState<Hen[]>([]);
  const [sales, setSales] = useState<HenSale[]>([]);
  const [expenses, setExpenses] = useState<HenExpense[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<"animals" | "income" | "expenses">("animals");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const { isOpen: deleteOpen, confirmDelete, handleConfirm: handleDeleteConfirm, handleCancel: handleDeleteCancel } = useDeleteConfirm();

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const { data: henData, error } = await supabase.from("hens").select("*").order("created_at", { ascending: false });
    if (!error && henData) setHens(henData);
    const [{ data: saleData }, { data: expData }] = await Promise.all([
      supabase.from("hen_income").select("*").order("sale_date", { ascending: false }),
      supabase.from("hen_expenses").select("*").order("expense_date", { ascending: false }),
    ]);
    if (saleData) setSales(saleData);
    if (expData) setExpenses(expData);
    setLoading(false);
  };

  const henName = (henId: string) => hens.find((h) => h.id === henId)?.name ?? "—";

  const totalHens = hens.length;
  const activeHens = hens.filter((h) => h.current_status === "active").length;
  const soldHens = hens.filter((h) => h.current_status === "sold").length;

  // Year filter for the financial stat cards only — animal counts above and the
  // Income/Expenses tab tables continue to show all-time/all records.
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const yearStr = String(selectedYear);
  const filteredIncome = sales.filter((s) => s.sale_date?.startsWith(yearStr));
  const filteredExpense = expenses.filter((e) => e.expense_date?.startsWith(yearStr));

  const totalIncome = filteredIncome.reduce((sum, s) => sum + Number(s.total_amount), 0);
  const totalExpense = filteredExpense.reduce((sum, e) => sum + Number(e.amount), 0);
  const netPL = totalIncome - totalExpense;

  const openAddModal = () => {
    setForm(emptyForm);
    setFormErrors({});
    setModalOpen(true);
  };

  const handleDelete = (id: string) => {
    const target = hens.find((h) => h.id === id);
    confirmDelete(async () => {
      const { error } = await supabase.from("hens").delete().eq("id", id);

      if (error) {
        toast.error(t(lang, "couldNotDelete"));
      } else {
        toast.success(t(lang, "deletedSuccessfully"));
        await ActivityLog.deleted("Animal", `Hen deleted: ${target?.name || "unnamed"}`);
        fetchAll();
      }
    });
  };

  const saveHen = async () => {
    const errors: Record<string, boolean> = {
      name: !form.name.trim(),
      gender: !form.gender,
    };
    setFormErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      toast.error(t(lang, "nameGenderRequired"));
      return;
    }
    if (form.purchase_date && isFutureDate(form.purchase_date)) {
      toast.error(getValidationMessage("future_date", lang));
      return;
    }
    if (form.purchase_price && Number(form.purchase_price) < 0) {
      toast.error(getValidationMessage("negative", lang));
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("hens").insert({
        farm_location: "Home",
        name: form.name.trim(),
        tag_number: form.tag_number.trim() || null,
        breed: form.breed.trim() || null,
        gender: form.gender,
        date_of_birth: form.date_of_birth || null,
        purchase_date: form.purchase_date || null,
        purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : null,
        weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
        current_status: form.current_status,
        notes: form.notes.trim() || null,
      });
      if (error) {
        console.error("Error saving hen: ", error);
        toast.error(t(lang, "saveFailedMessage"));
      } else {
        await ActivityLog.added("Animal", `New Hen: ${form.name.trim() || "unnamed"}`);
        setModalOpen(false);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
        fetchAll();
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error(t(lang, "saveFailedMessage"));
    }
    setSaving(false);
  };

  // ---------------- Income (Sales) ----------------
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [saleHenId, setSaleHenId] = useState("");
  const [saleDate, setSaleDate] = useState("");
  const [saleType, setSaleType] = useState<"weight" | "bird">("weight");
  const [saleWeight, setSaleWeight] = useState("");
  const [saleRateKg, setSaleRateKg] = useState("");
  const [saleBirdCount, setSaleBirdCount] = useState("");
  const [saleRateBird, setSaleRateBird] = useState("");
  const [saleTotal, setSaleTotal] = useState("");
  const [saleBuyer, setSaleBuyer] = useState("");
  const [saleRemarks, setSaleRemarks] = useState("");
  const [savingSale, setSavingSale] = useState(false);
  const [totalManuallyEdited, setTotalManuallyEdited] = useState(false);

  const computedTotal =
    saleType === "weight"
      ? (parseFloat(saleWeight) || 0) * (parseFloat(saleRateKg) || 0)
      : (parseFloat(saleBirdCount) || 0) * (parseFloat(saleRateBird) || 0);

  const openAddSale = () => {
    setSaleHenId("");
    setSaleDate("");
    setSaleType("weight");
    setSaleWeight("");
    setSaleRateKg("");
    setSaleBirdCount("");
    setSaleRateBird("");
    setSaleTotal("");
    setSaleBuyer("");
    setSaleRemarks("");
    setTotalManuallyEdited(false);
    setSaleModalOpen(true);
  };

  const saveSale = async () => {
    if (!saleHenId || !saleDate) {
      toast.error(t(lang, "dateRequired"));
      return;
    }
    if (isFutureDate(saleDate)) {
      toast.error(getValidationMessage("future_date", lang));
      return;
    }
    if (saleType === "weight") {
      if (saleWeight && Number(saleWeight) < 0) {
        toast.error(getValidationMessage("negative", lang));
        return;
      }
      if (saleRateKg && Number(saleRateKg) < 0) {
        toast.error(getValidationMessage("negative", lang));
        return;
      }
    } else {
      if (saleBirdCount && Number(saleBirdCount) < 0) {
        toast.error(getValidationMessage("negative", lang));
        return;
      }
      if (saleRateBird && Number(saleRateBird) < 0) {
        toast.error(getValidationMessage("negative", lang));
        return;
      }
    }
    setSavingSale(true);
    try {
      const total = totalManuallyEdited ? parseFloat(saleTotal) || 0 : computedTotal;
      const { error } = await supabase.from("hen_income").insert({
        hen_id: saleHenId,
        farm_location: "Home",
        sale_date: saleDate || null,
        sale_type: saleType,
        weight_kg: saleType === "weight" && saleWeight ? parseFloat(saleWeight) : null,
        rate_per_kg: saleType === "weight" && saleRateKg ? parseFloat(saleRateKg) : null,
        number_sold: saleType === "bird" && saleBirdCount ? parseFloat(saleBirdCount) : null,
        rate_per_bird: saleType === "bird" && saleRateBird ? parseFloat(saleRateBird) : null,
        total_amount: total || null,
        buyer_name: saleBuyer.trim() || null,
        remarks: saleRemarks.trim() || null,
      });
      if (error) {
        console.error("Error saving sale: ", error);
        toast.error(t(lang, "saveFailedMessage"));
      } else {
        await ActivityLog.added("Hen Income", `Hen sold: ₹${total}`);
        setSaleModalOpen(false);
        fetchAll();
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error(t(lang, "saveFailedMessage"));
    }
    setSavingSale(false);
  };

  const deleteSale = (sid: string) => {
    confirmDelete(async () => {
      const { error } = await supabase.from("hen_income").delete().eq("id", sid);
      if (error) {
        console.error("Error: ", error);
        toast.error(t(lang, "saveFailedMessage"));
      } else {
        toast.success(lang === "ta" ? "✅ நீக்கப்பட்டது!" : "✅ Deleted!");
        await ActivityLog.deleted("Hen Income", "Hen sale record deleted");
        fetchAll();
      }
    });
  };

  // ---------------- Expenses ----------------
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expHenId, setExpHenId] = useState("");
  const [expType, setExpType] = useState<typeof EXPENSE_TYPE_KEYS[number]>("feed");
  const [expDate, setExpDate] = useState("");
  const [expQty, setExpQty] = useState("");
  const [expUnit, setExpUnit] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expDescription, setExpDescription] = useState("");
  const [savingExpense, setSavingExpense] = useState(false);

  const openAddExpense = () => {
    setExpHenId("");
    setExpType("feed");
    setExpDate("");
    setExpQty("");
    setExpUnit("");
    setExpAmount("");
    setExpDescription("");
    setExpenseModalOpen(true);
  };

  const saveExpense = async () => {
    if (!expHenId || !expDate || !expAmount) {
      toast.error(t(lang, "dateAmountRequired"));
      return;
    }
    if (isFutureDate(expDate)) {
      toast.error(getValidationMessage("future_date", lang));
      return;
    }
    if (Number(expAmount) < 0) {
      toast.error(getValidationMessage("negative", lang));
      return;
    }
    setSavingExpense(true);
    try {
      const { error } = await supabase.from("hen_expenses").insert({
        hen_id: expHenId,
        farm_location: "Home",
        expense_type: t("en", expType) || null,
        expense_date: expDate || null,
        quantity: expQty ? parseFloat(expQty) : null,
        unit: expUnit.trim() || null,
        amount: parseFloat(expAmount) || null,
        description: expDescription.trim() || null,
        notes: null,
      });
      if (error) {
        console.error("Error saving expense: ", error);
        toast.error(t(lang, "saveFailedMessage"));
      } else {
        await ActivityLog.added("Hen Expense", `${t("en", expType)}: ₹${expAmount}`);
        setExpenseModalOpen(false);
        fetchAll();
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error(t(lang, "saveFailedMessage"));
    }
    setSavingExpense(false);
  };

  const deleteExpense = (eid: string) => {
    confirmDelete(async () => {
      const { error } = await supabase.from("hen_expenses").delete().eq("id", eid);
      if (error) {
        console.error("Error: ", error);
        toast.error(t(lang, "saveFailedMessage"));
      } else {
        toast.success(lang === "ta" ? "✅ நீக்கப்பட்டது!" : "✅ Deleted!");
        await ActivityLog.deleted("Hen Expense", "Expense record deleted");
        fetchAll();
      }
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <Sidebar lang={lang} setLang={setLang} />

      <main className="flex-1 overflow-y-auto p-4">
        <PullToRefresh onRefresh={fetchAll} language={lang}>
        <div className="max-w-6xl mx-auto flex flex-col gap-4">

          <Link href="/livestock" className="text-primary hover:text-primary text-sm font-semibold">
            ← {t(lang, "backToLivestock")}
          </Link>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h1 className="text-xl font-bold text-primary">🐔 {t(lang, "hens")}</h1>
              <p className="text-sm text-gray-500">{t(lang, "livestock")}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchAll}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-primary/40 text-primary text-sm font-medium hover:bg-green-50 transition min-h-[44px] sm:min-h-0"
              >
                🔄 {t(lang, "refresh")}
              </button>
              <button
                onClick={() => setLang(lang === "ta" ? "en" : "ta")}
                className="px-3 py-1.5 rounded-lg border border-primary/40 text-primary text-sm font-medium hover:bg-green-50 transition"
              >
                {lang === "ta" ? "English" : "தமிழ்"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="bg-white rounded-xl shadow-sm p-3">
              <p className="text-xs text-gray-500">{t(lang, "total")}</p>
              <p className="text-xl font-bold text-gray-800">{totalHens}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-3">
              <p className="text-xs text-gray-500">{t(lang, "active")}</p>
              <p className="text-xl font-bold text-success">{activeHens}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-3">
              <p className="text-xs text-gray-500">{t(lang, "sold")}</p>
              <p className="text-xl font-bold text-blue-600">{soldHens}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">{t(lang, "selectYear")}:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className="text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px] sm:min-h-0"
            >
              {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white rounded-xl shadow-sm p-3">
              <p className="text-xs text-gray-500">{t(lang, "income")}</p>
              <p className="text-xl font-bold text-success">{inr(totalIncome)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-3">
              <p className="text-xs text-gray-500">{t(lang, "expense")}</p>
              <p className="text-xl font-bold text-danger">{inr(totalExpense)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-3">
              <p className="text-xs text-gray-500">{t(lang, "netPL")}</p>
              <p className={`text-xl font-bold ${netPL >= 0 ? "text-success" : "text-danger"}`}>{inr(netPL)}</p>
            </div>
          </div>

          <div className="flex gap-1 bg-white rounded-xl shadow-sm p-1 w-fit overflow-x-auto">
            {([
              ["animals", `🐔 ${t(lang, "animalsTab")}`],
              ["income", `💰 ${t(lang, "income")}`],
              ["expenses", `💸 ${t(lang, "expenses")}`],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                  activeTab === key ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
          {/* ANIMALS TAB */}
          {activeTab === "animals" && (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end">
                <button
                  onClick={openAddModal}
                  className="bg-primary hover:bg-primary/90 text-white rounded-xl px-4 py-2 text-sm font-medium shadow-sm transition"
                >
                  + {t(lang, "addHen")}
                </button>
              </div>
              {loading ? (
                <SkeletonList count={6} />
              ) : hens.length === 0 ? (
                <EmptyState
                  type="hens"
                  title={t(lang, "noHensYet")}
                  subtitle={lang === "ta" ? "உங்கள் முதல் கோழியை சேர்க்கவும்" : "Add your first hen to get started"}
                  action={{ label: `+ ${t(lang, "addHen")}`, onClick: openAddModal }}
                />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {hens.map((hen, i) => (
                    <AnimatedCard key={hen.id} delay={Math.min(i, 8) * 0.05}>
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:border-primary hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-3">
                      <div className="flex items-start justify-between">
                        <Link href={`/livestock/hens/${hen.id}`} className="flex-1 cursor-pointer">
                          <h3 className="text-sm font-semibold text-gray-900">🐔 {hen.name}</h3>
                          <p className="text-xs text-gray-500">{hen.tag_number || "—"}</p>
                        </Link>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={`${STATUS_BADGE[hen.current_status] ?? STATUS_BADGE.active} text-xs font-semibold px-2 py-0.5 rounded-full`}>
                            {hen.current_status}
                          </span>
                          <button onClick={() => handleDelete(hen.id)} className="text-red-400 hover:text-red-600 transition-colors duration-200 p-1">
                            🗑️
                          </button>
                        </div>
                      </div>
                      <Link href={`/livestock/hens/${hen.id}`} className="cursor-pointer">
                        <p className="text-xs text-gray-600 mt-1">{hen.breed || "—"}</p>
                        <p className="text-xs text-gray-600 mt-1 font-medium">
                          {t(lang, "weight")}: {hen.weight_kg != null ? `${hen.weight_kg} kg` : "—"}
                        </p>
                      </Link>
                    </div>
                    </AnimatedCard>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* INCOME TAB */}
          {activeTab === "income" && (
            <div className="flex flex-col gap-3">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-base font-semibold text-gray-800">{t(lang, "salesHistory")}</h2>
                  <button onClick={openAddSale} className="bg-primary hover:bg-primary/90 text-white rounded-lg px-3 py-1.5 text-sm font-medium transition">
                    + {t(lang, "addSale")}
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-500 uppercase text-xs font-medium tracking-wide border-b">
                        <th className="py-1 px-1">{t(lang, "name")}</th>
                        <th className="py-1 px-1">{t(lang, "date")}</th>
                        <th className="py-1 px-1">{t(lang, "saleType")}</th>
                        <th className="py-1 px-1">{t(lang, "weightOrBirds")}</th>
                        <th className="py-1 px-1">{t(lang, "rate")}</th>
                        <th className="py-1 px-1">{t(lang, "total")}</th>
                        <th className="py-1 px-1">{t(lang, "buyerName")}</th>
                        <th className="py-1 px-1">{t(lang, "remarks")}</th>
                        <th className="py-1 px-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.length === 0 ? (
                        <tr><td colSpan={9} className="text-center py-6 text-gray-500">🐔 {t(lang, "noSalesYet")}</td></tr>
                      ) : (
                        sales.map((s) => (
                          <tr key={s.id} className="border-b border-gray-50">
                            <td className="py-1 px-1 text-gray-900 font-medium">{henName(s.hen_id)}</td>
                            <td className="py-1 px-1 text-gray-900">{formatDMY(s.sale_date)}</td>
                            <td className="py-1 px-1 text-gray-900">{s.sale_type === "weight" ? t(lang, "byWeight") : t(lang, "perBird")}</td>
                            <td className="py-1 px-1 text-gray-900">
                              {s.sale_type === "weight" ? (s.weight_kg != null ? `${s.weight_kg} kg` : "—") : (s.number_sold ?? "—")}
                            </td>
                            <td className="py-1 px-1 text-gray-900">
                              {s.sale_type === "weight"
                                ? (s.rate_per_kg != null ? inr(Number(s.rate_per_kg)) : "—")
                                : (s.rate_per_bird != null ? inr(Number(s.rate_per_bird)) : "—")}
                            </td>
                            <td className="py-1 px-1 font-medium text-green-600">{inr(Number(s.total_amount))}</td>
                            <td className="py-1 px-1 text-gray-600">{s.buyer_name || "—"}</td>
                            <td className="py-1 px-1 text-gray-600">{s.remarks || "—"}</td>
                            <td className="py-1 px-1">
                              <button onClick={() => deleteSale(s.id)} className="hover:text-danger">🗑️</button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* EXPENSES TAB */}
          {activeTab === "expenses" && (
            <div className="flex flex-col gap-3">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-base font-semibold text-gray-800">{t(lang, "expenseRecords")}</h2>
                  <button onClick={openAddExpense} className="bg-primary hover:bg-primary/90 text-white rounded-lg px-3 py-1.5 text-sm font-medium transition">
                    + {t(lang, "addExpense")}
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-500 uppercase text-xs font-medium tracking-wide border-b">
                        <th className="py-1 px-1">{t(lang, "name")}</th>
                        <th className="py-1 px-1">{t(lang, "date")}</th>
                        <th className="py-1 px-1">{t(lang, "type")}</th>
                        <th className="py-1 px-1">{t(lang, "quantity")}</th>
                        <th className="py-1 px-1">{t(lang, "unit")}</th>
                        <th className="py-1 px-1">{t(lang, "amount")}</th>
                        <th className="py-1 px-1">{t(lang, "description")}</th>
                        <th className="py-1 px-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.length === 0 ? (
                        <tr><td colSpan={8} className="text-center py-6 text-gray-500">🐔 {t(lang, "noExpensesYet")}</td></tr>
                      ) : (
                        expenses.map((e) => (
                          <tr key={e.id} className="border-b border-gray-50">
                            <td className="py-1 px-1 text-gray-900 font-medium">{henName(e.hen_id)}</td>
                            <td className="py-1 px-1 text-gray-900">{formatDMY(e.expense_date)}</td>
                            <td className="py-1 px-1 text-gray-900">{e.expense_type}</td>
                            <td className="py-1 px-1 text-gray-900">{e.quantity ?? "—"}</td>
                            <td className="py-1 px-1 text-gray-900">{e.unit || "—"}</td>
                            <td className="py-1 px-1 text-red-600 font-medium">{inr(Number(e.amount))}</td>
                            <td className="py-1 px-1 text-gray-600">{e.description || "—"}</td>
                            <td className="py-1 px-1">
                              <button onClick={() => deleteExpense(e.id)} className="hover:text-danger">🗑️</button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
            </motion.div>
          </AnimatePresence>
        </div>
        </PullToRefresh>
      </main>

      {/* Add Hen Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-0">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl sm:max-h-[90vh] h-full sm:h-auto overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-primary">{t(lang, "addHen")}</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t(lang, "name")} *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={`${inputCls} ${formErrors.name ? "border-danger" : ""}`}
                />
              </div>
              <div>
                <label className={labelCls}>{t(lang, "gender")} *</label>
                <select
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                  className={`${inputCls} ${formErrors.gender ? "border-danger" : ""}`}
                >
                  <option value="">{t(lang, "select")}</option>
                  <option value="Female">{t(lang, "female")}</option>
                  <option value="Male">{t(lang, "male")}</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>{t(lang, "tagNumber")}</label>
                <input type="text" value={form.tag_number} onChange={(e) => setForm({ ...form, tag_number: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t(lang, "breed")}</label>
                <input type="text" value={form.breed} onChange={(e) => setForm({ ...form, breed: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t(lang, "dateOfBirth")}</label>
                <input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t(lang, "purchaseDate")}</label>
                <input
                  type="date"
                  max={new Date().toISOString().split("T")[0]}
                  value={form.purchase_date}
                  onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{t(lang, "purchasePrice")}</label>
                <input
                  type="number"
                  min="0"
                  onKeyDown={(e) => { if (e.key === "-") e.preventDefault(); }}
                  value={form.purchase_price}
                  onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{t(lang, "weight")}</label>
                <input type="number" value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t(lang, "status")}</label>
                <select value={form.current_status} onChange={(e) => setForm({ ...form, current_status: e.target.value })} className={inputCls}>
                  <option value="active">{t(lang, "active")}</option>
                  <option value="sold">{t(lang, "sold")}</option>
                  <option value="deceased">{t(lang, "deceased")}</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>{t(lang, "notes")}</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} rows={2} />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={saveHen} disabled={saving} className="flex-1 bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-xl py-2.5 text-sm font-medium transition">
                {saving ? "..." : t(lang, "save")}
              </button>
              <button onClick={() => setModalOpen(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-2.5 text-sm font-medium transition">
                {t(lang, "cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Sale Modal */}
      {saleModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-0">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-primary">{t(lang, "addSale")}</h2>
              <button onClick={() => setSaleModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{t(lang, "selectAnimal")} *</label>
                <select value={saleHenId} onChange={(e) => setSaleHenId(e.target.value)} className={inputCls}>
                  <option value="">{t(lang, "select")}</option>
                  {hens.map((h) => (
                    <option key={h.id} value={h.id}>{h.name} {h.tag_number ? `(${h.tag_number})` : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{t(lang, "date")}</label>
                <input
                  type="date"
                  max={new Date().toISOString().split("T")[0]}
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setSaleType("weight")}
                  className={`flex-1 py-1.5 rounded-md text-sm font-medium transition ${saleType === "weight" ? "bg-white shadow-sm text-primary" : "text-gray-500"}`}
                >
                  {t(lang, "byWeight")}
                </button>
                <button
                  onClick={() => setSaleType("bird")}
                  className={`flex-1 py-1.5 rounded-md text-sm font-medium transition ${saleType === "bird" ? "bg-white shadow-sm text-primary" : "text-gray-500"}`}
                >
                  {t(lang, "perBird")}
                </button>
              </div>

              {saleType === "weight" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>{t(lang, "weight")}</label>
                    <input
                      type="number"
                      min="0"
                      onKeyDown={(e) => { if (e.key === "-") e.preventDefault(); }}
                      value={saleWeight}
                      onChange={(e) => setSaleWeight(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>{t(lang, "rateperKg")}</label>
                    <input
                      type="number"
                      min="0"
                      onKeyDown={(e) => { if (e.key === "-") e.preventDefault(); }}
                      value={saleRateKg}
                      onChange={(e) => setSaleRateKg(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>{t(lang, "numberOfBirds")}</label>
                    <input
                      type="number"
                      min="0"
                      onKeyDown={(e) => { if (e.key === "-") e.preventDefault(); }}
                      value={saleBirdCount}
                      onChange={(e) => setSaleBirdCount(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>{t(lang, "rateperBird")}</label>
                    <input
                      type="number"
                      min="0"
                      onKeyDown={(e) => { if (e.key === "-") e.preventDefault(); }}
                      value={saleRateBird}
                      onChange={(e) => setSaleRateBird(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className={labelCls}>{t(lang, "totalAmount")}</label>
                <input
                  type="number"
                  value={totalManuallyEdited ? saleTotal : computedTotal.toFixed(2)}
                  onChange={(e) => {
                    setTotalManuallyEdited(true);
                    setSaleTotal(e.target.value);
                  }}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{t(lang, "buyerName")}</label>
                <input type="text" value={saleBuyer} onChange={(e) => setSaleBuyer(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t(lang, "remarks")}</label>
                <input type="text" value={saleRemarks} onChange={(e) => setSaleRemarks(e.target.value)} className={inputCls} />
              </div>
              <div className="flex gap-2">
                <button onClick={saveSale} disabled={savingSale} className="flex-1 bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg py-2 text-sm font-medium transition">
                  {savingSale ? "..." : t(lang, "save")}
                </button>
                <button onClick={() => setSaleModalOpen(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg py-2 text-sm font-medium transition">
                  {t(lang, "cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {expenseModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-0">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-primary">{t(lang, "addExpense")}</h2>
              <button onClick={() => setExpenseModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{t(lang, "selectAnimal")} *</label>
                <select value={expHenId} onChange={(e) => setExpHenId(e.target.value)} className={inputCls}>
                  <option value="">{t(lang, "select")}</option>
                  {hens.map((h) => (
                    <option key={h.id} value={h.id}>{h.name} {h.tag_number ? `(${h.tag_number})` : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{t(lang, "expenseType")}</label>
                <select value={expType} onChange={(e) => setExpType(e.target.value as typeof EXPENSE_TYPE_KEYS[number])} className={inputCls}>
                  {EXPENSE_TYPE_KEYS.map((k) => <option key={k} value={k}>{t(lang, k)}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>{t(lang, "date")}</label>
                <input
                  type="date"
                  max={new Date().toISOString().split("T")[0]}
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{t(lang, "quantity")}</label>
                  <input type="number" value={expQty} onChange={(e) => setExpQty(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{t(lang, "unit")}</label>
                  <input type="text" value={expUnit} onChange={(e) => setExpUnit(e.target.value)} className={inputCls} placeholder="kg / bag / etc" />
                </div>
              </div>
              <div>
                <label className={labelCls}>{t(lang, "amount")}</label>
                <input
                  type="number"
                  min="0"
                  onKeyDown={(e) => { if (e.key === "-") e.preventDefault(); }}
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{t(lang, "description")}</label>
                <input type="text" value={expDescription} onChange={(e) => setExpDescription(e.target.value)} className={inputCls} />
              </div>
              <div className="flex gap-2">
                <button onClick={saveExpense} disabled={savingExpense} className="flex-1 bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg py-2 text-sm font-medium transition">
                  {savingExpense ? "..." : t(lang, "save")}
                </button>
                <button onClick={() => setExpenseModalOpen(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg py-2 text-sm font-medium transition">
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
