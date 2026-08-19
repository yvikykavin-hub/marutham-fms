"use client";

import toast from "react-hot-toast";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "../../../../components/Sidebar";
import MachineryRecordSection from "../../../../components/MachineryRecordSection";
import DeleteConfirmDialog from "../../../../components/DeleteConfirmDialog";
import { useDeleteConfirm } from "../../../../hooks/useDeleteConfirm";
import { supabase } from "../../../../lib/supabase";
import { useLang } from "../../../../lib/useLang";
import { isFutureDate, getValidationMessage } from "../../../../lib/validation";
import { ActivityLog } from "../../../../lib/activityLog";

type Tractor = {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  year_of_purchase: number | null;
  purchase_price: number | null;
  registration_number: string | null;
  engine_number: string | null;
  chassis_number: string | null;
  insurance_number: string | null;
  insurance_expiry: string | null;
  oil_change_interval_hours: number;
  notes: string | null;
  is_active: boolean;
};

type TractorUsage = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  purpose: string | null;
  notes: string | null;
};

type TractorEngineOil = {
  id: string;
  date: string;
  oil_brand: string | null;
  amount: number;
  hours_at_service: number;
  notes: string | null;
};

type TractorDiesel = {
  id: string;
  date: string;
  litres: number;
  amount: number;
  notes: string | null;
};

type TractorPhoto = {
  id: string;
  caption: string;
  photo_data: string;
};

const DEFAULT_OIL_CHANGE_INTERVAL = 300;
const BRANDS = ["Mahindra", "John Deere", "Sonalika", "TAFE", "Eicher", "New Holland", "Indo Farm", "Other"];

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const formatDMY = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
};
const daysUntil = (iso: string | null | undefined) => {
  if (!iso) return null;
  const diffMs = new Date(iso).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

const inputCls =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary";
const labelCls = "block mb-1 text-xs text-gray-700";

const computeDurationHours = (startTime: string, endTime: string) => {
  const start = new Date(`2000-01-01T${startTime}`);
  const end = new Date(`2000-01-01T${endTime}`);
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
};

const MAX_RECOMMENDED_PHOTO_BYTES = 2 * 1024 * 1024;

const convertToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export default function TractorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tractorId = params.id as string;

  const [lang, setLang] = useLang();
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);

  const [tractor, setTractor] = useState<Tractor | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "diesel" | "usage" | "engineOil" | "maintenance" | "photos">("overview");

  // Shared state needed across tabs for the oil counter logic
  const [usage, setUsage] = useState<TractorUsage[]>([]);
  const [engineOil, setEngineOil] = useState<TractorEngineOil[]>([]);
  const [loadingShared, setLoadingShared] = useState(true);

  useEffect(() => {
    if (!tractorId) return;
    fetchTractor();
    fetchUsage();
    fetchEngineOil();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tractorId]);

  const fetchTractor = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("tractors").select("*").eq("id", tractorId).single();
    if (!error && data) setTractor(data);
    setLoading(false);
  };

  const fetchUsage = async () => {
    setLoadingShared(true);
    const { data } = await supabase.from("tractor_usage").select("*").eq("tractor_id", tractorId).order("date", { ascending: true });
    if (data) setUsage(data);
    setLoadingShared(false);
  };
  const fetchEngineOil = async () => {
    const { data } = await supabase.from("tractor_engine_oil").select("*").eq("tractor_id", tractorId).order("date", { ascending: false });
    if (data) setEngineOil(data);
  };

  const oilChangeInterval = tractor?.oil_change_interval_hours ? Number(tractor.oil_change_interval_hours) : DEFAULT_OIL_CHANGE_INTERVAL;
  const totalHours = usage.reduce((s, u) => s + Number(u.duration_hours), 0);
  const hoursAtLastOilChange = engineOil[0] ? Number(engineOil[0].hours_at_service) : 0;
  const hoursSinceOilChange = totalHours - hoursAtLastOilChange;
  const hoursRemaining = oilChangeInterval - hoursSinceOilChange;

  const oilStatus: "safe" | "warning" | "danger" = hoursRemaining < 20 ? "danger" : hoursRemaining <= 50 ? "warning" : "safe";
  const oilBannerColor =
    oilStatus === "danger" ? "bg-red-50 border-red-200 text-red-700" : oilStatus === "warning" ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-green-50 border-green-200 text-green-700";

  const insuranceDaysLeft = daysUntil(tractor?.insurance_expiry);

  if (loading) {
    return (
      <div className="flex h-screen overflow-hidden bg-page">
        <Sidebar lang={lang} setLang={setLang} />
        <main className="flex-1 p-4 flex flex-col gap-3">
          <div className="h-12 bg-gray-200 rounded-xl animate-pulse" />
          <div className="h-64 bg-gray-200 rounded-2xl animate-pulse" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <Sidebar lang={lang} setLang={setLang} />

      <main className="flex-1 overflow-y-auto p-3 sm:p-6">
        <div className="max-w-5xl mx-auto flex flex-col gap-3">
          <Link href="/machinery/tractor" className="text-primary hover:text-primary text-sm font-semibold">
            ← {L("Back to Tractors", "டிராக்டர்களுக்கு திரும்பு")}
          </Link>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <h1 className="text-xl font-bold text-primary">🚜 {tractor?.name}</h1>
            <button
              onClick={() => setLang(lang === "ta" ? "en" : "ta")}
              className="px-3 py-1.5 rounded-lg border border-primary/40 text-primary text-sm font-medium hover:bg-green-50 transition"
            >
              {lang === "ta" ? "English" : "தமிழ்"}
            </button>
          </div>

          {insuranceDaysLeft !== null && insuranceDaysLeft < 30 && (
            <div className={`flex flex-col sm:flex-row items-start sm:items-center gap-2 rounded-xl border-2 p-3 text-sm font-semibold ${insuranceDaysLeft < 0 ? "bg-red-50 border-red-200 text-red-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
              ⚠️{" "}
              {insuranceDaysLeft < 0
                ? L("Insurance has expired!", "காப்பீடு காலாவதியானது!")
                : L(`Insurance expires in ${insuranceDaysLeft} days`, `காப்பீடு ${insuranceDaysLeft} நாட்களில் காலாவதியாகும்`)}
            </div>
          )}

          <div className="flex gap-1 bg-white rounded-xl shadow-sm p-1 max-w-full overflow-x-auto">
            {([
              ["overview", L("Overview", "மேலோட்டம்")],
              ["diesel", L("Diesel", "டீசல்")],
              ["usage", L("Usage Hours", "பயன்பாட்டு நேரம்")],
              ["engineOil", L("Engine Oil", "எஞ்சின் ஆயில்")],
              ["maintenance", L("Maintenance", "பராமரிப்பு")],
              ["photos", L("Photos", "புகைப்படங்கள்")],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                  activeTab === key ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
          {activeTab === "overview" && tractor && (
            <OverviewTab
              L={L}
              tractor={tractor}
              refetch={fetchTractor}
              router={router}
              totalHours={totalHours}
              hoursRemaining={hoursRemaining}
              oilStatus={oilStatus}
            />
          )}

          {activeTab === "diesel" && <DieselTab L={L} tractorId={tractorId} />}

          {activeTab === "usage" && (
            <UsageTab
              L={L}
              tractorId={tractorId}
              usage={usage}
              totalHours={totalHours}
              hoursRemaining={hoursRemaining}
              oilBannerColor={oilBannerColor}
              refetch={fetchUsage}
            />
          )}

          {activeTab === "engineOil" && (
            <EngineOilTab
              L={L}
              tractorId={tractorId}
              totalHours={totalHours}
              hoursSinceOilChange={hoursSinceOilChange}
              hoursRemaining={hoursRemaining}
              oilStatus={oilStatus}
              oilBannerColor={oilBannerColor}
              engineOil={engineOil}
              loadingShared={loadingShared}
              refetch={fetchEngineOil}
            />
          )}

          {activeTab === "maintenance" && <MaintenanceTab lang={lang} tractorId={tractorId} />}

          {activeTab === "photos" && <PhotosTab L={L} tractorId={tractorId} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

// ==================== OVERVIEW TAB ====================
function OverviewTab({
  L,
  tractor,
  refetch,
  router,
  totalHours,
  hoursRemaining,
  oilStatus,
}: {
  L: (en: string, ta: string) => string;
  tractor: Tractor;
  refetch: () => void;
  router: ReturnType<typeof useRouter>;
  totalHours: number;
  hoursRemaining: number;
  oilStatus: "safe" | "warning" | "danger";
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { isOpen: deleteOpen, confirmDelete, handleConfirm: handleDeleteConfirm, handleCancel: handleDeleteCancel } = useDeleteConfirm();

  const startEdit = () => {
    setForm({
      name: tractor.name,
      brand: tractor.brand ?? "",
      model: tractor.model ?? "",
      year: tractor.year_of_purchase != null ? String(tractor.year_of_purchase) : "",
      price: tractor.purchase_price != null ? String(tractor.purchase_price) : "",
      regNumber: tractor.registration_number ?? "",
      engineNumber: tractor.engine_number ?? "",
      chassisNumber: tractor.chassis_number ?? "",
      insuranceNumber: tractor.insurance_number ?? "",
      insuranceExpiry: tractor.insurance_expiry ?? "",
      oilInterval: String(tractor.oil_change_interval_hours ?? DEFAULT_OIL_CHANGE_INTERVAL),
      notes: tractor.notes ?? "",
    });
    setEditing(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error(L("Tractor name is required.", "டிராக்டர் பெயர் தேவை."));
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("tractors")
        .update({
          name: form.name.trim(),
          brand: form.brand || null,
          model: form.model.trim() || null,
          year_of_purchase: form.year ? parseInt(form.year, 10) : null,
          purchase_price: form.price ? parseFloat(form.price) : null,
          registration_number: form.regNumber.trim() || null,
          engine_number: form.engineNumber.trim() || null,
          chassis_number: form.chassisNumber.trim() || null,
          insurance_number: form.insuranceNumber.trim() || null,
          insurance_expiry: form.insuranceExpiry || null,
          oil_change_interval_hours: form.oilInterval ? parseFloat(form.oilInterval) : DEFAULT_OIL_CHANGE_INTERVAL,
          notes: form.notes.trim() || null,
        })
        .eq("id", tractor.id);
      if (error) {
        console.error("Error saving tractor:", error);
        toast.error(L("Could not save. Please try again.", "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
      } else {
        setEditing(false);
        refetch();
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error(L("Could not save. Please try again.", "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
    }
    setSaving(false);
  };

  const handleDelete = () => {
    confirmDelete(async () => {
      const { error } = await supabase.from("tractors").update({ is_active: false }).eq("id", tractor.id);
      if (error) {
        toast.error(L("Could not delete", "நீக்க முடியவில்லை"));
      } else {
        toast.success(L("Deleted successfully!", "நீக்கப்பட்டது!"));
        await ActivityLog.deleted("Tractor", `Tractor deleted: ${tractor.name}`);
        router.push("/machinery/tractor");
      }
    });
  };

  const oilBannerBg =
    oilStatus === "danger"
      ? "bg-red-50 dark:bg-red-900/20 border border-red-200"
      : oilStatus === "warning"
      ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200"
      : "bg-green-50 dark:bg-green-900/20 border border-green-200";

  return (
    <div className="flex flex-col gap-3">
      <div className={`rounded-xl p-4 ${oilBannerBg}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">{oilStatus === "danger" ? "🚨" : oilStatus === "warning" ? "⚠️" : "✅"}</span>
          <p className="text-sm font-medium">{L("Engine Oil Status", "இயந்திர எண்ணெய் நிலை")}</p>
        </div>
        <p className="text-sm">{L("Total Hours", "மொத்த மணி நேரம்")}: {totalHours.toFixed(1)} {L("hrs", "மணி")}</p>
        <p className="text-sm">{L("Hours Remaining", "மீதமுள்ள மணி நேரம்")}: {Math.max(hoursRemaining, 0).toFixed(1)} {L("hrs", "மணி")}</p>
      </div>

    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-800">{L("Details", "விவரங்கள்")}</h2>
        {!editing && (
          <button onClick={startEdit} className="text-sm font-medium text-primary hover:text-primary/80">
            ✏️ {L("Edit", "திருத்து")}
          </button>
        )}
      </div>

      {!editing ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div><span className="text-xs text-gray-500">{L("Brand", "பிராண்ட்")}:</span> <span className="font-medium text-gray-800">{tractor.brand || "—"}</span></div>
          <div><span className="text-xs text-gray-500">{L("Model", "மாடல்")}:</span> <span className="font-medium text-gray-800">{tractor.model || "—"}</span></div>
          <div><span className="text-xs text-gray-500">{L("Year of Purchase", "வாங்கிய ஆண்டு")}:</span> <span className="font-medium text-gray-800">{tractor.year_of_purchase ?? "—"}</span></div>
          <div><span className="text-xs text-gray-500">{L("Purchase Price (₹)", "வாங்கிய விலை (₹)")}:</span> <span className="font-medium text-gray-800">{tractor.purchase_price != null ? inr(Number(tractor.purchase_price)) : "—"}</span></div>
          <div><span className="text-xs text-gray-500">{L("Registration Number", "பதிவு எண்")}:</span> <span className="font-medium text-gray-800">{tractor.registration_number || "—"}</span></div>
          <div><span className="text-xs text-gray-500">{L("Engine Number", "இயந்திர எண்")}:</span> <span className="font-medium text-gray-800">{tractor.engine_number || "—"}</span></div>
          <div><span className="text-xs text-gray-500">{L("Chassis Number", "சேஸி எண்")}:</span> <span className="font-medium text-gray-800">{tractor.chassis_number || "—"}</span></div>
          <div><span className="text-xs text-gray-500">{L("Insurance Number", "காப்பீடு எண்")}:</span> <span className="font-medium text-gray-800">{tractor.insurance_number || "—"}</span></div>
          <div><span className="text-xs text-gray-500">{L("Insurance Expiry", "காப்பீடு முடிவு தேதி")}:</span> <span className="font-medium text-gray-800">{formatDMY(tractor.insurance_expiry)}</span></div>
          <div><span className="text-xs text-gray-500">{L("Oil Change Interval (Hours)", "எண்ணெய் மாற்று இடைவெளி (மணி நேரம்)")}:</span> <span className="text-sm font-semibold text-gray-800">{tractor.oil_change_interval_hours}</span></div>
          <div className="sm:col-span-2"><span className="text-xs text-gray-500">{L("Notes", "குறிப்புகள்")}:</span> <span className="font-medium text-gray-800">{tractor.notes || "—"}</span></div>
          <div className="sm:col-span-2 pt-3 border-t border-gray-100">
            <button onClick={handleDelete} className="bg-red-50 hover:bg-red-100 text-red-600 rounded-lg px-4 py-2 text-sm font-medium transition">
              🗑️ {L("Delete Tractor", "டிராக்டரை நீக்கு")}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{L("Tractor Name", "டிராக்டர் பெயர்")} *</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{L("Brand", "பிராண்ட்")}</label>
            <select value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className={inputCls}>
              <option value="">{L("Select Brand", "பிராண்ட் தேர்வு")}</option>
              {BRANDS.map((b) => (
                <option key={b} value={b}>{b === "Other" ? L("Other", "மற்றவை") : b}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{L("Model", "மாடல்")}</label>
            <input type="text" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{L("Year of Purchase", "வாங்கிய ஆண்டு")}</label>
            <input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{L("Purchase Price (₹)", "வாங்கிய விலை (₹)")}</label>
            <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{L("Registration Number", "பதிவு எண்")}</label>
            <input type="text" value={form.regNumber} onChange={(e) => setForm({ ...form, regNumber: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{L("Engine Number", "இயந்திர எண்")}</label>
            <input type="text" value={form.engineNumber} onChange={(e) => setForm({ ...form, engineNumber: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{L("Chassis Number", "சேஸி எண்")}</label>
            <input type="text" value={form.chassisNumber} onChange={(e) => setForm({ ...form, chassisNumber: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{L("Insurance Number", "காப்பீடு எண்")}</label>
            <input type="text" value={form.insuranceNumber} onChange={(e) => setForm({ ...form, insuranceNumber: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{L("Insurance Expiry", "காப்பீடு முடிவு தேதி")}</label>
            <input type="date" value={form.insuranceExpiry} onChange={(e) => setForm({ ...form, insuranceExpiry: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{L("Oil Change Interval (Hours)", "எண்ணெய் மாற்று இடைவெளி (மணி நேரம்)")}</label>
            <input type="number" value={form.oilInterval} onChange={(e) => setForm({ ...form, oilInterval: e.target.value })} className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>{L("Notes", "குறிப்புகள்")}</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} rows={2} />
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <button onClick={save} disabled={saving} className="w-full sm:w-auto bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-2 text-sm font-medium transition">
              {saving ? "..." : L("Save", "சேமி")}
            </button>
            <button onClick={() => setEditing(false)} className="w-full sm:w-auto bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium transition">
              {L("Cancel", "ரத்து")}
            </button>
          </div>
        </div>
      )}
    </div>
    <DeleteConfirmDialog isOpen={deleteOpen} onConfirm={handleDeleteConfirm} onCancel={handleDeleteCancel} language={L("en", "ta")} />
    </div>
  );
}

// ==================== DIESEL TAB ====================
function DieselTab({ L, tractorId }: { L: (en: string, ta: string) => string; tractorId: string }) {
  const [records, setRecords] = useState<TractorDiesel[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [litres, setLitres] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const { isOpen: deleteOpen, confirmDelete, handleConfirm: handleDeleteConfirm, handleCancel: handleDeleteCancel } = useDeleteConfirm();

  useEffect(() => {
    fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tractorId]);

  const fetchRecords = async () => {
    setLoading(true);
    const { data } = await supabase.from("tractor_diesel").select("*").eq("tractor_id", tractorId).order("date", { ascending: false });
    if (data) setRecords(data);
    setLoading(false);
  };

  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthRecords = records.filter((r) => r.date.startsWith(monthPrefix));
  const monthLitres = monthRecords.reduce((s, r) => s + Number(r.litres), 0);
  const monthAmount = monthRecords.reduce((s, r) => s + Number(r.amount), 0);

  const openAdd = () => {
    setEditingId(null);
    setDate("");
    setLitres("");
    setAmount("");
    setNotes("");
    setModalOpen(true);
  };
  const openEdit = (r: TractorDiesel) => {
    setEditingId(r.id);
    setDate(r.date);
    setLitres(String(r.litres));
    setAmount(String(r.amount));
    setNotes(r.notes ?? "");
    setModalOpen(true);
  };

  const save = async () => {
    if (!date || !litres || !amount) {
      toast.error(L("Date, litres, and amount are required.", "தேதி, லிட்டர் மற்றும் தொகை தேவை."));
      return;
    }
    if (isFutureDate(date)) {
      toast.error(L(getValidationMessage("future_date", "en"), getValidationMessage("future_date", "ta")));
      return;
    }
    const litresVal = parseFloat(litres);
    if (!litresVal || litresVal <= 0) {
      toast.error(L(getValidationMessage("min_litres", "en"), getValidationMessage("min_litres", "ta")));
      return;
    }
    if (Number(amount) < 0) {
      toast.error(L(getValidationMessage("negative", "en"), getValidationMessage("negative", "ta")));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tractor_id: tractorId,
        date: date || null,
        litres: parseFloat(litres) || null,
        amount: parseFloat(amount) || null,
        notes: notes.trim() || null,
      };
      const { error } = editingId
        ? await supabase.from("tractor_diesel").update(payload).eq("id", editingId)
        : await supabase.from("tractor_diesel").insert(payload);
      if (error) {
        console.error("Error saving diesel:", error);
        toast.error(L("Could not save. Please try again.", "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
      } else {
        if (!editingId) {
          await ActivityLog.added("Tractor Diesel", `Diesel: ${litres}L - ₹${amount}`);
        }
        setModalOpen(false);
        fetchRecords();
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error(L("Could not save. Please try again.", "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
    }
    setSaving(false);
  };

  const remove = (id: string) => {
    confirmDelete(async () => {
      const { error } = await supabase.from("tractor_diesel").delete().eq("id", id);
      if (!error) fetchRecords();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-white rounded-xl shadow-sm p-3 flex gap-4 flex-wrap">
        <div>
          <p className="text-xs text-gray-500">{L("Total Diesel This Month", "இந்த மாத மொத்த டீசல்")}</p>
          <p className="text-lg font-bold text-gray-900">{monthLitres.toFixed(1)} L</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">&nbsp;</p>
          <p className="text-lg font-bold text-danger">{inr(monthAmount)}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-800">⛽ {L("Diesel Records", "டீசல் பதிவுகள்")}</h2>
          <button onClick={openAdd} className="bg-primary hover:bg-primary/90 text-white rounded-lg px-3 py-1.5 text-sm font-medium transition">
            + {L("Add Diesel", "டீசல் சேர்க்க")}
          </button>
        </div>
        {loading ? (
          <div className="h-16 bg-gray-200 rounded-lg animate-pulse" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 uppercase text-xs font-medium tracking-wide border-b">
                  <th className="py-1 px-1">{L("Date", "தேதி")}</th>
                  <th className="py-1 px-1">{L("Litres", "லிட்டர்")}</th>
                  <th className="py-1 px-1">{L("Amount", "தொகை")}</th>
                  <th className="py-1 px-1">{L("Notes", "குறிப்பு")}</th>
                  <th className="py-1 px-1"></th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-6 text-gray-500">⛽ {L("No diesel records yet", "டீசல் பதிவுகள் இல்லை")}</td></tr>
                ) : (
                  records.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50">
                      <td className="py-1 px-1 text-gray-900">{formatDMY(r.date)}</td>
                      <td className="py-1 px-1 text-gray-900">{Number(r.litres).toFixed(1)} L</td>
                      <td className="py-1 px-1 text-danger font-semibold">{inr(Number(r.amount))}</td>
                      <td className="py-1 px-1 text-gray-600">{r.notes || "—"}</td>
                      <td className="py-1 px-1 whitespace-nowrap">
                        <button onClick={() => openEdit(r)} className="mr-2 hover:text-primary">✏️</button>
                        <button onClick={() => remove(r.id)} className="hover:text-danger">🗑️</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-0">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-primary">{editingId ? L("Edit Diesel", "டீசலைத் திருத்து") : L("Add Diesel", "டீசல் சேர்க்க")}</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{L("Date", "தேதி")} *</label>
                <input
                  type="date"
                  max={new Date().toISOString().split("T")[0]}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{L("Litres", "லிட்டர்")} *</label>
                <input
                  type="number"
                  min="0"
                  onKeyDown={(e) => { if (e.key === "-") e.preventDefault(); }}
                  value={litres}
                  onChange={(e) => setLitres(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{L("Amount (₹)", "தொகை (₹)")} *</label>
                <input
                  type="number"
                  min="0"
                  onKeyDown={(e) => { if (e.key === "-") e.preventDefault(); }}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{L("Notes", "குறிப்பு")}</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} rows={2} />
              </div>
              <div className="flex gap-2">
                <button onClick={save} disabled={saving} className="flex-1 bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg py-2 text-sm font-medium transition">
                  {saving ? "..." : L("Save", "சேமி")}
                </button>
                <button onClick={() => setModalOpen(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg py-2 text-sm font-medium transition">
                  {L("Cancel", "ரத்து")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <DeleteConfirmDialog isOpen={deleteOpen} onConfirm={handleDeleteConfirm} onCancel={handleDeleteCancel} language={L("en", "ta")} />
    </div>
  );
}

// ==================== USAGE HOURS TAB ====================
function UsageTab({
  L,
  tractorId,
  usage,
  totalHours,
  hoursRemaining,
  oilBannerColor,
  refetch,
}: {
  L: (en: string, ta: string) => string;
  tractorId: string;
  usage: TractorUsage[];
  totalHours: number;
  hoursRemaining: number;
  oilBannerColor: string;
  refetch: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const { isOpen: deleteOpen, confirmDelete, handleConfirm: handleDeleteConfirm, handleCancel: handleDeleteCancel } = useDeleteConfirm();

  const durationHoursRaw = startTime && endTime ? computeDurationHours(startTime, endTime) : 0;
  const durationValid = durationHoursRaw > 0;
  const durationHrs = Math.floor(durationHoursRaw);
  const durationMins = Math.round((durationHoursRaw - durationHrs) * 60);

  const openAdd = () => {
    setEditingId(null);
    setDate("");
    setStartTime("");
    setEndTime("");
    setPurpose("");
    setNotes("");
    setModalOpen(true);
  };
  const openEdit = (u: TractorUsage) => {
    setEditingId(u.id);
    setDate(u.date);
    setStartTime(u.start_time);
    setEndTime(u.end_time);
    setPurpose(u.purpose ?? "");
    setNotes(u.notes ?? "");
    setModalOpen(true);
  };

  const save = async () => {
    if (!date || !startTime || !endTime) {
      toast.error(L("Date, start time, and end time are required.", "தேதி, தொடக்க நேரம் மற்றும் முடிவு நேரம் தேவை."));
      return;
    }
    if (isFutureDate(date)) {
      toast.error(L(getValidationMessage("future_date", "en"), getValidationMessage("future_date", "ta")));
      return;
    }
    const start = new Date(`2000-01-01T${startTime}`);
    const end = new Date(`2000-01-01T${endTime}`);
    if (end <= start) {
      toast.error(L("End time must be after start time.", "முடிவு நேரம் தொடக்க நேரத்திற்குப் பிறகு இருக்க வேண்டும்."));
      return;
    }
    const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    if (durationHours > 24) {
      toast.error(L("Duration cannot exceed 24 hours in one entry.", "ஒரு பதிவில் கால அளவு 24 மணி நேரத்தை தாண்டக்கூடாது."));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tractor_id: tractorId,
        date: date || null,
        start_time: startTime,
        end_time: endTime,
        duration_hours: durationHours,
        purpose: purpose.trim() || null,
        notes: notes || null,
      };
      const { error } = editingId
        ? await supabase.from("tractor_usage").update(payload).eq("id", editingId)
        : await supabase.from("tractor_usage").insert(payload);
      if (error) {
        console.error("Error saving usage:", error);
        toast.error(L("Could not save. Please try again.", "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
      } else {
        if (!editingId) {
          await ActivityLog.added("Tractor Usage", `Usage: ${durationHours.toFixed(2)} hours`);
        }
        setModalOpen(false);
        refetch();
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error(L("Could not save. Please try again.", "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
    }
    setSaving(false);
  };

  const remove = (id: string) => {
    confirmDelete(async () => {
      const { error } = await supabase.from("tractor_usage").delete().eq("id", id);
      if (!error) refetch();
    });
  };

  // usage is sorted ascending by date from parent; compute cumulative hours
  const withCumulative = usage.reduce<{ row: TractorUsage; cumulative: number }[]>((acc, row) => {
    const prevCum = acc.length ? acc[acc.length - 1].cumulative : 0;
    acc.push({ row, cumulative: prevCum + Number(row.duration_hours) });
    return acc;
  }, []);
  const displayRows = [...withCumulative].reverse();

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">
        <p className="text-xs text-gray-500">{L("Total Operating Hours", "மொத்த இயக்க நேரம்")}</p>
        <p className="text-xl font-bold text-primary">{totalHours.toFixed(2)} {L("hrs", "மணி")}</p>
      </div>

      <div className={`rounded-xl border-2 p-3 text-sm font-medium ${oilBannerColor}`}>
        {hoursRemaining < 20
          ? `⚠️ ${L(`Only ${Math.max(hoursRemaining, 0).toFixed(1)} hours remaining for engine oil change!`, `எஞ்சின் ஆயில் மாற்ற ${Math.max(hoursRemaining, 0).toFixed(1)} மணி நேரம் மட்டுமே உள்ளது!`)}`
          : `${L("Hours remaining until next oil change", "அடுத்த ஆயில் மாற்றத்திற்கு மீதமுள்ள நேரம்")}: ${Math.max(hoursRemaining, 0).toFixed(1)}`}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-800">{L("Usage History", "பயன்பாட்டு வரலாறு")}</h2>
          <button onClick={openAdd} className="bg-primary hover:bg-primary/90 text-white rounded-lg px-3 py-1.5 text-sm font-medium transition">
            + {L("Add Usage Entry", "பயன்பாடு சேர்க்க")}
          </button>
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50">
              <tr className="text-left text-gray-500 uppercase text-xs font-medium tracking-wide border-b">
                <th className="py-1 px-1">{L("Date", "தேதி")}</th>
                <th className="py-1 px-1">{L("Start", "தொடக்கம்")}</th>
                <th className="py-1 px-1">{L("End", "முடிவு")}</th>
                <th className="py-1 px-1">{L("Duration", "கால அளவு")}</th>
                <th className="py-1 px-1">{L("Cumulative Hours", "மொத்த நேரம்")}</th>
                <th className="py-1 px-1">{L("Notes", "குறிப்பு")}</th>
                <th className="py-1 px-1"></th>
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-6 text-gray-500">🚜 {L("No usage entries yet", "பயன்பாட்டு பதிவுகள் இல்லை")}</td></tr>
              ) : (
                displayRows.map(({ row, cumulative }) => (
                  <tr key={row.id} className="border-b border-gray-50">
                    <td className="py-1 px-1 text-gray-900">{formatDMY(row.date)}</td>
                    <td className="py-1 px-1 text-gray-900">{row.start_time}</td>
                    <td className="py-1 px-1 text-gray-900">{row.end_time}</td>
                    <td className="py-1 px-1 text-gray-900">{Number(row.duration_hours).toFixed(2)} {L("hrs", "மணி")}</td>
                    <td className="py-1 px-1 font-semibold text-primary">{cumulative.toFixed(2)}</td>
                    <td className="py-1 px-1 text-gray-600">{row.notes || "—"}</td>
                    <td className="py-1 px-1 whitespace-nowrap">
                      <button onClick={() => openEdit(row)} className="mr-2 hover:text-primary">✏️</button>
                      <button onClick={() => remove(row.id)} className="hover:text-danger">🗑️</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-0">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-primary">{editingId ? L("Edit Usage Entry", "பயன்பாட்டைத் திருத்து") : L("Add Usage Entry", "பயன்பாடு சேர்க்க")}</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{L("Date", "தேதி")} *</label>
                <input
                  type="date"
                  max={new Date().toISOString().split("T")[0]}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{L("Start Time", "தொடக்க நேரம்")} *</label>
                  <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{L("End Time", "முடிவு நேரம்")} *</label>
                  <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} />
                </div>
              </div>
              {startTime && endTime && (
                <p className={`text-xs font-semibold ${durationValid ? "text-success" : "text-danger"}`}>
                  {durationValid
                    ? `${L("Duration", "கால அளவு")}: ${durationHrs} ${L("hrs", "மணி")} ${durationMins} ${L("mins", "நிமிடம்")}`
                    : L("End time must be after start time.", "முடிவு நேரம் தொடக்க நேரத்திற்குப் பிறகு இருக்க வேண்டும்.")}
                </p>
              )}
              <div>
                <label className={labelCls}>{L("Purpose", "நோக்கம்")}</label>
                <input type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)} className={inputCls} placeholder={L("e.g. Ploughing, Transport", "எ.கா. உழவு, போக்குவரத்து")} />
              </div>
              <div>
                <label className={labelCls}>{L("Notes", "குறிப்பு")}</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} rows={2} />
              </div>
              <div className="flex gap-2">
                <button onClick={save} disabled={saving} className="flex-1 bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg py-2 text-sm font-medium transition">
                  {saving ? "..." : L("Save", "சேமி")}
                </button>
                <button onClick={() => setModalOpen(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg py-2 text-sm font-medium transition">
                  {L("Cancel", "ரத்து")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <DeleteConfirmDialog isOpen={deleteOpen} onConfirm={handleDeleteConfirm} onCancel={handleDeleteCancel} language={L("en", "ta")} />
    </div>
  );
}

// ==================== ENGINE OIL TAB (own tab now — counter reset logic) ====================
function EngineOilTab({
  L,
  tractorId,
  totalHours,
  hoursSinceOilChange,
  hoursRemaining,
  oilStatus,
  oilBannerColor,
  engineOil,
  loadingShared,
  refetch,
}: {
  L: (en: string, ta: string) => string;
  tractorId: string;
  totalHours: number;
  hoursSinceOilChange: number;
  hoursRemaining: number;
  oilStatus: "safe" | "warning" | "danger";
  oilBannerColor: string;
  engineOil: TractorEngineOil[];
  loadingShared: boolean;
  refetch: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [oilBrand, setOilBrand] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const { isOpen: deleteOpen, confirmDelete, handleConfirm: handleDeleteConfirm, handleCancel: handleDeleteCancel } = useDeleteConfirm();
  const [existingHours, setExistingHours] = useState<number | null>(null);

  const totalSpent = engineOil.reduce((s, r) => s + Number(r.amount), 0);

  const openAdd = () => {
    setEditingId(null);
    setDate("");
    setOilBrand("");
    setAmount("");
    setNotes("");
    setExistingHours(null);
    setModalOpen(true);
  };
  const openEdit = (r: TractorEngineOil) => {
    setEditingId(r.id);
    setDate(r.date);
    setOilBrand(r.oil_brand ?? "");
    setAmount(String(r.amount));
    setNotes(r.notes ?? "");
    setExistingHours(Number(r.hours_at_service));
    setModalOpen(true);
  };

  const save = async () => {
    if (!date || !amount) {
      toast.error(L("Date and amount are required.", "தேதி மற்றும் தொகை தேவை."));
      return;
    }
    if (isFutureDate(date)) {
      toast.error(L(getValidationMessage("future_date", "en"), getValidationMessage("future_date", "ta")));
      return;
    }
    if (Number(amount) < 0) {
      toast.error(L(getValidationMessage("negative", "en"), getValidationMessage("negative", "ta")));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tractor_id: tractorId,
        date: date || null,
        oil_brand: oilBrand.trim() || null,
        amount: parseFloat(amount) || null,
        hours_at_service: editingId && existingHours != null ? existingHours : totalHours,
        notes: notes.trim() || null,
      };
      const { error } = editingId
        ? await supabase.from("tractor_engine_oil").update(payload).eq("id", editingId)
        : await supabase.from("tractor_engine_oil").insert(payload);
      if (error) {
        console.error("Error saving engine oil:", error);
        toast.error(L("Could not save. Please try again.", "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
      } else {
        if (!editingId) {
          await ActivityLog.added("Tractor Oil", `Oil changed at ${payload.hours_at_service.toFixed(1)} hours`);
        }
        setModalOpen(false);
        refetch();
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error(L("Could not save. Please try again.", "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
    }
    setSaving(false);
  };

  const remove = (id: string) => {
    confirmDelete(async () => {
      const { error } = await supabase.from("tractor_engine_oil").delete().eq("id", id);
      if (!error) refetch();
    });
  };

  if (loadingShared) {
    return <div className="h-40 bg-gray-200 rounded-2xl animate-pulse" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={`rounded-2xl border-2 p-4 ${oilBannerColor}`}>
        <p className="text-sm font-medium">{L("Hours Since Last Oil Change", "கடைசி ஆயில் மாற்றத்திலிருந்து")}: <span className="font-bold">{Math.max(hoursSinceOilChange, 0).toFixed(1)}</span></p>
        <p className="text-sm font-medium">
          {L("Hours Remaining Until Next Oil Change", "அடுத்த ஆயில் மாற்றத்திற்கு மீதமுள்ள நேரம்")}:{" "}
          <span className={`font-bold ${oilStatus === "danger" ? "text-red-600" : oilStatus === "warning" ? "text-amber-500" : "text-green-600"}`}>
            {Math.max(hoursRemaining, 0).toFixed(1)}
          </span>
        </p>
        {oilStatus === "danger" && (
          <div className="mt-2 bg-red-50 border border-red-200 text-red-700 rounded-lg p-2">
            <p className="text-sm font-bold">
              ⚠️ {L(
                `Only ${Math.max(hoursRemaining, 0).toFixed(1)} hours remaining! Engine oil change needed soon.`,
                `${Math.max(hoursRemaining, 0).toFixed(1)} மணி நேரம் மட்டுமே உள்ளது! எஞ்சின் ஆயில் மாற்றம் தேவை.`
              )}
            </p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-800">🛢️ {L("Engine Oil Change", "எஞ்சின் ஆயில் மாற்றம்")}</h2>
          <button onClick={openAdd} className="bg-primary hover:bg-primary/90 text-white rounded-lg px-3 py-1.5 text-sm font-medium transition">
            + {L("Add", "சேர்க்க")}
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-2">{L("Total Spent", "மொத்த செலவு")}: <span className="font-semibold text-danger">{inr(totalSpent)}</span></p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 uppercase text-xs font-medium tracking-wide border-b">
                <th className="py-1 px-1">{L("Date", "தேதி")}</th>
                <th className="py-1 px-1">{L("Brand", "பிராண்ட்")}</th>
                <th className="py-1 px-1">{L("Amount", "தொகை")}</th>
                <th className="py-1 px-1">{L("Hours at Service", "சேவை நேரம்")}</th>
                <th className="py-1 px-1"></th>
              </tr>
            </thead>
            <tbody>
              {engineOil.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-6 text-gray-500">🛢️ {L("No records yet", "பதிவுகள் இல்லை")}</td></tr>
              ) : (
                engineOil.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="py-1 px-1 text-gray-900">{formatDMY(r.date)}</td>
                    <td className="py-1 px-1 text-gray-900">{r.oil_brand || "—"}</td>
                    <td className="py-1 px-1 text-danger font-semibold">{inr(Number(r.amount))}</td>
                    <td className="py-1 px-1 text-gray-900">{Number(r.hours_at_service).toFixed(1)}</td>
                    <td className="py-1 px-1 whitespace-nowrap">
                      <button onClick={() => openEdit(r)} className="mr-2 hover:text-primary">✏️</button>
                      <button onClick={() => remove(r.id)} className="hover:text-danger">🗑️</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-0">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-primary">{editingId ? L("Edit Engine Oil Change", "திருத்து") : L("Add Engine Oil Change", "எஞ்சின் ஆயில் சேர்க்க")}</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{L("Date", "தேதி")} *</label>
                <input
                  type="date"
                  max={new Date().toISOString().split("T")[0]}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{L("Oil Brand", "ஆயில் பிராண்ட்")}</label>
                <input type="text" value={oilBrand} onChange={(e) => setOilBrand(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{L("Amount (₹)", "தொகை (₹)")} *</label>
                <input
                  type="number"
                  min="0"
                  onKeyDown={(e) => { if (e.key === "-") e.preventDefault(); }}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{L("Notes", "குறிப்பு")}</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} rows={2} />
              </div>
              {!editingId && (
                <p className="text-xs text-gray-500">
                  {L(`This will record ${totalHours.toFixed(1)} hrs as the service point and reset the oil change counter.`, `இது ${totalHours.toFixed(1)} மணி நேரத்தை சேவை புள்ளியாக பதிவு செய்து கவுண்டரை மீட்டமைக்கும்.`)}
                </p>
              )}
              <div className="flex gap-2">
                <button onClick={save} disabled={saving} className="flex-1 bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg py-2 text-sm font-medium transition">
                  {saving ? "..." : L("Save", "சேமி")}
                </button>
                <button onClick={() => setModalOpen(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg py-2 text-sm font-medium transition">
                  {L("Cancel", "ரத்து")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <DeleteConfirmDialog isOpen={deleteOpen} onConfirm={handleDeleteConfirm} onCancel={handleDeleteCancel} language={L("en", "ta")} />
    </div>
  );
}

// ==================== MAINTENANCE TAB ====================
function MaintenanceTab({ lang, tractorId }: { lang: "ta" | "en"; tractorId: string }) {
  return (
    <div className="flex flex-col gap-3">
      <MachineryRecordSection
        lang={lang}
        table="tractor_gear_oil"
        titleEn="Gear Oil Change"
        titleTa="கியர் ஆயில் மாற்றம்"
        icon="🛢️"
        dateField="date"
        filterColumn="tractor_id"
        filterValue={tractorId}
        collapsible={true}
        defaultOpen={false}
        fields={[
          { key: "date", en: "Date", ta: "தேதி", type: "date", required: true },
          { key: "amount", en: "Cost (₹)", ta: "செலவு (₹)", type: "number", required: true, isCost: true },
        ]}
      />
      <MachineryRecordSection
        lang={lang}
        table="tractor_hydraulic_oil"
        titleEn="Hydraulic Oil Change"
        titleTa="ஹைட்ராலிக் ஆயில் மாற்றம்"
        icon="🛢️"
        dateField="date"
        filterColumn="tractor_id"
        filterValue={tractorId}
        collapsible={true}
        defaultOpen={false}
        fields={[
          { key: "date", en: "Date", ta: "தேதி", type: "date", required: true },
          { key: "amount", en: "Cost (₹)", ta: "செலவு (₹)", type: "number", required: true, isCost: true },
        ]}
      />
      <MachineryRecordSection
        lang={lang}
        table="tractor_battery"
        titleEn="Battery Replacement"
        titleTa="பேட்டரி மாற்றம்"
        icon="🔋"
        dateField="date"
        showLastDate
        filterColumn="tractor_id"
        filterValue={tractorId}
        collapsible={true}
        defaultOpen={false}
        fields={[
          { key: "date", en: "Date", ta: "தேதி", type: "date", required: true },
          { key: "brand", en: "Battery Brand/Model", ta: "பேட்டரி பிராண்ட்/மாடல்", type: "text" },
          { key: "amount", en: "Cost (₹)", ta: "செலவு (₹)", type: "number", required: true, isCost: true },
        ]}
      />
      <MachineryRecordSection
        lang={lang}
        table="tractor_tyre"
        titleEn="Tyre Replacement"
        titleTa="டயர் மாற்றம்"
        icon="🛞"
        dateField="date"
        filterColumn="tractor_id"
        filterValue={tractorId}
        collapsible={true}
        defaultOpen={false}
        fields={[
          { key: "date", en: "Date", ta: "தேதி", type: "date", required: true },
          { key: "tyre_type", en: "Tyre Type", ta: "டயர் வகை", type: "text" },
          { key: "quantity", en: "Quantity", ta: "எண்ணிக்கை", type: "number" },
          { key: "amount", en: "Cost (₹)", ta: "செலவு (₹)", type: "number", required: true, isCost: true },
        ]}
      />
      <MachineryRecordSection
        lang={lang}
        table="tractor_repairs"
        titleEn="Miscellaneous Repairs"
        titleTa="இதர பழுதுபார்ப்பு"
        icon="🔧"
        dateField="date"
        filterColumn="tractor_id"
        filterValue={tractorId}
        collapsible={true}
        defaultOpen={false}
        fields={[
          { key: "date", en: "Date", ta: "தேதி", type: "date", required: true },
          {
            key: "repair_type",
            en: "Repair Type",
            ta: "பழுது வகை",
            type: "text",
            required: true,
            placeholderEn: "e.g. Electrical repair, Switch replacement, Bearing replacement",
            placeholderTa: "எ.கா. மின் பழுது, சுவிட்ச் மாற்றம், பேரிங் மாற்றம்",
          },
          { key: "mechanic_name", en: "Mechanic Name", ta: "மெக்கானிக் பெயர்", type: "text" },
          { key: "amount", en: "Cost (₹)", ta: "செலவு (₹)", type: "number", required: true, isCost: true },
        ]}
      />
    </div>
  );
}

// ==================== PHOTOS TAB ====================
function PhotosTab({ L, tractorId }: { L: (en: string, ta: string) => string; tractorId: string }) {
  const [photos, setPhotos] = useState<TractorPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const { isOpen: deleteOpen, confirmDelete, handleConfirm: handleDeleteConfirm, handleCancel: handleDeleteCancel } = useDeleteConfirm();

  useEffect(() => {
    fetchPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tractorId]);

  const fetchPhotos = async () => {
    setLoading(true);
    const { data } = await supabase.from("tractor_photos").select("*").eq("tractor_id", tractorId).order("created_at", { ascending: false });
    if (data) setPhotos(data);
    setLoading(false);
  };

  const openAdd = () => {
    setCaption("");
    setFile(null);
    setModalOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
  };

  const save = async () => {
    if (!caption.trim() || !file) {
      toast.error(L("Caption and photo are required.", "தலைப்பு மற்றும் புகைப்படம் தேவை."));
      return;
    }
    setSaving(true);
    try {
      const base64 = await convertToBase64(file);
      const { error } = await supabase.from("tractor_photos").insert({
        tractor_id: tractorId,
        caption: caption.trim(),
        photo_data: base64,
      });
      if (error) {
        console.error("Error saving photo record:", error);
        toast.error(L("Could not save. Please try again.", "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
      } else {
        setModalOpen(false);
        fetchPhotos();
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error(L("Could not save. Please try again.", "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
    }
    setSaving(false);
  };

  const remove = (id: string) => {
    confirmDelete(async () => {
      const { error } = await supabase.from("tractor_photos").delete().eq("id", id);
      if (!error) fetchPhotos();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button onClick={openAdd} className="bg-primary hover:bg-primary/90 text-white rounded-lg px-3 py-1.5 text-sm font-medium transition">
          + {L("Upload Photo", "புகைப்படம் பதிவேற்ற")}
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 bg-gray-200 rounded-2xl animate-pulse" />)}
        </div>
      ) : photos.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-500">
          <div className="text-4xl mb-2">📷</div>
          {L("No photos yet. Upload one above.", "புகைப்படங்கள் இல்லை. மேலே பதிவேற்றவும்.")}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photos.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.photo_data} alt={p.caption} className="w-full h-32 object-cover cursor-pointer" onClick={() => setViewerUrl(p.photo_data)} />
              <div className="p-2">
                <p className="text-xs text-gray-900">{p.caption}</p>
                <button onClick={() => remove(p.id)} className="text-xs text-danger hover:underline mt-1">{L("Delete", "நீக்கு")}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewerUrl && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setViewerUrl(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewerUrl} alt="" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-0">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-primary">{L("Upload Photo", "புகைப்படம் பதிவேற்ற")}</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{L("Caption", "தலைப்பு")} *</label>
                <input type="text" value={caption} onChange={(e) => setCaption(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{L("Photo", "புகைப்படம்")} *</label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-green-400 hover:bg-green-50 transition-colors duration-200">
                    <div className="text-3xl mb-2">📷</div>
                    <p className="text-gray-700 font-medium text-sm">
                      {L("Click to upload photo", "புகைப்படம் பதிவேற்ற கிளிக் செய்யவும்")}
                    </p>
                    <p className="text-gray-500 text-xs mt-1">
                      {file ? `✅ ${file.name}` : L("JPG, PNG supported (max 2MB recommended)", "JPG, PNG ஆதரிக்கப்படும் (அதிகபட்சம் 2MB பரிந்துரைக்கப்படுகிறது)")}
                    </p>
                  </div>
                </div>
                {file && file.size > MAX_RECOMMENDED_PHOTO_BYTES && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠️ {L("Photo is large and may slow the app. Please use a compressed image under 2MB.", "புகைப்படம் பெரியது, செயலியை மெதுவாக்கலாம். 2MB க்கும் குறைவான சுருக்கப்பட்ட படத்தை பயன்படுத்தவும்.")}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={save} disabled={saving} className="flex-1 bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg py-2 text-sm font-medium transition">
                  {saving ? "..." : L("Save", "சேமி")}
                </button>
                <button onClick={() => setModalOpen(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg py-2 text-sm font-medium transition">
                  {L("Cancel", "ரத்து")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <DeleteConfirmDialog isOpen={deleteOpen} onConfirm={handleDeleteConfirm} onCancel={handleDeleteCancel} language={L("en", "ta")} />
    </div>
  );
}
