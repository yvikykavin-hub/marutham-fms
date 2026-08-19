"use client";
import { useState, useRef, useEffect } from "react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";

interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
  time: string;
}

const CHAT_HISTORY_KEY = "marutham_chat_history";
const FONT_SIZES = ["small", "normal", "large"] as const;
type FontSize = typeof FONT_SIZES[number];

const fontSizeClass: Record<FontSize, string> = {
  small: "text-xs",
  normal: "text-sm",
  large: "text-base",
};

type SpeechRecognitionResultLike = { isFinal: boolean; [index: number]: { transcript: string } };

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: () => void;
  onend: () => void;
  onerror: () => void;
  onresult: (event: SpeechRecognitionEventLike) => void;
  start: () => void;
  stop: () => void;
};

const QUICK_QUESTIONS: { en: string; ta: string; icon: string }[] = [
  { en: "What should I do today?", ta: "இன்று நான் என்ன செய்ய வேண்டும்?", icon: "📅" },
  { en: "This month's milk income?", ta: "இந்த மாதம் பால் வருமானம் என்ன?", icon: "🥛" },
  { en: "Total expenses this year?", ta: "இந்த ஆண்டு மொத்த செலவு என்ன?", icon: "💸" },
  { en: "Whose motor turn today?", ta: "இன்று யாருடைய மோட்டார் முறை?", icon: "🚰" },
  { en: "Active crops summary?", ta: "செயலில் உள்ள பயிர்கள் சுருக்கம்?", icon: "🌾" },
  { en: "Pending milk payments?", ta: "நிலுவையில் உள்ள பால் பணம்?", icon: "💰" },
];

const buildWelcomeMessage = (language: "ta" | "en"): Message => ({
  id: Date.now(),
  role: "assistant",
  text:
    language === "ta"
      ? "வணக்கம்! நான் உங்கள் பண்ணை உதவியாளர். உங்கள் பண்ணை பற்றி என்னையும் கேளுங்கள்! 🌾"
      : "Hello! I am your Farm Assistant. Ask me anything about your farm! 🌾",
  time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
});

export default function ChatWidget({ language = "en" }: { language?: "ta" | "en" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [fontSize, setFontSize] = useState<FontSize>("normal");
  const [pos, setPos] = useState({ x: 24, y: 24 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, right: 24, bottom: 24 });
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(CHAT_HISTORY_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch {
          // fall through to default welcome message
        }
      }
    }
    return [buildWelcomeMessage(language)];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (messages.length > 1) {
      window.localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages.slice(-20)));
    }
  }, [messages]);

  const clearChat = () => {
    setMessages([buildWelcomeMessage(language)]);
    window.localStorage.removeItem(CHAT_HISTORY_KEY);
    setShowSuggestions(true);
  };

  const cycleFontSize = () => {
    const current = FONT_SIZES.indexOf(fontSize);
    setFontSize(FONT_SIZES[(current + 1) % FONT_SIZES.length]);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = {
      id: Date.now(),
      role: "user",
      text: text.trim(),
      time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setShowSuggestions(false);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, language, accessToken }),
      });

      const data = await response.json();

      const assistantMessage: Message = {
        id: Date.now() + 1,
        role: "assistant",
        text: data.reply,
        time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          text:
            language === "ta"
              ? "மன்னிக்கவும், பிழை ஏற்பட்டது. மீண்டும் முயற்சிக்கவும்."
              : "Sorry, an error occurred. Please try again.",
          time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const toggleVoice = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const w = window as unknown as {
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      SpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechRecognitionCtor = w.webkitSpeechRecognition || w.SpeechRecognition;
    if (!SpeechRecognitionCtor) {
      alert(language === "ta" ? "உங்கள் browser voice input ஆதரிக்கவில்லை" : "Your browser does not support voice input");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognitionRef.current = recognition;
    recognition.lang = language === "ta" ? "ta-IN" : "en-IN";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      setInput(finalTranscript || interimTranscript);
    };

    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.start();
  };

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(false);
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragStart.current = {
      x: clientX,
      y: clientY,
      right: pos.x,
      bottom: pos.y,
    };

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const cx = "touches" in e ? e.touches[0].clientX : e.clientX;
      const cy = "touches" in e ? e.touches[0].clientY : e.clientY;
      const dx = dragStart.current.x - cx;
      const dy = dragStart.current.y - cy;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        setIsDragging(true);
      }
      setPos({
        x: Math.max(10, dragStart.current.right + dx),
        y: Math.max(10, dragStart.current.bottom + dy),
      });
    };

    const handleEnd = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
      setTimeout(() => setIsDragging(false), 100);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleMove);
    window.addEventListener("touchend", handleEnd);
  };

  const getChatWindowStyle = () => {
    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;
    const chatWidth = 384; // w-96

    // Determine vertical direction
    // If button is in top half → open downward
    // If button is in bottom half → open upward
    const buttonBottom = pos.y;
    const buttonFromTop = windowHeight - buttonBottom - 56;

    const openDownward = buttonFromTop < windowHeight / 2;

    // Determine horizontal position
    const rightPos = Math.max(10, Math.min(pos.x, windowWidth - chatWidth - 10));

    return {
      position: "fixed" as const,
      right: `${rightPos}px`,
      ...(openDownward ? { top: `${buttonFromTop + 70}px` } : { bottom: `${buttonBottom + 70}px` }),
      width: "384px",
      height: `min(500px, calc(100vh - 120px))`,
      maxHeight: "80vh",
      zIndex: 50,
    };
  };

  return (
    <>
      {/* Chat toggle button */}
      <button
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        onClick={() => !isDragging && setIsOpen(!isOpen)}
        className="fixed z-50 w-14 h-14 rounded-full shadow-lg hover:shadow-xl overflow-hidden border-2 border-white cursor-grab active:cursor-grabbing transition-shadow duration-200"
        style={{ bottom: pos.y, right: pos.x }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/farmer-icon.png" alt="Farm Assistant" className="w-full h-full object-cover" />
      </button>

      {/* Chat window */}
      {isOpen && (
        <div
          className="bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          style={isMinimized ? { ...getChatWindowStyle(), height: "auto" } : getChatWindowStyle()}
        >

          {/* Header */}
          <div className="bg-[#2D6A4F] px-4 py-3 flex flex-col gap-1 shrink-0">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/farmer-icon.png" alt="Farm Assistant" className="w-9 h-9 rounded-full object-cover border-2 border-white/30" />
              <p className="text-white font-semibold text-sm">
                {language === "ta" ? "பண்ணை உதவியாளர்" : "Farm Assistant"}
              </p>
              <div className="ml-auto flex items-center gap-1">
                {/* Font size */}
                <button
                  onClick={cycleFontSize}
                  className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xs transition-all duration-200"
                  title="Font size"
                >
                  A
                </button>

                {/* Clear chat */}
                <button
                  onClick={clearChat}
                  className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xs transition-all duration-200"
                  title={language === "ta" ? "அழி" : "Clear chat"}
                >
                  🗑️
                </button>

                {/* Minimize */}
                <button
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm transition-all duration-200"
                  title="Minimize"
                >
                  {isMinimized ? "□" : "—"}
                </button>

                {/* Close */}
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-7 h-7 rounded-lg bg-white/10 hover:bg-red-500 text-white flex items-center justify-center text-sm transition-all duration-200"
                  title="Close"
                >
                  ×
                </button>
              </div>
            </div>

            {!isMinimized && (
              <div className="flex items-center pl-12">
                <p className="text-green-200 text-xs">Marutham FMS AI</p>
                <div className="ml-auto flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />
                  <span className="text-green-200 text-xs">{language === "ta" ? "இயங்குகிறது" : "Online"}</span>
                </div>
              </div>
            )}
          </div>

          {!isMinimized && (
          <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
            {messages.map((msg) =>
              msg.role === "assistant" ? (
                <div key={msg.id} className="flex justify-start">
                  <div className="relative group">
                    <div className="max-w-[80%] rounded-2xl px-3 py-2 bg-white text-gray-900 shadow-sm rounded-bl-sm border border-green-100">
                      <p className={`whitespace-pre-wrap ${fontSizeClass[fontSize]}`}>{msg.text}</p>
                      <p className="text-xs mt-1 text-gray-400">{msg.time}</p>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(msg.text);
                        toast.success(language === "ta" ? "நகலெடுக்கப்பட்டது!" : "Copied!");
                      }}
                      className="absolute -bottom-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full"
                    >
                      📋 {language === "ta" ? "நகல்" : "Copy"}
                    </button>
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl px-3 py-2 bg-[#2D6A4F] text-white rounded-br-sm">
                    <p className={`whitespace-pre-wrap ${fontSizeClass[fontSize]}`}>{msg.text}</p>
                    <p className="text-xs mt-1 text-green-200">{msg.time}</p>
                  </div>
                </div>
              )
            )}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-gray-100">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested questions */}
          {showSuggestions && messages.length <= 1 && (
            <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2">💡 {language === "ta" ? "விரைவு கேள்விகள்" : "Quick questions"}</p>
              <div className="flex flex-col gap-1">
                {QUICK_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      sendMessage(language === "ta" ? q.ta : q.en);
                      setShowSuggestions(false);
                    }}
                    className="flex items-center gap-2 text-xs bg-green-50 text-green-800 border border-green-200 rounded-lg px-2.5 py-1.5 hover:bg-green-100 transition-colors text-left"
                  >
                    <span>{q.icon}</span>
                    <span>{language === "ta" ? q.ta : q.en}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input area */}
          <div className="p-3 bg-white border-t border-gray-100">
            <div className="flex gap-2">
              {isListening ? (
                <div className="flex items-center gap-2 flex-1">
                  {/* Animated recording button */}
                  <button
                    onClick={toggleVoice}
                    className="relative w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center flex-shrink-0 shadow-lg"
                  >
                    {/* Outer pulse ring 1 */}
                    <span className="absolute inset-0 rounded-xl bg-red-400 animate-ping opacity-40" />

                    {/* Outer pulse ring 2 */}
                    <span
                      className="absolute -inset-1 rounded-xl bg-red-300 animate-ping opacity-20"
                      style={{ animationDelay: "150ms" }}
                    />

                    {/* Stop icon */}
                    <span className="relative z-10 w-3 h-3 bg-white rounded-sm" />
                  </button>

                  {/* Sound wave animation */}
                  <div className="flex items-center gap-0.5 flex-1 h-8 px-2 bg-red-50 rounded-xl border border-red-100">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                      <div
                        key={i}
                        className="w-0.5 bg-red-400 rounded-full animate-wave"
                        style={{
                          height: `${Math.random() * 20 + 8}px`,
                          animationDelay: `${i * 100}ms`,
                          animationDuration: `${Math.random() * 400 + 400}ms`,
                        }}
                      />
                    ))}
                  </div>

                  {/* Recording duration text */}
                  <span className="text-red-500 text-xs font-medium flex-shrink-0">
                    {language === "ta" ? "பேசுங்கள்..." : "Listening..."}
                  </span>
                </div>
              ) : (
                /* Normal mic button */
                <button
                  onClick={toggleVoice}
                  className="w-10 h-10 rounded-xl bg-green-50 text-green-700 hover:bg-green-100 flex items-center justify-center transition-all duration-200 flex-shrink-0 text-lg"
                >
                  🎤
                </button>
              )}

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
                placeholder={language === "ta" ? "உங்கள் கேள்வியை தமிழில் கேளுங்கள்..." : "Ask about your farm..."}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
              />

              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className="w-10 h-10 rounded-xl bg-[#2D6A4F] hover:bg-[#1B4332] text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex-shrink-0"
              >
                →
              </button>
            </div>
            {isListening && (
              <div className="flex items-center gap-2 px-1 mt-1.5">
                <div className="flex gap-0.5">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="w-1 h-1 bg-red-500 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
                <span className="text-xs text-red-500 font-medium">
                  {language === "ta" ? "கேட்கிறது... மீண்டும் அழுத்தி நிறுத்துங்கள்" : "Recording... tap mic to stop"}
                </span>
              </div>
            )}
          </div>
          </>
          )}
        </div>
      )}
    </>
  );
}
