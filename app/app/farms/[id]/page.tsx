"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Sidebar from "../../../components/Sidebar";
import MotorSharingSection, { type MotorSharingSectionHandle } from "../../../components/MotorSharingSection";
import { supabase } from "../../../lib/supabase";
import { useLang } from "../../../lib/useLang";
import { ActivityLog } from "../../../lib/activityLog";

type Farm = {
  id: string;
  name: string;
  total_area: number;
  survey_numbers: string | null;
  patta_number: string | null;
  has_well: boolean;
  well_depth: string | null;
  has_motor: boolean;
  motor_details: string | null;
};

type Cultivation = {
  id: string;
  farm_id: string;
  crop_type: string;
  area: number;
  status: string;
  start_date: string | null;
  end_date: string | null;
  variety_name: string | null;
  quantity: number | null;
  quantity_unit: string | null;
};

const formatDMY = (iso: string | null) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

const CROP_TYPES = [
  { value: "coconut", icon: "🥥", labelTa: "தேங்காய்", labelEn: "Coconut" },
  { value: "sugarcane", icon: "🎋", labelTa: "கரும்பு", labelEn: "Sugarcane" },
  { value: "turmeric", icon: "🟡", labelTa: "மஞ்சள்", labelEn: "Turmeric" },
  { value: "ellu", icon: "🌾", labelTa: "எள்ளு", labelEn: "Ellu" },
  { value: "kuchi_kilangu", icon: "🥔", labelTa: "குச்சிக்கிழங்கு", labelEn: "Kuchi Kilangu" },
  { value: "onion", icon: "🧅", labelTa: "வெங்காயம்", labelEn: "Onion" },
  { value: "fodder_corn", icon: "🌽", labelTa: "மக்காச்சோளம்", labelEn: "Fodder Corn" },
  { value: "nell", icon: "🌾", labelTa: "நெல்", labelEn: "Nell (Rice)" },
  { value: "groundnut", icon: "🥜", labelTa: "நிலக்கடலை", labelEn: "Groundnut" },
];

const cropInfo = (value: string) =>
  CROP_TYPES.find((c) => c.value === value) ?? { value, icon: "🌱", labelTa: value, labelEn: value };

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

export default function FarmDetail() {
  const params = useParams();
  const id = params.id as string;

  const [lang, setLang] = useLang();
  const [farm, setFarm] = useState<Farm | null>(null);
  const [cultivations, setCultivations] = useState<Cultivation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const motorSharingRef = useRef<MotorSharingSectionHandle>(null);

  // Editable farm fields
  const [name, setName] = useState("");
  const [totalArea, setTotalArea] = useState("");
  const [surveyNumbers, setSurveyNumbers] = useState("");
  const [pattaNumber, setPattaNumber] = useState("");
  const [hasWell, setHasWell] = useState(true);
  const [wellDepth, setWellDepth] = useState("");
  const [hasMotor, setHasMotor] = useState(true);
  const [motorDetails, setMotorDetails] = useState("");

  // Add cultivation form
  const [cropType, setCropType] = useState("");
  const [cropArea, setCropArea] = useState("");
  const [cropStartDate, setCropStartDate] = useState("");
  const [addingCultivation, setAddingCultivation] = useState(false);

  useEffect(() => {
    if (id) {
      fetchFarm();
      fetchCultivations();
    }
  }, [id]);

  const fetchFarm = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("farms")
      .select("*")
      .eq("id", id)
      .single();
    if (!error && data) {
      setFarm(data);
      setName(data.name ?? "");
      setTotalArea(String(data.total_area ?? ""));
      setSurveyNumbers(data.survey_numbers ?? "");
      setPattaNumber(data.patta_number ?? "");
      setHasWell(!!data.has_well);
      setWellDepth(data.well_depth ?? "");
      setHasMotor(!!data.has_motor);
      setMotorDetails(data.motor_details ?? "");
    }
    setLoading(false);
  };

  const fetchCultivations = async () => {
    const { data, error } = await supabase
      .from("cultivations")
      .select("*")
      .eq("farm_id", id);
    if (!error && data) setCultivations(data);
  };

  const saveFarm = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("farms")
        .update({
          name: name.trim(),
          total_area: parseFloat(totalArea) || 0,
          survey_numbers: surveyNumbers.trim(),
          patta_number: pattaNumber.trim(),
          has_well: hasWell,
          well_depth: wellDepth.trim(),
          has_motor: hasMotor,
          motor_details: motorDetails.trim(),
        })
        .eq("id", id);
      if (error) {
        alert("Error saving farm: " + error.message);
      } else {
        await motorSharingRef.current?.save();
        fetchFarm();
      }
    } catch (err) {
      alert("Unexpected error: " + (err instanceof Error ? err.message : String(err)));
    }
    setSaving(false);
  };

  const usedArea = cultivations.reduce((sum, c) => sum + Number(c.area), 0);
  const farmTotalArea = Number(farm?.total_area ?? 0);
  const remainingArea = farmTotalArea - usedArea;

  const notEnoughAreaMessage = (remaining: number) =>
    lang === "ta"
      ? `போதுமான இடமில்லை! இந்த நிலத்தில் ${remaining.toFixed(2)} ஏக்கர் மட்டுமே உள்ளது.`
      : `Not enough area! Only ${remaining.toFixed(2)} acres remaining in this farm.`;

  const addCultivation = async () => {
    if (!cropType || !cropArea || !cropStartDate) {
      alert(lang === "ta" ? "பயிர், பரப்பளவு மற்றும் தொடக்க தேதி தேவை" : "Crop, area, and start date are required");
      return;
    }
    const newArea = parseFloat(cropArea);
    if (newArea <= 0 || newArea >= 1000) {
      alert(lang === "ta" ? "பரப்பளவு 0 முதல் 1000 ஏக்கருக்கு இடையில் இருக்க வேண்டும்" : "Area must be greater than 0 and less than 1000 acres");
      return;
    }
    if (newArea > remainingArea) {
      alert(notEnoughAreaMessage(remainingArea));
      return;
    }
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    if (new Date(cropStartDate) > oneYearFromNow) {
      alert(lang === "ta" ? "தொடக்க தேதி ஒரு வருடத்திற்கு மேல் எதிர்காலத்தில் இருக்க முடியாது" : "Start date cannot be more than 1 year in the future");
      return;
    }
    setAddingCultivation(true);
    try {
      const { error } = await supabase.from("cultivations").insert({
        farm_id: id,
        crop_type: cropType,
        area: newArea,
        start_date: cropStartDate,
        status: "active",
      });
      if (error) {
        alert("Error adding cultivation: " + error.message);
      } else {
        await ActivityLog.added("Crop", `New ${cropInfo(cropType).labelEn} cultivation started`);
        setCropType("");
        setCropArea("");
        setCropStartDate("");
        fetchCultivations();
      }
    } catch (err) {
      alert("Unexpected error: " + (err instanceof Error ? err.message : String(err)));
    }
    setAddingCultivation(false);
  };

  const activeCultivationsCount = cultivations.filter((c) => !c.end_date).length;
  const doneCultivationsCount = cultivations.filter((c) => !!c.end_date).length;

  const usedPercent = farmTotalArea > 0 ? Math.min((usedArea / farmTotalArea) * 100, 100) : 0;
  const isFull = farmTotalArea > 0 && usedArea >= farmTotalArea;
  const isWarning = usedPercent >= 90 && !isFull;
  const barColor = isFull ? "bg-danger" : isWarning ? "bg-yellow-500" : "bg-green-500";

  const t = {
    back: lang === "ta" ? "முகப்புக்கு திரும்பு" : "Back to Dashboard",
    farmInfo: lang === "ta" ? "நிலம் விவரங்கள்" : "Farm Information",
    farmName: lang === "ta" ? "நிலத்தின் பெயர்" : "Farm Name",
    farmNamePlaceholder: lang === "ta" ? "பெயர்" : "Name",
    totalArea: lang === "ta" ? "பரப்பளவு (ஏக்கர்)" : "Area in Acres",
    surveyNumbers: lang === "ta" ? "சர்வே எண்கள்" : "Survey Numbers",
    surveyNumbersPlaceholder: lang === "ta" ? "சர்வே எண்." : "Survey No.",
    pattaNumber: lang === "ta" ? "பட்டா எண்" : "Patta Number",
    pattaNumberPlaceholder: lang === "ta" ? "பட்டா எண்." : "Patta No.",
    well: lang === "ta" ? "கிணறு" : "Well",
    wellDepth: lang === "ta" ? "கிணற்று ஆழம்" : "Well Depth",
    wellDepthPlaceholder: lang === "ta" ? "ஆழம் (அடி)" : "Depth (ft)",
    motor: lang === "ta" ? "மோட்டார்" : "Motor",
    motorDetails: lang === "ta" ? "மோட்டார் விவரம்" : "Motor Details",
    motorDetailsPlaceholder: lang === "ta" ? "மோட்டார் தகவல்" : "Motor info",
    saveChanges: lang === "ta" ? "மாற்றங்களை சேமி" : "Save Changes",
    cultivations: lang === "ta" ? "பயிர்கள்" : "Cultivations",
    addCultivation: lang === "ta" ? "பயிர் சேர்க்க" : "Add",
    selectCrop: lang === "ta" ? "பயிர் தேர்வு செய்க" : "Select Crop",
    areaAcres: lang === "ta" ? "பரப்பளவு (ஏக்கர்)" : "Area (Acres)",
    acresPlaceholder: lang === "ta" ? "ஏக்கர்" : "Acres",
    yes: lang === "ta" ? "உண்டு" : "Yes",
    no: lang === "ta" ? "இல்லை" : "No",
    active: lang === "ta" ? "செயலில்" : "Active",
    loading: lang === "ta" ? "ஏற்றுகிறது..." : "Loading...",
    noCultivations: lang === "ta" ? "பயிர்கள் எதுவும் இல்லை." : "No cultivations yet.",
    acres: lang === "ta" ? "ஏக்கர்" : "Acres",
    totalCultivated: lang === "ta" ? "மொத்த பயிர் பரப்பு" : "Total Cultivated Area",
    available: lang === "ta" ? "கிடைக்கும்" : "Available",
    save: lang === "ta" ? "சேமி" : "Save",
    cancel: lang === "ta" ? "ரத்து" : "Cancel",
    used: lang === "ta" ? "பயன்படுத்தியது" : "used",
    remaining: lang === "ta" ? "மீதம்" : "remaining",
    startDate: lang === "ta" ? "தொடக்க தேதி" : "Start Date",
    statusActive: lang === "ta" ? "செயலில்" : "Active",
    statusDone: lang === "ta" ? "பயிர் முடிந்தது" : "Cultivation Done",
    completedOn: lang === "ta" ? "நிறைவு செய்யப்பட்டது" : "Completed on",
    activeCount: lang === "ta" ? "செயலில்" : "Active",
    doneCount: lang === "ta" ? "முடிந்தவை" : "Done",
  };

  if (loading) {
    return (
      <div className="flex h-screen overflow-hidden bg-page">
        <Sidebar lang={lang} setLang={setLang} />
        <main className="flex-1 p-3 flex flex-col gap-3">
          <div className="h-12 bg-gray-200 rounded-xl animate-pulse" />
          <div className="flex gap-3 flex-1">
            <div className="w-[40%] bg-gray-200 rounded-2xl animate-pulse" />
            <div className="w-[60%] bg-gray-200 rounded-2xl animate-pulse" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <Sidebar lang={lang} setLang={setLang} />

      <main className="flex-1 overflow-hidden p-3 flex flex-col gap-3">

        {/* Header bar */}
        <div className="bg-white rounded-xl shadow-sm py-2 px-4 flex items-center justify-between shrink-0">
          <Link href="/" className="text-primary hover:text-primary text-sm font-semibold">
            ← {t.back}
          </Link>
          <h1 className="text-xl font-bold text-primary">{farm?.name}</h1>
          <button
            onClick={() => setLang(lang === "ta" ? "en" : "ta")}
            className="px-3 py-1.5 rounded-lg border border-primary/40 text-primary text-sm font-medium hover:bg-green-50 transition"
          >
            {lang === "ta" ? "English" : "தமிழ்"}
          </button>
        </div>

        {/* Two columns */}
        <div className="flex flex-row gap-3 flex-1 overflow-hidden">

          {/* Farm Info Card (40%) */}
          <div className="w-[40%] bg-white rounded-2xl shadow-sm border border-green-100 border-l-4 border-l-green-500 p-3 h-full overflow-hidden flex flex-col">
            <h2 className="text-sm font-semibold text-gray-800 mb-1 flex items-center gap-2 shrink-0">
              <span className="w-6 h-6 bg-green-100 rounded-lg flex items-center justify-center text-xs">🌳</span>
              {t.farmInfo}
            </h2>

            <div className="overflow-y-auto flex-1">
              <div className="mb-1">
                <label className="text-xs text-gray-600">{t.farmName}</label>
                <input
                  type="text"
                  placeholder={t.farmNamePlaceholder}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white text-gray-900 placeholder:text-sm"
                />
              </div>
              <div className="mb-1">
                <label className="text-xs text-gray-600">{t.totalArea}</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder={t.acresPlaceholder}
                  value={totalArea}
                  onChange={(e) => setTotalArea(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white text-gray-900 placeholder:text-sm"
                />
              </div>
              <div className="mb-1">
                <label className="text-xs text-gray-600">{t.surveyNumbers}</label>
                <input
                  type="text"
                  placeholder={t.surveyNumbersPlaceholder}
                  value={surveyNumbers}
                  onChange={(e) => setSurveyNumbers(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white text-gray-900 placeholder:text-sm"
                />
              </div>
              <div className="mb-1">
                <label className="text-xs text-gray-600">{t.pattaNumber}</label>
                <input
                  type="text"
                  placeholder={t.pattaNumberPlaceholder}
                  value={pattaNumber}
                  onChange={(e) => setPattaNumber(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white text-gray-900 placeholder:text-sm"
                />
              </div>

              <div className="flex items-center gap-2 mt-2">
                <label className="text-xs text-gray-700">{t.well}</label>
                <TogglePill value={hasWell} onChange={setHasWell} yesLabel={t.yes} noLabel={t.no} />
              </div>
              <div className="mt-1">
                <label className="text-xs font-normal text-gray-500 mt-1">{t.wellDepth}</label>
                <input
                  type="text"
                  placeholder={t.wellDepthPlaceholder}
                  value={wellDepth}
                  onChange={(e) => setWellDepth(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white text-gray-900 placeholder:text-sm"
                />
              </div>

              <div className="flex items-center gap-2 mt-2">
                <label className="text-xs text-gray-700">{t.motor}</label>
                <TogglePill value={hasMotor} onChange={setHasMotor} yesLabel={t.yes} noLabel={t.no} />
              </div>
              <div className="mt-1">
                <label className="text-xs font-normal text-gray-500 mt-1">{t.motorDetails}</label>
                <input
                  type="text"
                  placeholder={t.motorDetailsPlaceholder}
                  value={motorDetails}
                  onChange={(e) => setMotorDetails(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white text-gray-900 placeholder:text-sm"
                />
              </div>

              {farm?.has_motor && <MotorSharingSection ref={motorSharingRef} farmId={id} language={lang} />}
            </div>

            <button
              onClick={saveFarm}
              disabled={saving}
              className="shrink-0 w-full bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg py-1.5 text-sm font-medium transition shadow-sm"
            >
              {saving ? "..." : t.saveChanges}
            </button>
          </div>

          {/* Current Cultivations Card (60%) */}
          <div className="w-[60%] bg-white rounded-2xl shadow-sm border border-green-100 p-3 h-full overflow-hidden flex flex-col">

            <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
              <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <span className="w-6 h-6 bg-green-100 rounded-lg flex items-center justify-center text-xs">🌾</span>
                {t.cultivations}
                <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
                  {activeCultivationsCount} {t.activeCount}, {doneCultivationsCount} {t.doneCount}
                </span>
              </h2>

              <div className="flex flex-col items-end gap-0.5">
                <div className="flex flex-wrap gap-2 justify-end">
                  <select
                    value={cropType}
                    onChange={(e) => setCropType(e.target.value)}
                    className="bg-white border border-gray-300 text-gray-900 rounded-lg px-2 py-1.5 text-sm min-w-[150px] focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option className="text-gray-900" value="">{t.selectCrop}</option>
                    {CROP_TYPES.map((c) => (
                      <option className="text-gray-900" key={c.value} value={c.value}>
                        {c.icon} {lang === "ta" ? c.labelTa : c.labelEn}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={t.acresPlaceholder}
                    value={cropArea}
                    onChange={(e) => setCropArea(e.target.value)}
                    className="bg-white border border-gray-300 text-gray-900 rounded-lg px-2 py-1.5 text-sm w-24 truncate placeholder:text-sm placeholder:text-gray-500 placeholder:truncate focus:outline-none focus:ring-2 focus:ring-primary"
                  />

                  <input
                    type="date"
                    title={t.startDate}
                    value={cropStartDate}
                    onChange={(e) => setCropStartDate(e.target.value)}
                    className="bg-white border border-gray-300 text-gray-900 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />

                  <button
                    onClick={addCultivation}
                    disabled={addingCultivation || isFull}
                    className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-3 py-1.5 text-sm font-medium transition shadow-sm shrink-0"
                  >
                    {addingCultivation ? "..." : t.addCultivation}
                  </button>
                </div>
                <span className="text-xs text-primary font-medium">
                  {t.available}: {Math.max(remainingArea, 0).toFixed(2)} {t.acres}
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="shrink-0 mt-2">
              <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${barColor} transition-all`}
                  style={{ width: `${usedPercent}%` }}
                />
              </div>
              <p className="text-xs text-gray-600 font-medium mt-1">
                {usedArea.toFixed(2)} / {farmTotalArea.toFixed(2)} {t.acres} {t.used}
                {" "}({Math.max(remainingArea, 0).toFixed(2)} {t.remaining})
              </p>
            </div>

            {cultivations.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-sm font-semibold gap-2">
                <span className="text-3xl">🌱</span>
                {t.noCultivations}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto mt-2 grid grid-cols-2 lg:grid-cols-3 gap-2 content-start">
                {cultivations.map((item) => {
                  const crop = cropInfo(item.crop_type);
                  const isDone = !!item.end_date;

                  return (
                    <Link key={item.id} href={`/crops/${item.id}`}>
                      <div className="group relative bg-white rounded-2xl border border-gray-100 hover:border-green-300 hover:bg-green-50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer p-3 flex items-center gap-2">
                        <span className="text-2xl shrink-0">{crop.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <h3 className="text-sm font-semibold text-gray-900 truncate">
                              {lang === "ta" ? crop.labelTa : crop.labelEn}
                            </h3>
                            <span className="text-xs text-gray-500 shrink-0">{item.area} {t.acres}</span>
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            {isDone ? (
                              <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                                ✓ {t.statusDone}
                              </span>
                            ) : (
                              <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">
                                ● {t.statusActive}
                              </span>
                            )}
                          </div>
                          {isDone && (
                            <p className="text-xs text-gray-600 mt-0.5">
                              {t.completedOn}: {formatDMY(item.end_date)}
                            </p>
                          )}
                        </div>
                        <span className="text-gray-400 group-hover:text-green-600 text-sm shrink-0">→</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            <div className="shrink-0 mt-2 pt-2 border-t border-gray-100 text-sm font-medium text-gray-700">
              {t.totalCultivated}: <span className="font-bold text-primary">{usedArea.toFixed(2)} {t.acres}</span>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
