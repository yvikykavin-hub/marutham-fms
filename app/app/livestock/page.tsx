"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import Sidebar from "../../components/Sidebar";
import AnimatedCard from "../../components/AnimatedCard";
import { supabase } from "../../lib/supabase";
import { t } from "../../lib/labels";
import { useLang } from "../../lib/useLang";

type MilkRow = {
  collection_date: string;
  daily_income: number | null;
  animal_type: string | null;
  morning_litres: number | null;
  evening_litres: number | null;
  rate_per_litre: number | null;
};
type AmountDateRow = { expense_date?: string; sale_date?: string; amount?: number; total_amount?: number };

// daily_income is a DB-generated column — this just guards against a stale/null
// value rather than trusting a genuine 0.
const rowIncome = (m: MilkRow) => {
  if (m.daily_income && m.daily_income > 0) return Number(m.daily_income);
  const litres = (Number(m.morning_litres) || 0) + (Number(m.evening_litres) || 0);
  return litres * (Number(m.rate_per_litre) || 0);
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => currentYear - i);

export default function LivestockLandingPage() {
  const [lang, setLang] = useLang();
  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(true);
  const [showFinancial, setShowFinancial] = useState(false);

  const [cowMilkIncome, setCowMilkIncome] = useState(0);
  const [buffaloMilkIncome, setBuffaloMilkIncome] = useState(0);
  const [cattleExpense, setCattleExpense] = useState(0);
  const [goatIncome, setGoatIncome] = useState(0);
  const [goatExpense, setGoatExpense] = useState(0);
  const [henIncome, setHenIncome] = useState(0);
  const [henExpense, setHenExpense] = useState(0);

  useEffect(() => {
    fetchYearlyData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const fetchYearlyData = async () => {
    setLoading(true);
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;

    const [{ data: milk }, { data: cowExp }, { data: gInc }, { data: gExp }, { data: hInc }, { data: hExp }] =
      await Promise.all([
        supabase
          .from("milk_collections")
          .select("collection_date, daily_income, animal_type, morning_litres, evening_litres, rate_per_litre")
          .gte("collection_date", from)
          .lte("collection_date", to),
        supabase.from("cow_expenses").select("expense_date, amount").gte("expense_date", from).lte("expense_date", to),
        supabase.from("goat_income").select("sale_date, total_amount").gte("sale_date", from).lte("sale_date", to),
        supabase.from("goat_expenses").select("expense_date, amount").gte("expense_date", from).lte("expense_date", to),
        supabase.from("hen_income").select("sale_date, total_amount").gte("sale_date", from).lte("sale_date", to),
        supabase.from("hen_expenses").select("expense_date, amount").gte("expense_date", from).lte("expense_date", to),
      ]);

    const milkRows = (milk ?? []) as MilkRow[];
    setCowMilkIncome(milkRows.filter((m) => m.animal_type !== "buffalo").reduce((s, m) => s + rowIncome(m), 0));
    setBuffaloMilkIncome(milkRows.filter((m) => m.animal_type === "buffalo").reduce((s, m) => s + rowIncome(m), 0));

    const sumAmount = (rows: AmountDateRow[] | null) => (rows ?? []).reduce((s, r) => s + Number(r.amount ?? r.total_amount ?? 0), 0);

    setCattleExpense(sumAmount(cowExp));
    setGoatIncome(sumAmount(gInc));
    setGoatExpense(sumAmount(gExp));
    setHenIncome(sumAmount(hInc));
    setHenExpense(sumAmount(hExp));
    setLoading(false);
  };

  const cattleIncome = cowMilkIncome + buffaloMilkIncome;
  const cattleProfit = cattleIncome - cattleExpense;
  const goatProfit = goatIncome - goatExpense;
  const henProfit = henIncome - henExpense;
  const totalNetProfit = cattleProfit + goatProfit + henProfit;

  const cards = [
    { href: "/livestock/cows", icon: "🐄🐃", label: t(lang, "cows") },
    { href: "/livestock/goats", icon: "🐐", label: t(lang, "goats") },
    { href: "/livestock/hens", icon: "🐔", label: t(lang, "hens") },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <Sidebar lang={lang} setLang={setLang} />

      <main className="flex-1 overflow-y-auto p-4">
        <div className="max-w-6xl mx-auto flex flex-col gap-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t(lang, "livestock")}</h1>
            <button
              onClick={() => setLang(lang === "ta" ? "en" : "ta")}
              className="px-3 py-1.5 rounded-lg border border-primary/40 text-primary text-sm font-medium hover:bg-green-50 transition"
            >
              {lang === "ta" ? "English" : "தமிழ்"}
            </button>
          </div>

          {/* Landing cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {cards.map((card, i) => (
              <AnimatedCard key={card.href} delay={i * 0.1}>
                <Link href={card.href}>
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:border-primary hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.99] p-6 sm:p-8 flex flex-col items-center gap-2 cursor-pointer">
                    <span className="text-4xl">{card.icon}</span>
                    <span className="text-base font-bold text-gray-800">{card.label}</span>
                  </div>
                </Link>
              </AnimatedCard>
            ))}
          </div>

          {/* Collapsible financial overview */}
          <div className="rounded-2xl shadow-sm border border-emerald-100 dark:border-emerald-800/30 overflow-hidden mb-4">
            <button
              onClick={() => setShowFinancial(!showFinancial)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 hover:from-emerald-100 hover:to-teal-100 dark:hover:from-emerald-900/30 dark:hover:to-teal-900/30 transition-colors rounded-2xl min-h-[44px]"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base">📊</span>
                <span className="text-base font-semibold text-gray-800">{t(lang, "financialOverview")}</span>
                {!showFinancial && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${totalNetProfit >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {totalNetProfit >= 0 ? "✅" : "❌"} {inr(Math.abs(totalNetProfit))}
                  </span>
                )}
              </div>
              <span className="text-gray-400 text-sm">{showFinancial ? "▲" : "▼"}</span>
            </button>

            {showFinancial && (
              <div className="px-4 pb-4 bg-gradient-to-b from-emerald-50/50 to-white dark:from-emerald-900/10 dark:to-slate-800 border-t border-emerald-100 dark:border-emerald-800/30">
                {/* Year selector + Refresh */}
                <div className="flex items-center gap-2 py-3 flex-wrap">
                  <select
                    value={year}
                    onChange={(e) => setYear(parseInt(e.target.value, 10))}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-900 min-h-[44px] sm:min-h-0 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500"
                  >
                    {YEAR_OPTIONS.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <button
                    onClick={fetchYearlyData}
                    disabled={loading}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-primary/40 text-primary text-sm font-medium hover:bg-green-50 transition min-h-[44px] sm:min-h-0"
                  >
                    <span className={loading ? "animate-spin" : ""}>🔄</span> {t(lang, "refresh")}
                  </button>
                </div>

                {/* Financial table */}
                <div className="overflow-x-auto mb-4">
                  <table className="w-full min-w-[300px]">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-slate-700/50">
                        <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 py-2 pr-3">{t(lang, "livestockShort")}</th>
                        <th className="text-right text-xs font-medium text-green-600 dark:text-green-400 py-2 px-2">{t(lang, "income")}</th>
                        <th className="text-right text-xs font-medium text-red-500 dark:text-red-400 py-2 px-2">{t(lang, "expense")}</th>
                        <th className="text-right text-xs font-medium text-blue-600 dark:text-blue-400 py-2 pl-2">{t(lang, "profit")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { icon: "🐄", label: `${t(lang, "cows")} & ${t(lang, "buffalo")}`, income: cattleIncome, expense: cattleExpense, profit: cattleProfit },
                        { icon: "🐐", label: t(lang, "goats"), income: goatIncome, expense: goatExpense, profit: goatProfit },
                        { icon: "🐔", label: t(lang, "hens"), income: henIncome, expense: henExpense, profit: henProfit },
                      ].map((row) => (
                        <tr key={row.label} className="border-b border-gray-50 dark:border-slate-700/50 hover:bg-gray-50/50 dark:hover:bg-slate-700/30 transition-colors">
                          <td className="py-2.5 pr-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-base">{row.icon}</span>
                              <span className="text-xs font-medium text-gray-800 dark:text-gray-200">{row.label}</span>
                            </div>
                          </td>
                          <td className="text-right py-2.5 px-2">
                            <span className="text-xs font-semibold text-green-600 dark:text-green-400">{inr(row.income)}</span>
                          </td>
                          <td className="text-right py-2.5 px-2">
                            <span className="text-xs font-semibold text-red-500 dark:text-red-400">{inr(row.expense)}</span>
                          </td>
                          <td className="text-right py-2.5 pl-2">
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-lg ${row.profit >= 0 ? "text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/20" : "text-orange-700 bg-orange-50 dark:text-orange-400 dark:bg-orange-900/20"}`}>
                              {row.profit >= 0 ? "+" : "-"}{inr(Math.abs(row.profit))}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 dark:border-slate-600">
                        <td className="py-2.5 pr-3">
                          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{t(lang, "total")}</span>
                        </td>
                        <td className="text-right py-2.5 px-2">
                          <span className="text-sm font-bold text-green-600 dark:text-green-400">{inr(cattleIncome + goatIncome + henIncome)}</span>
                        </td>
                        <td className="text-right py-2.5 px-2">
                          <span className="text-sm font-bold text-red-500 dark:text-red-400">{inr(cattleExpense + goatExpense + henExpense)}</span>
                        </td>
                        <td className="text-right py-2.5 pl-2">
                          <span className={`text-sm font-bold px-1.5 py-0.5 rounded-lg ${totalNetProfit >= 0 ? "text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30" : "text-orange-700 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30"}`}>
                            {totalNetProfit >= 0 ? "+" : "-"}{inr(Math.abs(totalNetProfit))}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
