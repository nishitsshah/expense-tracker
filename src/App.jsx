import { useState, useMemo, useEffect, useRef, useCallback } from "react";

const GOOGLE_CLIENT_ID = "82756044682-ovvcfig11hhc3v1grbb2vgsus4k9k90o.apps.googleusercontent.com";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_FILE_NAME = "expense-tracker-data.json";

function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch { return defaultValue; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }, [key, value]);
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

const COLOR_OPTIONS = ["#FF9500","#FF2D55","#AF52DE","#007AFF","#34C759","#30B0C7","#636366","#FF6B35","#A2845E","#5856D6","#FF3B30","#00C7BE"];

const fmt = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const fmtShort = (n) => n >= 100000 ? `₹${(n/100000).toFixed(1)}L` : n >= 1000 ? `₹${(n/1000).toFixed(1)}K` : fmt(n);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const monthKey = (date) => date.slice(0, 7);
const currentMonth = () => today().slice(0, 7);
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

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

export default function App() {
  const [tab, setTab] = useState("add");
  const [summaryTab, setSummaryTab] = useState("monthly");
  const [expenses, setExpenses] = useLocalStorage("et_expenses", []);
  const [categories, setCategories] = useLocalStorage("et_categories", DEFAULT_CATEGORIES);
  const [totalBudget, setTotalBudget] = useLocalStorage("et_budget", "");
  const [lastBackup, setLastBackup] = useLocalStorage("et_last_backup", null);
  const [driveFileId, setDriveFileId] = useLocalStorage("et_drive_file_id", null);
  const [googleToken, setGoogleToken] = useLocalStorage("et_google_token", null);
  const [googleUser, setGoogleUser] = useLocalStorage("et_google_user", null);
  const [lastSyncedAt, setLastSyncedAt] = useLocalStorage("et_last_synced", null);
  const [pendingSync, setPendingSync] = useLocalStorage("et_pending_sync", false);

  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");
  const [selCat, setSelCat] = useState("food");
  const [date, setDate] = useState(today());

  const [deleteId, setDeleteId] = useState(null);
  const [editExpense, setEditExpense] = useState(null);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState("");
  const [newCatColor, setNewCatColor] = useState("#007AFF");
  const [showBudgetEdit, setShowBudgetEdit] = useState(false);
  const [editBudget, setEditBudget] = useState("");
  const [toast, setToast] = useState(null);
  const [deleteConfirmCat, setDeleteConfirmCat] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [showBackupReminder, setShowBackupReminder] = useState(false);
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | syncing | synced | offline | error
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const importRef = useRef(null);
  const touchDragIdx = useRef(null);
  const tokenClientRef = useRef(null);
  const syncTimeoutRef = useRef(null);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (pendingSync && googleToken) triggerSync();
    };
    const handleOffline = () => { setIsOnline(false); setSyncStatus("offline"); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => { window.removeEventListener("online", handleOnline); window.removeEventListener("offline", handleOffline); };
  }, [pendingSync, googleToken]);

  // Load Google Identity Services
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = initGoogleAuth;
    document.head.appendChild(script);
  }, []);

  // On login, load from Drive
  useEffect(() => {
    if (googleToken && isOnline) loadFromDrive(googleToken);
  }, [googleToken]);

  // Check backup reminder
  useEffect(() => {
    const daysSince = lastBackup ? Math.floor((new Date() - new Date(lastBackup)) / (1000*60*60*24)) : 999;
    if (daysSince >= 30 && !googleToken) setShowBackupReminder(true);
  }, []);

  const initGoogleAuth = () => {
    if (!window.google) return;
    tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPE + " email profile",
      callback: async (response) => {
        if (response.access_token) {
          setGoogleToken(response.access_token);
          await fetchGoogleUser(response.access_token);
          await loadFromDrive(response.access_token);
        }
      },
    });
  };

  const fetchGoogleUser = async (token) => {
    try {
      const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setGoogleUser({ name: data.given_name || data.name, email: data.email, picture: data.picture });
    } catch {}
  };

  const handleGoogleLogin = () => {
    if (!tokenClientRef.current) return showToast("Google not loaded yet", false);
    tokenClientRef.current.requestAccessToken();
  };

  const handleGoogleLogout = () => {
    if (googleToken && window.google) window.google.accounts.oauth2.revoke(googleToken);
    setGoogleToken(null); setGoogleUser(null); setDriveFileId(null);
    setSyncStatus("idle");
    showToast("Signed out of Google");
  };

  // Find or create the Drive file
  const findOrCreateDriveFile = async (token) => {
    try {
      // Search for existing file
      const search = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${DRIVE_FILE_NAME}' and trashed=false&spaces=drive&fields=files(id,name,modifiedTime)`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!search.ok) return null;
      const searchData = await search.json();
      if (searchData.files && searchData.files.length > 0) {
        return searchData.files[0].id;
      }
      return null;
    } catch { return null; }
  };

  // Load data from Drive
  const loadFromDrive = async (token) => {
    if (!token || !isOnline) return;
    setSyncStatus("syncing");
    try {
      let fileId = driveFileId;
      if (!fileId) {
        fileId = await findOrCreateDriveFile(token);
        if (fileId) setDriveFileId(fileId);
      }
      if (!fileId) { setSyncStatus("synced"); return; }

      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 401) { setGoogleToken(null); setSyncStatus("error"); return; }
        if (res.status === 404) { setDriveFileId(null); setSyncStatus("synced"); return; }
        setSyncStatus("error"); return;
      }
      const driveData = await res.json();

      // Merge: combine local and drive data, deduplicate by id, keep latest
      const localIds = new Set(expenses.map(e => e.id));
      const driveIds = new Set((driveData.expenses || []).map(e => e.id));
      const allExpenses = [...expenses, ...(driveData.expenses || []).filter(e => !localIds.has(e.id))];
      // Sort by date desc
      allExpenses.sort((a, b) => b.id - a.id);

      setExpenses(allExpenses);
      if (driveData.categories && driveData.categories.length > 0) setCategories(driveData.categories);
      if (driveData.totalBudget !== undefined) setTotalBudget(driveData.totalBudget);
      setLastSyncedAt(new Date().toISOString());
      setPendingSync(false);
      setSyncStatus("synced");

      // Save merged data back to Drive
      await saveToDrive(token, allExpenses, driveData.categories || categories, driveData.totalBudget || totalBudget, fileId);
    } catch (e) {
      setSyncStatus("error");
    }
  };

  // Save to Drive
  const saveToDrive = useCallback(async (token, expensesData, categoriesData, budgetData, fileId) => {
    if (!token || !isOnline) { setPendingSync(true); return false; }
    const content = JSON.stringify({ expenses: expensesData, categories: categoriesData, totalBudget: budgetData, updatedAt: new Date().toISOString() });
    const metadata = { name: DRIVE_FILE_NAME, mimeType: "application/json" };
    const boundary = "expense_tracker_boundary";
    const body = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;

    try {
      const url = fileId
        ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
        : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
      const method = fileId ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body });
      if (res.ok) {
        const result = await res.json();
        if (result.id && !fileId) setDriveFileId(result.id);
        setLastSyncedAt(new Date().toISOString());
        setLastBackup(new Date().toISOString());
        setPendingSync(false);
        return true;
      } else if (res.status === 401) {
        setGoogleToken(null); setPendingSync(true); return false;
      }
    } catch { setPendingSync(true); return false; }
  }, [isOnline, setDriveFileId, setLastSyncedAt, setLastBackup, setPendingSync, setGoogleToken]);

  // Debounced auto-sync after data changes
  const triggerSync = useCallback(() => {
    if (!googleToken || !isOnline) { setPendingSync(true); setSyncStatus("offline"); return; }
    setSyncStatus("syncing");
    clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(async () => {
      const success = await saveToDrive(googleToken, expenses, categories, totalBudget, driveFileId);
      setSyncStatus(success ? "synced" : "error");
    }, 1500);
  }, [googleToken, isOnline, expenses, categories, totalBudget, driveFileId, saveToDrive]);

  const showToast = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 2200); };
  const cat = (id) => categories.find(c => c.id === id) || { label: id, color: "#ccc" };

  const handleAdd = () => {
    if (!amount || isNaN(+amount) || +amount <= 0) return showToast("Enter a valid amount", false);
    if (!narration.trim()) return showToast("Add a narration", false);
    const newExp = [{ id: Date.now(), amount: parseFloat(amount), narration: narration.trim(), category: selCat, date }, ...expenses];
    setExpenses(newExp);
    setAmount(""); setNarration("");
    showToast("Expense added!");
    if (googleToken) {
      setSyncStatus("syncing");
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(async () => {
        const success = await saveToDrive(googleToken, newExp, categories, totalBudget, driveFileId);
        setSyncStatus(success ? "synced" : isOnline ? "error" : "offline");
      }, 1500);
    }
  };

  const handleAddCategory = () => {
    if (!newCatLabel.trim()) return showToast("Enter a category name", false);
    const id = newCatLabel.toLowerCase().replace(/\s+/g, "_") + "_" + Date.now();
    const newCats = [...categories, { id, label: newCatLabel.trim(), color: newCatColor }];
    setCategories(newCats);
    setNewCatLabel(""); setNewCatColor("#007AFF"); setShowNewCat(false);
    showToast("Category added!");
    if (googleToken) triggerSync();
  };

  const handleDeleteCat = (id) => {
    const newCats = categories.filter(c => c.id !== id);
    setCategories(newCats);
    setDeleteConfirmCat(null);
    if (selCat === id) setSelCat(categories[0]?.id || "food");
    showToast("Category deleted", false);
    if (googleToken) triggerSync();
  };

  const handleSaveEdit = () => {
    if (!editExpense.amount || isNaN(+editExpense.amount) || +editExpense.amount <= 0) return showToast("Enter a valid amount", false);
    if (!editExpense.narration.trim()) return showToast("Add a narration", false);
    const newExp = expenses.map(e => e.id === editExpense.id ? { ...editExpense, amount: parseFloat(editExpense.amount) } : e);
    setExpenses(newExp);
    setEditExpense(null);
    showToast("Expense updated!");
    if (googleToken) {
      setSyncStatus("syncing");
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(async () => {
        const success = await saveToDrive(googleToken, newExp, categories, totalBudget, driveFileId);
        setSyncStatus(success ? "synced" : isOnline ? "error" : "offline");
      }, 1500);
    }
  };

  const handleDragStart = (i) => setDragIdx(i);
  const handleDragOver = (e, i) => { e.preventDefault(); setDragOverIdx(i); };
  const handleDrop = (i) => {
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setDragOverIdx(null); return; }
    const updated = [...categories]; const [moved] = updated.splice(dragIdx, 1); updated.splice(i, 0, moved);
    setCategories(updated); setDragIdx(null); setDragOverIdx(null);
    if (googleToken) triggerSync();
  };
  const handleTouchStart = (e, i) => { touchDragIdx.current = i; setDragIdx(i); };
  const handleTouchMove = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const row = el?.closest("[data-cat-idx]");
    if (row) { const idx = parseInt(row.getAttribute("data-cat-idx")); if (!isNaN(idx)) setDragOverIdx(idx); }
  };
  const handleTouchEnd = () => {
    if (touchDragIdx.current !== null && dragOverIdx !== null && touchDragIdx.current !== dragOverIdx) {
      const updated = [...categories]; const [moved] = updated.splice(touchDragIdx.current, 1); updated.splice(dragOverIdx, 0, moved); setCategories(updated);
      if (googleToken) triggerSync();
    }
    touchDragIdx.current = null; setDragIdx(null); setDragOverIdx(null);
  };

  const buildEmailReport = (month) => {
    const [y, m] = month.split("-").map(Number);
    const monthName = `${MONTHS[m-1]} ${y}`;
    const mExp = expenses.filter(e => monthKey(e.date) === month);
    const spent = mExp.reduce((s, e) => s + e.amount, 0);
    const bgt = parseFloat(totalBudget) || 0;
    const prevDate = new Date(y, m-2);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,"0")}`;
    const prevSpent = expenses.filter(e => monthKey(e.date) === prevMonth).reduce((s, e) => s + e.amount, 0);
    const catTotals = {}, catCounts = {};
    mExp.forEach(e => { catTotals[e.category] = (catTotals[e.category]||0) + e.amount; catCounts[e.category] = (catCounts[e.category]||0) + 1; });
    const dayTotals = {};
    mExp.forEach(e => { dayTotals[e.date] = (dayTotals[e.date]||0) + e.amount; });
    const dayEntries = Object.entries(dayTotals);
    const highestDay = [...dayEntries].sort((a,b) => b[1]-a[1])[0];
    const daysActive = dayEntries.length;
    const daysInMonth = new Date(y, m, 0).getDate();
    const dailyAvg = daysActive > 0 ? spent/daysActive : 0;
    const weekdayTotals = Array(7).fill(0), weekdayCounts = Array(7).fill(0);
    mExp.forEach(e => { const d = new Date(e.date+"T00:00:00").getDay(); weekdayTotals[d] += e.amount; weekdayCounts[d]++; });
    const weekdayAvgs = weekdayTotals.map((t,i) => weekdayCounts[i] > 0 ? t/weekdayCounts[i] : 0);
    const topWeekday = weekdayAvgs.indexOf(Math.max(...weekdayAvgs));
    const top3 = [...mExp].sort((a,b) => b.amount-a.amount).slice(0,3);
    const vsLast = prevSpent > 0 ? ((spent-prevSpent)/prevSpent*100).toFixed(1) : null;

    let body = `Hi Nishit,\n\nHere is your expense report for ${monthName}.\n\n`;
    body += `━━━━━━━━━━━━━━━━━━━━\nOVERVIEW\n━━━━━━━━━━━━━━━━━━━━\n`;
    body += `Total Spent:      ${fmt(spent)}\n`;
    if (bgt > 0) body += `Monthly Budget:   ${fmt(bgt)}\nRemaining:        ${fmt(Math.max(bgt-spent,0))}\nBudget Used:      ${Math.round((spent/bgt)*100)}%\n`;
    body += `Total Entries:    ${mExp.length} transactions\nDays Active:      ${daysActive} of ${daysInMonth} days\nDaily Average:    ${fmt(dailyAvg)}\n`;
    if (vsLast !== null) body += `vs Last Month:    ${spent > prevSpent ? "+" : ""}${vsLast}% (${fmt(Math.abs(spent-prevSpent))} ${spent > prevSpent ? "more" : "less"})\n`;
    body += `\n━━━━━━━━━━━━━━━━━━━━\nSPENDING BY CATEGORY\n━━━━━━━━━━━━━━━━━━━━\n`;
    Object.entries(catTotals).sort((a,b) => b[1]-a[1]).forEach(([cid, amt]) => {
      const c = cat(cid); const pct = spent > 0 ? Math.round((amt/spent)*100) : 0;
      body += `${c.label.padEnd(18)} ${fmt(amt).padStart(10)}  ${String(pct+"%").padStart(4)}  (${catCounts[cid]} transactions)\n`;
    });
    body += `\n━━━━━━━━━━━━━━━━━━━━\nANALYSIS & TRENDS\n━━━━━━━━━━━━━━━━━━━━\n`;
    if (highestDay) body += `Highest Spend Day:  ${highestDay[0]} — ${fmt(highestDay[1])}\n`;
    body += `Top Spending Day:   ${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][topWeekday]}s\n`;
    body += `\n━━━━━━━━━━━━━━━━━━━━\nTOP 3 SINGLE EXPENSES\n━━━━━━━━━━━━━━━━━━━━\n`;
    top3.forEach((e, i) => { body += `${i+1}. ${e.narration} — ${fmt(e.amount)} (${cat(e.category).label}, ${e.date})\n`; });
    body += `\n━━━━━━━━━━━━━━━━━━━━\nData backed up to Google Drive.\n━━━━━━━━━━━━━━━━━━━━`;
    return { subject: `Expense Tracker — ${monthName} Report`, body };
  };

  const handleEmailReport = (month) => {
    const { subject, body } = buildEmailReport(month);
    window.location.href = `mailto:nishit.ssf@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const handleExport = () => {
    const data = { expenses, categories, totalBudget, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `expenses-backup-${today()}.json`; a.click(); URL.revokeObjectURL(url);
    showToast("Data exported!");
  };

  const handleImport = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.expenses) setExpenses(data.expenses);
        if (data.categories) setCategories(data.categories);
        if (data.totalBudget !== undefined) setTotalBudget(data.totalBudget);
        showToast("Data imported!");
        if (googleToken) triggerSync();
      } catch { showToast("Invalid file", false); }
    };
    reader.readAsText(file); e.target.value = "";
  };

  const syncStatusInfo = () => {
    if (!googleToken) return null;
    if (syncStatus === "syncing") return { color: "#FF9500", text: "Syncing..." };
    if (syncStatus === "synced") return { color: "#34C759", text: lastSyncedAt ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : "Synced" };
    if (syncStatus === "offline" || !isOnline) return { color: "#FF9500", text: "Offline — will sync when online" };
    if (syncStatus === "error") return { color: "#FF3B30", text: "Sync error — tap to retry" };
    return { color: "#8E8E93", text: "Connected to Drive" };
  };

  const monthExpenses = useMemo(() => expenses.filter(e => monthKey(e.date) === selectedMonth), [expenses, selectedMonth]);
  const totalSpent = useMemo(() => monthExpenses.reduce((s, e) => s + e.amount, 0), [monthExpenses]);
  const budget = parseFloat(totalBudget) || 0;
  const budgetPct = budget > 0 ? Math.min((totalSpent/budget)*100, 100) : 0;
  const overBudget = budget > 0 && totalSpent > budget;
  const catTotals = useMemo(() => { const t = {}; monthExpenses.forEach(e => { t[e.category] = (t[e.category]||0) + e.amount; }); return t; }, [monthExpenses]);
  const catCounts = useMemo(() => { const t = {}; monthExpenses.forEach(e => { t[e.category] = (t[e.category]||0) + 1; }); return t; }, [monthExpenses]);
  const yearExpenses = useMemo(() => { const yr = selectedMonth.slice(0,4); return expenses.filter(e => e.date.startsWith(yr)); }, [expenses, selectedMonth]);
  const yearlyByMonth = useMemo(() => { const map = {}; yearExpenses.forEach(e => { const mk = monthKey(e.date); map[mk] = (map[mk]||0) + e.amount; }); return map; }, [yearExpenses]);

  const insightsData = useMemo(() => {
    if (monthExpenses.length === 0) return null;
    const [y, m] = selectedMonth.split("-").map(Number);
    const prevDate = new Date(y, m-2);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,"0")}`;
    const prevSpent = expenses.filter(e => monthKey(e.date) === prevMonth).reduce((s,e) => s+e.amount, 0);
    const dayTotals = {};
    monthExpenses.forEach(e => { dayTotals[e.date] = (dayTotals[e.date]||0) + e.amount; });
    const dayEntries = Object.entries(dayTotals);
    const highestDay = [...dayEntries].sort((a,b) => b[1]-a[1])[0];
    const daysActive = dayEntries.length;
    const daysInMonth = new Date(y, m, 0).getDate();
    const dailyAvg = daysActive > 0 ? totalSpent/daysActive : 0;
    const noSpendDays = daysInMonth - daysActive;
    const weekdayTotals = Array(7).fill(0), weekdayCounts = Array(7).fill(0);
    monthExpenses.forEach(e => { const d = new Date(e.date+"T00:00:00").getDay(); weekdayTotals[d] += e.amount; weekdayCounts[d]++; });
    const weekdayAvgs = weekdayTotals.map((t,i) => weekdayCounts[i] > 0 ? t/weekdayCounts[i] : 0);
    const topWeekday = weekdayAvgs.indexOf(Math.max(...weekdayAvgs));
    const weekendSpend = weekdayTotals[0] + weekdayTotals[6];
    const weekdaySpend = weekdayTotals.slice(1,6).reduce((a,b) => a+b, 0);
    const allDates = new Set(monthExpenses.map(e => e.date));
    let maxStreak = 0, curStreak = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dk = `${selectedMonth}-${String(d).padStart(2,"0")}`;
      if (allDates.has(dk)) { curStreak++; maxStreak = Math.max(maxStreak, curStreak); } else curStreak = 0;
    }
    const top3 = [...monthExpenses].sort((a,b) => b.amount-a.amount).slice(0,3);
    const mid = Math.floor(daysInMonth/2);
    const firstHalf = monthExpenses.filter(e => parseInt(e.date.split("-")[2]) <= mid).reduce((s,e) => s+e.amount, 0);
    const secondHalf = monthExpenses.filter(e => parseInt(e.date.split("-")[2]) > mid).reduce((s,e) => s+e.amount, 0);
    return { prevSpent, highestDay, daysActive, daysInMonth, dailyAvg, noSpendDays, topWeekday, weekendSpend, weekdaySpend, weekdayTotals, maxStreak, top3, firstHalf, secondHalf };
  }, [monthExpenses, selectedMonth, totalSpent, expenses]);

  const TABS = [
    { id: "add", label: "Add", icon: "＋" },
    { id: "history", label: "History", icon: "≡" },
    { id: "summary", label: "Summary", icon: "◑" },
    { id: "settings", label: "Settings", icon: "⚙" },
  ];

  const SubToggle = ({ value, onChange, options }) => (
    <div style={{ display: "flex", background: "#E5E5EA", borderRadius: 10, padding: 2, marginBottom: 20 }}>
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, background: value === v ? "#fff" : "transparent", color: value === v ? "#1C1C1E" : "#8E8E93", boxShadow: value === v ? "0 1px 3px rgba(0,0,0,.12)" : "none", transition: "all .15s" }}>{l}</button>
      ))}
    </div>
  );

  const si = syncStatusInfo();

  return (
    <div style={{ fontFamily: "-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif", background: "#F2F2F7", minHeight: "100vh", maxWidth: 430, margin: "0 auto", position: "relative" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        button, input { font-family: inherit; }
        ::-webkit-scrollbar { display: none; }
        .cat-chip { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 20px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; white-space: nowrap; transition: all .15s; }
        .card { background: #fff; border-radius: 16px; overflow: hidden; }
        .input-field { background: none; border: none; outline: none; font-size: 15px; width: 100%; color: #1C1C1E; }
        .nav-btn { display: flex; flex-direction: column; align-items: center; gap: 2px; background: none; border: none; cursor: pointer; flex: 1; padding: 6px 0 4px; }
        .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 200; display: flex; align-items: flex-end; justify-content: center; }
        .modal-sheet { background: #F2F2F7; border-radius: 20px 20px 0 0; width: 100%; max-width: 430px; padding: 24px 20px 40px; max-height: 90vh; overflow-y: auto; }
        .sheet-handle { width: 36px; height: 4px; background: #C7C7CC; border-radius: 99px; margin: 0 auto 20px; }
        .ios-input { background: #fff; border-radius: 12px; padding: 14px 16px; font-size: 16px; width: 100%; border: none; outline: none; color: #1C1C1E; }
        .color-row { display: flex; gap: 10px; flex-wrap: wrap; }
        .pill-btn { padding: 10px 20px; border-radius: 12px; border: none; cursor: pointer; font-size: 15px; font-weight: 600; }
        .drag-row.over { background: #EBF5FF; border-radius: 12px; }
        .stat-card { background: #fff; border-radius: 14px; padding: 14px 16px; flex: 1; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; display: inline-block; }
      `}</style>

      {/* HEADER */}
      <div style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(242,242,247,.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid #E5E5EA", padding: "12px 20px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: "#1C1C1E", letterSpacing: -0.3 }}>💰 Expense Tracker</div>
          {si && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, cursor: syncStatus === "error" ? "pointer" : "default" }}
              onClick={() => syncStatus === "error" && loadFromDrive(googleToken)}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: si.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: si.color }}>{si.text}</span>
            </div>
          )}
        </div>
      </div>

      <div style={{ paddingBottom: 80 }}>

        {/* ADD */}
        {tab === "add" && (
          <div style={{ padding: "20px" }}>
            <h1 style={{ fontSize: 34, fontWeight: 700, marginBottom: 28, letterSpacing: -0.5 }}>Add Expense</h1>
            <div className="card" style={{ padding: "16px 20px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 10 }}>₹ Amount</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 32, color: amount ? "#1C1C1E" : "#C7C7CC", fontWeight: 300 }}>₹</span>
                <input className="input-field" style={{ fontSize: 36, fontWeight: 300, color: amount ? "#1C1C1E" : "#C7C7CC" }} type="number" min="0" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
            </div>
            <div className="card" style={{ padding: "16px 20px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 10 }}>📝 Narration</div>
              <input className="input-field" style={{ fontSize: 16 }} placeholder="What was this for?" value={narration} onChange={e => setNarration(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} />
            </div>
            <div className="card" style={{ padding: "16px 20px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 12 }}>Category</div>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                {categories.map(c => (
                  <button key={c.id} className="cat-chip" style={{ background: selCat === c.id ? c.color : "#F2F2F7", color: selCat === c.id ? "#fff" : "#3C3C43" }} onClick={() => setSelCat(c.id)}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: selCat === c.id ? "rgba(255,255,255,0.6)" : c.color, flexShrink: 0 }} />{c.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="card" style={{ padding: "16px 20px", marginBottom: 24 }}>
              <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 10 }}>📅 Date</div>
              <input className="input-field" type="date" value={date} style={{ fontSize: 16 }} onChange={e => setDate(e.target.value)} />
            </div>
            <button onClick={handleAdd} style={{ width: "100%", padding: "18px", borderRadius: 16, border: "none", cursor: "pointer", background: amount && narration ? "#007AFF" : "#C7C7CC", color: "#fff", fontSize: 17, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "background .2s" }}>＋ Add Expense</button>
          </div>
        )}

        {/* HISTORY */}
        {tab === "history" && (
          <div style={{ padding: "20px" }}>
            <h1 style={{ fontSize: 34, fontWeight: 700, marginBottom: 20, letterSpacing: -0.5 }}>History</h1>
            <MonthNav value={selectedMonth} onChange={setSelectedMonth} />
            {monthExpenses.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 0" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                <div style={{ fontWeight: 600, fontSize: 17, color: "#8E8E93" }}>No transactions</div>
              </div>
            ) : (
              <>
                <div className="card" style={{ marginBottom: 16 }}>
                  {monthExpenses.map((e, i) => {
                    const c = cat(e.category);
                    return (
                      <div key={e.id} style={{ display: "flex", alignItems: "center", padding: "14px 16px", gap: 12, borderBottom: i < monthExpenses.length-1 ? "1px solid #F2F2F7" : "none", cursor: "pointer" }} onClick={() => setEditExpense({ ...e, amount: String(e.amount) })}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.narration}</div>
                          <div style={{ fontSize: 12, color: "#8E8E93", marginTop: 2 }}>{c.label} · {new Date(e.date+"T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 16 }}>{fmt(e.amount)}</div>
                          <div style={{ fontSize: 12, color: "#007AFF", marginTop: 3 }}>Edit</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="card" style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#8E8E93", fontSize: 15 }}>Total</span>
                  <span style={{ fontWeight: 700, fontSize: 20 }}>{fmt(totalSpent)}</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* SUMMARY */}
        {tab === "summary" && (
          <div style={{ padding: "20px" }}>
            <h1 style={{ fontSize: 34, fontWeight: 700, marginBottom: 20, letterSpacing: -0.5 }}>Summary</h1>
            <MonthNav value={selectedMonth} onChange={setSelectedMonth} />
            <SubToggle value={summaryTab} onChange={setSummaryTab} options={[["monthly","Monthly"],["yearly","Yearly"],["insights","Insights"]]} />

            {summaryTab === "monthly" && (monthExpenses.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0" }}><div style={{ fontSize: 48, marginBottom: 12 }}>📭</div><div style={{ fontWeight: 600, fontSize: 17, color: "#8E8E93" }}>No expenses yet</div></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    <div><div style={{ fontSize: 13, color: "#8E8E93" }}>Total Spent</div><div style={{ fontSize: 26, fontWeight: 700 }}>{fmt(totalSpent)}</div></div>
                    {budget > 0 && <div style={{ textAlign: "right" }}><div style={{ fontSize: 13, color: "#8E8E93" }}>Budget</div><div style={{ fontSize: 26, fontWeight: 700 }}>{fmt(budget)}</div></div>}
                  </div>
                  {budget > 0 && (<><div style={{ height: 8, background: "#F2F2F7", borderRadius: 99, overflow: "hidden", marginBottom: 8 }}><div style={{ height: "100%", width: `${budgetPct}%`, background: overBudget ? "#FF3B30" : budgetPct >= 80 ? "#FF9500" : "#34C759", borderRadius: 99, transition: "width .4s" }} /></div><div style={{ fontSize: 13, color: overBudget ? "#FF3B30" : "#8E8E93", textAlign: "right" }}>{overBudget ? `⚠ Over by ${fmt(totalSpent-budget)}` : `${fmt(Math.max(budget-totalSpent,0))} remaining`}</div></>)}
                  {!budget && <button onClick={() => { setEditBudget(totalBudget); setShowBudgetEdit(true); }} style={{ marginTop: 4, background: "none", border: "none", cursor: "pointer", color: "#007AFF", fontSize: 14, padding: 0 }}>+ Set monthly budget</button>}
                </div>
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 14 }}>By Category</div>
                  {Object.entries(catTotals).sort((a,b) => b[1]-a[1]).map(([cid, spent]) => {
                    const c = cat(cid); const pct = totalSpent > 0 ? (spent/totalSpent)*100 : 0; const count = catCounts[cid] || 0;
                    return (<div key={cid} style={{ marginBottom: 14 }}><div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: c.color, flexShrink: 0 }} /><span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{c.label}</span><span style={{ fontSize: 12, color: "#8E8E93" }}>({count})</span><span style={{ fontSize: 12, color: "#8E8E93", marginLeft: 4 }}>{Math.round(pct)}%</span><span style={{ fontSize: 14, fontWeight: 600, marginLeft: 6 }}>{fmt(spent)}</span></div><div style={{ height: 5, background: "#F2F2F7", borderRadius: 99, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: c.color, borderRadius: 99 }} /></div></div>);
                  })}
                </div>
                <button onClick={() => handleEmailReport(selectedMonth)} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", cursor: "pointer", background: "#007AFF", color: "#fff", fontSize: 15, fontWeight: 600 }}>📧 Email Monthly Report</button>
              </div>
            ))}

            {summaryTab === "yearly" && (
              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 14 }}>Monthly Spending — {selectedMonth.slice(0,4)}</div>
                {Array.from({ length: 12 }, (_, i) => {
                  const mk = `${selectedMonth.slice(0,4)}-${String(i+1).padStart(2,"0")}`;
                  const amt = yearlyByMonth[mk] || 0; const maxAmt = Math.max(...Object.values(yearlyByMonth), 1);
                  return (<div key={mk} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}><span style={{ fontSize: 12, color: "#8E8E93", width: 28, flexShrink: 0 }}>{MONTHS[i].slice(0,3)}</span><div style={{ flex: 1, height: 6, background: "#F2F2F7", borderRadius: 99, overflow: "hidden" }}><div style={{ height: "100%", width: `${(amt/maxAmt)*100}%`, background: "#007AFF", borderRadius: 99 }} /></div><span style={{ fontSize: 13, fontWeight: 500, width: 72, textAlign: "right", color: amt ? "#1C1C1E" : "#C7C7CC" }}>{amt ? fmtShort(amt) : "—"}</span></div>);
                })}
              </div>
            )}

            {summaryTab === "insights" && (!insightsData ? (
              <div style={{ textAlign: "center", padding: "60px 0" }}><div style={{ fontSize: 48, marginBottom: 12 }}>📭</div><div style={{ fontWeight: 600, fontSize: 17, color: "#8E8E93" }}>No data for this month</div></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div className="stat-card"><div style={{ fontSize: 11, color: "#8E8E93", marginBottom: 4 }}>DAILY AVERAGE</div><div style={{ fontSize: 20, fontWeight: 700 }}>{fmtShort(insightsData.dailyAvg)}</div><div style={{ fontSize: 11, color: "#8E8E93", marginTop: 2 }}>on active days</div></div>
                  <div className="stat-card"><div style={{ fontSize: 11, color: "#8E8E93", marginBottom: 4 }}>ACTIVE DAYS</div><div style={{ fontSize: 20, fontWeight: 700 }}>{insightsData.daysActive} / {insightsData.daysInMonth}</div><div style={{ fontSize: 11, color: "#8E8E93", marginTop: 2 }}>{insightsData.noSpendDays} no-spend days</div></div>
                  <div className="stat-card"><div style={{ fontSize: 11, color: "#8E8E93", marginBottom: 4 }}>LONGEST STREAK</div><div style={{ fontSize: 20, fontWeight: 700 }}>{insightsData.maxStreak} days</div><div style={{ fontSize: 11, color: "#8E8E93", marginTop: 2 }}>consecutive</div></div>
                  <div className="stat-card"><div style={{ fontSize: 11, color: "#8E8E93", marginBottom: 4 }}>VS LAST MONTH</div><div style={{ fontSize: 20, fontWeight: 700, color: insightsData.prevSpent === 0 ? "#1C1C1E" : totalSpent > insightsData.prevSpent ? "#FF3B30" : "#34C759" }}>{insightsData.prevSpent === 0 ? "—" : `${totalSpent > insightsData.prevSpent ? "+" : ""}${((totalSpent-insightsData.prevSpent)/insightsData.prevSpent*100).toFixed(0)}%`}</div><div style={{ fontSize: 11, color: "#8E8E93", marginTop: 2 }}>{insightsData.prevSpent > 0 ? fmtShort(insightsData.prevSpent)+" last month" : "no prev data"}</div></div>
                </div>
                {insightsData.highestDay && (<div className="card" style={{ padding: 16 }}><div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 8 }}>HIGHEST SPEND DAY</div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ fontWeight: 600, fontSize: 16 }}>{new Date(insightsData.highestDay[0]+"T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long" })}</div><div style={{ fontWeight: 700, fontSize: 18, color: "#FF3B30" }}>{fmt(insightsData.highestDay[1])}</div></div></div>)}
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 12 }}>SPENDING BY DAY OF WEEK</div>
                  {DAYS.map((d, i) => { const amt = insightsData.weekdayTotals[i]; const maxDay = Math.max(...insightsData.weekdayTotals, 1); const isTop = i === insightsData.topWeekday && amt > 0; return (<div key={d} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}><span style={{ fontSize: 12, color: isTop ? "#007AFF" : "#8E8E93", width: 28, fontWeight: isTop ? 600 : 400 }}>{d}</span><div style={{ flex: 1, height: 6, background: "#F2F2F7", borderRadius: 99, overflow: "hidden" }}><div style={{ height: "100%", width: `${(amt/maxDay)*100}%`, background: isTop ? "#007AFF" : "#C7C7CC", borderRadius: 99 }} /></div><span style={{ fontSize: 12, fontWeight: isTop ? 600 : 400, color: isTop ? "#007AFF" : amt ? "#1C1C1E" : "#C7C7CC", width: 66, textAlign: "right" }}>{amt ? fmtShort(amt) : "—"}</span></div>); })}
                  <div style={{ display: "flex", gap: 10, marginTop: 12, paddingTop: 12, borderTop: "1px solid #F2F2F7" }}>
                    <div style={{ flex: 1, textAlign: "center" }}><div style={{ fontSize: 11, color: "#8E8E93" }}>WEEKDAYS</div><div style={{ fontWeight: 600, fontSize: 15, marginTop: 2 }}>{fmtShort(insightsData.weekdaySpend)}</div></div>
                    <div style={{ width: 1, background: "#F2F2F7" }} />
                    <div style={{ flex: 1, textAlign: "center" }}><div style={{ fontSize: 11, color: "#8E8E93" }}>WEEKENDS</div><div style={{ fontWeight: 600, fontSize: 15, marginTop: 2 }}>{fmtShort(insightsData.weekendSpend)}</div></div>
                  </div>
                </div>
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 12 }}>SPENDING TREND</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ flex: 1, textAlign: "center" }}><div style={{ fontSize: 11, color: "#8E8E93" }}>1ST HALF</div><div style={{ fontWeight: 700, fontSize: 18, marginTop: 4 }}>{fmtShort(insightsData.firstHalf)}</div></div>
                    <div style={{ display: "flex", alignItems: "center", fontSize: 20 }}>{insightsData.secondHalf > insightsData.firstHalf ? "📈" : "📉"}</div>
                    <div style={{ flex: 1, textAlign: "center" }}><div style={{ fontSize: 11, color: "#8E8E93" }}>2ND HALF</div><div style={{ fontWeight: 700, fontSize: 18, marginTop: 4, color: insightsData.secondHalf > insightsData.firstHalf ? "#FF3B30" : "#34C759" }}>{fmtShort(insightsData.secondHalf)}</div></div>
                  </div>
                  <div style={{ fontSize: 12, color: "#8E8E93", textAlign: "center", marginTop: 10 }}>{insightsData.secondHalf > insightsData.firstHalf ? "You spend more in the second half" : "You spend more in the first half"}</div>
                </div>
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 12 }}>TOP 3 SINGLE EXPENSES</div>
                  {insightsData.top3.map((e, i) => { const c = cat(e.category); return (<div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: i < 2 ? "1px solid #F2F2F7" : "none" }}><div style={{ width: 24, height: 24, borderRadius: "50%", background: "#F2F2F7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#8E8E93", flexShrink: 0 }}>{i+1}</div><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 500, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.narration}</div><div style={{ fontSize: 11, color: "#8E8E93", marginTop: 2 }}>{c.label} · {e.date}</div></div><div style={{ fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{fmt(e.amount)}</div></div>); })}
                </div>
                <button onClick={() => handleEmailReport(selectedMonth)} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", cursor: "pointer", background: "#007AFF", color: "#fff", fontSize: 15, fontWeight: 600 }}>📧 Email Full Report</button>
              </div>
            ))}
          </div>
        )}

        {/* SETTINGS */}
        {tab === "settings" && (
          <div style={{ padding: "20px" }}>
            <h1 style={{ fontSize: 34, fontWeight: 700, marginBottom: 24, letterSpacing: -0.5 }}>Settings</h1>

            <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 6, paddingLeft: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Google Drive Sync</div>
            <div className="card" style={{ marginBottom: 24 }}>
              {googleUser ? (
                <div style={{ padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    {googleUser.picture && <img src={googleUser.picture} style={{ width: 36, height: 36, borderRadius: "50%" }} alt="" />}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{googleUser.name}</div>
                      <div style={{ fontSize: 12, color: "#8E8E93" }}>{googleUser.email}</div>
                    </div>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: si?.color || "#8E8E93" }} />
                  </div>
                  <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                    <button onClick={() => loadFromDrive(googleToken)} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", cursor: "pointer", background: "#007AFF22", color: "#007AFF", fontSize: 14, fontWeight: 600 }}>
                      🔄 Sync Now
                    </button>
                    <button onClick={handleGoogleLogout} style={{ padding: "11px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: "#FFE5E5", color: "#FF3B30", fontSize: 14, fontWeight: 600 }}>Sign Out</button>
                  </div>
                  {lastSyncedAt && <div style={{ fontSize: 11, color: "#8E8E93", textAlign: "center" }}>Last synced: {new Date(lastSyncedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>}
                  {pendingSync && <div style={{ fontSize: 11, color: "#FF9500", textAlign: "center", marginTop: 4 }}>⚠ Changes pending sync</div>}
                </div>
              ) : (
                <button onClick={handleGoogleLogin} style={{ width: "100%", padding: "16px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#1C1C1E" }}>Connect Google Drive</span>
                </button>
              )}
            </div>

            <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 6, paddingLeft: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Budget</div>
            <div className="card" style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", padding: "16px", justifyContent: "space-between" }}>
                <div><div style={{ fontWeight: 500, fontSize: 16 }}>Monthly Budget</div><div style={{ fontSize: 14, color: "#8E8E93", marginTop: 2 }}>{totalBudget ? fmt(parseFloat(totalBudget)) : "Not set"}</div></div>
                <button onClick={() => { setEditBudget(totalBudget); setShowBudgetEdit(true); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#007AFF", fontSize: 15, fontWeight: 500 }}>Edit</button>
              </div>
            </div>

            <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 6, paddingLeft: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Local Backup</div>
            <div className="card" style={{ marginBottom: 24 }}>
              <div style={{ display: "flex" }}>
                <button onClick={handleExport} style={{ flex: 1, padding: "16px", background: "none", border: "none", cursor: "pointer", borderRight: "1px solid #F2F2F7", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 24 }}>📤</span><span style={{ fontSize: 14, fontWeight: 600, color: "#007AFF" }}>Export</span><span style={{ fontSize: 11, color: "#8E8E93" }}>Save file</span>
                </button>
                <button onClick={() => importRef.current.click()} style={{ flex: 1, padding: "16px", background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 24 }}>📥</span><span style={{ fontSize: 14, fontWeight: 600, color: "#007AFF" }}>Import</span><span style={{ fontSize: 11, color: "#8E8E93" }}>Restore</span>
                </button>
                <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImport} />
              </div>
            </div>

            <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 6, paddingLeft: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Categories — hold ☰ to drag</div>
            <div className="card" style={{ marginBottom: 12 }}>
              {categories.map((c, i) => (
                <div key={c.id} data-cat-idx={i} className={`drag-row${dragOverIdx === i ? " over" : ""}`}
                  draggable onDragStart={() => handleDragStart(i)} onDragOver={e => handleDragOver(e, i)} onDrop={() => handleDrop(i)} onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                  style={{ display: "flex", alignItems: "center", padding: "12px 16px", gap: 10, borderBottom: i < categories.length-1 ? "1px solid #F2F2F7" : "none", opacity: dragIdx === i ? 0.4 : 1, touchAction: "none" }}>
                  <span style={{ fontSize: 18, color: "#C7C7CC", cursor: "grab", padding: "4px", userSelect: "none" }} onTouchStart={e => handleTouchStart(e, i)} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>☰</span>
                  <div style={{ width: 14, height: 14, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontWeight: 500, fontSize: 15 }}>{c.label}</span>
                  <button onClick={() => setDeleteConfirmCat(c)} style={{ background: "#FFE5E5", border: "none", cursor: "pointer", color: "#FF3B30", fontSize: 13, fontWeight: 500, padding: "5px 12px", borderRadius: 8 }}>Delete</button>
                </div>
              ))}
            </div>
            <button onClick={() => setShowNewCat(true)} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "1.5px dashed #C7C7CC", background: "none", cursor: "pointer", color: "#007AFF", fontSize: 15, fontWeight: 600 }}>+ Add New Category</button>
          </div>
        )}
      </div>

      {/* BOTTOM NAV */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "rgba(255,255,255,.92)", borderTop: "1px solid #E5E5EA", backdropFilter: "blur(20px)", display: "flex", paddingBottom: 16, zIndex: 50 }}>
        {TABS.map(t => (
          <button key={t.id} className="nav-btn" onClick={() => setTab(t.id)}>
            <div style={{ fontSize: t.id === "add" ? 18 : 17, width: 28, height: 28, borderRadius: t.id === "add" ? "50%" : 6, background: t.id === "add" ? (tab === "add" ? "#007AFF" : "#C7C7CC") : "none", display: "flex", alignItems: "center", justifyContent: "center", color: t.id === "add" ? "#fff" : (tab === t.id ? "#007AFF" : "#8E8E93") }}>{t.icon}</div>
            <span style={{ fontSize: 11, color: tab === t.id ? "#007AFF" : "#8E8E93", fontWeight: tab === t.id ? 600 : 400 }}>{t.label}</span>
          </button>
        ))}
      </div>

      {/* BACKUP REMINDER */}
      {showBackupReminder && (
        <div className="modal-bg" onClick={() => setShowBackupReminder(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🔔</div>
              <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Connect Google Drive</div>
              <div style={{ color: "#8E8E93", fontSize: 15 }}>Connect Google Drive to automatically sync your data across all devices and never lose it.</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button className="pill-btn" style={{ width: "100%", background: "#007AFF", color: "#fff" }} onClick={() => { handleGoogleLogin(); setShowBackupReminder(false); }}>Connect Google Drive</button>
              <button className="pill-btn" style={{ width: "100%", background: "#F2F2F7", color: "#1C1C1E" }} onClick={() => setShowBackupReminder(false)}>Later</button>
            </div>
          </div>
        </div>
      )}

      {/* MODALS */}
      {deleteId && (<div className="modal-bg" onClick={() => setDeleteId(null)}><div className="modal-sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle" /><div style={{ fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Delete expense?</div><div style={{ color: "#8E8E93", fontSize: 15, marginBottom: 24 }}>This cannot be undone.</div><div style={{ display: "flex", gap: 12 }}><button className="pill-btn" style={{ flex: 1, background: "#F2F2F7", color: "#1C1C1E" }} onClick={() => setDeleteId(null)}>Cancel</button><button className="pill-btn" style={{ flex: 1, background: "#FF3B30", color: "#fff" }} onClick={() => { const newExp = expenses.filter(e => e.id !== deleteId); setExpenses(newExp); setDeleteId(null); showToast("Deleted", false); if (googleToken) { setSyncStatus("syncing"); clearTimeout(syncTimeoutRef.current); syncTimeoutRef.current = setTimeout(async () => { const ok = await saveToDrive(googleToken, newExp, categories, totalBudget, driveFileId); setSyncStatus(ok ? "synced" : "error"); }, 1500); } }}>Delete</button></div></div></div>)}

      {deleteConfirmCat && (<div className="modal-bg" onClick={() => setDeleteConfirmCat(null)}><div className="modal-sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle" /><div style={{ fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Delete "{deleteConfirmCat.label}"?</div><div style={{ color: "#8E8E93", fontSize: 15, marginBottom: 24 }}>Existing expenses won't be deleted.</div><div style={{ display: "flex", gap: 12 }}><button className="pill-btn" style={{ flex: 1, background: "#F2F2F7", color: "#1C1C1E" }} onClick={() => setDeleteConfirmCat(null)}>Cancel</button><button className="pill-btn" style={{ flex: 1, background: "#FF3B30", color: "#fff" }} onClick={() => handleDeleteCat(deleteConfirmCat.id)}>Delete</button></div></div></div>)}

      {showNewCat && (<div className="modal-bg" onClick={() => setShowNewCat(false)}><div className="modal-sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle" /><div style={{ fontWeight: 700, fontSize: 20, marginBottom: 20 }}>New Category</div><div style={{ display: "flex", flexDirection: "column", gap: 16 }}><div><div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 6 }}>NAME</div><input className="ios-input" placeholder="e.g. Padel" value={newCatLabel} onChange={e => setNewCatLabel(e.target.value)} autoFocus /></div><div><div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 10 }}>COLOR</div><div className="color-row">{COLOR_OPTIONS.map(col => (<button key={col} onClick={() => setNewCatColor(col)} style={{ width: 32, height: 32, borderRadius: "50%", background: col, border: "none", cursor: "pointer", outline: newCatColor === col ? `3px solid ${col}` : "none", outlineOffset: 2, flexShrink: 0 }} />))}</div></div><div style={{ display: "flex", gap: 12, marginTop: 4 }}><button className="pill-btn" style={{ flex: 1, background: "#F2F2F7", color: "#1C1C1E" }} onClick={() => setShowNewCat(false)}>Cancel</button><button className="pill-btn" style={{ flex: 1, background: "#007AFF", color: "#fff" }} onClick={handleAddCategory}>Add</button></div></div></div></div>)}

      {showBudgetEdit && (<div className="modal-bg" onClick={() => setShowBudgetEdit(false)}><div className="modal-sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle" /><div style={{ fontWeight: 700, fontSize: 20, marginBottom: 20 }}>Monthly Budget</div><div style={{ position: "relative", marginBottom: 24 }}><span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 18, color: "#8E8E93" }}>₹</span><input className="ios-input" style={{ paddingLeft: 36, fontSize: 22, fontWeight: 600 }} type="number" min="0" placeholder="0" value={editBudget} onChange={e => setEditBudget(e.target.value)} autoFocus /></div><div style={{ display: "flex", gap: 12 }}><button className="pill-btn" style={{ flex: 1, background: "#F2F2F7", color: "#1C1C1E" }} onClick={() => setShowBudgetEdit(false)}>Cancel</button><button className="pill-btn" style={{ flex: 1, background: "#007AFF", color: "#fff" }} onClick={() => { setTotalBudget(editBudget); setShowBudgetEdit(false); showToast("Budget saved!"); if (googleToken) triggerSync(); }}>Save</button></div></div></div>)}

      {editExpense && (<div className="modal-bg" onClick={() => setEditExpense(null)}><div className="modal-sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle" /><div style={{ fontWeight: 700, fontSize: 20, marginBottom: 20 }}>Edit Expense</div><div style={{ display: "flex", flexDirection: "column", gap: 14 }}><div><div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 6 }}>AMOUNT</div><div style={{ position: "relative" }}><span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 18, color: "#8E8E93" }}>₹</span><input className="ios-input" style={{ paddingLeft: 36, fontSize: 20, fontWeight: 600 }} type="number" min="0" value={editExpense.amount} onChange={e => setEditExpense(p => ({ ...p, amount: e.target.value }))} /></div></div><div><div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 6 }}>NARRATION</div><input className="ios-input" value={editExpense.narration} onChange={e => setEditExpense(p => ({ ...p, narration: e.target.value }))} /></div><div><div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 8 }}>CATEGORY</div><div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>{categories.map(c => (<button key={c.id} className="cat-chip" style={{ background: editExpense.category === c.id ? c.color : "#fff", color: editExpense.category === c.id ? "#fff" : "#3C3C43", flexShrink: 0 }} onClick={() => setEditExpense(p => ({ ...p, category: c.id }))}><span style={{ width: 8, height: 8, borderRadius: "50%", background: editExpense.category === c.id ? "rgba(255,255,255,0.6)" : c.color, flexShrink: 0 }} />{c.label}</button>))}</div></div><div><div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 6 }}>DATE</div><input className="ios-input" type="date" value={editExpense.date} onChange={e => setEditExpense(p => ({ ...p, date: e.target.value }))} /></div><div style={{ display: "flex", gap: 10, marginTop: 4 }}><button className="pill-btn" style={{ background: "#FFE5E5", color: "#FF3B30" }} onClick={() => { setDeleteId(editExpense.id); setEditExpense(null); }}>Delete</button><button className="pill-btn" style={{ flex: 1, background: "#F2F2F7", color: "#1C1C1E" }} onClick={() => setEditExpense(null)}>Cancel</button><button className="pill-btn" style={{ flex: 1, background: "#007AFF", color: "#fff" }} onClick={handleSaveEdit}>Save</button></div></div></div></div>)}

      {toast && (<div style={{ position: "fixed", bottom: 100, left: "50%", transform: "translateX(-50%)", background: toast.ok ? "rgba(52,199,89,.95)" : "rgba(255,59,48,.95)", color: "#fff", padding: "12px 22px", borderRadius: 12, fontSize: 14, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,.15)", zIndex: 999, whiteSpace: "nowrap" }}>{toast.msg}</div>)}
    </div>
  );
}
