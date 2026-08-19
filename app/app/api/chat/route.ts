import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRateLimiter, getClientIp } from "../../../lib/rateLimit";

const rateLimit = createRateLimiter(20, 60 * 1000); // 20 requests per minute per IP

if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is not set!");
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.error("NEXT_PUBLIC_SUPABASE_URL is not set!");
}

export async function POST(req: NextRequest) {
  if (!rateLimit(getClientIp(req))) {
    return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
  }

  const { message, language, accessToken } = await req.json();

  const sanitizedMessage = message?.toString()?.slice(0, 1000)?.trim();

  if (!sanitizedMessage) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  // Authenticate the server-side client with the caller's session token so
  // RLS policies (scoped to the `authenticated` role) actually return rows —
  // a client built with only the anon key and no forwarded session would see
  // nothing on every table.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    accessToken
      ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
      : undefined
  );

  const [
    { data: farms },
    { data: cultivations },
    { data: incomeRecords },
    { data: expenseRecords },
    { data: cows },
    { data: milkCollections },
    { data: milkPayments },
    { data: tractorUsage },
    { data: tractorDiesel },
    { data: coconutDetails },
    { data: turmericDetails },
    { data: kuchiKilanguDetails },
    { data: elluDetails },
    { data: nellDetails },
    { data: goatIncome },
    { data: goatExpenses },
    { data: henIncome },
    { data: henExpenses },
    { data: cowExpenses },
    { data: milkRates },
    { data: tractorEngineOil },
    { data: tractorSettings },
    { data: rotavatorBlades },
    { data: kalappaiBlades },
    { data: goats },
    { data: hens },
    { data: fertilizerApplications },
    { data: weedRemovals },
    { data: harvestRecords },
    { data: irrigationRecords },
    { data: motorSharing },
    { data: motorSharingPartners },
  ] = await Promise.all([
    supabase.from("farms").select("*"),
    supabase.from("cultivations").select("*").order("created_at", { ascending: false }).limit(300),
    supabase.from("income_records").select("*").order("income_date", { ascending: false }).limit(300),
    supabase.from("expense_records").select("*").order("expense_date", { ascending: false }).limit(300),
    supabase.from("cows").select("*"),
    supabase.from("milk_collections").select("*").order("collection_date", { ascending: false }).limit(300),
    supabase.from("milk_payments").select("*").order("payment_date", { ascending: false }).limit(300),
    supabase.from("tractor_usage").select("*").order("date", { ascending: false }).limit(300),
    supabase.from("tractor_diesel").select("*").order("date", { ascending: false }).limit(300),
    supabase.from("coconut_details").select("*"),
    supabase.from("turmeric_details").select("*"),
    supabase.from("kuchi_kilangu_details").select("*"),
    supabase.from("ellu_details").select("*"),
    supabase.from("nell_details").select("*"),
    supabase.from("goat_income").select("*").limit(300),
    supabase.from("goat_expenses").select("*").limit(300),
    supabase.from("hen_income").select("*").limit(300),
    supabase.from("hen_expenses").select("*").limit(300),
    supabase.from("cow_expenses").select("*").limit(300),
    supabase.from("milk_rates").select("*"),
    supabase.from("tractor_engine_oil").select("*").limit(300),
    supabase.from("tractor_settings").select("*"),
    supabase.from("rotavator_blades").select("*").limit(300),
    supabase.from("kalappai_blades").select("*").limit(300),
    supabase.from("goats").select("*"),
    supabase.from("hens").select("*"),
    supabase.from("fertilizer_applications").select("*").order("application_date", { ascending: false }).limit(500),
    supabase.from("weed_removals").select("*").order("start_date", { ascending: false }).limit(500),
    supabase.from("harvest_records").select("*").order("harvest_date", { ascending: false }).limit(500),
    supabase.from("irrigation_records").select("*").order("irrigation_date", { ascending: false }).limit(500),
    supabase.from("motor_sharing").select("*").eq("is_shared", true).limit(10),
    supabase.from("motor_sharing_neighbors").select("*"),
  ]);

  // Sugarcane, onion, and fodder corn have no dedicated *_details table — their
  // variety/quantity info lives directly on each cultivation row, so derive a
  // sugarcane-specific slice from cultivations rather than querying a table
  // that doesn't exist.
  const sugarcaneDetails = cultivations?.filter((c) => c.crop_type === "sugarcane");

  const farmContext = `
You are a smart farm assistant for Marutham Farm
Management System. This is a Tamil Nadu family farm.

FARM CONTEXT:
- Location: Karukkampalayam, Sivagiri, Erode, Tamil Nadu
- Crops, livestock, tractor/machinery, and finances are tracked below in FARM DATA
- The farm's motor (water pump) is shared on a rotating turn basis with a neighbor — see MOTOR TURN RULES below
- Milk is paid for by the dairy every Wednesday

You have access to COMPLETE historical farm data
spanning multiple years. Use ALL this data for:
1. Answering factual questions accurately
2. Identifying patterns and trends
3. Making predictions and recommendations
4. Reconstructing complete cultivation processes

CRITICAL RULES:
1. Answer ONLY what was asked
2. Keep answers to 1-3 lines MAXIMUM (except where PREDICTION/PROCESS
   RULES below explicitly call for a longer structured answer)
3. Never add unrequested details or background explanation
4. Never explain unless asked
5. Use numbers and facts only
6. Never suggest follow-up actions or extra info unless the user asked
7. Never end with "would you like to know more?" or similar prompts

RESPONSE STYLE:
- Simple question → ONE line answer
- Data question → Just the number/fact, bold the number/amount (e.g. **₹4,500**)
- Multiple facts in one answer → short bullet points, max 3-4 bullets, each one line
- Complex question (predictions, full process history) → Brief structured explanation, still no filler

EXAMPLES:
Q: "What was last month's milk income?"
A: "**₹4,500**"
NOT: "Last month your milk income was ₹4,500. This includes cow milk
     worth ₹3,000 and buffalo milk worth ₹1,500. Compared to..."

Q: "What is the survey number of Farm 1?"
A: "**123/4A**"
NOT: "Farm 1's survey number is 123/4A. This farm is located in... and
     has an area of... and currently grows..."

Q: "How many cows do I have?"
A: "**3** active cows"
NOT: "You currently have 3 active cows out of a total of 5. The other
     2 are either sold or deceased..."

Q: "Total expenses this year?"
A: "**₹42,000** total
- Fertilizer: ₹18,000
- Diesel: ₹12,000
- Labour: ₹12,000"

Q: "What should I do today?"
A: 2-3 short actionable bullets only, based on today's day of week, whose
   motor turn it is today (MOTOR TURN RULES below), the current season/
   active crops, and Wednesday milk-payment day if today is Wednesday.
   Example: "- 🚰 Motor turn: yours today
- 🌾 Turmeric: due for weeding this week
- 💰 Milk payment day (Wednesday)"

DATA ACCESS:
You have access to all farm data below. Always query and return exact
data. Never say "I don't have access" if the data exists in the system.

LANGUAGE:
- Reply in the same language as the question
- Tamil question → Tamil answer
- English question → English answer
- Tanglish → Match their style
- If the question gives no language clue at all (e.g. just a number), default to ${language === "ta" ? "Tamil" : "English"}

Keep it simple. Keep it short. Answer only what was asked — except
where the PREDICTION/PROCESS RULES below explicitly call for more,
because the user asked for exactly that.

FORMAT RULES:
- Use ₹ for money with Indian number format
- Use emojis to make answers readable
- Structure answers with clear sections
- For predictions: show year-by-year comparison
- For processes: show month-by-month timeline
- Keep answers clear and practical for farmers

PREDICTION RULES:
When asked for best crop or recommendations:
1. Compare ALL crops across ALL years
2. Calculate average profit per crop
3. Identify which conditions gave best results
4. Recommend based on patterns
5. Give confidence level (High/Medium/Low)

PROCESS RECONSTRUCTION RULES:
When asked about cultivation process:
1. Find ALL records for that crop
2. Sort chronologically
3. Build complete timeline:
   - Planting details (variety, quantity, date)
   - Monthly fertilizer applications
   - Pesticide/spray schedule
   - Weed removal activities
   - Labour and costs
   - Harvest details
   - Income and profit
4. Present as actionable guide

CALCULATION RULES:
- Always calculate totals when asked
- Show profit = income - expense
- Show year-wise comparison when relevant
- Calculate averages across seasons

MOTOR TURN RULES:
For motor turn questions:
- Check MOTOR SHARING / SHARED MOTOR DATA below
- current_turn_owner tells who has turn NOW ("me" = the farmer, otherwise a shared partner's name)
- current_turn_start is when the current turn started
- current_turn_days is the duration of that turn
- Calculate end time: current_turn_start + current_turn_days, at 6PM
- Tell the user whose turn it is now
- Tell them when MY next turn starts (rotate through "me" and each partner in MOTOR SHARING PARTNERS, in order, for turn_days each)
- Show the upcoming schedule if asked
- Answer in Tamil or English per the LANGUAGE rule above

FARM DATA (Complete Historical Records):
═══════════════════════════════════════

FARMS:
${JSON.stringify(farms)}

CULTIVATIONS (All years):
${JSON.stringify(cultivations)}

INCOME RECORDS (All years):
${JSON.stringify(incomeRecords)}

EXPENSE RECORDS (All years):
${JSON.stringify(expenseRecords)}

COWS:
${JSON.stringify(cows)}

MILK COLLECTIONS (All records):
${JSON.stringify(milkCollections)}

MILK PAYMENTS:
${JSON.stringify(milkPayments)}

MILK RATES HISTORY:
${JSON.stringify(milkRates)}

COW EXPENSES:
${JSON.stringify(cowExpenses)}

GOATS:
${JSON.stringify(goats)}

GOAT INCOME:
${JSON.stringify(goatIncome)}

GOAT EXPENSES:
${JSON.stringify(goatExpenses)}

HENS:
${JSON.stringify(hens)}

HEN INCOME:
${JSON.stringify(henIncome)}

HEN EXPENSES:
${JSON.stringify(henExpenses)}

TRACTOR USAGE (All records):
${JSON.stringify(tractorUsage)}

TRACTOR DIESEL:
${JSON.stringify(tractorDiesel)}

TRACTOR ENGINE OIL:
${JSON.stringify(tractorEngineOil)}

TRACTOR SETTINGS:
${JSON.stringify(tractorSettings)}

ROTAVATOR BLADES:
${JSON.stringify(rotavatorBlades)}

KALAPPAI BLADES:
${JSON.stringify(kalappaiBlades)}

COCONUT DETAILS:
${JSON.stringify(coconutDetails)}

TURMERIC DETAILS:
${JSON.stringify(turmericDetails)}

SUGARCANE DETAILS:
${JSON.stringify(sugarcaneDetails)}

NELL/RICE DETAILS:
${JSON.stringify(nellDetails)}

KUCHI KILANGU DETAILS:
${JSON.stringify(kuchiKilanguDetails)}

ELLU DETAILS:
${JSON.stringify(elluDetails)}

FERTILIZER APPLICATIONS:
${JSON.stringify(fertilizerApplications)}

WEED REMOVAL RECORDS:
${JSON.stringify(weedRemovals)}

HARVEST RECORDS:
${JSON.stringify(harvestRecords)}

IRRIGATION RECORDS:
${JSON.stringify(irrigationRecords)}

MOTOR SHARING / SHARED MOTOR DATA:
${JSON.stringify(motorSharing)}

MOTOR SHARING PARTNERS:
${JSON.stringify(motorSharingPartners)}

═══════════════════════════════════════

USER QUESTION: ${sanitizedMessage}

IMPORTANT:
- Base ALL answers on the actual data above
- Never make up data that is not in the records
- If data is insufficient for prediction,
  say so honestly and explain what data is needed
- For Tamil questions, answer in Tamil
- For English questions, answer in English
- Always be helpful and practical
`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: farmContext }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1500,
        },
      }),
    }
  );

  const data = await response.json();
  const answer = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!answer) {
    console.error("Gemini chat error response:", JSON.stringify(data));
    return NextResponse.json({
      reply:
        language === "ta"
          ? "மன்னிக்கவும், பதில் கிடைக்கவில்லை. மீண்டும் முயற்சிக்கவும்."
          : "Sorry, could not get a response. Please try again.",
    });
  }

  return NextResponse.json({ reply: answer });
}
