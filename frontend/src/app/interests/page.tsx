"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";

const API = process.env.NEXT_PUBLIC_API_URL || "https://grabit-backend-33a815d5fa2c.herokuapp.com";

const FOOD_PRESETS = [
  "Indian", "Vietnamese", "Thai", "Japanese", "Korean",
  "Chinese", "Malay", "Indonesian", "Western", "Fast Food",
  "Seafood", "Vegetarian",
];

const ACTIVITY_PRESETS = [
  "Outdoorsy", "Hiking", "Historical Places", "Theme Parks",
  "Museums", "Beaches", "Nightlife", "Shopping",
  "Temples", "Markets", "Adventure Sports", "Photography Spots",
];

export default function InterestsPage() {
  const router = useRouter();
  const [step, setStep] = useState(0); // 0 = food, 1 = activities
  const [foodBubbles, setFoodBubbles] = useState<string[]>([]);
  const [foodCustom, setFoodCustom] = useState("");
  const [foodText, setFoodText] = useState("");
  const [actBubbles, setActBubbles] = useState<string[]>([]);
  const [actCustom, setActCustom] = useState("");
  const [actText, setActText] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAddFood, setShowAddFood] = useState(false);
  const [showAddAct, setShowAddAct] = useState(false);
  const [customFoodBubbles, setCustomFoodBubbles] = useState<string[]>([]);
  const [customActBubbles, setCustomActBubbles] = useState<string[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("grabit_token");
    if (!token) router.push("/signup");
  }, [router]);

  const toggleBubble = (bubble: string, selected: string[], setSelected: (v: string[]) => void) => {
    if (selected.includes(bubble)) {
      setSelected(selected.filter((b) => b !== bubble));
    } else {
      setSelected([...selected, bubble]);
    }
  };

  const addCustomBubble = (
    value: string,
    setValue: (v: string) => void,
    customs: string[],
    setCustoms: (v: string[]) => void,
    selected: string[],
    setSelected: (v: string[]) => void,
    setShow: (v: boolean) => void
  ) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!customs.includes(trimmed)) {
      setCustoms([...customs, trimmed]);
    }
    if (!selected.includes(trimmed)) {
      setSelected([...selected, trimmed]);
    }
    setValue("");
    setShow(false);
  };

  const saveAndContinue = async () => {
    const token = localStorage.getItem("grabit_token");
    if (!token) return;

    if (step === 0) {
      // Save food, go to activities
      await fetch(`${API}/interests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          category: "food",
          bubbles: foodBubbles,
          free_text: foodText,
        }),
      });
      setStep(1);
      return;
    }

    // Save activities and finish
    setSaving(true);
    await fetch(`${API}/interests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        category: "activities",
        bubbles: actBubbles,
        free_text: actText,
      }),
    });
    setSaving(false);
    router.push("/home");
  };

  const currentBubbles = step === 0 ? foodBubbles : actBubbles;
  const currentPresets = step === 0 ? FOOD_PRESETS : ACTIVITY_PRESETS;
  const currentCustoms = step === 0 ? customFoodBubbles : customActBubbles;
  const allBubbles = [...currentPresets, ...currentCustoms];
  const setCurrentBubbles = step === 0 ? setFoodBubbles : setActBubbles;
  const currentText = step === 0 ? foodText : actText;
  const setCurrentText = step === 0 ? setFoodText : setActText;
  const showAdd = step === 0 ? showAddFood : showAddAct;
  const setShowAdd = step === 0 ? setShowAddFood : setShowAddAct;
  const customValue = step === 0 ? foodCustom : actCustom;
  const setCustomValue = step === 0 ? setFoodCustom : setActCustom;

  const titles = [
    { heading: "What food do you love?", sub: "Pick cuisines you enjoy — or add your own" },
    { heading: "What do you like to do?", sub: "Select activities that excite you" },
  ];

  const emojis = step === 0
    ? ["🍜", "🍛", "🍣", "🥘", "🍲", "🌮", "🍕", "🥗", "🍤", "🍔", "🐟", "🥬"]
    : ["🏕️", "🥾", "🏛️", "🎢", "🖼️", "🏖️", "🌃", "🛍️", "⛩️", "🏪", "🪂", "📸"];

  return (
    <div className="noise min-h-screen flex flex-col relative overflow-hidden">
      <Header />
      {/* Background */}
      <div
        className="absolute top-[-10%] right-[-20%] w-[500px] h-[500px] rounded-full opacity-15 blur-3xl"
        style={{
          background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 flex flex-col flex-1 w-full max-w-lg mx-auto px-6 py-8">
        {/* Progress */}
        <div className="flex gap-2 mb-8">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-1.5 flex-1 rounded-full transition-all duration-500"
              style={{
                background: i <= step ? "var(--accent)" : "var(--border)",
              }}
            />
          ))}
        </div>

        {/* Header */}
        <div className="mb-8 animate-slide-up" key={step}>
          <h1
            className="text-3xl mb-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {titles[step].heading}
          </h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {titles[step].sub}
          </p>
        </div>

        {/* Bubbles */}
        <div className="flex flex-wrap gap-2.5 mb-6 stagger" key={`bubbles-${step}`}>
          {allBubbles.map((bubble, i) => {
            const isSelected = currentBubbles.includes(bubble);
            const emoji = i < emojis.length ? emojis[i] : "✨";
            return (
              <button
                key={bubble}
                onClick={() => toggleBubble(bubble, currentBubbles, setCurrentBubbles)}
                className="animate-bubble-in flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
                style={{
                  opacity: 0,
                  background: isSelected ? "var(--accent)" : "var(--card)",
                  color: isSelected ? "#fff" : "var(--fg)",
                  border: isSelected ? "none" : "1.5px solid var(--border)",
                  boxShadow: isSelected ? "0 2px 12px rgba(0, 177, 79, 0.3)" : "none",
                }}
              >
                <span>{emoji}</span>
                {bubble}
              </button>
            );
          })}

          {/* Add custom bubble button */}
          {!showAdd && (
            <button
              onClick={() => setShowAdd(true)}
              className="animate-bubble-in flex items-center gap-1 px-4 py-2.5 rounded-full text-sm font-medium cursor-pointer transition-all hover:scale-105"
              style={{
                opacity: 0,
                background: "transparent",
                border: "1.5px dashed var(--border)",
                color: "var(--muted)",
              }}
            >
              <span className="text-lg leading-none">+</span> Add your own
            </button>
          )}

          {/* Custom input inline */}
          {showAdd && (
            <div className="animate-bubble-in flex items-center gap-1 rounded-full overflow-hidden" style={{ opacity: 0, border: "1.5px solid var(--accent)" }}>
              <input
                autoFocus
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    addCustomBubble(
                      customValue, setCustomValue,
                      currentCustoms, step === 0 ? setCustomFoodBubbles : setCustomActBubbles,
                      currentBubbles, setCurrentBubbles,
                      setShowAdd
                    );
                  } else if (e.key === "Escape") {
                    setShowAdd(false);
                    setCustomValue("");
                  }
                }}
                placeholder={step === 0 ? "e.g. Boba Tea" : "e.g. Scuba Diving"}
                className="px-4 py-2.5 text-sm outline-none bg-transparent w-36"
              />
              <button
                onClick={() =>
                  addCustomBubble(
                    customValue, setCustomValue,
                    currentCustoms, step === 0 ? setCustomFoodBubbles : setCustomActBubbles,
                    currentBubbles, setCurrentBubbles,
                    setShowAdd
                  )
                }
                className="px-3 py-2.5 text-sm font-semibold cursor-pointer"
                style={{ color: "var(--accent)" }}
              >
                Add
              </button>
            </div>
          )}
        </div>

        {/* Free text area */}
        <div className="mb-8 animate-fade-in" style={{ animationDelay: "400ms" }}>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted)" }}>
            {step === 0 ? "Tell us more about your food taste" : "Describe what kind of experiences you enjoy"}
          </label>
          <textarea
            value={currentText}
            onChange={(e) => setCurrentText(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none transition-all focus:ring-2"
            style={{
              background: "var(--card)",
              border: "1.5px solid var(--border)",
              color: "var(--fg)",
              fontFamily: "var(--font-body)",
            }}
            placeholder={
              step === 0
                ? "I love spicy dishes, street food, anything with coconut milk..."
                : "I enjoy exploring hidden gems, sunrise hikes, local cultural experiences..."
            }
          />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom actions */}
        <div className="flex gap-3 pb-4">
          {step > 0 && (
            <button
              onClick={() => setStep(0)}
              className="h-14 px-6 rounded-2xl font-semibold text-sm transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              style={{
                background: "var(--card)",
                border: "1.5px solid var(--border)",
                color: "var(--fg)",
              }}
            >
              Back
            </button>
          )}
          <button
            onClick={saveAndContinue}
            disabled={saving}
            className="flex-1 h-14 rounded-2xl text-white font-semibold text-base transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, #009640 100%)",
              boxShadow: "0 4px 20px rgba(0, 177, 79, 0.3)",
            }}
          >
            {saving ? "Saving..." : step === 0 ? "Next → Activities" : "Start Exploring"}
          </button>
        </div>
      </div>
    </div>
  );
}
