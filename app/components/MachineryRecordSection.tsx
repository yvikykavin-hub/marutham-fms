"use client";

import toast from "react-hot-toast";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase";
import { isFutureDate, getValidationMessage } from "../lib/validation";
import DeleteConfirmDialog from "./DeleteConfirmDialog";
import { useDeleteConfirm } from "../hooks/useDeleteConfirm";

export type MachineryField = {
  key: string;
  en: string;
  ta: string;
  type: "date" | "text" | "number" | "textarea";
  required?: boolean;
  isCost?: boolean;
  placeholderEn?: string;
  placeholderTa?: string;
};

type Props = {
  lang: "ta" | "en";
  table: string;
  titleEn: string;
  titleTa: string;
  icon: string;
  dateField: string;
  fields: MachineryField[]; // all columns in display/input order, excluding notes
  hasNotes?: boolean;
  showLastDate?: boolean;
  onChanged?: () => void;
  // Optional scoping to a parent record (e.g. a specific tractor) — when set,
  // fetch/insert/update are all filtered to filterColumn = filterValue.
  filterColumn?: string;
  filterValue?: string;
  // When true, the card becomes an expand/collapse section (header tap toggles
  // it) instead of the default always-expanded card.
  collapsible?: boolean;
  defaultOpen?: boolean;
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const formatDMY = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

const inputCls =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary";
const labelCls = "block mb-1 text-xs font-medium text-gray-700";

export default function MachineryRecordSection({
  lang,
  table,
  titleEn,
  titleTa,
  icon,
  dateField,
  fields,
  hasNotes = true,
  showLastDate = false,
  onChanged,
  filterColumn,
  filterValue,
  collapsible = false,
  defaultOpen = true,
}: Props) {
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);

  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { isOpen: deleteOpen, confirmDelete, handleConfirm: handleDeleteConfirm, handleCancel: handleDeleteCancel } = useDeleteConfirm();
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const costField = fields.find((f) => f.isCost)?.key;

  useEffect(() => {
    fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filterValue]);

  const fetchRecords = async () => {
    setLoading(true);
    let query = supabase.from(table).select("*").order(dateField, { ascending: false });
    if (filterColumn && filterValue) query = query.eq(filterColumn, filterValue);
    const { data } = await query;
    if (data) setRecords(data);
    setLoading(false);
  };

  const totalSpent = costField ? records.reduce((s, r) => s + Number(r[costField] ?? 0), 0) : 0;

  const openAdd = () => {
    setEditingId(null);
    setFormValues({});
    setNotes("");
    setModalOpen(true);
  };

  const openEdit = (r: Record<string, unknown>) => {
    setEditingId(String(r.id));
    const vals: Record<string, string> = {};
    fields.forEach((f) => {
      const v = r[f.key];
      vals[f.key] = v != null ? String(v) : "";
    });
    setFormValues(vals);
    setNotes(r.notes != null ? String(r.notes) : "");
    setModalOpen(true);
  };

  const save = async () => {
    const missing = fields.some((f) => f.required && !formValues[f.key]);
    if (missing) {
      toast.error(L("Please fill all required fields.", "தேவையான அனைத்து புலங்களையும் நிரப்பவும்."));
      return;
    }
    const hasFutureDate = fields.some((f) => f.type === "date" && isFutureDate(formValues[f.key] || ""));
    if (hasFutureDate) {
      toast.error(getValidationMessage("future_date", lang));
      return;
    }
    const hasNegativeNumber = fields.some((f) => f.type === "number" && formValues[f.key] && Number(formValues[f.key]) < 0);
    if (hasNegativeNumber) {
      toast.error(getValidationMessage("negative", lang));
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      fields.forEach((f) => {
        const raw = formValues[f.key] ?? "";
        if (f.type === "number") {
          payload[f.key] = raw ? parseFloat(raw) : null;
        } else {
          payload[f.key] = raw.trim() ? raw.trim() : null;
        }
      });
      if (hasNotes) payload.notes = notes.trim() || null;
      if (filterColumn && filterValue && !editingId) payload[filterColumn] = filterValue;

      const { error } = editingId
        ? await supabase.from(table).update(payload).eq("id", editingId)
        : await supabase.from(table).insert(payload);

      if (error) {
        console.error(`Error saving ${table}:`, error);
        toast.error(L("Could not save. Please try again.", "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
      } else {
        setModalOpen(false);
        fetchRecords();
        onChanged?.();
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error(L("Could not save. Please try again.", "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
    }
    setSaving(false);
  };

  const remove = (id: string) => {
    confirmDelete(async () => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) {
        console.error(`Error deleting ${table}:`, error);
        toast.error(L("Could not delete. Please try again.", "நீக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
      } else {
        toast.success(L("Deleted!", "நீக்கப்பட்டது!"));
        fetchRecords();
        onChanged?.();
      }
    });
  };

  // Shared records list/table content — identical markup used by both the
  // non-collapsible (unchanged) and collapsible render paths below.
  const recordsBody = (
    <>
      {showLastDate && (
        <p className="text-xs text-gray-600 mb-2">
          {L("Last replaced", "கடைசியாக மாற்றப்பட்டது")}: <span className="font-semibold text-gray-900">{formatDMY(records[0]?.[dateField] as string | undefined)}</span>
        </p>
      )}

      <p className="text-xs text-gray-500 mb-2">
        {L("Total Spent", "மொத்த செலவு")}: <span className="font-semibold text-danger">{inr(totalSpent)}</span>
      </p>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-8 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 uppercase text-[10px] tracking-wide border-b">
                {fields.map((f) => (
                  <th key={f.key} className="py-1 px-1">{L(f.en, f.ta)}</th>
                ))}
                {hasNotes && <th className="py-1 px-1">{L("Notes", "குறிப்பு")}</th>}
                <th className="py-1 px-1"></th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={fields.length + (hasNotes ? 2 : 1)} className="text-center py-6 text-gray-500">
                    🔧 {L("No records yet", "பதிவுகள் இல்லை")}
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={String(r.id)} className="border-b border-gray-50">
                    {fields.map((f) => {
                      const v = r[f.key];
                      const display =
                        f.type === "date"
                          ? formatDMY(v as string | undefined)
                          : f.isCost
                          ? inr(Number(v ?? 0))
                          : (v != null && v !== "" ? String(v) : "—");
                      return (
                        <td key={f.key} className={`py-1 px-1 text-gray-900 ${f.isCost ? "text-danger font-medium" : ""}`}>
                          {display}
                        </td>
                      );
                    })}
                    {hasNotes && <td className="py-1 px-1 text-gray-600">{(r.notes as string) || "—"}</td>}
                    <td className="py-1 px-1 whitespace-nowrap">
                      <button onClick={() => openEdit(r)} className="mr-2 hover:text-primary">✏️</button>
                      <button onClick={() => remove(String(r.id))} className="hover:text-danger">🗑️</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  return (
    <>
    {!collapsible ? (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-gray-800">{icon} {L(titleEn, titleTa)}</h2>
          <button onClick={openAdd} className="bg-primary hover:bg-primary/90 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">
            + {L("Add", "சேர்க்க")}
          </button>
        </div>
        {recordsBody}
      </div>
    ) : (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Clickable header */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-base">{icon}</span>
            <h2 className="text-sm font-semibold text-gray-800">{L(titleEn, titleTa)}</h2>
            {/* Show record count when collapsed */}
            {!isOpen && records.length > 0 && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                {records.length}
              </span>
            )}
          </div>

          <motion.span
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-gray-400 text-xs flex-shrink-0"
          >
            ▼
          </motion.span>
        </button>

        {/* Collapsible content */}
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                <div className="flex justify-end mb-2">
                  <button onClick={openAdd} className="bg-primary hover:bg-primary/90 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">
                    + {L("Add", "சேர்க்க")}
                  </button>
                </div>
                {recordsBody}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-0">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-primary">
                {editingId ? L("Edit", "திருத்து") : L("Add", "சேர்க்க")} {L(titleEn, titleTa)}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              {fields.map((f) => (
                <div key={f.key}>
                  <label className={labelCls}>
                    {L(f.en, f.ta)} {f.required && "*"}
                  </label>
                  {f.type === "textarea" ? (
                    <textarea
                      value={formValues[f.key] ?? ""}
                      onChange={(e) => setFormValues({ ...formValues, [f.key]: e.target.value })}
                      className={inputCls}
                      rows={2}
                      placeholder={f.placeholderEn ? L(f.placeholderEn, f.placeholderTa ?? "") : undefined}
                    />
                  ) : (
                    <input
                      type={f.type}
                      min={f.type === "number" ? "0" : undefined}
                      max={f.type === "date" ? new Date().toISOString().split("T")[0] : undefined}
                      onKeyDown={f.type === "number" ? (e) => { if (e.key === "-") e.preventDefault(); } : undefined}
                      value={formValues[f.key] ?? ""}
                      onChange={(e) => setFormValues({ ...formValues, [f.key]: e.target.value })}
                      className={inputCls}
                      placeholder={f.placeholderEn ? L(f.placeholderEn, f.placeholderTa ?? "") : undefined}
                    />
                  )}
                </div>
              ))}
              {hasNotes && (
                <div>
                  <label className={labelCls}>{L("Notes", "குறிப்பு")}</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} rows={2} />
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={save} disabled={saving} className="flex-1 bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg py-2 text-sm font-semibold transition">
                  {saving ? "..." : L("Save", "சேமி")}
                </button>
                <button onClick={() => setModalOpen(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg py-2 text-sm font-semibold transition">
                  {L("Cancel", "ரத்து")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <DeleteConfirmDialog isOpen={deleteOpen} onConfirm={handleDeleteConfirm} onCancel={handleDeleteCancel} language={lang} />
    </>
  );
}
