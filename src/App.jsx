import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Plus, X, Check, BookOpen, Calendar as CalendarIcon, StickyNote,
  Home, ChevronLeft, ChevronRight, Search, Clock, MapPin, User,
  Trash2, Edit2, AlertCircle, CheckCircle2, Circle, ArrowLeft, Lock,
  MoreHorizontal, Flag
} from "lucide-react";

const FONT_LINK = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap";

const COLORS = ["#3D2FE0", "#FF5A5F", "#16A34A", "#F59E0B", "#0EA5A4", "#DB2777", "#7C3AED", "#2563EB"];
const TYPES = ["Assignment", "Quiz", "Exam", "Project", "Presentation", "Report", "Research", "Reading", "Other"];
const PRIORITIES = ["Low", "Medium", "High"];

const FREE_SUBJECT_LIMIT = 7;
const FREE_ACTIVITY_LIMIT = 20;

const uid = () => crypto.randomUUID();

function loadFont() {
  if (typeof document !== "undefined" && !document.getElementById("takda-font")) {
    const link = document.createElement("link");
    link.id = "takda-font";
    link.rel = "stylesheet";
    link.href = FONT_LINK;
    document.head.appendChild(link);
  }
}

function startOfDay(d) {
  const nd = new Date(d);
  nd.setHours(0, 0, 0, 0);
  return nd;
}

// Deadlines are stored as plain "YYYY-MM-DD" strings. `new Date(str)` parses
// that as UTC midnight, which can silently roll back to the previous day in
// timezones behind UTC. Parsing the parts manually keeps "today"/"overdue"
// aligned with the student's actual local calendar day.
function parseLocalDate(dateStr) {
  if (!dateStr) return new Date(NaN);
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toDate(d) {
  return d instanceof Date ? d : parseLocalDate(d);
}

function computeStatus(activity) {
  if (activity.status === "completed") return "completed";
  const today = startOfDay(new Date());
  const due = parseLocalDate(activity.deadline);
  if (due < today) return "overdue";
  return activity.status === "in_progress" ? "in_progress" : "pending";
}

function urgency(activity) {
  const today = startOfDay(new Date());
  const due = parseLocalDate(activity.deadline);
  const diffDays = Math.round((due - today) / 86400000);
  if (activity.status === "completed") return "done";
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays <= 7) return "week";
  return "later";
}

const URGENCY_STYLE = {
  overdue: { dot: "#FF5A5F", label: "Overdue", text: "#B91C1C", bg: "#FEF2F2" },
  today: { dot: "#FF5A5F", label: "Due Today", text: "#B91C1C", bg: "#FEF2F2" },
  tomorrow: { dot: "#F59E0B", label: "Due Tomorrow", text: "#92400E", bg: "#FFFBEB" },
  week: { dot: "#16A34A", label: "This Week", text: "#166534", bg: "#F0FDF4" },
  later: { dot: "#94A3B8", label: "Upcoming", text: "#475569", bg: "#F8FAFC" },
  done: { dot: "#16A34A", label: "Completed", text: "#166534", bg: "#F0FDF4" },
};

function fmtDate(d) {
  return toDate(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtDateFull(d) {
  return toDate(d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

const STATUS_LABEL = {
  pending: { text: "Pending", color: "#64748B", bg: "#F1F5F9" },
  in_progress: { text: "In Progress", color: "#1D4ED8", bg: "#EFF6FF" },
  completed: { text: "Completed", color: "#166534", bg: "#F0FDF4" },
  overdue: { text: "Overdue", color: "#B91C1C", bg: "#FEF2F2" },
};
function StatusBadge({ status }) {
  const s = STATUS_LABEL[status] || STATUS_LABEL.pending;
  return (
    <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: s.color, background: s.bg }}>
      {s.text}
    </span>
  );
}

const PRIORITY_COLOR = { Low: "#64748B", Medium: "#D97706", High: "#DC2626" };
function PriorityTag({ priority }) {
  if (!priority) return null;
  const color = PRIORITY_COLOR[priority] || PRIORITY_COLOR.Medium;
  return (
    <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium" style={{ color }}>
      <Flag size={10} fill={color} strokeWidth={0} /> {priority}
    </span>
  );
}

export default function TakdaApp({ isPro = false, onUpgrade } = {}) {
  const [ready, setReady] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [activities, setActivities] = useState([]);
  const [notes, setNotes] = useState([]);
  const [grades, setGrades] = useState([]);
  const [view, setView] = useState("dashboard");
  const [activeSubjectId, setActiveSubjectId] = useState(null);
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [editingSubject, setEditingSubject] = useState(null);
  const [editingActivity, setEditingActivity] = useState(null);
  const [defaultSubjectForActivity, setDefaultSubjectForActivity] = useState(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [saveError, setSaveError] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [limitNotice, setLimitNotice] = useState(null);

  useEffect(() => { loadFont(); }, []);

  // load
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("takda-app-data");
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          setSubjects(parsed.subjects || []);
          setActivities(parsed.activities || []);
          setNotes(parsed.notes || []);
          setGrades(parsed.grades || []);
        }
      } catch (e) {
        // no existing data yet
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // save
  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const result = await window.storage.set(
          "takda-app-data",
          JSON.stringify({ subjects, activities, notes, grades })
        );
        setSaveError(!result);
      } catch (e) {
        setSaveError(true);
      }
    })();
  }, [subjects, activities, notes, grades, ready]);

  const subjectMap = useMemo(() => {
    const m = {};
    subjects.forEach((s) => (m[s.id] = s));
    return m;
  }, [subjects]);

  const enrichedActivities = useMemo(
    () =>
      activities.map((a) => ({
        ...a,
        computedStatus: computeStatus(a),
        urgencyKey: urgency(a),
        subject: subjectMap[a.subjectId],
      })),
    [activities, subjectMap]
  );

  const todayList = useMemo(
    () =>
      enrichedActivities
        .filter((a) => a.computedStatus !== "completed" && ["overdue", "today"].includes(a.urgencyKey))
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline)),
    [enrichedActivities]
  );

  const upcomingList = useMemo(
    () =>
      enrichedActivities
        .filter((a) => a.computedStatus !== "completed" && ["tomorrow", "week", "later"].includes(a.urgencyKey))
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
        .slice(0, 6),
    [enrichedActivities]
  );

  const recentlyCompleted = useMemo(
    () =>
      enrichedActivities
        .filter((a) => a.computedStatus === "completed")
        .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0))
        .slice(0, 5),
    [enrichedActivities]
  );

  const stats = useMemo(() => {
    const pending = enrichedActivities.filter((a) => a.computedStatus !== "completed").length;
    const completed = enrichedActivities.filter((a) => a.computedStatus === "completed").length;
    const dueToday = enrichedActivities.filter((a) => a.urgencyKey === "today" || a.urgencyKey === "overdue").length;
    return { subjects: subjects.length, pending, completed, dueToday };
  }, [enrichedActivities, subjects]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good Morning";
    if (h < 18) return "Good Afternoon";
    return "Good Evening";
  }, []);

  function requestAddSubject() {
    if (!isPro && subjects.length >= FREE_SUBJECT_LIMIT) {
      setLimitNotice("subjects");
      return;
    }
    setEditingSubject(null);
    setShowAddSubject(true);
  }

  function saveSubject(subj) {
    const isNewSubject = !subj.id;
    if (isNewSubject && !isPro && subjects.length >= FREE_SUBJECT_LIMIT) {
      // Block before persistence — the free limit may have been reached by
      // the time the modal is submitted (e.g. another tab). Existing
      // subjects are left untouched.
      setShowAddSubject(false);
      setEditingSubject(null);
      setLimitNotice("subjects");
      return;
    }
    if (subj.id) {
      setSubjects((prev) => prev.map((s) => (s.id === subj.id ? subj : s)));
    } else {
      setSubjects((prev) => [...prev, { ...subj, id: uid() }]);
    }
    setShowAddSubject(false);
    setEditingSubject(null);
  }

  function deleteSubject(id) {
    if (!window.confirm("Delete this subject? Its activities and notes will be deleted too.")) return;
    setSubjects((prev) => prev.filter((s) => s.id !== id));
    setActivities((prev) => prev.filter((a) => a.subjectId !== id));
    setNotes((prev) => prev.filter((n) => n.subjectId !== id));
    setGrades((prev) => prev.filter((g) => g.subjectId !== id));
    setActiveSubjectId(null);
    setView("subjects");
  }

  // Strip derived/enriched fields (computedStatus, urgencyKey, subject) before
  // an activity is loaded into the edit form, so they never get written back
  // into storage as if they were real, persisted data.
  function openEditActivity(a) {
    const { computedStatus, urgencyKey, subject, ...raw } = a;
    setEditingActivity(raw);
    setShowAddActivity(true);
  }

  // subjectId is optional so callers that don't pre-select a subject (the
  // mobile FAB) leave defaultSubjectForActivity exactly as before.
  function requestAddActivity(subjectId) {
    if (!isPro && activities.length >= FREE_ACTIVITY_LIMIT) {
      setLimitNotice("activities");
      return;
    }
    if (subjectId !== undefined) setDefaultSubjectForActivity(subjectId);
    setShowAddActivity(true);
  }

  function saveActivity(act) {
    const isNewActivity = !act.id;
    if (isNewActivity && !isPro && activities.length >= FREE_ACTIVITY_LIMIT) {
      // Block before persistence, same as subjects — editing an existing
      // activity never hits this branch since it always has an id.
      setShowAddActivity(false);
      setEditingActivity(null);
      setDefaultSubjectForActivity(null);
      setLimitNotice("activities");
      return;
    }
    const prepared = {
      ...act,
      completedAt: act.status === "completed" ? (act.completedAt || new Date().toISOString()) : null,
    };
    if (prepared.id) {
      setActivities((prev) => prev.map((a) => (a.id === prepared.id ? { ...a, ...prepared } : a)));
    } else {
      setActivities((prev) => [...prev, { ...prepared, id: uid() }]);
    }
    setShowAddActivity(false);
    setEditingActivity(null);
    setDefaultSubjectForActivity(null);
  }

  function toggleComplete(act) {
    setActivities((prev) =>
      prev.map((a) => {
        if (a.id !== act.id) return a;
        if (a.status === "completed") {
          // Restore whatever status it had before completion (e.g. "in_progress")
          // instead of always dropping back to "pending".
          return { ...a, status: a.previousStatus || "pending", completedAt: null };
        }
        return { ...a, previousStatus: a.status, status: "completed", completedAt: new Date().toISOString() };
      })
    );
  }

  function deleteActivity(id) {
    if (!window.confirm("Delete this activity?")) return;
    setActivities((prev) => prev.filter((a) => a.id !== id));
  }

  function saveGrade(grade) {
    const prepared = {
      ...grade,
      score: Number(grade.score),
      totalScore: Number(grade.totalScore),
    };

    if (prepared.id) {
      setGrades((prev) => prev.map((g) => (g.id === prepared.id ? prepared : g)));
    } else {
      setGrades((prev) => [...prev, { ...prepared, id: uid() }]);
    }
  }

  function deleteGrade(id) {
    if (!window.confirm("Delete this grade?")) return;
    setGrades((prev) => prev.filter((g) => g.id !== id));
  }

  if (!ready) {
    return (
      <div style={{ fontFamily: "Inter, sans-serif" }} className="flex items-center justify-center h-full min-h-[500px] text-slate-400">
        Loading Takda…
      </div>
    );
  }

  return (
    <div
      style={{ fontFamily: "Inter, sans-serif", background: "#F5F6FA", color: "#1B1B2F" }}
      className="w-full min-h-[640px] max-w-md mx-auto md:max-w-5xl flex flex-col md:flex-row rounded-2xl overflow-hidden border border-[#E4E4F0] shadow-sm"
    >
      <style>{`
        .font-display { font-family: 'Fraunces', serif; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: #D8D8ED; border-radius: 4px; }
      `}</style>

      <Sidebar view={view} setView={setView} onAddSubject={requestAddSubject} />

      <div className="flex-1 flex flex-col min-h-[640px] max-h-[85vh] md:max-h-[720px] overflow-hidden">
        <div className="flex-1 overflow-y-auto pb-24 md:pb-6">
          {saveError && (
            <div className="mx-5 mt-4 md:mx-8 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-2">
              Your changes couldn't be saved just now — they may not be here after a refresh.
            </div>
          )}
          {view === "dashboard" && (
            <Dashboard
              greeting={greeting}
              stats={stats}
              todayList={todayList}
              upcomingList={upcomingList}
              recentlyCompleted={recentlyCompleted}
              onToggle={toggleComplete}
              onOpenSubject={(id) => { setActiveSubjectId(id); setView("subject-detail"); }}
              onAddSubject={requestAddSubject}
            />
          )}

          {view === "subjects" && (
            <SubjectsView
              subjects={subjects}
              activities={enrichedActivities}
              onOpen={(id) => { setActiveSubjectId(id); setView("subject-detail"); }}
              onAdd={requestAddSubject}
            />
          )}

          {view === "subject-detail" && activeSubjectId && subjectMap[activeSubjectId] && (
            <SubjectDetail
              subject={subjectMap[activeSubjectId]}
              activities={enrichedActivities.filter((a) => a.subjectId === activeSubjectId)}
              notes={notes.filter((n) => n.subjectId === activeSubjectId)}
              onBack={() => setView("subjects")}
              onEditSubject={() => { setEditingSubject(subjectMap[activeSubjectId]); setShowAddSubject(true); }}
              onDeleteSubject={() => deleteSubject(activeSubjectId)}
              onToggle={toggleComplete}
              onEditActivity={openEditActivity}
              onDeleteActivity={deleteActivity}
              onAddActivity={() => requestAddActivity(activeSubjectId)}
              onAddNote={(body) => setNotes((prev) => [...prev, { id: uid(), subjectId: activeSubjectId, body, updatedAt: new Date().toISOString() }])}
              onDeleteNote={(id) => { if (window.confirm("Delete this note?")) setNotes((prev) => prev.filter((n) => n.id !== id)); }}
            />
          )}

          {view === "calendar" && (
            <CalendarView activities={enrichedActivities} onToggle={toggleComplete} onOpenSubject={(id) => { setActiveSubjectId(id); setView("subject-detail"); }} />
          )}

          {view === "notes" && (
            <NotesView
              notes={notes}
              subjectMap={subjectMap}
              onAdd={(subjectId, body) => setNotes((prev) => [...prev, { id: uid(), subjectId, body, updatedAt: new Date().toISOString() }])}
              onDelete={(id) => { if (window.confirm("Delete this note?")) setNotes((prev) => prev.filter((n) => n.id !== id)); }}
              subjects={subjects}
            />
          )}

          {view === "activities" && (
            <AllActivities
              activities={enrichedActivities}
              query={query}
              setQuery={setQuery}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              onToggle={toggleComplete}
              onEdit={openEditActivity}
              onDelete={deleteActivity}
              onAdd={() => requestAddActivity()}
            />
          )}

          {view === "grades" && (
            isPro ? (
              <GradesView
                grades={grades}
                subjects={subjects}
                subjectMap={subjectMap}
                onSave={saveGrade}
                onDelete={deleteGrade}
              />
            ) : (
              <GradeLockedView onUpgrade={onUpgrade} />
            )
          )}
        </div>

        <MobileNav view={view} setView={setView} onFab={() => requestAddActivity()} onMore={() => setShowMore(true)} />
      </div>

      {showMore && (
        <MoreSheet
          onClose={() => setShowMore(false)}
          onNavigate={(key) => { setView(key); setShowMore(false); }}
        />
      )}

      {(showAddSubject) && (
        <SubjectModal
          subject={editingSubject}
          onClose={() => { setShowAddSubject(false); setEditingSubject(null); }}
          onSave={saveSubject}
        />
      )}

      {(showAddActivity) && (
        <ActivityModal
          activity={editingActivity}
          subjects={subjects}
          defaultSubjectId={defaultSubjectForActivity}
          onClose={() => { setShowAddActivity(false); setEditingActivity(null); setDefaultSubjectForActivity(null); }}
          onSave={saveActivity}
        />
      )}

      {limitNotice && (
        <LimitReachedModal
          kind={limitNotice}
          onClose={() => setLimitNotice(null)}
          onUpgrade={onUpgrade}
        />
      )}
    </div>
  );
}

/* ---------------- Free plan limit notice ---------------- */
function LimitReachedModal({ kind, onClose, onUpgrade }) {
  const message =
    kind === "subjects"
      ? `You’ve reached the Free plan limit of ${FREE_SUBJECT_LIMIT} subjects. Upgrade to Takda Pro for unlimited subjects.`
      : `You’ve reached the Free plan limit of ${FREE_ACTIVITY_LIMIT} tasks. Upgrade to Takda Pro for unlimited tasks.`;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="takda-pro-badge inline-flex rounded-full px-2 py-1 text-[10px] font-extrabold tracking-wide">
          <span aria-hidden="true">✦</span> PRO
        </span>
        <h3 className="font-display mt-3 text-lg font-semibold text-[#1B1B2F]">Free plan limit reached</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">{message}</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-[#E4E4F0] py-2.5 text-sm font-semibold text-slate-500"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => { onClose(); onUpgrade?.(); }}
            className="flex-1 rounded-xl bg-[#3D2FE0] py-2.5 text-sm font-bold text-white"
          >
            Upgrade to Pro
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Sidebar (desktop) ---------------- */
function Sidebar({ view, setView, onAddSubject }) {
  const items = [
    { key: "dashboard", label: "Dashboard", icon: Home },
    { key: "subjects", label: "Subjects", icon: BookOpen },
    { key: "activities", label: "Activities", icon: CheckCircle2 },
    { key: "calendar", label: "Calendar", icon: CalendarIcon },
    { key: "grades", label: "My Grades", icon: Lock },
    { key: "notes", label: "Notes", icon: StickyNote },
  ];
  return (
    <div className="hidden md:flex md:flex-col w-56 shrink-0 bg-white border-r border-[#E4E4F0] p-5">
      <div className="flex items-center gap-2 mb-8 px-1">
        <img
  src="/takda-icon.png"
  alt="Takda"
  className="w-8 h-8 rounded-lg object-cover"
/>
        <span className="font-display text-xl font-semibold tracking-tight">Takda</span>
      </div>
      <nav className="flex flex-col gap-1">
        {items.map((it) => {
          const Icon = it.icon;
          const active = view === it.key || (it.key === "subjects" && view === "subject-detail");
          return (
            <button
              key={it.key}
              onClick={() => setView(it.key)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors text-left"
              style={{
                background: active ? "#EEECFC" : "transparent",
                color: active ? "#3D2FE0" : "#475569",
              }}
            >
              <Icon size={17} />
              {it.label}
            </button>
          );
        })}
      </nav>
      <button
        onClick={onAddSubject}
        className="mt-6 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white"
        style={{ background: "#3D2FE0" }}
      >
        <Plus size={16} /> Add Subject
      </button>
    </div>
  );
}

/* ---------------- Mobile bottom nav ---------------- */
function MobileNav({ view, setView, onFab, onMore }) {
  const leftItems = [
    { key: "dashboard", label: "Home", icon: Home },
    { key: "subjects", label: "Subjects", icon: BookOpen },
  ];
  const rightItems = [{ key: "calendar", label: "Calendar", icon: CalendarIcon }];
  const moreActive = ["notes", "activities", "grades"].includes(view);
  return (
    <div className="md:hidden absolute bottom-0 left-0 right-0 bg-white border-t border-[#E4E4F0] px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center justify-between">
      {leftItems.map((it) => <NavBtn key={it.key} it={it} active={view === it.key || (it.key === "subjects" && view === "subject-detail")} onClick={() => setView(it.key)} />)}
      <button
        onClick={onFab}
        className="w-12 h-12 -mt-6 rounded-full flex items-center justify-center text-white shadow-lg shrink-0"
        style={{ background: "#3D2FE0" }}
        aria-label="Add activity"
      >
        <Plus size={22} />
      </button>
      {rightItems.map((it) => <NavBtn key={it.key} it={it} active={view === it.key} onClick={() => setView(it.key)} />)}
      <NavBtn it={{ key: "more", label: "More", icon: MoreHorizontal }} active={moreActive} onClick={onMore} />
    </div>
  );
}
function NavBtn({ it, active, onClick }) {
  const Icon = it.icon;
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-0.5 px-3 py-1 flex-1" style={{ color: active ? "#3D2FE0" : "#94A3B8" }}>
      <Icon size={20} />
      <span className="text-[10px] font-semibold">{it.label}</span>
    </button>
  );
}

/* ---------------- Mobile "More" sheet — reaches Notes / Activities / Grades ---------------- */
function MoreSheet({ onClose, onNavigate }) {
  const items = [
    { key: "activities", label: "All Activities", icon: Search, desc: "Search and filter everything" },
    { key: "notes", label: "Notes", icon: StickyNote, desc: "Quick notes per subject" },
    { key: "grades", label: "My Grades", icon: Lock, desc: "Premium — GPA & grade tracker" },
  ];
  return (
    <div className="md:hidden absolute inset-0 bg-black/40 flex items-end justify-center z-50" onClick={onClose}>
      <div className="bg-white w-full rounded-t-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg font-semibold">More</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400"><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-2">
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <button key={it.key} onClick={() => onNavigate(it.key)} className="flex items-center gap-3 rounded-xl border border-[#E4E4F0] p-3 text-left">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#EEECFC" }}>
                  <Icon size={16} color="#3D2FE0" />
                </div>
                <div>
                  <div className="text-sm font-medium">{it.label}</div>
                  <div className="text-[11px] text-slate-500">{it.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */
function Dashboard({ greeting, stats, todayList, upcomingList, recentlyCompleted, onToggle, onOpenSubject, onAddSubject }) {
  return (
    <div className="p-5 md:p-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl md:text-3xl font-semibold">{greeting} 👋</h1>
        <p className="text-sm text-slate-500 mt-1">Here's your academic overview.</p>
      </div>

      <div className="grid grid-cols-4 gap-2 md:gap-3 mb-7">
        <StatCard icon={BookOpen} label="Subjects" value={stats.subjects} color="#3D2FE0" />
        <StatCard icon={Circle} label="Pending" value={stats.pending} color="#F59E0B" />
        <StatCard icon={CheckCircle2} label="Completed" value={stats.completed} color="#16A34A" />
        <StatCard icon={AlertCircle} label="Due Today" value={stats.dueToday} color="#FF5A5F" />
      </div>

      <SectionHeader title="Today's Tasks" />
      {todayList.length === 0 ? (
        <EmptyRow text="Nothing urgent right now. Nice." />
      ) : (
        <div className="flex flex-col gap-2 mb-7">
          {todayList.map((a) => (
            <ActivityRow key={a.id} activity={a} onToggle={onToggle} onOpenSubject={onOpenSubject} />
          ))}
        </div>
      )}

      <SectionHeader title="Upcoming Deadlines" />
      {upcomingList.length === 0 ? (
        <EmptyRow text="No upcoming deadlines yet." />
      ) : (
        <div className="flex flex-col gap-2 mb-7">
          {upcomingList.map((a) => (
            <ActivityRow key={a.id} activity={a} onToggle={onToggle} onOpenSubject={onOpenSubject} compact />
          ))}
        </div>
      )}

      <SectionHeader title="Recently Completed" />
      {recentlyCompleted.length === 0 ? (
        <EmptyRow text="Completed tasks will show up here." />
      ) : (
        <div className="flex flex-col gap-2 mb-4">
          {recentlyCompleted.map((a) => (
            <ActivityRow key={a.id} activity={a} onToggle={onToggle} onOpenSubject={onOpenSubject} compact />
          ))}
        </div>
      )}

      {stats.subjects === 0 && (
        <button onClick={onAddSubject} className="mt-4 w-full rounded-xl border border-dashed border-[#C7C7E8] text-[#3D2FE0] py-3 text-sm font-medium">
          + Add your first subject to get started
        </button>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="rounded-xl bg-white border border-[#E4E4F0] p-3 flex flex-col gap-1.5">
      <Icon size={16} style={{ color }} />
      <div className="font-display text-xl font-semibold leading-none">{value}</div>
      <div className="text-[11px] font-semibold text-slate-500 leading-none">{label}</div>
    </div>
  );
}

function SectionHeader({ title }) {
  return <h2 className="text-sm font-semibold text-slate-700 mb-2.5 mt-1">{title}</h2>;
}

function EmptyRow({ text }) {
  return <div className="text-sm text-slate-400 rounded-xl bg-white border border-dashed border-[#E4E4F0] py-4 px-4 mb-7 text-center">{text}</div>;
}

function ActivityRow({ activity, onToggle, onOpenSubject, compact }) {
  const style = URGENCY_STYLE[activity.urgencyKey] || URGENCY_STYLE.later;
  const done = activity.computedStatus === "completed";
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white border border-[#E4E4F0] p-3">
      <button
        onClick={() => onToggle(activity)}
        className="shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center"
        style={{ borderColor: done ? "#16A34A" : "#CBD5E1", background: done ? "#16A34A" : "transparent" }}
        aria-label="Mark complete"
      >
        {done && <Check size={14} color="white" />}
      </button>
      <div className="flex-1 min-w-0">
        <button className="text-left w-full" onClick={() => activity.subjectId && onOpenSubject(activity.subjectId)}>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: activity.subject?.color || "#94A3B8" }} />
            <span className="text-[11px] font-medium text-slate-500 truncate">{activity.subject?.name || "General"}</span>
            <PriorityTag priority={activity.priority} />
          </div>
          <div className={`text-sm font-medium truncate ${done ? "line-through text-slate-400" : "text-[#1B1B2F]"}`}>{activity.title}</div>
        </button>
      </div>
      {!compact && (
        <span className="shrink-0 text-[11px] font-semibold px-2 py-1 rounded-full" style={{ color: style.text, background: style.bg }}>
          {style.label}
        </span>
      )}
      {compact && <span className="shrink-0 text-[11px] text-slate-400">{fmtDate(activity.deadline)}</span>}
    </div>
  );
}

/* ---------------- Subjects ---------------- */
function SubjectsView({ subjects, activities, onOpen, onAdd }) {
  return (
    <div className="p-5 md:p-8">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display text-2xl font-semibold">My Subjects</h1>
        <button onClick={onAdd} className="flex items-center gap-1.5 text-sm font-semibold text-white rounded-lg px-3 py-2" style={{ background: "#3D2FE0" }}>
          <Plus size={15} /> Add Subject
        </button>
      </div>
      {subjects.length === 0 ? (
        <EmptyRow text="No subjects yet — add one to start tracking assignments." />
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {subjects.map((s) => {
            const subActs = activities.filter((a) => a.subjectId === s.id);
            const pending = subActs.filter((a) => a.computedStatus !== "completed").length;
            const completed = subActs.filter((a) => a.computedStatus === "completed").length;
            return (
              <button
                key={s.id}
                onClick={() => onOpen(s.id)}
                className="text-left rounded-xl bg-white border border-[#E4E4F0] p-4 hover:border-[#3D2FE0] transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="font-display text-lg font-semibold truncate">{s.name}</span>
                </div>
                {s.teacher && <div className="text-xs text-slate-500 mb-1 flex items-center gap-1"><User size={12} />{s.teacher}</div>}
                {s.schedule && <div className="text-xs text-slate-500 mb-3 flex items-center gap-1"><Clock size={12} />{s.schedule}</div>}
                <div className="flex gap-4 text-xs font-semibold">
                  <span className="text-amber-600">{pending} Pending</span>
                  <span className="text-emerald-600">{completed} Completed</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SubjectDetail({ subject, activities, notes, onBack, onEditSubject, onDeleteSubject, onToggle, onEditActivity, onDeleteActivity, onAddActivity, onAddNote, onDeleteNote }) {
  const [noteText, setNoteText] = useState("");
  const pending = activities.filter((a) => a.computedStatus !== "completed");
  const completed = activities.filter((a) => a.computedStatus === "completed");
  return (
    <div className="p-5 md:p-8">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-500 mb-4"><ArrowLeft size={15} /> Subjects</button>
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full" style={{ background: subject.color }} />
          <h1 className="font-display text-2xl font-semibold">{subject.name}</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={onEditSubject} className="p-2 rounded-lg bg-white border border-[#E4E4F0]"><Edit2 size={14} /></button>
          <button onClick={onDeleteSubject} className="p-2 rounded-lg bg-white border border-[#E4E4F0] text-red-500"><Trash2 size={14} /></button>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-slate-500 mb-6">
        {subject.teacher && <span className="flex items-center gap-1"><User size={12} />{subject.teacher}</span>}
        {subject.schedule && <span className="flex items-center gap-1"><Clock size={12} />{subject.schedule}</span>}
        {subject.room && <span className="flex items-center gap-1"><MapPin size={12} />{subject.room}</span>}
      </div>

      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-sm font-semibold text-slate-700">Activities ({pending.length} pending, {completed.length} completed)</h2>
        <button onClick={onAddActivity} className="flex items-center gap-1 text-xs font-semibold" style={{ color: "#3D2FE0" }}><Plus size={13} /> Add</button>
      </div>
      {activities.length === 0 ? (
        <EmptyRow text="No activities for this subject yet." />
      ) : (
        <div className="flex flex-col gap-2 mb-7">
          {activities.sort((a,b)=>new Date(a.deadline)-new Date(b.deadline)).map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-xl bg-white border border-[#E4E4F0] p-3">
              <button onClick={() => onToggle(a)} className="shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center" style={{ borderColor: a.computedStatus === "completed" ? "#16A34A" : "#CBD5E1", background: a.computedStatus === "completed" ? "#16A34A" : "transparent" }}>
                {a.computedStatus === "completed" && <Check size={14} color="white" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${a.computedStatus === "completed" ? "line-through text-slate-400" : ""}`}>{a.title}</div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-[11px] text-slate-500">{a.type} · {fmtDate(a.deadline)}</span>
                  <StatusBadge status={a.computedStatus} />
                  <PriorityTag priority={a.priority} />
                </div>
              </div>
              <button onClick={() => onEditActivity(a)} className="p-1.5 text-slate-400"><Edit2 size={13} /></button>
              <button onClick={() => onDeleteActivity(a.id)} className="p-1.5 text-slate-400"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}

      <h2 className="text-sm font-semibold text-slate-700 mb-2.5">Notes</h2>
      <div className="flex gap-2 mb-3">
        <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Write a quick note…" className="flex-1 rounded-lg border border-[#E4E4F0] px-3 py-2 text-sm outline-none" />
        <button
          onClick={() => { if (noteText.trim()) { onAddNote(noteText.trim()); setNoteText(""); } }}
          className="rounded-lg px-3 py-2 text-sm font-semibold text-white"
          style={{ background: "#3D2FE0" }}
        >Save</button>
      </div>
      <div className="flex flex-col gap-2">
        {notes.length === 0 && <div className="text-sm text-slate-400">No notes yet.</div>}
        {notes.slice().reverse().map((n) => (
          <div key={n.id} className="rounded-xl bg-white border border-[#E4E4F0] p-3 text-sm flex items-start justify-between gap-2">
            <span>{n.body}</span>
            <button onClick={() => onDeleteNote(n.id)} className="text-slate-300 shrink-0"><X size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Calendar ---------------- */
function CalendarView({ activities, onToggle, onOpenSubject }) {
  const [cursor, setCursor] = useState(startOfDay(new Date()));
  const [selected, setSelected] = useState(startOfDay(new Date()));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDay = useMemo(() => {
    const m = {};
    activities.forEach((a) => {
      const key = parseLocalDate(a.deadline).toDateString();
      (m[key] = m[key] || []).push(a);
    });
    return m;
  }, [activities]);

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const selectedList = (byDay[selected.toDateString()] || []).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

  return (
    <div className="p-5 md:p-8">
      <h1 className="font-display text-2xl font-semibold mb-5">Calendar</h1>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-2 rounded-lg bg-white border border-[#E4E4F0]"><ChevronLeft size={16} /></button>
        <span className="font-display text-lg font-semibold">{cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
        <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-2 rounded-lg bg-white border border-[#E4E4F0]"><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400 mb-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1 mb-6">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const key = d.toDateString();
          const items = byDay[key] || [];
          const isSelected = d.toDateString() === selected.toDateString();
          const isToday = d.toDateString() === new Date().toDateString();
          return (
            <button
              key={i}
              onClick={() => setSelected(startOfDay(d))}
              className="aspect-square rounded-lg flex flex-col items-center justify-center relative text-xs"
              style={{
                background: isSelected ? "#3D2FE0" : "white",
                color: isSelected ? "white" : "#1B1B2F",
                border: isToday && !isSelected ? "1.5px solid #3D2FE0" : "1px solid #E4E4F0",
              }}
            >
              {d.getDate()}
              {items.length > 0 && (
                <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full" style={{ background: isSelected ? "white" : "#FF5A5F" }} />
              )}
            </button>
          );
        })}
      </div>

      <h2 className="text-sm font-semibold text-slate-700 mb-2.5">{fmtDateFull(selected)}</h2>
      {selectedList.length === 0 ? (
        <EmptyRow text="Nothing scheduled this day." />
      ) : (
        <div className="flex flex-col gap-2">
          {selectedList.map((a) => (
            <ActivityRow key={a.id} activity={a} onToggle={onToggle} onOpenSubject={onOpenSubject} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Notes ---------------- */
function NotesView({ notes, subjectMap, onAdd, onDelete, subjects }) {
  const [subjectId, setSubjectId] = useState("");
  const [text, setText] = useState("");
  return (
    <div className="p-5 md:p-8">
      <h1 className="font-display text-2xl font-semibold mb-5">Notes</h1>
      <div className="rounded-xl bg-white border border-[#E4E4F0] p-3 mb-6 flex flex-col gap-2">
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="rounded-lg border border-[#E4E4F0] px-2 py-1.5 text-sm outline-none">
          <option value="">General note</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Write something down…" className="rounded-lg border border-[#E4E4F0] px-3 py-2 text-sm outline-none resize-none" />
        <button
          onClick={() => { if (text.trim()) { onAdd(subjectId || null, text.trim()); setText(""); } }}
          className="self-end rounded-lg px-3 py-1.5 text-sm font-semibold text-white"
          style={{ background: "#3D2FE0" }}
        >Save note</button>
      </div>
      {notes.length === 0 ? (
        <EmptyRow text="No notes yet." />
      ) : (
        <div className="flex flex-col gap-2">
          {notes.slice().reverse().map((n) => (
            <div key={n.id} className="rounded-xl bg-white border border-[#E4E4F0] p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <span>{n.body}</span>
                <button onClick={() => onDelete(n.id)} className="text-slate-300 shrink-0"><X size={14} /></button>
              </div>
              {n.subjectId && subjectMap[n.subjectId] && (
                <div className="flex items-center gap-1 mt-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: subjectMap[n.subjectId].color }} />
                  <span className="text-[11px] text-slate-500">{subjectMap[n.subjectId].name}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- All activities (search/filter) ---------------- */
function AllActivities({ activities, query, setQuery, statusFilter, setStatusFilter, onToggle, onEdit, onDelete, onAdd }) {
  const filtered = activities
    .filter((a) => a.title.toLowerCase().includes(query.toLowerCase()) || (a.subject?.name || "").toLowerCase().includes(query.toLowerCase()))
    .filter((a) => statusFilter === "all" || a.computedStatus === statusFilter)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

  return (
    <div className="p-5 md:p-8">
      <div className="flex items-center justify-between gap-3 mb-5">
        <h1 className="font-display text-2xl font-semibold">All Activities</h1>
        <button onClick={onAdd} className="flex items-center gap-1.5 text-sm font-semibold text-white rounded-lg px-3 py-2 shrink-0" style={{ background: "#3D2FE0" }}>
          <Plus size={15} /> Add Activity
        </button>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 flex items-center gap-2 rounded-lg border border-[#E4E4F0] bg-white px-3 py-2">
          <Search size={15} className="text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search activities…" className="flex-1 outline-none text-sm" />
        </div>
      </div>
      <div className="flex gap-1.5 mb-4 overflow-x-auto">
        {["all", "pending", "in_progress", "completed", "overdue"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
            style={{ background: statusFilter === s ? "#3D2FE0" : "white", color: statusFilter === s ? "white" : "#475569", border: "1px solid #E4E4F0" }}
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <EmptyRow text="No activities match your search or filter — try clearing them." />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-xl bg-white border border-[#E4E4F0] p-3">
              <button onClick={() => onToggle(a)} className="shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center" style={{ borderColor: a.computedStatus === "completed" ? "#16A34A" : "#CBD5E1", background: a.computedStatus === "completed" ? "#16A34A" : "transparent" }}>
                {a.computedStatus === "completed" && <Check size={14} color="white" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${a.computedStatus === "completed" ? "line-through text-slate-400" : ""}`}>{a.title}</div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-[11px] text-slate-500">{a.subject?.name || "General"} · {a.type} · {fmtDate(a.deadline)}</span>
                  <StatusBadge status={a.computedStatus} />
                  <PriorityTag priority={a.priority} />
                </div>
              </div>
              <button onClick={() => onEdit(a)} className="p-1.5 text-slate-400"><Edit2 size={13} /></button>
              <button onClick={() => onDelete(a.id)} className="p-1.5 text-slate-400"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Grades ---------------- */
function GradeLockedView({ onUpgrade }) {
  return (
    <div className="p-5 md:p-8">
      <div className="mx-auto max-w-md rounded-2xl border border-[#E4E4F0] bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F5F1E4]">
          <Lock size={20} className="text-amber-700" />
        </div>
        <span className="takda-pro-badge inline-flex rounded-full px-2 py-1 text-[10px] font-extrabold tracking-wide">
          <span aria-hidden="true">✦</span> PRO
        </span>
        <h2 className="font-display mt-4 text-xl font-semibold text-[#1B1B2F]">Grade Tracker</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Track your scores, percentages, and subject averages with Takda Pro.
        </p>
        <button
          type="button"
          onClick={onUpgrade}
          className="mt-6 w-full rounded-xl bg-[#3D2FE0] py-3 text-sm font-bold text-white"
        >
          Upgrade to Pro
        </button>
      </div>
    </div>
  );
}

const GRADE_CATEGORIES = ["Quiz", "Assignment", "Exam", "Project", "Presentation", "Report", "Research", "Other"];

function gradePercent(grade) {
  const score = Number(grade.score);
  const total = Number(grade.totalScore);
  if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0) return 0;
  return (score / total) * 100;
}

function GradesView({ grades, subjects, subjectMap, onSave, onDelete }) {
  const [showModal, setShowModal] = useState(false);
  const [editingGrade, setEditingGrade] = useState(null);
  const [subjectFilter, setSubjectFilter] = useState("all");

  const visibleGrades = useMemo(
    () => grades.filter((g) => subjectFilter === "all" || g.subjectId === subjectFilter),
    [grades, subjectFilter]
  );

  const overallAverage = useMemo(() => {
    if (grades.length === 0) return null;
    return grades.reduce((sum, g) => sum + gradePercent(g), 0) / grades.length;
  }, [grades]);

  const subjectSummaries = useMemo(
    () => subjects.map((subject) => {
      const items = grades.filter((g) => g.subjectId === subject.id);
      const average = items.length
        ? items.reduce((sum, g) => sum + gradePercent(g), 0) / items.length
        : null;
      return { subject, count: items.length, average };
    }),
    [subjects, grades]
  );

  function openEdit(grade) {
    setEditingGrade(grade);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingGrade(null);
  }

  function handleSave(grade) {
    onSave(grade);
    closeModal();
  }

  return (
    <div className="p-5 md:p-8">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-2xl font-semibold">My Grades</h1>
          <p className="text-sm text-slate-500 mt-1">Track scores and see your current performance per subject.</p>
        </div>
        <button
          onClick={() => { setEditingGrade(null); setShowModal(true); }}
          disabled={subjects.length === 0}
          className="flex items-center gap-1.5 text-sm font-semibold text-white rounded-lg px-3 py-2 disabled:opacity-40 shrink-0"
          style={{ background: "#3D2FE0" }}
        >
          <Plus size={15} /> Add Grade
        </button>
      </div>

      {subjects.length === 0 ? (
        <EmptyRow text="Add a subject first before recording grades." />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <div className="rounded-xl bg-white border border-[#E4E4F0] p-4">
              <div className="text-xs text-slate-500 mb-1">Overall Average</div>
              <div className="font-display text-2xl font-semibold">{overallAverage === null ? "—" : `${overallAverage.toFixed(1)}%`}</div>
              <div className="text-[11px] text-slate-400 mt-1">Across {grades.length} recorded {grades.length === 1 ? "grade" : "grades"}</div>
            </div>
            <div className="md:col-span-2 rounded-xl bg-white border border-[#E4E4F0] p-4">
              <div className="text-xs text-slate-500 mb-2">Subject Averages</div>
              <div className="flex flex-wrap gap-2">
                {subjectSummaries.map(({ subject, count, average }) => (
                  <button
                    key={subject.id}
                    onClick={() => setSubjectFilter(subject.id)}
                    className="rounded-lg border border-[#E4E4F0] px-3 py-2 text-left"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: subject.color }} />
                      <span className="text-xs font-medium">{subject.name}</span>
                    </div>
                    <div className="text-sm font-semibold mt-0.5">{average === null ? "—" : `${average.toFixed(1)}%`}</div>
                    <div className="text-[10px] text-slate-400">{count} {count === 1 ? "entry" : "entries"}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="rounded-lg border border-[#E4E4F0] bg-white px-3 py-2 text-sm outline-none"
            >
              <option value="all">All Subjects</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {subjectFilter !== "all" && (
              <button onClick={() => setSubjectFilter("all")} className="text-xs font-medium text-[#3D2FE0]">Clear filter</button>
            )}
          </div>

          {visibleGrades.length === 0 ? (
            <EmptyRow text={grades.length === 0 ? "No grades yet — add your first score." : "No grades recorded for this subject yet."} />
          ) : (
            <div className="flex flex-col gap-2">
              {visibleGrades.map((g) => {
                const percent = gradePercent(g);
                return (
                  <div key={g.id} className="flex items-center gap-3 rounded-xl bg-white border border-[#E4E4F0] p-3">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: subjectMap[g.subjectId]?.color || "#94A3B8" }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{g.title}</div>
                      <div className="text-[11px] text-slate-500 truncate">{subjectMap[g.subjectId]?.name || "Unknown Subject"} · {g.category}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold">{g.score}/{g.totalScore}</div>
                      <div className="text-[11px] text-slate-500">{percent.toFixed(1)}%</div>
                    </div>
                    <button onClick={() => openEdit(g)} className="p-1.5 text-slate-400" aria-label="Edit grade"><Edit2 size={13} /></button>
                    <button onClick={() => onDelete(g.id)} className="p-1.5 text-slate-400" aria-label="Delete grade"><Trash2 size={13} /></button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {showModal && (
        <GradeModal
          grade={editingGrade}
          subjects={subjects}
          onClose={closeModal}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function GradeModal({ grade, subjects, onClose, onSave }) {
  const [form, setForm] = useState(
    grade || {
      title: "",
      subjectId: (subjects[0] && subjects[0].id) || "",
      category: "Quiz",
      score: "",
      totalScore: "100",
    }
  );

  const score = Number(form.score);
  const total = Number(form.totalScore);
  const validNumbers = Number.isFinite(score) && Number.isFinite(total) && score >= 0 && total > 0 && score <= total;
  const canSave = form.title.trim() && form.subjectId && validNumbers;
  const preview = validNumbers ? (score / total) * 100 : null;

  return (
    <ModalShell title={grade ? "Edit Grade" : "Add Grade"} onClose={onClose}>
      <Field label="Title *">
        <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Quiz 1" />
      </Field>
      <Field label="Subject *">
        <select className={inputCls} value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Category">
        <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {GRADE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Score *">
          <input type="number" min="0" step="0.01" className={inputCls} value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} placeholder="e.g. 18" />
        </Field>
        <Field label="Total Score *">
          <input type="number" min="0.01" step="0.01" className={inputCls} value={form.totalScore} onChange={(e) => setForm({ ...form, totalScore: e.target.value })} placeholder="e.g. 20" />
        </Field>
      </div>
      {form.score !== "" && form.totalScore !== "" && (
        <div className={`rounded-lg px-3 py-2 text-xs mb-3 ${validNumbers ? "bg-[#EEECFC] text-[#3D2FE0]" : "bg-red-50 text-red-600"}`}>
          {validNumbers ? `Percentage: ${preview.toFixed(1)}%` : "Score must be between 0 and the total score."}
        </div>
      )}
      <button
        disabled={!canSave}
        onClick={() => onSave({ ...form, title: form.title.trim(), score, totalScore: total })}
        className="w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-40 mt-2"
        style={{ background: "#3D2FE0" }}
      >
        {grade ? "Save Changes" : "Add Grade"}
      </button>
    </ModalShell>
  );
}

/* ---------------- Modals ---------------- */
function ModalShell({ title, onClose, children }) {
  return (
    <div className="absolute inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-0 md:p-4" onClick={onClose}>
      <div className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4E4F0] sticky top-0 bg-white">
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5 mb-3.5">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
const inputCls = "rounded-lg border border-[#E4E4F0] px-3 py-2.5 text-sm outline-none focus:border-[#3D2FE0]";

function SubjectModal({ subject, onClose, onSave }) {
  const [form, setForm] = useState(subject || { name: "", teacher: "", schedule: "", room: "", color: COLORS[0] });
  return (
    <ModalShell title={subject ? "Edit Subject" : "Add Subject"} onClose={onClose}>
      <Field label="Subject Name *">
        <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Mathematics" />
      </Field>
      <Field label="Teacher / Professor">
        <input className={inputCls} value={form.teacher} onChange={(e) => setForm({ ...form, teacher: e.target.value })} placeholder="e.g. Mr. Santos" />
      </Field>
      <Field label="Schedule">
        <input className={inputCls} value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} placeholder="e.g. Mon & Wed, 9:00–10:30 AM" />
      </Field>
      <Field label="Room">
        <input className={inputCls} value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="e.g. Room 204" />
      </Field>
      <Field label="Color">
        <div className="flex gap-2 flex-wrap">
          {COLORS.map((c) => (
            <button key={c} onClick={() => setForm({ ...form, color: c })} className="w-7 h-7 rounded-full" style={{ background: c, outline: form.color === c ? "2px solid #1B1B2F" : "none", outlineOffset: 2 }} />
          ))}
        </div>
      </Field>
      <button
        disabled={!form.name.trim()}
        onClick={() => onSave({ ...form, name: form.name.trim(), teacher: form.teacher.trim(), room: form.room.trim() })}
        className="w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-40 mt-2"
        style={{ background: "#3D2FE0" }}
      >
        Save Subject
      </button>
    </ModalShell>
  );
}

function ActivityModal({ activity, subjects, defaultSubjectId, onClose, onSave }) {
  const [form, setForm] = useState(
    activity || {
      title: "",
      subjectId: defaultSubjectId || (subjects[0] && subjects[0].id) || "",
      type: "Assignment",
      description: "",
      deadline: new Date().toISOString().slice(0, 10),
      priority: "Medium",
      status: "pending",
      notes: "",
    }
  );
  return (
    <ModalShell title={activity ? "Edit Activity" : "Add Activity"} onClose={onClose}>
      <Field label="Title *">
        <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Problem Set #3" />
      </Field>
      <Field label="Subject">
        <select className={inputCls} value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
          <option value="">General</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select className={inputCls} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </Field>
        <Field label="Deadline *">
          <input type="date" className={inputCls} value={form.deadline?.slice(0,10)} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
        </Field>
      </div>
      <Field label="Description">
        <textarea className={inputCls} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional details…" />
      </Field>
      <button
        disabled={!form.title.trim() || !form.deadline}
        onClick={() => onSave({ ...form, title: form.title.trim(), description: form.description.trim() })}
        className="w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-40 mt-2"
        style={{ background: "#3D2FE0" }}
      >
        Save Activity
      </button>
    </ModalShell>
  );
}
