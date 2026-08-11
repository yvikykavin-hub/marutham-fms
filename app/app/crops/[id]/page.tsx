"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "../../../components/Sidebar";
import CropRecordSection from "../../../components/CropRecordSection";
import DeleteConfirmDialog from "../../../components/DeleteConfirmDialog";
import { useDeleteConfirm } from "../../../hooks/useDeleteConfirm";
import toast from "react-hot-toast";
import { supabase } from "../../../lib/supabase";
import { useLang } from "../../../lib/useLang";
import { phoneError as getPhoneError } from "../../../lib/validators";
import { isFutureDate, getValidationMessage } from "../../../lib/validation";
import { ActivityLog } from "../../../lib/activityLog";

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

type CoconutDetails = {
  id: string;
  cultivation_id: string;
  total_trees: number;
  small_trees: number;
  large_trees: number;
};

type IncomeRecord = {
  id: string;
  cultivation_id: string;
  farm_id: string;
  income_date: string;
  category: string | null;
  stage: string | null;
  amount: number;
  quantity: number | null;
  unit: string | null;
  price_per_unit: number | null;
  buyer_name: string | null;
  buyer_contact: string | null;
  market_name: string | null;
  turmeric_type: string | null;
  quantity_tons: number | null;
  rate_per_ton: number | null;
  notes: string | null;
  small_coconuts: number | null;
  large_coconuts: number | null;
  small_price: number | null;
  large_price: number | null;
  dealer_deduction: number | null;
  created_at?: string;
};

type ExpenseRecord = {
  id: string;
  cultivation_id: string;
  farm_id: string;
  expense_date: string;
  category: string;
  stage: string | null;
  amount: number;
  description: string | null;
  vendor_name: string | null;
  notes: string | null;
  trees_harvested: number | null;
  price_per_tree: number | null;
  rate_per_ton: number | null;
  total_tons: number | null;
  created_at?: string;
};

type HarvestRecord = {
  id: string;
  harvest_date: string;
  yield_quantity: number;
  yield_unit: string;
  cutting_number: number | null;
  notes: string | null;
};

type FertilizerRecord = {
  id: string;
  application_date: string;
  fertilizer_name: string;
  quantity: number;
  unit: string;
  crop_month: number;
  growth_stage: string;
  cost: number;
  notes: string | null;
};

type WeedRecord = {
  id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  workers_per_day: number;
  cost_per_day: number;
  total_cost: number;
  notes: string | null;
};

type TurmericDetails = {
  id: string;
  cultivation_id: string;
  variety: string | null;
  planting_date: string | null;
  seed_quantity: number | null;
  expected_harvest_date: string | null;
};

type NellDetails = {
  id: string;
  cultivation_id: string;
  variety_name: string | null;
  seed_quantity: number | null;
  unit: string | null;
  planting_date: string | null;
  expected_harvest_date: string | null;
  notes: string | null;
};

type ElluDetails = {
  id: string;
  cultivation_id: string;
  variety: string | null;
  sowing_date: string | null;
  seed_quantity: number | null;
  expected_harvest_date: string | null;
};

type RiceIncome = {
  id: string;
  cultivation_id: string;
  date: string;
  market_name: string | null;
  quantity_sold: number;
  unit: string;
  rate_per_unit: number;
  total_amount: number;
  notes: string | null;
};

type KuchiKilanguDetails = {
  id: string;
  cultivation_id: string;
  stems_planted: number | null;
  spacing_feet: number | null;
};

type GroundnutDetails = {
  id: string;
  cultivation_id: string;
  variety: string | null;
  seed_quantity_kg: number | null;
  seed_quantity_per_acre: number | null;
  notes: string | null;
};

type GroundnutExpense = {
  id: string;
  cultivation_id: string;
  expense_date: string;
  expense_type: string;
  quantity: number | null;
  quantity_unit: string | null;
  rate: number | null;
  amount: number;
  number_of_rolls: number | null;
  rate_per_roll: number | null;
  notes: string | null;
};

type GroundnutIncome = {
  id: string;
  cultivation_id: string;
  harvest_date: string;
  quantity_kg: number | null;
  quantity_ton: number | null;
  quantity_unit: string;
  rate_per_unit: number;
  total_amount: number;
  buyer_name: string | null;
  buyer_contact: string | null;
  market_details: string | null;
  notes: string | null;
};

type ActivityField = {
  name: string;
  type: "date" | "text" | "number" | "select";
  labelEn: string;
  labelTa: string;
  options?: string[];
};

type ActivitySubsection = {
  key: string;
  titleEn: string;
  titleTa: string;
  category: string;
  stage: string;
  dateField?: string;
  fields: ActivityField[];
  computeAmount: (v: Record<string, string>) => number;
  buildDescription: (v: Record<string, string>) => string;
  extraColumns?: (v: Record<string, string>) => Record<string, number | string | null>;
  extra?: "fertilizer" | "weed";
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

type QuantityUnitOption = { value: string; en: string; ta: string };
type QuantityFieldConfig = {
  units: QuantityUnitOption[];
  labelFor: (unit: string) => { en: string; ta: string };
};

const QUANTITY_CONFIG: Record<string, QuantityFieldConfig> = {
  coconut: {
    units: [{ value: "trees", en: "Trees", ta: "மரங்கள்" }],
    labelFor: () => ({ en: "Number of Trees", ta: "மரங்களின் எண்ணிக்கை" }),
  },
  sugarcane: {
    units: [
      { value: "plants", en: "Plants", ta: "தாவரங்கள்" },
      { value: "stems", en: "Stems", ta: "தண்டுகள்" },
    ],
    labelFor: (u) =>
      u === "stems" ? { en: "Number of Stems", ta: "தண்டுகளின் எண்ணிக்கை" } : { en: "Number of Plants", ta: "தாவரங்களின் எண்ணிக்கை" },
  },
  turmeric: {
    units: [{ value: "beds", en: "Beds", ta: "படுக்கைகள்" }],
    labelFor: () => ({ en: "Number of Beds", ta: "படுக்கைகளின் எண்ணிக்கை" }),
  },
  ellu: {
    units: [{ value: "kg", en: "kg", ta: "கி.கி" }],
    labelFor: () => ({ en: "Seed Quantity (kg)", ta: "விதை அளவு (kg)" }),
  },
  kuchi_kilangu: {
    units: [{ value: "cuttings", en: "Cuttings", ta: "கட்டிங்ஸ்" }],
    labelFor: () => ({ en: "Number of Cuttings", ta: "கட்டிங்ஸ் எண்ணிக்கை" }),
  },
  onion: {
    units: [
      { value: "kg", en: "Kg", ta: "கி.கி" },
      { value: "bags", en: "Bags", ta: "பைகள்" },
    ],
    labelFor: () => ({ en: "Quantity", ta: "அளவு" }),
  },
  fodder_corn: {
    units: [{ value: "kg", en: "kg", ta: "கி.கி" }],
    labelFor: () => ({ en: "Seed Quantity (kg)", ta: "விதை அளவு (kg)" }),
  },
  nell: {
    units: [{ value: "kg", en: "kg", ta: "கி.கி" }],
    labelFor: () => ({ en: "Seed Quantity (kg)", ta: "விதை அளவு (kg)" }),
  },
};

// Rice expenses share the single expense_records table (with the other crops).
// expense_records.category has a DB check constraint with a fixed allowed list,
// so each Rice expense type maps to the closest allowed category; the exact
// sub-type is preserved in `stage` for filtering/display, since `category` alone
// can't distinguish e.g. "Nursery" from "Transplantation" (both → 'labour').
const RICE_EXPENSE_TYPES = [
  { value: "land_preparation", en: "Land Preparation", ta: "நிலம் தயாரிப்பு", category: "land_preparation" },
  { value: "seed_expense", en: "Seed Expense", ta: "விதை செலவு", category: "seeds" },
  { value: "nursery", en: "Nursery Preparation", ta: "நாற்றங்கால்", category: "labour" },
  { value: "transplantation", en: "Transplantation Labor", ta: "நடவு கூலி", category: "labour" },
  { value: "weed_removal", en: "Weed Removal", ta: "களை எடுத்தல்", category: "labour" },
  { value: "harvesting", en: "Harvesting Expense", ta: "அறுவடை செலவு", category: "machinery_repair" },
  { value: "straw_rolling", en: "Straw Rolling Labor", ta: "வைக்கோல் சுருட்டு", category: "miscellaneous" },
  { value: "straw_transport", en: "Straw Transportation", ta: "வைக்கோல் போக்குவரத்து", category: "miscellaneous" },
  { value: "straw_arrangement", en: "Straw Arrangement Labor", ta: "வைக்கோல் அடுக்கு", category: "miscellaneous" },
  { value: "transportation", en: "Transportation", ta: "போக்குவரத்து", category: "transport" },
  { value: "misc_labor", en: "Miscellaneous Labor", ta: "இதர கூலி", category: "miscellaneous" },
];

const NELL_INCOME_UNITS = [
  { value: "kg", en: "Kg", ta: "கி.கி" },
  { value: "ton", en: "Ton", ta: "டன்" },
  { value: "padi", en: "Padi", ta: "பாடி" },
];

const EXPENSE_CATEGORIES = [
  { value: "seeds", en: "Seeds", ta: "விதைகள்" },
  { value: "fertilizer", en: "Fertilizer", ta: "உரம்" },
  { value: "labour", en: "Labour", ta: "கூலி" },
  { value: "land_preparation", en: "Land Preparation", ta: "நில தயாரிப்பு" },
  { value: "irrigation", en: "Irrigation", ta: "நீர்ப்பாசனம்" },
  { value: "transport", en: "Transport", ta: "போக்குவரத்து" },
  { value: "machinery_repair", en: "Machinery Repair", ta: "இயந்திர பழுது" },
  { value: "miscellaneous", en: "Miscellaneous", ta: "இதர செலவு" },
];

const ELLU_EXPENSE_CATEGORIES = [
  { value: "seeds", en: "Seeds", ta: "விதைகள்" },
  { value: "fertilizer", en: "Fertilizer", ta: "உரம்" },
  { value: "labour", en: "Labour", ta: "கூலி" },
  { value: "land_preparation", en: "Land Preparation", ta: "நில தயாரிப்பு" },
  { value: "irrigation", en: "Irrigation", ta: "நீர்ப்பாசனம்" },
  { value: "transport", en: "Transport", ta: "போக்குவரத்து" },
  { value: "machinery_repair", en: "Machinery Repair", ta: "இயந்திர பழுது" },
  { value: "cultivation", en: "Cultivation", ta: "பயிரிடல்" },
  { value: "harvest", en: "Harvest", ta: "அறுவடை" },
  { value: "miscellaneous", en: "Miscellaneous", ta: "இதர செலவு" },
];

const YIELD_UNITS = ["kg", "tonnes", "bags", "nos"];

const KUCHI_BUYER_TYPES = [
  { value: "local_market", en: "Local Market", ta: "உள்ளூர் சந்தை" },
  { value: "wholesale", en: "Wholesale", ta: "மொத்த விற்பனை" },
  { value: "direct_buyer", en: "Direct Buyer", ta: "நேரடி வாங்குபவர்" },
];

const ONION_INCOME_UNITS = [
  { value: "kg", en: "Kg", ta: "கிலோ" },
  { value: "tonne", en: "Tonne", ta: "டன்" },
  { value: "bags", en: "Bags", ta: "பைகள்" },
];

const ONION_STORAGE_EXPENSE_TYPES = [
  { value: "storage_rent", en: "Storage Rent", ta: "சேமிப்பு வாடகை" },
  { value: "cold_storage", en: "Cold Storage", ta: "குளிர் சேமிப்பு" },
  { value: "maintenance", en: "Maintenance", ta: "பராமரிப்பு" },
  { value: "other", en: "Other", ta: "மற்றவை" },
];

// expense_records.category has a DB check constraint with a fixed allowed list.
// Map each onion storage sub-type to the closest allowed value; the specific
// sub-type itself is preserved in `description` so it can still be displayed/edited.
const ONION_STORAGE_CATEGORY_MAP: Record<string, string> = {
  storage_rent: "storage",
  cold_storage: "storage",
  maintenance: "maintenance",
  other: "miscellaneous",
};

// Groundnut expense types
const GROUNDNUT_EXPENSE_TYPES = [
  { value: "land_preparation", en: "Land Preparation", ta: "நிலம் தயாரிப்பு" },
  { value: "drip_irrigation_repair", en: "Drip Irrigation Repair", ta: "சொட்டு நீர் பழுது" },
  { value: "seed_purchase", en: "Seed Purchase", ta: "விதை வாங்குதல்" },
  { value: "weed_removal", en: "Weed Removal", ta: "களை எடுத்தல்" },
  { value: "fertilizer", en: "Fertilizer", ta: "உரம்" },
  { value: "harvesting", en: "Groundnut Harvesting", ta: "கடலை அறுவடை" },
  { value: "drying_bagging", en: "Drying & Bagging", ta: "உலர்த்துதல் & பையில் அடைத்தல்" },
  { value: "dry_leaf_rolling", en: "Dry Leaf Rolling", ta: "உலர் இலை சுருட்டுதல்" },
];

const formatDMY = (iso: string | null | undefined) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 0 })}`;

const ratePerUnitLabel = (unit: string): { en: string; ta: string } => {
  if (unit === "tonne") return { en: "Rate per Tonne (₹)", ta: "டன்னுக்கு விலை (₹)" };
  if (unit === "bags") return { en: "Rate per Bag (₹)", ta: "பையுக்கு விலை (₹)" };
  return { en: "Rate per Kg (₹)", ta: "கிலோவுக்கு விலை (₹)" };
};

const inputCls =
  "w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white text-gray-900 placeholder:text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary";
const labelCls = "block mb-0.5 text-xs text-gray-600";

const num = (v: string | undefined) => parseFloat(v ?? "") || 0;

const weedDaysFromValues = (v: Record<string, string>) =>
  v.start_date && v.end_date
    ? Math.abs(Math.ceil((new Date(v.end_date).getTime() - new Date(v.start_date).getTime()) / 86400000)) + 1
    : 0;

const TURMERIC_SUBSECTIONS: ActivitySubsection[] = [
  {
    key: "A1",
    titleEn: "Land Preparation",
    titleTa: "நில தயாரிப்பு",
    category: "land_preparation",
    stage: "land_preparation",
    fields: [
      { name: "date", type: "date", labelEn: "Date", labelTa: "தேதி" },
      { name: "description", type: "text", labelEn: "Description", labelTa: "விவரம்" },
      { name: "amount", type: "number", labelEn: "Amount (₹)", labelTa: "தொகை (₹)" },
      { name: "notes", type: "text", labelEn: "Notes", labelTa: "குறிப்பு" },
    ],
    computeAmount: (v) => num(v.amount),
    buildDescription: (v) => v.description?.trim() || "Land preparation",
  },
  {
    key: "A2",
    titleEn: "Drip Irrigation",
    titleTa: "நீர்ப்பாசன அமைப்பு",
    category: "irrigation",
    stage: "drip_irrigation",
    fields: [
      { name: "date", type: "date", labelEn: "Date", labelTa: "தேதி" },
      { name: "type", type: "select", labelEn: "Type", labelTa: "வகை", options: ["Installation", "Maintenance"] },
      { name: "amount", type: "number", labelEn: "Amount (₹)", labelTa: "தொகை (₹)" },
      { name: "notes", type: "text", labelEn: "Notes", labelTa: "குறிப்பு" },
    ],
    computeAmount: (v) => num(v.amount),
    buildDescription: (v) => `Drip irrigation - ${v.type || "Installation"}`,
  },
  {
    key: "A3",
    titleEn: "Seed Rhizomes Purchase",
    titleTa: "விதை கிழங்கு கொள்முதல்",
    category: "seeds",
    stage: "seed_purchase",
    fields: [
      { name: "date", type: "date", labelEn: "Date", labelTa: "தேதி" },
      { name: "quantity", type: "number", labelEn: "Quantity (kg)", labelTa: "அளவு (கி.கி)" },
      { name: "price_per_kg", type: "number", labelEn: "Price/kg (₹)", labelTa: "விலை/கி.கி (₹)" },
      { name: "vendor_name", type: "text", labelEn: "Vendor Name", labelTa: "விற்பனையாளர் பெயர்" },
      { name: "notes", type: "text", labelEn: "Notes", labelTa: "குறிப்பு" },
    ],
    computeAmount: (v) => num(v.quantity) * num(v.price_per_kg),
    buildDescription: (v) => `Seed rhizomes purchase - ${num(v.quantity)}kg @ ₹${num(v.price_per_kg)}/kg`,
  },
  {
    key: "A4",
    titleEn: "Fertilizer Application",
    titleTa: "உர பயன்பாடு",
    category: "fertilizer",
    stage: "fertilizer",
    fields: [
      { name: "date", type: "date", labelEn: "Date", labelTa: "தேதி" },
      { name: "fertilizer_name", type: "text", labelEn: "Fertilizer Name", labelTa: "உரம் பெயர்" },
      { name: "quantity", type: "number", labelEn: "Quantity", labelTa: "அளவு" },
      { name: "unit", type: "select", labelEn: "Unit", labelTa: "அளவீடு", options: ["kg", "litre", "g"] },
      { name: "crop_month", type: "number", labelEn: "Crop Month", labelTa: "பயிர் மாதம்" },
      { name: "growth_stage", type: "text", labelEn: "Growth Stage", labelTa: "வளர்ச்சி நிலை" },
      { name: "cost", type: "number", labelEn: "Cost (₹)", labelTa: "செலவு (₹)" },
      { name: "notes", type: "text", labelEn: "Notes", labelTa: "குறிப்பு" },
    ],
    computeAmount: (v) => num(v.cost),
    buildDescription: (v) => `${v.fertilizer_name?.trim() || "Fertilizer"} - ${num(v.quantity)}${v.unit || "kg"}`,
    extra: "fertilizer",
  },
  {
    key: "A5",
    titleEn: "Weeding Operations",
    titleTa: "களை மேலாண்மை",
    category: "labour",
    stage: "weeding",
    dateField: "start_date",
    fields: [
      { name: "start_date", type: "date", labelEn: "Start Date", labelTa: "தொடக்க தேதி" },
      { name: "end_date", type: "date", labelEn: "End Date", labelTa: "முடிவு தேதி" },
      { name: "workers_per_day", type: "number", labelEn: "Workers/Day", labelTa: "தொழிலாளர்/நாள்" },
      { name: "cost_per_day", type: "number", labelEn: "Cost/Day (₹)", labelTa: "செலவு/நாள் (₹)" },
      { name: "notes", type: "text", labelEn: "Notes", labelTa: "குறிப்பு" },
    ],
    computeAmount: (v) => weedDaysFromValues(v) * num(v.workers_per_day) * num(v.cost_per_day),
    buildDescription: () => "Weeding operations",
    extra: "weed",
  },
  {
    key: "B1",
    titleEn: "Leaf Removal",
    titleTa: "இலை அகற்றல்",
    category: "labour",
    stage: "leaf_removal",
    fields: [
      { name: "date", type: "date", labelEn: "Date", labelTa: "தேதி" },
      { name: "workers_count", type: "number", labelEn: "Workers Count", labelTa: "தொழிலாளர் எண்ணிக்கை" },
      { name: "cost_per_worker", type: "number", labelEn: "Cost/Worker (₹)", labelTa: "தொழிலாளர் செலவு (₹)" },
      { name: "notes", type: "text", labelEn: "Notes", labelTa: "குறிப்பு" },
    ],
    computeAmount: (v) => num(v.workers_count) * num(v.cost_per_worker),
    buildDescription: () => "Turmeric leaf removal - pre harvest preparation",
  },
  {
    key: "B2",
    titleEn: "Harvesting",
    titleTa: "அறுவடை",
    category: "labour",
    stage: "harvesting",
    fields: [
      { name: "date", type: "date", labelEn: "Date", labelTa: "தேதி" },
      { name: "area_harvested", type: "number", labelEn: "Area Harvested (acres)", labelTa: "அறுவடை பரப்பு (ஏக்கர்)" },
      { name: "workers_count", type: "number", labelEn: "Workers Count", labelTa: "தொழிலாளர் எண்ணிக்கை" },
      { name: "cost_per_worker", type: "number", labelEn: "Cost/Worker (₹)", labelTa: "தொழிலாளர் செலவு (₹)" },
      { name: "other_costs", type: "number", labelEn: "Other Costs (₹)", labelTa: "இதர செலவு (₹)" },
      { name: "notes", type: "text", labelEn: "Notes", labelTa: "குறிப்பு" },
    ],
    computeAmount: (v) => num(v.workers_count) * num(v.cost_per_worker) + num(v.other_costs),
    buildDescription: () => "Turmeric harvesting",
  },
  {
    key: "B3",
    titleEn: "Boiling / Processing",
    titleTa: "வேகவைத்தல்",
    category: "miscellaneous",
    stage: "boiling",
    fields: [
      { name: "date", type: "date", labelEn: "Date", labelTa: "தேதி" },
      { name: "bulb_drums", type: "number", labelEn: "No. of Drums (Bulb)", labelTa: "டிரம் எண் (கிழங்கு)" },
      { name: "finger_drums", type: "number", labelEn: "No. of Drums (Finger)", labelTa: "டிரம் எண் (விரல்)" },
      { name: "total_cost", type: "number", labelEn: "Total Cost (₹)", labelTa: "மொத்த செலவு (₹)" },
      { name: "notes", type: "text", labelEn: "Notes", labelTa: "குறிப்பு" },
    ],
    computeAmount: (v) => num(v.total_cost),
    buildDescription: () => "Turmeric boiling/curing process",
    extraColumns: (v) => ({ bulb_drums: num(v.bulb_drums), finger_drums: num(v.finger_drums) }),
  },
  {
    key: "B4",
    titleEn: "Drying",
    titleTa: "உலர்த்துதல்",
    category: "miscellaneous",
    stage: "drying",
    fields: [
      { name: "date", type: "date", labelEn: "Date", labelTa: "தேதி" },
      { name: "drying_days", type: "number", labelEn: "Drying Days", labelTa: "உலர்த்தும் நாட்கள்" },
      { name: "labour_cost", type: "number", labelEn: "Labour Cost (₹)", labelTa: "கூலி செலவு (₹)" },
      { name: "notes", type: "text", labelEn: "Notes", labelTa: "குறிப்பு" },
    ],
    computeAmount: (v) => num(v.labour_cost),
    buildDescription: () => "Turmeric drying",
    extraColumns: (v) => ({ drying_days: parseInt(v.drying_days) || 0 }),
  },
  {
    key: "B5",
    titleEn: "Polishing",
    titleTa: "மெருகூட்டல்",
    category: "miscellaneous",
    stage: "polishing",
    fields: [
      { name: "date", type: "date", labelEn: "Date", labelTa: "தேதி" },
      { name: "quantity", type: "number", labelEn: "Quantity (kg)", labelTa: "அளவு (கி.கி)" },
      { name: "polishing_cost", type: "number", labelEn: "Polishing Cost (₹)", labelTa: "மெருகூட்டல் செலவு (₹)" },
      { name: "labour_cost", type: "number", labelEn: "Labour Cost (₹)", labelTa: "கூலி செலவு (₹)" },
      { name: "notes", type: "text", labelEn: "Notes", labelTa: "குறிப்பு" },
    ],
    computeAmount: (v) => num(v.polishing_cost) + num(v.labour_cost),
    buildDescription: () => "Turmeric polishing",
  },
  {
    key: "B6",
    titleEn: "Packing",
    titleTa: "பேக்கிங்",
    category: "miscellaneous",
    stage: "packing",
    fields: [
      { name: "date", type: "date", labelEn: "Date", labelTa: "தேதி" },
      { name: "bulb_bags", type: "number", labelEn: "No. of Bags (Bulb)", labelTa: "பை எண் (கிழங்கு)" },
      { name: "finger_bags", type: "number", labelEn: "No. of Bags (Finger)", labelTa: "பை எண் (விரல்)" },
      { name: "packing_material_cost", type: "number", labelEn: "Packing Material Cost (₹)", labelTa: "பேக்கிங் பொருள் செலவு (₹)" },
      { name: "labour_cost", type: "number", labelEn: "Labour Cost (₹)", labelTa: "கூலி செலவு (₹)" },
      { name: "notes", type: "text", labelEn: "Notes", labelTa: "குறிப்பு" },
    ],
    computeAmount: (v) => num(v.packing_material_cost) + num(v.labour_cost),
    buildDescription: () => "Turmeric packing",
    extraColumns: (v) => ({ bulb_bags: num(v.bulb_bags), finger_bags: num(v.finger_bags) }),
  },
  {
    key: "B7",
    titleEn: "Transportation",
    titleTa: "போக்குவரத்து",
    category: "transport",
    stage: "transportation",
    fields: [
      { name: "date", type: "date", labelEn: "Date", labelTa: "தேதி" },
      { name: "destination", type: "text", labelEn: "Destination", labelTa: "இடம்" },
      { name: "vehicle_type", type: "text", labelEn: "Vehicle Type", labelTa: "வாகன வகை" },
      { name: "loading_cost", type: "number", labelEn: "Loading Cost (₹)", labelTa: "ஏற்றும் செலவு (₹)" },
      { name: "transport_cost", type: "number", labelEn: "Transport Cost (₹)", labelTa: "போக்குவரத்து செலவு (₹)" },
      { name: "notes", type: "text", labelEn: "Notes", labelTa: "குறிப்பு" },
    ],
    computeAmount: (v) => num(v.loading_cost) + num(v.transport_cost),
    buildDescription: (v) => {
      const parts = [v.destination?.trim(), v.vehicle_type?.trim()].filter(Boolean);
      return parts.length ? `Turmeric transportation - ${parts.join(", ")}` : "Turmeric transportation";
    },
    extraColumns: (v) => ({ loading_cost: num(v.loading_cost) }),
  },
];

const COMMON_ACTIVITY_KEYS = ["A1", "A2", "A3", "A4", "A5"];
const TURMERIC_ACTIVITY_KEYS = ["B1", "B2", "B3", "B4", "B5", "B6", "B7"];

const ELLU_SUBSECTIONS: ActivitySubsection[] = [
  {
    key: "E1",
    titleEn: "Threshing",
    titleTa: "கதறுதல்",
    category: "labour",
    stage: "threshing",
    fields: [
      { name: "date", type: "date", labelEn: "Date", labelTa: "தேதி" },
      { name: "workers_count", type: "number", labelEn: "Workers Count", labelTa: "தொழிலாளர் எண்ணிக்கை" },
      { name: "cost_per_worker", type: "number", labelEn: "Cost/Worker (₹)", labelTa: "தொழிலாளர் செலவு (₹)" },
      { name: "notes", type: "text", labelEn: "Notes", labelTa: "குறிப்பு" },
    ],
    computeAmount: (v) => num(v.workers_count) * num(v.cost_per_worker),
    buildDescription: () => "Ellu threshing",
  },
  {
    key: "E2",
    titleEn: "Cleaning / Winnowing",
    titleTa: "சுத்தம் செய்தல்",
    category: "labour",
    stage: "cleaning",
    fields: [
      { name: "date", type: "date", labelEn: "Date", labelTa: "தேதி" },
      { name: "workers_count", type: "number", labelEn: "Workers Count", labelTa: "தொழிலாளர் எண்ணிக்கை" },
      { name: "cost_per_worker", type: "number", labelEn: "Cost/Worker (₹)", labelTa: "தொழிலாளர் செலவு (₹)" },
      { name: "notes", type: "text", labelEn: "Notes", labelTa: "குறிப்பு" },
    ],
    computeAmount: (v) => num(v.workers_count) * num(v.cost_per_worker),
    buildDescription: () => "Ellu cleaning/winnowing",
  },
  {
    key: "E3",
    titleEn: "Drying",
    titleTa: "உலர்த்துதல்",
    category: "labour",
    stage: "drying_ellu",
    fields: [
      { name: "date", type: "date", labelEn: "Date", labelTa: "தேதி" },
      { name: "drying_days", type: "number", labelEn: "Drying Days", labelTa: "உலர்த்தும் நாட்கள்" },
      { name: "labour_cost", type: "number", labelEn: "Labour Cost (₹)", labelTa: "கூலி செலவு (₹)" },
      { name: "notes", type: "text", labelEn: "Notes", labelTa: "குறிப்பு" },
    ],
    computeAmount: (v) => num(v.labour_cost),
    buildDescription: () => "Ellu drying",
    extraColumns: (v) => ({ drying_days: parseInt(v.drying_days) || 0 }),
  },
];

export default function CropDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [lang, setLang] = useLang();
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);

  const [cultivation, setCultivation] = useState<Cultivation | null>(null);
  const [loading, setLoading] = useState(true);
  const [farmName, setFarmName] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "finance" | "activities" | "income">("overview");

  const [endDateInput, setEndDateInput] = useState("");
  const [endDateError, setEndDateError] = useState("");
  const [savingEndDate, setSavingEndDate] = useState(false);
  const [deletingCultivation, setDeletingCultivation] = useState(false);
  const { isOpen: deleteOpen, confirmDelete, handleConfirm: handleDeleteConfirm, handleCancel: handleDeleteCancel } = useDeleteConfirm();

  const [editingDetails, setEditingDetails] = useState(false);
  const [varietyInput, setVarietyInput] = useState("");
  const [quantityInput, setQuantityInput] = useState("");
  const [quantityUnitInput, setQuantityUnitInput] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);

  const cropType = cultivation?.crop_type ?? "";
  const isCoconut = cropType === "coconut";
  const isTurmeric = cropType === "turmeric";
  const isSugarcane = cropType === "sugarcane";
  const isEllu = cropType === "ellu";
  const isFodderCorn = cropType === "fodder_corn";
  const isOnion = cropType === "onion";
  const isKuchiKilangu = cropType === "kuchi_kilangu";
  const isNell = cropType === "nell";
  const isGroundnut = cropType === "groundnut";
  const showHarvestSection = cropType !== "" && cropType !== "coconut" && cropType !== "fodder_corn" && cropType !== "turmeric";
  const crop = cropInfo(cropType);

  // Turmeric details
  const [turmericDetailsId, setTurmericDetailsId] = useState<string | null>(null);
  const [turmericVariety, setTurmericVariety] = useState("");
  const [turmericPlantingDate, setTurmericPlantingDate] = useState("");
  const [turmericSeedQuantity, setTurmericSeedQuantity] = useState("");
  const [turmericExpectedHarvestDate, setTurmericExpectedHarvestDate] = useState("");
  const [savingTurmericDetails, setSavingTurmericDetails] = useState(false);

  // Nell (Rice) details
  const [nellDetailsId, setNellDetailsId] = useState<string | null>(null);
  const [nellVariety, setNellVariety] = useState("");
  const [nellPlantingDate, setNellPlantingDate] = useState("");
  const [nellSeedQuantity, setNellSeedQuantity] = useState("");
  const [nellSeedUnit, setNellSeedUnit] = useState("kg");
  const [nellExpectedHarvestDate, setNellExpectedHarvestDate] = useState("");
  const [savingNellDetails, setSavingNellDetails] = useState(false);

  // Ellu details
  const [elluDetailsId, setElluDetailsId] = useState<string | null>(null);
  const [elluVariety, setElluVariety] = useState("");
  const [elluSowingDate, setElluSowingDate] = useState("");
  const [elluSeedQuantity, setElluSeedQuantity] = useState("");
  const [elluExpectedHarvestDate, setElluExpectedHarvestDate] = useState("");
  const [savingElluDetails, setSavingElluDetails] = useState(false);

  // Ellu income
  const [elluSaleDate, setElluSaleDate] = useState("");
  const [elluQuantitySold, setElluQuantitySold] = useState("");
  const [elluPricePerKg, setElluPricePerKg] = useState("");
  const [elluBuyerName, setElluBuyerName] = useState("");
  const [elluSaleNotes, setElluSaleNotes] = useState("");
  const [savingElluIncome, setSavingElluIncome] = useState(false);

  // Nell (Rice) — income
  const [nellIncomeRecords, setNellIncomeRecords] = useState<RiceIncome[]>([]);
  const [nellIncomeModalOpen, setNellIncomeModalOpen] = useState(false);
  const [nellEditingIncomeId, setNellEditingIncomeId] = useState<string | null>(null);
  const [nellIncomeDate, setNellIncomeDate] = useState("");
  const [nellIncomeMarket, setNellIncomeMarket] = useState("");
  const [nellIncomeQty, setNellIncomeQty] = useState("");
  const [nellIncomeUnit, setNellIncomeUnit] = useState("kg");
  const [nellIncomeRate, setNellIncomeRate] = useState("");
  const [nellIncomeTotal, setNellIncomeTotal] = useState("");
  const [nellIncomeTotalManual, setNellIncomeTotalManual] = useState(false);
  const [nellIncomeNotes, setNellIncomeNotes] = useState("");
  const [savingNellIncome, setSavingNellIncome] = useState(false);

  // Nell (Rice) — unified expense form
  const [riceExpenseModalOpen, setRiceExpenseModalOpen] = useState(false);
  const [riceExpenseEditingId, setRiceExpenseEditingId] = useState<string | null>(null);
  const [riceExpenseType, setRiceExpenseType] = useState("land_preparation");
  const [riceExpenseDate, setRiceExpenseDate] = useState("");
  const [riceExpenseAmount, setRiceExpenseAmount] = useState("");
  const [riceExpenseNotes, setRiceExpenseNotes] = useState("");
  const [riceExpenseVariety, setRiceExpenseVariety] = useState("");
  const [riceExpenseSeedQty, setRiceExpenseSeedQty] = useState("");
  const [riceExpenseSeedUnit, setRiceExpenseSeedUnit] = useState("kg");
  const [riceExpenseLaborers, setRiceExpenseLaborers] = useState("");
  const [riceExpenseOwnerName, setRiceExpenseOwnerName] = useState("");
  const [riceExpenseContact, setRiceExpenseContact] = useState("");
  const [riceExpenseContactError, setRiceExpenseContactError] = useState("");
  const [savingRiceExpense, setSavingRiceExpense] = useState(false);

  // Fodder corn cutting cycles
  const [cuttingDate, setCuttingDate] = useState("");
  const [cuttingQty, setCuttingQty] = useState("");
  const [cuttingUnit, setCuttingUnit] = useState("kg");
  const [cuttingSoldTo, setCuttingSoldTo] = useState("");
  const [cuttingRate, setCuttingRate] = useState("");
  const [cuttingNotes, setCuttingNotes] = useState("");
  const [savingCutting, setSavingCutting] = useState(false);

  // Onion income
  const [onionIncomeModalOpen, setOnionIncomeModalOpen] = useState(false);
  const [onionEditingIncomeId, setOnionEditingIncomeId] = useState<string | null>(null);
  const [onionSaleDate, setOnionSaleDate] = useState("");
  const [onionQtySold, setOnionQtySold] = useState("");
  const [onionUnit, setOnionUnit] = useState("kg");
  const [onionRate, setOnionRate] = useState("");
  const [onionTotal, setOnionTotal] = useState("");
  const [onionTotalManual, setOnionTotalManual] = useState(false);
  const [onionBuyerName, setOnionBuyerName] = useState("");
  const [onionContact, setOnionContact] = useState("");
  const [onionSaleNotes, setOnionSaleNotes] = useState("");
  const [savingOnionSale, setSavingOnionSale] = useState(false);

  // Onion storage & maintenance expense
  const [onionStorageModalOpen, setOnionStorageModalOpen] = useState(false);
  const [onionStorageEditingId, setOnionStorageEditingId] = useState<string | null>(null);
  const [onionStorageDate, setOnionStorageDate] = useState("");
  const [onionStorageType, setOnionStorageType] = useState("storage_rent");
  const [onionStorageAmount, setOnionStorageAmount] = useState("");
  const [onionStorageNotes, setOnionStorageNotes] = useState("");
  const [savingOnionStorageExpense, setSavingOnionStorageExpense] = useState(false);

  // Kuchi kilangu details
  const [kuchiDetailsId, setKuchiDetailsId] = useState<string | null>(null);
  const [kuchiStemsPlanted, setKuchiStemsPlanted] = useState("");
  const [kuchiSpacingFeet, setKuchiSpacingFeet] = useState("");
  const [savingKuchiDetails, setSavingKuchiDetails] = useState(false);

  // Kuchi kilangu income
  const [kuchiSaleDate, setKuchiSaleDate] = useState("");
  const [kuchiQtySold, setKuchiQtySold] = useState("");
  const [kuchiUnit, setKuchiUnit] = useState("kg");
  const [kuchiRatePerKg, setKuchiRatePerKg] = useState("");
  const [kuchiBuyerType, setKuchiBuyerType] = useState("local_market");
  const [kuchiBuyerName, setKuchiBuyerName] = useState("");
  const [kuchiSaleNotes, setKuchiSaleNotes] = useState("");
  const [savingKuchiSale, setSavingKuchiSale] = useState(false);

  // Turmeric income (crop sale) - bulb and finger side by side
  const [turmericSaleDate, setTurmericSaleDate] = useState("");
  const [turmericMarketName, setTurmericMarketName] = useState("");
  const [turmericBulbQtySold, setTurmericBulbQtySold] = useState("");
  const [turmericBulbSaleUnit, setTurmericBulbSaleUnit] = useState("kg");
  const [turmericBulbPricePerUnit, setTurmericBulbPricePerUnit] = useState("");
  const [turmericFingerQtySold, setTurmericFingerQtySold] = useState("");
  const [turmericFingerSaleUnit, setTurmericFingerSaleUnit] = useState("kg");
  const [turmericFingerPricePerUnit, setTurmericFingerPricePerUnit] = useState("");
  const [turmericSaleBuyer, setTurmericSaleBuyer] = useState("");
  const [turmericSaleNotes, setTurmericSaleNotes] = useState("");
  const [savingTurmericSale, setSavingTurmericSale] = useState(false);

  // Turmeric activities (generic engine)
  const [formValues, setFormValues] = useState<Record<string, Record<string, string>>>({});
  const [formOpen, setFormOpen] = useState<Record<string, boolean>>({});
  const [savingActivity, setSavingActivity] = useState<Record<string, boolean>>({});
  const [successMsg, setSuccessMsg] = useState<Record<string, string | null>>({});

  // Coconut tree tracking
  const [coconutDetailsId, setCoconutDetailsId] = useState<string | null>(null);
  const [totalTrees, setTotalTrees] = useState("");
  const [smallTrees, setSmallTrees] = useState("");
  const [largeTrees, setLargeTrees] = useState("");
  const [savingTrees, setSavingTrees] = useState(false);

  // Income
  const [incomeRecords, setIncomeRecords] = useState<IncomeRecord[]>([]);
  const [expandedIncomeIds, setExpandedIncomeIds] = useState<Set<string>>(new Set());
  const [harvestDate, setHarvestDate] = useState("");
  const [smallCount, setSmallCount] = useState("");
  const [smallPrice, setSmallPrice] = useState("");
  const [largeCount, setLargeCount] = useState("");
  const [largePrice, setLargePrice] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [savingIncome, setSavingIncome] = useState(false);

  const [incomeDate, setIncomeDate] = useState("");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeBuyer, setIncomeBuyer] = useState("");
  const [incomeNotes, setIncomeNotes] = useState("");

  // Sugarcane income
  const [sugarcaneSaleDate, setSugarcaneSaleDate] = useState("");
  const [sugarcaneBuyerName, setSugarcaneBuyerName] = useState("");
  const [sugarcaneQuantityTons, setSugarcaneQuantityTons] = useState("");
  const [sugarcaneRatePerTon, setSugarcaneRatePerTon] = useState("");
  const [sugarcaneNotes, setSugarcaneNotes] = useState("");
  const [savingSugarcaneIncome, setSavingSugarcaneIncome] = useState(false);

  // Sugarcane labour expense
  const [sugarcaneLabourRatePerTon, setSugarcaneLabourRatePerTon] = useState("");
  const [sugarcaneLabourTotalTons, setSugarcaneLabourTotalTons] = useState("");

  // Expenses
  const [expenseRecords, setExpenseRecords] = useState<ExpenseRecord[]>([]);
  const [expenseDate, setExpenseDate] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("seeds");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseVendorName, setExpenseVendorName] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [savingExpense, setSavingExpense] = useState(false);

  const [labourDate, setLabourDate] = useState("");
  const [treesHarvested, setTreesHarvested] = useState("");
  const [pricePerTree, setPricePerTree] = useState("");
  const [savingLabour, setSavingLabour] = useState(false);

  // Harvest
  const [harvestRecords, setHarvestRecords] = useState<HarvestRecord[]>([]);
  const [harvestRecordDate, setHarvestRecordDate] = useState("");
  const [yieldQuantity, setYieldQuantity] = useState("");
  const [yieldUnit, setYieldUnit] = useState("kg");
  const [harvestNotes, setHarvestNotes] = useState("");
  const [savingHarvest, setSavingHarvest] = useState(false);

  // Activities - fertilizer
  const [fertilizerRecords, setFertilizerRecords] = useState<FertilizerRecord[]>([]);
  const [fertDate, setFertDate] = useState("");
  const [fertName, setFertName] = useState("");
  const [fertQty, setFertQty] = useState("");
  const [fertUnit, setFertUnit] = useState("kg");
  const [fertMonth, setFertMonth] = useState("");
  const [fertStage, setFertStage] = useState("");
  const [fertCost, setFertCost] = useState("");
  const [fertNotes, setFertNotes] = useState("");
  const [savingFert, setSavingFert] = useState(false);

  // Activities - weed removal
  const [weedRecords, setWeedRecords] = useState<WeedRecord[]>([]);
  const [weedStart, setWeedStart] = useState("");
  const [weedEnd, setWeedEnd] = useState("");
  const [weedWorkers, setWeedWorkers] = useState("");
  const [weedCostPerDay, setWeedCostPerDay] = useState("");
  const [weedNotes, setWeedNotes] = useState("");
  const [savingWeed, setSavingWeed] = useState(false);

  // ── Groundnut Details ──
  const [groundnutDetailsId, setGroundnutDetailsId] = useState<string | null>(null);
  const [groundnutVariety, setGroundnutVariety] = useState("");
  const [groundnutSeedQtyKg, setGroundnutSeedQtyKg] = useState("");
  const [groundnutSeedQtyPerAcre, setGroundnutSeedQtyPerAcre] = useState("");
  const [groundnutDetailsNotes, setGroundnutDetailsNotes] = useState("");
  const [savingGroundnutDetails, setSavingGroundnutDetails] = useState(false);

  // ── Groundnut Expenses ──
  const [groundnutExpenses, setGroundnutExpenses] = useState<GroundnutExpense[]>([]);
  const [groundnutExpenseType, setGroundnutExpenseType] = useState("land_preparation");
  const [groundnutExpenseDate, setGroundnutExpenseDate] = useState("");
  const [groundnutExpenseAmount, setGroundnutExpenseAmount] = useState("");
  const [groundnutExpenseQty, setGroundnutExpenseQty] = useState("");
  const [groundnutExpenseRate, setGroundnutExpenseRate] = useState("");
  const [groundnutExpenseRolls, setGroundnutExpenseRolls] = useState("");
  const [groundnutExpenseRatePerRoll, setGroundnutExpenseRatePerRoll] = useState("");
  const [groundnutExpenseNotes, setGroundnutExpenseNotes] = useState("");
  const [savingGroundnutExpense, setSavingGroundnutExpense] = useState(false);

  // ── Groundnut Income ──
  const [groundnutIncomes, setGroundnutIncomes] = useState<GroundnutIncome[]>([]);
  const [groundnutHarvestDate, setGroundnutHarvestDate] = useState("");
  const [groundnutQuantity, setGroundnutQuantity] = useState("");
  const [groundnutQuantityUnit, setGroundnutQuantityUnit] = useState<"kg" | "ton">("kg");
  const [groundnutRate, setGroundnutRate] = useState("");
  const [groundnutTotalAmount, setGroundnutTotalAmount] = useState("");
  const [groundnutTotalManual, setGroundnutTotalManual] = useState(false);
  const [groundnutBuyer, setGroundnutBuyer] = useState("");
  const [groundnutBuyerContact, setGroundnutBuyerContact] = useState("");
  const [groundnutMarket, setGroundnutMarket] = useState("");
  const [groundnutIncomeNotes, setGroundnutIncomeNotes] = useState("");
  const [savingGroundnutIncome, setSavingGroundnutIncome] = useState(false);

  useEffect(() => {
    if (id) {
      fetchCultivation();
      fetchIncomeRecords();
      fetchExpenseRecords();
      fetchHarvestRecords();
      fetchFertilizerRecords();
      fetchWeedRecords();
    }
  }, [id]);

  useEffect(() => {
    if (isCoconut) fetchCoconutDetails();
  }, [isCoconut, id]);

  useEffect(() => {
    if (isTurmeric) fetchTurmericDetails();
  }, [isTurmeric, id]);

  useEffect(() => {
    if (isNell) fetchNellDetails();
  }, [isNell, id]);

  useEffect(() => {
    if (isEllu) fetchElluDetails();
  }, [isEllu, id]);

  useEffect(() => {
    if (isKuchiKilangu) fetchKuchiDetails();
  }, [isKuchiKilangu, id]);

  useEffect(() => {
    if (isGroundnut) {
      fetchGroundnutDetails();
      fetchGroundnutExpenses();
      fetchGroundnutIncomes();
    }
  }, [isGroundnut, id]);

  useEffect(() => {
    if (isNell) fetchNellIncome();
  }, [isNell, id]);

  const fetchNellIncome = async () => {
    const { data } = await supabase.from("rice_income").select("*").eq("cultivation_id", id).order("date", { ascending: false });
    if (data) setNellIncomeRecords(data);
  };

  const fetchCultivation = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("cultivations").select("*").eq("id", id).single();
    if (!error && data) {
      setCultivation(data);
      setEndDateInput(data.end_date ?? "");
      setVarietyInput(data.variety_name ?? "");
      setQuantityInput(data.quantity != null ? String(data.quantity) : "");
      setQuantityUnitInput(data.quantity_unit ?? QUANTITY_CONFIG[data.crop_type]?.units[0]?.value ?? "");
      const { data: farmData } = await supabase.from("farms").select("name").eq("id", data.farm_id).single();
      if (farmData) setFarmName(farmData.name);
    }
    setLoading(false);
  };

  const saveEndDate = async () => {
    if (!cultivation) return;
    if (endDateInput && cultivation.start_date && endDateInput <= cultivation.start_date) {
      setEndDateError(L("End date must be after start date", "முடிவு தேதி தொடக்க தேதிக்கு பிறகு இருக்க வேண்டும்"));
      return;
    }
    setEndDateError("");
    setSavingEndDate(true);
    try {
      const { error } = await supabase
        .from("cultivations")
        .update({
          end_date: endDateInput || null,
          status: endDateInput ? "completed" : "active",
        })
        .eq("id", id);
      if (error) reportError("Error saving end date", error.message);
      else fetchCultivation();
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingEndDate(false);
  };

  const saveDetails = async () => {
    if (!cultivation) return;
    setSavingDetails(true);
    try {
      const { error } = await supabase
        .from("cultivations")
        .update({
          variety_name: varietyInput.trim() || null,
          quantity: quantityInput ? parseFloat(quantityInput) : null,
          quantity_unit: quantityInput ? quantityUnitInput || null : null,
        })
        .eq("id", id);
      if (error) reportError("Error saving details", error.message);
      else {
        setEditingDetails(false);
        fetchCultivation();
      }
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingDetails(false);
  };

  const deleteCultivation = () => {
    if (!cultivation) return;
    confirmDelete(async () => {
    setDeletingCultivation(true);
    try {
      const { error } = await supabase.from("cultivations").delete().eq("id", id);
      if (error) {
        reportError("Error deleting cultivation", error.message);
        setDeletingCultivation(false);
      } else {
        await ActivityLog.deleted("Crop", `${crop.labelEn} cultivation deleted`);
        router.push(`/farms/${cultivation.farm_id}`);
      }
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
      setDeletingCultivation(false);
    }
    });
  };

  const fetchCoconutDetails = async () => {
    const { data, error } = await supabase
      .from("coconut_details")
      .select("*")
      .eq("cultivation_id", id)
      .maybeSingle();
    if (!error && data) {
      const d = data as CoconutDetails;
      setCoconutDetailsId(d.id);
      setTotalTrees(String(d.total_trees ?? ""));
      setSmallTrees(String(d.small_trees ?? ""));
      setLargeTrees(String(d.large_trees ?? ""));
    }
  };

  const fetchTurmericDetails = async () => {
    const { data, error } = await supabase
      .from("turmeric_details")
      .select("*")
      .eq("cultivation_id", id)
      .maybeSingle();
    if (!error && data) {
      const d = data as TurmericDetails;
      setTurmericDetailsId(d.id);
      setTurmericVariety(d.variety ?? "");
      setTurmericPlantingDate(d.planting_date ?? "");
      setTurmericSeedQuantity(String(d.seed_quantity ?? ""));
      setTurmericExpectedHarvestDate(d.expected_harvest_date ?? "");
    }
  };

  const fetchNellDetails = async () => {
    const { data, error } = await supabase
      .from("nell_details")
      .select("*")
      .eq("cultivation_id", id)
      .maybeSingle();
    if (!error && data) {
      const d = data as NellDetails;
      setNellDetailsId(d.id);
      setNellVariety(d.variety_name ?? "");
      setNellPlantingDate(d.planting_date ?? "");
      setNellSeedQuantity(String(d.seed_quantity ?? ""));
      setNellSeedUnit(d.unit ?? "kg");
      setNellExpectedHarvestDate(d.expected_harvest_date ?? "");
    }
  };

  const fetchElluDetails = async () => {
    const { data, error } = await supabase
      .from("ellu_details")
      .select("*")
      .eq("cultivation_id", id)
      .maybeSingle();
    if (!error && data) {
      const d = data as ElluDetails;
      setElluDetailsId(d.id);
      setElluVariety(d.variety ?? "");
      setElluSowingDate(d.sowing_date ?? "");
      setElluSeedQuantity(String(d.seed_quantity ?? ""));
      setElluExpectedHarvestDate(d.expected_harvest_date ?? "");
    }
  };

  const fetchKuchiDetails = async () => {
    const { data, error } = await supabase
      .from("kuchi_kilangu_details")
      .select("*")
      .eq("cultivation_id", id)
      .maybeSingle();
    if (!error && data) {
      const d = data as KuchiKilanguDetails;
      setKuchiDetailsId(d.id);
      setKuchiStemsPlanted(String(d.stems_planted ?? ""));
      setKuchiSpacingFeet(String(d.spacing_feet ?? ""));
    }
  };

  const fetchGroundnutDetails = async () => {
    const { data, error } = await supabase
      .from("groundnut_details")
      .select("*")
      .eq("cultivation_id", id)
      .maybeSingle();
    if (!error && data) {
      const d = data as GroundnutDetails;
      setGroundnutDetailsId(d.id);
      setGroundnutVariety(d.variety ?? "");
      setGroundnutSeedQtyKg(String(d.seed_quantity_kg ?? ""));
      setGroundnutSeedQtyPerAcre(String(d.seed_quantity_per_acre ?? ""));
      setGroundnutDetailsNotes(d.notes ?? "");
    }
  };

  const fetchGroundnutExpenses = async () => {
    const { data, error } = await supabase
      .from("groundnut_expenses")
      .select("*")
      .eq("cultivation_id", id)
      .order("expense_date", { ascending: false });
    if (!error && data) setGroundnutExpenses(data);
  };

  const fetchGroundnutIncomes = async () => {
    const { data, error } = await supabase
      .from("groundnut_income")
      .select("*")
      .eq("cultivation_id", id)
      .order("harvest_date", { ascending: false });
    if (!error && data) setGroundnutIncomes(data);
  };

  const fetchIncomeRecords = async () => {
    const { data, error } = await supabase
      .from("income_records")
      .select("*")
      .eq("cultivation_id", id)
      .order("income_date", { ascending: false });
    if (!error && data) setIncomeRecords(data);
  };

  const fetchExpenseRecords = async () => {
    const { data, error } = await supabase
      .from("expense_records")
      .select("*")
      .eq("cultivation_id", id)
      .order("expense_date", { ascending: false });
    if (!error && data) setExpenseRecords(data);
  };

  const fetchHarvestRecords = async () => {
    const { data, error } = await supabase
      .from("harvest_records")
      .select("*")
      .eq("cultivation_id", id)
      .order("harvest_date", { ascending: false });
    if (!error && data) setHarvestRecords(data);
  };

  const fetchFertilizerRecords = async () => {
    const { data, error } = await supabase
      .from("fertilizer_applications")
      .select("*")
      .eq("cultivation_id", id)
      .order("application_date", { ascending: false });
    if (!error && data) setFertilizerRecords(data);
  };

  const fetchWeedRecords = async () => {
    const { data, error } = await supabase
      .from("weed_removals")
      .select("*")
      .eq("cultivation_id", id)
      .order("start_date", { ascending: false });
    if (!error && data) setWeedRecords(data);
  };

  const reportError = (label: string, message: string) => toast.error(`${label}: ${message}`);

  // ---- Coconut tree tracking ----
  const totalTreesNum = parseFloat(totalTrees) || 0;
  const smallTreesNum = parseFloat(smallTrees) || 0;
  const largeTreesNum = parseFloat(largeTrees) || 0;
  const treesMismatch =
    totalTrees !== "" && smallTrees !== "" && largeTrees !== "" && smallTreesNum + largeTreesNum !== totalTreesNum;

  const saveCoconutTrees = async () => {
    if (treesMismatch) {
      toast.error(
        L(
          "Small Trees + Large Trees must equal Total Trees",
          "சிறிய மரங்கள் + பெரிய மரங்கள் மொத்த மரங்களுக்கு சமமாக இருக்க வேண்டும்"
        )
      );
      return;
    }
    setSavingTrees(true);
    try {
      const payload = {
        cultivation_id: id,
        total_trees: totalTreesNum,
        small_trees: smallTreesNum,
        large_trees: largeTreesNum,
      };
      const { error } = coconutDetailsId
        ? await supabase.from("coconut_details").update(payload).eq("id", coconutDetailsId)
        : await supabase.from("coconut_details").insert(payload);
      if (error) reportError("Error saving tree details", error.message);
      else fetchCoconutDetails();
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingTrees(false);
  };

  const saveTurmericDetails = async () => {
    setSavingTurmericDetails(true);
    try {
      const payload = {
        cultivation_id: id,
        variety: turmericVariety.trim() || null,
        planting_date: turmericPlantingDate || null,
        seed_quantity: parseFloat(turmericSeedQuantity) || 0,
        expected_harvest_date: turmericExpectedHarvestDate || null,
      };
      const { error } = turmericDetailsId
        ? await supabase.from("turmeric_details").update(payload).eq("id", turmericDetailsId)
        : await supabase.from("turmeric_details").insert(payload);
      if (error) reportError("Error saving turmeric details", error.message);
      else fetchTurmericDetails();
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingTurmericDetails(false);
  };

  const saveNellDetails = async () => {
    setSavingNellDetails(true);
    try {
      const payload = {
        cultivation_id: id,
        variety_name: nellVariety.trim() || null,
        seed_quantity: parseFloat(nellSeedQuantity) || 0,
        unit: nellSeedUnit || null,
        planting_date: nellPlantingDate || null,
        expected_harvest_date: nellExpectedHarvestDate || null,
      };
      const { data: existing } = await supabase
        .from("nell_details")
        .select("id")
        .eq("cultivation_id", id)
        .maybeSingle();
      const { error } = existing
        ? await supabase.from("nell_details").update(payload).eq("id", existing.id)
        : await supabase.from("nell_details").insert(payload);
      if (error) reportError("Error saving rice details", error.message);
      else fetchNellDetails();
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingNellDetails(false);
  };

  const saveElluDetails = async () => {
    setSavingElluDetails(true);
    try {
      const payload = {
        cultivation_id: id,
        variety: elluVariety.trim() || null,
        sowing_date: elluSowingDate || null,
        seed_quantity: parseFloat(elluSeedQuantity) || 0,
        expected_harvest_date: elluExpectedHarvestDate || null,
      };
      const { error } = elluDetailsId
        ? await supabase.from("ellu_details").update(payload).eq("id", elluDetailsId)
        : await supabase.from("ellu_details").insert(payload);
      if (error) reportError("Error saving ellu details", error.message);
      else fetchElluDetails();
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingElluDetails(false);
  };

  const saveKuchiDetails = async () => {
    setSavingKuchiDetails(true);
    try {
      const payload = {
        cultivation_id: id,
        stems_planted: parseInt(kuchiStemsPlanted) || 0,
        spacing_feet: parseFloat(kuchiSpacingFeet) || 0,
      };
      const { error } = kuchiDetailsId
        ? await supabase.from("kuchi_kilangu_details").update(payload).eq("id", kuchiDetailsId)
        : await supabase.from("kuchi_kilangu_details").insert(payload);
      if (error) reportError("Error saving kuchi kilangu details", error.message);
      else fetchKuchiDetails();
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingKuchiDetails(false);
  };

  // ---- Groundnut details ----
  const saveGroundnutDetails = async () => {
    setSavingGroundnutDetails(true);
    try {
      const payload = {
        cultivation_id: id,
        variety: groundnutVariety.trim() || null,
        seed_quantity_kg: groundnutSeedQtyKg ? parseFloat(groundnutSeedQtyKg) : null,
        seed_quantity_per_acre: groundnutSeedQtyPerAcre ? parseFloat(groundnutSeedQtyPerAcre) : null,
        notes: groundnutDetailsNotes.trim() || null,
      };
      const { error } = groundnutDetailsId
        ? await supabase.from("groundnut_details").update(payload).eq("id", groundnutDetailsId)
        : await supabase.from("groundnut_details").insert(payload);
      if (error) reportError("Error saving details", error.message);
      else {
        toast.success(L("✅ Details saved!", "✅ விவரங்கள் சேமிக்கப்பட்டன!"));
        fetchGroundnutDetails();
      }
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingGroundnutDetails(false);
  };

  // ---- Groundnut expenses ----
  const saveGroundnutExpense = async () => {
    if (!groundnutExpenseDate) {
      toast.error(L("Date required", "தேதி தேவை"));
      return;
    }
    if (isFutureDate(groundnutExpenseDate)) {
      toast.error(L("Future date not allowed", "எதிர்கால தேதி அனுமதிக்கப்படவில்லை"));
      return;
    }

    setSavingGroundnutExpense(true);
    try {
      let amount = Number(groundnutExpenseAmount) || 0;

      // Auto-calculate for dry leaf rolling
      if (groundnutExpenseType === "dry_leaf_rolling") {
        const rolls = Number(groundnutExpenseRolls) || 0;
        const rate = Number(groundnutExpenseRatePerRoll) || 0;
        amount = rolls * rate;
      }

      // Auto-calculate for seed purchase
      if (groundnutExpenseType === "seed_purchase" && groundnutExpenseQty && groundnutExpenseRate) {
        amount = Number(groundnutExpenseQty) * Number(groundnutExpenseRate);
      }

      const { error } = await supabase.from("groundnut_expenses").insert({
        cultivation_id: id,
        expense_date: groundnutExpenseDate,
        expense_type: groundnutExpenseType,
        quantity: Number(groundnutExpenseQty) || null,
        quantity_unit: groundnutExpenseType === "seed_purchase" ? "kg" : null,
        rate: Number(groundnutExpenseRate) || null,
        amount,
        number_of_rolls: groundnutExpenseType === "dry_leaf_rolling" ? Number(groundnutExpenseRolls) || null : null,
        rate_per_roll: groundnutExpenseType === "dry_leaf_rolling" ? Number(groundnutExpenseRatePerRoll) || null : null,
        notes: groundnutExpenseNotes.trim() || null,
      });

      if (error) reportError("Error saving expense", error.message);
      else {
        toast.success(L("✅ Expense saved!", "✅ செலவு சேமிக்கப்பட்டது!"));

        // Reset form
        setGroundnutExpenseDate("");
        setGroundnutExpenseAmount("");
        setGroundnutExpenseQty("");
        setGroundnutExpenseRate("");
        setGroundnutExpenseRolls("");
        setGroundnutExpenseRatePerRoll("");
        setGroundnutExpenseNotes("");

        fetchGroundnutExpenses();

        await ActivityLog.added("Expense", `Groundnut ${groundnutExpenseType}: ₹${amount}`);
      }
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingGroundnutExpense(false);
  };

  // ---- Groundnut income ----
  const saveGroundnutIncome = async () => {
    if (!groundnutHarvestDate) {
      toast.error(L("Date required", "தேதி தேவை"));
      return;
    }
    if (isFutureDate(groundnutHarvestDate)) {
      toast.error(L("Future date not allowed", "எதிர்கால தேதி அனுமதிக்கப்படவில்லை"));
      return;
    }
    const contactErr = getPhoneError(groundnutBuyerContact, lang);
    if (contactErr) {
      toast.error(contactErr);
      return;
    }

    setSavingGroundnutIncome(true);
    try {
      // Calculate total
      const qty = Number(groundnutQuantity) || 0;
      const rate = Number(groundnutRate) || 0;
      const total = groundnutTotalManual ? Number(groundnutTotalAmount) || 0 : qty * rate;

      const { error } = await supabase.from("groundnut_income").insert({
        cultivation_id: id,
        harvest_date: groundnutHarvestDate,
        quantity_kg: groundnutQuantityUnit === "kg" ? qty : qty * 1000,
        quantity_ton: groundnutQuantityUnit === "ton" ? qty : qty / 1000,
        quantity_unit: groundnutQuantityUnit,
        rate_per_unit: rate,
        total_amount: total,
        buyer_name: groundnutBuyer.trim() || null,
        buyer_contact: groundnutBuyerContact.trim() || null,
        market_details: groundnutMarket.trim() || null,
        notes: groundnutIncomeNotes.trim() || null,
      });

      if (error) reportError("Error saving income", error.message);
      else {
        toast.success(L("✅ Income saved!", "✅ வருமானம் சேமிக்கப்பட்டது!"));

        // Reset
        setGroundnutHarvestDate("");
        setGroundnutQuantity("");
        setGroundnutRate("");
        setGroundnutTotalAmount("");
        setGroundnutTotalManual(false);
        setGroundnutBuyer("");
        setGroundnutBuyerContact("");
        setGroundnutMarket("");
        setGroundnutIncomeNotes("");

        fetchGroundnutIncomes();

        await ActivityLog.added("Income", `Groundnut harvest: ₹${total}`);
      }
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingGroundnutIncome(false);
  };

  const deleteGroundnutExpense = (expId: string) => {
    confirmDelete(async () => {
      const { error } = await supabase.from("groundnut_expenses").delete().eq("id", expId);
      if (error) reportError("Error deleting record", error.message);
      else {
        toast.success(L("✅ Deleted!", "✅ நீக்கப்பட்டது!"));
        fetchGroundnutExpenses();
        await ActivityLog.deleted("Expense", "Groundnut expense deleted");
      }
    });
  };

  const deleteGroundnutIncome = (incId: string) => {
    confirmDelete(async () => {
      const { error } = await supabase.from("groundnut_income").delete().eq("id", incId);
      if (error) reportError("Error deleting record", error.message);
      else {
        toast.success(L("✅ Deleted!", "✅ நீக்கப்பட்டது!"));
        fetchGroundnutIncomes();
        await ActivityLog.deleted("Income", "Groundnut income deleted");
      }
    });
  };

  // ---- Coconut income ----
  const smallCountNum = parseFloat(smallCount) || 0;
  const smallPriceNum = parseFloat(smallPrice) || 0;
  const largeCountNum = parseFloat(largeCount) || 0;
  const largePriceNum = parseFloat(largePrice) || 0;
  const smallRevenue = smallCountNum * smallPriceNum;
  const largeRevenue = largeCountNum * largePriceNum;
  const totalBeforeDeduction = smallRevenue + largeRevenue;
  const totalCoconutCount = smallCountNum + largeCountNum;
  const deductionCount = Math.floor(totalCoconutCount / 100) * 5;
  const averagePrice = totalCoconutCount > 0 ? totalBeforeDeduction / totalCoconutCount : 0;
  const deductionValue = deductionCount * averagePrice;
  const netRevenue = totalBeforeDeduction - deductionValue;

  const saveCoconutIncome = async () => {
    if (!cultivation) return;
    if (!harvestDate || totalCoconutCount <= 0) {
      toast.error(L("Harvest date and at least one coconut count are required", "அறுவடை தேதி மற்றும் எண்ணிக்கை தேவை"));
      return;
    }
    const notes =
      `Small: ${smallCountNum} nos × ₹${smallPriceNum} = ₹${smallRevenue.toFixed(2)}\n` +
      `Large: ${largeCountNum} nos × ₹${largePriceNum} = ₹${largeRevenue.toFixed(2)}\n` +
      `Dealer deduction: -${deductionCount} nos (≈ ₹${deductionValue.toFixed(2)})\n` +
      `Net Income: ₹${netRevenue.toFixed(2)}`;
    setSavingIncome(true);
    try {
      const { error } = await supabase.from("income_records").insert({
        cultivation_id: id,
        farm_id: cultivation.farm_id,
        income_date: harvestDate,
        category: "crop_sale",
        amount: netRevenue,
        quantity: totalCoconutCount,
        unit: "nos",
        price_per_unit: averagePrice,
        buyer_name: buyerName.trim() || null,
        buyer_contact: buyerContact.trim() || null,
        notes,
        small_coconuts: smallCountNum,
        large_coconuts: largeCountNum,
        small_price: smallPriceNum,
        large_price: largePriceNum,
        dealer_deduction: deductionCount,
      });
      if (error) reportError("Error saving income", error.message);
      else {
        setHarvestDate("");
        setSmallCount("");
        setSmallPrice("");
        setLargeCount("");
        setLargePrice("");
        setBuyerName("");
        setBuyerContact("");
        fetchIncomeRecords();
      }
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingIncome(false);
  };

  // ---- Generic income ----
  const saveIncome = async () => {
    if (!cultivation) return;
    if (!incomeDate || !incomeAmount) {
      toast.error(L("Date and amount are required", "தேதி மற்றும் தொகை தேவை"));
      return;
    }
    if (isFutureDate(incomeDate)) {
      toast.error(getValidationMessage("future_date", lang));
      return;
    }
    if (Number(incomeAmount) < 0) {
      toast.error(getValidationMessage("negative", lang));
      return;
    }
    setSavingIncome(true);
    try {
      const { error } = await supabase.from("income_records").insert({
        cultivation_id: id,
        farm_id: cultivation.farm_id,
        income_date: incomeDate,
        category: "crop_sale",
        amount: parseFloat(incomeAmount) || 0,
        buyer_name: incomeBuyer.trim() || null,
        notes: incomeNotes.trim() || null,
      });
      if (error) reportError("Error saving income", error.message);
      else {
        await ActivityLog.added("Income", `${crop.labelEn} income: ₹${incomeAmount}`);
        setIncomeDate("");
        setIncomeAmount("");
        setIncomeBuyer("");
        setIncomeNotes("");
        fetchIncomeRecords();
      }
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingIncome(false);
  };

  // ---- Sugarcane income ----
  const sugarcaneQuantityTonsNum = parseFloat(sugarcaneQuantityTons) || 0;
  const sugarcaneRatePerTonNum = parseFloat(sugarcaneRatePerTon) || 0;
  const sugarcaneSaleTotal = sugarcaneQuantityTonsNum * sugarcaneRatePerTonNum;

  const saveSugarcaneIncome = async () => {
    if (!cultivation) return;
    if (!sugarcaneSaleDate || sugarcaneQuantityTonsNum <= 0) {
      toast.error(L("Sale date and quantity are required", "விற்பனை தேதி மற்றும் அளவு தேவை"));
      return;
    }
    setSavingSugarcaneIncome(true);
    try {
      const { error } = await supabase.from("income_records").insert({
        cultivation_id: id,
        farm_id: cultivation.farm_id,
        income_date: sugarcaneSaleDate,
        category: "crop_sale",
        buyer_name: sugarcaneBuyerName.trim() || null,
        quantity_tons: sugarcaneQuantityTonsNum,
        rate_per_ton: sugarcaneRatePerTonNum,
        amount: sugarcaneSaleTotal,
        notes: sugarcaneNotes.trim() || null,
      });
      if (error) reportError("Error saving income", error.message);
      else {
        setSugarcaneSaleDate("");
        setSugarcaneBuyerName("");
        setSugarcaneQuantityTons("");
        setSugarcaneRatePerTon("");
        setSugarcaneNotes("");
        fetchIncomeRecords();
      }
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingSugarcaneIncome(false);
  };

  // ---- Ellu income ----
  const elluQuantitySoldNum = parseFloat(elluQuantitySold) || 0;
  const elluPricePerKgNum = parseFloat(elluPricePerKg) || 0;
  const elluSaleTotal = elluQuantitySoldNum * elluPricePerKgNum;

  const saveElluIncome = async () => {
    if (!cultivation) return;
    if (!elluSaleDate || elluQuantitySoldNum <= 0) {
      toast.error(L("Sale date and quantity are required", "விற்பனை தேதி மற்றும் அளவு தேவை"));
      return;
    }
    setSavingElluIncome(true);
    try {
      const { error } = await supabase.from("income_records").insert({
        cultivation_id: id,
        farm_id: cultivation.farm_id,
        income_date: elluSaleDate,
        category: "crop_sale",
        quantity: elluQuantitySoldNum,
        unit: "kg",
        price_per_unit: elluPricePerKgNum,
        amount: elluSaleTotal,
        buyer_name: elluBuyerName.trim() || null,
        notes: elluSaleNotes.trim() || null,
      });
      if (error) reportError("Error saving income", error.message);
      else {
        setElluSaleDate("");
        setElluQuantitySold("");
        setElluPricePerKg("");
        setElluBuyerName("");
        setElluSaleNotes("");
        fetchIncomeRecords();
      }
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingElluIncome(false);
  };

  // ---- Nell (Rice) income ----
  const nellIncomeQtyNum = parseFloat(nellIncomeQty) || 0;
  const nellIncomeRateNum = parseFloat(nellIncomeRate) || 0;
  const nellIncomeComputedTotal = nellIncomeQtyNum * nellIncomeRateNum;
  const nellTotalIncome = nellIncomeRecords.reduce((s, r) => s + Number(r.total_amount), 0);
  const nellTotalExpenses = expenseRecords.reduce((s, r) => s + Number(r.amount), 0);
  const nellNetPL = nellTotalIncome - nellTotalExpenses;
  const riceExpenseTypeBreakdown = RICE_EXPENSE_TYPES.map((t) => ({
    ...t,
    total: expenseRecords.filter((r) => r.stage === t.value).reduce((s, r) => s + Number(r.amount), 0),
  }));
  const nellQtyByUnit = nellIncomeRecords.reduce<Record<string, number>>((acc, r) => {
    acc[r.unit] = (acc[r.unit] ?? 0) + Number(r.quantity_sold);
    return acc;
  }, {});

  const openAddNellIncome = () => {
    setNellEditingIncomeId(null);
    setNellIncomeDate("");
    setNellIncomeMarket("");
    setNellIncomeQty("");
    setNellIncomeUnit("kg");
    setNellIncomeRate("");
    setNellIncomeTotal("");
    setNellIncomeTotalManual(false);
    setNellIncomeNotes("");
    setNellIncomeModalOpen(true);
  };

  const openEditNellIncome = (r: RiceIncome) => {
    setNellEditingIncomeId(r.id);
    setNellIncomeDate(r.date);
    setNellIncomeMarket(r.market_name ?? "");
    setNellIncomeQty(String(r.quantity_sold));
    setNellIncomeUnit(r.unit);
    setNellIncomeRate(String(r.rate_per_unit));
    setNellIncomeTotal(String(r.total_amount));
    setNellIncomeTotalManual(true);
    setNellIncomeNotes(r.notes ?? "");
    setNellIncomeModalOpen(true);
  };

  const saveNellIncome = async () => {
    if (!nellIncomeDate || nellIncomeQtyNum <= 0 || nellIncomeRateNum <= 0) {
      toast.error(L("Date, quantity, and rate are required", "தேதி, அளவு மற்றும் விலை தேவை"));
      return;
    }
    if (nellIncomeDate > new Date().toISOString().slice(0, 10)) {
      toast.error(L("Date cannot be in the future.", "தேதி எதிர்காலத்தில் இருக்கக்கூடாது."));
      return;
    }
    setSavingNellIncome(true);
    try {
      const total = nellIncomeTotalManual ? parseFloat(nellIncomeTotal) || 0 : nellIncomeComputedTotal;
      const payload = {
        cultivation_id: id,
        date: nellIncomeDate || null,
        market_name: nellIncomeMarket.trim() || null,
        quantity_sold: nellIncomeQtyNum,
        unit: nellIncomeUnit,
        rate_per_unit: nellIncomeRateNum,
        total_amount: total,
        notes: nellIncomeNotes.trim() || null,
      };
      const { error } = nellEditingIncomeId
        ? await supabase.from("rice_income").update(payload).eq("id", nellEditingIncomeId)
        : await supabase.from("rice_income").insert(payload);
      if (error) reportError("Error saving income", error.message);
      else {
        setNellIncomeModalOpen(false);
        fetchNellIncome();
      }
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingNellIncome(false);
  };

  const deleteNellIncome = (incomeId: string) => {
    confirmDelete(async () => {
      const { error } = await supabase.from("rice_income").delete().eq("id", incomeId);
      if (error) reportError("Error deleting income", error.message);
      else fetchNellIncome();
    });
  };

  // ---- Fodder corn cutting cycles ----
  const cuttingQtyNum = parseFloat(cuttingQty) || 0;
  const cuttingRateNum = parseFloat(cuttingRate) || 0;
  const cuttingAmount = cuttingQtyNum * cuttingRateNum;
  const nextCutNumber = harvestRecords.length + 1;

  const saveCutting = async () => {
    if (!cultivation) return;
    if (!cuttingDate || cuttingQtyNum <= 0) {
      toast.error(L("Cutting date and quantity are required", "வெட்டும் தேதி மற்றும் அளவு தேவை"));
      return;
    }
    setSavingCutting(true);
    try {
      const { error: harvestError } = await supabase.from("harvest_records").insert({
        cultivation_id: id,
        harvest_date: cuttingDate,
        yield_quantity: cuttingQtyNum,
        yield_unit: cuttingUnit,
        cutting_number: nextCutNumber,
        notes: cuttingNotes.trim() || null,
      });
      if (harvestError) {
        reportError("Error saving cutting record", harvestError.message);
        setSavingCutting(false);
        return;
      }
      const { error: incomeError } = await supabase.from("income_records").insert({
        cultivation_id: id,
        farm_id: cultivation.farm_id,
        income_date: cuttingDate,
        category: "crop_sale",
        stage: "fodder_cutting",
        amount: cuttingAmount,
        quantity: cuttingQtyNum,
        unit: cuttingUnit,
        price_per_unit: cuttingRateNum,
        buyer_name: cuttingSoldTo.trim() || null,
      });
      if (incomeError) reportError("Error saving income", incomeError.message);
      setCuttingDate("");
      setCuttingQty("");
      setCuttingSoldTo("");
      setCuttingRate("");
      setCuttingNotes("");
      fetchHarvestRecords();
      fetchIncomeRecords();
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingCutting(false);
  };

  // ---- Onion income ----
  const onionIncomeRecords = incomeRecords.filter((r) => r.stage === "onion_sale");
  const totalOnionSalesIncome = onionIncomeRecords.reduce((sum, r) => sum + Number(r.amount), 0);
  const onionQtySoldNum = parseFloat(onionQtySold) || 0;
  const onionRateNum = parseFloat(onionRate) || 0;
  const onionComputedTotal = onionQtySoldNum * onionRateNum;
  const onionQtyByUnit = onionIncomeRecords.reduce<Record<string, number>>((acc, r) => {
    const u = r.unit ?? "kg";
    acc[u] = (acc[u] ?? 0) + Number(r.quantity ?? 0);
    return acc;
  }, {});

  const openAddOnionIncome = () => {
    setOnionEditingIncomeId(null);
    setOnionSaleDate("");
    setOnionQtySold("");
    setOnionUnit("kg");
    setOnionRate("");
    setOnionTotal("");
    setOnionTotalManual(false);
    setOnionBuyerName("");
    setOnionContact("");
    setOnionSaleNotes("");
    setOnionIncomeModalOpen(true);
  };

  const openEditOnionIncome = (r: IncomeRecord) => {
    setOnionEditingIncomeId(r.id);
    setOnionSaleDate(r.income_date);
    setOnionQtySold(String(r.quantity ?? ""));
    setOnionUnit(r.unit ?? "kg");
    setOnionRate(String(r.price_per_unit ?? ""));
    setOnionTotal(String(r.amount));
    setOnionTotalManual(true);
    setOnionBuyerName(r.buyer_name ?? "");
    setOnionContact(r.buyer_contact ?? "");
    setOnionSaleNotes(r.notes ?? "");
    setOnionIncomeModalOpen(true);
  };

  const saveOnionSale = async () => {
    if (!cultivation) return;
    if (!onionSaleDate || onionQtySoldNum <= 0 || onionRateNum <= 0) {
      toast.error(L("Sale date, quantity, and rate are required", "விற்பனை தேதி, அளவு மற்றும் விலை தேவை"));
      return;
    }
    if (onionContact.trim() && !/^\d+$/.test(onionContact.trim())) {
      toast.error(L("Contact number must contain numbers only", "தொடர்பு எண்ணில் எண்கள் மட்டும் இருக்க வேண்டும்"));
      return;
    }
    setSavingOnionSale(true);
    try {
      const total = onionTotalManual ? parseFloat(onionTotal) || 0 : onionComputedTotal;
      const payload = {
        cultivation_id: id,
        farm_id: cultivation.farm_id,
        income_date: onionSaleDate || null,
        category: "crop_sale",
        stage: "onion_sale",
        quantity: onionQtySoldNum,
        unit: onionUnit,
        price_per_unit: onionRateNum,
        amount: total,
        buyer_name: onionBuyerName.trim() || null,
        buyer_contact: onionContact.trim() || null,
        notes: onionSaleNotes.trim() || null,
      };
      const { error } = onionEditingIncomeId
        ? await supabase.from("income_records").update(payload).eq("id", onionEditingIncomeId)
        : await supabase.from("income_records").insert(payload);
      if (error) reportError("Error saving income", error.message);
      else {
        setOnionIncomeModalOpen(false);
        fetchIncomeRecords();
      }
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingOnionSale(false);
  };

  const deleteOnionIncome = (recordId: string) => {
    confirmDelete(async () => {
      const { error } = await supabase.from("income_records").delete().eq("id", recordId);
      if (error) reportError("Error deleting income", error.message);
      else fetchIncomeRecords();
    });
  };

  // ---- Onion storage & maintenance expense ----
  const onionStorageRecords = expenseRecords.filter((r) => r.stage === "storage");
  const totalStorageCost = onionStorageRecords.reduce((sum, r) => sum + Number(r.amount), 0);

  const openAddOnionStorageExpense = () => {
    setOnionStorageEditingId(null);
    setOnionStorageDate("");
    setOnionStorageType("storage_rent");
    setOnionStorageAmount("");
    setOnionStorageNotes("");
    setOnionStorageModalOpen(true);
  };

  const openEditOnionStorageExpense = (r: ExpenseRecord) => {
    setOnionStorageEditingId(r.id);
    setOnionStorageDate(r.expense_date);
    setOnionStorageType(
      ONION_STORAGE_EXPENSE_TYPES.some((t) => t.value === r.description) ? (r.description as string) : "storage_rent"
    );
    setOnionStorageAmount(String(r.amount));
    setOnionStorageNotes(r.notes ?? "");
    setOnionStorageModalOpen(true);
  };

  const saveOnionStorageExpense = async () => {
    if (!cultivation) return;
    if (!onionStorageDate || !onionStorageAmount || parseFloat(onionStorageAmount) <= 0) {
      toast.error(L("Date and amount are required", "தேதி மற்றும் தொகை தேவை"));
      return;
    }
    setSavingOnionStorageExpense(true);
    try {
      const payload = {
        cultivation_id: id,
        farm_id: cultivation.farm_id,
        expense_date: onionStorageDate || null,
        category: ONION_STORAGE_CATEGORY_MAP[onionStorageType] ?? "miscellaneous",
        stage: "storage",
        amount: parseFloat(onionStorageAmount) || 0,
        description: onionStorageType,
        vendor_name: null,
        notes: onionStorageNotes.trim() || null,
      };
      const { error } = onionStorageEditingId
        ? await supabase.from("expense_records").update(payload).eq("id", onionStorageEditingId)
        : await supabase.from("expense_records").insert(payload);
      if (error) reportError("Error saving storage expense", error.message);
      else {
        setOnionStorageModalOpen(false);
        fetchExpenseRecords();
      }
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingOnionStorageExpense(false);
  };

  const deleteOnionStorageExpense = (recordId: string) => {
    confirmDelete(async () => {
      const { error } = await supabase.from("expense_records").delete().eq("id", recordId);
      if (error) reportError("Error deleting storage expense", error.message);
      else fetchExpenseRecords();
    });
  };

  // ---- Kuchi kilangu income ----
  const kuchiQtySoldNum = parseFloat(kuchiQtySold) || 0;
  const kuchiRatePerKgNum = parseFloat(kuchiRatePerKg) || 0;
  const kuchiSaleTotal = kuchiQtySoldNum * kuchiRatePerKgNum;

  const saveKuchiIncome = async () => {
    if (!cultivation) return;
    if (!kuchiSaleDate || kuchiQtySoldNum <= 0) {
      toast.error(L("Sale date and quantity are required", "விற்பனை தேதி மற்றும் அளவு தேவை"));
      return;
    }
    setSavingKuchiSale(true);
    try {
      const buyerTypeLabel = KUCHI_BUYER_TYPES.find((b) => b.value === kuchiBuyerType)?.en ?? kuchiBuyerType;
      const notes = `Buyer Type: ${buyerTypeLabel}${kuchiSaleNotes.trim() ? ` · ${kuchiSaleNotes.trim()}` : ""}`;
      const { error } = await supabase.from("income_records").insert({
        cultivation_id: id,
        farm_id: cultivation.farm_id,
        income_date: kuchiSaleDate,
        category: "crop_sale",
        stage: "kilangu_sale",
        quantity: kuchiQtySoldNum,
        unit: kuchiUnit,
        price_per_unit: kuchiRatePerKgNum,
        amount: kuchiSaleTotal,
        buyer_name: kuchiBuyerName.trim() || null,
        notes,
      });
      if (error) reportError("Error saving income", error.message);
      else {
        setKuchiSaleDate("");
        setKuchiQtySold("");
        setKuchiRatePerKg("");
        setKuchiBuyerName("");
        setKuchiSaleNotes("");
        fetchIncomeRecords();
      }
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingKuchiSale(false);
  };

  // ---- Generic expense ----
  const isSugarcaneLabour = isSugarcane && expenseCategory === "labour";
  const sugarcaneLabourRateNum = parseFloat(sugarcaneLabourRatePerTon) || 0;
  const sugarcaneLabourTonsNum = parseFloat(sugarcaneLabourTotalTons) || 0;
  const sugarcaneLabourTotal = sugarcaneLabourRateNum * sugarcaneLabourTonsNum;

  const saveExpense = async () => {
    if (!cultivation) return;
    if (isSugarcaneLabour) {
      if (!expenseDate || sugarcaneLabourRateNum <= 0 || sugarcaneLabourTonsNum <= 0) {
        toast.error(L("Date, rate per ton, and total tons are required", "தேதி, டன் விலை மற்றும் டன் அளவு தேவை"));
        return;
      }
    } else if (!expenseDate || !expenseAmount) {
      toast.error(L("Date and amount are required", "தேதி மற்றும் தொகை தேவை"));
      return;
    }
    if (isFutureDate(expenseDate)) {
      toast.error(getValidationMessage("future_date", lang));
      return;
    }
    if (!isSugarcaneLabour && Number(expenseAmount) < 0) {
      toast.error(getValidationMessage("negative", lang));
      return;
    }
    setSavingExpense(true);
    try {
      const finalExpenseAmount = isSugarcaneLabour ? sugarcaneLabourTotal : parseFloat(expenseAmount) || 0;
      const { error } = await supabase.from("expense_records").insert({
        cultivation_id: id,
        farm_id: cultivation.farm_id,
        expense_date: expenseDate,
        category: expenseCategory,
        description: expenseDescription.trim() || null,
        vendor_name: expenseVendorName.trim() || null,
        amount: finalExpenseAmount,
        ...(isSugarcaneLabour
          ? { rate_per_ton: sugarcaneLabourRateNum, total_tons: sugarcaneLabourTonsNum }
          : {}),
      });
      if (error) reportError("Error saving expense", error.message);
      else {
        await ActivityLog.added("Expense", `${crop.labelEn} ${expenseCategory}: ₹${finalExpenseAmount}`);
        setExpenseDate("");
        setExpenseDescription("");
        setExpenseVendorName("");
        setExpenseAmount("");
        setSugarcaneLabourRatePerTon("");
        setSugarcaneLabourTotalTons("");
        fetchExpenseRecords();
      }
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingExpense(false);
  };

  // ---- Rice (Nell) unified expenses ----
  const openAddRiceExpense = () => {
    setRiceExpenseEditingId(null);
    setRiceExpenseType("land_preparation");
    setRiceExpenseDate("");
    setRiceExpenseAmount("");
    setRiceExpenseNotes("");
    setRiceExpenseVariety("");
    setRiceExpenseSeedQty("");
    setRiceExpenseSeedUnit("kg");
    setRiceExpenseLaborers("");
    setRiceExpenseOwnerName("");
    setRiceExpenseContact("");
    setRiceExpenseContactError("");
    setRiceExpenseModalOpen(true);
  };

  const openEditRiceExpense = (r: ExpenseRecord) => {
    setRiceExpenseEditingId(r.id);
    setRiceExpenseType(RICE_EXPENSE_TYPES.some((t) => t.value === r.stage) ? (r.stage as string) : "land_preparation");
    setRiceExpenseDate(r.expense_date);
    setRiceExpenseAmount(String(r.amount));
    setRiceExpenseNotes(r.notes ?? "");
    setRiceExpenseVariety("");
    setRiceExpenseSeedQty("");
    setRiceExpenseSeedUnit("kg");
    setRiceExpenseLaborers("");
    setRiceExpenseOwnerName("");
    setRiceExpenseContact("");
    setRiceExpenseContactError("");
    if (r.description) {
      try {
        const extra = JSON.parse(r.description) as Record<string, string>;
        if (extra.variety != null) setRiceExpenseVariety(extra.variety);
        if (extra.qty != null) setRiceExpenseSeedQty(extra.qty);
        if (extra.unit != null) setRiceExpenseSeedUnit(extra.unit);
        if (extra.laborers != null) setRiceExpenseLaborers(extra.laborers);
        if (extra.owner != null) setRiceExpenseOwnerName(extra.owner);
        if (extra.contact != null) setRiceExpenseContact(extra.contact);
      } catch {
        // pre-existing record without structured extra fields — ignore
      }
    }
    setRiceExpenseModalOpen(true);
  };

  const saveRiceExpense = async () => {
    if (!cultivation) return;
    if (!riceExpenseDate || !riceExpenseAmount || parseFloat(riceExpenseAmount) <= 0) {
      toast.error(L("Date and amount are required", "தேதி மற்றும் தொகை தேவை"));
      return;
    }
    const contactErr = getPhoneError(riceExpenseContact, lang);
    if (contactErr) {
      setRiceExpenseContactError(contactErr);
      return;
    }
    setSavingRiceExpense(true);
    try {
      const typeInfo = RICE_EXPENSE_TYPES.find((t) => t.value === riceExpenseType);
      let extra: Record<string, string> | null = null;
      if (riceExpenseType === "seed_expense") {
        extra = {
          ...(riceExpenseVariety.trim() ? { variety: riceExpenseVariety.trim() } : {}),
          ...(riceExpenseSeedQty.trim() ? { qty: riceExpenseSeedQty.trim() } : {}),
          ...(riceExpenseSeedUnit ? { unit: riceExpenseSeedUnit } : {}),
        };
      } else if (riceExpenseType === "transplantation" && riceExpenseLaborers.trim()) {
        extra = { laborers: riceExpenseLaborers.trim() };
      } else if (riceExpenseType === "harvesting") {
        extra = {
          ...(riceExpenseOwnerName.trim() ? { owner: riceExpenseOwnerName.trim() } : {}),
          ...(riceExpenseContact.trim() ? { contact: riceExpenseContact.trim() } : {}),
        };
      }
      const payload = {
        cultivation_id: id,
        farm_id: cultivation.farm_id,
        expense_date: riceExpenseDate || null,
        category: typeInfo?.category ?? "miscellaneous",
        stage: riceExpenseType,
        amount: parseFloat(riceExpenseAmount) || 0,
        description: extra && Object.keys(extra).length > 0 ? JSON.stringify(extra) : null,
        vendor_name: null,
        notes: riceExpenseNotes.trim() || null,
      };
      const { error } = riceExpenseEditingId
        ? await supabase.from("expense_records").update(payload).eq("id", riceExpenseEditingId)
        : await supabase.from("expense_records").insert(payload);
      if (error) reportError("Error saving expense", error.message);
      else {
        setRiceExpenseModalOpen(false);
        fetchExpenseRecords();
      }
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingRiceExpense(false);
  };

  // ---- Coconut labour ----
  const treesHarvestedNum = parseFloat(treesHarvested) || 0;
  const pricePerTreeNum = parseFloat(pricePerTree) || 0;
  const labourTotal = treesHarvestedNum * pricePerTreeNum;

  const saveCoconutLabour = async () => {
    if (!cultivation) return;
    if (!labourDate || treesHarvestedNum <= 0 || pricePerTreeNum <= 0) {
      toast.error(L("Date, trees and price per tree are required", "தேதி, மரங்கள் மற்றும் விலை தேவை"));
      return;
    }
    setSavingLabour(true);
    try {
      const description = `Coconut harvesting labour - ${treesHarvestedNum} trees @ ₹${pricePerTreeNum}/tree`;
      const { error } = await supabase.from("expense_records").insert({
        cultivation_id: id,
        farm_id: cultivation.farm_id,
        expense_date: labourDate,
        category: "labour",
        description,
        trees_harvested: treesHarvestedNum,
        price_per_tree: pricePerTreeNum,
        amount: labourTotal,
      });
      if (error) reportError("Error saving labour expense", error.message);
      else {
        setLabourDate("");
        setTreesHarvested("");
        setPricePerTree("");
        fetchExpenseRecords();
      }
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingLabour(false);
  };

  // ---- Harvest ----
  const saveHarvest = async () => {
    if (!harvestRecordDate || !yieldQuantity) {
      toast.error(L("Date and yield quantity are required", "தேதி மற்றும் அளவு தேவை"));
      return;
    }
    setSavingHarvest(true);
    try {
      const { error } = await supabase.from("harvest_records").insert({
        cultivation_id: id,
        harvest_date: harvestRecordDate,
        yield_quantity: parseFloat(yieldQuantity) || 0,
        yield_unit: yieldUnit,
        notes: harvestNotes.trim() || null,
      });
      if (error) reportError("Error saving harvest", error.message);
      else {
        setHarvestRecordDate("");
        setYieldQuantity("");
        setHarvestNotes("");
        fetchHarvestRecords();
      }
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingHarvest(false);
  };

  // ---- Fertilizer ----
  const saveFertilizer = async () => {
    if (!fertDate || !fertName || !fertQty || !fertCost) {
      toast.error(L("Date, fertilizer name, quantity and cost are required", "தேதி, உரம் பெயர், அளவு மற்றும் செலவு தேவை"));
      return;
    }
    setSavingFert(true);
    try {
      const { error } = await supabase.from("fertilizer_applications").insert({
        cultivation_id: id,
        application_date: fertDate,
        fertilizer_name: fertName.trim(),
        quantity: parseFloat(fertQty) || 0,
        unit: fertUnit,
        crop_month: parseInt(fertMonth) || 0,
        growth_stage: fertStage.trim(),
        cost: parseFloat(fertCost) || 0,
        notes: fertNotes.trim() || null,
      });
      if (error) reportError("Error saving fertilizer record", error.message);
      else {
        setFertDate("");
        setFertName("");
        setFertQty("");
        setFertMonth("");
        setFertStage("");
        setFertCost("");
        setFertNotes("");
        fetchFertilizerRecords();
      }
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingFert(false);
  };

  // ---- Weed removal ----
  const weedDays =
    weedStart && weedEnd
      ? Math.abs(Math.ceil((new Date(weedEnd).getTime() - new Date(weedStart).getTime()) / 86400000)) + 1
      : 0;
  const weedWorkersNum = parseFloat(weedWorkers) || 0;
  const weedCostPerDayNum = parseFloat(weedCostPerDay) || 0;
  const weedTotalCost = weedDays * weedWorkersNum * weedCostPerDayNum;

  const saveWeedRemoval = async () => {
    if (!weedStart || !weedEnd || weedDays <= 0 || weedWorkersNum <= 0 || weedCostPerDayNum <= 0) {
      toast.error(L("All weed removal fields are required", "அனைத்து புல் அகற்றும் தகவல்களும் தேவை"));
      return;
    }
    setSavingWeed(true);
    try {
      const { error } = await supabase.from("weed_removals").insert({
        cultivation_id: id,
        start_date: weedStart,
        end_date: weedEnd,
        total_days: weedDays,
        workers_per_day: weedWorkersNum,
        cost_per_day: weedCostPerDayNum,
        total_cost: weedTotalCost,
        notes: weedNotes.trim() || null,
      });
      if (error) reportError("Error saving weed removal record", error.message);
      else {
        setWeedStart("");
        setWeedEnd("");
        setWeedWorkers("");
        setWeedCostPerDay("");
        setWeedNotes("");
        fetchWeedRecords();
      }
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingWeed(false);
  };

  // ---- Generic turmeric activity engine ----
  const setActivityValue = (key: string, field: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: value } }));
  };

  const deleteExpenseRecord = (recordId: string) => {
    const target = expenseRecords.find((r) => r.id === recordId);
    confirmDelete(async () => {
    try {
      const { error } = await supabase.from("expense_records").delete().eq("id", recordId);
      if (error) reportError("Error deleting record", error.message);
      else {
        await ActivityLog.deleted("Expense", `Expense deleted: ₹${target?.amount ?? 0}`);
        fetchExpenseRecords();
      }
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    });
  };

  const deleteIncomeRecord = (recordId: string) => {
    const target = incomeRecords.find((r) => r.id === recordId);
    confirmDelete(async () => {
    try {
      const { error } = await supabase.from("income_records").delete().eq("id", recordId);
      if (error) reportError("Error deleting record", error.message);
      else {
        await ActivityLog.deleted("Income", `Income deleted: ₹${target?.amount ?? 0}`);
        fetchIncomeRecords();
      }
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    });
  };

  const deleteHarvestRecord = (recordId: string) => {
    const target = harvestRecords.find((r) => r.id === recordId);
    confirmDelete(async () => {
      try {
        const { error } = await supabase.from("harvest_records").delete().eq("id", recordId);
        if (error) reportError("Error deleting record", error.message);
        else {
          await ActivityLog.deleted("Crop", `Harvest record deleted: ${target?.yield_quantity ?? 0}${target?.yield_unit ?? ""}`);
          fetchHarvestRecords();
        }
      } catch (err) {
        reportError("Unexpected error", err instanceof Error ? err.message : String(err));
      }
    });
  };

  const deleteFertilizerRecord = (recordId: string) => {
    const target = fertilizerRecords.find((r) => r.id === recordId);
    confirmDelete(async () => {
      try {
        const { error } = await supabase.from("fertilizer_applications").delete().eq("id", recordId);
        if (error) reportError("Error deleting record", error.message);
        else {
          await ActivityLog.deleted("Crop", `Fertilizer application deleted: ₹${target?.cost ?? 0}`);
          fetchFertilizerRecords();
        }
      } catch (err) {
        reportError("Unexpected error", err instanceof Error ? err.message : String(err));
      }
    });
  };

  const deleteWeedRecord = (recordId: string) => {
    const target = weedRecords.find((r) => r.id === recordId);
    confirmDelete(async () => {
      try {
        const { error } = await supabase.from("weed_removals").delete().eq("id", recordId);
        if (error) reportError("Error deleting record", error.message);
        else {
          await ActivityLog.deleted("Crop", `Weed removal record deleted: ₹${target?.total_cost ?? 0}`);
          fetchWeedRecords();
        }
      } catch (err) {
        reportError("Unexpected error", err instanceof Error ? err.message : String(err));
      }
    });
  };

  const toggleIncomeExpand = (recordId: string) => {
    setExpandedIncomeIds((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  };

  const incomeDetailRows = (r: IncomeRecord): { label: string; value: string }[] => {
    const rows: { label: string; value: string }[] = [];
    if (r.quantity != null) rows.push({ label: L("Quantity", "அளவு"), value: `${r.quantity}${r.unit ? ` ${r.unit}` : ""}` });
    if (r.price_per_unit != null) rows.push({ label: L("Price/unit", "யூனிட் விலை"), value: inr(Number(r.price_per_unit)) });
    if (r.quantity_tons != null) rows.push({ label: L("Tonnage", "டன் எடை"), value: `${r.quantity_tons} ${L("tonnes", "டன்")}` });
    if (r.rate_per_ton != null) rows.push({ label: L("Price/Tonne", "டன் விலை"), value: inr(Number(r.rate_per_ton)) });
    if (r.small_coconuts != null) rows.push({ label: L("Small Coconuts", "சிறிய தேங்காய்"), value: `${r.small_coconuts} nos @ ₹${r.small_price ?? 0}` });
    if (r.large_coconuts != null) rows.push({ label: L("Large Coconuts", "பெரிய தேங்காய்"), value: `${r.large_coconuts} nos @ ₹${r.large_price ?? 0}` });
    if (r.dealer_deduction != null) rows.push({ label: L("Dealer Deduction", "டீலர் தள்ளுபடி"), value: `${r.dealer_deduction} nos` });
    if (r.market_name) rows.push({ label: L("Market", "சந்தை"), value: r.market_name });
    if (r.buyer_name) rows.push({ label: L("Buyer", "வாங்குபவர்"), value: r.buyer_name });
    if (r.buyer_contact) rows.push({ label: L("Buyer Contact", "தொடர்பு"), value: r.buyer_contact });
    if (r.notes) rows.push({ label: L("Notes", "குறிப்பு"), value: r.notes });
    return rows;
  };

  const saveActivity = async (sub: ActivitySubsection) => {
    if (!cultivation) return;
    const values = formValues[sub.key] || {};
    const dateField = sub.dateField ?? "date";
    if (!values[dateField]) {
      toast.error(L("Date is required", "தேதி தேவை"));
      return;
    }
    const amount = sub.computeAmount(values);
    const description = sub.buildDescription(values);
    setSavingActivity((s) => ({ ...s, [sub.key]: true }));
    try {
      const { data: expData, error } = await supabase
        .from("expense_records")
        .insert({
          cultivation_id: id,
          farm_id: cultivation.farm_id,
          expense_date: values[dateField],
          category: sub.category,
          stage: sub.stage,
          description,
          vendor_name: values.vendor_name?.trim() || null,
          amount,
          notes: values.notes?.trim() || null,
          ...(sub.extraColumns ? sub.extraColumns(values) : {}),
        })
        .select("id")
        .single();
      if (error || !expData) {
        reportError("Error saving record", error?.message ?? "Unknown error");
        setSavingActivity((s) => ({ ...s, [sub.key]: false }));
        return;
      }

      if (sub.extra === "fertilizer") {
        await supabase.from("fertilizer_applications").insert({
          cultivation_id: id,
          expense_record_id: expData.id,
          application_date: values.date,
          fertilizer_name: values.fertilizer_name?.trim() || "",
          quantity: num(values.quantity),
          unit: values.unit || "kg",
          crop_month: parseInt(values.crop_month) || 0,
          growth_stage: values.growth_stage?.trim() || "",
          cost: amount,
          notes: values.notes?.trim() || null,
        });
        fetchFertilizerRecords();
      }
      if (sub.extra === "weed") {
        await supabase.from("weed_removals").insert({
          cultivation_id: id,
          expense_record_id: expData.id,
          start_date: values.start_date,
          end_date: values.end_date,
          total_days: weedDaysFromValues(values),
          workers_per_day: num(values.workers_per_day),
          cost_per_day: num(values.cost_per_day),
          total_cost: amount,
          notes: values.notes?.trim() || null,
        });
        fetchWeedRecords();
      }

      setFormValues((s) => ({ ...s, [sub.key]: {} }));
      setFormOpen((s) => ({ ...s, [sub.key]: false }));
      setSuccessMsg((s) => ({ ...s, [sub.key]: L("Saved!", "சேமிக்கப்பட்டது!") }));
      setTimeout(() => setSuccessMsg((s) => ({ ...s, [sub.key]: null })), 2000);
      fetchExpenseRecords();
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingActivity((s) => ({ ...s, [sub.key]: false }));
  };

  // ---- Turmeric crop sale income (bulb + finger side by side) ----
  const turmericBulbQtyNum = parseFloat(turmericBulbQtySold) || 0;
  const turmericBulbPriceNum = parseFloat(turmericBulbPricePerUnit) || 0;
  const turmericBulbSaleTotal = turmericBulbQtyNum * turmericBulbPriceNum;
  const turmericFingerQtyNum = parseFloat(turmericFingerQtySold) || 0;
  const turmericFingerPriceNum = parseFloat(turmericFingerPricePerUnit) || 0;
  const turmericFingerSaleTotal = turmericFingerQtyNum * turmericFingerPriceNum;
  const turmericGrandSaleTotal = turmericBulbSaleTotal + turmericFingerSaleTotal;

  const saveTurmericIncome = async () => {
    if (!cultivation) return;
    if (!turmericSaleDate || (turmericBulbQtyNum <= 0 && turmericFingerQtyNum <= 0)) {
      toast.error(L("Sale date and at least one quantity are required", "விற்பனை தேதி மற்றும் அளவு தேவை"));
      return;
    }
    setSavingTurmericSale(true);
    try {
      const rows = [];
      if (turmericBulbQtyNum > 0) {
        rows.push({
          cultivation_id: id,
          farm_id: cultivation.farm_id,
          income_date: turmericSaleDate,
          category: "crop_sale",
          stage: "turmeric_sale",
          turmeric_type: "bulb",
          quantity: turmericBulbQtyNum,
          unit: turmericBulbSaleUnit,
          price_per_unit: turmericBulbPriceNum,
          amount: turmericBulbSaleTotal,
          market_name: turmericMarketName.trim() || null,
          buyer_name: turmericSaleBuyer.trim() || null,
          notes: turmericSaleNotes.trim() || null,
        });
      }
      if (turmericFingerQtyNum > 0) {
        rows.push({
          cultivation_id: id,
          farm_id: cultivation.farm_id,
          income_date: turmericSaleDate,
          category: "crop_sale",
          stage: "turmeric_sale",
          turmeric_type: "finger",
          quantity: turmericFingerQtyNum,
          unit: turmericFingerSaleUnit,
          price_per_unit: turmericFingerPriceNum,
          amount: turmericFingerSaleTotal,
          market_name: turmericMarketName.trim() || null,
          buyer_name: turmericSaleBuyer.trim() || null,
          notes: turmericSaleNotes.trim() || null,
        });
      }
      const { error } = await supabase.from("income_records").insert(rows);
      if (error) reportError("Error saving income", error.message);
      else {
        setTurmericSaleDate("");
        setTurmericMarketName("");
        setTurmericBulbQtySold("");
        setTurmericBulbPricePerUnit("");
        setTurmericFingerQtySold("");
        setTurmericFingerPricePerUnit("");
        setTurmericSaleBuyer("");
        setTurmericSaleNotes("");
        fetchIncomeRecords();
      }
    } catch (err) {
      reportError("Unexpected error", err instanceof Error ? err.message : String(err));
    }
    setSavingTurmericSale(false);
  };

  const deleteTurmericSaleGroup = (group: TurmericSaleGroup) => {
    const ids = [group.bulb?.id, group.finger?.id].filter((v): v is string => !!v);
    if (ids.length === 0) return;
    confirmDelete(async () => {
      try {
        const { error } = await supabase.from("income_records").delete().in("id", ids);
        if (error) reportError("Error deleting record", error.message);
        else fetchIncomeRecords();
      } catch (err) {
        reportError("Unexpected error", err instanceof Error ? err.message : String(err));
      }
    });
  };

  const totalIncome = incomeRecords.reduce((sum, r) => sum + Number(r.amount), 0);
  const totalExpenses = expenseRecords.reduce((sum, r) => sum + Number(r.amount), 0);
  const netProfit = totalIncome - totalExpenses;

  const isCultivationDone = !!cultivation?.end_date;
  const cultivationStatusLabel = isCultivationDone
    ? L("Cultivation Done", "பயிர் முடிந்தது")
    : L("Active", "செயலில்");
  const cultivationDays = cultivation?.start_date
    ? Math.floor((Date.now() - new Date(cultivation.start_date).getTime()) / 86400000)
    : null;

  const turmericSales = incomeRecords.filter((r) => r.stage === "turmeric_sale");
  const turmericBulbSales = turmericSales.filter((r) => r.turmeric_type === "bulb");
  const turmericFingerSales = turmericSales.filter((r) => r.turmeric_type === "finger");
  const turmericBulbQty = turmericBulbSales.reduce((sum, r) => sum + Number(r.quantity ?? 0), 0);
  const turmericBulbTotal = turmericBulbSales.reduce((sum, r) => sum + Number(r.amount), 0);
  const turmericFingerQty = turmericFingerSales.reduce((sum, r) => sum + Number(r.quantity ?? 0), 0);
  const turmericFingerTotal = turmericFingerSales.reduce((sum, r) => sum + Number(r.amount), 0);
  const turmericSalesGrandTotal = turmericBulbTotal + turmericFingerTotal;

  type TurmericSaleGroup = {
    key: string;
    date: string;
    market: string | null;
    buyer: string | null;
    bulb?: IncomeRecord;
    finger?: IncomeRecord;
  };
  const turmericSaleGroups: TurmericSaleGroup[] = (() => {
    const map = new Map<string, TurmericSaleGroup>();
    turmericSales.forEach((r) => {
      const key = `${r.income_date}__${r.market_name ?? ""}`;
      const group = map.get(key) ?? { key, date: r.income_date, market: r.market_name, buyer: r.buyer_name };
      if (r.turmeric_type === "bulb") group.bulb = r;
      else if (r.turmeric_type === "finger") group.finger = r;
      map.set(key, group);
    });
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  })();

  const turmericExpenseBreakdown = TURMERIC_SUBSECTIONS.map((sub) => ({
    key: sub.key,
    titleEn: sub.titleEn,
    titleTa: sub.titleTa,
    total: expenseRecords.filter((r) => r.stage === sub.stage).reduce((sum, r) => sum + Number(r.amount), 0),
  }));

  const fodderCuttings = [...harvestRecords]
    .sort((a, b) => (a.cutting_number ?? 0) - (b.cutting_number ?? 0))
    .map((h) => ({
      harvest: h,
      income: incomeRecords.find((r) => r.stage === "fodder_cutting" && r.income_date === h.harvest_date),
    }));

  const renderField = (sub: ActivitySubsection, f: ActivityField, values: Record<string, string>) => (
    <div key={f.name}>
      <label className={labelCls}>{lang === "ta" ? f.labelTa : f.labelEn}</label>
      {f.type === "select" ? (
        <select
          value={values[f.name] || ""}
          onChange={(e) => setActivityValue(sub.key, f.name, e.target.value)}
          className={inputCls}
        >
          {(f.options || []).map((o) => (
            <option className="text-gray-900" key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          type={f.type}
          value={values[f.name] || ""}
          onChange={(e) => setActivityValue(sub.key, f.name, e.target.value)}
          className={inputCls}
        />
      )}
    </div>
  );

  const renderSubsection = (sub: ActivitySubsection) => {
    const isOpen = formOpen[sub.key] ?? false;
    const values = formValues[sub.key] || {};
    const records = expenseRecords.filter((r) => r.stage === sub.stage);
    const total = records.reduce((s, r) => s + Number(r.amount), 0);

    return (
      <div key={sub.key} className="border border-gray-100 rounded-xl p-2 mb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFormOpen((s) => ({ ...s, [sub.key]: !isOpen }))}
              className="w-6 h-6 flex items-center justify-center rounded-full bg-green-100 text-primary text-sm font-bold hover:bg-green-200 transition"
            >
              {isOpen ? "−" : "+"}
            </button>
            <span className="text-sm font-semibold text-gray-800">
              {lang === "ta" ? sub.titleTa : sub.titleEn}
            </span>
          </div>
          <span className="text-xs text-gray-500">{inr(total)}</span>
        </div>

        {isOpen && (
          <div className="mt-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {sub.fields.map((f) => renderField(sub, f, values))}
            </div>
            <p className="text-xs font-mono text-gray-600 mt-1">
              {L("Amount", "தொகை")}: {inr(sub.computeAmount(values))}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={() => saveActivity(sub)}
                disabled={savingActivity[sub.key]}
                className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-3 py-1 text-sm font-medium transition"
              >
                {savingActivity[sub.key] ? "..." : L("Save", "சேமி")}
              </button>
              {successMsg[sub.key] && (
                <span className="text-xs text-green-600 font-medium">{successMsg[sub.key]}</span>
              )}
            </div>
          </div>
        )}

        {records.length > 0 && (
          <div className="mt-2 max-h-24 overflow-y-auto">
            {records.map((r) => (
              <div key={r.id} className="flex justify-between items-center text-xs text-gray-600 border-b border-gray-50 py-0.5">
                <span className="truncate">{r.expense_date} · {r.description}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {inr(Number(r.amount))}
                  <button onClick={() => deleteExpenseRecord(r.id)} className="hover:text-danger">🗑️</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderVarietyQuantityFields = (includeQuantity = true) => {
    const qConfig = QUANTITY_CONFIG[cropType];
    const qLabel = qConfig?.labelFor(quantityUnitInput) ?? { en: "Quantity", ta: "அளவு" };

    if (!editingDetails) {
      return (
        <div className="flex flex-wrap items-center gap-3 text-xs mt-2 pt-2 border-t border-gray-100">
          <span>
            <span className="text-gray-500">{L("Variety (வகை)", "வகை (Variety)")}:</span>{" "}
            <span className="font-semibold text-gray-800">
              {cultivation?.variety_name || L("Not set", "அமைக்கப்படவில்லை")}
            </span>
          </span>
          {includeQuantity && (
            <span>
              <span className="text-gray-500">
                {lang === "ta" ? qLabel.ta : qLabel.en} ({lang === "ta" ? qLabel.en : qLabel.ta}):
              </span>{" "}
              <span className="font-semibold text-gray-800">
                {cultivation?.quantity != null
                  ? `${cultivation.quantity} ${cultivation.quantity_unit ?? ""}`
                  : L("Not set", "அமைக்கப்படவில்லை")}
              </span>
            </span>
          )}
          <button
            onClick={() => setEditingDetails(true)}
            className="text-primary hover:text-primary/80 font-semibold ml-auto"
          >
            ✏️ {L("Edit", "திருத்து")}
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-wrap items-end gap-2 mt-2 pt-2 border-t border-gray-100">
        <div>
          <label className="text-xs text-gray-500 block">
            {L("Variety Name (வகை பெயர்)", "வகை பெயர் (Variety Name)")}
          </label>
          <input
            type="text"
            value={varietyInput}
            onChange={(e) => setVarietyInput(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-xs bg-white text-gray-900 w-36"
          />
        </div>

        {includeQuantity && (
          <div>
            <label className="text-xs text-gray-500 block">
              {lang === "ta" ? qLabel.ta : qLabel.en} ({lang === "ta" ? qLabel.en : qLabel.ta})
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={quantityInput}
              onChange={(e) => setQuantityInput(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-xs bg-white text-gray-900 w-24"
            />
          </div>
        )}

        {includeQuantity && qConfig && qConfig.units.length > 1 ? (
          <div className="flex items-center gap-1">
            {qConfig.units.map((u) => (
              <button
                key={u.value}
                type="button"
                onClick={() => setQuantityUnitInput(u.value)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  quantityUnitInput === u.value
                    ? "bg-primary text-white"
                    : "bg-gray-100 text-gray-500 border border-gray-200"
                }`}
              >
                {lang === "ta" ? u.ta : u.en}
              </button>
            ))}
          </div>
        ) : includeQuantity && qConfig ? (
          <span className="text-xs text-gray-500 self-center">
            {lang === "ta" ? qConfig.units[0].ta : qConfig.units[0].en}
          </span>
        ) : null}

        <button
          onClick={saveDetails}
          disabled={savingDetails}
          className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded px-3 py-1.5 text-sm font-medium transition"
        >
          {savingDetails ? "..." : L("Save", "சேமி")}
        </button>
        <button
          onClick={() => {
            setEditingDetails(false);
            setVarietyInput(cultivation?.variety_name ?? "");
            setQuantityInput(cultivation?.quantity != null ? String(cultivation.quantity) : "");
            setQuantityUnitInput(cultivation?.quantity_unit ?? qConfig?.units[0]?.value ?? "");
          }}
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 rounded px-3 py-1.5 text-sm font-medium transition"
        >
          {L("Cancel", "ரத்து")}
        </button>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex h-screen overflow-hidden bg-page">
        <Sidebar lang={lang} setLang={setLang} />
        <main className="flex-1 p-3 flex flex-col gap-3">
          <div className="h-12 bg-gray-200 rounded-xl animate-pulse" />
          <div className="h-16 bg-gray-200 rounded-xl animate-pulse" />
          <div className="flex-1 bg-gray-200 rounded-2xl animate-pulse" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <Sidebar lang={lang} setLang={setLang} />

      <main className="flex-1 overflow-y-auto p-3">
        <div className="max-w-5xl mx-auto flex flex-col gap-3">

          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm py-2 px-4 shrink-0">
            <div className="flex items-center justify-between">
              <Link
                href={cultivation ? `/farms/${cultivation.farm_id}` : "/farms"}
                className="text-primary hover:text-primary text-sm font-semibold"
              >
                ← {L("Back to Farm", "நிலத்திற்கு திரும்பு")}
              </Link>
              <h1 className="text-xl font-bold text-primary">
                {crop.icon} {lang === "ta" ? crop.labelTa : crop.labelEn}
              </h1>
              <button
                onClick={() => setLang(lang === "ta" ? "en" : "ta")}
                className="px-3 py-1.5 rounded-lg border border-primary/40 text-primary text-sm font-medium hover:bg-green-50 transition"
              >
                {lang === "ta" ? "English" : "தமிழ்"}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className="bg-gray-100 text-gray-700 text-xs font-medium px-2 py-0.5 rounded-full">
                🌳 {farmName}
              </span>
              <span className="bg-gray-100 text-gray-700 text-xs font-medium px-2 py-0.5 rounded-full">
                📐 {cultivation?.area} {L("Acres", "ஏக்கர்")}
              </span>
              <span className={`${isCultivationDone ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"} text-xs font-medium px-2 py-0.5 rounded-full`}>
                {cultivationStatusLabel}
              </span>
              {cultivation?.start_date && (
                <span className="bg-gray-100 text-gray-700 text-xs font-medium px-2 py-0.5 rounded-full">
                  📅 {L("Started", "தொடக்கம்")}: {formatDMY(cultivation.start_date)}
                  {cultivationDays !== null && ` · ${L("Day", "நாள்")} ${cultivationDays}`}
                </span>
              )}
              {cultivation?.end_date && (
                <span className="bg-gray-100 text-gray-700 text-xs font-medium px-2 py-0.5 rounded-full">
                  → {L("Ended", "முடிவு")}: {formatDMY(cultivation.end_date)}
                </span>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-white rounded-xl shadow-sm p-1 w-fit shrink-0">
            {(isNell
              ? ([
                  ["overview", L("Overview", "மேலோட்டம்")],
                  ["finance", L("Finance", "நிதி")],
                  ["activities", L("Activities", "செயல்பாடுகள்")],
                  ["income", L("Income", "வருமானம்")],
                ] as const)
              : ([
                  ["overview", L("Overview", "மேலோட்டம்")],
                  ["finance", L("Finance", "நிதி")],
                  ["activities", L("Activities", "செயல்பாடுகள்")],
                ] as const)
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
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
          {/* OVERVIEW TAB */}
          {activeTab === "overview" && (
            <div className="flex flex-col gap-3">

              {/* Cultivation Status */}
              <div className="bg-white rounded-xl shadow-sm border border-green-100 p-2">
                <div className="flex flex-wrap items-end gap-2">
                  <span className="text-sm font-semibold text-gray-700 shrink-0">
                    📅 {L("Cultivation Status", "பயிர் நிலை")}
                  </span>

                  <div className="flex items-center gap-1">
                    <label className="text-xs text-gray-500">{L("Start", "தொடக்கம்")}</label>
                    <input
                      type="text"
                      disabled
                      value={formatDMY(cultivation?.start_date)}
                      className="border border-gray-300 rounded px-1.5 py-0.5 text-xs bg-gray-100 text-gray-500 w-24"
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    <label className="text-xs text-gray-500">{L("End", "முடிவு")}</label>
                    <div className="flex flex-col">
                      <input
                        type="date"
                        title={L("Leave empty until cultivation is complete", "முடியும் வரை வெறுமையாக விடவும்")}
                        value={endDateInput}
                        onChange={(e) => {
                          setEndDateInput(e.target.value);
                          if (endDateError) setEndDateError("");
                        }}
                        className={`border rounded px-1.5 py-0.5 text-xs bg-white text-gray-900 w-32 focus:outline-none focus:ring-2 ${
                          endDateError ? "border-red-400 bg-red-50 focus:ring-red-400" : "border-gray-300 focus:ring-green-500"
                        }`}
                      />
                      {endDateError && (
                        <p className="text-red-500 text-xs mt-0.5 flex items-center gap-1">
                          <span>⚠️</span> {endDateError}
                        </p>
                      )}
                    </div>
                  </div>

                  {endDateInput ? (
                    <span className="bg-blue-100 text-blue-700 text-xs font-medium px-1.5 py-0.5 rounded-full">
                      ✓ {L("Done", "முடிந்தது")}
                    </span>
                  ) : (
                    <span className="bg-green-100 text-green-700 text-xs font-medium px-1.5 py-0.5 rounded-full">
                      ● {L("Active", "செயலில்")}
                    </span>
                  )}

                  <button
                    onClick={saveEndDate}
                    disabled={savingEndDate}
                    className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded px-2.5 py-1 text-sm font-medium transition"
                  >
                    {savingEndDate ? "..." : L("Save", "சேமி")}
                  </button>
                  <button
                    onClick={deleteCultivation}
                    disabled={deletingCultivation}
                    className="bg-white hover:bg-danger/10 disabled:opacity-50 text-danger border border-danger/40 rounded px-2.5 py-1 text-sm font-medium transition"
                  >
                    {deletingCultivation ? "..." : `🗑️ ${L("Delete", "நீக்கு")}`}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {L("Adding an end date will mark this crop as Completed", "முடிவு தேதி சேர்த்தால் இந்த பயிர் முடிந்ததாக குறிக்கப்படும்")}
                </p>
              </div>

            <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-3">
              {isCoconut ? (
                <>
                  <h2 className="text-sm font-semibold text-gray-800 mb-2">
                    🌴 {L("Coconut Tree Tracking", "தேங்காய் மர விவரம்")}
                  </h2>

                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="bg-green-50 rounded-xl p-3 border border-white shadow-sm">
                      <p className="text-xs text-gray-700">🌴 {L("Total Trees", "மொத்த மரங்கள்")}</p>
                      <p className="text-xl font-bold text-primary">{totalTreesNum || 0}</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-3 border border-white shadow-sm">
                      <p className="text-xs text-gray-700">🥥 {L("Small Trees", "சிறிய மரங்கள்")}</p>
                      <p className="text-xl font-bold text-amber-700">{smallTreesNum || 0}</p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-3 border border-white shadow-sm">
                      <p className="text-xs text-gray-700">🥥 {L("Large Trees", "பெரிய மரங்கள்")}</p>
                      <p className="text-xl font-bold text-blue-700">{largeTreesNum || 0}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-1">
                    <div>
                      <label className={labelCls}>{L("Total Trees", "மொத்த மரங்கள்")}</label>
                      <input type="number" value={totalTrees} onChange={(e) => setTotalTrees(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Small Trees", "சிறிய மரங்கள்")}</label>
                      <input type="number" value={smallTrees} onChange={(e) => setSmallTrees(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Large Trees", "பெரிய மரங்கள்")}</label>
                      <input type="number" value={largeTrees} onChange={(e) => setLargeTrees(e.target.value)} className={inputCls} />
                    </div>
                  </div>

                  {treesMismatch && (
                    <p className="text-xs text-red-600 font-medium mb-2">
                      {L(
                        "Small Trees + Large Trees must equal Total Trees",
                        "சிறிய மரங்கள் + பெரிய மரங்கள் மொத்த மரங்களுக்கு சமமாக இருக்க வேண்டும்"
                      )}
                    </p>
                  )}

                  <button
                    onClick={saveCoconutTrees}
                    disabled={savingTrees || treesMismatch}
                    className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                  >
                    {savingTrees ? "..." : L("Save", "சேமி")}
                  </button>

                  {renderVarietyQuantityFields(false)}
                </>
              ) : isTurmeric ? (
                <>
                  <h2 className="text-sm font-semibold text-gray-800 mb-2">
                    🟡 {L("Turmeric Cultivation Details", "மஞ்சள் பயிர் விவரங்கள்")}
                  </h2>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                    <div>
                      <label className={labelCls}>{L("Variety", "வகை")}</label>
                      <input type="text" value={turmericVariety} onChange={(e) => setTurmericVariety(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Planting Date", "நடவு தேதி")}</label>
                      <input type="date" value={turmericPlantingDate} onChange={(e) => setTurmericPlantingDate(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Seed Quantity (kg)", "விதை அளவு (கி.கி)")}</label>
                      <input type="number" step="0.01" value={turmericSeedQuantity} onChange={(e) => setTurmericSeedQuantity(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Expected Harvest Date", "எதிர்பார்க்கும் அறுவடை தேதி")}</label>
                      <input type="date" value={turmericExpectedHarvestDate} onChange={(e) => setTurmericExpectedHarvestDate(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Area Under Cultivation", "பயிரிடப்பட்ட பரப்பு")}</label>
                      <input type="text" disabled value={`${cultivation?.area ?? ""} ${L("Acres", "ஏக்கர்")}`} className={`${inputCls} bg-gray-100 text-gray-500`} />
                    </div>
                  </div>

                  <button
                    onClick={saveTurmericDetails}
                    disabled={savingTurmericDetails}
                    className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                  >
                    {savingTurmericDetails ? "..." : L("Save", "சேமி")}
                  </button>
                </>
              ) : isEllu ? (
                <>
                  <h2 className="text-sm font-semibold text-gray-800 mb-2">
                    🌾 {L("Ellu Cultivation Details", "எள்ளு பயிர் விவரங்கள்")}
                  </h2>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                    <div>
                      <label className={labelCls}>{L("Seed Variety Name", "விதை வகை பெயர்")}</label>
                      <input type="text" value={elluVariety} onChange={(e) => setElluVariety(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Sowing Date", "விதைப்பு தேதி")}</label>
                      <input type="date" value={elluSowingDate} onChange={(e) => setElluSowingDate(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Seed Quantity (kg)", "விதை அளவு (கி.கி)")}</label>
                      <input type="number" step="0.01" value={elluSeedQuantity} onChange={(e) => setElluSeedQuantity(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Expected Harvest Date", "எதிர்பார்க்கும் அறுவடை தேதி")}</label>
                      <input type="date" value={elluExpectedHarvestDate} onChange={(e) => setElluExpectedHarvestDate(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Area Under Cultivation", "பயிரிடப்பட்ட பரப்பு")}</label>
                      <input type="text" disabled value={`${cultivation?.area ?? ""} ${L("Acres", "ஏக்கர்")}`} className={`${inputCls} bg-gray-100 text-gray-500`} />
                    </div>
                  </div>

                  <button
                    onClick={saveElluDetails}
                    disabled={savingElluDetails}
                    className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                  >
                    {savingElluDetails ? "..." : L("Save", "சேமி")}
                  </button>
                </>
              ) : isKuchiKilangu ? (
                <>
                  <h2 className="text-sm font-semibold text-gray-800 mb-2">
                    🥔 {L("Kuchi Kilangu Cultivation Details", "கூச்சிக்கிழங்கு பயிர் விவரங்கள்")}
                  </h2>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                    <div>
                      <label className={labelCls}>{L("Stems/Cuttings Planted", "தண்டு/குச்சி எண்ணிக்கை")}</label>
                      <input type="number" value={kuchiStemsPlanted} onChange={(e) => setKuchiStemsPlanted(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Spacing (feet)", "இடைவெளி (அடி)")}</label>
                      <input type="number" step="0.1" value={kuchiSpacingFeet} onChange={(e) => setKuchiSpacingFeet(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Area Under Cultivation", "பயிரிடப்பட்ட பரப்பு")}</label>
                      <input type="text" disabled value={`${cultivation?.area ?? ""} ${L("Acres", "ஏக்கர்")}`} className={`${inputCls} bg-gray-100 text-gray-500`} />
                    </div>
                  </div>

                  <button
                    onClick={saveKuchiDetails}
                    disabled={savingKuchiDetails}
                    className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                  >
                    {savingKuchiDetails ? "..." : L("Save", "சேமி")}
                  </button>

                  {renderVarietyQuantityFields(false)}
                </>
              ) : isSugarcane ? (
                <>
                  <h2 className="text-sm font-semibold text-gray-800 mb-2">
                    🎋 {L("Sugarcane Cultivation Details", "கரும்பு பயிர் விவரங்கள்")}
                  </h2>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                    <div>
                      <label className={labelCls}>{L("Variety Name", "வகை பெயர்")}</label>
                      <input type="text" value={varietyInput} onChange={(e) => setVarietyInput(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Quantity", "அளவு")}</label>
                      <input type="number" step="0.01" value={quantityInput} onChange={(e) => setQuantityInput(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Unit", "அலகு")}</label>
                      <select value={quantityUnitInput} onChange={(e) => setQuantityUnitInput(e.target.value)} className={inputCls}>
                        {QUANTITY_CONFIG.sugarcane.units.map((u) => (
                          <option className="text-gray-900" key={u.value} value={u.value}>{lang === "ta" ? u.ta : u.en}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>{L("Area (Acres)", "பரப்பு (ஏக்கர்)")}</label>
                      <input type="text" disabled value={`${cultivation?.area ?? ""} ${L("Acres", "ஏக்கர்")}`} className={`${inputCls} bg-gray-100 text-gray-500`} />
                    </div>
                  </div>

                  <button
                    onClick={saveDetails}
                    disabled={savingDetails}
                    className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                  >
                    {savingDetails ? "..." : L("Save", "சேமி")}
                  </button>
                </>
              ) : isOnion ? (
                <>
                  <h2 className="text-sm font-semibold text-gray-800 mb-2">
                    🧅 {L("Onion Cultivation Details", "வெங்காய பயிர் விவரங்கள்")}
                  </h2>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                    <div>
                      <label className={labelCls}>{L("Variety Name", "வகை பெயர்")}</label>
                      <input type="text" value={varietyInput} onChange={(e) => setVarietyInput(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Quantity", "அளவு")}</label>
                      <input type="number" step="0.01" value={quantityInput} onChange={(e) => setQuantityInput(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Unit", "அலகு")}</label>
                      <select value={quantityUnitInput} onChange={(e) => setQuantityUnitInput(e.target.value)} className={inputCls}>
                        {QUANTITY_CONFIG.onion.units.map((u) => (
                          <option className="text-gray-900" key={u.value} value={u.value}>{lang === "ta" ? u.ta : u.en}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>{L("Area (Acres)", "பரப்பு (ஏக்கர்)")}</label>
                      <input type="text" disabled value={`${cultivation?.area ?? ""} ${L("Acres", "ஏக்கர்")}`} className={`${inputCls} bg-gray-100 text-gray-500`} />
                    </div>
                  </div>

                  <button
                    onClick={saveDetails}
                    disabled={savingDetails}
                    className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                  >
                    {savingDetails ? "..." : L("Save", "சேமி")}
                  </button>
                </>
              ) : isFodderCorn ? (
                <>
                  <h2 className="text-sm font-semibold text-gray-800 mb-2">
                    🌽 {L("Fodder Corn Cultivation Details", "மக்காச்சோள பயிர் விவரங்கள்")}
                  </h2>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                    <div>
                      <label className={labelCls}>{L("Variety Name", "வகை பெயர்")}</label>
                      <input type="text" value={varietyInput} onChange={(e) => setVarietyInput(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Quantity", "அளவு")}</label>
                      <input type="number" step="0.01" value={quantityInput} onChange={(e) => setQuantityInput(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Unit", "அலகு")}</label>
                      <select value={quantityUnitInput} onChange={(e) => setQuantityUnitInput(e.target.value)} className={inputCls}>
                        {QUANTITY_CONFIG.fodder_corn.units.map((u) => (
                          <option className="text-gray-900" key={u.value} value={u.value}>{lang === "ta" ? u.ta : u.en}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>{L("Area (Acres)", "பரப்பு (ஏக்கர்)")}</label>
                      <input type="text" disabled value={`${cultivation?.area ?? ""} ${L("Acres", "ஏக்கர்")}`} className={`${inputCls} bg-gray-100 text-gray-500`} />
                    </div>
                  </div>

                  <button
                    onClick={saveDetails}
                    disabled={savingDetails}
                    className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                  >
                    {savingDetails ? "..." : L("Save", "சேமி")}
                  </button>
                </>
              ) : isNell ? (
                <>
                  <h2 className="text-sm font-semibold text-gray-800 mb-2">
                    🌾 {L("Nell (Rice) Cultivation Details", "நெல் பயிர் விவரங்கள்")}
                  </h2>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                    <div>
                      <label className={labelCls}>{L("Variety Name", "வகை பெயர்")}</label>
                      <input type="text" value={nellVariety} onChange={(e) => setNellVariety(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Seed Quantity", "விதை அளவு")}</label>
                      <input type="number" step="0.01" value={nellSeedQuantity} onChange={(e) => setNellSeedQuantity(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Unit", "அலகு")}</label>
                      <select value={nellSeedUnit} onChange={(e) => setNellSeedUnit(e.target.value)} className={inputCls}>
                        <option className="text-gray-900" value="kg">{L("kg", "கி.கி")}</option>
                        <option className="text-gray-900" value="bags">{L("Bags", "பைகள்")}</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>{L("Area (Acres)", "பரப்பு (ஏக்கர்)")}</label>
                      <input type="text" disabled value={`${cultivation?.area ?? ""} ${L("Acres", "ஏக்கர்")}`} className={`${inputCls} bg-gray-100 text-gray-500`} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Planting Date", "நடவு தேதி")}</label>
                      <input type="date" value={nellPlantingDate} onChange={(e) => setNellPlantingDate(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Expected Harvest Date", "எதிர்பார்க்கும் அறுவடை தேதி")}</label>
                      <input type="date" value={nellExpectedHarvestDate} onChange={(e) => setNellExpectedHarvestDate(e.target.value)} className={inputCls} />
                    </div>
                  </div>

                  <button
                    onClick={saveNellDetails}
                    disabled={savingNellDetails}
                    className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                  >
                    {savingNellDetails ? "..." : L("Save", "சேமி")}
                  </button>
                </>
              ) : (
                <div className="text-sm text-gray-600">
                  {L("Cultivation", "பயிர் தகவல்")}: {lang === "ta" ? crop.labelTa : crop.labelEn} ·{" "}
                  {cultivation?.area} {L("Acres", "ஏக்கர்")} · {cultivation?.status}
                </div>
              )}
            </div>

            {isNell && (
              <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-3">
                <h2 className="text-sm font-semibold text-gray-800 mb-2">📊 {L("Financial Summary", "நிதி சுருக்கம்")}</h2>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs text-gray-500">{L("Total Income", "மொத்த வருமானம்")}</p>
                    <p className="text-base font-bold text-success">{inr(nellTotalIncome)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{L("Total Expense", "மொத்த செலவு")}</p>
                    <p className="text-base font-bold text-danger">{inr(nellTotalExpenses)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{L("Net P/L", "நிகர லாப/நஷ்டம்")}</p>
                    <p className={`text-base font-bold ${nellNetPL >= 0 ? "text-success" : "text-danger"}`}>{inr(nellNetPL)}</p>
                  </div>
                </div>
              </div>
            )}

            {isGroundnut && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-4">
                <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">
                  🥜 {L("Groundnut Details", "நிலக்கடலை விவரங்கள்")}
                </h2>

                <div className="space-y-3">
                  {/* Variety */}
                  <div>
                    <label className={labelCls}>{L("Variety", "ரகம்")}</label>
                    <input
                      type="text"
                      value={groundnutVariety}
                      onChange={(e) => setGroundnutVariety(e.target.value)}
                      placeholder={L("e.g. TMV 2, CO 2, K 6", "எ.கா. TMV 2, CO 2, K 6")}
                      className={inputCls}
                    />
                  </div>

                  {/* Seed quantity */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>{L("Seed Qty (kg)", "விதை அளவு (கி)")}</label>
                      <input
                        type="number"
                        min="0"
                        value={groundnutSeedQtyKg}
                        onChange={(e) => setGroundnutSeedQtyKg(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "-") e.preventDefault();
                        }}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Seed/Acre (kg)", "விதை/ஏக்கர் (கி)")}</label>
                      <input
                        type="number"
                        min="0"
                        value={groundnutSeedQtyPerAcre}
                        onChange={(e) => setGroundnutSeedQtyPerAcre(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "-") e.preventDefault();
                        }}
                        className={inputCls}
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className={labelCls}>{L("Notes", "குறிப்பு")}</label>
                    <input
                      type="text"
                      value={groundnutDetailsNotes}
                      onChange={(e) => setGroundnutDetailsNotes(e.target.value)}
                      className={inputCls}
                    />
                  </div>

                  {/* Save button */}
                  <button
                    onClick={saveGroundnutDetails}
                    disabled={savingGroundnutDetails}
                    className="w-full bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-xl py-2.5 text-sm font-medium transition"
                  >
                    {savingGroundnutDetails ? "..." : L("Save Details", "சேமி")}
                  </button>
                </div>
              </div>
            )}

            </div>
          )}

          {/* FINANCE TAB */}
          {activeTab === "finance" && (
            <div className="flex flex-col gap-3">

              {isNell && (
                <>
                  <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-3">
                    <h2 className="text-sm font-semibold text-gray-800 mb-2">💸 {L("Total Expenses", "மொத்த செலவு")}</h2>
                    <p className="text-xl font-bold text-danger mb-2">{inr(nellTotalExpenses)}</p>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {riceExpenseTypeBreakdown.filter((c) => c.total > 0).map((c) => (
                        <span key={c.value} className="bg-red-50 text-red-700 text-xs font-medium px-2 py-1 rounded-full border border-red-100">
                          {L(c.en, c.ta)}: {inr(c.total)}
                        </span>
                      ))}
                    </div>
                    <div className="border-t border-gray-100 pt-2 flex justify-between text-base font-bold">
                      <span className={nellNetPL >= 0 ? "text-success" : "text-danger"}>
                        {nellNetPL >= 0 ? `📈 ${L("Net Profit", "நிகர லாபம்")}` : `📉 ${L("Net Loss", "நிகர நஷ்டம்")}`}
                      </span>
                      <span className={nellNetPL >= 0 ? "text-success" : "text-danger"}>{inr(Math.abs(nellNetPL))}</span>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="text-sm font-semibold text-gray-800">🌾 {L("Expenses", "செலவுகள்")}</h2>
                      <button
                        onClick={openAddRiceExpense}
                        className="bg-primary hover:bg-primary/90 text-white rounded-lg px-3 py-1.5 text-sm font-medium transition"
                      >
                        + {L("Add Expense", "செலவு சேர்க்க")}
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-gray-500 uppercase text-xs font-medium tracking-wide border-b">
                            <th className="py-1 px-1">{L("Date", "தேதி")}</th>
                            <th className="py-1 px-1">{L("Type", "வகை")}</th>
                            <th className="py-1 px-1">{L("Amount", "தொகை")}</th>
                            <th className="py-1 px-1">{L("Notes", "குறிப்பு")}</th>
                            <th className="py-1 px-1"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {expenseRecords.length === 0 ? (
                            <tr><td colSpan={5} className="text-center py-4 text-gray-500">🌾 {L("No expense records yet", "செலவு பதிவுகள் இல்லை")}</td></tr>
                          ) : (
                            expenseRecords.map((r) => {
                              const typeOpt = RICE_EXPENSE_TYPES.find((t) => t.value === r.stage);
                              return (
                                <tr key={r.id} className="border-b border-gray-50">
                                  <td className="py-1 px-1 text-gray-900">{formatDMY(r.expense_date)}</td>
                                  <td className="py-1 px-1 text-gray-900">{typeOpt ? L(typeOpt.en, typeOpt.ta) : r.category}</td>
                                  <td className="py-1 px-1 text-danger font-semibold">{inr(Number(r.amount))}</td>
                                  <td className="py-1 px-1 text-gray-600">{r.notes || "—"}</td>
                                  <td className="py-1 px-1 whitespace-nowrap">
                                    <button onClick={() => openEditRiceExpense(r)} className="mr-2 hover:text-primary">✏️</button>
                                    <button onClick={() => deleteExpenseRecord(r.id)} className="hover:text-danger">🗑️</button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {!isNell && !isGroundnut && (
              <>
              {/* Income */}
              <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-3">
                <h2 className="text-sm font-semibold text-gray-800 mb-2">💰 {L("Income", "வருமானம்")}</h2>

                {isCoconut ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                      <div>
                        <label className={labelCls}>{L("Harvest Date", "அறுவடை தேதி")}</label>
                        <input type="date" value={harvestDate} onChange={(e) => setHarvestDate(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Small Coconuts", "சிறிய தேங்காய்")}</label>
                        <input type="number" placeholder={L("Count", "எண்ணிக்கை")} value={smallCount} onChange={(e) => setSmallCount(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Small Price/pc (₹)", "சிறிய விலை/து (₹)")}</label>
                        <input type="number" placeholder="₹" value={smallPrice} onChange={(e) => setSmallPrice(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Large Coconuts", "பெரிய தேங்காய்")}</label>
                        <input type="number" placeholder={L("Count", "எண்ணிக்கை")} value={largeCount} onChange={(e) => setLargeCount(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Large Price/pc (₹)", "பெரிய விலை/து (₹)")}</label>
                        <input type="number" placeholder="₹" value={largePrice} onChange={(e) => setLargePrice(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Buyer Name", "வாங்குபவர் பெயர்")}</label>
                        <input type="text" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Buyer Contact", "வாங்குபவர் தொடர்பு")}</label>
                        <input
                          type="text"
                          placeholder={L("Phone number (optional)", "தொலைபேசி எண் (விருப்பம்)")}
                          value={buyerContact}
                          onChange={(e) => setBuyerContact(e.target.value)}
                          className={inputCls}
                        />
                      </div>
                    </div>

                    {totalCoconutCount > 0 && (
                      <div className="bg-gray-50 rounded-lg p-2 mb-2 text-xs font-mono text-gray-700 space-y-0.5">
                        <p>Small: {smallCountNum} nos × ₹{smallPriceNum} = ₹{smallRevenue.toFixed(2)}</p>
                        <p>Large: {largeCountNum} nos × ₹{largePriceNum} = ₹{largeRevenue.toFixed(2)}</p>
                        <p>{L("Dealer deduction", "டீலர் தள்ளுபடி")}: -{deductionCount} nos (≈ ₹{deductionValue.toFixed(2)})</p>
                        <div className="border-t border-gray-300 my-1" />
                        <p className="text-base font-bold text-primary">{L("Net Income", "நிகர வருமானம்")}: ₹{netRevenue.toFixed(2)}</p>
                      </div>
                    )}

                    <button
                      onClick={saveCoconutIncome}
                      disabled={savingIncome}
                      className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                    >
                      {savingIncome ? "..." : L("Save Income", "வருமானம் சேமி")}
                    </button>
                  </>
                ) : isTurmeric ? (
                  <>
                    {turmericSales.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="bg-amber-50 rounded-xl p-2 border border-white shadow-sm">
                          <p className="text-xs text-gray-700">🟡 {L("Bulb Turmeric", "கிழங்கு மஞ்சள்")}</p>
                          <p className="text-base font-bold text-amber-700">{turmericBulbQty.toFixed(2)} kg — {inr(turmericBulbTotal)}</p>
                        </div>
                        <div className="bg-amber-50 rounded-xl p-2 border border-white shadow-sm">
                          <p className="text-xs text-gray-700">🟡 {L("Finger Turmeric", "விரல் மஞ்சள்")}</p>
                          <p className="text-base font-bold text-amber-700">{turmericFingerQty.toFixed(2)} kg — {inr(turmericFingerTotal)}</p>
                        </div>
                        <div className="bg-green-50 rounded-xl p-2 border border-white shadow-sm">
                          <p className="text-xs text-gray-700">📊 {L("Grand Total Income", "மொத்த வருமானம்")}</p>
                          <p className="text-base font-bold text-primary">{inr(turmericSalesGrandTotal)}</p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                      <div className="bg-amber-50 rounded-xl p-2">
                        <p className="text-sm font-semibold text-gray-700 mb-1.5">🟡 {L("Bulb Turmeric", "கிழங்கு மஞ்சள்")}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className={labelCls}>{L("Quantity", "அளவு")}</label>
                            <input type="number" value={turmericBulbQtySold} onChange={(e) => setTurmericBulbQtySold(e.target.value)} className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls}>{L("Unit", "அளவீடு")}</label>
                            <select value={turmericBulbSaleUnit} onChange={(e) => setTurmericBulbSaleUnit(e.target.value)} className={inputCls}>
                              {["kg", "quintal", "tonne"].map((u) => (
                                <option className="text-gray-900" key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-2">
                            <label className={labelCls}>{L("Price per unit (₹)", "யூனிட் விலை (₹)")}</label>
                            <input type="number" value={turmericBulbPricePerUnit} onChange={(e) => setTurmericBulbPricePerUnit(e.target.value)} className={inputCls} />
                          </div>
                        </div>
                        <p className="text-xs font-mono text-gray-700 mt-1.5">{L("Total", "மொத்தம்")}: {inr(turmericBulbSaleTotal)}</p>
                      </div>

                      <div className="bg-amber-50 rounded-xl p-2">
                        <p className="text-sm font-semibold text-gray-700 mb-1.5">🟡 {L("Finger Turmeric", "விரல் மஞ்சள்")}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className={labelCls}>{L("Quantity", "அளவு")}</label>
                            <input type="number" value={turmericFingerQtySold} onChange={(e) => setTurmericFingerQtySold(e.target.value)} className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls}>{L("Unit", "அளவீடு")}</label>
                            <select value={turmericFingerSaleUnit} onChange={(e) => setTurmericFingerSaleUnit(e.target.value)} className={inputCls}>
                              {["kg", "quintal", "tonne"].map((u) => (
                                <option className="text-gray-900" key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-2">
                            <label className={labelCls}>{L("Price per unit (₹)", "யூனிட் விலை (₹)")}</label>
                            <input type="number" value={turmericFingerPricePerUnit} onChange={(e) => setTurmericFingerPricePerUnit(e.target.value)} className={inputCls} />
                          </div>
                        </div>
                        <p className="text-xs font-mono text-gray-700 mt-1.5">{L("Total", "மொத்தம்")}: {inr(turmericFingerSaleTotal)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                      <div>
                        <label className={labelCls}>{L("Sale Date", "விற்பனை தேதி")}</label>
                        <input type="date" value={turmericSaleDate} onChange={(e) => setTurmericSaleDate(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Market Name", "சந்தை பெயர்")}</label>
                        <input
                          type="text"
                          placeholder={L("e.g. Erode Market, Perundurai Market", "எ.கா. ஈரோடு சந்தை")}
                          value={turmericMarketName}
                          onChange={(e) => setTurmericMarketName(e.target.value)}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Buyer Name", "வாங்குபவர் பெயர்")}</label>
                        <input type="text" value={turmericSaleBuyer} onChange={(e) => setTurmericSaleBuyer(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Remarks", "குறிப்புகள்")}</label>
                        <input type="text" value={turmericSaleNotes} onChange={(e) => setTurmericSaleNotes(e.target.value)} className={inputCls} />
                      </div>
                    </div>

                    <p className="text-base font-bold text-primary mb-2">
                      {L("Grand Total", "மொத்தம்")}: {inr(turmericGrandSaleTotal)}
                    </p>

                    <button
                      onClick={saveTurmericIncome}
                      disabled={savingTurmericSale}
                      className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                    >
                      {savingTurmericSale ? "..." : L("Save Sale", "விற்பனை சேமி")}
                    </button>
                  </>
                ) : isSugarcane ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                      <div>
                        <label className={labelCls}>{L("Sale Date", "விற்பனை தேதி")}</label>
                        <input type="date" value={sugarcaneSaleDate} onChange={(e) => setSugarcaneSaleDate(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Buyer Name (Mill/Company)", "வாங்குபவர் (ஆலை/நிறுவனம்)")}</label>
                        <input type="text" value={sugarcaneBuyerName} onChange={(e) => setSugarcaneBuyerName(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Quantity (Tons)", "அளவு (டன்)")}</label>
                        <input type="number" value={sugarcaneQuantityTons} onChange={(e) => setSugarcaneQuantityTons(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Rate per Ton (₹)", "டன் விலை (₹)")}</label>
                        <input type="number" value={sugarcaneRatePerTon} onChange={(e) => setSugarcaneRatePerTon(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Notes", "குறிப்பு")}</label>
                        <input type="text" value={sugarcaneNotes} onChange={(e) => setSugarcaneNotes(e.target.value)} className={inputCls} />
                      </div>
                    </div>
                    {sugarcaneQuantityTonsNum > 0 && (
                      <p className="text-xs font-mono text-gray-700 mb-2">
                        {sugarcaneQuantityTonsNum} tons × ₹{sugarcaneRatePerTonNum} = {L("Total Amount", "மொத்த தொகை")}: {inr(sugarcaneSaleTotal)}
                      </p>
                    )}
                    <button
                      onClick={saveSugarcaneIncome}
                      disabled={savingSugarcaneIncome}
                      className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                    >
                      {savingSugarcaneIncome ? "..." : L("Save Income", "வருமானம் சேமி")}
                    </button>
                  </>
                ) : isEllu ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                      <div>
                        <label className={labelCls}>{L("Sale Date", "விற்பனை தேதி")}</label>
                        <input type="date" value={elluSaleDate} onChange={(e) => setElluSaleDate(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Quantity Sold (kg)", "விற்ற அளவு (கி.கி)")}</label>
                        <input type="number" value={elluQuantitySold} onChange={(e) => setElluQuantitySold(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Price per kg (₹)", "விலை/கி.கி (₹)")}</label>
                        <input type="number" value={elluPricePerKg} onChange={(e) => setElluPricePerKg(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Buyer Name", "வாங்குபவர் பெயர்")}</label>
                        <input type="text" value={elluBuyerName} onChange={(e) => setElluBuyerName(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Notes", "குறிப்பு")}</label>
                        <input type="text" value={elluSaleNotes} onChange={(e) => setElluSaleNotes(e.target.value)} className={inputCls} />
                      </div>
                    </div>
                    {elluQuantitySoldNum > 0 && (
                      <p className="text-xs font-mono text-gray-700 mb-2">
                        {elluQuantitySoldNum}kg × ₹{elluPricePerKgNum} = {L("Total Amount", "மொத்த தொகை")}: {inr(elluSaleTotal)}
                      </p>
                    )}
                    <button
                      onClick={saveElluIncome}
                      disabled={savingElluIncome}
                      className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                    >
                      {savingElluIncome ? "..." : L("Save Income", "வருமானம் சேமி")}
                    </button>
                  </>
                ) : isKuchiKilangu ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                      <div>
                        <label className={labelCls}>{L("Sale Date", "விற்பனை தேதி")}</label>
                        <input type="date" value={kuchiSaleDate} onChange={(e) => setKuchiSaleDate(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Quantity Sold", "விற்ற அளவு")}</label>
                        <input type="number" value={kuchiQtySold} onChange={(e) => setKuchiQtySold(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Unit", "அளவீடு")}</label>
                        <select value={kuchiUnit} onChange={(e) => setKuchiUnit(e.target.value)} className={inputCls}>
                          {["kg", "tonne", "bags"].map((u) => (
                            <option className="text-gray-900" key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>{L(ratePerUnitLabel(kuchiUnit).en, ratePerUnitLabel(kuchiUnit).ta)}</label>
                        <input type="number" value={kuchiRatePerKg} onChange={(e) => setKuchiRatePerKg(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Buyer Type", "வாங்குபவர் வகை")}</label>
                        <select value={kuchiBuyerType} onChange={(e) => setKuchiBuyerType(e.target.value)} className={inputCls}>
                          {KUCHI_BUYER_TYPES.map((b) => (
                            <option className="text-gray-900" key={b.value} value={b.value}>
                              {lang === "ta" ? b.ta : b.en}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>{L("Buyer Name", "வாங்குபவர் பெயர்")}</label>
                        <input type="text" value={kuchiBuyerName} onChange={(e) => setKuchiBuyerName(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Notes", "குறிப்பு")}</label>
                        <input type="text" value={kuchiSaleNotes} onChange={(e) => setKuchiSaleNotes(e.target.value)} className={inputCls} />
                      </div>
                    </div>
                    {kuchiQtySoldNum > 0 && (
                      <p className="text-xs font-mono text-gray-700 mb-2">
                        {kuchiQtySoldNum} {kuchiUnit} × ₹{kuchiRatePerKgNum} = {L("Total Amount", "மொத்த தொகை")}: {inr(kuchiSaleTotal)}
                      </p>
                    )}
                    <button
                      onClick={saveKuchiIncome}
                      disabled={savingKuchiSale}
                      className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                    >
                      {savingKuchiSale ? "..." : L("Save Income", "வருமானம் சேமி")}
                    </button>
                  </>
                ) : isOnion ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div className="bg-green-50 rounded-lg p-2">
                        <p className="text-xs text-gray-600">{L("Total Income", "மொத்த வருமானம்")}</p>
                        <p className="text-base font-bold text-success">{inr(totalOnionSalesIncome)}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2">
                        <p className="text-xs text-gray-600">{L("Total Quantity Sold", "மொத்த விற்ற அளவு")}</p>
                        <p className="text-base font-bold text-gray-900">
                          {Object.keys(onionQtyByUnit).length === 0
                            ? "—"
                            : Object.entries(onionQtyByUnit).map(([u, q]) => `${q} ${u}`).join(" · ")}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={openAddOnionIncome}
                      className="bg-primary hover:bg-primary/90 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                    >
                      + {L("Add Income", "வருமானம் சேர்க்க")}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                      <div>
                        <label className={labelCls}>{L("Date", "தேதி")}</label>
                        <input
                          type="date"
                          max={new Date().toISOString().split("T")[0]}
                          value={incomeDate}
                          onChange={(e) => setIncomeDate(e.target.value)}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Amount (₹)", "தொகை (₹)")}</label>
                        <input
                          type="number"
                          min="0"
                          onKeyDown={(e) => { if (e.key === "-") e.preventDefault(); }}
                          value={incomeAmount}
                          onChange={(e) => setIncomeAmount(e.target.value)}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Buyer Name", "வாங்குபவர் பெயர்")}</label>
                        <input type="text" value={incomeBuyer} onChange={(e) => setIncomeBuyer(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Notes", "குறிப்பு")}</label>
                        <input type="text" value={incomeNotes} onChange={(e) => setIncomeNotes(e.target.value)} className={inputCls} />
                      </div>
                    </div>
                    <button
                      onClick={saveIncome}
                      disabled={savingIncome}
                      className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                    >
                      {savingIncome ? "..." : L("Save Income", "வருமானம் சேமி")}
                    </button>
                  </>
                )}

                {isTurmeric ? (
                  turmericSaleGroups.length > 0 && (
                    <div className="mt-3 overflow-x-auto max-h-48 overflow-y-auto">
                      <table className="w-full text-xs text-gray-700">
                        <thead>
                          <tr className="text-left text-gray-500 border-b border-gray-200">
                            <th className="py-1 pr-2 font-medium">{L("Date", "தேதி")}</th>
                            <th className="py-1 pr-2 font-medium">{L("Market", "சந்தை")}</th>
                            <th className="py-1 pr-2 font-medium">{L("Bulb", "கிழங்கு")}</th>
                            <th className="py-1 pr-2 font-medium">{L("Finger", "விரல்")}</th>
                            <th className="py-1 pr-2 font-medium">{L("Total", "மொத்தம்")}</th>
                            <th className="py-1"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {turmericSaleGroups.map((g) => (
                            <tr key={g.key} className="border-b border-gray-50">
                              <td className="py-1 pr-2">{formatDMY(g.date)}</td>
                              <td className="py-1 pr-2">{g.market || "—"}</td>
                              <td className="py-1 pr-2">
                                {g.bulb ? `${g.bulb.quantity}${g.bulb.unit} @ ₹${g.bulb.price_per_unit} = ${inr(Number(g.bulb.amount))}` : "—"}
                              </td>
                              <td className="py-1 pr-2">
                                {g.finger ? `${g.finger.quantity}${g.finger.unit} @ ₹${g.finger.price_per_unit} = ${inr(Number(g.finger.amount))}` : "—"}
                              </td>
                              <td className="py-1 pr-2 font-semibold text-primary">
                                {inr(Number(g.bulb?.amount ?? 0) + Number(g.finger?.amount ?? 0))}
                              </td>
                              <td className="py-1">
                                <button onClick={() => deleteTurmericSaleGroup(g)} className="hover:text-danger">🗑️</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : isOnion ? (
                  <div className="mt-3 overflow-x-auto max-h-56 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-500 uppercase text-xs font-medium tracking-wide border-b sticky top-0 bg-white">
                          <th className="py-1 px-1">{L("Date", "தேதி")}</th>
                          <th className="py-1 px-1">{L("Qty", "அளவு")}</th>
                          <th className="py-1 px-1">{L("Unit", "அலகு")}</th>
                          <th className="py-1 px-1">{L("Rate", "விலை")}</th>
                          <th className="py-1 px-1">{L("Total", "மொத்தம்")}</th>
                          <th className="py-1 px-1">{L("Buyer", "வாங்குபவர்")}</th>
                          <th className="py-1 px-1">{L("Contact", "தொடர்பு")}</th>
                          <th className="py-1 px-1">{L("Notes", "குறிப்பு")}</th>
                          <th className="py-1 px-1"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {onionIncomeRecords.length === 0 ? (
                          <tr><td colSpan={9} className="text-center py-4 text-gray-500">🧅 {L("No income records yet", "வருமான பதிவுகள் இல்லை")}</td></tr>
                        ) : (
                          onionIncomeRecords.map((r) => {
                            const unitOpt = ONION_INCOME_UNITS.find((u) => u.value === r.unit);
                            return (
                              <tr key={r.id} className="border-b border-gray-50">
                                <td className="py-1 px-1 text-gray-900">{formatDMY(r.income_date)}</td>
                                <td className="py-1 px-1 text-gray-900">{r.quantity}</td>
                                <td className="py-1 px-1 text-gray-900">{unitOpt ? L(unitOpt.en, unitOpt.ta) : r.unit}</td>
                                <td className="py-1 px-1 text-gray-900">{inr(Number(r.price_per_unit))}</td>
                                <td className="py-1 px-1 font-semibold text-success">{inr(Number(r.amount))}</td>
                                <td className="py-1 px-1 text-gray-600">{r.buyer_name || "—"}</td>
                                <td className="py-1 px-1 text-gray-600">{r.buyer_contact || "—"}</td>
                                <td className="py-1 px-1 text-gray-600">{r.notes || "—"}</td>
                                <td className="py-1 px-1 whitespace-nowrap">
                                  <button onClick={() => openEditOnionIncome(r)} className="mr-2 hover:text-primary">✏️</button>
                                  <button onClick={() => deleteOnionIncome(r.id)} className="hover:text-danger">🗑️</button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  incomeRecords.length > 0 && (
                    <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
                      {incomeRecords.map((r) => {
                        const isExpanded = expandedIncomeIds.has(r.id);
                        const details = incomeDetailRows(r);
                        return (
                          <div key={r.id} className="border-b border-gray-100 py-1">
                            <div
                              className="flex justify-between items-center text-xs text-gray-700 cursor-pointer"
                              onClick={() => toggleIncomeExpand(r.id)}
                            >
                              <span className="flex items-center gap-1">
                                <span className="text-gray-400 shrink-0">{isExpanded ? "▲" : "▼"}</span>
                                {r.income_date} {r.buyer_name ? `· ${r.buyer_name}` : ""}
                              </span>
                              <span className="flex items-center gap-1.5">
                                <span className="font-semibold text-primary">{inr(Number(r.amount))}</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteIncomeRecord(r.id);
                                  }}
                                  className="hover:text-danger"
                                >
                                  🗑️
                                </button>
                              </span>
                            </div>
                            {isExpanded && details.length > 0 && (
                              <div className="bg-gray-50 rounded-lg p-2 mt-1 grid grid-cols-2 gap-1 text-xs text-gray-600">
                                {details.map((d, i) => (
                                  <div key={i} className="flex justify-between gap-2">
                                    <span className="text-gray-500">{d.label}:</span>
                                    <span className="font-medium text-gray-800">{d.value}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </div>

              {/* Expenses */}
              <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-3">
                <h2 className="text-sm font-semibold text-gray-800 mb-2">
                  💸 {isTurmeric ? L("Expense Breakdown by Stage", "செலவு பகுப்பு") : L("Expenses", "செலவுகள்")}
                </h2>

                {isTurmeric && (
                  <div className="text-xs text-gray-700 space-y-1">
                    {turmericExpenseBreakdown.map((row) => (
                      <div key={row.key} className="flex justify-between">
                        <span>{lang === "ta" ? row.titleTa : row.titleEn}</span>
                        <span className="font-medium">{inr(row.total)}</span>
                      </div>
                    ))}
                    <div className="border-t border-gray-200 my-1" />
                    <div className="flex justify-between text-sm font-bold text-gray-800">
                      <span>{L("Total Expenses", "மொத்த செலவு")}</span>
                      <span>{inr(totalExpenses)}</span>
                    </div>
                  </div>
                )}

                {!isTurmeric && isCoconut && (
                  <div className="bg-amber-50 rounded-lg p-2 mb-3">
                    <p className="text-sm font-semibold text-gray-700 mb-1.5">🥥 {L("Coconut Harvesting Labour", "தேங்காய் அறுவடை கூலி")}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-1">
                      <div>
                        <label className={labelCls}>{L("Date", "தேதி")}</label>
                        <input type="date" value={labourDate} onChange={(e) => setLabourDate(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Trees Harvested", "அறுவடை மரங்கள்")}</label>
                        <input type="number" value={treesHarvested} onChange={(e) => setTreesHarvested(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Price/Tree (₹)", "மர விலை (₹)")}</label>
                        <input type="number" placeholder="₹40" value={pricePerTree} onChange={(e) => setPricePerTree(e.target.value)} className={inputCls} />
                        <p className="text-xs text-gray-500 mt-0.5">{L("Current rate: ₹40/tree (update if changed)", "தற்போதைய விலை: ₹40/மரம்")}</p>
                      </div>
                    </div>
                    {treesHarvestedNum > 0 && pricePerTreeNum > 0 && (
                      <p className="text-xs font-mono text-gray-700 mb-1">
                        {treesHarvestedNum} trees × ₹{pricePerTreeNum} = ₹{labourTotal.toFixed(2)}
                      </p>
                    )}
                    <button
                      onClick={saveCoconutLabour}
                      disabled={savingLabour}
                      className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                    >
                      {savingLabour ? "..." : L("Save Labour Expense", "கூலி செலவு சேமி")}
                    </button>
                  </div>
                )}

                {!isTurmeric && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-2">
                      <div>
                        <label className={labelCls}>{L("Date", "தேதி")}</label>
                        <input
                          type="date"
                          max={new Date().toISOString().split("T")[0]}
                          value={expenseDate}
                          onChange={(e) => setExpenseDate(e.target.value)}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Category", "வகை")}</label>
                        <select value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)} className={inputCls}>
                          {(isEllu ? ELLU_EXPENSE_CATEGORIES : EXPENSE_CATEGORIES).map((c) => (
                            <option className="text-gray-900" key={c.value} value={c.value}>
                              {lang === "ta" ? c.ta : c.en}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>{L("Description", "விவரம்")}</label>
                        <input type="text" value={expenseDescription} onChange={(e) => setExpenseDescription(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{L("Vendor Name", "விற்பனையாளர் பெயர்")}</label>
                        <input type="text" value={expenseVendorName} onChange={(e) => setExpenseVendorName(e.target.value)} className={inputCls} />
                      </div>
                      {isSugarcaneLabour ? (
                        <>
                          <div>
                            <label className={labelCls}>{L("Rate per Ton (₹)", "டன் விலை (₹)")}</label>
                            <input type="number" value={sugarcaneLabourRatePerTon} onChange={(e) => setSugarcaneLabourRatePerTon(e.target.value)} className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls}>{L("Total Tons", "மொத்த டன்")}</label>
                            <input type="number" value={sugarcaneLabourTotalTons} onChange={(e) => setSugarcaneLabourTotalTons(e.target.value)} className={inputCls} />
                          </div>
                        </>
                      ) : (
                        <div>
                          <label className={labelCls}>{L("Amount (₹)", "தொகை (₹)")}</label>
                          <input
                            type="number"
                            min="0"
                            onKeyDown={(e) => { if (e.key === "-") e.preventDefault(); }}
                            value={expenseAmount}
                            onChange={(e) => setExpenseAmount(e.target.value)}
                            className={inputCls}
                          />
                        </div>
                      )}
                    </div>
                    {isSugarcaneLabour && (
                      <p className="text-xs font-mono text-gray-700 mb-2">
                        {L("Total Labour Cost", "மொத்த கூலி செலவு")}: {inr(sugarcaneLabourTotal)}
                      </p>
                    )}
                    <button
                      onClick={saveExpense}
                      disabled={savingExpense}
                      className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                    >
                      {savingExpense ? "..." : L("Save Expense", "செலவு சேமி")}
                    </button>

                    {expenseRecords.length > 0 && (
                      <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
                        {expenseRecords.map((r) => (
                          <div key={r.id} className="flex justify-between items-center text-xs text-gray-700 border-b border-gray-100 py-1">
                            <span className="truncate">{r.expense_date} · {r.category} {r.vendor_name ? `· ${r.vendor_name}` : ""} {r.description ? `· ${r.description}` : ""}</span>
                            <span className="flex items-center gap-1.5 shrink-0">
                              <span className="font-semibold text-red-600">{inr(Number(r.amount))}</span>
                              <button onClick={() => deleteExpenseRecord(r.id)} className="hover:text-danger">🗑️</button>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Harvest */}
              {showHarvestSection && (
                <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-3">
                  <h2 className="text-sm font-semibold text-gray-800 mb-2">🌾 {L("Harvest", "அறுவடை")}</h2>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                    <div>
                      <label className={labelCls}>{L("Harvest Date", "அறுவடை தேதி")}</label>
                      <input type="date" value={harvestRecordDate} onChange={(e) => setHarvestRecordDate(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Yield Quantity", "அளவு")}</label>
                      <input type="number" value={yieldQuantity} onChange={(e) => setYieldQuantity(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Unit", "அளவீடு")}</label>
                      <select value={yieldUnit} onChange={(e) => setYieldUnit(e.target.value)} className={inputCls}>
                        {YIELD_UNITS.map((u) => (
                          <option className="text-gray-900" key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>{L("Notes", "குறிப்பு")}</label>
                      <input type="text" value={harvestNotes} onChange={(e) => setHarvestNotes(e.target.value)} className={inputCls} />
                    </div>
                  </div>
                  <button
                    onClick={saveHarvest}
                    disabled={savingHarvest}
                    className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                  >
                    {savingHarvest ? "..." : L("Save Harvest", "அறுவடை சேமி")}
                  </button>

                  {harvestRecords.length > 0 && (
                    <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
                      {harvestRecords.map((r) => (
                        <div key={r.id} className="flex justify-between items-center text-xs text-gray-700 border-b border-gray-100 py-1">
                          <span className="truncate">{r.harvest_date} {r.notes ? `· ${r.notes}` : ""}</span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            <span className="font-semibold text-gray-800">{r.yield_quantity} {r.yield_unit}</span>
                            <button onClick={() => deleteHarvestRecord(r.id)} className="hover:text-danger">🗑️</button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Storage & Maintenance Cost (Onion) */}
              {isOnion && (
                <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-semibold text-gray-800">🧅 {L("Storage & Maintenance Cost", "சேமிப்பு & பராமரிப்பு செலவு")}</h2>
                    <button
                      onClick={openAddOnionStorageExpense}
                      className="bg-primary hover:bg-primary/90 text-white rounded-lg px-3 py-1.5 text-sm font-medium transition"
                    >
                      + {L("Add Expense", "செலவு சேர்க்க")}
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-500 uppercase text-xs font-medium tracking-wide border-b">
                          <th className="py-1 px-1">{L("Date", "தேதி")}</th>
                          <th className="py-1 px-1">{L("Type", "வகை")}</th>
                          <th className="py-1 px-1">{L("Amount", "தொகை")}</th>
                          <th className="py-1 px-1">{L("Notes", "குறிப்பு")}</th>
                          <th className="py-1 px-1"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {onionStorageRecords.length === 0 ? (
                          <tr><td colSpan={5} className="text-center py-4 text-gray-500">🧅 {L("No storage records yet", "சேமிப்பு பதிவுகள் இல்லை")}</td></tr>
                        ) : (
                          onionStorageRecords.map((r) => {
                            const typeOpt = ONION_STORAGE_EXPENSE_TYPES.find((t) => t.value === r.description);
                            return (
                              <tr key={r.id} className="border-b border-gray-50">
                                <td className="py-1 px-1 text-gray-900">{formatDMY(r.expense_date)}</td>
                                <td className="py-1 px-1 text-gray-900">{typeOpt ? L(typeOpt.en, typeOpt.ta) : r.category}</td>
                                <td className="py-1 px-1 text-danger font-semibold">{inr(Number(r.amount))}</td>
                                <td className="py-1 px-1 text-gray-600">{r.notes || "—"}</td>
                                <td className="py-1 px-1 whitespace-nowrap">
                                  <button onClick={() => openEditOnionStorageExpense(r)} className="mr-2 hover:text-primary">✏️</button>
                                  <button onClick={() => deleteOnionStorageExpense(r.id)} className="hover:text-danger">🗑️</button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-700 font-semibold mt-2 pt-2 border-t border-gray-100">
                    {L("Total Storage Expense", "மொத்த சேமிப்பு செலவு")}: <span className="text-danger">{inr(totalStorageCost)}</span>
                  </p>
                </div>
              )}

              {/* Summary */}
              <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-2">
                {isTurmeric && turmericSales.length > 0 && (
                  <>
                    <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                      <span>🟡 {L("Bulb Turmeric Sales", "கிழங்கு மஞ்சள் விற்பனை")}</span>
                      <span>{inr(turmericBulbTotal)} ({turmericBulbQty.toFixed(2)} kg)</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                      <span>🟡 {L("Finger Turmeric Sales", "விரல் மஞ்சள் விற்பனை")}</span>
                      <span>{inr(turmericFingerTotal)} ({turmericFingerQty.toFixed(2)} kg)</span>
                    </div>
                    <div className="border-t border-gray-100 my-1" />
                  </>
                )}
                <div className="flex justify-between text-xs text-gray-700 font-medium mb-0.5">
                  <span>💰 {L("Total Income", "மொத்த வருமானம்")}</span>
                  <span>{inr(totalIncome)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-700 font-medium mb-0.5">
                  <span>💸 {L("Total Expenses", "மொத்த செலவு")}</span>
                  <span>{inr(totalExpenses)}</span>
                </div>
                <div className="border-t border-gray-200 my-1" />
                <div className={`flex justify-between text-base font-bold ${netProfit >= 0 ? "text-success" : "text-danger"}`}>
                  <span>{netProfit >= 0 ? `📈 ${L("Net Profit", "நிகர லாபம்")}` : `📉 ${L("Net Loss", "நிகர நஷ்டம்")}`}</span>
                  <span>{inr(Math.abs(netProfit))}</span>
                </div>
              </div>
              </>
              )}

              {isGroundnut && (
                <div className="space-y-4">
                  {/* ── EXPENSES ── */}
                  <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-4">
                    <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">💰 {L("Add Expense", "செலவு சேர்")}</h2>

                    <div className="space-y-3">
                      {/* Expense type */}
                      <div>
                        <label className={labelCls}>{L("Expense Type", "செலவு வகை")}</label>
                        <select value={groundnutExpenseType} onChange={(e) => setGroundnutExpenseType(e.target.value)} className={inputCls}>
                          {GROUNDNUT_EXPENSE_TYPES.map((t) => (
                            <option className="text-gray-900" key={t.value} value={t.value}>
                              {L(t.en, t.ta)}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Date */}
                      <div>
                        <label className={labelCls}>{L("Date", "தேதி")}</label>
                        <input
                          type="date"
                          max={new Date().toISOString().split("T")[0]}
                          value={groundnutExpenseDate}
                          onChange={(e) => setGroundnutExpenseDate(e.target.value)}
                          className={inputCls}
                        />
                      </div>

                      {/* Seed Purchase fields */}
                      {groundnutExpenseType === "seed_purchase" && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={labelCls}>{L("Quantity (kg)", "அளவு (கி)")}</label>
                            <input
                              type="number"
                              min="0"
                              value={groundnutExpenseQty}
                              onChange={(e) => setGroundnutExpenseQty(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "-") e.preventDefault();
                              }}
                              className={inputCls}
                            />
                          </div>
                          <div>
                            <label className={labelCls}>{L("Rate/kg (₹)", "விலை/கி (₹)")}</label>
                            <input
                              type="number"
                              min="0"
                              value={groundnutExpenseRate}
                              onChange={(e) => setGroundnutExpenseRate(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "-") e.preventDefault();
                              }}
                              className={inputCls}
                            />
                          </div>
                        </div>
                      )}

                      {/* Dry Leaf Rolling fields */}
                      {groundnutExpenseType === "dry_leaf_rolling" && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={labelCls}>{L("No. of Rolls", "சுருள் எண்")}</label>
                            <input
                              type="number"
                              min="0"
                              value={groundnutExpenseRolls}
                              onChange={(e) => setGroundnutExpenseRolls(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "-") e.preventDefault();
                              }}
                              className={inputCls}
                            />
                          </div>
                          <div>
                            <label className={labelCls}>{L("Rate/Roll (₹)", "விலை/சுருள் (₹)")}</label>
                            <input
                              type="number"
                              min="0"
                              value={groundnutExpenseRatePerRoll}
                              onChange={(e) => setGroundnutExpenseRatePerRoll(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "-") e.preventDefault();
                              }}
                              className={inputCls}
                            />
                          </div>
                        </div>
                      )}

                      {/* Auto total for seed/rolls */}
                      {(groundnutExpenseType === "seed_purchase" || groundnutExpenseType === "dry_leaf_rolling") && (
                        <div>
                          <label className={labelCls}>{L("Total Amount (₹)", "மொத்த தொகை (₹)")}</label>
                          <input
                            type="number"
                            readOnly
                            value={
                              groundnutExpenseType === "seed_purchase"
                                ? ((Number(groundnutExpenseQty) || 0) * (Number(groundnutExpenseRate) || 0)).toFixed(2)
                                : ((Number(groundnutExpenseRolls) || 0) * (Number(groundnutExpenseRatePerRoll) || 0)).toFixed(2)
                            }
                            className={`${inputCls} bg-gray-50 dark:bg-slate-700/50`}
                          />
                        </div>
                      )}

                      {/* Amount for other types */}
                      {groundnutExpenseType !== "seed_purchase" && groundnutExpenseType !== "dry_leaf_rolling" && (
                        <div>
                          <label className={labelCls}>{L("Amount (₹)", "தொகை (₹)")}</label>
                          <input
                            type="number"
                            min="0"
                            value={groundnutExpenseAmount}
                            onChange={(e) => setGroundnutExpenseAmount(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "-") e.preventDefault();
                            }}
                            className={inputCls}
                          />
                        </div>
                      )}

                      {/* Notes */}
                      <div>
                        <label className={labelCls}>{L("Notes (optional)", "குறிப்பு (விருப்பம்)")}</label>
                        <input type="text" value={groundnutExpenseNotes} onChange={(e) => setGroundnutExpenseNotes(e.target.value)} className={inputCls} />
                      </div>

                      {/* Save button */}
                      <button
                        onClick={saveGroundnutExpense}
                        disabled={savingGroundnutExpense}
                        className="w-full bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-xl py-2.5 text-sm font-medium transition"
                      >
                        {savingGroundnutExpense ? "..." : L("Add Expense", "செலவு சேர்")}
                      </button>
                    </div>
                  </div>

                  {/* ── EXPENSE RECORDS ── */}
                  {groundnutExpenses.length > 0 && (
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-4">
                      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">📋 {L("Expense Records", "செலவு பதிவுகள்")}</h2>

                      <div className="space-y-2">
                        {groundnutExpenses.map((exp) => {
                          const expType = GROUNDNUT_EXPENSE_TYPES.find((t) => t.value === exp.expense_type);
                          return (
                            <div key={exp.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-slate-700 last:border-0">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                                  {L(expType?.en || exp.expense_type, expType?.ta || exp.expense_type)}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {exp.expense_date}
                                  {exp.number_of_rolls ? ` · ${exp.number_of_rolls} ${L("rolls", "சுருள்")}` : ""}
                                  {exp.quantity ? ` · ${exp.quantity}kg` : ""}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 ml-2">
                                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                                  ₹{Number(exp.amount).toLocaleString("en-IN")}
                                </p>
                                <button
                                  onClick={() => deleteGroundnutExpense(exp.id)}
                                  className="text-red-400 hover:text-red-600 transition-colors p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 min-h-[36px] min-w-[36px] flex items-center justify-center"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {/* Total */}
                        <div className="flex justify-between pt-2 mt-1 border-t border-gray-200 dark:border-slate-600">
                          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{L("Total", "மொத்தம்")}</p>
                          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                            ₹{groundnutExpenses.reduce((sum, e) => sum + Number(e.amount), 0).toLocaleString("en-IN")}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── INCOME ── */}
                  <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-4">
                    <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">💵 {L("Add Harvest Income", "அறுவடை வருமானம் சேர்")}</h2>

                    <div className="space-y-3">
                      {/* Harvest date */}
                      <div>
                        <label className={labelCls}>{L("Harvest Date", "அறுவடை தேதி")}</label>
                        <input
                          type="date"
                          max={new Date().toISOString().split("T")[0]}
                          value={groundnutHarvestDate}
                          onChange={(e) => setGroundnutHarvestDate(e.target.value)}
                          className={inputCls}
                        />
                      </div>

                      {/* Quantity with unit toggle */}
                      <div>
                        <label className={labelCls}>{L("Quantity", "அளவு")}</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min="0"
                            value={groundnutQuantity}
                            onChange={(e) => setGroundnutQuantity(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "-") e.preventDefault();
                            }}
                            placeholder="0"
                            className={`${inputCls} flex-1`}
                          />
                          {/* Unit toggle */}
                          <div className="flex gap-1 bg-gray-100 dark:bg-slate-700 rounded-xl p-1 flex-shrink-0">
                            <button
                              onClick={() => setGroundnutQuantityUnit("kg")}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                groundnutQuantityUnit === "kg"
                                  ? "bg-white dark:bg-slate-600 text-green-700 dark:text-green-400 shadow-sm"
                                  : "text-gray-500 dark:text-gray-400"
                              }`}
                            >
                              kg
                            </button>
                            <button
                              onClick={() => setGroundnutQuantityUnit("ton")}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                groundnutQuantityUnit === "ton"
                                  ? "bg-white dark:bg-slate-600 text-green-700 dark:text-green-400 shadow-sm"
                                  : "text-gray-500 dark:text-gray-400"
                              }`}
                            >
                              ton
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Rate */}
                      <div>
                        <label className={labelCls}>
                          {L(`Rate per ${groundnutQuantityUnit} (₹)`, `விலை/${groundnutQuantityUnit === "kg" ? "கி" : "டன்"} (₹)`)}
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={groundnutRate}
                          onChange={(e) => {
                            setGroundnutRate(e.target.value);
                            if (!groundnutTotalManual) {
                              setGroundnutTotalAmount(String((Number(groundnutQuantity) || 0) * (Number(e.target.value) || 0)));
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "-") e.preventDefault();
                          }}
                          className={inputCls}
                        />
                      </div>

                      {/* Total amount */}
                      <div>
                        <label className={labelCls}>{L("Total Amount (₹)", "மொத்த தொகை (₹)")}</label>
                        <input
                          type="number"
                          min="0"
                          value={
                            groundnutTotalManual
                              ? groundnutTotalAmount
                              : ((Number(groundnutQuantity) || 0) * (Number(groundnutRate) || 0)).toFixed(2)
                          }
                          onChange={(e) => {
                            setGroundnutTotalManual(true);
                            setGroundnutTotalAmount(e.target.value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "-") e.preventDefault();
                          }}
                          className={inputCls}
                        />
                      </div>

                      {/* Market details */}
                      <div>
                        <label className={labelCls}>{L("Market / Selling Place", "சந்தை / விற்பனை இடம்")}</label>
                        <input
                          type="text"
                          value={groundnutMarket}
                          onChange={(e) => setGroundnutMarket(e.target.value)}
                          placeholder={L("e.g. Erode Market", "எ.கா. ஈரோடு சந்தை")}
                          className={inputCls}
                        />
                      </div>

                      {/* Buyer name */}
                      <div>
                        <label className={labelCls}>{L("Buyer Name", "வாங்கியவர் பெயர்")}</label>
                        <input type="text" value={groundnutBuyer} onChange={(e) => setGroundnutBuyer(e.target.value)} className={inputCls} />
                      </div>

                      {/* Buyer contact */}
                      <div>
                        <label className={labelCls}>{L("Buyer Contact", "வாங்கியவர் தொலைபேசி")}</label>
                        <input
                          type="tel"
                          value={groundnutBuyerContact}
                          onChange={(e) => setGroundnutBuyerContact(e.target.value)}
                          placeholder="9XXXXXXXXX"
                          className={inputCls}
                        />
                      </div>

                      {/* Notes */}
                      <div>
                        <label className={labelCls}>{L("Notes (optional)", "குறிப்பு (விருப்பம்)")}</label>
                        <input type="text" value={groundnutIncomeNotes} onChange={(e) => setGroundnutIncomeNotes(e.target.value)} className={inputCls} />
                      </div>

                      {/* Save button */}
                      <button
                        onClick={saveGroundnutIncome}
                        disabled={savingGroundnutIncome}
                        className="w-full bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-xl py-2.5 text-sm font-medium transition"
                      >
                        {savingGroundnutIncome ? "..." : L("Save Income", "வருமானம் சேமி")}
                      </button>
                    </div>
                  </div>

                  {/* ── INCOME RECORDS ── */}
                  {groundnutIncomes.length > 0 && (
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-4">
                      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">📋 {L("Harvest Records", "அறுவடை பதிவுகள்")}</h2>

                      <div className="space-y-2">
                        {groundnutIncomes.map((inc) => (
                          <div key={inc.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-slate-700 last:border-0">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{inc.harvest_date}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {inc.quantity_kg ? `${inc.quantity_kg}kg` : `${inc.quantity_ton}ton`}
                                {" · "}
                                ₹{inc.rate_per_unit}/{inc.quantity_unit}
                                {inc.buyer_name ? ` · ${inc.buyer_name}` : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 ml-2">
                              <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                                ₹{Number(inc.total_amount).toLocaleString("en-IN")}
                              </p>
                              <button
                                onClick={() => deleteGroundnutIncome(inc.id)}
                                className="text-red-400 hover:text-red-600 transition-colors p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 min-h-[36px] min-w-[36px] flex items-center justify-center"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        ))}

                        {/* Total */}
                        <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-slate-600">
                          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{L("Total Income", "மொத்த வருமானம்")}</p>
                          <p className="text-sm font-bold text-green-700 dark:text-green-400">
                            ₹{groundnutIncomes.reduce((sum, i) => sum + Number(i.total_amount), 0).toLocaleString("en-IN")}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ACTIVITIES TAB */}
          {activeTab === "activities" && (
            <div className="flex flex-col gap-3">

              {isNell && (
                <>
                  <CropRecordSection
                    lang={lang}
                    table="rice_pesticide"
                    titleEn="Pesticide & Spray"
                    titleTa="பூச்சிக்கொல்லி"
                    icon="🧪"
                    dateField="date"
                    cultivationId={id}
                    fields={[
                      { key: "date", en: "Date", ta: "தேதி", type: "date", required: true },
                      { key: "pesticide_name", en: "Pesticide Name", ta: "பூச்சிக்கொல்லி பெயர்", type: "text", required: true },
                      { key: "pesticide_type", en: "Pesticide Type", ta: "பூச்சிக்கொல்லி வகை", type: "text" },
                      { key: "quantity", en: "Quantity", ta: "அளவு", type: "number", mustBePositive: true },
                      { key: "unit", en: "Unit", ta: "அலகு", type: "text" },
                      { key: "amount", en: "Amount (₹)", ta: "தொகை (₹)", type: "number", isCost: true },
                    ]}
                  />
                </>
              )}

              {isTurmeric && (
                <>
                  <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-3">
                    <h2 className="text-sm font-semibold text-gray-800 mb-2">
                      🟢 {L("Common Activities", "பொதுவான செயல்பாடுகள்")}
                    </h2>
                    {TURMERIC_SUBSECTIONS.filter((s) => COMMON_ACTIVITY_KEYS.includes(s.key)).map(renderSubsection)}
                  </div>

                  <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-3">
                    <h2 className="text-sm font-semibold text-gray-800 mb-2">
                      🟡 {L("Turmeric Specific Activities", "மஞ்சள் சிறப்பு செயல்பாடுகள்")}
                    </h2>
                    {TURMERIC_SUBSECTIONS.filter((s) => TURMERIC_ACTIVITY_KEYS.includes(s.key)).map(renderSubsection)}
                  </div>
                </>
              )}

              {isEllu && (
                <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-3">
                  <h2 className="text-sm font-semibold text-gray-800 mb-2">
                    🌾 {L("Post-Harvest Activities", "அறுவடைக்கு பின் செயல்பாடுகள்")}
                  </h2>
                  {ELLU_SUBSECTIONS.map(renderSubsection)}
                </div>
              )}

              {isFodderCorn && (
                <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-3">
                  <h2 className="text-sm font-semibold text-gray-800 mb-2">
                    🌽 {L("Cutting Records", "வெட்டு பதிவுகள்")} · {L("Cut", "வெட்டு")} #{nextCutNumber}
                  </h2>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                    <div>
                      <label className={labelCls}>{L("Cutting Date", "வெட்டும் தேதி")}</label>
                      <input type="date" value={cuttingDate} onChange={(e) => setCuttingDate(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Quantity Cut", "வெட்டிய அளவு")}</label>
                      <input type="number" value={cuttingQty} onChange={(e) => setCuttingQty(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Unit", "அளவீடு")}</label>
                      <select value={cuttingUnit} onChange={(e) => setCuttingUnit(e.target.value)} className={inputCls}>
                        {["kg", "bundles"].map((u) => (
                          <option className="text-gray-900" key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>{L("Sold To", "விற்றது")}</label>
                      <input type="text" value={cuttingSoldTo} onChange={(e) => setCuttingSoldTo(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Rate per unit (₹)", "யூனிட் விலை (₹)")}</label>
                      <input type="number" value={cuttingRate} onChange={(e) => setCuttingRate(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{L("Notes", "குறிப்பு")}</label>
                      <input type="text" value={cuttingNotes} onChange={(e) => setCuttingNotes(e.target.value)} className={inputCls} />
                    </div>
                  </div>

                  {cuttingQtyNum > 0 && (
                    <p className="text-xs font-mono text-gray-700 mb-2">
                      {L("Amount Received", "பெறப்பட்ட தொகை")}: {cuttingQtyNum}{cuttingUnit} × ₹{cuttingRateNum} = {inr(cuttingAmount)}
                    </p>
                  )}

                  <button
                    onClick={saveCutting}
                    disabled={savingCutting}
                    className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                  >
                    {savingCutting ? "..." : L("Save Cutting", "வெட்டு சேமி")}
                  </button>

                  {fodderCuttings.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 overflow-x-auto">
                      {fodderCuttings.map(({ harvest, income }, idx) => (
                        <div key={harvest.id} className="flex items-center gap-2">
                          <div className="bg-green-50 rounded-xl p-2 border border-white shadow-sm min-w-[140px]">
                            <p className="text-sm font-semibold text-primary">{L("Cut", "வெட்டு")} #{harvest.cutting_number}</p>
                            <p className="text-xs text-gray-600 mt-0.5">{harvest.harvest_date}</p>
                            <p className="text-xs text-gray-600">{harvest.yield_quantity}{harvest.yield_unit}{income ? ` @ ₹${income.price_per_unit}` : ""}</p>
                            {income && <p className="text-xs font-semibold text-primary">{inr(Number(income.amount))}</p>}
                            {income?.buyer_name && <p className="text-xs text-gray-500">{income.buyer_name}</p>}
                          </div>
                          {idx < fodderCuttings.length - 1 && <span className="text-gray-400">→</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!isTurmeric && (
                <>
              {/* Fertilizer */}
              <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-3">
                <h2 className="text-sm font-semibold text-gray-800 mb-2">🌱 {L("Fertilizer", "உரம்")}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-8 gap-2 mb-2">
                  <div>
                    <label className={labelCls}>{L("Date", "தேதி")}</label>
                    <input type="date" value={fertDate} onChange={(e) => setFertDate(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{L("Fertilizer Name", "உரம் பெயர்")}</label>
                    <input type="text" value={fertName} onChange={(e) => setFertName(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{L("Qty", "அளவு")}</label>
                    <input type="number" value={fertQty} onChange={(e) => setFertQty(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{L("Unit", "அளவீடு")}</label>
                    <select value={fertUnit} onChange={(e) => setFertUnit(e.target.value)} className={inputCls}>
                      {["kg", "litre", "bags"].map((u) => (
                        <option className="text-gray-900" key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>{L("Month", "மாதம்")}</label>
                    <input type="number" min="1" value={fertMonth} onChange={(e) => setFertMonth(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{L("Stage", "வளர்ச்சி நிலை")}</label>
                    <input type="text" placeholder={L("e.g. flowering", "எ.கா. பூக்கும்")} value={fertStage} onChange={(e) => setFertStage(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{L("Cost (₹)", "செலவு (₹)")}</label>
                    <input type="number" value={fertCost} onChange={(e) => setFertCost(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{L("Notes", "குறிப்பு")}</label>
                    <input type="text" value={fertNotes} onChange={(e) => setFertNotes(e.target.value)} className={inputCls} />
                  </div>
                </div>
                <button
                  onClick={saveFertilizer}
                  disabled={savingFert}
                  className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                >
                  {savingFert ? "..." : L("Add", "சேர்")}
                </button>

                {fertilizerRecords.length > 0 && (
                  <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
                    {fertilizerRecords.map((r) => (
                      <div key={r.id} className="flex justify-between items-center text-xs text-gray-700 border-b border-gray-100 py-1">
                        <span className="truncate">
                          {r.application_date} · {r.fertilizer_name} · {r.quantity}{r.unit} · M{r.crop_month} · {r.growth_stage}
                        </span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          <span className="font-semibold text-gray-800">{inr(Number(r.cost))}</span>
                          <button onClick={() => deleteFertilizerRecord(r.id)} className="hover:text-danger">🗑️</button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Weed Removal */}
              <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-3">
                <h2 className="text-sm font-semibold text-gray-800 mb-2">🌿 {L("Weed Removal", "புல் அகற்றுதல்")}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-2">
                  <div>
                    <label className={labelCls}>{L("Start Date", "தொடக்க தேதி")}</label>
                    <input type="date" value={weedStart} onChange={(e) => setWeedStart(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{L("End Date", "முடிவு தேதி")}</label>
                    <input type="date" value={weedEnd} onChange={(e) => setWeedEnd(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{L("Workers/Day", "தொழிலாளர்/நாள்")}</label>
                    <input type="number" value={weedWorkers} onChange={(e) => setWeedWorkers(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{L("Cost/Day (₹)", "செலவு/நாள் (₹)")}</label>
                    <input type="number" value={weedCostPerDay} onChange={(e) => setWeedCostPerDay(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{L("Notes", "குறிப்பு")}</label>
                    <input type="text" value={weedNotes} onChange={(e) => setWeedNotes(e.target.value)} className={inputCls} />
                  </div>
                </div>

                {weedDays > 0 && (
                  <p className="text-xs font-mono text-gray-700 mb-2">
                    {L("Total days", "மொத்த நாட்கள்")}: {weedDays} · {weedDays} {L("days", "நாட்கள்")} × {weedWorkersNum} {L("workers", "தொழிலாளர்")} × ₹{weedCostPerDayNum} = ₹{weedTotalCost.toFixed(2)}
                  </p>
                )}

                <button
                  onClick={saveWeedRemoval}
                  disabled={savingWeed}
                  className="bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition shadow-sm"
                >
                  {savingWeed ? "..." : L("Add", "சேர்")}
                </button>

                {weedRecords.length > 0 && (
                  <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
                    {weedRecords.map((r) => (
                      <div key={r.id} className="flex justify-between items-center text-xs text-gray-700 border-b border-gray-100 py-1">
                        <span className="truncate">{r.start_date} → {r.end_date} · {r.total_days}d · {r.workers_per_day}w × ₹{r.cost_per_day}</span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          <span className="font-semibold text-gray-800">{inr(Number(r.total_cost))}</span>
                          <button onClick={() => deleteWeedRecord(r.id)} className="hover:text-danger">🗑️</button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

                </>
              )}

            </div>
          )}

          {/* INCOME TAB */}
          {activeTab === "income" && isNell && (
            <div className="flex flex-col gap-3">

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white rounded-xl shadow-sm p-3">
                  <p className="text-xs text-gray-500">{L("Total Income", "மொத்த வருமானம்")}</p>
                  <p className="text-base font-bold text-success">{inr(nellTotalIncome)}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-3">
                  <p className="text-xs text-gray-500">{L("Total Quantity Sold", "மொத்த விற்ற அளவு")}</p>
                  <p className="text-base font-bold text-gray-900">
                    {Object.keys(nellQtyByUnit).length === 0
                      ? "—"
                      : Object.entries(nellQtyByUnit).map(([u, q]) => `${q} ${u}`).join(" · ")}
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-3">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-gray-800">💰 {L("Income", "வருமானம்")}</h2>
                  <button onClick={openAddNellIncome} className="bg-primary hover:bg-primary/90 text-white rounded-lg px-3 py-1.5 text-sm font-medium transition">
                    + {L("Add Income", "வருமானம் சேர்க்க")}
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-500 uppercase text-xs font-medium tracking-wide border-b">
                        <th className="py-1 px-1">{L("Date", "தேதி")}</th>
                        <th className="py-1 px-1">{L("Market", "சந்தை")}</th>
                        <th className="py-1 px-1">{L("Qty", "அளவு")}</th>
                        <th className="py-1 px-1">{L("Unit", "அலகு")}</th>
                        <th className="py-1 px-1">{L("Rate", "விலை")}</th>
                        <th className="py-1 px-1">{L("Total", "மொத்தம்")}</th>
                        <th className="py-1 px-1">{L("Notes", "குறிப்பு")}</th>
                        <th className="py-1 px-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {nellIncomeRecords.length === 0 ? (
                        <tr><td colSpan={8} className="text-center py-6 text-gray-500">🌾 {L("No rice records found", "நெல் பதிவுகள் இல்லை")}</td></tr>
                      ) : (
                        nellIncomeRecords.map((r) => {
                          const unitOpt = NELL_INCOME_UNITS.find((u) => u.value === r.unit);
                          return (
                            <tr key={r.id} className="border-b border-gray-50">
                              <td className="py-1 px-1 text-gray-900">{formatDMY(r.date)}</td>
                              <td className="py-1 px-1 text-gray-600">{r.market_name || "—"}</td>
                              <td className="py-1 px-1 text-gray-900">{r.quantity_sold}</td>
                              <td className="py-1 px-1 text-gray-900">{unitOpt ? L(unitOpt.en, unitOpt.ta) : r.unit}</td>
                              <td className="py-1 px-1 text-gray-900">{inr(Number(r.rate_per_unit))}</td>
                              <td className="py-1 px-1 font-semibold text-success">{inr(Number(r.total_amount))}</td>
                              <td className="py-1 px-1 text-gray-600">{r.notes || "—"}</td>
                              <td className="py-1 px-1 whitespace-nowrap">
                                <button onClick={() => openEditNellIncome(r)} className="mr-2 hover:text-primary">✏️</button>
                                <button onClick={() => deleteNellIncome(r.id)} className="hover:text-danger">🗑️</button>
                              </td>
                            </tr>
                          );
                        })
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
      </main>

      {nellIncomeModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-0">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-primary">
                {nellEditingIncomeId ? L("Edit Income", "வருமானத்தைத் திருத்து") : L("Add Income", "வருமானம் சேர்க்க")}
              </h2>
              <button onClick={() => setNellIncomeModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{L("Date", "தேதி")} *</label>
                <input type="date" value={nellIncomeDate} onChange={(e) => setNellIncomeDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{L("Market Name", "சந்தை பெயர்")}</label>
                <input type="text" value={nellIncomeMarket} onChange={(e) => setNellIncomeMarket(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{L("Quantity Sold", "விற்ற அளவு")} *</label>
                  <input type="number" value={nellIncomeQty} onChange={(e) => setNellIncomeQty(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{L("Unit", "அலகு")} *</label>
                  <select value={nellIncomeUnit} onChange={(e) => setNellIncomeUnit(e.target.value)} className={inputCls}>
                    {NELL_INCOME_UNITS.map((u) => (
                      <option key={u.value} value={u.value}>{L(u.en, u.ta)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>{L("Rate per Unit (₹)", "ஒரு அலகுக்கான விலை (₹)")} *</label>
                <input type="number" value={nellIncomeRate} onChange={(e) => setNellIncomeRate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{L("Total Amount (₹)", "மொத்த தொகை (₹)")}</label>
                <input
                  type="number"
                  value={nellIncomeTotalManual ? nellIncomeTotal : nellIncomeComputedTotal.toFixed(2)}
                  onChange={(e) => {
                    setNellIncomeTotalManual(true);
                    setNellIncomeTotal(e.target.value);
                  }}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{L("Notes", "குறிப்பு")}</label>
                <textarea value={nellIncomeNotes} onChange={(e) => setNellIncomeNotes(e.target.value)} className={inputCls} rows={2} />
              </div>
              <div className="flex gap-2">
                <button onClick={saveNellIncome} disabled={savingNellIncome} className="flex-1 bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg py-2 text-sm font-medium transition">
                  {savingNellIncome ? "..." : L("Save", "சேமி")}
                </button>
                <button onClick={() => setNellIncomeModalOpen(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg py-2 text-sm font-medium transition">
                  {L("Cancel", "ரத்து")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {onionIncomeModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-0">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-primary">
                {onionEditingIncomeId ? L("Edit Income", "வருமானத்தைத் திருத்து") : L("Add Income", "வருமானம் சேர்க்க")}
              </h2>
              <button onClick={() => setOnionIncomeModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{L("Sale Date", "விற்பனை தேதி")} *</label>
                <input type="date" value={onionSaleDate} onChange={(e) => setOnionSaleDate(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{L("Quantity Sold", "விற்ற அளவு")} *</label>
                  <input type="number" value={onionQtySold} onChange={(e) => setOnionQtySold(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{L("Unit", "அலகு")} *</label>
                  <select value={onionUnit} onChange={(e) => setOnionUnit(e.target.value)} className={inputCls}>
                    {ONION_INCOME_UNITS.map((u) => (
                      <option key={u.value} value={u.value}>{L(u.en, u.ta)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>{L(ratePerUnitLabel(onionUnit).en, ratePerUnitLabel(onionUnit).ta)} *</label>
                <input type="number" value={onionRate} onChange={(e) => setOnionRate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{L("Total Amount (₹)", "மொத்த தொகை (₹)")}</label>
                <input
                  type="number"
                  value={onionTotalManual ? onionTotal : onionComputedTotal.toFixed(2)}
                  onChange={(e) => {
                    setOnionTotalManual(true);
                    setOnionTotal(e.target.value);
                  }}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{L("Buyer Name", "வாங்குபவர் பெயர்")}</label>
                <input type="text" value={onionBuyerName} onChange={(e) => setOnionBuyerName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{L("Buyer Contact Number", "வாங்குபவர் தொடர்பு எண்")}</label>
                <input type="text" value={onionContact} onChange={(e) => setOnionContact(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{L("Notes", "குறிப்பு")}</label>
                <textarea value={onionSaleNotes} onChange={(e) => setOnionSaleNotes(e.target.value)} className={inputCls} rows={2} />
              </div>
              <div className="flex gap-2">
                <button onClick={saveOnionSale} disabled={savingOnionSale} className="flex-1 bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg py-2 text-sm font-medium transition">
                  {savingOnionSale ? "..." : L("Save", "சேமி")}
                </button>
                <button onClick={() => setOnionIncomeModalOpen(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg py-2 text-sm font-medium transition">
                  {L("Cancel", "ரத்து")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {onionStorageModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-0">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-primary">
                {onionStorageEditingId ? L("Edit Expense", "செலவைத் திருத்து") : L("Add Expense", "செலவு சேர்க்க")}
              </h2>
              <button onClick={() => setOnionStorageModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{L("Date", "தேதி")} *</label>
                <input type="date" value={onionStorageDate} onChange={(e) => setOnionStorageDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{L("Expense Type", "செலவு வகை")}</label>
                <select value={onionStorageType} onChange={(e) => setOnionStorageType(e.target.value)} className={inputCls}>
                  {ONION_STORAGE_EXPENSE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{L(t.en, t.ta)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{L("Amount (₹)", "தொகை (₹)")} *</label>
                <input type="number" value={onionStorageAmount} onChange={(e) => setOnionStorageAmount(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{L("Notes", "குறிப்பு")}</label>
                <textarea value={onionStorageNotes} onChange={(e) => setOnionStorageNotes(e.target.value)} className={inputCls} rows={2} />
              </div>
              <div className="flex gap-2">
                <button onClick={saveOnionStorageExpense} disabled={savingOnionStorageExpense} className="flex-1 bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg py-2 text-sm font-medium transition">
                  {savingOnionStorageExpense ? "..." : L("Save", "சேமி")}
                </button>
                <button onClick={() => setOnionStorageModalOpen(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg py-2 text-sm font-medium transition">
                  {L("Cancel", "ரத்து")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {riceExpenseModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-0">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-primary">
                {riceExpenseEditingId ? L("Edit Expense", "செலவைத் திருத்து") : L("Add Expense", "செலவு சேர்க்க")}
              </h2>
              <button onClick={() => setRiceExpenseModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{L("Expense Type", "செலவு வகை")}</label>
                <select value={riceExpenseType} onChange={(e) => setRiceExpenseType(e.target.value)} className={inputCls}>
                  {RICE_EXPENSE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{L(t.en, t.ta)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{L("Date", "தேதி")} *</label>
                <input type="date" value={riceExpenseDate} onChange={(e) => setRiceExpenseDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{L("Amount (₹)", "தொகை (₹)")} *</label>
                <input type="number" value={riceExpenseAmount} onChange={(e) => setRiceExpenseAmount(e.target.value)} className={inputCls} />
              </div>

              {riceExpenseType === "seed_expense" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className={labelCls}>{L("Variety Name", "வகை பெயர்")}</label>
                    <input type="text" value={riceExpenseVariety} onChange={(e) => setRiceExpenseVariety(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{L("Seed Quantity", "விதை அளவு")}</label>
                    <input type="number" value={riceExpenseSeedQty} onChange={(e) => setRiceExpenseSeedQty(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{L("Unit", "அலகு")}</label>
                    <select value={riceExpenseSeedUnit} onChange={(e) => setRiceExpenseSeedUnit(e.target.value)} className={inputCls}>
                      <option value="kg">{L("kg", "கி.கி")}</option>
                      <option value="bags">{L("Bags", "பைகள்")}</option>
                    </select>
                  </div>
                </div>
              )}

              {riceExpenseType === "transplantation" && (
                <div>
                  <label className={labelCls}>{L("Number of Laborers", "தொழிலாளர் எண்ணிக்கை")}</label>
                  <input type="number" value={riceExpenseLaborers} onChange={(e) => setRiceExpenseLaborers(e.target.value)} className={inputCls} />
                </div>
              )}

              {riceExpenseType === "harvesting" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>{L("Machinery Owner Name", "இயந்திர உரிமையாளர் பெயர்")}</label>
                    <input type="text" value={riceExpenseOwnerName} onChange={(e) => setRiceExpenseOwnerName(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{L("Contact Number", "தொடர்பு எண்")}</label>
                    <input
                      type="text"
                      value={riceExpenseContact}
                      onChange={(e) => {
                        setRiceExpenseContact(e.target.value);
                        if (riceExpenseContactError) setRiceExpenseContactError("");
                      }}
                      className={`${inputCls} ${riceExpenseContactError ? "border-red-400 bg-red-50 focus:ring-red-400" : ""}`}
                    />
                    {riceExpenseContactError && (
                      <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                        <span>⚠️</span> {riceExpenseContactError}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className={labelCls}>{L("Notes", "குறிப்பு")}</label>
                <textarea value={riceExpenseNotes} onChange={(e) => setRiceExpenseNotes(e.target.value)} className={inputCls} rows={2} />
              </div>
              <div className="flex gap-2">
                <button onClick={saveRiceExpense} disabled={savingRiceExpense} className="flex-1 bg-primary hover:bg-primary/90 disabled:bg-primary/40 text-white rounded-lg py-2 text-sm font-medium transition">
                  {savingRiceExpense ? "..." : L("Save", "சேமி")}
                </button>
                <button onClick={() => setRiceExpenseModalOpen(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg py-2 text-sm font-medium transition">
                  {L("Cancel", "ரத்து")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <DeleteConfirmDialog isOpen={deleteOpen} onConfirm={handleDeleteConfirm} onCancel={handleDeleteCancel} language={lang} />
    </div>
  );
}
