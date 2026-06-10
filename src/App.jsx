import { useState, useMemo, useEffect, useRef, useCallback } from "react";

const GOOGLE_CLIENT_ID = "82756044682-ovvcfig11hhc3v1grbb2vgsus4k9k90o.apps.googleusercontent.com";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.file email profile";
const DRIVE_FILE_NAME = "expense-tracker-data.json";
const AUTH_API = "/api/auth";
const REDIRECT_URI = window.location.origin + "/app.html";

function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : defaultValue; } catch { return defaultValue; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }, [key, value]);
  return [value, setValue];
}

const DEFAULT_CATEGORIES = [
  { id: "food", label: "Food", color: "#FF9500" },
  { id: "transport", label: "Transport", color: "#636366" },
  { id: "groceries", label: "Groceries", color: "#34C759" },
  { id: "shopping", label: "Shopping", color: "#AF52DE" },
  { id: "entertainment", label: "Entertainment", color: "#FF2D55" },
  { id: "bills", label: "Bills", color: "#007AFF" },
  { id: "health", label: "Health", color: "#30B0C7" },
  { id: "travel", label: "Travel", color: "#FF9500" },
];

const DEFAULT_PAYMENT_SOURCES = [
  { id: "cash", label: "Cash", color: "#34C759" },
  { id: "upi", label: "UPI", color: "#007AFF" },
  { id: "credit_card", label: "Credit Card", color: "#FF2D55" },
  { id: "debit_card", label: "Debit Card", color: "#AF52DE" },
];

const COLOR_OPTIONS = ["#FF9500","#FF2D55","#AF52DE","#007AFF","#34C759","#30B0C7","#636366","#FF6B35","#A2845E","#5856D6","#FF3B30","#00C7BE"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const FREQ_OPTIONS = ["Daily","Weekly","Monthly","Quarterly","Yearly","Custom"];

const fmt = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const fmtShort = (n) => n >= 100000 ? `₹${(n/100000).toFixed(1)}L` : n >= 1000 ? `₹${(n/1000).toFixed(1)}K` : fmt(n);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const monthKey = (date) => date.slice(0, 7);
const currentMonth = () => today().slice(0, 7);

function MonthNav({ value, onChange }) {
  const [y, m] = value.split("-").map(Number);
  const prev = () => { const d = new Date(y, m-2); onChange(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`); };
  const next = () => { const d = new Date(y, m); onChange(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`); };
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:32, marginBottom:20 }}>
      <button onClick={prev} style={{ background:"none", border:"none", cursor:"pointer", color:"#007AFF", fontSize:20, padding:"4px 8px" }}>‹</button>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontWeight:600, fontSize:17 }}>{MONTHS[m-1]}</div>
        <div style={{ fontSize:13, color:"#8E8E93" }}>{y}</div>
      </div>
      <button onClick={next} style={{ background:"none", border:"none", cursor:"pointer", color:"#007AFF", fontSize:20, padding:"4px 8px" }}>›</button>
    </div>
  );
}

function SubToggle({ value, onChange, options }) {
  return (
    <div style={{ display:"flex", background:"#E5E5EA", borderRadius:10, padding:2, marginBottom:20 }}>
      {options.map(([v,l]) => (
        <button key={v} onClick={() => onChange(v)} style={{ flex:1, padding:"8px", borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontWeight:500, background:value===v?"#fff":"transparent", color:value===v?"#1C1C1E":"#8E8E93", boxShadow:value===v?"0 1px 3px rgba(0,0,0,.12)":"none", transition:"all .15s" }}>{l}</button>
      ))}
    </div>
  );
}

const TOUR_STEPS = [
  { title: "Add an Expense", body: "Tap the + tab to log an expense. Fill in amount, narration, category and payment source.", emoji: "➕", target: "add" },
  { title: "Categories", body: "Add your own categories in Settings. Drag ☰ to reorder. You can also make category optional in Settings → Preferences.", emoji: "🏷️", target: "settings" },
  { title: "Payment Sources", body: "Add all your cards, UPI accounts and cash in Settings. Helps you track spending per account.", emoji: "💳", target: "settings" },
  { title: "Recurring Expenses", body: "Set up subscriptions and regular bills in Settings. The app auto-adds them on the due date and reminds you before they expire.", emoji: "🔁", target: "settings" },
  { title: "Summary & Insights", body: "Track spending by category, view yearly trends, and get detailed insights. Email your monthly report from the Insights tab.", emoji: "📊", target: "summary" },
  { title: "Google Drive Sync", body: "Your data syncs automatically to Google Drive after every change. Works across all your devices.", emoji: "☁️", target: "settings" },
];

function TourOverlay({ onFinish, onSkip }) {
  const [step, setStep] = useState(0);
  const s = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:500, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div style={{ background:"#fff", borderRadius:"24px 24px 0 0", width:"100%", maxWidth:430, padding:"28px 24px 44px", position:"relative" }}>
        <button onClick={onSkip} style={{ position:"absolute", top:16, right:20, background:"none", border:"none", cursor:"pointer", color:"#8E8E93", fontSize:14, fontWeight:500 }}>Skip tour</button>
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ fontSize:52, marginBottom:12 }}>{s.emoji}</div>
          <div style={{ fontWeight:700, fontSize:20, marginBottom:8, color:"#1C1C1E" }}>{s.title}</div>
          <div style={{ fontSize:15, color:"#636366", lineHeight:1.5 }}>{s.body}</div>
        </div>
        <div style={{ display:"flex", justifyContent:"center", gap:6, marginBottom:24 }}>
          {TOUR_STEPS.map((_,i) => <div key={i} style={{ width:i===step?20:6, height:6, borderRadius:99, background:i===step?"#007AFF":"#C7C7CC", transition:"all .2s" }} />)}
        </div>
        <button onClick={() => isLast ? onFinish() : setStep(s => s+1)} style={{ width:"100%", padding:"16px", borderRadius:14, border:"none", cursor:"pointer", background:"#007AFF", color:"#fff", fontSize:16, fontWeight:600 }}>
          {isLast ? "Get Started 🎉" : "Next →"}
        </button>
      </div>
    </div>
  );
}

function SetupFlow({ googleUser, onComplete }) {
  const [step, setStep] = useState(0);
  const [selCats, setSelCats] = useState(DEFAULT_CATEGORIES.map(c => c.id));
  const [selPays, setSelPays] = useState(DEFAULT_PAYMENT_SOURCES.map(p => p.id));
  const [budget, setBudget] = useState("");
  const [customCats, setCustomCats] = useState([]);
  const [customPays, setCustomPays] = useState([]);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#007AFF");
  const [showAddCat, setShowAddCat] = useState(false);
  const [showAddPay, setShowAddPay] = useState(false);

  const allCats = [...DEFAULT_CATEGORIES, ...customCats];
  const allPays = [...DEFAULT_PAYMENT_SOURCES, ...customPays];

  const toggleCat = (id) => setSelCats(p => p.includes(id) ? p.filter(x => x!==id) : [...p, id]);
  const togglePay = (id) => setSelPays(p => p.includes(id) ? p.filter(x => x!==id) : [...p, id]);

  const addCustomCat = () => {
    if (!newLabel.trim()) return;
    const id = newLabel.toLowerCase().replace(/\s+/g,"_")+"_"+Date.now();
    setCustomCats(p => [...p, { id, label:newLabel.trim(), color:newColor }]);
    setSelCats(p => [...p, id]);
    setNewLabel(""); setNewColor("#007AFF"); setShowAddCat(false);
  };

  const addCustomPay = () => {
    if (!newLabel.trim()) return;
    const id = newLabel.toLowerCase().replace(/\s+/g,"_")+"_"+Date.now();
    setCustomPays(p => [...p, { id, label:newLabel.trim(), color:newColor }]);
    setSelPays(p => [...p, id]);
    setNewLabel(""); setNewColor("#007AFF"); setShowAddPay(false);
  };

  const handleComplete = () => {
    const finalCats = allCats.filter(c => selCats.includes(c.id));
    const finalPays = allPays.filter(p => selPays.includes(p.id));
    onComplete({ categories: finalCats, paymentSources: finalPays, budget });
  };

  const steps = ["welcome","categories","payment","budget"];
  const progress = ((step)/steps.length)*100;

  return (
    <div style={{ fontFamily:"-apple-system,'SF Pro Display','Helvetica Neue',sans-serif", background:"#F2F2F7", minHeight:"100vh", maxWidth:430, margin:"0 auto", display:"flex", flexDirection:"column" }}>
      <div style={{ height:4, background:"#E5E5EA" }}><div style={{ height:"100%", width:`${progress}%`, background:"#007AFF", transition:"width .3s" }} /></div>
      <div style={{ flex:1, padding:"32px 24px 40px", display:"flex", flexDirection:"column" }}>

        {step === 0 && (
          <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", textAlign:"center" }}>
            {googleUser?.picture && <img src={googleUser.picture} style={{ width:72, height:72, borderRadius:"50%", marginBottom:16 }} alt="" />}
            <div style={{ fontSize:28, fontWeight:700, marginBottom:8, color:"#1C1C1E" }}>Hi {googleUser?.name?.split(" ")[0] || "there"}! 👋</div>
            <div style={{ fontSize:17, color:"#636366", lineHeight:1.6, marginBottom:40 }}>Let's set up your expense tracker. It'll take about a minute.</div>
            <button onClick={() => setStep(1)} style={{ width:"100%", padding:"18px", borderRadius:16, border:"none", cursor:"pointer", background:"#007AFF", color:"#fff", fontSize:17, fontWeight:600 }}>Let's go →</button>
            <button onClick={() => handleComplete()} style={{ marginTop:12, background:"none", border:"none", cursor:"pointer", color:"#8E8E93", fontSize:14, padding:"8px" }}>Skip setup</button>
          </div>
        )}

        {step === 1 && (
          <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
            <div style={{ fontSize:24, fontWeight:700, marginBottom:6, color:"#1C1C1E" }}>Your Categories</div>
            <div style={{ fontSize:15, color:"#8E8E93", marginBottom:24 }}>Select the ones you need. You can always change these later.</div>
            <div style={{ flex:1, overflowY:"auto" }}>
              <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginBottom:16 }}>
                {allCats.map(c => (
                  <button key={c.id} onClick={() => toggleCat(c.id)} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 16px", borderRadius:20, border:`2px solid ${selCats.includes(c.id) ? c.color : "#E5E5EA"}`, background:selCats.includes(c.id) ? c.color+"22" : "#fff", cursor:"pointer", fontSize:14, fontWeight:500, color:selCats.includes(c.id) ? c.color : "#636366" }}>
                    <span style={{ width:8, height:8, borderRadius:"50%", background:c.color, flexShrink:0 }} />{c.label}
                    {selCats.includes(c.id) && <span style={{ fontSize:12 }}>✓</span>}
                  </button>
                ))}
                <button onClick={() => setShowAddCat(true)} style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 16px", borderRadius:20, border:"2px dashed #C7C7CC", background:"none", cursor:"pointer", fontSize:14, color:"#007AFF", fontWeight:500 }}>+ Add</button>
              </div>
              {showAddCat && (
                <div style={{ background:"#fff", borderRadius:16, padding:16, marginBottom:16 }}>
                  <input style={{ width:"100%", padding:"12px 14px", borderRadius:10, border:"1px solid #E5E5EA", fontSize:15, marginBottom:12, outline:"none" }} placeholder="Category name" value={newLabel} onChange={e => setNewLabel(e.target.value)} autoFocus />
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>{COLOR_OPTIONS.map(col => <button key={col} onClick={() => setNewColor(col)} style={{ width:28, height:28, borderRadius:"50%", background:col, border:"none", cursor:"pointer", outline:newColor===col?`3px solid ${col}`:"none", outlineOffset:2 }} />)}</div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={() => setShowAddCat(false)} style={{ flex:1, padding:"10px", borderRadius:10, border:"none", cursor:"pointer", background:"#F2F2F7", fontSize:14, fontWeight:500 }}>Cancel</button>
                    <button onClick={addCustomCat} style={{ flex:1, padding:"10px", borderRadius:10, border:"none", cursor:"pointer", background:"#007AFF", color:"#fff", fontSize:14, fontWeight:600 }}>Add</button>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display:"flex", gap:10, marginTop:16 }}>
              <button onClick={() => setStep(0)} style={{ padding:"16px 24px", borderRadius:14, border:"none", cursor:"pointer", background:"#F2F2F7", fontSize:16, fontWeight:500, color:"#636366" }}>←</button>
              <button onClick={() => setStep(2)} style={{ flex:1, padding:"16px", borderRadius:14, border:"none", cursor:"pointer", background:"#007AFF", color:"#fff", fontSize:16, fontWeight:600 }}>Next →</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
            <div style={{ fontSize:24, fontWeight:700, marginBottom:6, color:"#1C1C1E" }}>Payment Sources</div>
            <div style={{ fontSize:15, color:"#8E8E93", marginBottom:24 }}>Add your cards, UPI accounts and cash methods.</div>
            <div style={{ flex:1, overflowY:"auto" }}>
              <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginBottom:16 }}>
                {allPays.map(p => (
                  <button key={p.id} onClick={() => togglePay(p.id)} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 16px", borderRadius:20, border:`2px solid ${selPays.includes(p.id) ? p.color : "#E5E5EA"}`, background:selPays.includes(p.id) ? p.color+"22" : "#fff", cursor:"pointer", fontSize:14, fontWeight:500, color:selPays.includes(p.id) ? p.color : "#636366" }}>
                    <span style={{ width:8, height:8, borderRadius:"50%", background:p.color, flexShrink:0 }} />{p.label}
                    {selPays.includes(p.id) && <span style={{ fontSize:12 }}>✓</span>}
                  </button>
                ))}
                <button onClick={() => setShowAddPay(true)} style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 16px", borderRadius:20, border:"2px dashed #C7C7CC", background:"none", cursor:"pointer", fontSize:14, color:"#007AFF", fontWeight:500 }}>+ Add</button>
              </div>
              {showAddPay && (
                <div style={{ background:"#fff", borderRadius:16, padding:16, marginBottom:16 }}>
                  <input style={{ width:"100%", padding:"12px 14px", borderRadius:10, border:"1px solid #E5E5EA", fontSize:15, marginBottom:12, outline:"none" }} placeholder="e.g. HDFC Credit Card" value={newLabel} onChange={e => setNewLabel(e.target.value)} autoFocus />
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>{COLOR_OPTIONS.map(col => <button key={col} onClick={() => setNewColor(col)} style={{ width:28, height:28, borderRadius:"50%", background:col, border:"none", cursor:"pointer", outline:newColor===col?`3px solid ${col}`:"none", outlineOffset:2 }} />)}</div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={() => setShowAddPay(false)} style={{ flex:1, padding:"10px", borderRadius:10, border:"none", cursor:"pointer", background:"#F2F2F7", fontSize:14, fontWeight:500 }}>Cancel</button>
                    <button onClick={addCustomPay} style={{ flex:1, padding:"10px", borderRadius:10, border:"none", cursor:"pointer", background:"#007AFF", color:"#fff", fontSize:14, fontWeight:600 }}>Add</button>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display:"flex", gap:10, marginTop:16 }}>
              <button onClick={() => setStep(1)} style={{ padding:"16px 24px", borderRadius:14, border:"none", cursor:"pointer", background:"#F2F2F7", fontSize:16, fontWeight:500, color:"#636366" }}>←</button>
              <button onClick={() => setStep(3)} style={{ flex:1, padding:"16px", borderRadius:14, border:"none", cursor:"pointer", background:"#007AFF", color:"#fff", fontSize:16, fontWeight:600 }}>Next →</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center" }}>
            <div style={{ fontSize:24, fontWeight:700, marginBottom:6, color:"#1C1C1E" }}>Monthly Budget</div>
            <div style={{ fontSize:15, color:"#8E8E93", marginBottom:32 }}>Set a monthly spending limit. You'll get alerts at 80% and 100%.</div>
            <div style={{ position:"relative", marginBottom:16 }}>
              <span style={{ position:"absolute", left:16, top:"50%", transform:"translateY(-50%)", fontSize:22, color:"#8E8E93", fontWeight:300 }}>₹</span>
              <input style={{ width:"100%", padding:"18px 16px 18px 40px", borderRadius:14, border:"1.5px solid #E5E5EA", fontSize:24, fontWeight:600, outline:"none", background:"#fff" }} type="number" min="0" placeholder="0" value={budget} onChange={e => setBudget(e.target.value)} autoFocus />
            </div>
            <div style={{ display:"flex", gap:10, marginTop:8 }}>
              <button onClick={() => setStep(2)} style={{ padding:"16px 24px", borderRadius:14, border:"none", cursor:"pointer", background:"#F2F2F7", fontSize:16, fontWeight:500, color:"#636366" }}>←</button>
              <button onClick={handleComplete} style={{ flex:1, padding:"16px", borderRadius:14, border:"none", cursor:"pointer", background:"#007AFF", color:"#fff", fontSize:16, fontWeight:600 }}>
                {budget ? "Save & Continue →" : "Skip for now →"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("add");
  const [summaryTab, setSummaryTab] = useState("monthly");
  const [settingsTab, setSettingsTab] = useState("preferences");
  const [expenses, setExpenses] = useLocalStorage("et_expenses", []);
  const [categories, setCategories] = useLocalStorage("et_categories", DEFAULT_CATEGORIES);
  const [paymentSources, setPaymentSources] = useLocalStorage("et_payment_sources", DEFAULT_PAYMENT_SOURCES);
  const [totalBudget, setTotalBudget] = useLocalStorage("et_budget", "");
  const [categoryMandatory, setCategoryMandatory] = useLocalStorage("et_cat_mandatory", true);
  const [fontSize, setFontSize] = useLocalStorage("et_font_size", "medium");
  const [recurringExpenses, setRecurringExpenses] = useLocalStorage("et_recurring", []);
  const [driveFileId, setDriveFileId] = useLocalStorage("et_drive_file_id", null);
  const [googleToken, setGoogleToken] = useLocalStorage("et_google_token", null);
  const [googleUser, setGoogleUser] = useLocalStorage("et_google_user", null);
  const [refreshToken, setRefreshToken] = useLocalStorage("et_refresh_token", null);
  const [lastSyncedAt, setLastSyncedAt] = useLocalStorage("et_last_synced", null);
  const [pendingSync, setPendingSync] = useLocalStorage("et_pending_sync", false);
  const [setupDone, setSetupDone] = useLocalStorage("et_setup_done", false);
  const [tourDone, setTourDone] = useLocalStorage("et_tour_done", false);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");
  const [selCat, setSelCat] = useState("");
  const [selPay, setSelPay] = useState("");
  const [date, setDate] = useState(today());
  const [deleteId, setDeleteId] = useState(null);
  const [editExpense, setEditExpense] = useState(null);
  const [showNewCat, setShowNewCat] = useState(false);
  const [showNewPay, setShowNewPay] = useState(false);
  const [editCat, setEditCat] = useState(null);
  const [editPay, setEditPay] = useState(null);
  const [newItemLabel, setNewItemLabel] = useState("");
  const [newItemColor, setNewItemColor] = useState("#007AFF");
  const [showBudgetEdit, setShowBudgetEdit] = useState(false);
  const [editBudget, setEditBudget] = useState("");
  const [toast, setToast] = useState(null);
  const [deleteConfirmCat, setDeleteConfirmCat] = useState(null);
  const [deleteConfirmPay, setDeleteConfirmPay] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [dragType, setDragType] = useState(null);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showTour, setShowTour] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState("month");
  const [exportMonth, setExportMonth] = useState(currentMonth());
  const [exportStart, setExportStart] = useState("");
  const [exportEnd, setExportEnd] = useState("");
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [editRecurring, setEditRecurring] = useState(null);
  const [renewalPrompt, setRenewalPrompt] = useState(null);
  const [recurringForm, setRecurringForm] = useState({ name:"", amount:"", category:"", paymentSource:"", frequency:"Monthly", customDays:"", startDate:today(), endDate:"", reminderDays:"7", active:true });
  const importRef = useRef(null);
  const touchDragIdx = useRef(null);
  const tokenClientRef = useRef(null);
  const syncTimeoutRef = useRef(null);
  const tokenRefreshIntervalRef = useRef(null);

  // Online/offline
  useEffect(() => {
    const onOnline = () => { setIsOnline(true); if (pendingSync && googleToken) triggerDriveSync(); };
    const onOffline = () => { setIsOnline(false); setSyncStatus("offline"); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, [pendingSync, googleToken]);

  // Load Google Identity Services
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = initGoogleAuth;
    document.head.appendChild(script);
    // Check for auth code in URL (redirect back from Google)
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      window.history.replaceState({}, document.title, window.location.pathname);
      exchangeCodeForTokens(code);
    } else if (refreshToken && !googleToken) {
      // Have refresh token but no access token — silently refresh
      silentRefresh();
    }
  }, []);

  // On token load, pull from Drive
  useEffect(() => { if (googleToken && isOnline) loadFromDrive(googleToken); }, [googleToken]);

  // Auto refresh token 5 min before expiry
  useEffect(() => {
    if (!googleToken || !refreshToken) return;
    const timer = setTimeout(() => silentRefresh(), 55 * 60 * 1000); // refresh after 55 min
    return () => clearTimeout(timer);
  }, [googleToken, refreshToken]);

  const initGoogleAuth = () => {};

  const handleGoogleLogin = () => {
    // Redirect to Google OAuth with code flow
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: GOOGLE_SCOPE,
      access_type: "offline",
      prompt: "consent",
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  };

  const exchangeCodeForTokens = async (code) => {
    try {
      const res = await fetch(AUTH_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "exchange", code }),
      });
      const data = await res.json();
      if (data.access_token) {
        setGoogleToken(data.access_token);
        if (data.refresh_token) setRefreshToken(data.refresh_token);
        await fetchGoogleUser(data.access_token);
      }
    } catch (e) { console.error("Token exchange failed", e); }
  };

  const silentRefresh = async () => {
    if (!refreshToken) return;
    try {
      const res = await fetch(AUTH_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh", refresh_token: refreshToken }),
      });
      const data = await res.json();
      if (data.access_token) {
        setGoogleToken(data.access_token);
        setSyncStatus("synced");
      } else {
        // Refresh token invalid — need to re-login
        setRefreshToken(null); setGoogleToken(null);
      }
    } catch (e) { console.error("Silent refresh failed", e); }
  };

  // Check recurring expenses on load
  useEffect(() => { if (setupDone) processRecurringExpenses(); }, [setupDone]);

  const fetchGoogleUser = async (token) => {
    try {
      const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setGoogleUser({ name: data.given_name || data.name, email: data.email, picture: data.picture });
    } catch {}
  };

  const handleGoogleLogout = () => {
    setGoogleToken(null); setGoogleUser(null); setDriveFileId(null);
    setRefreshToken(null); setSyncStatus("idle");
    showToast("Signed out");
  };

  const findDriveFile = async (token) => {
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${DRIVE_FILE_NAME}' and trashed=false&spaces=drive&fields=files(id)`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return null;
      const data = await res.json();
      return data.files?.length > 0 ? data.files[0].id : null;
    } catch { return null; }
  };

  const loadFromDrive = async (token) => {
    if (!token || !isOnline) return;
    setSyncStatus("syncing");
    try {
      let fileId = driveFileId || await findDriveFile(token);
      if (fileId) setDriveFileId(fileId);
      if (!fileId) { setSyncStatus("synced"); return; }
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { if (res.status === 401) setGoogleToken(null); if (res.status === 404) setDriveFileId(null); setSyncStatus("error"); return; }
      const driveData = await res.json();
      // Merge expenses — deduplicate by id
      const localIds = new Set(expenses.map(e => e.id));
      const merged = [...expenses, ...(driveData.expenses||[]).filter(e => !localIds.has(e.id))].sort((a,b) => b.id-a.id);
      setExpenses(merged);
      // Merge categories — keep local ones, add any from Drive that don't exist locally
      const localCatIds = new Set(categories.map(c => c.id));
      const driveCats = (driveData.categories||[]).filter(c => !localCatIds.has(c.id));
      const mergedCats = driveCats.length > 0 ? [...categories, ...driveCats] : categories;
      if (mergedCats.length > 0) setCategories(mergedCats);
      // Merge payment sources — keep local ones, add any from Drive that don't exist locally
      const localPayIds = new Set(paymentSources.map(p => p.id));
      const drivePays = (driveData.paymentSources||[]).filter(p => !localPayIds.has(p.id));
      const mergedPays = drivePays.length > 0 ? [...paymentSources, ...drivePays] : paymentSources;
      if (mergedPays.length > 0) setPaymentSources(mergedPays);
      if (driveData.totalBudget !== undefined) setTotalBudget(driveData.totalBudget);
      if (driveData.categoryMandatory !== undefined) setCategoryMandatory(driveData.categoryMandatory);
      if (driveData.recurringExpenses?.length) setRecurringExpenses(driveData.recurringExpenses);
      if (driveData.fontSize) setFontSize(driveData.fontSize);
      if (driveData.setupDone) setSetupDone(true);
      setLastSyncedAt(new Date().toISOString()); setPendingSync(false); setSyncStatus("synced");
      // Write merged data back to Drive
      await writeToDrive(token, merged, mergedCats, mergedPays, driveData.totalBudget||totalBudget, driveData.categoryMandatory??categoryMandatory, driveData.recurringExpenses||recurringExpenses, driveData.fontSize||fontSize, true, fileId);
    } catch { setSyncStatus("error"); }
  };

  const writeToDrive = useCallback(async (token, exp, cats, pays, budget, catMand, recur, fs, setupD, fileId) => {
    if (!token || !isOnline) { setPendingSync(true); return false; }
    const content = JSON.stringify({ expenses:exp, categories:cats, paymentSources:pays, totalBudget:budget, categoryMandatory:catMand, recurringExpenses:recur, fontSize:fs, setupDone:setupD, updatedAt:new Date().toISOString() });
    const boundary = "et_boundary_xyz";
    const meta = JSON.stringify({ name: DRIVE_FILE_NAME, mimeType: "application/json" });
    const body = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
    try {
      const url = fileId ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart` : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
      const res = await fetch(url, { method: fileId?"PATCH":"POST", headers: { Authorization:`Bearer ${token}`, "Content-Type":`multipart/related; boundary=${boundary}` }, body });
      if (res.ok) { const r = await res.json(); if (r.id && !fileId) setDriveFileId(r.id); setLastSyncedAt(new Date().toISOString()); setPendingSync(false); return true; }
      if (res.status === 401) { setGoogleToken(null); setPendingSync(true); }
      return false;
    } catch { setPendingSync(true); return false; }
  }, [isOnline]);

  const triggerDriveSync = useCallback((overrides = {}) => {
    if (!googleToken) return;
    if (!isOnline) { setPendingSync(true); setSyncStatus("offline"); return; }
    setSyncStatus("syncing");
    clearTimeout(syncTimeoutRef.current);
    const exp = overrides.expenses ?? expenses;
    const cats = overrides.categories ?? categories;
    const pays = overrides.paymentSources ?? paymentSources;
    const bgt = overrides.totalBudget ?? totalBudget;
    const catM = overrides.categoryMandatory ?? categoryMandatory;
    const recur = overrides.recurringExpenses ?? recurringExpenses;
    const sd = overrides.setupDone ?? setupDone;
    syncTimeoutRef.current = setTimeout(async () => {
      const ok = await writeToDrive(googleToken, exp, cats, pays, bgt, catM, recur, overrides.fontSize ?? fontSize, sd, driveFileId);
      setSyncStatus(ok ? "synced" : isOnline ? "error" : "offline");
    }, 1500);
  }, [googleToken, isOnline, expenses, categories, paymentSources, totalBudget, categoryMandatory, recurringExpenses, setupDone, driveFileId, writeToDrive]);

  const showToast = (msg, ok=true) => { setToast({msg,ok}); setTimeout(() => setToast(null), 2500); };
  const getCat = (id) => categories.find(c => c.id===id) || { label:id||"—", color:"#C7C7CC" };
  const getPay = (id) => paymentSources.find(p => p.id===id) || { label:id||"—", color:"#C7C7CC" };

  const handleSetupComplete = ({ categories: cats, paymentSources: pays, budget: bgt }) => {
    setCategories(cats); setPaymentSources(pays);
    if (bgt) setTotalBudget(bgt);
    if (cats.length > 0) setSelCat(cats[0].id);
    if (pays.length > 0) setSelPay(pays[0].id);
    setSetupDone(true); setShowTour(true);
    triggerDriveSync({ categories:cats, paymentSources:pays, totalBudget:bgt||totalBudget, setupDone:true });
  };

  const processRecurringExpenses = () => {
    if (!recurringExpenses.length) return;
    const todayStr = today();
    let newExpenses = [...expenses];
    let updated = false;
    let reminderToShow = null;
    recurringExpenses.forEach(r => {
      if (!r.active) return;
      const nextDate = getNextRecurringDate(r);
      if (nextDate && nextDate <= todayStr) {
        const alreadyAdded = expenses.some(e => e.recurringId === r.id && e.date === nextDate);
        if (!alreadyAdded) {
          newExpenses = [{ id: Date.now() + Math.random(), amount: parseFloat(r.amount), narration: r.name, category: r.category, paymentSource: r.paymentSource, date: nextDate, recurringId: r.id }, ...newExpenses];
          updated = true;
        }
      }
      if (r.endDate) {
        const daysLeft = Math.floor((new Date(r.endDate) - new Date()) / (1000*60*60*24));
        const remDays = parseInt(r.reminderDays) || 7;
        if (daysLeft >= 0 && daysLeft <= remDays && !reminderToShow) reminderToShow = { ...r, daysLeft };
      }
    });
    if (updated) { setExpenses(newExpenses); triggerDriveSync({ expenses: newExpenses }); }
    if (reminderToShow) setRenewalPrompt(reminderToShow);
  };

  const getNextRecurringDate = (r) => {
    const start = new Date(r.startDate + "T00:00:00");
    const todayD = new Date(today() + "T00:00:00");
    if (start > todayD) return null;
    if (r.frequency === "Daily") return today();
    if (r.frequency === "Weekly") {
      let d = new Date(start); while (d <= todayD) { const next = new Date(d); next.setDate(next.getDate()+7); if (next > todayD) break; d = next; }
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    }
    if (r.frequency === "Monthly") {
      let d = new Date(start);
      while (true) { const next = new Date(d); next.setMonth(next.getMonth()+1); if (next > todayD) break; d = next; }
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    }
    if (r.frequency === "Quarterly") {
      let d = new Date(start);
      while (true) { const next = new Date(d); next.setMonth(next.getMonth()+3); if (next > todayD) break; d = next; }
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    }
    if (r.frequency === "Yearly") {
      let d = new Date(start);
      while (true) { const next = new Date(d); next.setFullYear(next.getFullYear()+1); if (next > todayD) break; d = next; }
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    }
    if (r.frequency === "Custom" && r.customDays) {
      const days = parseInt(r.customDays);
      let d = new Date(start);
      while (true) { const next = new Date(d); next.setDate(next.getDate()+days); if (next > todayD) break; d = next; }
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    }
    return null;
  };

  const handleRenewal = (action) => {
    if (!renewalPrompt) return;
    if (action === "renew") {
      const r = renewalPrompt;
      const oldEnd = new Date(r.endDate + "T00:00:00");
      let newEnd = new Date(oldEnd);
      if (r.frequency === "Monthly") newEnd.setMonth(newEnd.getMonth()+1);
      else if (r.frequency === "Yearly") newEnd.setFullYear(newEnd.getFullYear()+1);
      else if (r.frequency === "Quarterly") newEnd.setMonth(newEnd.getMonth()+3);
      else if (r.frequency === "Weekly") newEnd.setDate(newEnd.getDate()+7);
      else if (r.frequency === "Custom" && r.customDays) newEnd.setDate(newEnd.getDate()+parseInt(r.customDays));
      const newEndStr = `${newEnd.getFullYear()}-${String(newEnd.getMonth()+1).padStart(2,"0")}-${String(newEnd.getDate()).padStart(2,"0")}`;
      const updated = recurringExpenses.map(x => x.id === r.id ? { ...x, endDate: newEndStr } : x);
      setRecurringExpenses(updated); triggerDriveSync({ recurringExpenses: updated }); showToast("Renewed ✓");
    } else if (action === "cancel") {
      const updated = recurringExpenses.map(x => x.id === renewalPrompt.id ? { ...x, active: false } : x);
      setRecurringExpenses(updated); triggerDriveSync({ recurringExpenses: updated }); showToast("Recurring cancelled", false);
    }
    setRenewalPrompt(null);
  };

  const handleAdd = () => {
    if (!amount || isNaN(+amount) || +amount <= 0) return showToast("Enter a valid amount", false);
    if (!narration.trim()) return showToast("Add a narration", false);
    if (categoryMandatory && !selCat) return showToast("Select a category", false);
    const newExp = [{ id:Date.now(), amount:parseFloat(amount), narration:narration.trim(), category:selCat||"", paymentSource:selPay||"", date }, ...expenses];
    setExpenses(newExp); setAmount(""); setNarration("");
    showToast("Expense added!");
    triggerDriveSync({ expenses: newExp });
  };

  const handleSaveEdit = () => {
    if (!editExpense.amount || isNaN(+editExpense.amount) || +editExpense.amount <= 0) return showToast("Enter a valid amount", false);
    if (!editExpense.narration.trim()) return showToast("Add a narration", false);
    const newExp = expenses.map(e => e.id===editExpense.id ? { ...editExpense, amount:parseFloat(editExpense.amount) } : e);
    setExpenses(newExp); setEditExpense(null); showToast("Updated!");
    triggerDriveSync({ expenses: newExp });
  };

  const handleSaveRecurring = () => {
    if (!recurringForm.name.trim()) return showToast("Enter a name", false);
    if (!recurringForm.amount || isNaN(+recurringForm.amount) || +recurringForm.amount <= 0) return showToast("Enter a valid amount", false);
    const item = { ...recurringForm, id: editRecurring?.id || Date.now(), amount: parseFloat(recurringForm.amount) };
    const updated = editRecurring ? recurringExpenses.map(r => r.id===editRecurring.id ? item : r) : [...recurringExpenses, item];
    setRecurringExpenses(updated); setShowRecurringForm(false); setEditRecurring(null);
    setRecurringForm({ name:"", amount:"", category:"", paymentSource:"", frequency:"Monthly", customDays:"", startDate:today(), endDate:"", reminderDays:"7", active:true });
    showToast(editRecurring ? "Updated!" : "Recurring added!"); triggerDriveSync({ recurringExpenses: updated });
  };

  const handleExportCSV = () => {
    let filtered = [];
    const [y, m] = exportMonth.split("-").map(Number);
    if (exportType === "month") filtered = expenses.filter(e => monthKey(e.date) === exportMonth);
    else if (exportType === "fy") {
      const fyStart = m >= 4 ? `${y}-04-01` : `${y-1}-04-01`;
      const fyEnd = m >= 4 ? `${y+1}-03-31` : `${y}-03-31`;
      filtered = expenses.filter(e => e.date >= fyStart && e.date <= fyEnd);
    } else if (exportType === "custom") {
      if (!exportStart || !exportEnd) return showToast("Select date range", false);
      filtered = expenses.filter(e => e.date >= exportStart && e.date <= exportEnd);
    } else filtered = [...expenses];
    filtered.sort((a,b) => a.date.localeCompare(b.date));
    const rows = [["Date","Amount","Narration","Category","Payment Source"], ...filtered.map(e => [e.date, e.amount, `"${e.narration.replace(/"/g,'""')}"`, getCat(e.category).label, getPay(e.paymentSource).label])];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type:"text/csv" }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`expenses-${exportType}-${today()}.csv`; a.click(); URL.revokeObjectURL(url);
    setShowExportModal(false); showToast("CSV exported!");
  };

  const handleExportJSON = () => {
    const data = { expenses, categories, paymentSources, totalBudget, recurringExpenses, exportedAt:new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data,null,2)], { type:"application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href=url; a.download=`expenses-backup-${today()}.json`; a.click(); URL.revokeObjectURL(url);
    showToast("Backup exported!");
  };

  const handleImport = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.expenses) setExpenses(data.expenses);
        if (data.categories) setCategories(data.categories);
        if (data.paymentSources) setPaymentSources(data.paymentSources);
        if (data.totalBudget !== undefined) setTotalBudget(data.totalBudget);
        if (data.recurringExpenses) setRecurringExpenses(data.recurringExpenses);
        showToast("Imported!"); triggerDriveSync();
      } catch { showToast("Invalid file", false); }
    };
    reader.readAsText(file); e.target.value="";
  };

  const handleDragStart = (i, type) => { setDragIdx(i); setDragType(type); };
  const handleDragOver = (e, i) => { e.preventDefault(); setDragOverIdx(i); };
  const handleDrop = (i, type) => {
    if (dragIdx===null||dragIdx===i||dragType!==type) { setDragIdx(null); setDragOverIdx(null); return; }
    if (type==="cat") { const u=[...categories]; const [m]=u.splice(dragIdx,1); u.splice(i,0,m); setCategories(u); triggerDriveSync({categories:u}); }
    else { const u=[...paymentSources]; const [m]=u.splice(dragIdx,1); u.splice(i,0,m); setPaymentSources(u); triggerDriveSync({paymentSources:u}); }
    setDragIdx(null); setDragOverIdx(null); setDragType(null);
  };
  const handleTouchStart = (e, i, type) => {
    // Only initiate drag after a long press (300ms) on the handle
    const timer = setTimeout(() => {
      touchDragIdx.current = i;
      setDragIdx(i);
      setDragType(type);
    }, 300);
    e.currentTarget._dragTimer = timer;
  };
  const handleTouchCancel = (e) => {
    clearTimeout(e.currentTarget._dragTimer);
  };
  const handleTouchMove = (e) => { e.preventDefault(); const t=e.touches[0]; const el=document.elementFromPoint(t.clientX,t.clientY); const row=el?.closest("[data-drag-idx]"); if (row) { const idx=parseInt(row.getAttribute("data-drag-idx")); if (!isNaN(idx)) setDragOverIdx(idx); } };
  const handleTouchEnd = (type) => {
    if (touchDragIdx.current!==null&&dragOverIdx!==null&&touchDragIdx.current!==dragOverIdx) {
      if (type==="cat") { const u=[...categories]; const [m]=u.splice(touchDragIdx.current,1); u.splice(dragOverIdx,0,m); setCategories(u); triggerDriveSync({categories:u}); }
      else { const u=[...paymentSources]; const [m]=u.splice(touchDragIdx.current,1); u.splice(dragOverIdx,0,m); setPaymentSources(u); triggerDriveSync({paymentSources:u}); }
    }
    touchDragIdx.current=null; setDragIdx(null); setDragOverIdx(null); setDragType(null);
  };

  const buildEmailReport = (month) => {
    const [y,m] = month.split("-").map(Number);
    const monthName = `${MONTHS[m-1]} ${y}`;
    const mExp = expenses.filter(e => monthKey(e.date)===month);
    const spent = mExp.reduce((s,e) => s+e.amount, 0);
    const bgt = parseFloat(totalBudget)||0;
    const prevDate = new Date(y,m-2); const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,"0")}`;
    const prevSpent = expenses.filter(e => monthKey(e.date)===prevMonth).reduce((s,e) => s+e.amount, 0);
    const catTotals={}, catCounts={};
    mExp.forEach(e => { catTotals[e.category]=(catTotals[e.category]||0)+e.amount; catCounts[e.category]=(catCounts[e.category]||0)+1; });
    const dayTotals={}; mExp.forEach(e => { dayTotals[e.date]=(dayTotals[e.date]||0)+e.amount; });
    const highestDay=[...Object.entries(dayTotals)].sort((a,b)=>b[1]-a[1])[0];
    const daysActive=Object.keys(dayTotals).length; const daysInMonth=new Date(y,m,0).getDate();
    const top3=[...mExp].sort((a,b)=>b.amount-a.amount).slice(0,3);
    let body = `Hi ${googleUser?.name?.split(" ")[0]||"there"},\n\nYour expense report for ${monthName}.\n\n`;
    body += `━━━ OVERVIEW ━━━\n`;
    body += `Total Spent: ${fmt(spent)}\n`;
    if (bgt>0) body += `Budget: ${fmt(bgt)} | Used: ${Math.round((spent/bgt)*100)}% | ${spent>bgt?`Over by ${fmt(spent-bgt)}`:`Remaining: ${fmt(bgt-spent)}`}\n`;
    body += `Transactions: ${mExp.length} | Active Days: ${daysActive}/${daysInMonth} | Daily Avg: ${fmt(spent/Math.max(daysActive,1))}\n`;
    if (prevSpent>0) body += `vs Last Month: ${spent>prevSpent?"+":""}${((spent-prevSpent)/prevSpent*100).toFixed(1)}%\n`;
    body += `\n━━━ BY CATEGORY ━━━\n`;
    Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).forEach(([cid,amt]) => { const c=getCat(cid); const pct=spent>0?Math.round((amt/spent)*100):0; body+=`${c.label}: ${fmt(amt)} (${pct}%, ${catCounts[cid]} txns)\n`; });
    body += `\n━━━ TOP 3 EXPENSES ━━━\n`;
    top3.forEach((e,i) => { body+=`${i+1}. ${e.narration} — ${fmt(e.amount)} | ${getCat(e.category).label} | ${e.date}\n`; });
    if (highestDay) body += `\nHighest Day: ${highestDay[0]} — ${fmt(highestDay[1])}\n`;
    body += `\nData synced to Google Drive.\n— Expense Tracker`;
    return { subject:`Expense Tracker — ${monthName} Report`, body };
  };

  const handleEmailReport = (month) => {
    const { subject, body } = buildEmailReport(month);
    const email = googleUser?.email || "";
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const syncStatusInfo = () => {
    if (!googleToken) return null;
    if (syncStatus==="syncing") return { color:"#FF9500", text:"Syncing..." };
    if (syncStatus==="synced") return { color:"#34C759", text: lastSyncedAt ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}` : "Synced" };
    if (syncStatus==="offline"||!isOnline) return { color:"#FF9500", text:"Offline" };
    if (syncStatus==="error") return { color:"#FF3B30", text:"Sync error — tap to retry" };
    return { color:"#8E8E93", text:"Connected" };
  };

  const monthExpenses = useMemo(() => expenses.filter(e => monthKey(e.date)===selectedMonth), [expenses, selectedMonth]);
  const totalSpent = useMemo(() => monthExpenses.reduce((s,e) => s+e.amount, 0), [monthExpenses]);
  const budget = parseFloat(totalBudget)||0;
  const budgetPct = budget>0 ? Math.min((totalSpent/budget)*100,100) : 0;
  const overBudget = budget>0 && totalSpent>budget;
  const nearBudget = budget>0 && !overBudget && budgetPct>=80;
  const catTotals = useMemo(() => { const t={}; monthExpenses.forEach(e => { t[e.category]=(t[e.category]||0)+e.amount; }); return t; }, [monthExpenses]);
  const catCounts = useMemo(() => { const t={}; monthExpenses.forEach(e => { t[e.category]=(t[e.category]||0)+1; }); return t; }, [monthExpenses]);
  const yearExpenses = useMemo(() => { const yr=selectedMonth.slice(0,4); return expenses.filter(e => e.date.startsWith(yr)); }, [expenses, selectedMonth]);
  const yearlyByMonth = useMemo(() => { const map={}; yearExpenses.forEach(e => { const mk=monthKey(e.date); map[mk]=(map[mk]||0)+e.amount; }); return map; }, [yearExpenses]);

  const insightsData = useMemo(() => {
    if (monthExpenses.length===0) return null;
    const [y,m] = selectedMonth.split("-").map(Number);
    const prevDate = new Date(y,m-2); const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,"0")}`;
    const prevSpent = expenses.filter(e => monthKey(e.date)===prevMonth).reduce((s,e) => s+e.amount, 0);
    const dayTotals={}; monthExpenses.forEach(e => { dayTotals[e.date]=(dayTotals[e.date]||0)+e.amount; });
    const dayEntries=Object.entries(dayTotals); const highestDay=[...dayEntries].sort((a,b)=>b[1]-a[1])[0];
    const daysActive=dayEntries.length; const daysInMonth=new Date(y,m,0).getDate(); const dailyAvg=daysActive>0?totalSpent/daysActive:0;
    const weekdayTotals=Array(7).fill(0), weekdayCounts=Array(7).fill(0);
    monthExpenses.forEach(e => { const d=new Date(e.date+"T00:00:00").getDay(); weekdayTotals[d]+=e.amount; weekdayCounts[d]++; });
    const weekdayAvgs=weekdayTotals.map((t,i)=>weekdayCounts[i]>0?t/weekdayCounts[i]:0); const topWeekday=weekdayAvgs.indexOf(Math.max(...weekdayAvgs));
    const weekendSpend=weekdayTotals[0]+weekdayTotals[6]; const weekdaySpend=weekdayTotals.slice(1,6).reduce((a,b)=>a+b,0);
    const allDates=new Set(monthExpenses.map(e=>e.date)); let maxStreak=0,curStreak=0;
    for (let d=1;d<=daysInMonth;d++) { const dk=`${selectedMonth}-${String(d).padStart(2,"0")}`; if (allDates.has(dk)){curStreak++;maxStreak=Math.max(maxStreak,curStreak);}else curStreak=0; }
    const top3=[...monthExpenses].sort((a,b)=>b.amount-a.amount).slice(0,3);
    const mid=Math.floor(daysInMonth/2);
    const firstHalf=monthExpenses.filter(e=>parseInt(e.date.split("-")[2])<=mid).reduce((s,e)=>s+e.amount,0);
    const secondHalf=monthExpenses.filter(e=>parseInt(e.date.split("-")[2])>mid).reduce((s,e)=>s+e.amount,0);
    return {prevSpent,highestDay,daysActive,daysInMonth,dailyAvg,noSpendDays:daysInMonth-daysActive,topWeekday,weekendSpend,weekdaySpend,weekdayTotals,maxStreak,top3,firstHalf,secondHalf};
  }, [monthExpenses, selectedMonth, totalSpent, expenses]);

  const si = syncStatusInfo();
  const TABS = [{id:"add",label:"Add",icon:"＋"},{id:"history",label:"History",icon:"≡"},{id:"summary",label:"Summary",icon:"◑"},{id:"settings",label:"Settings",icon:"⚙"}];

  if (!googleToken) {
    return (
      <div style={{ fontFamily:"-apple-system,'SF Pro Display','Helvetica Neue',sans-serif", background:"#F2F2F7", minHeight:"100vh", maxWidth:430, margin:"0 auto", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"40px 32px" }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize:48, marginBottom:20 }}>💰</div>
        <div style={{ fontSize:17, fontWeight:600, color:"#1C1C1E", marginBottom:8, textAlign:"center" }}>Expense Tracker</div>
        <div style={{ fontSize:14, color:"#8E8E93", textAlign:"center", marginBottom:36 }}>Sign in to continue</div>
        <button onClick={handleGoogleLogin} style={{ width:"100%", padding:"16px", borderRadius:14, border:"none", cursor:"pointer", background:"#fff", boxShadow:"0 2px 12px rgba(0,0,0,.1)", display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          <span style={{ fontSize:16, fontWeight:600, color:"#1C1C1E" }}>Continue with Google</span>
        </button>
      </div>
    );
  }

  // Show setup flow for new users
  if (!setupDone) return <SetupFlow googleUser={googleUser} onComplete={handleSetupComplete} />;

  const fontScale = fontSize === "small" ? 0.88 : fontSize === "large" ? 1.15 : 1;

  return (
    <div style={{ fontFamily:"-apple-system,'SF Pro Display','Helvetica Neue',sans-serif", background:"#F2F2F7", minHeight:"100vh", maxWidth:430, margin:"0 auto", position:"relative", zoom: fontScale }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        button,input,select{font-family:inherit}
        ::-webkit-scrollbar{display:none}
        .cat-chip{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:20px;border:none;cursor:pointer;font-size:13px;font-weight:500;white-space:nowrap;transition:all .15s}
        .card{background:#fff;border-radius:16px;overflow:hidden}
        .input-field{background:none;border:none;outline:none;font-size:15px;width:100%;color:#1C1C1E}
        .nav-btn{display:flex;flex-direction:column;align-items:center;gap:2px;background:none;border:none;cursor:pointer;flex:1;padding:6px 0 4px}
        .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:flex-end;justify-content:center}
        .modal-sheet{background:#F2F2F7;border-radius:20px 20px 0 0;width:100%;max-width:430px;padding:24px 20px 40px;max-height:90vh;overflow-y:auto}
        .sheet-handle{width:36px;height:4px;background:#C7C7CC;border-radius:99px;margin:0 auto 20px}
        .ios-input{background:#fff;border-radius:12px;padding:14px 16px;font-size:16px;width:100%;border:none;outline:none;color:#1C1C1E}
        .pill-btn{padding:10px 20px;border-radius:12px;border:none;cursor:pointer;font-size:15px;font-weight:600}
        .drag-row.over{background:#EBF5FF;border-radius:12px}
        .stat-card{background:#fff;border-radius:14px;padding:14px 16px;flex:1}
        .alert-banner{padding:12px 16px;border-radius:12px;font-size:14px;font-weight:500;margin-bottom:12px;display:flex;align-items:center;gap:8px}
        .ios-select{background:#fff;border-radius:12px;padding:14px 16px;font-size:16px;width:100%;border:none;outline:none;color:#1C1C1E;appearance:none}
      `}</style>

      {/* TOUR */}
      {showTour && <TourOverlay onFinish={() => { setShowTour(false); setTourDone(true); }} onSkip={() => { setShowTour(false); setTourDone(true); }} />}

      {/* HEADER */}
      <div style={{ position:"sticky", top:0, zIndex:40, background:"rgba(242,242,247,.95)", backdropFilter:"blur(20px)", borderBottom:"1px solid #E5E5EA", padding:"12px 20px 10px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ fontSize:17, fontWeight:600, color:"#1C1C1E", letterSpacing:-0.3 }}>💰 Expense Tracker</div>
          {si && (
            <div style={{ display:"flex", alignItems:"center", gap:5, cursor:syncStatus==="error"?"pointer":"default" }} onClick={() => syncStatus==="error" && loadFromDrive(googleToken)}>
              <div style={{ width:7, height:7, borderRadius:"50%", background:si.color, flexShrink:0 }} />
              <span style={{ fontSize:11, color:si.color }}>{si.text}</span>
            </div>
          )}
        </div>
      </div>

      <div style={{ paddingBottom:80 }}>

        {/* ── ADD TAB ── */}
        {tab==="add" && (
          <div style={{ padding:"20px" }}>
            <h1 style={{ fontSize:34, fontWeight:700, marginBottom:20, letterSpacing:-0.5 }}>Add Expense</h1>
            {overBudget && <div className="alert-banner" style={{ background:"#FF3B3022", color:"#FF3B30" }}>🚨 You've exceeded your {fmt(budget)} budget by {fmt(totalSpent-budget)}</div>}
            {nearBudget && <div className="alert-banner" style={{ background:"#FF950022", color:"#FF9500" }}>⚠️ You've used {Math.round(budgetPct)}% of your {fmt(budget)} budget</div>}
            <div className="card" style={{ padding:"16px 20px", marginBottom:12 }}>
              <div style={{ fontSize:13, color:"#8E8E93", marginBottom:10 }}>₹ Amount</div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:32, color:amount?"#1C1C1E":"#C7C7CC", fontWeight:300 }}>₹</span>
                <input className="input-field" style={{ fontSize:36, fontWeight:300, color:amount?"#1C1C1E":"#C7C7CC" }} type="number" min="0" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
            </div>
            <div className="card" style={{ padding:"16px 20px", marginBottom:12 }}>
              <div style={{ fontSize:13, color:"#8E8E93", marginBottom:10 }}>📝 Narration</div>
              <input className="input-field" style={{ fontSize:16 }} placeholder="What was this for?" value={narration} onChange={e => setNarration(e.target.value)} onKeyDown={e => e.key==="Enter" && handleAdd()} />
            </div>
            <div className="card" style={{ padding:"16px 20px", marginBottom:12 }}>
              <div style={{ fontSize:13, color:"#8E8E93", marginBottom:12 }}>Category {categoryMandatory && <span style={{ color:"#FF3B30" }}>*</span>}</div>
              <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
                {categories.map(c => (
                  <button key={c.id} className="cat-chip" style={{ background:selCat===c.id?c.color:"#F2F2F7", color:selCat===c.id?"#fff":"#3C3C43", flexShrink:0 }} onClick={() => setSelCat(selCat===c.id?"":c.id)}>
                    <span style={{ width:8, height:8, borderRadius:"50%", background:selCat===c.id?"rgba(255,255,255,0.6)":c.color, flexShrink:0 }} />{c.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="card" style={{ padding:"16px 20px", marginBottom:12 }}>
              <div style={{ fontSize:13, color:"#8E8E93", marginBottom:12 }}>💳 Payment Source <span style={{ color:"#C7C7CC", fontSize:12 }}>(optional)</span></div>
              <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
                {paymentSources.map(p => (
                  <button key={p.id} className="cat-chip" style={{ background:selPay===p.id?p.color:"#F2F2F7", color:selPay===p.id?"#fff":"#3C3C43", flexShrink:0 }} onClick={() => setSelPay(selPay===p.id?"":p.id)}>
                    <span style={{ width:8, height:8, borderRadius:"50%", background:selPay===p.id?"rgba(255,255,255,0.6)":p.color, flexShrink:0 }} />{p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="card" style={{ padding:"16px 20px", marginBottom:20 }}>
              <div style={{ fontSize:13, color:"#8E8E93", marginBottom:10 }}>📅 Date</div>
              <input className="input-field" type="date" value={date} style={{ fontSize:16 }} onChange={e => setDate(e.target.value)} />
            </div>
            <button onClick={handleAdd} style={{ width:"100%", padding:"18px", borderRadius:16, border:"none", cursor:"pointer", background:(amount&&narration&&(!categoryMandatory||selCat))?"#007AFF":"#C7C7CC", color:"#fff", fontSize:17, fontWeight:600, transition:"background .2s" }}>＋ Add Expense</button>
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {tab==="history" && (
          <div style={{ padding:"20px" }}>
            <h1 style={{ fontSize:34, fontWeight:700, marginBottom:20, letterSpacing:-0.5 }}>History</h1>
            <MonthNav value={selectedMonth} onChange={setSelectedMonth} />
            {monthExpenses.length===0 ? (
              <div style={{ textAlign:"center", padding:"80px 0" }}><div style={{ fontSize:48, marginBottom:12 }}>📭</div><div style={{ fontWeight:600, fontSize:17, color:"#8E8E93" }}>No transactions</div></div>
            ) : (
              <>
                <div className="card" style={{ marginBottom:12 }}>
                  {monthExpenses.map((e,i) => {
                    const c=getCat(e.category); const p=getPay(e.paymentSource);
                    return (
                      <div key={e.id} style={{ display:"flex", alignItems:"center", padding:"14px 16px", gap:12, borderBottom:i<monthExpenses.length-1?"1px solid #F2F2F7":"none", cursor:"pointer" }} onClick={() => setEditExpense({...e,amount:String(e.amount)})}>
                        <div style={{ width:10, height:10, borderRadius:"50%", background:c.color, flexShrink:0 }} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:500, fontSize:15, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{e.narration}</div>
                          <div style={{ fontSize:12, color:"#8E8E93", marginTop:2, display:"flex", gap:6, flexWrap:"wrap" }}>
                            {e.category && <span style={{ color:c.color }}>{c.label}</span>}
                            {e.paymentSource && <><span>·</span><span>{p.label}</span></>}
                            <span>·</span><span>{new Date(e.date+"T00:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</span>
                          </div>
                        </div>
                        <div style={{ textAlign:"right", flexShrink:0 }}>
                          <div style={{ fontWeight:600, fontSize:16 }}>{fmt(e.amount)}</div>
                          <div style={{ fontSize:12, color:"#007AFF", marginTop:3 }}>Edit</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="card" style={{ padding:"14px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ color:"#8E8E93", fontSize:15 }}>Total ({monthExpenses.length} items)</span>
                  <span style={{ fontWeight:700, fontSize:20 }}>{fmt(totalSpent)}</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── SUMMARY TAB ── */}
        {tab==="summary" && (
          <div style={{ padding:"20px" }}>
            <h1 style={{ fontSize:34, fontWeight:700, marginBottom:20, letterSpacing:-0.5 }}>Summary</h1>
            <MonthNav value={selectedMonth} onChange={setSelectedMonth} />
            <SubToggle value={summaryTab} onChange={setSummaryTab} options={[["monthly","Monthly"],["yearly","Yearly"],["insights","Insights"]]} />

            {summaryTab==="monthly" && (monthExpenses.length===0 ? (
              <div style={{ textAlign:"center", padding:"60px 0" }}><div style={{ fontSize:48, marginBottom:12 }}>📭</div><div style={{ fontWeight:600, fontSize:17, color:"#8E8E93" }}>No expenses yet</div></div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <div className="card" style={{ padding:16 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
                    <div><div style={{ fontSize:13, color:"#8E8E93" }}>Total Spent</div><div style={{ fontSize:26, fontWeight:700 }}>{fmt(totalSpent)}</div></div>
                    {budget>0 && <div style={{ textAlign:"right" }}><div style={{ fontSize:13, color:"#8E8E93" }}>Budget</div><div style={{ fontSize:26, fontWeight:700 }}>{fmt(budget)}</div></div>}
                  </div>
                  {budget>0 && (<><div style={{ height:8, background:"#F2F2F7", borderRadius:99, overflow:"hidden", marginBottom:8 }}><div style={{ height:"100%", width:`${budgetPct}%`, background:overBudget?"#FF3B30":nearBudget?"#FF9500":"#34C759", borderRadius:99, transition:"width .4s" }} /></div><div style={{ fontSize:13, color:overBudget?"#FF3B30":nearBudget?"#FF9500":"#8E8E93", textAlign:"right" }}>{overBudget?`⚠ Over by ${fmt(totalSpent-budget)}`:nearBudget?`⚠ ${Math.round(budgetPct)}% used — ${fmt(budget-totalSpent)} left`:`${fmt(Math.max(budget-totalSpent,0))} remaining`}</div></>)}
                  {!budget && <button onClick={() => { setEditBudget(totalBudget); setShowBudgetEdit(true); }} style={{ marginTop:4, background:"none", border:"none", cursor:"pointer", color:"#007AFF", fontSize:14, padding:0 }}>+ Set monthly budget</button>}
                </div>
                <div className="card" style={{ padding:16 }}>
                  <div style={{ fontWeight:600, fontSize:16, marginBottom:14 }}>By Category</div>
                  {Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).map(([cid,spent]) => {
                    const c=getCat(cid); const pct=totalSpent>0?(spent/totalSpent)*100:0; const count=catCounts[cid]||0;
                    return (<div key={cid} style={{ marginBottom:14 }}><div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}><span style={{ width:10, height:10, borderRadius:"50%", background:c.color, flexShrink:0 }} /><span style={{ flex:1, fontSize:14, fontWeight:500 }}>{c.label}</span><span style={{ fontSize:12, color:"#8E8E93" }}>({count})</span><span style={{ fontSize:12, color:"#8E8E93", marginLeft:4 }}>{Math.round(pct)}%</span><span style={{ fontSize:14, fontWeight:600, marginLeft:6 }}>{fmt(spent)}</span></div><div style={{ height:5, background:"#F2F2F7", borderRadius:99, overflow:"hidden" }}><div style={{ height:"100%", width:`${pct}%`, background:c.color, borderRadius:99 }} /></div></div>);
                  })}
                </div>
              </div>
            ))}

            {summaryTab==="yearly" && (
              <div className="card" style={{ padding:16 }}>
                <div style={{ fontWeight:600, fontSize:16, marginBottom:14 }}>Monthly Spending — {selectedMonth.slice(0,4)}</div>
                {Array.from({length:12},(_,i) => {
                  const mk=`${selectedMonth.slice(0,4)}-${String(i+1).padStart(2,"0")}`;
                  const amt=yearlyByMonth[mk]||0; const maxAmt=Math.max(...Object.values(yearlyByMonth),1);
                  return (<div key={mk} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}><span style={{ fontSize:12, color:"#8E8E93", width:28, flexShrink:0 }}>{MONTHS[i].slice(0,3)}</span><div style={{ flex:1, height:6, background:"#F2F2F7", borderRadius:99, overflow:"hidden" }}><div style={{ height:"100%", width:`${(amt/maxAmt)*100}%`, background:"#007AFF", borderRadius:99 }} /></div><span style={{ fontSize:13, fontWeight:500, width:72, textAlign:"right", color:amt?"#1C1C1E":"#C7C7CC" }}>{amt?fmtShort(amt):"—"}</span></div>);
                })}
              </div>
            )}

            {summaryTab==="insights" && (!insightsData ? (
              <div style={{ textAlign:"center", padding:"60px 0" }}><div style={{ fontSize:48, marginBottom:12 }}>📭</div><div style={{ fontWeight:600, fontSize:17, color:"#8E8E93" }}>No data for this month</div></div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <div className="stat-card"><div style={{ fontSize:11, color:"#8E8E93", marginBottom:4 }}>DAILY AVERAGE</div><div style={{ fontSize:20, fontWeight:700 }}>{fmtShort(insightsData.dailyAvg)}</div><div style={{ fontSize:11, color:"#8E8E93", marginTop:2 }}>on active days</div></div>
                  <div className="stat-card"><div style={{ fontSize:11, color:"#8E8E93", marginBottom:4 }}>ACTIVE DAYS</div><div style={{ fontSize:20, fontWeight:700 }}>{insightsData.daysActive}/{insightsData.daysInMonth}</div><div style={{ fontSize:11, color:"#8E8E93", marginTop:2 }}>{insightsData.noSpendDays} no-spend days</div></div>
                  <div className="stat-card"><div style={{ fontSize:11, color:"#8E8E93", marginBottom:4 }}>LONGEST STREAK</div><div style={{ fontSize:20, fontWeight:700 }}>{insightsData.maxStreak} days</div><div style={{ fontSize:11, color:"#8E8E93", marginTop:2 }}>consecutive</div></div>
                  <div className="stat-card"><div style={{ fontSize:11, color:"#8E8E93", marginBottom:4 }}>VS LAST MONTH</div><div style={{ fontSize:20, fontWeight:700, color:insightsData.prevSpent===0?"#1C1C1E":totalSpent>insightsData.prevSpent?"#FF3B30":"#34C759" }}>{insightsData.prevSpent===0?"—":`${totalSpent>insightsData.prevSpent?"+":""}${((totalSpent-insightsData.prevSpent)/insightsData.prevSpent*100).toFixed(0)}%`}</div><div style={{ fontSize:11, color:"#8E8E93", marginTop:2 }}>{insightsData.prevSpent>0?fmtShort(insightsData.prevSpent)+" last month":"no prev data"}</div></div>
                </div>
                {insightsData.highestDay && (<div className="card" style={{ padding:16 }}><div style={{ fontSize:13, color:"#8E8E93", marginBottom:8 }}>HIGHEST SPEND DAY</div><div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}><div style={{ fontWeight:600, fontSize:16 }}>{new Date(insightsData.highestDay[0]+"T00:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"long"})}</div><div style={{ fontWeight:700, fontSize:18, color:"#FF3B30" }}>{fmt(insightsData.highestDay[1])}</div></div></div>)}
                <div className="card" style={{ padding:16 }}>
                  <div style={{ fontSize:13, color:"#8E8E93", marginBottom:12 }}>SPENDING BY DAY OF WEEK</div>
                  {DAYS.map((d,i) => { const amt=insightsData.weekdayTotals[i]; const maxDay=Math.max(...insightsData.weekdayTotals,1); const isTop=i===insightsData.topWeekday&&amt>0; return (<div key={d} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}><span style={{ fontSize:12, color:isTop?"#007AFF":"#8E8E93", width:28, fontWeight:isTop?600:400 }}>{d}</span><div style={{ flex:1, height:6, background:"#F2F2F7", borderRadius:99, overflow:"hidden" }}><div style={{ height:"100%", width:`${(amt/maxDay)*100}%`, background:isTop?"#007AFF":"#C7C7CC", borderRadius:99 }} /></div><span style={{ fontSize:12, fontWeight:isTop?600:400, color:isTop?"#007AFF":amt?"#1C1C1E":"#C7C7CC", width:66, textAlign:"right" }}>{amt?fmtShort(amt):"—"}</span></div>); })}
                  <div style={{ display:"flex", gap:10, marginTop:12, paddingTop:12, borderTop:"1px solid #F2F2F7" }}>
                    <div style={{ flex:1, textAlign:"center" }}><div style={{ fontSize:11, color:"#8E8E93" }}>WEEKDAYS</div><div style={{ fontWeight:600, fontSize:15, marginTop:2 }}>{fmtShort(insightsData.weekdaySpend)}</div></div>
                    <div style={{ width:1, background:"#F2F2F7" }} />
                    <div style={{ flex:1, textAlign:"center" }}><div style={{ fontSize:11, color:"#8E8E93" }}>WEEKENDS</div><div style={{ fontWeight:600, fontSize:15, marginTop:2 }}>{fmtShort(insightsData.weekendSpend)}</div></div>
                  </div>
                </div>
                <div className="card" style={{ padding:16 }}>
                  <div style={{ fontSize:13, color:"#8E8E93", marginBottom:12 }}>SPENDING TREND</div>
                  <div style={{ display:"flex", gap:10 }}>
                    <div style={{ flex:1, textAlign:"center" }}><div style={{ fontSize:11, color:"#8E8E93" }}>1ST HALF</div><div style={{ fontWeight:700, fontSize:18, marginTop:4 }}>{fmtShort(insightsData.firstHalf)}</div></div>
                    <div style={{ display:"flex", alignItems:"center", fontSize:20 }}>{insightsData.secondHalf>insightsData.firstHalf?"📈":"📉"}</div>
                    <div style={{ flex:1, textAlign:"center" }}><div style={{ fontSize:11, color:"#8E8E93" }}>2ND HALF</div><div style={{ fontWeight:700, fontSize:18, marginTop:4, color:insightsData.secondHalf>insightsData.firstHalf?"#FF3B30":"#34C759" }}>{fmtShort(insightsData.secondHalf)}</div></div>
                  </div>
                  <div style={{ fontSize:12, color:"#8E8E93", textAlign:"center", marginTop:10 }}>{insightsData.secondHalf>insightsData.firstHalf?"You spend more in the second half":"You spend more in the first half"}</div>
                </div>
                <div className="card" style={{ padding:16 }}>
                  <div style={{ fontSize:13, color:"#8E8E93", marginBottom:12 }}>TOP 3 SINGLE EXPENSES</div>
                  {insightsData.top3.map((e,i) => { const c=getCat(e.category); return (<div key={e.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"8px 0", borderBottom:i<2?"1px solid #F2F2F7":"none" }}><div style={{ width:24, height:24, borderRadius:"50%", background:"#F2F2F7", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"#8E8E93", flexShrink:0 }}>{i+1}</div><div style={{ flex:1, minWidth:0 }}><div style={{ fontWeight:500, fontSize:14, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{e.narration}</div><div style={{ fontSize:11, color:"#8E8E93", marginTop:2 }}>{c.label} · {e.date}</div></div><div style={{ fontWeight:700, fontSize:15, flexShrink:0 }}>{fmt(e.amount)}</div></div>); })}
                </div>
                <button onClick={() => handleEmailReport(selectedMonth)} style={{ width:"100%", padding:"14px", borderRadius:12, border:"none", cursor:"pointer", background:"#007AFF", color:"#fff", fontSize:15, fontWeight:600 }}>📧 Email Full Report</button>
              </div>
            ))}
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {tab==="settings" && (
          <div style={{ padding:"20px" }}>
            <h1 style={{ fontSize:34, fontWeight:700, marginBottom:20, letterSpacing:-0.5 }}>Settings</h1>
            <SubToggle value={settingsTab} onChange={setSettingsTab} options={[["preferences","Preferences"],["recurring","Recurring"],["data","Data"]]} />

            {settingsTab==="preferences" && (
              <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
                {/* Google Account */}
                <div>
                  <div style={{ fontSize:13, color:"#8E8E93", marginBottom:6, paddingLeft:4, textTransform:"uppercase", letterSpacing:0.5 }}>Account</div>
                  <div className="card">
                    <div style={{ padding:16 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
                        {googleUser?.picture && <img src={googleUser.picture} style={{ width:36, height:36, borderRadius:"50%" }} alt="" />}
                        <div style={{ flex:1 }}><div style={{ fontWeight:600, fontSize:15 }}>{googleUser?.name}</div><div style={{ fontSize:12, color:"#8E8E93" }}>{googleUser?.email}</div></div>
                        <div style={{ width:8, height:8, borderRadius:"50%", background:si?.color||"#8E8E93" }} />
                      </div>
                      <div style={{ display:"flex", gap:10 }}>
                        <button onClick={() => loadFromDrive(googleToken)} style={{ flex:1, padding:"11px", borderRadius:10, border:"none", cursor:"pointer", background:"#007AFF22", color:"#007AFF", fontSize:14, fontWeight:600 }}>🔄 Sync Now</button>
                        <button onClick={handleGoogleLogout} style={{ padding:"11px 16px", borderRadius:10, border:"none", cursor:"pointer", background:"#FFE5E5", color:"#FF3B30", fontSize:14, fontWeight:600 }}>Sign Out</button>
                      </div>
                      {lastSyncedAt && <div style={{ fontSize:11, color:"#8E8E93", textAlign:"center", marginTop:10 }}>Last synced: {new Date(lastSyncedAt).toLocaleString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>}
                    </div>
                  </div>
                </div>

                {/* Budget */}
                <div>
                  <div style={{ fontSize:13, color:"#8E8E93", marginBottom:6, paddingLeft:4, textTransform:"uppercase", letterSpacing:0.5 }}>Budget</div>
                  <div className="card">
                    <div style={{ display:"flex", alignItems:"center", padding:"16px", justifyContent:"space-between" }}>
                      <div><div style={{ fontWeight:500, fontSize:16 }}>Monthly Budget</div><div style={{ fontSize:14, color:"#8E8E93", marginTop:2 }}>{totalBudget?fmt(parseFloat(totalBudget)):"Not set"}</div></div>
                      <button onClick={() => { setEditBudget(totalBudget); setShowBudgetEdit(true); }} style={{ background:"none", border:"none", cursor:"pointer", color:"#007AFF", fontSize:15, fontWeight:500 }}>Edit</button>
                    </div>
                  </div>
                </div>

                {/* Preferences */}
                <div>
                  <div style={{ fontSize:13, color:"#8E8E93", marginBottom:6, paddingLeft:4, textTransform:"uppercase", letterSpacing:0.5 }}>Preferences</div>
                  <div className="card">
                    <div style={{ display:"flex", alignItems:"center", padding:"16px", justifyContent:"space-between" }}>
                      <div><div style={{ fontWeight:500, fontSize:16 }}>Category Mandatory</div><div style={{ fontSize:13, color:"#8E8E93", marginTop:2 }}>Require category for every expense</div></div>
                      <div onClick={() => { setCategoryMandatory(!categoryMandatory); triggerDriveSync({categoryMandatory:!categoryMandatory}); }} style={{ width:51, height:31, borderRadius:99, background:categoryMandatory?"#34C759":"#E5E5EA", cursor:"pointer", position:"relative", transition:"background .2s", flexShrink:0 }}>
                        <div style={{ position:"absolute", top:2, left:categoryMandatory?22:2, width:27, height:27, borderRadius:"50%", background:"#fff", boxShadow:"0 2px 6px rgba(0,0,0,.15)", transition:"left .2s" }} />
                      </div>
                    </div>
                    <div style={{ height:1, background:"#F2F2F7", margin:"0 16px" }} />
                    <div style={{ display:"flex", alignItems:"center", padding:"16px", justifyContent:"space-between" }}>
                      <div><div style={{ fontWeight:500, fontSize:16 }}>Text Size</div><div style={{ fontSize:13, color:"#8E8E93", marginTop:2 }}>Adjust for readability</div></div>
                      <div style={{ display:"flex", gap:6 }}>
                        {[["small","A"],["medium","A"],["large","A"]].map(([size, label], i) => (
                          <button key={size} onClick={() => { setFontSize(size); triggerDriveSync({fontSize: size}); }} style={{ width:36, height:36, borderRadius:8, border:"none", cursor:"pointer", background: fontSize===size ? "#007AFF" : "#F2F2F7", color: fontSize===size ? "#fff" : "#636366", fontWeight:600, fontSize: i===0?12:i===1?15:19 }}>{label}</button>
                        ))}
                      </div>
                    </div>
                    <div style={{ height:1, background:"#F2F2F7", margin:"0 16px" }} />
                    <button onClick={() => setShowTour(true)} style={{ width:"100%", padding:"16px", background:"none", border:"none", cursor:"pointer", textAlign:"left", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div><div style={{ fontWeight:500, fontSize:16, color:"#1C1C1E" }}>Take the Tour</div><div style={{ fontSize:13, color:"#8E8E93", marginTop:2 }}>Replay the app walkthrough</div></div>
                      <span style={{ color:"#C7C7CC", fontSize:18 }}>›</span>
                    </button>
                  </div>
                </div>

                {/* Categories */}
                <div>
                  <div style={{ fontSize:13, color:"#8E8E93", marginBottom:6, paddingLeft:4, textTransform:"uppercase", letterSpacing:0.5 }}>Categories — hold ☰ to reorder</div>
                  <div className="card" style={{ marginBottom:10 }}>
                    {categories.map((c,i) => (
                      <div key={c.id} data-drag-idx={i} className={`drag-row${dragOverIdx===i&&dragType==="cat"?" over":""}`}
                        draggable onDragStart={() => handleDragStart(i,"cat")} onDragOver={e => handleDragOver(e,i)} onDrop={() => handleDrop(i,"cat")} onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                        style={{ display:"flex", alignItems:"center", padding:"12px 16px", gap:10, borderBottom:i<categories.length-1?"1px solid #F2F2F7":"none", opacity:dragIdx===i&&dragType==="cat"?0.4:1 }}>
                        <span style={{ fontSize:18, color:"#C7C7CC", cursor:"grab", padding:"4px", userSelect:"none", touchAction:"none" }} onTouchStart={e => handleTouchStart(e,i,"cat")} onTouchMove={handleTouchMove} onTouchEnd={() => handleTouchEnd("cat")}>☰</span>
                        <div style={{ width:14, height:14, borderRadius:"50%", background:c.color, flexShrink:0 }} />
                        <span style={{ flex:1, fontWeight:500, fontSize:15 }}>{c.label}</span>
                        <button onClick={() => { setEditCat(c); setNewItemLabel(c.label); setNewItemColor(c.color); }} style={{ background:"#E8F0FE", border:"none", cursor:"pointer", color:"#007AFF", fontSize:13, fontWeight:500, padding:"5px 12px", borderRadius:8, marginRight:6 }}>Edit</button>
                        <button onClick={() => setDeleteConfirmCat(c)} style={{ background:"#FFE5E5", border:"none", cursor:"pointer", color:"#FF3B30", fontSize:13, fontWeight:500, padding:"5px 12px", borderRadius:8 }}>Delete</button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => { setShowNewCat(true); setNewItemLabel(""); setNewItemColor("#007AFF"); }} style={{ width:"100%", padding:"14px", borderRadius:12, border:"1.5px dashed #C7C7CC", background:"none", cursor:"pointer", color:"#007AFF", fontSize:15, fontWeight:600 }}>+ Add Category</button>
                </div>

                {/* Payment Sources */}
                <div>
                  <div style={{ fontSize:13, color:"#8E8E93", marginBottom:6, paddingLeft:4, textTransform:"uppercase", letterSpacing:0.5 }}>Payment Sources — hold ☰ to reorder</div>
                  <div className="card" style={{ marginBottom:10 }}>
                    {paymentSources.map((p,i) => (
                      <div key={p.id} data-drag-idx={i} className={`drag-row${dragOverIdx===i&&dragType==="pay"?" over":""}`}
                        draggable onDragStart={() => handleDragStart(i,"pay")} onDragOver={e => handleDragOver(e,i)} onDrop={() => handleDrop(i,"pay")} onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                        style={{ display:"flex", alignItems:"center", padding:"12px 16px", gap:10, borderBottom:i<paymentSources.length-1?"1px solid #F2F2F7":"none", opacity:dragIdx===i&&dragType==="pay"?0.4:1 }}>
                        <span style={{ fontSize:18, color:"#C7C7CC", cursor:"grab", padding:"4px", userSelect:"none", touchAction:"none" }} onTouchStart={e => handleTouchStart(e,i,"pay")} onTouchMove={handleTouchMove} onTouchEnd={() => handleTouchEnd("pay")}>☰</span>
                        <div style={{ width:14, height:14, borderRadius:"50%", background:p.color, flexShrink:0 }} />
                        <span style={{ flex:1, fontWeight:500, fontSize:15 }}>{p.label}</span>
                        <button onClick={() => { setEditPay(p); setNewItemLabel(p.label); setNewItemColor(p.color); }} style={{ background:"#E8F0FE", border:"none", cursor:"pointer", color:"#007AFF", fontSize:13, fontWeight:500, padding:"5px 12px", borderRadius:8, marginRight:6 }}>Edit</button>
                        <button onClick={() => setDeleteConfirmPay(p)} style={{ background:"#FFE5E5", border:"none", cursor:"pointer", color:"#FF3B30", fontSize:13, fontWeight:500, padding:"5px 12px", borderRadius:8 }}>Delete</button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => { setShowNewPay(true); setNewItemLabel(""); setNewItemColor("#007AFF"); }} style={{ width:"100%", padding:"14px", borderRadius:12, border:"1.5px dashed #C7C7CC", background:"none", cursor:"pointer", color:"#007AFF", fontSize:15, fontWeight:600 }}>+ Add Payment Source</button>
                </div>
              </div>
            )}

            {settingsTab==="recurring" && (
              <div>
                {recurringExpenses.length===0 ? (
                  <div style={{ textAlign:"center", padding:"60px 0 40px" }}><div style={{ fontSize:48, marginBottom:12 }}>🔁</div><div style={{ fontWeight:600, fontSize:17, color:"#8E8E93", marginBottom:6 }}>No recurring expenses</div><div style={{ fontSize:14, color:"#C7C7CC" }}>Set up subscriptions and regular bills</div></div>
                ) : (
                  <div className="card" style={{ marginBottom:16 }}>
                    {recurringExpenses.map((r,i) => (
                      <div key={r.id} style={{ display:"flex", alignItems:"center", padding:"14px 16px", gap:12, borderBottom:i<recurringExpenses.length-1?"1px solid #F2F2F7":"none", cursor:"pointer", opacity:r.active?1:0.5 }} onClick={() => { setEditRecurring(r); setRecurringForm({...r,amount:String(r.amount)}); setShowRecurringForm(true); }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:500, fontSize:15 }}>{r.name}</div>
                          <div style={{ fontSize:12, color:"#8E8E93", marginTop:3 }}>{fmt(r.amount)} · {r.frequency}{r.frequency==="Custom"?` (every ${r.customDays} days)`:""} {r.endDate?`· ends ${r.endDate}`:""}</div>
                          {r.paymentSource && <div style={{ fontSize:12, color:getPay(r.paymentSource).color, marginTop:2 }}>{getPay(r.paymentSource).label}</div>}
                        </div>
                        <div style={{ textAlign:"right" }}>
                          <div style={{ fontSize:12, padding:"3px 10px", borderRadius:20, background:r.active?"#34C75922":"#F2F2F7", color:r.active?"#34C759":"#8E8E93", fontWeight:500 }}>{r.active?"Active":"Paused"}</div>
                          <div style={{ fontSize:12, color:"#007AFF", marginTop:4 }}>Edit</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => { setEditRecurring(null); setRecurringForm({name:"",amount:"",category:categories[0]?.id||"",paymentSource:"",frequency:"Monthly",customDays:"",startDate:today(),endDate:"",reminderDays:"7",active:true}); setShowRecurringForm(true); }} style={{ width:"100%", padding:"14px", borderRadius:12, border:"1.5px dashed #C7C7CC", background:"none", cursor:"pointer", color:"#007AFF", fontSize:15, fontWeight:600 }}>+ Add Recurring Expense</button>
              </div>
            )}

            {settingsTab==="data" && (
              <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
                <div>
                  <div style={{ fontSize:13, color:"#8E8E93", marginBottom:6, paddingLeft:4, textTransform:"uppercase", letterSpacing:0.5 }}>Export CSV</div>
                  <div className="card">
                    <button onClick={() => setShowExportModal(true)} style={{ width:"100%", padding:"16px", background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:12 }}><span style={{ fontSize:24 }}>📊</span><div style={{ textAlign:"left" }}><div style={{ fontWeight:500, fontSize:16, color:"#1C1C1E" }}>Export to CSV</div><div style={{ fontSize:13, color:"#8E8E93" }}>For your accountant</div></div></div>
                      <span style={{ color:"#C7C7CC", fontSize:18 }}>›</span>
                    </button>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:13, color:"#8E8E93", marginBottom:6, paddingLeft:4, textTransform:"uppercase", letterSpacing:0.5 }}>Local Backup</div>
                  <div className="card">
                    <div style={{ display:"flex" }}>
                      <button onClick={handleExportJSON} style={{ flex:1, padding:"16px", background:"none", border:"none", cursor:"pointer", borderRight:"1px solid #F2F2F7", display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
                        <span style={{ fontSize:24 }}>📤</span><span style={{ fontSize:14, fontWeight:600, color:"#007AFF" }}>Export</span><span style={{ fontSize:11, color:"#8E8E93" }}>Save JSON file</span>
                      </button>
                      <button onClick={() => importRef.current.click()} style={{ flex:1, padding:"16px", background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
                        <span style={{ fontSize:24 }}>📥</span><span style={{ fontSize:14, fontWeight:600, color:"#007AFF" }}>Import</span><span style={{ fontSize:11, color:"#8E8E93" }}>Restore backup</span>
                      </button>
                      <input ref={importRef} type="file" accept=".json" style={{ display:"none" }} onChange={handleImport} />
                    </div>
                  </div>
                </div>
                <div style={{ fontSize:12, color:"#C7C7CC", textAlign:"center", paddingTop:8 }}>
                  {expenses.length} total transactions · Data stored in your Google Drive
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* BOTTOM NAV */}
      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, background:"rgba(255,255,255,.92)", borderTop:"1px solid #E5E5EA", backdropFilter:"blur(20px)", display:"flex", paddingBottom:16, zIndex:50 }}>
        {TABS.map(t => (
          <button key={t.id} className="nav-btn" onClick={() => setTab(t.id)}>
            <div style={{ fontSize:t.id==="add"?18:17, width:28, height:28, borderRadius:t.id==="add"?"50%":6, background:t.id==="add"?(tab==="add"?"#007AFF":"#C7C7CC"):"none", display:"flex", alignItems:"center", justifyContent:"center", color:t.id==="add"?"#fff":(tab===t.id?"#007AFF":"#8E8E93") }}>{t.icon}</div>
            <span style={{ fontSize:11, color:tab===t.id?"#007AFF":"#8E8E93", fontWeight:tab===t.id?600:400 }}>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── MODALS ── */}

      {/* Renewal prompt */}
      {renewalPrompt && (
        <div className="modal-bg"><div className="modal-sheet" style={{ textAlign:"center" }}>
          <div className="sheet-handle" />
          <div style={{ fontSize:40, marginBottom:12 }}>⏰</div>
          <div style={{ fontWeight:700, fontSize:20, marginBottom:8 }}>{renewalPrompt.name}</div>
          <div style={{ color:"#8E8E93", fontSize:15, marginBottom:6 }}>{fmt(renewalPrompt.amount)} · {renewalPrompt.frequency}</div>
          <div style={{ color:renewalPrompt.daysLeft===0?"#FF3B30":"#FF9500", fontSize:15, fontWeight:500, marginBottom:24 }}>
            {renewalPrompt.daysLeft===0?"Expires today!":renewalPrompt.daysLeft===1?"Expires tomorrow":`Expires in ${renewalPrompt.daysLeft} days`}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <button className="pill-btn" style={{ width:"100%", background:"#007AFF", color:"#fff" }} onClick={() => handleRenewal("renew")}>✓ Renew</button>
            <button className="pill-btn" style={{ width:"100%", background:"#FFE5E5", color:"#FF3B30" }} onClick={() => handleRenewal("cancel")}>✕ Cancel Recurring</button>
            <button className="pill-btn" style={{ width:"100%", background:"#F2F2F7", color:"#636366" }} onClick={() => setRenewalPrompt(null)}>Remind Me Later</button>
          </div>
        </div></div>
      )}

      {/* CSV Export */}
      {showExportModal && (
        <div className="modal-bg" onClick={() => setShowExportModal(false)}><div className="modal-sheet" onClick={e => e.stopPropagation()}>
          <div className="sheet-handle" />
          <div style={{ fontWeight:700, fontSize:20, marginBottom:20 }}>Export CSV</div>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <div style={{ fontSize:13, color:"#8E8E93", marginBottom:8 }}>PERIOD</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {[["month","This Month"],["fy","Financial Year (Apr–Mar)"],["custom","Custom Date Range"],["all","All Time"]].map(([v,l]) => (
                  <button key={v} onClick={() => setExportType(v)} style={{ padding:"13px 16px", borderRadius:12, border:`2px solid ${exportType===v?"#007AFF":"#E5E5EA"}`, background:exportType===v?"#007AFF11":"#fff", cursor:"pointer", textAlign:"left", fontSize:15, fontWeight:exportType===v?600:400, color:exportType===v?"#007AFF":"#1C1C1E" }}>{l}</button>
                ))}
              </div>
            </div>
            {exportType==="month" && (
              <div><div style={{ fontSize:13, color:"#8E8E93", marginBottom:6 }}>SELECT MONTH</div><input className="ios-input" type="month" value={exportMonth} onChange={e => setExportMonth(e.target.value)} /></div>
            )}
            {exportType==="custom" && (
              <div style={{ display:"flex", gap:10 }}>
                <div style={{ flex:1 }}><div style={{ fontSize:13, color:"#8E8E93", marginBottom:6 }}>FROM</div><input className="ios-input" type="date" value={exportStart} onChange={e => setExportStart(e.target.value)} /></div>
                <div style={{ flex:1 }}><div style={{ fontSize:13, color:"#8E8E93", marginBottom:6 }}>TO</div><input className="ios-input" type="date" value={exportEnd} onChange={e => setExportEnd(e.target.value)} /></div>
              </div>
            )}
            <div style={{ display:"flex", gap:10, marginTop:4 }}>
              <button className="pill-btn" style={{ flex:1, background:"#F2F2F7", color:"#1C1C1E" }} onClick={() => setShowExportModal(false)}>Cancel</button>
              <button className="pill-btn" style={{ flex:1, background:"#007AFF", color:"#fff" }} onClick={handleExportCSV}>Export CSV</button>
            </div>
          </div>
        </div></div>
      )}

      {/* Recurring Form */}
      {showRecurringForm && (
        <div className="modal-bg" onClick={() => setShowRecurringForm(false)}><div className="modal-sheet" onClick={e => e.stopPropagation()}>
          <div className="sheet-handle" />
          <div style={{ fontWeight:700, fontSize:20, marginBottom:20 }}>{editRecurring?"Edit Recurring":"New Recurring Expense"}</div>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div><div style={{ fontSize:13, color:"#8E8E93", marginBottom:6 }}>NAME</div><input className="ios-input" placeholder="e.g. Netflix, Rent, Gym" value={recurringForm.name} onChange={e => setRecurringForm(p=>({...p,name:e.target.value}))} /></div>
            <div><div style={{ fontSize:13, color:"#8E8E93", marginBottom:6 }}>AMOUNT</div><div style={{ position:"relative" }}><span style={{ position:"absolute", left:16, top:"50%", transform:"translateY(-50%)", color:"#8E8E93", fontSize:16 }}>₹</span><input className="ios-input" style={{ paddingLeft:34 }} type="number" min="0" placeholder="0" value={recurringForm.amount} onChange={e => setRecurringForm(p=>({...p,amount:e.target.value}))} /></div></div>
            <div>
              <div style={{ fontSize:13, color:"#8E8E93", marginBottom:8 }}>CATEGORY</div>
              <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
                {categories.map(c => (<button key={c.id} className="cat-chip" style={{ background:recurringForm.category===c.id?c.color:"#fff", color:recurringForm.category===c.id?"#fff":"#636366", flexShrink:0, border:"1.5px solid "+( recurringForm.category===c.id?c.color:"#E5E5EA") }} onClick={() => setRecurringForm(p=>({...p,category:c.id}))}><span style={{ width:7,height:7,borderRadius:"50%",background:recurringForm.category===c.id?"rgba(255,255,255,.6)":c.color,flexShrink:0 }} />{c.label}</button>))}
              </div>
            </div>
            <div>
              <div style={{ fontSize:13, color:"#8E8E93", marginBottom:8 }}>PAYMENT SOURCE <span style={{ color:"#C7C7CC", fontSize:11 }}>(optional)</span></div>
              <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
                <button className="cat-chip" style={{ background:!recurringForm.paymentSource?"#636366":"#fff", color:!recurringForm.paymentSource?"#fff":"#636366", flexShrink:0, border:"1.5px solid "+(!recurringForm.paymentSource?"#636366":"#E5E5EA") }} onClick={() => setRecurringForm(p=>({...p,paymentSource:""}))}>None</button>
                {paymentSources.map(p => (<button key={p.id} className="cat-chip" style={{ background:recurringForm.paymentSource===p.id?p.color:"#fff", color:recurringForm.paymentSource===p.id?"#fff":"#636366", flexShrink:0, border:"1.5px solid "+(recurringForm.paymentSource===p.id?p.color:"#E5E5EA") }} onClick={() => setRecurringForm(f=>({...f,paymentSource:p.id}))}><span style={{ width:7,height:7,borderRadius:"50%",background:recurringForm.paymentSource===p.id?"rgba(255,255,255,.6)":p.color,flexShrink:0 }} />{p.label}</button>))}
              </div>
            </div>
            <div>
              <div style={{ fontSize:13, color:"#8E8E93", marginBottom:6 }}>FREQUENCY</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {FREQ_OPTIONS.map(f => (<button key={f} onClick={() => setRecurringForm(p=>({...p,frequency:f}))} style={{ padding:"9px 16px", borderRadius:20, border:`2px solid ${recurringForm.frequency===f?"#007AFF":"#E5E5EA"}`, background:recurringForm.frequency===f?"#007AFF11":"#fff", cursor:"pointer", fontSize:14, fontWeight:recurringForm.frequency===f?600:400, color:recurringForm.frequency===f?"#007AFF":"#636366" }}>{f}</button>))}
              </div>
              {recurringForm.frequency==="Custom" && <input className="ios-input" style={{ marginTop:10 }} type="number" min="1" placeholder="Every how many days?" value={recurringForm.customDays} onChange={e => setRecurringForm(p=>({...p,customDays:e.target.value}))} />}
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <div style={{ flex:1 }}><div style={{ fontSize:13, color:"#8E8E93", marginBottom:6 }}>START DATE</div><input className="ios-input" type="date" value={recurringForm.startDate} onChange={e => setRecurringForm(p=>({...p,startDate:e.target.value}))} /></div>
              <div style={{ flex:1 }}><div style={{ fontSize:13, color:"#8E8E93", marginBottom:6 }}>END DATE <span style={{ color:"#C7C7CC", fontSize:10 }}>(opt)</span></div><input className="ios-input" type="date" value={recurringForm.endDate} onChange={e => setRecurringForm(p=>({...p,endDate:e.target.value}))} /></div>
            </div>
            {recurringForm.endDate && <div><div style={{ fontSize:13, color:"#8E8E93", marginBottom:6 }}>REMIND ME (DAYS BEFORE EXPIRY)</div><input className="ios-input" type="number" min="1" max="30" placeholder="7" value={recurringForm.reminderDays} onChange={e => setRecurringForm(p=>({...p,reminderDays:e.target.value}))} /></div>}
            <div style={{ display:"flex", alignItems:"center", padding:"14px 16px", background:"#fff", borderRadius:12, justifyContent:"space-between" }}>
              <div style={{ fontWeight:500, fontSize:16 }}>Active</div>
              <div onClick={() => setRecurringForm(p=>({...p,active:!p.active}))} style={{ width:51,height:31,borderRadius:99,background:recurringForm.active?"#34C759":"#E5E5EA",cursor:"pointer",position:"relative",transition:"background .2s" }}>
                <div style={{ position:"absolute",top:2,left:recurringForm.active?22:2,width:27,height:27,borderRadius:"50%",background:"#fff",boxShadow:"0 2px 6px rgba(0,0,0,.15)",transition:"left .2s" }} />
              </div>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:4 }}>
              {editRecurring && <button className="pill-btn" style={{ background:"#FFE5E5", color:"#FF3B30" }} onClick={() => { const u=recurringExpenses.filter(r=>r.id!==editRecurring.id); setRecurringExpenses(u); setShowRecurringForm(false); setEditRecurring(null); showToast("Deleted",false); triggerDriveSync({recurringExpenses:u}); }}>Delete</button>}
              <button className="pill-btn" style={{ flex:1, background:"#F2F2F7", color:"#1C1C1E" }} onClick={() => { setShowRecurringForm(false); setEditRecurring(null); }}>Cancel</button>
              <button className="pill-btn" style={{ flex:1, background:"#007AFF", color:"#fff" }} onClick={handleSaveRecurring}>Save</button>
            </div>
          </div>
        </div></div>
      )}

      {/* Edit Expense */}
      {editExpense && (
        <div className="modal-bg" onClick={() => setEditExpense(null)}><div className="modal-sheet" onClick={e => e.stopPropagation()}>
          <div className="sheet-handle" />
          <div style={{ fontWeight:700, fontSize:20, marginBottom:20 }}>Edit Expense</div>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div><div style={{ fontSize:13, color:"#8E8E93", marginBottom:6 }}>AMOUNT</div><div style={{ position:"relative" }}><span style={{ position:"absolute", left:16, top:"50%", transform:"translateY(-50%)", fontSize:18, color:"#8E8E93" }}>₹</span><input className="ios-input" style={{ paddingLeft:36, fontSize:20, fontWeight:600 }} type="number" min="0" value={editExpense.amount} onChange={e => setEditExpense(p=>({...p,amount:e.target.value}))} /></div></div>
            <div><div style={{ fontSize:13, color:"#8E8E93", marginBottom:6 }}>NARRATION</div><input className="ios-input" value={editExpense.narration} onChange={e => setEditExpense(p=>({...p,narration:e.target.value}))} /></div>
            <div>
              <div style={{ fontSize:13, color:"#8E8E93", marginBottom:8 }}>CATEGORY</div>
              <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
                {categories.map(c => (<button key={c.id} className="cat-chip" style={{ background:editExpense.category===c.id?c.color:"#fff", color:editExpense.category===c.id?"#fff":"#3C3C43", flexShrink:0 }} onClick={() => setEditExpense(p=>({...p,category:c.id}))}><span style={{ width:8,height:8,borderRadius:"50%",background:editExpense.category===c.id?"rgba(255,255,255,0.6)":c.color,flexShrink:0 }} />{c.label}</button>))}
              </div>
            </div>
            <div>
              <div style={{ fontSize:13, color:"#8E8E93", marginBottom:8 }}>PAYMENT SOURCE</div>
              <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
                <button className="cat-chip" style={{ background:!editExpense.paymentSource?"#636366":"#fff", color:!editExpense.paymentSource?"#fff":"#636366", flexShrink:0 }} onClick={() => setEditExpense(p=>({...p,paymentSource:""}))}>None</button>
                {paymentSources.map(p => (<button key={p.id} className="cat-chip" style={{ background:editExpense.paymentSource===p.id?p.color:"#fff", color:editExpense.paymentSource===p.id?"#fff":"#3C3C43", flexShrink:0 }} onClick={() => setEditExpense(f=>({...f,paymentSource:p.id}))}><span style={{ width:8,height:8,borderRadius:"50%",background:editExpense.paymentSource===p.id?"rgba(255,255,255,0.6)":p.color,flexShrink:0 }} />{p.label}</button>))}
              </div>
            </div>
            <div><div style={{ fontSize:13, color:"#8E8E93", marginBottom:6 }}>DATE</div><input className="ios-input" type="date" value={editExpense.date} onChange={e => setEditExpense(p=>({...p,date:e.target.value}))} /></div>
            <div style={{ display:"flex", gap:10, marginTop:4 }}>
              <button className="pill-btn" style={{ background:"#FFE5E5", color:"#FF3B30" }} onClick={() => { setDeleteId(editExpense.id); setEditExpense(null); }}>Delete</button>
              <button className="pill-btn" style={{ flex:1, background:"#F2F2F7", color:"#1C1C1E" }} onClick={() => setEditExpense(null)}>Cancel</button>
              <button className="pill-btn" style={{ flex:1, background:"#007AFF", color:"#fff" }} onClick={handleSaveEdit}>Save</button>
            </div>
          </div>
        </div></div>
      )}

      {/* Delete confirm */}
      {deleteId && (<div className="modal-bg" onClick={() => setDeleteId(null)}><div className="modal-sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle" /><div style={{ fontWeight:700, fontSize:20, marginBottom:8 }}>Delete expense?</div><div style={{ color:"#8E8E93", fontSize:15, marginBottom:24 }}>This cannot be undone.</div><div style={{ display:"flex", gap:12 }}><button className="pill-btn" style={{ flex:1, background:"#F2F2F7", color:"#1C1C1E" }} onClick={() => setDeleteId(null)}>Cancel</button><button className="pill-btn" style={{ flex:1, background:"#FF3B30", color:"#fff" }} onClick={() => { const n=expenses.filter(e=>e.id!==deleteId); setExpenses(n); setDeleteId(null); showToast("Deleted",false); triggerDriveSync({expenses:n}); }}>Delete</button></div></div></div>)}

      {/* Delete category confirm */}
      {deleteConfirmCat && (<div className="modal-bg" onClick={() => setDeleteConfirmCat(null)}><div className="modal-sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle" /><div style={{ fontWeight:700, fontSize:20, marginBottom:8 }}>Delete "{deleteConfirmCat.label}"?</div><div style={{ color:"#8E8E93", fontSize:15, marginBottom:24 }}>Existing expenses won't be deleted.</div><div style={{ display:"flex", gap:12 }}><button className="pill-btn" style={{ flex:1, background:"#F2F2F7", color:"#1C1C1E" }} onClick={() => setDeleteConfirmCat(null)}>Cancel</button><button className="pill-btn" style={{ flex:1, background:"#FF3B30", color:"#fff" }} onClick={() => { const n=categories.filter(c=>c.id!==deleteConfirmCat.id); setCategories(n); setDeleteConfirmCat(null); showToast("Deleted",false); triggerDriveSync({categories:n}); }}>Delete</button></div></div></div>)}

      {/* Delete payment source confirm */}
      {deleteConfirmPay && (<div className="modal-bg" onClick={() => setDeleteConfirmPay(null)}><div className="modal-sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle" /><div style={{ fontWeight:700, fontSize:20, marginBottom:8 }}>Delete "{deleteConfirmPay.label}"?</div><div style={{ color:"#8E8E93", fontSize:15, marginBottom:24 }}>Existing expenses won't be affected.</div><div style={{ display:"flex", gap:12 }}><button className="pill-btn" style={{ flex:1, background:"#F2F2F7", color:"#1C1C1E" }} onClick={() => setDeleteConfirmPay(null)}>Cancel</button><button className="pill-btn" style={{ flex:1, background:"#FF3B30", color:"#fff" }} onClick={() => { const n=paymentSources.filter(p=>p.id!==deleteConfirmPay.id); setPaymentSources(n); setDeleteConfirmPay(null); showToast("Deleted",false); triggerDriveSync({paymentSources:n}); }}>Delete</button></div></div></div>)}

      {/* New Category */}
      {showNewCat && (<div className="modal-bg" onClick={() => setShowNewCat(false)}><div className="modal-sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle" /><div style={{ fontWeight:700, fontSize:20, marginBottom:20 }}>New Category</div><div style={{ display:"flex", flexDirection:"column", gap:16 }}><input className="ios-input" placeholder="e.g. Padel, Dining Out" value={newItemLabel} onChange={e => setNewItemLabel(e.target.value)} autoFocus /><div><div style={{ fontSize:13, color:"#8E8E93", marginBottom:10 }}>COLOR</div><div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>{COLOR_OPTIONS.map(col => (<button key={col} onClick={() => setNewItemColor(col)} style={{ width:32,height:32,borderRadius:"50%",background:col,border:"none",cursor:"pointer",outline:newItemColor===col?`3px solid ${col}`:"none",outlineOffset:2 }} />))}</div></div><div style={{ display:"flex", gap:12, marginTop:4 }}><button className="pill-btn" style={{ flex:1, background:"#F2F2F7", color:"#1C1C1E" }} onClick={() => setShowNewCat(false)}>Cancel</button><button className="pill-btn" style={{ flex:1, background:"#007AFF", color:"#fff" }} onClick={() => { if (!newItemLabel.trim()) return showToast("Enter a name",false); const id=newItemLabel.toLowerCase().replace(/\s+/g,"_")+"_"+Date.now(); const n=[...categories,{id,label:newItemLabel.trim(),color:newItemColor}]; setCategories(n); setShowNewCat(false); showToast("Category added!"); triggerDriveSync({categories:n}); }}>Add</button></div></div></div></div>)}

      {/* New Payment Source */}
      {showNewPay && (<div className="modal-bg" onClick={() => setShowNewPay(false)}><div className="modal-sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle" /><div style={{ fontWeight:700, fontSize:20, marginBottom:20 }}>New Payment Source</div><div style={{ display:"flex", flexDirection:"column", gap:16 }}><input className="ios-input" placeholder="e.g. HDFC Credit Card, Paytm UPI" value={newItemLabel} onChange={e => setNewItemLabel(e.target.value)} autoFocus /><div><div style={{ fontSize:13, color:"#8E8E93", marginBottom:10 }}>COLOR</div><div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>{COLOR_OPTIONS.map(col => (<button key={col} onClick={() => setNewItemColor(col)} style={{ width:32,height:32,borderRadius:"50%",background:col,border:"none",cursor:"pointer",outline:newItemColor===col?`3px solid ${col}`:"none",outlineOffset:2 }} />))}</div></div><div style={{ display:"flex", gap:12, marginTop:4 }}><button className="pill-btn" style={{ flex:1, background:"#F2F2F7", color:"#1C1C1E" }} onClick={() => setShowNewPay(false)}>Cancel</button><button className="pill-btn" style={{ flex:1, background:"#007AFF", color:"#fff" }} onClick={() => { if (!newItemLabel.trim()) return showToast("Enter a name",false); const id=newItemLabel.toLowerCase().replace(/\s+/g,"_")+"_"+Date.now(); const n=[...paymentSources,{id,label:newItemLabel.trim(),color:newItemColor}]; setPaymentSources(n); setShowNewPay(false); showToast("Payment source added!"); triggerDriveSync({paymentSources:n}); }}>Add</button></div></div></div></div>)}

      {/* Budget Edit */}
      {showBudgetEdit && (<div className="modal-bg" onClick={() => setShowBudgetEdit(false)}><div className="modal-sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle" /><div style={{ fontWeight:700, fontSize:20, marginBottom:20 }}>Monthly Budget</div><div style={{ position:"relative", marginBottom:24 }}><span style={{ position:"absolute", left:16, top:"50%", transform:"translateY(-50%)", fontSize:18, color:"#8E8E93" }}>₹</span><input className="ios-input" style={{ paddingLeft:36, fontSize:22, fontWeight:600 }} type="number" min="0" placeholder="0" value={editBudget} onChange={e => setEditBudget(e.target.value)} autoFocus /></div><div style={{ display:"flex", gap:12 }}><button className="pill-btn" style={{ flex:1, background:"#F2F2F7", color:"#1C1C1E" }} onClick={() => setShowBudgetEdit(false)}>Cancel</button><button className="pill-btn" style={{ flex:1, background:"#007AFF", color:"#fff" }} onClick={() => { setTotalBudget(editBudget); setShowBudgetEdit(false); showToast("Budget saved!"); triggerDriveSync({totalBudget:editBudget}); }}>Save</button></div></div></div>)}

      {/* Edit Category */}
      {editCat && (<div className="modal-bg" onClick={() => setEditCat(null)}><div className="modal-sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle" /><div style={{ fontWeight:700, fontSize:20, marginBottom:20 }}>Edit Category</div><div style={{ display:"flex", flexDirection:"column", gap:16 }}><input className="ios-input" placeholder="Category name" value={newItemLabel} onChange={e => setNewItemLabel(e.target.value)} autoFocus /><div><div style={{ fontSize:13, color:"#8E8E93", marginBottom:10 }}>COLOR</div><div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>{COLOR_OPTIONS.map(col => (<button key={col} onClick={() => setNewItemColor(col)} style={{ width:32, height:32, borderRadius:"50%", background:col, border:"none", cursor:"pointer", outline:newItemColor===col?`3px solid ${col}`:"none", outlineOffset:2 }} />))}</div></div><div style={{ display:"flex", gap:12, marginTop:4 }}><button className="pill-btn" style={{ flex:1, background:"#F2F2F7", color:"#1C1C1E" }} onClick={() => setEditCat(null)}>Cancel</button><button className="pill-btn" style={{ flex:1, background:"#007AFF", color:"#fff" }} onClick={() => { if (!newItemLabel.trim()) return showToast("Enter a name", false); const n = categories.map(c => c.id===editCat.id ? {...c, label:newItemLabel.trim(), color:newItemColor} : c); setCategories(n); setEditCat(null); showToast("Category updated!"); triggerDriveSync({categories:n}); }}>Save</button></div></div></div></div>)}

      {/* Edit Payment Source */}
      {editPay && (<div className="modal-bg" onClick={() => setEditPay(null)}><div className="modal-sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle" /><div style={{ fontWeight:700, fontSize:20, marginBottom:20 }}>Edit Payment Source</div><div style={{ display:"flex", flexDirection:"column", gap:16 }}><input className="ios-input" placeholder="Payment source name" value={newItemLabel} onChange={e => setNewItemLabel(e.target.value)} autoFocus /><div><div style={{ fontSize:13, color:"#8E8E93", marginBottom:10 }}>COLOR</div><div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>{COLOR_OPTIONS.map(col => (<button key={col} onClick={() => setNewItemColor(col)} style={{ width:32, height:32, borderRadius:"50%", background:col, border:"none", cursor:"pointer", outline:newItemColor===col?`3px solid ${col}`:"none", outlineOffset:2 }} />))}</div></div><div style={{ display:"flex", gap:12, marginTop:4 }}><button className="pill-btn" style={{ flex:1, background:"#F2F2F7", color:"#1C1C1E" }} onClick={() => setEditPay(null)}>Cancel</button><button className="pill-btn" style={{ flex:1, background:"#007AFF", color:"#fff" }} onClick={() => { if (!newItemLabel.trim()) return showToast("Enter a name", false); const n = paymentSources.map(p => p.id===editPay.id ? {...p, label:newItemLabel.trim(), color:newItemColor} : p); setPaymentSources(n); setEditPay(null); showToast("Payment source updated!"); triggerDriveSync({paymentSources:n}); }}>Save</button></div></div></div></div>)}

      {/* Toast */}
      {toast && (<div style={{ position:"fixed", bottom:100, left:"50%", transform:"translateX(-50%)", background:toast.ok?"rgba(52,199,89,.95)":"rgba(255,59,48,.95)", color:"#fff", padding:"12px 22px", borderRadius:12, fontSize:14, fontWeight:600, boxShadow:"0 4px 20px rgba(0,0,0,.15)", zIndex:999, whiteSpace:"nowrap" }}>{toast.msg}</div>)}
    </div>
  );
}
