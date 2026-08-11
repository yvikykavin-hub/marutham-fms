import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { transcript } = await req.json();

    if (!transcript?.trim()) {
      return NextResponse.json({ error: "No transcript" }, { status: 400 });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: "API key missing" }, { status: 500 });
    }

    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

    // Simplified prompt - NO questions!
    const prompt = `
You are a Tamil Nadu farm data extractor.
TODAY: ${today}
YESTERDAY: ${yesterday}

Extract farm data from this voice input.
Language may be Tamil, English or mixed.

Tamil numbers:
ஒண்ணு=1,ரெண்டு=2,மூணு=3,நாலு=4,
அஞ்சு=5,ஆறு=6,ஏழு=7,எட்டு=8,
ஒன்பது=9,பத்து=10,நூறு=100,
ஆயிரம்=1000,ரெண்டாயிரம்=2000,
நாலரை=4.5,மூணரை=3.5,ரெண்டரை=2.5,
ஒண்ணரை=1.5,அஞ்சரை=5.5,ஆறரை=6.5,
அரை=0.5,கால்=0.25

Time: இன்று/today=${today}, நேத்து/yesterday=${yesterday}
Animal: பசு/மாடு=cow, எருமை=buffalo,
        ஆடு=goat, கோழி=hen

SUPPORTED MODULES:
1. milk_collection
2. livestock_expense
3. livestock_income

EXPENSE CATEGORY — pick the category key based on animal_type.
Return the EXACT category key from the matching list below, never
a translated or made-up value.

COW/BUFFALO EXPENSE TYPES:
rice_feed: rice feed, rice bran, அரிசி தீவனம்
normal_feed: normal feed, fodder, grass, தீவனம், புல்
medicine: medicine, tablet, மருந்து, மாத்திரை
vaccination: vaccine, தடுப்பூசி
veterinary: vet, doctor, டாக்டர்
ai: artificial insemination, கருவூட்டல்
shed_maintenance: shed repair, தொழுவம் பழுது
other: other, மற்றவை

GOAT EXPENSE TYPES:
feed, brownLeafRolls, medicine, vaccination, veterinary, other

HEN EXPENSE TYPES:
feed, medicine, vaccination, shedMaintenance, miscellaneous, other

LIVESTOCK INCOME RULES:
- Only goat and hen have sale income. Cow/buffalo have NO sale income —
  their income is milk only, always use module milk_collection for them.
- Goat income: weight(kg) × rate/kg = total. sale_type is always "weight".
- Hen income: EITHER by weight(kg) × rate/kg OR by bird count × rate/bird.
  Pick sale_type "weight" or "bird" based on what the speaker mentioned.
- Keywords: sold, income, sale, விற்றோம், விற்பனை, வருமானம்

RULES (VERY IMPORTANT):
1. NEVER ask questions
2. ALWAYS return JSON
3. Use smart defaults:
   - Missing date → ${today}
   - Missing animal → cow (or goat if module is livestock_income and unclear)
   - Missing amount → 0
   - Missing session → use 0
   - Missing/unclear category → normal_feed for cow/buffalo, feed for goat/hen
4. Return your BEST GUESS always
5. No markdown, no explanation

RETURN FORMAT (milk_collection / livestock_expense):
{
  "module": "milk_collection" OR "livestock_expense",
  "animal_type": "cow|buffalo|goat|hen",
  "date": "YYYY-MM-DD",
  "morning_litres": 0,
  "evening_litres": 0,
  "amount": 0,
  "category": "<exact key from the matching EXPENSE TYPES list above>",
  "description": "",
  "confidence": 0.0-1.0
}

RETURN FORMAT (livestock_income):
{
  "module": "livestock_income",
  "animal_type": "goat|hen",
  "date": "YYYY-MM-DD",
  "sale_type": "weight|bird",
  "weight_kg": 0,
  "rate_per_kg": 0,
  "number_sold": 0,
  "rate_per_bird": 0,
  "total_amount": 0,
  "buyer_name": "",
  "confidence": 0.0-1.0
}

Voice input: "${transcript}"
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 300,
          },
        }),
      }
    );

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const clean = rawText.replace(/```json/g, "").replace(/```/g, "").trim();

    try {
      const parsed = JSON.parse(clean);
      return NextResponse.json({
        success: true,
        result: parsed,
      });
    } catch {
      return NextResponse.json({
        success: false,
        error: "Parse error",
      });
    }
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
