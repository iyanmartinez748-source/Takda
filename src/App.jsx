import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
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

// Small, self-contained count-up used only for the Focus for Today numbers.
// Presentation only: it never feeds back into any count/state, always ends
// on the exact `value` passed in, and does nothing (snaps instantly) for
// prefers-reduced-motion or on first mount. Bounded steps + a single
// interval cleared on every effect re-run/unmount — no RAF loop, no
// long-running timer, no leak.
function useCountUp(value, duration = 320) {
  const [display, setDisplay] = useState(value);
  const prevValue = useRef(value);

  useEffect(() => {
    const from = prevValue.current;
    const to = value;
    prevValue.current = value;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (from === to || reduceMotion) {
      setDisplay(to);
      return;
    }

    const steps = 10;
    const stepMs = duration / steps;
    let step = 0;

    const id = setInterval(() => {
      step += 1;
      if (step >= steps) {
        setDisplay(to);
        clearInterval(id);
        return;
      }
      setDisplay(Math.round(from + (to - from) * (step / steps)));
    }, stepMs);

    return () => clearInterval(id);
  }, [value, duration]);

  return display;
}

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
// The reverse of parseLocalDate: formats a Date's own local Y/M/D into
// "YYYY-MM-DD" without any UTC conversion, so a calendar day selected in the
// UI always maps back to the same "YYYY-MM-DD" deadline string.
function formatLocalDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  const [defaultDeadlineForActivity, setDefaultDeadlineForActivity] = useState(null);
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

  // Single source of truth for the Dashboard's urgency-based sections —
  // Overdue and Due Today are kept as separate, non-overlapping lists so
  // "Today's Tasks" never mixes in items that are actually overdue.
  // Purely derived from enrichedActivities; nothing here is stored.
  const focusLists = useMemo(() => {
    const open = enrichedActivities.filter((a) => a.computedStatus !== "completed");
    const byDeadlineAsc = (a, b) => new Date(a.deadline) - new Date(b.deadline);
    return {
      overdue: open.filter((a) => a.urgencyKey === "overdue").sort(byDeadlineAsc),
      dueToday: open.filter((a) => a.urgencyKey === "today").sort(byDeadlineAsc),
      upcoming: open.filter((a) => ["tomorrow", "week", "later"].includes(a.urgencyKey)).sort(byDeadlineAsc),
    };
  }, [enrichedActivities]);

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
    // Reuse focusLists so "Due Today" has one definition across the whole
    // Dashboard — this must never include overdue activities.
    return { subjects: subjects.length, pending, completed, dueToday: focusLists.dueToday.length };
  }, [enrichedActivities, subjects, focusLists]);

  const contextMessage = useMemo(() => {
    const overdueCount = focusLists.overdue.length;
    const dueTodayCount = focusLists.dueToday.length;
    if (overdueCount > 0) {
      return `You have ${overdueCount} overdue ${overdueCount === 1 ? "task" : "tasks"} — take care of ${overdueCount === 1 ? "it" : "these"} first.`;
    }
    if (dueTodayCount > 0) {
      return `You have ${dueTodayCount} ${dueTodayCount === 1 ? "task" : "tasks"} due today.`;
    }
    return "You're all caught up for today.";
  }, [focusLists]);

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

  // Dashboard "Focus for Today" tiles and "View all" links land here —
  // reuses the existing Activities view/filter state, no second list.
  function goToActivities(filterValue) {
    setStatusFilter(filterValue);
    setView("activities");
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
  // mobile FAB) leave defaultSubjectForActivity exactly as before. deadline
  // is optional the same way — only the Calendar's "+ Add Activity" passes
  // one, to prefill (not lock) the selected date.
  function requestAddActivity(subjectId, deadline) {
    if (!isPro && activities.length >= FREE_ACTIVITY_LIMIT) {
      setLimitNotice("activities");
      return;
    }
    if (subjectId !== undefined) setDefaultSubjectForActivity(subjectId);
    setDefaultDeadlineForActivity(deadline || null);
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
      setDefaultDeadlineForActivity(null);
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
    setDefaultDeadlineForActivity(null);
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
              contextMessage={contextMessage}
              focusLists={focusLists}
              stats={stats}
              recentlyCompleted={recentlyCompleted}
              onToggle={toggleComplete}
              onOpenSubject={(id) => { setActiveSubjectId(id); setView("subject-detail"); }}
              onAddSubject={requestAddSubject}
              onFocusFilter={goToActivities}
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
            <CalendarView
              activities={enrichedActivities}
              onToggle={toggleComplete}
              onOpenSubject={(id) => { setActiveSubjectId(id); setView("subject-detail"); }}
              onAddActivity={(deadline) => requestAddActivity(undefined, deadline)}
            />
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
          view={view}
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
          defaultDeadline={defaultDeadlineForActivity}
          onClose={() => { setShowAddActivity(false); setEditingActivity(null); setDefaultSubjectForActivity(null); setDefaultDeadlineForActivity(null); }}
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
        className="mt-6 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition duration-150 ease-out hover:opacity-90 motion-safe:active:scale-[0.98]"
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
    <div className="md:hidden absolute bottom-0 left-0 right-0 bg-white border-t border-[#E4E4F0] shadow-[0_-2px_10px_rgba(15,23,42,0.05)] px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center justify-between">
      {leftItems.map((it) => <NavBtn key={it.key} it={it} active={view === it.key || (it.key === "subjects" && view === "subject-detail")} onClick={() => setView(it.key)} />)}
      <button
        onClick={onFab}
        className="w-12 h-12 -mt-6 rounded-full flex items-center justify-center text-white shadow-lg shrink-0 transition-transform duration-150 ease-out motion-safe:active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#3D2FE0]"
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
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className="flex flex-col items-center gap-0.5 px-2 py-1.5 flex-1 min-w-0 transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3D2FE0] focus-visible:ring-offset-1 rounded-lg"
      style={{ color: active ? "#3D2FE0" : "#94A3B8" }}
    >
      <span className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors duration-200 ease-out ${active ? "bg-[#EEECFC]" : ""}`}>
        <Icon size={19} />
      </span>
      <span className="text-[10px] font-semibold truncate max-w-full">{it.label}</span>
    </button>
  );
}

/* ---------------- Mobile "More" sheet — reaches Notes / Activities / Grades ---------------- */
function MoreSheet({ view, onClose, onNavigate }) {
  const items = [
    { key: "activities", label: "All Activities", icon: Search, desc: "Search and filter everything" },
    { key: "notes", label: "Notes", icon: StickyNote, desc: "Quick notes per subject" },
    { key: "grades", label: "My Grades", icon: Lock, desc: "Premium — grades & performance insights" },
  ];

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="md:hidden absolute inset-0 bg-black/40 flex items-end justify-center z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="More options"
    >
      <div className="bg-white w-full rounded-t-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg font-semibold">More</h3>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors duration-150"><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-2">
          {items.map((it) => {
            const Icon = it.icon;
            const active = view === it.key;
            return (
              <button
                key={it.key}
                onClick={() => onNavigate(it.key)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors duration-150 ease-out hover:border-slate-300 motion-safe:active:scale-[0.99] ${active ? "border-[#3D2FE0] bg-[#F7F6FF]" : "border-[#E4E4F0]"}`}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#EEECFC" }}>
                  <Icon size={16} color="#3D2FE0" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{it.label}</div>
                  <div className="text-[11px] text-slate-500 truncate">{it.desc}</div>
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
const DASHBOARD_OVERDUE_VISIBLE = 3;
const DASHBOARD_DUE_TODAY_VISIBLE = 5;
const DASHBOARD_UPCOMING_VISIBLE = 6;

function Dashboard({ greeting, contextMessage, focusLists, stats, recentlyCompleted, onToggle, onOpenSubject, onAddSubject, onFocusFilter }) {
  const overdueVisible = focusLists.overdue.slice(0, DASHBOARD_OVERDUE_VISIBLE);
  const dueTodayVisible = focusLists.dueToday.slice(0, DASHBOARD_DUE_TODAY_VISIBLE);
  const upcomingVisible = focusLists.upcoming.slice(0, DASHBOARD_UPCOMING_VISIBLE);

  const focusCounts = {
    overdue: focusLists.overdue.length,
    dueToday: focusLists.dueToday.length,
    upcoming: focusLists.upcoming.length,
  };

  return (
    <div className="p-5 md:p-8 takda-dashboard-enter">
      <div className="mb-6">
        <h1 className="font-display text-2xl md:text-3xl font-semibold">{greeting} 👋</h1>
        <p className="text-sm text-slate-500 mt-1">{contextMessage}</p>
      </div>

      <FocusForToday counts={focusCounts} onSelect={onFocusFilter} />

      <SectionHeader
        title="Needs Attention"
        action={
          focusCounts.overdue > 0 && (
            <ViewAllLink label={`View all overdue (${focusCounts.overdue})`} onClick={() => onFocusFilter("overdue")} />
          )
        }
      />
      {overdueVisible.length === 0 ? (
        <DashboardEmptyState icon={CheckCircle2} title="No overdue tasks" subtitle="You're all caught up." />
      ) : (
        <div className="flex flex-col gap-2 mb-7">
          {overdueVisible.map((a) => (
            <ActivityRow key={a.id} activity={a} onToggle={onToggle} onOpenSubject={onOpenSubject} />
          ))}
        </div>
      )}

      <SectionHeader
        title="Due Today"
        action={
          focusCounts.dueToday > DASHBOARD_DUE_TODAY_VISIBLE && (
            <ViewAllLink label={`View all (${focusCounts.dueToday})`} onClick={() => onFocusFilter("today")} />
          )
        }
      />
      {dueTodayVisible.length === 0 ? (
        <DashboardEmptyState icon={CheckCircle2} title="Nothing due today" subtitle="You're clear for today." />
      ) : (
        <div className="flex flex-col gap-2 mb-7">
          {dueTodayVisible.map((a) => (
            <ActivityRow key={a.id} activity={a} onToggle={onToggle} onOpenSubject={onOpenSubject} />
          ))}
        </div>
      )}

      <SectionHeader
        title="Upcoming Deadlines"
        action={
          focusCounts.upcoming > DASHBOARD_UPCOMING_VISIBLE && (
            <ViewAllLink label={`View all upcoming (${focusCounts.upcoming})`} onClick={() => onFocusFilter("upcoming")} />
          )
        }
      />
      {upcomingVisible.length === 0 ? (
        <DashboardEmptyState title="No upcoming deadlines." />
      ) : (
        <div className="flex flex-col gap-2 mb-7">
          {upcomingVisible.map((a, i) => (
            <ActivityRow key={a.id} activity={a} onToggle={onToggle} onOpenSubject={onOpenSubject} compact highlight={i === 0} />
          ))}
        </div>
      )}

      <SectionHeader title="Recently Completed" muted />
      {recentlyCompleted.length === 0 ? (
        <DashboardEmptyState title="Completed tasks will show up here." />
      ) : (
        <div className="flex flex-col gap-2 mb-4 opacity-80">
          {recentlyCompleted.map((a) => (
            <ActivityRow key={a.id} activity={a} onToggle={onToggle} onOpenSubject={onOpenSubject} compact />
          ))}
        </div>
      )}

      <StatsStrip stats={stats} />

      {stats.subjects === 0 && (
        <button onClick={onAddSubject} className="mt-4 w-full rounded-xl border border-dashed border-[#C7C7E8] text-[#3D2FE0] py-3 text-sm font-medium">
          + Add your first subject to get started
        </button>
      )}
    </div>
  );
}

const FOCUS_TILE_STYLE = {
  overdue: { bg: "#FEF2F2", border: "#FBD5D5", text: "#B91C1C" },
  dueToday: { bg: "#FFFBEB", border: "#FDE9B0", text: "#92400E" },
  upcoming: { bg: "#F0FDF4", border: "#CDEFD8", text: "#166534" },
};

const FOCUS_TILE_FILTER = { overdue: "overdue", dueToday: "today", upcoming: "upcoming" };

function FocusTile({ tile, active, style, onSelect }) {
  const displayValue = useCountUp(tile.value);
  return (
    <button
      type="button"
      onClick={() => onSelect(FOCUS_TILE_FILTER[tile.key])}
      className="rounded-xl border p-2.5 flex flex-col items-start gap-0.5 text-left transition-colors duration-200 ease-out hover:shadow-sm motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3D2FE0] focus-visible:ring-offset-1"
      style={active ? { background: style.bg, borderColor: style.border } : { background: "#FFFFFF", borderColor: "#E4E4F0" }}
      aria-label={`View ${tile.label.toLowerCase()} activities — ${tile.value}`}
    >
      <span className="font-display text-xl font-semibold leading-none" style={{ color: active ? style.text : "#1B1B2F" }}>
        {displayValue}
      </span>
      <span className="text-[11px] font-semibold" style={{ color: active ? style.text : "#64748B" }}>
        {tile.label}
      </span>
    </button>
  );
}

function FocusForToday({ counts, onSelect }) {
  const tiles = [
    { key: "overdue", label: "Overdue", value: counts.overdue },
    { key: "dueToday", label: "Due Today", value: counts.dueToday },
    { key: "upcoming", label: "Upcoming", value: counts.upcoming },
  ];
  return (
    <div className="mb-7">
      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2.5">Focus for Today</h2>
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((tile) => (
          <FocusTile key={tile.key} tile={tile} active={tile.value > 0} style={FOCUS_TILE_STYLE[tile.key]} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function StatsStrip({ stats }) {
  const items = [
    { label: "Subjects", value: stats.subjects },
    { label: "Pending", value: stats.pending },
    { label: "Completed", value: stats.completed },
    { label: "Due Today", value: stats.dueToday },
  ];
  return (
    <div className="flex items-stretch rounded-xl border border-[#E4E4F0] bg-white divide-x divide-[#E4E4F0] mb-7">
      {items.map((it) => (
        <div key={it.label} className="flex-1 px-2 py-2.5 text-center">
          <div className="font-display text-lg font-semibold leading-none">{it.value}</div>
          <div className="text-[10px] font-semibold text-slate-500 mt-1">{it.label}</div>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ title, muted, action }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2.5 mt-1">
      <h2 className={`text-sm ${muted ? "font-semibold text-slate-400" : "font-semibold text-slate-700"}`}>
        {title}
      </h2>
      {action}
    </div>
  );
}

function ViewAllLink({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 -my-1.5 py-1.5 px-1 text-xs font-semibold text-[#3D2FE0] hover:underline focus:outline-none focus-visible:underline"
    >
      {label} →
    </button>
  );
}

function DashboardEmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-[#F8FAFC] border border-[#E4E4F0] px-3 py-2.5 mb-7">
      {Icon && <Icon size={14} className="text-emerald-500 shrink-0 takda-emptystate-icon" />}
      <p className="text-xs text-slate-500">
        <span className="font-semibold text-slate-600">{title}</span>
        {subtitle && <span> — {subtitle}</span>}
      </p>
    </div>
  );
}

function EmptyRow({ text }) {
  return <div className="text-sm text-slate-400 rounded-xl bg-white border border-dashed border-[#E4E4F0] py-4 px-4 mb-7 text-center">{text}</div>;
}

function TypeChip({ type }) {
  if (!type) return null;
  return (
    <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 rounded-full px-1.5 py-0.5">
      {type}
    </span>
  );
}

function ActivityRow({ activity, onToggle, onOpenSubject, compact, highlight }) {
  const style = URGENCY_STYLE[activity.urgencyKey] || URGENCY_STYLE.later;
  const done = activity.computedStatus === "completed";
  return (
    <div
      className={`flex items-center gap-3 rounded-xl bg-white border p-3 transition-shadow transition-colors duration-200 ease-out hover:shadow-sm motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-px ${highlight ? "border-[#3D2FE0]" : "border-[#E4E4F0] hover:border-slate-300"}`}
    >
      <button
        onClick={() => onToggle(activity)}
        className="shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors duration-200 ease-out"
        style={{ borderColor: done ? "#16A34A" : "#CBD5E1", background: done ? "#16A34A" : "transparent" }}
        aria-label={done ? "Reopen task" : "Mark complete"}
      >
        <Check
          size={14}
          color="white"
          className={`transition-all duration-200 ease-out motion-reduce:transition-none ${done ? "opacity-100 scale-100" : "opacity-0 scale-50"}`}
        />
      </button>
      <div className="flex-1 min-w-0">
        <button className="text-left w-full" onClick={() => activity.subjectId && onOpenSubject(activity.subjectId)}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: activity.subject?.color || "#94A3B8" }} />
            <span className="text-[11px] font-medium text-slate-500 truncate">{activity.subject?.name || "General"}</span>
            <TypeChip type={activity.type} />
            <PriorityTag priority={activity.priority} />
          </div>
          <div className={`text-sm font-medium truncate mt-0.5 transition-colors duration-200 ease-out ${done ? "line-through text-slate-400" : "text-[#1B1B2F]"}`}>{activity.title}</div>
        </button>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        {!compact && (
          <span className="text-[11px] font-semibold px-2 py-1 rounded-full" style={{ color: style.text, background: style.bg }}>
            {style.label}
          </span>
        )}
        <span className="text-[11px] text-slate-400 flex items-center gap-1">
          {compact && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: style.dot }} />}
          {fmtDate(activity.deadline)}
        </span>
      </div>
    </div>
  );
}

/* ---------------- Subjects ---------------- */
function SubjectsView({ subjects, activities, onOpen, onAdd }) {
  return (
    <div className="p-5 md:p-8">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display text-2xl font-semibold">My Subjects</h1>
        <button onClick={onAdd} className="flex items-center gap-1.5 text-sm font-semibold text-white rounded-lg px-3 py-2 transition duration-150 ease-out hover:opacity-90 motion-safe:active:scale-[0.98]" style={{ background: "#3D2FE0" }}>
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
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: subject.color }} />
          <h1 className="font-display text-2xl font-semibold truncate">{subject.name}</h1>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={onEditSubject} aria-label="Edit subject" className="p-2.5 rounded-lg bg-white border border-[#E4E4F0] transition-colors duration-150 hover:bg-slate-50"><Edit2 size={14} /></button>
          <button onClick={onDeleteSubject} aria-label="Delete subject" className="p-2.5 rounded-lg bg-white border border-[#E4E4F0] text-red-500 transition-colors duration-150 hover:bg-red-50"><Trash2 size={14} /></button>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-slate-500 mb-6">
        {subject.teacher && <span className="flex items-center gap-1"><User size={12} />{subject.teacher}</span>}
        {subject.schedule && <span className="flex items-center gap-1"><Clock size={12} />{subject.schedule}</span>}
        {subject.room && <span className="flex items-center gap-1"><MapPin size={12} />{subject.room}</span>}
      </div>

      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-sm font-semibold text-slate-700 min-w-0 truncate">Activities ({pending.length} pending, {completed.length} completed)</h2>
        <button onClick={onAddActivity} className="flex items-center gap-1 text-xs font-semibold shrink-0 -my-1.5 py-1.5 px-1" style={{ color: "#3D2FE0" }}><Plus size={13} /> Add</button>
      </div>
      {activities.length === 0 ? (
        <EmptyRow text="No activities for this subject yet." />
      ) : (
        <div className="flex flex-col gap-2 mb-7">
          {activities.sort((a,b)=>new Date(a.deadline)-new Date(b.deadline)).map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-xl bg-white border border-[#E4E4F0] p-3 transition-shadow transition-colors duration-200 ease-out hover:shadow-sm hover:border-slate-300 motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-px">
              <button onClick={() => onToggle(a)} className="shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors duration-200 ease-out" style={{ borderColor: a.computedStatus === "completed" ? "#16A34A" : "#CBD5E1", background: a.computedStatus === "completed" ? "#16A34A" : "transparent" }}>
                <Check size={14} color="white" className={`transition-all duration-200 ease-out motion-reduce:transition-none ${a.computedStatus === "completed" ? "opacity-100 scale-100" : "opacity-0 scale-50"}`} />
              </button>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate transition-colors duration-200 ease-out ${a.computedStatus === "completed" ? "line-through text-slate-400" : ""}`}>{a.title}</div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-[11px] text-slate-500">{a.type} · {fmtDate(a.deadline)}</span>
                  <StatusBadge status={a.computedStatus} />
                  <PriorityTag priority={a.priority} />
                </div>
              </div>
              <button onClick={() => onEditActivity(a)} aria-label="Edit activity" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors duration-150"><Edit2 size={13} /></button>
              <button onClick={() => onDeleteActivity(a.id)} aria-label="Delete activity" className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors duration-150"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}

      <h2 className="text-sm font-semibold text-slate-700 mb-2.5">Notes</h2>
      <div className="flex gap-2 mb-3">
        <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Write a quick note…" className="flex-1 rounded-lg border border-[#E4E4F0] px-3 py-2 text-sm outline-none" />
        <button
          onClick={() => { if (noteText.trim()) { onAddNote(noteText.trim()); setNoteText(""); } }}
          className="rounded-lg px-3 py-2 text-sm font-semibold text-white transition duration-150 ease-out hover:opacity-90 motion-safe:active:scale-[0.98]"
          style={{ background: "#3D2FE0" }}
        >Save</button>
      </div>
      <div className="flex flex-col gap-2">
        {notes.length === 0 && <div className="text-sm text-slate-400">No notes yet.</div>}
        {notes.slice().reverse().map((n) => (
          <div key={n.id} className="rounded-xl bg-white border border-[#E4E4F0] p-3 text-sm flex items-start justify-between gap-2">
            <span className="flex-1 min-w-0 break-words">{n.body}</span>
            <button onClick={() => onDeleteNote(n.id)} aria-label="Delete note" className="shrink-0 p-1.5 -m-1.5 text-slate-300 hover:text-slate-500 transition-colors duration-150"><X size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Calendar ---------------- */
const CALENDAR_DOT_LIMIT = 3;
// Same soft-tint palette already used for FOCUS_TILE_STYLE on the Dashboard —
// reused values, not a new color scheme.
const CALENDAR_DAY_TONE = {
  overdue: { bg: "#FEF2F2", border: "#FBD5D5" },
  completed: { bg: "#F0FDF4", border: "#CDEFD8" },
};

function CalendarView({ activities, onToggle, onOpenSubject, onAddActivity }) {
  const [cursor, setCursor] = useState(startOfDay(new Date()));
  const [selected, setSelected] = useState(startOfDay(new Date()));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = startOfDay(new Date());

  // One pass over all activities, keyed by calendar day — every date cell
  // and the selected-day agenda both read from this instead of re-filtering
  // the full activity list on every render.
  const activitiesByDate = useMemo(() => {
    const m = {};
    activities.forEach((a) => {
      const key = parseLocalDate(a.deadline).toDateString();
      (m[key] = m[key] || []).push(a);
    });
    return m;
  }, [activities]);

  const cells = useMemo(() => {
    const list = [];
    for (let i = 0; i < startWeekday; i++) list.push(null);
    for (let d = 1; d <= daysInMonth; d++) list.push(new Date(year, month, d));
    return list;
  }, [year, month, startWeekday, daysInMonth]);

  // Metrics for the currently displayed month only — never another month's
  // activities, and never a duplicate definition of overdue/completed.
  const monthSummary = useMemo(() => {
    const inMonth = activities.filter((a) => {
      const due = parseLocalDate(a.deadline);
      return due.getFullYear() === year && due.getMonth() === month;
    });
    return {
      total: inMonth.length,
      overdue: inMonth.filter((a) => a.computedStatus === "overdue").length,
      completed: inMonth.filter((a) => a.computedStatus === "completed").length,
    };
  }, [activities, year, month]);

  const selectedKey = selected.toDateString();
  const selectedList = useMemo(() => {
    const items = activitiesByDate[selectedKey] || [];
    // Active items first (already share one urgency badge via ActivityRow
    // since they share the same deadline); completed items settle to the end.
    return items.slice().sort((a, b) => {
      const doneDiff = (a.computedStatus === "completed" ? 1 : 0) - (b.computedStatus === "completed" ? 1 : 0);
      return doneDiff !== 0 ? doneDiff : new Date(a.deadline) - new Date(b.deadline);
    });
  }, [activitiesByDate, selectedKey]);

  function goToToday() {
    setCursor(today);
    setSelected(today);
  }

  return (
    <div className="p-5 md:p-8">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="font-display text-2xl font-semibold">Calendar</h1>
        <button
          onClick={() => onAddActivity(formatLocalDate(selected))}
          className="flex items-center gap-1.5 text-sm font-semibold text-white rounded-lg px-3 py-2 shrink-0 transition duration-150 ease-out hover:opacity-90 motion-safe:active:scale-[0.98]"
          style={{ background: "#3D2FE0" }}
        >
          <Plus size={15} /> Add Activity
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        {monthSummary.total} {monthSummary.total === 1 ? "deadline" : "deadlines"} • {monthSummary.overdue} overdue • {monthSummary.completed} completed
      </p>

      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          aria-label="Previous month"
          className="p-2.5 rounded-lg bg-white border border-[#E4E4F0] transition-colors duration-150 hover:border-slate-300 motion-safe:active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3D2FE0] focus-visible:ring-offset-1"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-display text-lg font-semibold truncate">{cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
          <button
            onClick={goToToday}
            className="shrink-0 text-[11px] font-semibold px-2 -my-1.5 py-2.5 rounded-full border border-[#E4E4F0] text-slate-500 transition-colors duration-150 hover:border-[#3D2FE0] hover:text-[#3D2FE0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3D2FE0] focus-visible:ring-offset-1"
          >
            Today
          </button>
        </div>
        <button
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          aria-label="Next month"
          className="p-2.5 rounded-lg bg-white border border-[#E4E4F0] transition-colors duration-150 hover:border-slate-300 motion-safe:active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3D2FE0] focus-visible:ring-offset-1"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400 mb-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1 mb-6">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const key = d.toDateString();
          const items = activitiesByDate[key] || [];
          const isSelected = key === selectedKey;
          const isToday = key === today.toDateString();
          const hasOverdue = items.some((a) => a.computedStatus === "overdue");
          const hasActive = items.some((a) => a.computedStatus !== "completed");
          const hasOnlyCompleted = items.length > 0 && !hasActive;

          let cellStyle = { background: "#FFFFFF", borderColor: "#E4E4F0", color: "#1B1B2F" };
          if (hasOverdue) cellStyle = { background: CALENDAR_DAY_TONE.overdue.bg, borderColor: CALENDAR_DAY_TONE.overdue.border, color: "#1B1B2F" };
          else if (hasOnlyCompleted) cellStyle = { background: CALENDAR_DAY_TONE.completed.bg, borderColor: CALENDAR_DAY_TONE.completed.border, color: "#1B1B2F" };
          if (isToday && !isSelected) cellStyle.borderColor = "#3D2FE0";
          // Selected always wins outright rather than stacking with the
          // today/overdue/completed tint, so the two states never collide.
          if (isSelected) cellStyle = { background: "#3D2FE0", borderColor: "#3D2FE0", color: "#FFFFFF" };

          const visibleDots = items.slice(0, items.length > CALENDAR_DOT_LIMIT ? CALENDAR_DOT_LIMIT - 1 : CALENDAR_DOT_LIMIT);
          const overflowCount = items.length > CALENDAR_DOT_LIMIT ? items.length - visibleDots.length : 0;

          const dateLabel = d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
          const activityLabel = items.length > 0 ? `, ${items.length} ${items.length === 1 ? "activity" : "activities"}` : "";

          return (
            <button
              key={i}
              onClick={() => setSelected(startOfDay(d))}
              aria-label={`${dateLabel}${activityLabel}`}
              aria-pressed={isSelected}
              className="aspect-square rounded-lg flex flex-col items-center justify-center relative text-xs border transition-colors duration-150 ease-out motion-safe:transition-transform motion-safe:hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3D2FE0] focus-visible:ring-offset-1"
              style={{ background: cellStyle.background, color: cellStyle.color, borderColor: cellStyle.borderColor, borderWidth: isToday && !isSelected ? 1.5 : 1 }}
            >
              {d.getDate()}
              {items.length > 0 && (
                <span className="absolute bottom-1 flex items-center gap-0.5">
                  {visibleDots.map((a, dotIndex) => (
                    <span
                      key={a.id || dotIndex}
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: isSelected ? "#FFFFFF" : (a.subject?.color || "#94A3B8") }}
                    />
                  ))}
                  {overflowCount > 0 && (
                    <span className="text-[8px] font-bold leading-none ml-0.5" style={{ color: isSelected ? "#FFFFFF" : "#64748B" }}>
                      +{overflowCount}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-baseline justify-between mb-2.5">
        <h2 className="text-sm font-semibold text-slate-700">{fmtDateFull(selected)}</h2>
        <span className="text-xs text-slate-400">{selectedList.length} {selectedList.length === 1 ? "activity" : "activities"}</span>
      </div>
      {selectedList.length === 0 ? (
        <DashboardEmptyState title="No activities on this date." subtitle="Your schedule is clear." />
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
          className="self-end rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition duration-150 ease-out hover:opacity-90 motion-safe:active:scale-[0.98]"
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
                <span className="flex-1 min-w-0 break-words">{n.body}</span>
                <button onClick={() => onDelete(n.id)} aria-label="Delete note" className="shrink-0 p-1.5 -m-1.5 text-slate-300 hover:text-slate-500 transition-colors duration-150"><X size={14} /></button>
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

/* ---------------- All activities (search/filter/sort) ---------------- */
// "today" and "upcoming" are urgency-based quick filters (reusing the same
// urgencyKey already computed on each activity) rather than a computedStatus
// value, so they're matched separately here — no new activity data needed.
function matchesActivityFilter(a, filter) {
  if (filter === "all") return true;
  if (filter === "today") return a.computedStatus !== "completed" && a.urgencyKey === "today";
  if (filter === "upcoming") return a.computedStatus !== "completed" && ["tomorrow", "week", "later"].includes(a.urgencyKey);
  return a.computedStatus === filter;
}

const ACTIVITY_FILTER_KEYS = ["all", "overdue", "today", "upcoming", "pending", "in_progress", "completed"];

function compareByDeadline(a, b) {
  return new Date(a.deadline) - new Date(b.deadline);
}

// Mirrors the tiering already implied by urgency()/URGENCY_STYLE elsewhere in
// this file — no new date math, just an order to sort those existing tiers by.
const URGENCY_SORT_RANK = { overdue: 0, today: 1, tomorrow: 2, week: 3, later: 4, done: 5 };

const ACTIVITY_SORT_OPTIONS = [
  { key: "smart", label: "Smart" },
  { key: "deadline_asc", label: "Deadline: Earliest" },
  { key: "deadline_desc", label: "Deadline: Latest" },
  { key: "priority_desc", label: "Priority: High to Low" },
  { key: "priority_asc", label: "Priority: Low to High" },
  { key: "recent", label: "Recently Added" },
];

function sortActivitiesBy(list, sortKey) {
  switch (sortKey) {
    case "deadline_asc":
      return [...list].sort(compareByDeadline);
    case "deadline_desc":
      return [...list].sort((a, b) => compareByDeadline(b, a));
    case "priority_desc":
      return [...list].sort((a, b) => (PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority)) || compareByDeadline(a, b));
    case "priority_asc":
      return [...list].sort((a, b) => (PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority)) || compareByDeadline(a, b));
    case "recent":
      // storageAdapter loads activities ordered by created_at, and new ones
      // are always appended (never inserted mid-array), so the array's
      // existing order already reflects creation order — just reverse it.
      return [...list].reverse();
    case "smart":
    default:
      return [...list].sort((a, b) => {
        const rankDiff = (URGENCY_SORT_RANK[a.urgencyKey] ?? 4) - (URGENCY_SORT_RANK[b.urgencyKey] ?? 4);
        if (rankDiff !== 0) return rankDiff;
        const deadlineDiff = compareByDeadline(a, b);
        if (deadlineDiff !== 0) return deadlineDiff;
        return PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority);
      });
  }
}

function getActivitiesEmptyState({ hasAny, statusFilter, query }) {
  if (!hasAny) {
    return { title: "No activities yet.", subtitle: "Add your first academic task to get started." };
  }
  const trimmed = query.trim();
  if (trimmed) {
    return { title: `No activities found for "${trimmed}".`, subtitle: "Try another search or clear your filters." };
  }
  if (statusFilter === "overdue") {
    return { icon: CheckCircle2, title: "You're all caught up.", subtitle: "No overdue activities." };
  }
  if (statusFilter === "today") {
    return { icon: CheckCircle2, title: "Nothing due today." };
  }
  if (statusFilter === "upcoming") {
    return { title: "No upcoming deadlines." };
  }
  return { title: "No activities match this filter." };
}

function AllActivities({ activities, query, setQuery, statusFilter, setStatusFilter, onToggle, onEdit, onDelete, onAdd }) {
  const [sortBy, setSortBy] = useState("smart");

  // Same definitions as the Dashboard's Focus for Today (matchesActivityFilter
  // reuses computedStatus/urgencyKey, already computed once per activity) —
  // counts here can never drift from what tapping a tab actually shows.
  const filterCounts = useMemo(() => {
    const counts = {};
    ACTIVITY_FILTER_KEYS.forEach((key) => {
      counts[key] = activities.filter((a) => matchesActivityFilter(a, key)).length;
    });
    return counts;
  }, [activities]);

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activities;
    return activities.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        (a.type || "").toLowerCase().includes(q) ||
        (a.subject?.name || "").toLowerCase().includes(q)
    );
  }, [activities, query]);

  const filtered = useMemo(
    () => sortActivitiesBy(searched.filter((a) => matchesActivityFilter(a, statusFilter)), sortBy),
    [searched, statusFilter, sortBy]
  );

  const emptyState = getActivitiesEmptyState({ hasAny: activities.length > 0, statusFilter, query });

  return (
    <div className="p-5 md:p-8">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <h1 className="font-display text-2xl font-semibold">All Activities</h1>
        <button onClick={onAdd} className="flex items-center gap-1.5 text-sm font-semibold text-white rounded-lg px-3 py-2 shrink-0 transition duration-150 ease-out hover:opacity-90 motion-safe:active:scale-[0.98]" style={{ background: "#3D2FE0" }}>
          <Plus size={15} /> Add Activity
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        {filterCounts.overdue} Overdue • {filterCounts.today} Today • {filterCounts.upcoming} Upcoming
      </p>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex-1 min-w-[160px] flex items-center gap-2 rounded-lg border border-[#E4E4F0] bg-white px-3 py-2 transition-colors duration-150 focus-within:border-[#3D2FE0]">
          <Search size={15} className="text-slate-400 shrink-0" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search activities…" className="flex-1 min-w-0 outline-none text-sm" />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="shrink-0 p-1.5 -m-1.5 text-slate-300 hover:text-slate-500 transition-colors duration-150"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          aria-label="Sort activities"
          className="shrink-0 rounded-lg border border-[#E4E4F0] bg-white px-2.5 py-2 text-xs font-medium text-slate-600 outline-none transition-colors duration-150 focus:border-[#3D2FE0]"
        >
          {ACTIVITY_SORT_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-1.5 mb-4 overflow-x-auto">
        {ACTIVITY_FILTER_KEYS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className="px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-colors duration-150"
            style={{ background: statusFilter === s ? "#3D2FE0" : "white", color: statusFilter === s ? "white" : "#475569", border: "1px solid #E4E4F0" }}
          >
            {s.replace("_", " ")} {filterCounts[s]}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <DashboardEmptyState icon={emptyState.icon} title={emptyState.title} subtitle={emptyState.subtitle} />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-xl bg-white border border-[#E4E4F0] p-3 transition-shadow transition-colors duration-200 ease-out hover:shadow-sm hover:border-slate-300 motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-px">
              <button
                onClick={() => onToggle(a)}
                className="shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors duration-200 ease-out hover:border-emerald-400"
                style={{ borderColor: a.computedStatus === "completed" ? "#16A34A" : "#CBD5E1", background: a.computedStatus === "completed" ? "#16A34A" : "transparent" }}
                aria-label={a.computedStatus === "completed" ? "Reopen task" : "Mark complete"}
              >
                <Check size={14} color="white" className={`transition-all duration-200 ease-out motion-reduce:transition-none ${a.computedStatus === "completed" ? "opacity-100 scale-100" : "opacity-0 scale-50"}`} />
              </button>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate transition-colors duration-200 ease-out ${a.computedStatus === "completed" ? "line-through text-slate-400" : ""}`}>{a.title}</div>
                <div className="text-[11px] text-slate-500 truncate mt-0.5">{a.subject?.name || "General"} · {a.type}</div>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className="text-[11px] text-slate-400">{fmtDate(a.deadline)}</span>
                  <PriorityTag priority={a.priority} />
                  <StatusBadge status={a.computedStatus} />
                </div>
              </div>
              <button onClick={() => onEdit(a)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors duration-150" aria-label="Edit activity"><Edit2 size={13} /></button>
              <button onClick={() => onDelete(a.id)} className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors duration-150" aria-label="Delete activity"><Trash2 size={13} /></button>
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

// Keeps progress-bar widths on a safe 0–100 visual range without ever
// altering the actual displayed percentage text, which stays whatever
// gradePercent() computed (even if that's above 100 from a data mistake).
function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

// Same urgency-tier-style ranking approach used elsewhere in this file:
// urgency/deadline classification is untouched — this is a purely local
// ordering rule for the Subject Performance list.
function sortSubjectPerformance(list) {
  return list.slice().sort((a, b) => (a.average - b.average) || a.subject.name.localeCompare(b.subject.name));
}

function GradesView({ grades, subjects, subjectMap, onSave, onDelete }) {
  const [showModal, setShowModal] = useState(false);
  const [editingGrade, setEditingGrade] = useState(null);
  const [subjectFilter, setSubjectFilter] = useState("all");

  const visibleGrades = useMemo(
    () => grades.filter((g) => subjectFilter === "all" || g.subjectId === subjectFilter),
    [grades, subjectFilter]
  );

  // Established Takda formula, unchanged: simple mean of gradePercent()
  // across all grades. Invalid/zero-total entries still count as 0 in the
  // sum (gradePercent's own safety net) rather than being excluded — that
  // is existing, established behavior and is preserved here as-is.
  const overallAverage = useMemo(() => {
    if (grades.length === 0) return null;
    return grades.reduce((sum, g) => sum + gradePercent(g), 0) / grades.length;
  }, [grades]);

  // Same per-subject formula as before Phase 4 — untouched.
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

  const subjectsWithGrades = useMemo(
    () => subjectSummaries.filter((s) => s.count > 0),
    [subjectSummaries]
  );

  const subjectPerformance = useMemo(
    () => sortSubjectPerformance(subjectsWithGrades),
    [subjectsWithGrades]
  );

  // Deterministic, data-only insights — no predictions, no invented metrics.
  // Capped at 3, and only ever built from numbers already computed above.
  const insights = useMemo(() => {
    if (grades.length === 0) return [];
    const list = [];
    list.push(
      `You have recorded ${grades.length} grade ${grades.length === 1 ? "entry" : "entries"} across ${subjectsWithGrades.length} ${subjectsWithGrades.length === 1 ? "subject" : "subjects"}.`
    );
    if (subjectsWithGrades.length >= 2) {
      const lowest = subjectPerformance[0];
      const highest = subjectPerformance[subjectPerformance.length - 1];
      list.push(`${lowest.subject.name} currently has your lowest recorded average at ${lowest.average.toFixed(1)}%.`);
      list.push(`Your highest recorded subject average is ${highest.average.toFixed(1)}% in ${highest.subject.name}.`);
    } else {
      const only = subjectsWithGrades[0];
      list.push(`You have recorded ${only.count} grade ${only.count === 1 ? "entry" : "entries"} in ${only.subject.name}.`);
    }
    return list.slice(0, 3);
  }, [grades.length, subjectsWithGrades, subjectPerformance]);

  // Category breakdown for the currently selected subject only — showing it
  // across multiple subjects at once would misleadingly blend unrelated
  // categories. Uses the exact same simple averaging as everything else;
  // no category weighting is introduced. Omitted when there's nothing to
  // meaningfully break down (all one category, or viewing "All Subjects").
  const categorySummary = useMemo(() => {
    if (subjectFilter === "all") return [];
    const groups = {};
    grades
      .filter((g) => g.subjectId === subjectFilter)
      .forEach((g) => {
        const cat = g.category || "Other";
        (groups[cat] = groups[cat] || []).push(g);
      });
    const categories = Object.keys(groups);
    if (categories.length <= 1) return [];
    return categories
      .map((category) => {
        const items = groups[category];
        return {
          category,
          count: items.length,
          average: items.reduce((sum, g) => sum + gradePercent(g), 0) / items.length,
        };
      })
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [grades, subjectFilter]);

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
          <p className="text-sm text-slate-500 mt-1">Track your recorded scores and subject performance.</p>
        </div>
        <button
          onClick={() => { setEditingGrade(null); setShowModal(true); }}
          disabled={subjects.length === 0}
          className="flex items-center gap-1.5 text-sm font-semibold text-white rounded-lg px-3 py-2 disabled:opacity-40 shrink-0 transition duration-150 ease-out hover:opacity-90 disabled:hover:opacity-40 motion-safe:active:scale-[0.98] disabled:active:scale-100"
          style={{ background: "#3D2FE0" }}
        >
          <Plus size={15} /> Add Grade
        </button>
      </div>

      {subjects.length === 0 ? (
        <EmptyRow text="Add a subject first before recording grades." />
      ) : grades.length === 0 ? (
        <DashboardEmptyState
          icon={CheckCircle2}
          title="No grades yet."
          subtitle="Recorded grades will appear here once you add your first score."
        />
      ) : (
        <>
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2.5">Academic Overview</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <div className="rounded-xl bg-white border border-[#E4E4F0] p-4">
              <div className="text-xs text-slate-500 mb-1">Overall Recorded Average</div>
              <div className="font-display text-2xl font-semibold">{overallAverage === null ? "—" : `${overallAverage.toFixed(1)}%`}</div>
              {overallAverage !== null && (
                <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
                    style={{ width: `${clampPercent(overallAverage)}%`, background: "#3D2FE0" }}
                    role="progressbar"
                    aria-valuenow={Math.round(overallAverage)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Overall recorded average"
                  />
                </div>
              )}
              <div className="text-[11px] text-slate-400 mt-1.5">Based on grades recorded in Takda</div>
            </div>
            <div className="rounded-xl bg-white border border-[#E4E4F0] p-4">
              <div className="text-xs text-slate-500 mb-1">Subjects With Grades</div>
              <div className="font-display text-2xl font-semibold">{subjectsWithGrades.length}</div>
              <div className="text-[11px] text-slate-400 mt-1.5">Out of {subjects.length} {subjects.length === 1 ? "subject" : "subjects"}</div>
            </div>
            <div className="rounded-xl bg-white border border-[#E4E4F0] p-4">
              <div className="text-xs text-slate-500 mb-1">Total Grade Entries</div>
              <div className="font-display text-2xl font-semibold">{grades.length}</div>
              <div className="text-[11px] text-slate-400 mt-1.5">Recorded across all subjects</div>
            </div>
          </div>

          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2.5">Academic Insights</h2>
          <div className="flex flex-col gap-2 mb-6">
            {insights.map((text, i) => (
              <div key={i} className="rounded-xl bg-white border border-[#E4E4F0] p-3 text-sm text-[#1B1B2F]">
                {text}
              </div>
            ))}
          </div>

          {subjectPerformance.length > 0 && (
            <>
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2.5">Subject Performance</h2>
              <div className="flex flex-col gap-2 mb-6">
                {subjectPerformance.map(({ subject, count, average }) => (
                  <button
                    key={subject.id}
                    onClick={() => setSubjectFilter(subject.id)}
                    className="text-left rounded-xl bg-white border border-[#E4E4F0] p-3 transition-shadow transition-colors duration-200 ease-out hover:shadow-sm hover:border-slate-300 motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-px"
                  >
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: subject.color || "#94A3B8" }} />
                        <span className="text-sm font-medium truncate">{subject.name}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold">{average.toFixed(1)}%</div>
                        <div className="text-[10px] text-slate-400">{count} {count === 1 ? "entry" : "entries"}</div>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
                        style={{ width: `${clampPercent(average)}%`, background: subject.color || "#94A3B8" }}
                        role="progressbar"
                        aria-valuenow={Math.round(average)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${subject.name} recorded average`}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="flex items-center gap-2 mb-4">
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="rounded-lg border border-[#E4E4F0] bg-white px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-[#3D2FE0]"
            >
              <option value="all">All Subjects</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {subjectFilter !== "all" && (
              <button onClick={() => setSubjectFilter("all")} className="text-xs font-medium text-[#3D2FE0] transition-colors duration-150 hover:underline -my-1.5 py-1.5 px-1">Clear filter</button>
            )}
          </div>

          {categorySummary.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {categorySummary.map(({ category, average, count }) => (
                <div key={category} className="rounded-lg border border-[#E4E4F0] bg-white px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{category}</div>
                  <div className="text-sm font-semibold mt-0.5">{average.toFixed(1)}%</div>
                  <div className="text-[10px] text-slate-400">{count} {count === 1 ? "entry" : "entries"}</div>
                </div>
              ))}
            </div>
          )}

          {visibleGrades.length === 0 ? (
            <DashboardEmptyState title="No grades recorded yet." />
          ) : (
            <div className="flex flex-col gap-2">
              {visibleGrades.map((g) => {
                const percent = gradePercent(g);
                return (
                  <div
                    key={g.id}
                    className="flex items-center gap-3 rounded-xl bg-white border border-[#E4E4F0] p-3 transition-shadow transition-colors duration-200 ease-out hover:shadow-sm hover:border-slate-300 motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-px"
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: subjectMap[g.subjectId]?.color || "#94A3B8" }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{g.title}</div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">{subjectMap[g.subjectId]?.name || "Unknown Subject"} · {g.category}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold">{g.score}/{g.totalScore}</div>
                      <div className="text-[11px] text-slate-500">{percent.toFixed(1)}%</div>
                    </div>
                    <button onClick={() => openEdit(g)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors duration-150" aria-label="Edit grade"><Edit2 size={13} /></button>
                    <button onClick={() => onDelete(g.id)} className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors duration-150" aria-label="Delete grade"><Trash2 size={13} /></button>
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
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-0 md:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4E4F0] sticky top-0 bg-white">
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors duration-150"><X size={18} /></button>
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

function ActivityModal({ activity, subjects, defaultSubjectId, defaultDeadline, onClose, onSave }) {
  const [form, setForm] = useState(
    activity || {
      title: "",
      subjectId: defaultSubjectId || (subjects[0] && subjects[0].id) || "",
      type: "Assignment",
      description: "",
      deadline: defaultDeadline || formatLocalDate(new Date()),
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
