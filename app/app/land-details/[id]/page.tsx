"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import Sidebar from "../../../components/Sidebar";
import MotorSharingSection, { type MotorSharingSectionHandle } from "../../../components/MotorSharingSection";
import DeleteConfirmDialog from "../../../components/DeleteConfirmDialog";
import { useDeleteConfirm } from "../../../hooks/useDeleteConfirm";
import { supabase } from "../../../lib/supabase";
import { useLang } from "../../../lib/useLang";
import { getValidationMessage } from "../../../lib/validation";
import { ActivityLog } from "../../../lib/activityLog";

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
  water_source: string | null;
  irrigation_type: string | null;
  soil_type: string | null;
  google_maps_link: string | null;
};

const MOTOR_HP_OPTIONS = ["0.5", "1", "1.5", "2", "3", "5", "7.5", "10"];

type FarmDrawing = {
  id: string;
  farm_id: string;
  title: string;
  drawing_data: string;
  notes: string | null;
  file_type: string | null;
};

type LandDocument = {
  id: string;
  farm_id: string;
  title: string;
  document_type: string;
  file_data: string;
  file_type: string;
  file_name: string;
  notes: string | null;
};

const MAX_RECOMMENDED_PDF_BYTES = 5 * 1024 * 1024;
const MAX_RECOMMENDED_DOCUMENT_BYTES = 5 * 1024 * 1024;

const DOCUMENT_TYPES = [
  { value: "patta", en: "Patta", ta: "பட்டா" },
  { value: "survey", en: "Survey Document", ta: "சர்வே ஆவணம்" },
  { value: "registration", en: "Land Registration", ta: "பதிவு ஆவணம்" },
  { value: "tax_receipt", en: "Tax Receipt", ta: "வரி ரசீது" },
  { value: "court", en: "Court Document", ta: "நீதிமன்ற ஆவணம்" },
  { value: "photo", en: "Photo", ta: "புகைப்படம்" },
  { value: "other", en: "Other", ta: "மற்றவை" },
] as const;

const DOCUMENT_TYPE_BADGE: Record<string, string> = {
  patta: "bg-blue-100 text-blue-700",
  survey: "bg-green-100 text-green-700",
  registration: "bg-purple-100 text-purple-700",
  tax_receipt: "bg-amber-100 text-amber-700",
  court: "bg-red-100 text-red-700",
  photo: "bg-pink-100 text-pink-700",
  other: "bg-gray-100 text-gray-700",
};

const WATER_SOURCES = [
  { value: "borewell", en: "Borewell", ta: "துளை கிணறு" },
  { value: "open_well", en: "Open Well", ta: "திறந்த கிணறு" },
  { value: "canal", en: "Canal", ta: "கால்வாய்" },
  { value: "rain_fed", en: "Rain Fed", ta: "மழை நீர்" },
  { value: "tank", en: "Tank", ta: "ஏரி" },
  { value: "other", en: "Other", ta: "மற்றவை" },
];

const IRRIGATION_TYPES = [
  { value: "drip", en: "Drip", ta: "சொட்டு நீர்" },
  { value: "flood", en: "Flood", ta: "வெள்ள பாசனம்" },
  { value: "sprinkler", en: "Sprinkler", ta: "தெளிப்பு பாசனம்" },
  { value: "manual", en: "Manual", ta: "கை பாசனம்" },
  { value: "mixed", en: "Mixed", ta: "கலவை" },
];

const SOIL_TYPES = [
  { value: "red", en: "Red Soil", ta: "செம்மண்" },
  { value: "black", en: "Black Soil", ta: "கரிசல் மண்" },
  { value: "sandy", en: "Sandy Soil", ta: "மணல் மண்" },
  { value: "clay", en: "Clay Soil", ta: "களி மண்" },
  { value: "loamy", en: "Loamy Soil", ta: "வண்டல் மண்" },
  { value: "mixed", en: "Mixed", ta: "கலவை" },
];

const MAX_RECOMMENDED_PHOTO_BYTES = 2 * 1024 * 1024;

const convertToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const inputCls =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary";
const labelCls = "block mb-1 text-xs text-gray-700";

function TogglePill({
  value,
  onChange,
  yesLabel,
  noLabel,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  yesLabel: string;
  noLabel: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`px-3 py-0.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
          value ? "bg-success text-white" : "bg-gray-100 text-gray-500 border border-gray-200"
        }`}
      >
        {yesLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`px-3 py-0.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
          !value ? "bg-danger text-white" : "bg-gray-100 text-gray-500 border border-gray-200"
        }`}
      >
        {noLabel}
      </button>
    </div>
  );
}

function CollapsibleCard({
  id,
  title,
  icon,
  openSection,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  icon: string;
  openSection: string | null;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  const isOpen = openSection === id;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden border border-gray-100 dark:border-slate-700">
      {/* Header - clickable */}
      <button
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <span>{icon}</span>
          <span>{title}</span>
        </h2>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-gray-400 text-xs flex-shrink-0"
        >
          ▼
        </motion.span>
      </button>

      {/* Content */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-gray-100 dark:border-slate-700 pt-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LandDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [lang, setLang] = useLang();
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);

  const [activeTab, setActiveTab] = useState<"overview" | "location" | "drawing" | "documents">("overview");
  const [farm, setFarm] = useState<Farm | null>(null);
  const [loading, setLoading] = useState(true);
  const { isOpen: deleteOpen, confirmDelete, handleConfirm: handleDeleteConfirm, handleCancel: handleDeleteCancel } = useDeleteConfirm();

  // Overview tab accordion — Basic Info open by default, others closed.
  const [openSection, setOpenSection] = useState<string | null>("basic");
  const toggleSection = (section: string) => {
    setOpenSection((prev) => (prev === section ? null : section));
  };

  const showToast = (msg: string) => toast.success(msg);

  // Section 1 - Basic Info
  const [name, setName] = useState("");
  const [nameTamil, setNameTamil] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [area, setArea] = useState("");
  const [surveyNumbers, setSurveyNumbers] = useState("");
  const [pattaNumber, setPattaNumber] = useState("");
  const [savingBasic, setSavingBasic] = useState(false);

  // Section 2 - Water & Irrigation
  const [well, setWell] = useState(false);
  const [wellDepth, setWellDepth] = useState("");
  const [motor, setMotor] = useState(false);
  const [motorDetails, setMotorDetails] = useState("");
  const [motorHp, setMotorHp] = useState("");
  const [motorHpOther, setMotorHpOther] = useState("");
  const [waterSource, setWaterSource] = useState("borewell");
  const [irrigationType, setIrrigationType] = useState("drip");
  const [savingWater, setSavingWater] = useState(false);
  const motorSharingRef = useRef<MotorSharingSectionHandle>(null);

  // Section 3 - Soil Info
  const [soilType, setSoilType] = useState("red");
  const [savingSoil, setSavingSoil] = useState(false);

  // Location tab
  const [googleMapsLink, setGoogleMapsLink] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const [copied, setCopied] = useState(false);

  // Land Drawing tab
  const [drawings, setDrawings] = useState<FarmDrawing[]>([]);
  const [loadingDrawings, setLoadingDrawings] = useState(true);
  const [drawingModalOpen, setDrawingModalOpen] = useState(false);
  const [drawingTitle, setDrawingTitle] = useState("");
  const [drawingNotes, setDrawingNotes] = useState("");
  const [drawingFile, setDrawingFile] = useState<File | null>(null);
  const [savingDrawing, setSavingDrawing] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  // Documents tab
  const [documents, setDocuments] = useState<LandDocument[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docType, setDocType] = useState<typeof DOCUMENT_TYPES[number]["value"]>("patta");
  const [docNotes, setDocNotes] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [savingDocument, setSavingDocument] = useState(false);

  useEffect(() => {
    if (id) {
      fetchFarm();
      fetchDrawings();
      fetchDocuments();
    }
  }, [id]);

  const fetchFarm = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("farms").select("*").eq("id", id).single();
    if (!error && data) {
      const f = data as Farm;
      setFarm(f);
      setName(f.name ?? "");
      setNameTamil(f.name_tamil ?? "");
      setOwnerName(f.owner_name ?? "");
      const effectiveArea = f.area ?? f.total_area;
      setArea(effectiveArea != null ? String(effectiveArea) : "");
      setSurveyNumbers(f.survey_numbers ?? "");
      setPattaNumber(f.patta_number ?? "");
      setWell(f.well ?? f.has_well ?? false);
      setWellDepth(f.well_depth ?? "");
      setMotor(f.motor ?? f.has_motor ?? false);
      setMotorDetails(f.motor_details ?? "");
      if (f.motor_hp && !MOTOR_HP_OPTIONS.includes(f.motor_hp)) {
        setMotorHp("other");
        setMotorHpOther(f.motor_hp);
      } else {
        setMotorHp(f.motor_hp ?? "");
        setMotorHpOther("");
      }
      setWaterSource(f.water_source ?? "borewell");
      setIrrigationType(f.irrigation_type ?? "drip");
      setSoilType(f.soil_type ?? "red");
      setGoogleMapsLink(f.google_maps_link ?? "");
    }
    setLoading(false);
  };

  const fetchDrawings = async () => {
    setLoadingDrawings(true);
    const { data, error } = await supabase.from("farm_drawings").select("*").eq("farm_id", id).order("id", { ascending: false });
    if (!error && data) setDrawings(data);
    setLoadingDrawings(false);
  };

  const fetchDocuments = async () => {
    setLoadingDocuments(true);
    const { data, error } = await supabase.from("land_documents").select("*").eq("farm_id", id).order("id", { ascending: false });
    if (!error && data) setDocuments(data);
    setLoadingDocuments(false);
  };

  const saveBasicInfo = async () => {
    if (!name.trim() || name.trim().length < 2) {
      toast.error(getValidationMessage("min_chars", lang));
      return;
    }
    const areaVal = Number(area);
    if (!areaVal || areaVal <= 0) {
      toast.error(getValidationMessage("min_area", lang));
      return;
    }
    setSavingBasic(true);
    try {
      const { error } = await supabase
        .from("farms")
        .update({
          name: name.trim() || null,
          name_tamil: nameTamil.trim() || null,
          owner_name: ownerName.trim() || null,
          total_area: parseFloat(area) || 0,
          survey_numbers: surveyNumbers.trim() || null,
          patta_number: pattaNumber.trim() || null,
        })
        .eq("id", id);
      if (error) {
        console.error("Error saving basic info:", error);
        toast.error(L("Could not save. Please try again.", "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
      } else {
        showToast(L("Saved!", "சேமிக்கப்பட்டது!"));
        await ActivityLog.updated("Land Details", `Land updated: ${name.trim()}`);
        fetchFarm();
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error(L("Could not save. Please try again.", "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
    }
    setSavingBasic(false);
  };

  const saveWaterInfo = async () => {
    if (motor && motorHp === "other" && motorHpOther && Number(motorHpOther) < 0) {
      toast.error(getValidationMessage("negative", lang));
      return;
    }
    setSavingWater(true);
    try {
      const { error } = await supabase
        .from("farms")
        .update({
          has_well: well,
          well_depth: well ? wellDepth.trim() || null : null,
          has_motor: motor,
          motor_details: motor ? motorDetails.trim() || null : null,
          motor_hp: motor ? (motorHp === "other" ? motorHpOther.trim() || null : motorHp || null) : null,
        })
        .eq("id", id);
      if (error) {
        console.error("Error saving water info:", error);
        toast.error(L("Could not save. Please try again.", "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
      } else {
        await motorSharingRef.current?.save();
        showToast(L("Saved!", "சேமிக்கப்பட்டது!"));
        await ActivityLog.updated("Motor Sharing", `Motor sharing updated: ${name.trim()}`);
        fetchFarm();
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error(L("Could not save. Please try again.", "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
    }
    setSavingWater(false);
  };

  const saveSoilInfo = async () => {
    setSavingSoil(true);
    try {
      const { error } = await supabase
        .from("farms")
        .update({
          soil_type: soilType || null,
          water_source: waterSource || null,
          irrigation_type: irrigationType || null,
        })
        .eq("id", id);
      if (error) {
        console.error("Error saving soil info:", error);
        toast.error(L("Could not save. Please try again.", "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
      } else {
        showToast(L("Saved!", "சேமிக்கப்பட்டது!"));
        fetchFarm();
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error(L("Could not save. Please try again.", "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
    }
    setSavingSoil(false);
  };

  const saveGoogleMapsLink = async () => {
    setSavingLocation(true);
    try {
      const { error } = await supabase
        .from("farms")
        .update({ google_maps_link: googleMapsLink.trim() || null })
        .eq("id", id);
      if (error) {
        console.error("Error saving Google Maps link:", error);
        toast.error(L("Could not save. Please try again.", "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
      } else {
        showToast(L("Saved!", "சேமிக்கப்பட்டது!"));
        fetchFarm();
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error(L("Could not save. Please try again.", "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
    }
    setSavingLocation(false);
  };

  const openAddDrawing = () => {
    setDrawingTitle("");
    setDrawingNotes("");
    setDrawingFile(null);
    setDrawingModalOpen(true);
  };

  const saveDrawing = async () => {
    if (!drawingTitle.trim() || !drawingFile) {
      toast.error(L("Title and photo or PDF are required.", "தலைப்பு மற்றும் படம்/PDF தேவை."));
      return;
    }
    setSavingDrawing(true);
    try {
      const base64 = await convertToBase64(drawingFile);
      const fileType = drawingFile.type === "application/pdf" ? "pdf" : "image";
      const { error } = await supabase.from("farm_drawings").insert({
        farm_id: id,
        title: drawingTitle.trim(),
        drawing_data: base64,
        notes: drawingNotes.trim() || null,
        file_type: fileType,
      });
      if (error) {
        console.error("Error saving drawing:", error);
        toast.error(L("Could not save. Please try again.", "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
      } else {
        setDrawingModalOpen(false);
        fetchDrawings();
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error(L("Could not save. Please try again.", "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
    }
    setSavingDrawing(false);
  };

  const deleteDrawing = (drawingId: string) => {
    confirmDelete(async () => {
      const { error } = await supabase.from("farm_drawings").delete().eq("id", drawingId);
      if (!error) {
        toast.success(L("Deleted!", "நீக்கப்பட்டது!"));
        fetchDrawings();
      }
    });
  };

  const openAddDocument = () => {
    setDocTitle("");
    setDocType("patta");
    setDocNotes("");
    setDocFile(null);
    setDocumentModalOpen(true);
  };

  const saveDocument = async () => {
    if (!docTitle.trim() || !docType || !docFile) {
      toast.error(L("Title, document type and file are required.", "தலைப்பு, ஆவண வகை மற்றும் கோப்பு தேவை."));
      return;
    }
    setSavingDocument(true);
    try {
      const base64 = await convertToBase64(docFile);
      const fileType = docFile.type.includes("pdf") ? "pdf" : "image";
      const { error } = await supabase.from("land_documents").insert({
        farm_id: id,
        title: docTitle.trim(),
        document_type: docType,
        file_data: base64,
        file_type: fileType,
        file_name: docFile.name,
        notes: docNotes.trim() || null,
      });
      if (error) {
        console.error("Error saving document:", error);
        toast.error(L("Could not save. Please try again.", "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
      } else {
        await ActivityLog.added("Land Document", `Document: ${docTitle.trim()} (${docType})`);
        setDocumentModalOpen(false);
        fetchDocuments();
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error(L("Could not save. Please try again.", "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
    }
    setSavingDocument(false);
  };

  const deleteDocument = (documentId: string) => {
    const target = documents.find((d) => d.id === documentId);
    confirmDelete(async () => {
      const { error } = await supabase.from("land_documents").delete().eq("id", documentId);
      if (!error) {
        toast.success(L("Deleted!", "நீக்கப்பட்டது!"));
        await ActivityLog.deleted("Land Document", `Document deleted: ${target?.title ?? ""}`);
        fetchDocuments();
      }
    });
  };

  const viewDocument = (doc: LandDocument) => {
    const newTab = window.open();
    if (!newTab) return;
    if (doc.file_type === "pdf") {
      newTab.document.write(`<iframe src="${doc.file_data}" width="100%" height="100%" style="border:0"></iframe>`);
    } else {
      newTab.document.write(
        `<img src="${doc.file_data}" style="max-width:100%;height:auto;display:block;margin:0 auto;" />`
      );
    }
  };

  const documentTypeLabel = (value: string) => {
    const t = DOCUMENT_TYPES.find((d) => d.value === value);
    return t ? L(t.en, t.ta) : value;
  };

  if (loading) {
    return (
      <div className="flex h-screen overflow-hidden bg-page">
        <Sidebar lang={lang} setLang={setLang} />
        <main className="flex-1 p-4 flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-2xl animate-pulse" />
          ))}
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <Sidebar lang={lang} setLang={setLang} />

      <main className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto flex flex-col gap-4">

          <div className="flex items-center justify-between flex-wrap gap-2">
            <Link href="/land-details" className="text-primary hover:text-primary text-sm font-semibold">
              ← {L("Back", "திரும்பு")}
            </Link>
            <h1 className="text-xl font-bold text-primary text-center">{farm?.name}</h1>
            <button
              onClick={() => setLang(lang === "ta" ? "en" : "ta")}
              className="px-3 py-1.5 rounded-lg border border-primary/40 text-primary text-sm font-medium hover:bg-green-50 transition"
            >
              {lang === "ta" ? "English" : "தமிழ்"}
            </button>
          </div>

          <div className="flex gap-1 bg-white rounded-xl shadow-sm p-1 w-fit overflow-x-auto">
            {([
              ["overview", L("Overview", "நில கண்ணோட்டம்")],
              ["location", L("Location", "இடம்")],
              ["drawing", L("Land Drawing", "நில வரைபடம்")],
              ["documents", L("Documents", "ஆவணங்கள்")],
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
          {/* OVERVIEW TAB */}
          {activeTab === "overview" && (
            <div className="flex flex-col gap-3">
              <CollapsibleCard id="basic" title={L("Basic Info", "அடிப்படை தகவல்")} icon="📋" openSection={openSection} onToggle={toggleSection}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className={labelCls}>{L("Farm Name (English)", "பண்ணை பெயர் (English)")}</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{L("Farm Name (Tamil) - Optional", "பண்ணை பெயர் (தமிழ்) - விருப்பமானது")}</label>
                    <input
                      type="text"
                      value={nameTamil}
                      onChange={(e) => setNameTamil(e.target.value)}
                      placeholder={L("e.g. வ. கருக்கம்பாளையம் பண்ணை", "தமிழில் பண்ணை பெயர்")}
                      className={inputCls}
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      {L("Used in Tamil notifications and Tamil mode", "தமிழ் அறிவிப்புகளில் இந்த பெயர் பயன்படுத்தப்படும்")}
                    </p>
                  </div>
                  <div>
                    <label className={labelCls}>{L("Owner Name", "உரிமையாளர் பெயர்")}</label>
                    <input type="text" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{L("Total Area in Acres", "மொத்த பரப்பளவு")}</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      onKeyDown={(e) => { if (e.key === "-") e.preventDefault(); }}
                      value={area}
                      onChange={(e) => setArea(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>
                <button
                  onClick={saveBasicInfo}
                  disabled={savingBasic}
                  className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                >
                  {savingBasic ? "..." : L("Save", "சேமி")}
                </button>
              </CollapsibleCard>

              <CollapsibleCard id="soil" title={L("Soil Details", "மண் விவரங்கள்")} icon="🌱" openSection={openSection} onToggle={toggleSection}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className={labelCls}>{L("Soil Type", "மண் வகை")}</label>
                    <select value={soilType} onChange={(e) => setSoilType(e.target.value)} className={inputCls}>
                      {SOIL_TYPES.map((o) => (
                        <option className="text-gray-900" key={o.value} value={o.value}>{L(o.en, o.ta)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>{L("Water Source", "நீர் ஆதாரம்")}</label>
                    <select value={waterSource} onChange={(e) => setWaterSource(e.target.value)} className={inputCls}>
                      {WATER_SOURCES.map((o) => (
                        <option className="text-gray-900" key={o.value} value={o.value}>{L(o.en, o.ta)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>{L("Irrigation Type", "பாசன முறை")}</label>
                    <select value={irrigationType} onChange={(e) => setIrrigationType(e.target.value)} className={inputCls}>
                      {IRRIGATION_TYPES.map((o) => (
                        <option className="text-gray-900" key={o.value} value={o.value}>{L(o.en, o.ta)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={saveSoilInfo}
                  disabled={savingSoil}
                  className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                >
                  {savingSoil ? "..." : L("Save", "சேமி")}
                </button>
              </CollapsibleCard>

              <CollapsibleCard id="records" title={L("Land Records", "நில பதிவுகள்")} icon="📄" openSection={openSection} onToggle={toggleSection}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className={labelCls}>{L("Survey Number", "சர்வே எண்")}</label>
                    <input type="text" value={surveyNumbers} onChange={(e) => setSurveyNumbers(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{L("Patta Number", "பட்டா எண்")}</label>
                    <input type="text" value={pattaNumber} onChange={(e) => setPattaNumber(e.target.value)} className={inputCls} />
                  </div>
                </div>
                <button
                  onClick={saveBasicInfo}
                  disabled={savingBasic}
                  className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                >
                  {savingBasic ? "..." : L("Save", "சேமி")}
                </button>
              </CollapsibleCard>

              <CollapsibleCard id="motor" title={L("Well & Motor", "கிணறு & மோட்டார்")} icon="💧" openSection={openSection} onToggle={toggleSection}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-700">{L("Well", "கிணறு")}</label>
                    <TogglePill value={well} onChange={setWell} yesLabel={L("Yes", "உண்டு")} noLabel={L("No", "இல்லை")} />
                  </div>
                  {well && (
                    <div>
                      <label className={labelCls}>{L("Well Depth", "கிணற்று ஆழம்")}</label>
                      <input
                        type="text"
                        placeholder={L("e.g. 23 feet", "எ.கா. 23 அடி")}
                        value={wellDepth}
                        onChange={(e) => setWellDepth(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-700">{L("Motor", "மோட்டார்")}</label>
                    <TogglePill value={motor} onChange={setMotor} yesLabel={L("Yes", "உண்டு")} noLabel={L("No", "இல்லை")} />
                  </div>
                  {motor && (
                    <>
                      <div>
                        <label className={labelCls}>{L("Motor Service Number", "மோட்டார் சேவை எண்")}</label>
                        <input type="text" value={motorDetails} onChange={(e) => setMotorDetails(e.target.value)} className={inputCls} />
                      </div>

                      <div>
                        <label className={labelCls}>{L("Motor HP (Horse Power)", "மோட்டார் HP (ஹார்ஸ் பவர்)")}</label>
                        <select value={motorHp} onChange={(e) => setMotorHp(e.target.value)} className={inputCls}>
                          <option value="">{L("Select HP", "HP தேர்வு செய்க")}</option>
                          {MOTOR_HP_OPTIONS.map((hp) => (
                            <option className="text-gray-900" key={hp} value={hp}>{hp} HP</option>
                          ))}
                          <option value="other">{L("Other", "மற்றவை")}</option>
                        </select>

                        {motorHp === "other" && (
                          <input
                            type="text"
                            value={motorHpOther}
                            onChange={(e) => setMotorHpOther(e.target.value)}
                            placeholder={L("Enter HP value", "HP மதிப்பை உள்ளிடவும்")}
                            className={`${inputCls} mt-2`}
                          />
                        )}
                      </div>
                    </>
                  )}
                </div>
                <button
                  onClick={saveWaterInfo}
                  disabled={savingWater}
                  className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                >
                  {savingWater ? "..." : L("Save", "சேமி")}
                </button>

                {(well || motor) && <MotorSharingSection ref={motorSharingRef} farmId={id} language={lang} />}
              </CollapsibleCard>
            </div>
          )}

          {/* LOCATION TAB */}
          {activeTab === "location" && (
            <div className="bg-white rounded-xl shadow-sm p-6">

              <div className="mb-6">
                <label className="text-xs text-gray-700 mb-2 block">
                  {L("Google Maps Link", "கூகுள் வரைபட இணைப்பு")}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={googleMapsLink}
                    onChange={(e) => setGoogleMapsLink(e.target.value)}
                    placeholder={L("Paste your Google Maps link here...", "உங்கள் கூகுள் வரைபட இணைப்பை இங்கே ஒட்டவும்...")}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button
                    onClick={saveGoogleMapsLink}
                    disabled={savingLocation}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0"
                  >
                    {savingLocation ? "..." : L("Save", "சேமி")}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {L(
                    "How to get link: Google Maps → Your farm location → Share → Copy link",
                    "இணைப்பு பெற: கூகுள் வரைபடம் → உங்கள் நிலத்தின் இடம் → பகிர் → இணைப்பை நகலெடு"
                  )}
                </p>
              </div>

              {googleMapsLink ? (
                <div className="border-2 border-green-200 rounded-xl overflow-hidden bg-green-50">
                  <div className="h-64 bg-gradient-to-br from-green-100 to-emerald-200 flex flex-col items-center justify-center relative overflow-hidden">
                    <div className="text-6xl mb-3 animate-bounce">📍</div>
                    <p className="text-green-800 font-semibold text-base">
                      {L("Farm Location Saved", "நில இடம் சேமிக்கப்பட்டது")}
                    </p>
                    <div
                      className="absolute inset-0 opacity-10"
                      style={{
                        backgroundImage:
                          "linear-gradient(#16a34a 1px, transparent 1px), linear-gradient(90deg, #16a34a 1px, transparent 1px)",
                        backgroundSize: "30px 30px",
                      }}
                    />
                  </div>

                  <div className="p-4 bg-white border-t border-green-200">
                    <div className="flex gap-3 flex-wrap">
                      <a
                        href={googleMapsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        🗺️ {L("Open in Google Maps", "கூகுள் வரைபடத்தில் திற")}
                      </a>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(googleMapsLink);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        {copied ? `✅ ${L("Copied!", "நகலெடுக்கப்பட்டது!")}` : `📋 ${L("Copy Link", "இணைப்பை நகலெடு")}`}
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-2 truncate">🔗 {googleMapsLink}</p>
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-200 rounded-xl h-48 flex flex-col items-center justify-center text-center p-6">
                  <div className="text-4xl mb-3">🗺️</div>
                  <p className="text-sm font-semibold text-gray-500">{L("No location saved yet", "இடம் எதுவும் சேமிக்கப்படவில்லை")}</p>
                  <p className="text-gray-400 text-xs mt-3">
                    {L("Paste your Google Maps link above to save your farm location", "உங்கள் நிலத்தின் இடத்தை சேமிக்க மேலே கூகுள் வரைபட இணைப்பை ஒட்டவும்")}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* LAND DRAWING TAB */}
          {activeTab === "drawing" && (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end">
                <button onClick={openAddDrawing} className="bg-primary hover:bg-primary/90 text-white rounded-lg px-3 py-1.5 text-sm font-medium transition">
                  + {L("Upload Drawing", "வரைபடம் பதிவேற்ற")}
                </button>
              </div>

              {loadingDrawings ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 bg-gray-200 rounded-2xl animate-pulse" />)}
                </div>
              ) : drawings.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-500">
                  <div className="text-4xl mb-2">📐</div>
                  <p className="text-sm">
                    {L("No land drawings uploaded yet.", "நில வரைபடங்கள் இல்லை.")}
                    <br />
                    {L("Upload your farm boundary drawing or map photo.", "உங்கள் நிலத்தின் எல்லை வரைபடம் அல்லது புகைப்படத்தை பதிவேற்றவும்.")}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {drawings.map((d) => {
                    const isPdf = d.file_type === "pdf";
                    return (
                      <div key={d.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        {isPdf ? (
                          <iframe src={d.drawing_data} className="w-full h-32 border-b border-gray-100" title={d.title} />
                        ) : (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={d.drawing_data}
                            alt={d.title}
                            className="w-full h-32 object-cover cursor-pointer"
                            onClick={() => setViewerUrl(d.drawing_data)}
                          />
                        )}
                        <div className="p-2">
                          <p className="text-sm font-semibold text-gray-900">{d.title}</p>
                          {d.notes && <p className="text-xs text-gray-500 mt-0.5">{d.notes}</p>}
                          <div className="flex items-center gap-2 mt-1">
                            {isPdf ? (
                              <button
                                onClick={() => {
                                  const newTab = window.open();
                                  newTab?.document.write(
                                    `<iframe src="${d.drawing_data}" width="100%" height="100%" style="border:0"></iframe>`
                                  );
                                }}
                                className="text-xs font-medium text-primary hover:underline"
                              >
                                📄 {L("View Full PDF", "முழு PDF காண")}
                              </button>
                            ) : (
                              <button onClick={() => setViewerUrl(d.drawing_data)} className="text-xs font-medium text-primary hover:underline">
                                {L("View Full", "முழுவதும் காண")}
                              </button>
                            )}
                            <button onClick={() => deleteDrawing(d.id)} className="text-xs font-medium text-danger hover:underline">
                              {L("Delete", "நீக்கு")}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* DOCUMENTS TAB */}
          {activeTab === "documents" && (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end">
                <button onClick={openAddDocument} className="bg-primary hover:bg-primary/90 text-white rounded-lg px-3 py-1.5 text-sm font-medium transition">
                  + {L("Upload Document", "ஆவணம் பதிவேற்ற")}
                </button>
              </div>

              {loadingDocuments ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 bg-gray-200 rounded-2xl animate-pulse" />)}
                </div>
              ) : documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="text-5xl mb-4">📄</div>
                  <h3 className="text-sm font-semibold text-gray-700">
                    {L("No documents uploaded yet", "ஆவணங்கள் எதுவும் பதிவேற்றப்படவில்லை")}
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    {L("Upload your land documents, patta, survey maps etc.", "பட்டா, சர்வே வரைபடம் போன்ற ஆவணங்களை பதிவேற்றுங்கள்")}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {documents.map((d) => {
                    const isPdf = d.file_type === "pdf";
                    return (
                      <div key={d.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        {isPdf ? (
                          <div
                            className="w-full h-32 border-b border-gray-100 flex items-center justify-center bg-gray-50 cursor-pointer text-5xl"
                            onClick={() => viewDocument(d)}
                          >
                            📄
                          </div>
                        ) : (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={d.file_data}
                            alt={d.title}
                            className="w-full h-32 object-cover cursor-pointer"
                            onClick={() => viewDocument(d)}
                          />
                        )}
                        <div className="p-2">
                          <p className="text-sm font-semibold text-gray-900">{d.title}</p>
                          <span className={`${DOCUMENT_TYPE_BADGE[d.document_type] ?? DOCUMENT_TYPE_BADGE.other} inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-1`}>
                            {documentTypeLabel(d.document_type)}
                          </span>
                          {isPdf && <p className="text-xs text-gray-500 mt-1 truncate">{d.file_name}</p>}
                          {d.notes && <p className="text-xs text-gray-500 mt-0.5">{d.notes}</p>}
                          <div className="flex items-center gap-2 mt-1">
                            <button onClick={() => viewDocument(d)} className="text-xs font-medium text-primary hover:underline">
                              👁️ {L("View", "காண")}
                            </button>
                            <button onClick={() => deleteDocument(d.id)} className="text-xs font-medium text-danger hover:underline">
                              🗑️ {L("Delete", "நீக்கு")}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
            </motion.div>
          </AnimatePresence>

        </div>
      </main>

      {viewerUrl && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setViewerUrl(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewerUrl} alt="" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}

      <AnimatePresence>
      {drawingModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-0"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-primary">{L("Upload Drawing", "வரைபடம் பதிவேற்ற")}</h2>
              <button onClick={() => setDrawingModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{L("Title", "தலைப்பு")} *</label>
                <input
                  type="text"
                  placeholder={L("e.g. Overall boundary", "எ.கா. மொத்த எல்லை")}
                  value={drawingTitle}
                  onChange={(e) => setDrawingTitle(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{L("Photo or PDF", "படம் அல்லது PDF")} *</label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setDrawingFile(e.target.files?.[0] ?? null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-green-400 hover:bg-green-50 transition-colors duration-200">
                    <div className="text-3xl mb-2">📄</div>
                    <p className="text-gray-700 font-medium text-sm">
                      {L("Click to upload photo or PDF", "படம் அல்லது PDF பதிவேற்ற கிளிக் செய்யவும்")}
                    </p>
                    <p className="text-gray-500 text-xs mt-1">
                      {drawingFile ? `✅ ${drawingFile.name}` : L("JPG, PNG, PDF supported", "JPG, PNG, PDF ஆதரிக்கப்படும்")}
                    </p>
                  </div>
                </div>
                {drawingFile && drawingFile.type !== "application/pdf" && drawingFile.size > MAX_RECOMMENDED_PHOTO_BYTES && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠️ {L("Photo is large and may slow the app. Please use a compressed image under 2MB.", "புகைப்படம் பெரியது, செயலியை மெதுவாக்கலாம். 2MB க்கும் குறைவான சுருக்கப்பட்ட படத்தை பயன்படுத்தவும்.")}
                  </p>
                )}
                {drawingFile && drawingFile.size > MAX_RECOMMENDED_PDF_BYTES && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠️ {L(
                      `File is large (${(drawingFile.size / (1024 * 1024)).toFixed(1)}MB). Large files may slow the app. Consider compressing before uploading.`,
                      `கோப்பு பெரியது (${(drawingFile.size / (1024 * 1024)).toFixed(1)}MB). பெரிய கோப்புகள் செயலியை மெதுவாக்கலாம். பதிவேற்றும் முன் சுருக்கவும்.`
                    )}
                  </p>
                )}
              </div>
              <div>
                <label className={labelCls}>{L("Notes", "குறிப்புகள்")}</label>
                <textarea
                  placeholder={L("e.g. North side is road, East side is canal", "எ.கா. வடக்கு பக்கம் சாலை, கிழக்கு பக்கம் கால்வாய்")}
                  value={drawingNotes}
                  onChange={(e) => setDrawingNotes(e.target.value)}
                  className={inputCls}
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <button onClick={saveDrawing} disabled={savingDrawing} className="flex-1 bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg py-2 text-sm font-medium transition">
                  {savingDrawing ? "..." : L("Save", "சேமி")}
                </button>
                <button onClick={() => setDrawingModalOpen(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg py-2 text-sm font-medium transition">
                  {L("Cancel", "ரத்து")}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {documentModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-0"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-primary">{L("Upload Document", "ஆவணம் பதிவேற்ற")}</h2>
              <button onClick={() => setDocumentModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{L("Title", "தலைப்பு")} *</label>
                <input
                  type="text"
                  placeholder={L("e.g. Patta Document, Survey Map", "எ.கா. பட்டா ஆவணம், சர்வே வரைபடம்")}
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{L("Document Type", "ஆவண வகை")} *</label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value as typeof DOCUMENT_TYPES[number]["value"])}
                  className={inputCls}
                >
                  {DOCUMENT_TYPES.map((o) => (
                    <option className="text-gray-900" key={o.value} value={o.value}>{`${o.en} (${o.ta})`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{L("File", "கோப்பு")} *</label>
                <div className="relative border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-green-400 hover:bg-green-50 transition-colors">
                  <input
                    type="file"
                    accept="image/*,.pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="text-3xl mb-2">📄</div>
                  <p className="text-gray-700 font-medium text-sm">
                    {L("Click to upload document", "ஆவணத்தை பதிவேற்ற கிளிக் செய்யவும்")}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">
                    {docFile ? docFile.name : L("PDF, JPG, PNG supported", "PDF, JPG, PNG ஆதரிக்கப்படும்")}
                  </p>
                </div>
                {docFile && docFile.size > MAX_RECOMMENDED_DOCUMENT_BYTES && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠️ {L(
                      `File is large (${(docFile.size / (1024 * 1024)).toFixed(1)}MB). Consider compressing.`,
                      `கோப்பு பெரியது (${(docFile.size / (1024 * 1024)).toFixed(1)}MB). சுருக்குவதை பரிசீலிக்கவும்.`
                    )}
                  </p>
                )}
              </div>
              <div>
                <label className={labelCls}>{L("Notes", "குறிப்புகள்")}</label>
                <textarea
                  value={docNotes}
                  onChange={(e) => setDocNotes(e.target.value)}
                  className={inputCls}
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <button onClick={saveDocument} disabled={savingDocument} className="flex-1 bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg py-2 text-sm font-medium transition">
                  {savingDocument ? "..." : L("Save", "சேமி")}
                </button>
                <button onClick={() => setDocumentModalOpen(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg py-2 text-sm font-medium transition">
                  {L("Cancel", "ரத்து")}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
      <DeleteConfirmDialog isOpen={deleteOpen} onConfirm={handleDeleteConfirm} onCancel={handleDeleteCancel} language={lang} />
    </div>
  );
}
