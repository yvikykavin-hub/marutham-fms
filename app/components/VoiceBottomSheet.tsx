"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { ActivityLog } from "../lib/activityLog";
import { processKeywords, detectExpenseCategory } from "../lib/voiceKeywords";

interface VoiceBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  language: string;
}

type VoiceState = "idle" | "listening" | "processing" | "confirm" | "saving" | "saved";

interface FormData {
  module: string;
  animal_type: string;
  date: string;
  // milk fields
  morning_litres: number;
  evening_litres: number;
  // expense fields
  amount: number;
  category: string;
  description: string;
  // income fields
  sale_type: "weight" | "bird";
  weight_kg: number;
  rate_per_kg: number;
  number_sold: number;
  rate_per_bird: number;
  total_amount: number;
  buyer_name: string;
}

// Spread into every setFormData call outside the income branch so
// FormData's (required) income fields always have a sane, empty default.
const EMPTY_INCOME_FIELDS = {
  sale_type: "weight" as const,
  weight_kg: 0,
  rate_per_kg: 0,
  number_sold: 0,
  rate_per_bird: 0,
  total_amount: 0,
  buyer_name: "",
};

const incomeTotal = (r: { sale_type?: "weight" | "bird"; weight_kg?: number; rate_per_kg?: number; number_sold?: number; rate_per_bird?: number; total_amount?: number }) => {
  if (r.total_amount) return r.total_amount;
  if (r.sale_type === "bird") return (r.number_sold || 0) * (r.rate_per_bird || 0);
  return (r.weight_kg || 0) * (r.rate_per_kg || 0);
};

type AnimalOption = { id: string; name: string };

type CategoryOption = { key: string; icon: string; en: string; ta: string };

// Per-animal expense subcategories for the CONFIRM screen — keys match
// exactly what saveLivestockExpense writes to expense_type (snake_case DB
// values for cow/buffalo's shared cow_expenses table; the goat/hen pages'
// own label keys for goat_expenses/hen_expenses).
const getCategoryOptions = (animalType: string): CategoryOption[] => {
  if (animalType === "cow" || animalType === "buffalo") {
    return [
      { key: "rice_feed", icon: "🌾", en: "Rice Feed", ta: "அரிசி தீவனம்" },
      { key: "normal_feed", icon: "🌿", en: "Normal Feed", ta: "சாதாரண தீவனம்" },
      { key: "medicine", icon: "💊", en: "Medicine", ta: "மருந்து" },
      { key: "vaccination", icon: "💉", en: "Vaccination", ta: "தடுப்பூசி" },
      { key: "veterinary", icon: "👨‍⚕️", en: "Veterinary", ta: "டாக்டர்" },
      { key: "ai", icon: "🔬", en: "AI", ta: "கருவூட்டல்" },
      { key: "shed_maintenance", icon: "🏚️", en: "Shed", ta: "தொழுவம்" },
      { key: "other", icon: "📦", en: "Other", ta: "மற்றவை" },
    ];
  }
  if (animalType === "goat") {
    return [
      { key: "feed", icon: "🌿", en: "Feed", ta: "தீவனம்" },
      { key: "brownLeafRolls", icon: "🍂", en: "Leaf Rolls", ta: "இலை சுருள்" },
      { key: "medicine", icon: "💊", en: "Medicine", ta: "மருந்து" },
      { key: "vaccination", icon: "💉", en: "Vaccination", ta: "தடுப்பூசி" },
      { key: "veterinary", icon: "👨‍⚕️", en: "Veterinary", ta: "டாக்டர்" },
      { key: "other", icon: "📦", en: "Other", ta: "மற்றவை" },
    ];
  }
  if (animalType === "hen") {
    return [
      { key: "feed", icon: "🌾", en: "Feed", ta: "தீவனம்" },
      { key: "medicine", icon: "💊", en: "Medicine", ta: "மருந்து" },
      { key: "vaccination", icon: "💉", en: "Vaccination", ta: "தடுப்பூசி" },
      { key: "shedMaintenance", icon: "🏚️", en: "Shed", ta: "கூடு பழுது" },
      { key: "miscellaneous", icon: "🔧", en: "Misc", ta: "இதர" },
      { key: "other", icon: "📦", en: "Other", ta: "மற்றவை" },
    ];
  }
  return [];
};

// Same fallback default detectExpenseCategory("", animalType) would produce —
// used to seed formData.category before any transcript keyword has matched.
const defaultCategoryFor = (animalType: string): string => detectExpenseCategory("", animalType);

export default function VoiceBottomSheet({ isOpen, onClose, language }: VoiceBottomSheetProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [formData, setFormData] = useState<FormData | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [animalOptions, setAnimalOptions] = useState<AnimalOption[]>([]);
  const [selectedAnimalId, setSelectedAnimalId] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  // recognition.onend needs the latest transcript the instant speech stops —
  // component state read inside that closure would always be stale, so a ref
  // is kept in lockstep with onresult instead.
  const latestTranscriptRef = useRef("");
  // Some mobile browsers (Android Chrome, iOS Safari) silently end
  // SpeechRecognition after a couple seconds of near-silence even with
  // continuous=true. onend can't tell "user tapped STOP" apart from "browser
  // gave up" on its own, so this flag is the source of truth: only a real tap
  // on the STOP button sets it, and onend uses it to decide whether to
  // transparently restart listening or actually finish.
  const manualStopRef = useRef(false);

  const L = (en: string, ta: string) => (language === "ta" ? ta : en);
  const today = new Date().toISOString().split("T")[0];

  const stopListening = useCallback(() => {
    manualStopRef.current = true;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const resetState = useCallback(() => {
    setVoiceState("idle");
    setLiveTranscript("");
    setFinalTranscript("");
    setFormData(null);
    setRecordingTime(0);
    setAnimalOptions([]);
    setSelectedAnimalId("");
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      // Deferred via microtask rather than called synchronously in the effect body —
      // avoids the cascading-render lint warning while still resetting before paint.
      Promise.resolve().then(() => {
        stopListening();
        resetState();
      });
    }
  }, [isOpen, stopListening, resetState]);

  // Goat/hen expenses AND income both require a specific animal record
  // (goat_id / hen_id) — there's no farm-wide table for them the way
  // cow_expenses covers both cow and buffalo, so fetch the farm's animals
  // of that type whenever the form data points at one.
  useEffect(() => {
    const needsAnimalPick =
      voiceState === "confirm" &&
      (formData?.module === "livestock_expense" || formData?.module === "livestock_income") &&
      (formData?.animal_type === "goat" || formData?.animal_type === "hen");

    if (!needsAnimalPick) {
      Promise.resolve().then(() => {
        setAnimalOptions([]);
        setSelectedAnimalId("");
      });
      return;
    }

    const table = formData!.animal_type === "goat" ? "goats" : "hens";
    supabase
      .from(table)
      .select("id, name")
      .eq("current_status", "active")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const options = data || [];
        setAnimalOptions(options);
        setSelectedAnimalId(options.length > 0 ? options[0].id : "");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceState, formData?.module, formData?.animal_type]);

  const processVoice = async (text: string) => {
    setVoiceState("processing");

    // Step 1: Try keyword engine first (instant, free, works offline)
    const keywordResult = processKeywords(text);

    if (keywordResult.confidence >= 70 && keywordResult.module !== "unknown") {
      if (keywordResult.module === "livestock_income") {
        // Income only applies to goat/hen — the animal detector's generic
        // cow default is meaningless here, so normalize it to goat.
        const incomeAnimal = keywordResult.animal_type === "hen" ? "hen" : "goat";
        setFormData({
          module: "livestock_income",
          animal_type: incomeAnimal,
          date: keywordResult.date,
          morning_litres: 0,
          evening_litres: 0,
          amount: 0,
          category: "",
          description: "",
          sale_type: keywordResult.sale_type || "weight",
          weight_kg: keywordResult.weight_kg || 0,
          rate_per_kg: keywordResult.rate_per_kg || 0,
          number_sold: keywordResult.number_sold || 0,
          rate_per_bird: keywordResult.rate_per_bird || 0,
          total_amount: incomeTotal(keywordResult),
          buyer_name: keywordResult.buyer_name || "",
        });
        setVoiceState("confirm");
        return;
      }

      setFormData({
        module: keywordResult.module,
        animal_type: keywordResult.animal_type,
        date: keywordResult.date,
        morning_litres: keywordResult.morning_litres || 0,
        evening_litres: keywordResult.evening_litres || 0,
        amount: keywordResult.amount || 0,
        category: keywordResult.category || defaultCategoryFor(keywordResult.animal_type),
        description: "",
        ...EMPTY_INCOME_FIELDS,
      });
      setVoiceState("confirm");
      return;
    }

    // Step 2: Low confidence - fall back to Gemini
    try {
      const response = await fetch("/api/voice-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, language }),
      });

      const data = await response.json();

      if (data.success && data.result) {
        const r = data.result;

        if (r.module === "livestock_income") {
          const incomeAnimal = r.animal_type === "hen" ? "hen" : "goat";
          const saleType: "weight" | "bird" = r.sale_type === "bird" ? "bird" : "weight";
          setFormData({
            module: "livestock_income",
            animal_type: incomeAnimal,
            date: r.date || today,
            morning_litres: 0,
            evening_litres: 0,
            amount: 0,
            category: "",
            description: "",
            sale_type: saleType,
            weight_kg: Number(r.weight_kg) || 0,
            rate_per_kg: Number(r.rate_per_kg) || 0,
            number_sold: Number(r.number_sold) || 0,
            rate_per_bird: Number(r.rate_per_bird) || 0,
            total_amount: incomeTotal({
              sale_type: saleType,
              weight_kg: Number(r.weight_kg) || 0,
              rate_per_kg: Number(r.rate_per_kg) || 0,
              number_sold: Number(r.number_sold) || 0,
              rate_per_bird: Number(r.rate_per_bird) || 0,
              total_amount: Number(r.total_amount) || 0,
            }),
            buyer_name: r.buyer_name || "",
          });
          setVoiceState("confirm");
          return;
        }

        const resolvedAnimal = r.animal_type || "cow";
        // Gemini is asked to return an exact category key, but LLM output
        // isn't guaranteed — fall back to the keyword detector (over this
        // same transcript) if it returns something outside the valid set.
        const validKeys = getCategoryOptions(resolvedAnimal).map((c) => c.key);
        const resolvedCategory = validKeys.includes(r.category) ? r.category : detectExpenseCategory(text, resolvedAnimal);
        setFormData({
          module: r.module === "milk_collection" ? "milk_collection" : "livestock_expense",
          animal_type: resolvedAnimal,
          date: r.date || today,
          morning_litres: Number(r.morning_litres) || 0,
          evening_litres: Number(r.evening_litres) || 0,
          amount: Number(r.amount) || 0,
          category: resolvedCategory,
          description: r.description || "",
          ...EMPTY_INCOME_FIELDS,
        });
        setVoiceState("confirm");
      } else {
        setFormData({
          module: "milk_collection",
          animal_type: "cow",
          date: today,
          morning_litres: 0,
          evening_litres: 0,
          amount: 0,
          category: defaultCategoryFor("cow"),
          description: "",
          ...EMPTY_INCOME_FIELDS,
        });
        setVoiceState("confirm");
        toast(L("Couldn't understand fully. Please fill in the details.", "முழுமையாக புரியவில்லை. விவரங்களை நிரப்பவும்."));
      }
    } catch {
      setFormData({
        module: "milk_collection",
        animal_type: "cow",
        date: today,
        morning_litres: 0,
        evening_litres: 0,
        amount: 0,
        category: defaultCategoryFor("cow"),
        description: "",
        ...EMPTY_INCOME_FIELDS,
      });
      setVoiceState("confirm");
    }
  };

  const startListening = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      toast.error(L("Please use Chrome browser", "Chrome browser பயன்படுத்தவும்"));
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;

    manualStopRef.current = false;
    let finalText = "";
    latestTranscriptRef.current = "";

    // Wrapped in a function (rather than one recognition instance) because
    // some browsers refuse to .start() an instance that has already fired
    // onend — an unexpected auto-stop is recovered from by building a fresh
    // instance and starting it again, invisibly to the user.
    const beginRecognition = () => {
      const recognition = new SR();
      recognitionRef.current = recognition;

      // CONTINUOUS MODE - no auto cutoff, user taps STOP when done.
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language === "ta" ? "ta-IN" : "en-IN";
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setVoiceState("listening");
        // Only reset the timer/transcript UI on the very first start of this
        // session — a restart after a mobile auto-stop should carry on from
        // where it left off, not visually reset to 0:00.
        if (!timerRef.current) {
          setLiveTranscript(latestTranscriptRef.current);
          setRecordingTime(0);
          timerRef.current = setInterval(() => {
            setRecordingTime((prev) => prev + 1);
          }, 1000);
        }
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += t + " ";
          } else {
            interim += t;
          }
        }

        if (final) finalText += final;
        const combined = (finalText + interim).trim();
        latestTranscriptRef.current = combined;
        setLiveTranscript(combined);
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onerror = (event: any) => {
        // "no-speech" fires during ordinary pauses while the user is still
        // thinking — never treat it as an error, just keep listening.
        // onend still fires right after in most browsers, and is handled
        // there by transparently restarting since manualStopRef is unset.
        if (event.error === "no-speech" || event.error === "aborted") {
          return;
        }
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = undefined;
        }
        recognitionRef.current = null;
        toast.error(L("Voice error. Try again.", "பிழை. மீண்டும் முயற்சிக்கவும்."));
        setVoiceState("idle");
      };

      recognition.onend = () => {
        // Not a manual stop — the browser gave up on its own (mobile
        // "no-speech" timeout, brief network hiccup, etc). Restart silently
        // so recording effectively continues until the user taps STOP.
        if (!manualStopRef.current) {
          try {
            beginRecognition();
            return;
          } catch {
            // Restart failed — fall through and finalize with whatever was
            // captured so far rather than leaving the UI stuck.
          }
        }

        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = undefined;
        }
        recognitionRef.current = null;

        const text = latestTranscriptRef.current.trim();
        if (text) {
          setFinalTranscript(text);
          processVoice(text);
        } else {
          setVoiceState("idle");
        }
      };

      recognition.start();
    };

    beginRecognition();
  };

  const handleSave = async () => {
    if (!formData) return;

    if (
      (formData.module === "livestock_expense" || formData.module === "livestock_income") &&
      (formData.animal_type === "goat" || formData.animal_type === "hen") &&
      !selectedAnimalId
    ) {
      toast.error(
        L(
          `Please add a ${formData.animal_type} first from the ${formData.animal_type === "goat" ? "Goats" : "Hens"} page.`,
          "முதலில் அந்த கால்நடையை சேர்க்கவும்."
        )
      );
      return;
    }

    setVoiceState("saving");

    try {
      if (formData.module === "milk_collection") {
        await saveMilkCollection();
      } else if (formData.module === "livestock_income") {
        await saveLivestockIncome();
      } else {
        await saveLivestockExpense();
      }
      setVoiceState("saved");
      setTimeout(onClose, 2000);
    } catch {
      toast.error(L("Save failed. Try again.", "சேமிக்க முடியவில்லை."));
      setVoiceState("confirm");
    }
  };

  const saveMilkCollection = async () => {
    if (!formData) return;
    const animalType = formData.animal_type === "buffalo" ? "buffalo" : "cow";

    // Buffalo tracks its milk rate in a separate table from cow/legacy entries.
    const rateTable = animalType === "buffalo" ? "buffalo_milk_rates" : "milk_rates";
    const { data: rates } = await supabase
      .from(rateTable)
      .select("rate_per_litre, effective_from")
      .order("effective_from", { ascending: false });

    const ratesList = rates || [];
    const applicable = ratesList
      .filter((r) => r.effective_from <= formData.date)
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
    const rate = applicable.length
      ? Number(applicable[0].rate_per_litre)
      : ratesList.length
      ? Number(ratesList[0].rate_per_litre)
      : 0;

    if (rate === 0) {
      throw new Error("No milk rate configured");
    }

    const morningLitres = Number(formData.morning_litres) || 0;
    const eveningLitres = Number(formData.evening_litres) || 0;
    const totalLitres = morningLitres + eveningLitres;

    // Check for an existing entry for this date/animal — update instead of
    // creating a duplicate. A null animal_type is a legacy cow entry.
    const existingQuery = supabase.from("milk_collections").select("id").eq("collection_date", formData.date);
    const { data: existingRows } =
      animalType === "cow"
        ? await existingQuery.or("animal_type.eq.cow,animal_type.is.null").limit(1)
        : await existingQuery.eq("animal_type", animalType).limit(1);
    const existing = existingRows && existingRows.length > 0 ? existingRows[0] : null;

    // total_litres and daily_income are DB-generated columns — never send them explicitly.
    if (existing) {
      const { error } = await supabase
        .from("milk_collections")
        .update({
          morning_litres: morningLitres,
          evening_litres: eveningLitres,
          rate_per_litre: rate,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("milk_collections").insert({
        farm_location: "Home",
        collection_date: formData.date,
        animal_type: animalType,
        morning_litres: morningLitres,
        evening_litres: eveningLitres,
        rate_per_litre: rate,
        month_year: formData.date.slice(0, 7),
      });
      if (error) throw error;
    }

    await ActivityLog.added("Milk Collection", `Voice: ${animalType} milk ${totalLitres.toFixed(1)}L`);
    toast.success(L("✅ Milk saved!", "✅ பால் சேமிக்கப்பட்டது!"));
  };

  const saveLivestockExpense = async () => {
    if (!formData) return;

    const tableMap: Record<string, string> = {
      cow: "cow_expenses",
      buffalo: "cow_expenses",
      goat: "goat_expenses",
      hen: "hen_expenses",
    };
    const table = tableMap[formData.animal_type] || "cow_expenses";
    const amount = Number(formData.amount) || 0;
    // formData.category is already the correct value to save to DB — for
    // cow/buffalo it's the exact cow_expenses.expense_type key (rice_feed,
    // normal_feed, ...), for goat/hen it's that page's own label key
    // (feed, brownLeafRolls, shedMaintenance, ...). Falls back defensively
    // in case formData somehow reached here with an empty category.
    const category = formData.category || defaultCategoryFor(formData.animal_type);

    // cow_expenses is shared across cow/buffalo (no animal_type column of its
    // own); goat_expenses/hen_expenses instead key off a specific goat_id/hen_id.
    if (table === "cow_expenses") {
      const { error } = await supabase.from("cow_expenses").insert({
        farm_location: "Home",
        expense_date: formData.date,
        expense_type: category,
        amount,
        description: formData.description || null,
      });
      if (error) throw error;
    } else if (table === "goat_expenses") {
      const { error } = await supabase.from("goat_expenses").insert({
        goat_id: selectedAnimalId,
        farm_location: "Home",
        expense_date: formData.date,
        expense_type: category,
        amount,
        description: formData.description || null,
      });
      if (error) throw error;
    } else {
      const { error } = await supabase.from("hen_expenses").insert({
        hen_id: selectedAnimalId,
        farm_location: "Home",
        expense_date: formData.date,
        expense_type: category,
        amount,
        description: formData.description || null,
      });
      if (error) throw error;
    }

    const moduleMap: Record<string, "Cow Expense" | "Goat Expense" | "Hen Expense"> = {
      cow: "Cow Expense",
      buffalo: "Cow Expense",
      goat: "Goat Expense",
      hen: "Hen Expense",
    };
    await ActivityLog.added(
      moduleMap[formData.animal_type] || "Cow Expense",
      `Voice: ${formData.animal_type} ${formData.category} ₹${amount}`
    );
    toast.success(L("✅ Expense saved!", "✅ செலவு சேமிக்கப்பட்டது!"));
  };

  const saveLivestockIncome = async () => {
    if (!formData) return;
    const amount = Number(formData.total_amount) || 0;
    const buyerName = formData.buyer_name.trim() || null;

    // goat_income/hen_income both key off a specific animal (goat_id/hen_id
    // is NOT NULL) — same as the manual "Add Sale" forms on the Goats/Hens
    // pages, selectedAnimalId is required and validated before this runs.
    if (formData.animal_type === "goat") {
      const { error } = await supabase.from("goat_income").insert({
        goat_id: selectedAnimalId,
        farm_location: "Home",
        sale_date: formData.date,
        weight_kg: formData.weight_kg || null,
        rate_per_kg: formData.rate_per_kg || null,
        total_amount: amount,
        buyer_name: buyerName,
        remarks: "Voice entry",
      });
      if (error) throw error;
    } else {
      const isBird = formData.sale_type === "bird";
      const { error } = await supabase.from("hen_income").insert({
        hen_id: selectedAnimalId,
        farm_location: "Home",
        sale_date: formData.date,
        sale_type: formData.sale_type,
        weight_kg: !isBird ? formData.weight_kg || null : null,
        rate_per_kg: !isBird ? formData.rate_per_kg || null : null,
        number_sold: isBird ? formData.number_sold || null : null,
        rate_per_bird: isBird ? formData.rate_per_bird || null : null,
        total_amount: amount,
        buyer_name: buyerName,
        remarks: "Voice entry",
      });
      if (error) throw error;
    }

    await ActivityLog.added(
      formData.animal_type === "goat" ? "Goat Income" : "Hen Income",
      `Voice: ${formData.animal_type} sold ₹${amount}`
    );
    toast.success(L("✅ Income saved!", "✅ வருமானம் சேமிக்கப்பட்டது!"));
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[80]"
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[81] bg-white dark:bg-slate-800 rounded-t-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-slate-600" />
            </div>

            <div className="px-5 pb-8 pt-2">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🎤</span>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{L("Voice Input", "குரல் உள்ளீடு")}</h3>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-gray-500 text-sm active:scale-95"
                >
                  ✕
                </button>
              </div>

              <AnimatePresence mode="wait">
                {/* ── IDLE STATE ── */}
                {voiceState === "idle" && (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="flex flex-col items-center gap-5"
                  >
                    {/* Big mic button */}
                    <motion.button
                      onClick={startListening}
                      whileTap={{ scale: 0.93 }}
                      className="w-28 h-28 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 shadow-xl flex items-center justify-center text-white"
                    >
                      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                      </svg>
                    </motion.button>

                    <div className="text-center">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{L("Tap to start speaking", "பேச தட்டவும்")}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {L("Tap mic → Speak → Tap STOP when done", "தட்டவும் - பேசுங்கள் - மீண்டும் தட்டி நிறுத்துங்கள்")}
                      </p>
                    </div>

                    {/* Example phrases */}
                    <div className="w-full bg-gray-50 dark:bg-slate-700/50 rounded-2xl p-4">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">💡 {L("Try saying:", "இப்படி சொல்லுங்கள்:")}</p>
                      <div className="space-y-1.5">
                        {(language === "ta"
                          ? [
                              '"இன்று பசு காலை நாலரை மாலை மூணு லிட்டர்"',
                              '"நேத்து மாட்டுக்கு தீவனம் 500 ரூபாய்"',
                              '"இன்று ஆடு விற்றோம் 25 கிலோ 300 ரூபாய்"',
                              '"இன்று கோழி விற்றோம் 10 கோழி 150 ரூபாய்"',
                            ]
                          : [
                              '"Today cow milk morning 4.5 evening 3 litres"',
                              '"Spent 500 on cattle feed today"',
                              '"Sold goat today 25kg at 300 per kg"',
                              '"Sold 10 hens today at 150 per bird"',
                            ]
                        ).map((ex, i) => (
                          <p key={i} className="text-xs text-gray-500 dark:text-gray-400 italic">
                            {ex}
                          </p>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ── LISTENING STATE ── */}
                {voiceState === "listening" && (
                  <motion.div key="listening" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4">
                    {/* Animated mic with rings */}
                    <div className="relative flex items-center justify-center w-36 h-36">
                      <motion.div
                        animate={{ scale: [1, 1.4, 1], opacity: [0.2, 0.0, 0.2] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                        className="absolute w-36 h-36 rounded-full bg-green-400"
                      />
                      <motion.div
                        animate={{ scale: [1, 1.25, 1], opacity: [0.3, 0.0, 0.3] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 0.3 }}
                        className="absolute w-28 h-28 rounded-full bg-green-400"
                      />
                      <button
                        onClick={stopListening}
                        className="relative z-10 w-24 h-24 rounded-full bg-gradient-to-br from-red-500 to-red-600 shadow-xl flex flex-col items-center justify-center text-white active:scale-95 transition-transform"
                      >
                        {/* Square stop icon */}
                        <div className="w-6 h-6 rounded-md bg-white mb-1.5" />
                        <span className="text-xs font-bold tracking-wide">{L("STOP", "நிறுத்து")}</span>
                      </button>
                    </div>

                    {/* Timer */}
                    <div className="flex items-center gap-2">
                      <motion.div
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="w-2 h-2 rounded-full bg-red-500"
                      />
                      <span className="text-sm font-mono text-gray-600 dark:text-gray-400">{formatTime(recordingTime)}</span>
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">{L("Listening...", "கேட்கிறோம்...")}</span>
                    </div>

                    {/* Live transcript */}
                    <div className="w-full min-h-[60px] bg-green-50 dark:bg-green-900/20 rounded-2xl p-4 border border-green-100 dark:border-green-800/30">
                      {liveTranscript ? (
                        <p className="text-sm text-green-800 dark:text-green-300 italic">&quot;{liveTranscript}&quot;</p>
                      ) : (
                        <p className="text-sm text-green-400 text-center">{L("Start speaking...", "பேசத் தொடங்குங்கள்...")}</p>
                      )}
                    </div>

                    <p className="text-xs text-gray-400 text-center">{L("Tap the red STOP button when done", "முடிந்ததும் சிவப்பு STOP ஐ தட்டவும்")}</p>
                  </motion.div>
                )}

                {/* ── PROCESSING STATE ── */}
                {voiceState === "processing" && (
                  <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4 py-8">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="text-5xl">
                      🌾
                    </motion.div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{L("Understanding your input...", "புரிந்துகொள்கிறோம்...")}</p>
                    {finalTranscript && (
                      <div className="w-full bg-gray-50 dark:bg-slate-700/50 rounded-xl p-3">
                        <p className="text-xs text-gray-500 italic text-center">&quot;{finalTranscript}&quot;</p>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* ── CONFIRM STATE ── */}
                {voiceState === "confirm" && formData && (
                  <motion.div key="confirm" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                    {/* What you said */}
                    {finalTranscript && (
                      <div className="bg-gray-50 dark:bg-slate-700/30 rounded-xl px-3 py-2">
                        <p className="text-xs text-gray-400 mb-0.5">{L("You said:", "நீங்கள் சொன்னது:")}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-300 italic">&quot;{finalTranscript}&quot;</p>
                      </div>
                    )}

                    {/* Module selector */}
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{L("Type", "வகை")}</label>
                      <div className="flex gap-2">
                        {[
                          { key: "milk_collection", icon: "🥛", en: "Milk", ta: "பால்" },
                          { key: "livestock_expense", icon: "💰", en: "Expense", ta: "செலவு" },
                          { key: "livestock_income", icon: "💵", en: "Income", ta: "வருமானம்" },
                        ].map((opt) => (
                          <button
                            key={opt.key}
                            onClick={() =>
                              setFormData({
                                ...formData,
                                module: opt.key,
                                // Income only supports goat/hen — reset off cow/buffalo
                                // so the (now-hidden) selector never leaves an invalid pick.
                                animal_type:
                                  opt.key === "livestock_income" && formData.animal_type !== "goat" && formData.animal_type !== "hen"
                                    ? "goat"
                                    : formData.animal_type,
                              })
                            }
                            className={`flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
                              formData.module === opt.key ? "bg-green-600 text-white" : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400"
                            }`}
                          >
                            {opt.icon}
                            {L(opt.en, opt.ta)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Animal — income has its own goat/hen-only picker below */}
                    {formData.module !== "livestock_income" && (
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{L("Animal", "கால்நடை")}</label>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { key: "cow", icon: "🐄", en: "Cow", ta: "பசு" },
                            { key: "buffalo", icon: "🐃", en: "Buffalo", ta: "எருமை" },
                            { key: "goat", icon: "🐐", en: "Goat", ta: "ஆடு" },
                            { key: "hen", icon: "🐓", en: "Hen", ta: "கோழி" },
                          ].map((a) => (
                            <button
                              key={a.key}
                              onClick={() =>
                                setFormData({
                                  ...formData,
                                  animal_type: a.key,
                                  // The previous category key may not exist for the newly
                                  // picked animal's subcategory set — reseed it so a stale
                                  // selection never gets silently saved.
                                  category: defaultCategoryFor(a.key),
                                })
                              }
                              className={`py-2 rounded-xl text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                                formData.animal_type === a.key ? "bg-green-600 text-white" : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400"
                              }`}
                            >
                              <span>{a.icon}</span>
                              <span>{L(a.en, a.ta)}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Specific goat/hen picker — required since goat_expenses/hen_expenses
                        key off a specific animal, unlike the shared cow_expenses table.
                        (Income has its own equivalent picker further below.) */}
                    {formData.module === "livestock_expense" && (formData.animal_type === "goat" || formData.animal_type === "hen") && (
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                          {formData.animal_type === "goat" ? L("Which goat?", "எந்த ஆடு?") : L("Which hen?", "எந்த கோழி?")}
                        </label>
                        {animalOptions.length > 0 ? (
                          <select
                            value={selectedAnimalId}
                            onChange={(e) => setSelectedAnimalId(e.target.value)}
                            className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                          >
                            {animalOptions.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-xs text-danger">
                            {L(
                              `No active ${formData.animal_type}s found. Add one from the ${formData.animal_type === "goat" ? "Goats" : "Hens"} page first.`,
                              "செயலில் உள்ள கால்நடை இல்லை. முதலில் சேர்க்கவும்."
                            )}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Date — income has its own Date field below */}
                    {formData.module !== "livestock_income" && (
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{L("Date", "தேதி")}</label>
                        <input
                          type="date"
                          value={formData.date}
                          max={today}
                          onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                          className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                    )}

                    {/* Milk fields */}
                    {formData.module === "milk_collection" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">☀️ {L("Morning (L)", "காலை (L)")}</label>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={formData.morning_litres}
                            onChange={(e) => setFormData({ ...formData, morning_litres: Number(e.target.value) })}
                            onKeyDown={(e) => {
                              if (e.key === "-") e.preventDefault();
                            }}
                            className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">🌙 {L("Evening (L)", "மாலை (L)")}</label>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={formData.evening_litres}
                            onChange={(e) => setFormData({ ...formData, evening_litres: Number(e.target.value) })}
                            onKeyDown={(e) => {
                              if (e.key === "-") e.preventDefault();
                            }}
                            className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                        </div>
                      </div>
                    )}

                    {/* Expense fields */}
                    {formData.module === "livestock_expense" && (
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{L("Amount (₹)", "தொகை (₹)")}</label>
                          <input
                            type="number"
                            min="0"
                            value={formData.amount}
                            onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                            onKeyDown={(e) => {
                              if (e.key === "-") e.preventDefault();
                            }}
                            className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{L("Category", "வகை")}</label>
                          <div className="grid grid-cols-4 gap-2">
                            {getCategoryOptions(formData.animal_type).map((c) => (
                              <button
                                key={c.key}
                                onClick={() => setFormData({ ...formData, category: c.key })}
                                className={`py-2 px-1 rounded-xl text-xs font-medium flex flex-col items-center gap-1 transition-all active:scale-95 ${
                                  formData.category === c.key ? "bg-green-600 text-white" : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400"
                                }`}
                              >
                                <span>{c.icon}</span>
                                <span>{L(c.en, c.ta)}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{L("Description", "விவரம்")}</label>
                          <input
                            type="text"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder={L("Optional details", "கூடுதல் விவரம்")}
                            className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                        </div>
                      </div>
                    )}

                    {/* Income fields */}
                    {formData.module === "livestock_income" && (
                      <div className="space-y-3">
                        {/* Animal - only goat/hen for income */}
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{L("Animal", "கால்நடை")}</label>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { key: "goat", icon: "🐐", en: "Goat", ta: "ஆடு" },
                              { key: "hen", icon: "🐓", en: "Hen", ta: "கோழி" },
                            ].map((a) => (
                              <button
                                key={a.key}
                                onClick={() => setFormData({ ...formData, animal_type: a.key, sale_type: "weight" })}
                                className={`py-2 rounded-xl text-xs font-medium flex flex-col items-center gap-1 transition-all active:scale-95 ${
                                  formData.animal_type === a.key ? "bg-green-600 text-white" : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400"
                                }`}
                              >
                                <span>{a.icon}</span>
                                <span>{L(a.en, a.ta)}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Which specific goat/hen — required since goat_income/hen_income
                            key off a specific animal record. */}
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                            {formData.animal_type === "goat" ? L("Which goat?", "எந்த ஆடு?") : L("Which hen?", "எந்த கோழி?")}
                          </label>
                          {animalOptions.length > 0 ? (
                            <select
                              value={selectedAnimalId}
                              onChange={(e) => setSelectedAnimalId(e.target.value)}
                              className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                            >
                              {animalOptions.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <p className="text-xs text-danger">
                              {L(
                                `No active ${formData.animal_type}s found. Add one from the ${formData.animal_type === "goat" ? "Goats" : "Hens"} page first.`,
                                "செயலில் உள்ள கால்நடை இல்லை. முதலில் சேர்க்கவும்."
                              )}
                            </p>
                          )}
                        </div>

                        {/* Date */}
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{L("Date", "தேதி")}</label>
                          <input
                            type="date"
                            value={formData.date}
                            max={today}
                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                            className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                        </div>

                        {/* Sale type toggle - only for hen */}
                        {formData.animal_type === "hen" && (
                          <div>
                            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{L("Sale Type", "விற்பனை வகை")}</label>
                            <div className="flex gap-1 bg-gray-100 dark:bg-slate-700 rounded-xl p-1">
                              <button
                                onClick={() => setFormData({ ...formData, sale_type: "weight" })}
                                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                                  formData.sale_type === "weight"
                                    ? "bg-white dark:bg-slate-600 text-green-700 dark:text-green-400 shadow-sm"
                                    : "text-gray-500 dark:text-gray-400"
                                }`}
                              >
                                ⚖️ {L("By Weight", "எடையில்")}
                              </button>
                              <button
                                onClick={() => setFormData({ ...formData, sale_type: "bird" })}
                                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                                  formData.sale_type === "bird"
                                    ? "bg-white dark:bg-slate-600 text-green-700 dark:text-green-400 shadow-sm"
                                    : "text-gray-500 dark:text-gray-400"
                                }`}
                              >
                                🐓 {L("Per Bird", "ஒவ்வொரு கோழி")}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Weight based fields */}
                        {(formData.animal_type === "goat" || formData.sale_type === "weight") && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">⚖️ {L("Weight (kg)", "எடை (கி)")}</label>
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={formData.weight_kg}
                                onChange={(e) => {
                                  const w = Number(e.target.value);
                                  setFormData({ ...formData, weight_kg: w, total_amount: w * formData.rate_per_kg });
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "-") e.preventDefault();
                                }}
                                className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">💰 {L("Rate/kg (₹)", "விலை/கி (₹)")}</label>
                              <input
                                type="number"
                                min="0"
                                value={formData.rate_per_kg}
                                onChange={(e) => {
                                  const r = Number(e.target.value);
                                  setFormData({ ...formData, rate_per_kg: r, total_amount: formData.weight_kg * r });
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "-") e.preventDefault();
                                }}
                                className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                              />
                            </div>
                          </div>
                        )}

                        {/* Bird based fields */}
                        {formData.animal_type === "hen" && formData.sale_type === "bird" && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">🐓 {L("No. of Birds", "கோழி எண்")}</label>
                              <input
                                type="number"
                                min="0"
                                value={formData.number_sold}
                                onChange={(e) => {
                                  const n = Number(e.target.value);
                                  setFormData({ ...formData, number_sold: n, total_amount: n * formData.rate_per_bird });
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "-") e.preventDefault();
                                }}
                                className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">💰 {L("Rate/Bird (₹)", "விலை/கோழி (₹)")}</label>
                              <input
                                type="number"
                                min="0"
                                value={formData.rate_per_bird}
                                onChange={(e) => {
                                  const r = Number(e.target.value);
                                  setFormData({ ...formData, rate_per_bird: r, total_amount: formData.number_sold * r });
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "-") e.preventDefault();
                                }}
                                className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                              />
                            </div>
                          </div>
                        )}

                        {/* Total amount */}
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">💵 {L("Total Amount (₹)", "மொத்த தொகை (₹)")}</label>
                          <input
                            type="number"
                            min="0"
                            value={formData.total_amount}
                            onChange={(e) => setFormData({ ...formData, total_amount: Number(e.target.value) })}
                            onKeyDown={(e) => {
                              if (e.key === "-") e.preventDefault();
                            }}
                            className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                        </div>

                        {/* Buyer name */}
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">👤 {L("Buyer Name (optional)", "வாங்கியவர் பெயர் (விருப்பம்)")}</label>
                          <input
                            type="text"
                            value={formData.buyer_name}
                            onChange={(e) => setFormData({ ...formData, buyer_name: e.target.value })}
                            placeholder={L("Enter buyer name", "வாங்கியவர் பெயர்")}
                            className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-3 pt-1">
                      <button
                        onClick={resetState}
                        className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-slate-700 text-sm font-medium text-gray-600 dark:text-gray-400"
                      >
                        🔄 {L("Try Again", "மீண்டும்")}
                      </button>
                      <button onClick={handleSave} className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-medium">
                        ✅ {L("Save", "சேமி")}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ── SAVING STATE ── */}
                {voiceState === "saving" && (
                  <motion.div key="saving" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4 py-8">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="text-4xl">
                      🌾
                    </motion.div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{L("Saving...", "சேமிக்கிறோம்...")}</p>
                  </motion.div>
                )}

                {/* ── SAVED STATE ── */}
                {voiceState === "saved" && (
                  <motion.div
                    key="saved"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center gap-4 py-8"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 200, damping: 15 }}
                      className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center"
                    >
                      <motion.svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                        <motion.path
                          d="M8 20 L16 28 L32 12"
                          stroke="#16a34a"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                        />
                      </motion.svg>
                    </motion.div>
                    <p className="text-sm font-semibold text-green-700 dark:text-green-400">{L("Saved!", "சேமிக்கப்பட்டது!")}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
