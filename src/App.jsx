import { useState, useMemo, useEffect, useRef } from "react";

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
  { id: "food", label: "Food", icon: "🍴", color: "#FF9500" },
  { id: "transport", label: "Transport", icon: "🚗", color: "#636366" },
  { id: "groceries", label: "Groceries", icon: "🛒", color: "#34C759" },
  { id: "shopping", label: "Shopping", icon: "🛍️", color: "#AF52DE" },
  { id: "entertainment", label: "Entertainment", icon: "🎬", color: "#FF2D55" },
  { id: "bills", label: "Bills", icon: "🔌", color: "#007AFF" },
  { id: "health", label: "Health", icon: "💊", color: "#30B0C7" },
  { id: "travel", label: "Travel", icon: "✈️", color: "#FF9500" },
];

const ICON_OPTIONS = ["🍴","🚗","🛒","🛍️","🎬","🔌","💊","✈️","☕","🎮","📚","🏋️","🐾","🏠","💇","🎁","🍕","🚌","⚽","🎵","💻","🧴","🍺","🌿"];
const COLOR_OPTIONS = ["#FF9500","#FF2D55","#AF52DE","#007AFF","#34C759","#30B0C7","#636366","#FF6B35","#A2845E","#5856D6"];

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const today = () => new Date().toISOString().split("T")[0];
const monthKey = (date) => date.slice(0, 7);
const currentMonth = () => today().slice(0, 7);

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function MonthNav({ value, onChange }) {
  const [y, m] = value.split("-").map(Number);
  const prev = () => { const d = new Date(y, m - 2); onChange(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`); };
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
  const [expenses, setExpenses] = useLocalStorage("et_expenses", []);
  const [categories, setCategories] = useLocalStorage("et_categories", DEFAULT_CATEGORIES);
  const [totalBudget, setTotalBudget] = useLocalStorage("et_budget", "");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());

  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");
  const [selCat, setSelCat] = useState("food");
  const [date, setDate] = useState(today());

  const [deleteId, setDeleteId] = useState(null);
  const [editExpense, setEditExpense] = useState(null);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState("");
  const [newCatIcon, setNewCatIcon] = useState("🎁");
  const [newCatColor, setNewCatColor] = useState("#007AFF");
  const [showBudgetEdit, setShowBudgetEdit] = useState(false);
  const [editBudget, setEditBudget] = useState("");
  const [toast, setToast] = useState(null);
  const [summaryView, setSummaryView] = useState("monthly");
  const [deleteConfirmCat, setDeleteConfirmCat] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const importRef = useRef(null);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2200);
  };

  const cat = (id) => categories.find(c => c.id === id) || { label: id, icon: "•", color: "#ccc" };

  const handleAdd = () => {
    if (!amount || isNaN(+amount) || +amount <= 0) return showToast("Enter a valid amount", false);
    if (!narration.trim()) return showToast("Add a narration", false);
    setExpenses(p => [{ id: Date.now(), amount: parseFloat(amount), narration: narration.trim(), category: selCat, date }, ...p]);
    setAmount(""); setNarration("");
    showToast("Expense added!");
  };

  const handleAddCategory = () => {
    if (!newCatLabel.trim()) return showToast("Enter a category name", false);
    const id = newCatLabel.toLowerCase().replace(/\s+/g, "_") + "_" + Date.now();
    setCategories(p => [...p, { id, label: newCatLabel.trim(), icon: newCatIcon, color: newCatColor }]);
    setNewCatLabel(""); setNewCatIcon("🎁"); setNewCatColor("#007AFF");
    setShowNewCat(false);
    showToast("Category added!");
  };

  const handleDeleteCat = (id) => {
    setCategories(p => p.filter(c => c.id !== id));
    setDeleteConfirmCat(null);
    if (selCat === id) setSelCat(categories[0]?.id || "food");
    showToast("Category deleted", false);
  };

  const handleSaveEdit = () => {
    if (!editExpense.amount || isNaN(+editExpense.amount) || +editExpense.amount <= 0) return showToast("Enter a valid amount", false);
    if (!editExpense.narration.trim()) return showToast("Add a narration", false);
    setExpenses(p => p.map(e => e.id === editExpense.id ? { ...editExpense, amount: parseFloat(editExpense.amount) } : e));
    setEditExpense(null);
    showToast("Expense updated!");
  };

  // ── DRAG TO REORDER CATEGORIES (mouse + touch) ──
  const handleDragStart = (i) => setDragIdx(i);
  const handleDragOver = (e, i) => { e.preventDefault(); setDragOverIdx(i); };
  const handleDrop = (i) => {
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setDragOverIdx(null); return; }
    const updated = [...categories];
    const [moved] = updated.splice(dragIdx, 1);
    updated.splice(i, 0, moved);
    setCategories(updated);
    setDragIdx(null); setDragOverIdx(null);
  };

  const touchDragIdx = useRef(null);

  const handleTouchStart = (e, i) => {
    touchDragIdx.current = i;
    setDragIdx(i);
  };

  const handleTouchMove = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const row = el?.closest("[data-cat-idx]");
    if (row) {
      const idx = parseInt(row.getAttribute("data-cat-idx"));
      if (!isNaN(idx)) setDragOverIdx(idx);
    }
  };

  const handleTouchEnd = () => {
    if (touchDragIdx.current !== null && dragOverIdx !== null && touchDragIdx.current !== dragOverIdx) {
      const updated = [...categories];
      const [moved] = updated.splice(touchDragIdx.current, 1);
      updated.splice(dragOverIdx, 0, moved);
      setCategories(updated);
    }
    touchDragIdx.current = null;
    setDragIdx(null); setDragOverIdx(null);
  };

  // ── EXPORT ──
  const handleExport = () => {
    const data = { expenses, categories, totalBudget, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `expenses-backup-${today()}.json`;
    a.click(); URL.revokeObjectURL(url);
    showToast("Data exported!");
  };

  // ── IMPORT ──
  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.expenses) setExpenses(data.expenses);
        if (data.categories) setCategories(data.categories);
        if (data.totalBudget !== undefined) setTotalBudget(data.totalBudget);
        showToast("Data imported!");
      } catch { showToast("Invalid file", false); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const monthExpenses = useMemo(() =>
    expenses.filter(e => monthKey(e.date) === selectedMonth), [expenses, selectedMonth]);

  const totalSpent = useMemo(() =>
    monthExpenses.reduce((s, e) => s + e.amount, 0), [monthExpenses]);

  const budget = parseFloat(totalBudget) || 0;
  const budgetPct = budget > 0 ? Math.min((totalSpent / budget) * 100, 100) : 0;
  const overBudget = budget > 0 && totalSpent > budget;

  const catTotals = useMemo(() => {
    const t = {};
    monthExpenses.forEach(e => { t[e.category] = (t[e.category] || 0) + e.amount; });
    return t;
  }, [monthExpenses]);

  const yearExpenses = useMemo(() => {
    const yr = selectedMonth.slice(0, 4);
    return expenses.filter(e => e.date.startsWith(yr));
  }, [expenses, selectedMonth]);

  const yearlyByMonth = useMemo(() => {
    const map = {};
    yearExpenses.forEach(e => { const mk = monthKey(e.date); map[mk] = (map[mk] || 0) + e.amount; });
    return map;
  }, [yearExpenses]);

  const TABS = [
    { id: "add", label: "Add", icon: "+" },
    { id: "history", label: "History", icon: "≡" },
    { id: "summary", label: "Summary", icon: "◑" },
    { id: "settings", label: "Settings", icon: "⚙" },
  ];

  return (
    <div style={{ fontFamily: "-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif", background: "#F2F2F7", minHeight: "100vh", maxWidth: 430, margin: "0 auto", position: "relative" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        button, input, select { font-family: inherit; }
        ::-webkit-scrollbar { display: none; }
        .cat-chip { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 20px; border: none; cursor: pointer; font-size: 14px; font-weight: 500; white-space: nowrap; transition: all .15s; }
        .card { background: #fff; border-radius: 16px; overflow: hidden; }
        .input-field { background: none; border: none; outline: none; font-size: 15px; width: 100%; color: #1C1C1E; }
        .nav-btn { display: flex; flex-direction: column; align-items: center; gap: 3px; background: none; border: none; cursor: pointer; flex: 1; padding: 8px 0 4px; }
        .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 200; display: flex; align-items: flex-end; justify-content: center; }
        .modal-sheet { background: #F2F2F7; border-radius: 20px 20px 0 0; width: 100%; max-width: 430px; padding: 24px 20px 40px; max-height: 90vh; overflow-y: auto; }
        .sheet-handle { width: 36px; height: 4px; background: #C7C7CC; border-radius: 99px; margin: 0 auto 20px; }
        .ios-input { background: #fff; border-radius: 12px; padding: 14px 16px; font-size: 16px; width: 100%; border: none; outline: none; color: #1C1C1E; }
        .icon-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
        .color-row { display: flex; gap: 10px; flex-wrap: wrap; }
        .pill-btn { padding: 10px 20px; border-radius: 12px; border: none; cursor: pointer; font-size: 15px; font-weight: 600; }
        .drag-row { transition: background .15s; }
        .drag-row.over { background: #EBF5FF; border-radius: 12px; }
      `}</style>

      {/* ── TOP HEADER ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(242,242,247,.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid #E5E5EA", padding: "14px 20px 12px", textAlign: "center" }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: "#1C1C1E", letterSpacing: -0.3 }}>💰 Expense Tracker</div>
      </div>

      <div style={{ paddingBottom: 90 }}>

        {/* ── ADD ── */}
        {tab === "add" && (
          <div style={{ padding: "20px" }}>
            <h1 style={{ fontSize: 34, fontWeight: 700, marginBottom: 28, letterSpacing: -0.5 }}>Add Expense</h1>

            <div className="card" style={{ padding: "16px 20px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 10 }}>₹ Amount</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 32, color: amount ? "#1C1C1E" : "#C7C7CC", fontWeight: 300 }}>₹</span>
                <input className="input-field" style={{ fontSize: 36, fontWeight: 300, color: amount ? "#1C1C1E" : "#C7C7CC" }}
                  type="number" min="0" placeholder="0" value={amount}
                  onChange={e => setAmount(e.target.value)} />
              </div>
            </div>

            <div className="card" style={{ padding: "16px 20px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 10 }}>📝 Narration</div>
              <input className="input-field" style={{ fontSize: 16 }} placeholder="What was this for?"
                value={narration} onChange={e => setNarration(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAdd()} />
            </div>

            <div className="card" style={{ padding: "16px 20px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 12 }}>🏷 Category</div>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                {categories.map(c => (
                  <button key={c.id} className="cat-chip"
                    style={{ background: selCat === c.id ? c.color : "#F2F2F7", color: selCat === c.id ? "#fff" : "#3C3C43" }}
                    onClick={() => setSelCat(c.id)}>
                    {c.icon} {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="card" style={{ padding: "16px 20px", marginBottom: 24 }}>
              <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 10 }}>📅 Date</div>
              <input className="input-field" type="date" value={date}
                style={{ fontSize: 16 }} onChange={e => setDate(e.target.value)} />
            </div>

            <button onClick={handleAdd} style={{
              width: "100%", padding: "18px", borderRadius: 16, border: "none", cursor: "pointer",
              background: amount && narration ? "#007AFF" : "#C7C7CC",
              color: "#fff", fontSize: 17, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "background .2s"
            }}>＋ Add Expense</button>
          </div>
        )}

        {/* ── HISTORY ── */}
        {tab === "history" && (
          <div style={{ padding: "20px" }}>
            <h1 style={{ fontSize: 34, fontWeight: 700, marginBottom: 20, letterSpacing: -0.5 }}>History</h1>
            <MonthNav value={selectedMonth} onChange={setSelectedMonth} />

            {monthExpenses.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 0" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                <div style={{ fontWeight: 600, fontSize: 17, color: "#8E8E93" }}>No transactions</div>
                <div style={{ fontSize: 14, color: "#C7C7CC", marginTop: 6 }}>Expenses you add will appear here</div>
              </div>
            ) : (
              <>
                <div className="card" style={{ marginBottom: 16 }}>
                  {monthExpenses.map((e, i) => {
                    const c = cat(e.category);
                    return (
                      <div key={e.id} style={{
                        display: "flex", alignItems: "center", padding: "14px 16px", gap: 12,
                        borderBottom: i < monthExpenses.length - 1 ? "1px solid #F2F2F7" : "none", cursor: "pointer"
                      }} onClick={() => setEditExpense({ ...e, amount: String(e.amount) })}>
                        <div style={{ width: 40, height: 40, borderRadius: 12, background: c.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                          {c.icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.narration}</div>
                          <div style={{ fontSize: 12, color: "#8E8E93", marginTop: 2 }}>
                            {c.label} · {new Date(e.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          </div>
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

        {/* ── SUMMARY ── */}
        {tab === "summary" && (
          <div style={{ padding: "20px" }}>
            <h1 style={{ fontSize: 34, fontWeight: 700, marginBottom: 20, letterSpacing: -0.5 }}>Summary</h1>
            <MonthNav value={selectedMonth} onChange={setSelectedMonth} />

            <div style={{ display: "flex", background: "#E5E5EA", borderRadius: 10, padding: 2, marginBottom: 20 }}>
              {["monthly","yearly"].map(v => (
                <button key={v} onClick={() => setSummaryView(v)} style={{
                  flex: 1, padding: "8px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500,
                  background: summaryView === v ? "#fff" : "transparent",
                  color: summaryView === v ? "#1C1C1E" : "#8E8E93",
                  boxShadow: summaryView === v ? "0 1px 3px rgba(0,0,0,.12)" : "none",
                  transition: "all .15s"
                }}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
              ))}
            </div>

            {summaryView === "monthly" ? (
              monthExpenses.length === 0 ? (
                <div style={{ textAlign: "center", padding: "80px 0" }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                  <div style={{ fontWeight: 600, fontSize: 17, color: "#8E8E93" }}>No expenses yet</div>
                  <div style={{ fontSize: 14, color: "#C7C7CC", marginTop: 6 }}>Expenses you add will appear here</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 13, color: "#8E8E93" }}>Total Spent</div>
                        <div style={{ fontSize: 26, fontWeight: 700 }}>{fmt(totalSpent)}</div>
                      </div>
                      {budget > 0 && (
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 13, color: "#8E8E93" }}>Budget</div>
                          <div style={{ fontSize: 26, fontWeight: 700 }}>{fmt(budget)}</div>
                        </div>
                      )}
                    </div>
                    {budget > 0 && (
                      <>
                        <div style={{ height: 8, background: "#F2F2F7", borderRadius: 99, overflow: "hidden", marginBottom: 8 }}>
                          <div style={{ height: "100%", width: `${budgetPct}%`, background: overBudget ? "#FF3B30" : budgetPct >= 80 ? "#FF9500" : "#34C759", borderRadius: 99, transition: "width .4s" }} />
                        </div>
                        <div style={{ fontSize: 13, color: overBudget ? "#FF3B30" : "#8E8E93", textAlign: "right" }}>
                          {overBudget ? `⚠ Over by ${fmt(totalSpent - budget)}` : `${fmt(Math.max(budget - totalSpent, 0))} remaining`}
                        </div>
                      </>
                    )}
                    {!budget && (
                      <button onClick={() => { setEditBudget(totalBudget); setShowBudgetEdit(true); }}
                        style={{ marginTop: 4, background: "none", border: "none", cursor: "pointer", color: "#007AFF", fontSize: 14, padding: 0 }}>
                        + Set monthly budget
                      </button>
                    )}
                  </div>

                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 14 }}>By Category</div>
                    {Object.entries(catTotals).sort((a, b) => b[1] - a[1]).map(([cid, spent]) => {
                      const c = cat(cid);
                      const pct = totalSpent > 0 ? (spent / totalSpent) * 100 : 0;
                      return (
                        <div key={cid} style={{ marginBottom: 14 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                            <span style={{ fontSize: 18 }}>{c.icon}</span>
                            <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{c.label}</span>
                            <span style={{ fontSize: 12, color: "#8E8E93" }}>{Math.round(pct)}%</span>
                            <span style={{ fontSize: 14, fontWeight: 600 }}>{fmt(spent)}</span>
                          </div>
                          <div style={{ height: 5, background: "#F2F2F7", borderRadius: 99, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: c.color, borderRadius: 99 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            ) : (
              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 14 }}>Monthly Spending — {selectedMonth.slice(0,4)}</div>
                {Array.from({ length: 12 }, (_, i) => {
                  const mk = `${selectedMonth.slice(0,4)}-${String(i+1).padStart(2,"0")}`;
                  const amt = yearlyByMonth[mk] || 0;
                  const maxAmt = Math.max(...Object.values(yearlyByMonth), 1);
                  return (
                    <div key={mk} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 12, color: "#8E8E93", width: 28, flexShrink: 0 }}>{MONTHS[i].slice(0,3)}</span>
                      <div style={{ flex: 1, height: 6, background: "#F2F2F7", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(amt / maxAmt) * 100}%`, background: "#007AFF", borderRadius: 99 }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 500, width: 80, textAlign: "right", color: amt ? "#1C1C1E" : "#C7C7CC" }}>
                        {amt ? fmt(amt) : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab === "settings" && (
          <div style={{ padding: "20px" }}>
            <h1 style={{ fontSize: 34, fontWeight: 700, marginBottom: 24, letterSpacing: -0.5 }}>Settings</h1>

            {/* Budget */}
            <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 6, paddingLeft: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Budget</div>
            <div className="card" style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", padding: "16px", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 16 }}>Monthly Budget</div>
                  <div style={{ fontSize: 14, color: "#8E8E93", marginTop: 2 }}>{totalBudget ? fmt(parseFloat(totalBudget)) : "Not set"}</div>
                </div>
                <button onClick={() => { setEditBudget(totalBudget); setShowBudgetEdit(true); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#007AFF", fontSize: 15, fontWeight: 500 }}>Edit</button>
              </div>
            </div>

            {/* Data backup */}
            <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 6, paddingLeft: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Data Backup</div>
            <div className="card" style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", gap: 0 }}>
                <button onClick={handleExport} style={{
                  flex: 1, padding: "16px", background: "none", border: "none", cursor: "pointer",
                  borderRight: "1px solid #F2F2F7", display: "flex", flexDirection: "column", alignItems: "center", gap: 6
                }}>
                  <span style={{ fontSize: 24 }}>📤</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#007AFF" }}>Export</span>
                  <span style={{ fontSize: 11, color: "#8E8E93" }}>Save a backup file</span>
                </button>
                <button onClick={() => importRef.current.click()} style={{
                  flex: 1, padding: "16px", background: "none", border: "none", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 6
                }}>
                  <span style={{ fontSize: 24 }}>📥</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#007AFF" }}>Import</span>
                  <span style={{ fontSize: 11, color: "#8E8E93" }}>Restore from backup</span>
                </button>
                <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImport} />
              </div>
            </div>

            {/* Categories */}
            <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 6, paddingLeft: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Categories <span style={{ fontSize: 11, textTransform: "none", letterSpacing: 0 }}>— hold ☰ and drag to reorder</span>
            </div>
            <div className="card" style={{ marginBottom: 12 }}>
              {categories.map((c, i) => (
                <div key={c.id}
                  data-cat-idx={i}
                  className={`drag-row${dragOverIdx === i ? " over" : ""}`}
                  draggable
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={e => handleDragOver(e, i)}
                  onDrop={() => handleDrop(i)}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                  style={{ display: "flex", alignItems: "center", padding: "12px 16px", gap: 10, borderBottom: i < categories.length - 1 ? "1px solid #F2F2F7" : "none", opacity: dragIdx === i ? 0.4 : 1, touchAction: "none" }}>
                  <span
                    style={{ fontSize: 20, color: "#C7C7CC", cursor: "grab", padding: "4px", touchAction: "none", userSelect: "none" }}
                    onTouchStart={e => handleTouchStart(e, i)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                  >☰</span>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: c.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>
                    {c.icon}
                  </div>
                  <span style={{ flex: 1, fontWeight: 500, fontSize: 15 }}>{c.label}</span>
                  <button onClick={() => setDeleteConfirmCat(c)}
                    style={{ background: "#FFE5E5", border: "none", cursor: "pointer", color: "#FF3B30", fontSize: 13, fontWeight: 500, padding: "5px 12px", borderRadius: 8 }}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setShowNewCat(true)} style={{
              width: "100%", padding: "14px", borderRadius: 12, border: "1.5px dashed #C7C7CC",
              background: "none", cursor: "pointer", color: "#007AFF", fontSize: 15, fontWeight: 600
            }}>+ Add New Category</button>
          </div>
        )}
      </div>

      {/* ── BOTTOM NAV ── */}
      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430,
        background: "rgba(255,255,255,.92)", borderTop: "1px solid #E5E5EA",
        backdropFilter: "blur(20px)", display: "flex", paddingBottom: 16, zIndex: 50
      }}>
        {TABS.map(t => (
          <button key={t.id} className="nav-btn" onClick={() => setTab(t.id)}>
            <div style={{
              width: 28, height: 28, borderRadius: t.id === "add" ? "50%" : 8,
              background: t.id === "add" ? (tab === "add" ? "#007AFF" : "#C7C7CC") : "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: t.id === "add" ? 20 : 22, color: t.id === "add" ? "#fff" : (tab === t.id ? "#007AFF" : "#8E8E93"),
              fontWeight: t.id === "add" ? 300 : 400
            }}>{t.icon}</div>
            <span style={{ fontSize: 11, color: tab === t.id ? "#007AFF" : "#8E8E93", fontWeight: tab === t.id ? 600 : 400 }}>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── DELETE EXPENSE MODAL ── */}
      {deleteId && (
        <div className="modal-bg" onClick={() => setDeleteId(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Delete expense?</div>
            <div style={{ color: "#8E8E93", fontSize: 15, marginBottom: 24 }}>This cannot be undone.</div>
            <div style={{ display: "flex", gap: 12 }}>
              <button className="pill-btn" style={{ flex: 1, background: "#F2F2F7", color: "#1C1C1E" }} onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="pill-btn" style={{ flex: 1, background: "#FF3B30", color: "#fff" }} onClick={() => {
                setExpenses(p => p.filter(e => e.id !== deleteId));
                setDeleteId(null); showToast("Deleted", false);
              }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CATEGORY CONFIRM ── */}
      {deleteConfirmCat && (
        <div className="modal-bg" onClick={() => setDeleteConfirmCat(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Delete "{deleteConfirmCat.label}"?</div>
            <div style={{ color: "#8E8E93", fontSize: 15, marginBottom: 24 }}>Existing expenses in this category won't be deleted.</div>
            <div style={{ display: "flex", gap: 12 }}>
              <button className="pill-btn" style={{ flex: 1, background: "#F2F2F7", color: "#1C1C1E" }} onClick={() => setDeleteConfirmCat(null)}>Cancel</button>
              <button className="pill-btn" style={{ flex: 1, background: "#FF3B30", color: "#fff" }} onClick={() => handleDeleteCat(deleteConfirmCat.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── NEW CATEGORY SHEET ── */}
      {showNewCat && (
        <div className="modal-bg" onClick={() => setShowNewCat(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 20 }}>New Category</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 6 }}>NAME</div>
                <input className="ios-input" placeholder="e.g. Subscriptions" value={newCatLabel}
                  onChange={e => setNewCatLabel(e.target.value)} autoFocus />
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 10 }}>ICON</div>
                <div className="icon-grid">
                  {ICON_OPTIONS.map(ic => (
                    <button key={ic} onClick={() => setNewCatIcon(ic)} style={{
                      fontSize: 22, padding: "6px", borderRadius: 10, border: "none", cursor: "pointer",
                      background: newCatIcon === ic ? "#007AFF22" : "#fff",
                      outline: newCatIcon === ic ? "2px solid #007AFF" : "none"
                    }}>{ic}</button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 10 }}>COLOR</div>
                <div className="color-row">
                  {COLOR_OPTIONS.map(col => (
                    <button key={col} onClick={() => setNewCatColor(col)} style={{
                      width: 32, height: 32, borderRadius: "50%", background: col, border: "none", cursor: "pointer",
                      outline: newCatColor === col ? `3px solid ${col}` : "none", outlineOffset: 2, flexShrink: 0
                    }} />
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                <button className="pill-btn" style={{ flex: 1, background: "#F2F2F7", color: "#1C1C1E" }} onClick={() => setShowNewCat(false)}>Cancel</button>
                <button className="pill-btn" style={{ flex: 1, background: "#007AFF", color: "#fff" }} onClick={handleAddCategory}>Add</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── BUDGET EDIT SHEET ── */}
      {showBudgetEdit && (
        <div className="modal-bg" onClick={() => setShowBudgetEdit(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 20 }}>Monthly Budget</div>
            <div style={{ position: "relative", marginBottom: 24 }}>
              <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 18, color: "#8E8E93" }}>₹</span>
              <input className="ios-input" style={{ paddingLeft: 36, fontSize: 22, fontWeight: 600 }}
                type="number" min="0" placeholder="0" value={editBudget}
                onChange={e => setEditBudget(e.target.value)} autoFocus />
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button className="pill-btn" style={{ flex: 1, background: "#F2F2F7", color: "#1C1C1E" }} onClick={() => setShowBudgetEdit(false)}>Cancel</button>
              <button className="pill-btn" style={{ flex: 1, background: "#007AFF", color: "#fff" }} onClick={() => {
                setTotalBudget(editBudget); setShowBudgetEdit(false); showToast("Budget saved!");
              }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT EXPENSE SHEET ── */}
      {editExpense && (
        <div className="modal-bg" onClick={() => setEditExpense(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 20 }}>Edit Expense</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 6 }}>AMOUNT</div>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 18, color: "#8E8E93" }}>₹</span>
                  <input className="ios-input" style={{ paddingLeft: 36, fontSize: 20, fontWeight: 600 }}
                    type="number" min="0" value={editExpense.amount}
                    onChange={e => setEditExpense(p => ({ ...p, amount: e.target.value }))} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 6 }}>NARRATION</div>
                <input className="ios-input" placeholder="What was this for?"
                  value={editExpense.narration}
                  onChange={e => setEditExpense(p => ({ ...p, narration: e.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 8 }}>CATEGORY</div>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                  {categories.map(c => (
                    <button key={c.id} className="cat-chip"
                      style={{ background: editExpense.category === c.id ? c.color : "#fff", color: editExpense.category === c.id ? "#fff" : "#3C3C43", flexShrink: 0 }}
                      onClick={() => setEditExpense(p => ({ ...p, category: c.id }))}>
                      {c.icon} {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 6 }}>DATE</div>
                <input className="ios-input" type="date" value={editExpense.date}
                  onChange={e => setEditExpense(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button className="pill-btn" style={{ background: "#FFE5E5", color: "#FF3B30" }}
                  onClick={() => { setDeleteId(editExpense.id); setEditExpense(null); }}>Delete</button>
                <button className="pill-btn" style={{ flex: 1, background: "#F2F2F7", color: "#1C1C1E" }}
                  onClick={() => setEditExpense(null)}>Cancel</button>
                <button className="pill-btn" style={{ flex: 1, background: "#007AFF", color: "#fff" }}
                  onClick={handleSaveEdit}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 100, left: "50%", transform: "translateX(-50%)",
          background: toast.ok ? "rgba(52,199,89,.95)" : "rgba(255,59,48,.95)",
          color: "#fff", padding: "12px 22px", borderRadius: 12, fontSize: 14, fontWeight: 600,
          boxShadow: "0 4px 20px rgba(0,0,0,.15)", zIndex: 999, whiteSpace: "nowrap"
        }}>{toast.msg}</div>
      )}
    </div>
  );
}
