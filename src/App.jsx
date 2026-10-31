import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import {
  Plus, X, Check, BookOpen, Calendar as CalendarIcon, StickyNote,
  Home, ChevronLeft, ChevronRight, Search, Clock, MapPin, User,
  Trash2, Edit2, AlertCircle, CheckCircle2, Circle, ArrowLeft, Lock,
  MoreHorizontal, Flag, ChevronDown, Bell, Link2, FileText, ExternalLink
} from "lucide-react";
import {
  createSemester,
  updateSemesterMetadata,
  activateSemester,
  archiveSemester,
  loadSubjectMaterials,
  createSubjectMaterialLink,
  updateSubjectMaterialLink,
  deleteSubjectMaterialLink,
  createSubjectMaterialUpload,
  deleteSubjectMaterialUpload,
  createSubjectMaterialSignedUrl,
} from "./lib/storageAdapter";
import {
  validateMaterialUploadFile,
  deriveMaterialUploadTitle,
  MaterialUploadValidationError,
  MaterialUploadQuotaError,
  FREE_MATERIAL_UPLOAD_LIMIT_BYTES,
  PRO_MATERIAL_UPLOAD_LIMIT_BYTES,
  getMaterialUploadUsageDisplay,
  computeAccountUploadUsageBytes,
  getMaterialUploadUsageAccessibleValue,
} from "./lib/materialUploads";
import { MaterialLinkValidationError } from "./lib/materialLinks";
import {
  getNotificationPermission,
  getNotificationsEnabledPreference,
  setNotificationsEnabledPreference,
  requestNotificationPermission,
  showDeviceNotification,
  hasNotifiedFor,
  markNotifiedFor,
} from "./lib/notifications";
import { subscribeToPush, unsubscribeFromPush, sendTestPush } from "./lib/push";
import { generateRecurrenceDates, RecurrenceValidationError } from "./lib/recurrence";
import { computeSmartInsights } from "./lib/planningEngine";

const FONT_LINK = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap";

const COLORS = ["#3D2FE0", "#FF5A5F", "#16A34A", "#F59E0B", "#0EA5A4", "#DB2777", "#7C3AED", "#2563EB"];
const TYPES = ["Assignment", "Quiz", "Exam", "Project", "Presentation", "Report", "Research", "Reading", "Other"];
const PRIORITIES = ["Low", "Medium", "High"];

// Phase 9C Stage 9C-4A: create-mode-only "Repeat" options. "" ("Does not
// repeat") is the only value that never reaches generateRecurrenceDates —
// every other value is one of RECURRENCE_RULES from src/lib/recurrence.js.
const REPEAT_OPTIONS = [
  { value: "", label: "Does not repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Weekdays (Mon–Fri)" },
  { value: "weekends", label: "Weekends (Sat–Sun)" },
  { value: "weekly", label: "Every week" },
];

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
  overdue: { dot: "var(--takda-status-overdue-dot)", label: "Overdue", text: "var(--takda-status-overdue-text)", bg: "var(--takda-status-overdue-bg)" },
  today: { dot: "var(--takda-status-overdue-dot)", label: "Due Today", text: "var(--takda-status-overdue-text)", bg: "var(--takda-status-overdue-bg)" },
  tomorrow: { dot: "var(--takda-status-tomorrow-dot)", label: "Due Tomorrow", text: "var(--takda-status-tomorrow-text)", bg: "var(--takda-status-tomorrow-bg)" },
  week: { dot: "var(--takda-status-week-dot)", label: "This Week", text: "var(--takda-status-week-text)", bg: "var(--takda-status-week-bg)" },
  later: { dot: "var(--takda-status-later-dot)", label: "Upcoming", text: "var(--takda-status-later-text)", bg: "var(--takda-status-later-bg)" },
  done: { dot: "var(--takda-status-week-dot)", label: "Completed", text: "var(--takda-status-week-text)", bg: "var(--takda-status-week-bg)" },
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

const PRIORITY_COLOR = { Low: "var(--takda-text-muted-2)", Medium: "#D97706", High: "#DC2626" };
function PriorityTag({ priority }) {
  if (!priority) return null;
  const color = PRIORITY_COLOR[priority] || PRIORITY_COLOR.Medium;
  return (
    <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium" style={{ color }}>
      <Flag size={10} fill={color} strokeWidth={0} /> {priority}
    </span>
  );
}

export default function TakdaApp({ isPro = false, onUpgrade, studentName = "" } = {}) {
  const [ready, setReady] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [activities, setActivities] = useState([]);
  const [notes, setNotes] = useState([]);
  const [grades, setGrades] = useState([]);
  // Phase 9D Stage 9D-3: structured per-subject class schedule rows. One
  // row = one weekday's recurring class session (see storageAdapter's
  // toSubjectSchedule/subjectScheduleRows for the DB shape). Editing UI
  // groups rows that share identical time/location/reminder/notification
  // values back into one multi-day form group; saving re-expands each
  // group into one row per selected weekday.
  const [subjectSchedules, setSubjectSchedules] = useState([]);
  // Stage 4C2C: hydrated for creation-time assignment only. Not part of
  // the save effect below — storageAdapter's row builders still omit
  // semester_id entirely, so nothing here is persisted yet.
  const [semesters, setSemesters] = useState([]);
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
  // Hybrid Lesson Materials #3: deliberately separate state from
  // subjects/activities/notes/grades above — subject_materials was kept
  // out of the generic takda-app-data snapshot in Hybrid Materials #2,
  // so it is loaded, saved, and error-reported independently and never
  // joins the save effect's dependency array below.
  const [materials, setMaterials] = useState([]);
  const [materialsLoading, setMaterialsLoading] = useState(true);
  const [materialsError, setMaterialsError] = useState("");

  // Hybrid Lesson Materials #9B: account-wide Storage Usage Indicator —
  // display-only, derived entirely from the SAME unfiltered `materials`
  // array already loaded above (loadSubjectMaterials() has no subject/
  // semester filter at all), so this requires zero additional network
  // calls and automatically reflects every existing create/delete path
  // that already updates `materials`. Deliberately NOT filtered by
  // activeSubjectId/selectedSemesterId — this must stay the same number
  // regardless of which subject is open, and archived/Unassigned
  // uploads must count exactly like any other upload. Links contribute
  // nothing (material_type !== "upload" is simply skipped inside
  // computeAccountUploadUsageBytes). This value is never passed into
  // any quota decision — wouldExceedMaterialUploadQuota and the #8A
  // database trigger remain the only enforcement, each recomputing
  // usage freshly from the database at the moment of an actual upload,
  // independent of this memo.
  //
  // computeAccountUploadUsageBytes defensively parses each row's
  // fileSize (which may be a JS number OR a numeric string, since
  // file_size is a Postgres bigint column) rather than trusting it
  // directly — a naive `sum + m.fileSize` would silently string-
  // concatenate instead of add whenever Supabase returns a string,
  // corrupting the total. `accountUploadUsageValid` is false the
  // moment any upload row's size can't be parsed cleanly; the render
  // below must never show a number when it is false.
  const { usageBytes: accountUploadUsageBytes, isValid: accountUploadUsageValid } = useMemo(
    () => computeAccountUploadUsageBytes(materials),
    [materials]
  );

  // Mirrors getMaterialUploadLimitBytes's own Free/Pro selection, but
  // reuses the `isPro` prop already derived (and already periodically
  // refreshed) by main.jsx rather than re-querying profiles a second
  // time purely for display — see the #9B planning audit for why this
  // is safe for a cosmetic indicator even though the real preflight in
  // storageAdapter.js deliberately never trusts this same prop.
  const materialUploadLimitBytes = isPro
    ? PRO_MATERIAL_UPLOAD_LIMIT_BYTES
    : FREE_MATERIAL_UPLOAD_LIMIT_BYTES;
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  // Hybrid Lesson Materials #5C: a separate modal/state from the link
  // modal above — upload is a different workflow (a file, not a URL)
  // and never supports edit/replace in this stage, so it has no
  // "editing" counterpart to editingMaterial.
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [limitNotice, setLimitNotice] = useState(null);
  const limitModalReturnFocusRef = useRef(null);
  // Stage 4D: which semester is currently being VIEWED. Deliberately a
  // separate piece of state from activeSemesterId (which governs where new
  // records get created and Free-plan quota) — the two are never conflated.
  // null means the "Unassigned / Previous Data" bucket.
  const [selectedSemesterId, setSelectedSemesterId] = useState(null);
  const [showSemesterManager, setShowSemesterManager] = useState(false);
  const [semesterNotice, setSemesterNotice] = useState("");
  const hasInitializedSelectedSemesterRef = useRef(false);
  // Stage 9A: in-app-only reminders panel. No Notification permission, no
  // service worker involvement — a plain modal like the others below.
  const [showReminders, setShowReminders] = useState(false);
  // Stage 9A fix: which single urgency group the modal is narrowed to —
  // "all" shows every group, same as before this fix. UI-only, never
  // persisted, and always explicitly reset on every open so a filter never
  // leaks from one modal opening into the next.
  const [reminderFilter, setReminderFilter] = useState("all");
  // Stage 9B: device/browser notifications. notificationPermission mirrors
  // the browser's real Notification.permission ("default" | "granted" |
  // "denied" | "unsupported") — it is only ever changed by an explicit user
  // action (the Enable button) or by a focus/visibility recheck, never
  // requested automatically. notificationsPreferred is the device-local
  // on/off choice (localStorage only, never synced) — browser permission
  // stays the actual source of truth: see notificationsActive below.
  const [notificationPermission, setNotificationPermission] = useState(() => getNotificationPermission());
  const [notificationsPreferred, setNotificationsPreferred] = useState(() => getNotificationsEnabledPreference());
  const notificationsActive = notificationPermission === "granted" && notificationsPreferred;

  useEffect(() => { loadFont(); }, []);

  // Notification.permission can change outside React's knowledge (the
  // student changes it in browser/OS settings while the tab stays open) —
  // this only re-reads the already-current value, it never calls
  // requestPermission() itself.
  useEffect(() => {
    function recheckNotificationPermission() {
      setNotificationPermission(getNotificationPermission());
    }
    window.addEventListener("focus", recheckNotificationPermission);
    document.addEventListener("visibilitychange", recheckNotificationPermission);
    return () => {
      window.removeEventListener("focus", recheckNotificationPermission);
      document.removeEventListener("visibilitychange", recheckNotificationPermission);
    };
  }, []);

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
          setSemesters(parsed.semesters || []);
          setSubjectSchedules(parsed.subjectSchedules || []);
        }
      } catch (e) {
        // no existing data yet
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // Hybrid Lesson Materials #3: load subject_materials independently of
  // the snapshot above and of `ready` — a slow/failed materials load
  // must never block the rest of Takda (Subjects/Activities/Grades/
  // Calendar all stay usable regardless). Loaded once at startup, not
  // re-fetched merely because a subject is opened, matching how
  // subjects/activities/notes are already all resident in memory before
  // any subject is ever opened.
  useEffect(() => {
    (async () => {
      try {
        const loaded = await loadSubjectMaterials();
        setMaterials(loaded);
      } catch (e) {
        console.error("Takda: unable to load subject materials", e);
        setMaterialsError("Couldn't load lesson materials.");
      } finally {
        setMaterialsLoading(false);
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
          JSON.stringify({ subjects, activities, notes, grades, subjectSchedules })
        );
        setSaveError(!result);
      } catch (e) {
        setSaveError(true);
      }
    })();
  }, [subjects, activities, notes, grades, subjectSchedules, ready]);

  const subjectMap = useMemo(() => {
    const m = {};
    subjects.forEach((s) => (m[s.id] = s));
    return m;
  }, [subjects]);

  // Stage 4C2C: derived only, never guessed. No active semester (including
  // "no semesters exist at all") resolves to null, exactly like today.
  const activeSemesterId = useMemo(
    () => semesters.find((semester) => semester.isActive)?.id ?? null,
    [semesters]
  );

  // Stage 4D: selectedSemesterId starts in sync with activeSemesterId the
  // first time hydration completes, then becomes fully user-controlled —
  // it never silently follows activeSemesterId again after that (e.g.
  // activating a different semester elsewhere does not yank the user's
  // current view out from under them; only the explicit switcher, or the
  // Manager's own "Set as Active" action, changes it after this).
  useEffect(() => {
    if (!ready) return;
    if (hasInitializedSelectedSemesterRef.current) return;
    hasInitializedSelectedSemesterRef.current = true;
    setSelectedSemesterId(activeSemesterId);
  }, [ready, activeSemesterId]);

  const selectedSemester = useMemo(
    () => (selectedSemesterId ? semesters.find((s) => s.id === selectedSemesterId) || null : null),
    [semesters, selectedSemesterId]
  );
  const isSelectedSemesterArchived = !!selectedSemester?.archivedAt;
  // Phase 9D Stage 9D-5: the full ACTIVE semester object (startDate/endDate
  // included), as opposed to selectedSemester above which follows whatever
  // semester is currently being BROWSED. Class reminders care about what's
  // actually active right now, exactly like currentSemesterSubjectIds below.
  const activeSemester = useMemo(
    () => (activeSemesterId ? semesters.find((s) => s.id === activeSemesterId) || null : null),
    [semesters, activeSemesterId]
  );
  // Creation-gating matrix (backward-compatible with pre-Stage-4D behavior):
  //   1. Zero semesters at all           -> allowed (legacy/no-adoption users
  //      keep creating semesterId-null records exactly as before).
  //   2. Semesters exist but none active -> blocked (must explicitly
  //      activate one — a plain selectedSemesterId === activeSemesterId
  //      check would wrongly allow this, since both sides are null).
  //   3. Viewing the active semester     -> allowed.
  //   4. Viewing anything else (another
  //      inactive semester, an archived
  //      semester, or Unassigned once
  //      semesters exist)                -> blocked.
  const canCreateInSelectedSemester =
    semesters.length === 0 ||
    (activeSemesterId !== null && selectedSemesterId === activeSemesterId);

  const semesterCreationBlockedReason = canCreateInSelectedSemester
    ? ""
    : semesters.length > 0 && activeSemesterId === null
    ? "Set a semester as active to add new academic records."
    : "Switch to your active semester to add new academic records.";

  function isSemesterArchived(semesterId) {
    if (semesterId == null) return false;
    return !!semesters.find((s) => s.id === semesterId)?.archivedAt;
  }

  // Hybrid Lesson Materials #3: deliberately derived from the ACTUAL
  // opened subject's own semesterId — never from selectedSemesterId/
  // canCreateInSelectedSemester/isSelectedSemesterArchived above, which
  // describe whatever semester is merely being BROWSED. Those two can
  // momentarily disagree with the opened subject's real semester during
  // an archive-while-viewing transition (handleArchiveSemester reassigns
  // selectedSemesterId to whatever semester, if any, is still active —
  // not to the one that was just archived — while `view` can still be
  // "subject-detail" showing a subject that belonged to the
  // now-archived one). Lesson Materials' own CRUD permission must never
  // depend on that transient mismatch, so it is computed fresh from the
  // subject that is actually open.
  const openedSubject = subjectMap[activeSubjectId] || null;
  const openedSubjectSemesterId = openedSubject ? (openedSubject.semesterId ?? null) : null;
  const isOpenedSubjectSemesterArchived = isSemesterArchived(openedSubjectSemesterId);

  // Edit/Delete: blocked only when the opened subject's own semester is
  // actually archived — independent of whether it's the currently active
  // one. Matches the existing readOnly (not canCreate) semantics that
  // already govern Activities/Notes edit/delete for this same subject.
  const materialsReadOnly = isOpenedSubjectSemesterArchived;

  // Add: deliberately MORE permissive than canCreateInSelectedSemester's
  // own matrix for the null-semester case specifically — per explicit
  // product requirement, a legacy/unassigned subject (semesterId ===
  // null) always keeps full material CRUD, even while a different
  // semester is active and even though the generic activities/notes
  // creation matrix (rule 4 above) would block creation into Unassigned
  // once any semester exists. A subject that DOES belong to a real,
  // specific semester may only have NEW materials added while that is
  // the currently active one — identical restriction to every other
  // child-of-subject entity, preserving the existing Takda creation
  // restriction for that case. (The explicit !isOpenedSubjectSemester
  // Archived term is redundant with both qualifying branches below —
  // activeSemesterId can never itself be archived, and a null semesterId
  // can never be archived either — but is kept for clarity.)
  const canAddMaterials =
    !isOpenedSubjectSemesterArchived &&
    (openedSubjectSemesterId === null || openedSubjectSemesterId === activeSemesterId);

  // Creation-time semester inheritance only — never used for edits. A
  // subject-linked record always inherits that subject's own semesterId,
  // including null for a legacy subject, rather than the active semester,
  // so a legacy subject's children can never be pulled into whatever
  // semester happens to be active. A general (no-subject) record uses the
  // active semester. A non-null subjectId that doesn't resolve to a real
  // subject is a distinct case from "subject found with semesterId null" —
  // it throws rather than guessing the active semester, so callers can
  // abort the creation instead of silently mis-assigning it. Callers must
  // invoke this outside of any setState updater: a throw inside an updater
  // runs during React's render phase and would crash the app (no error
  // boundary exists here) instead of safely aborting.
  function semesterIdForNewChild(subjectId) {
    if (!subjectId) return activeSemesterId ?? null;
    const subject = subjects.find((s) => s.id === subjectId);
    if (!subject) {
      throw new Error("Selected subject could not be found.");
    }
    return subject.semesterId ?? null;
  }

  // Semester hotfix: subjects a NEW activity is allowed to reference,
  // independent of semesterIdForNewChild (which addNote/addNoteToSubject/
  // saveGrade still use unchanged). While viewing/creating in an active
  // semester, an activity must only be able to attach to a subject that
  // already belongs to that same semester — never a legacy/Unassigned
  // subject and never a subject from a different semester — so it can
  // never end up assigned to a subject whose own semesterId disagrees
  // with the activity's. Zero-semesters legacy users are unrestricted, and
  // creation is already blocked upstream whenever semesters exist but none
  // is active, so this list is never actually rendered/used in that case.
  const creatableSubjectsForActivity = useMemo(() => {
    if (semesters.length === 0) return subjects;
    if (activeSemesterId === null) return [];
    return subjects.filter((s) => s.semesterId === activeSemesterId);
  }, [subjects, semesters.length, activeSemesterId]);

  // Semester hotfix: resolves the semesterId for a NEW activity only.
  // Unlike semesterIdForNewChild, this never lets an activity inherit a
  // subject's semesterId that disagrees with the currently active
  // semester — it throws instead, so the caller can reject the creation
  // rather than silently filing the activity under the wrong (or no)
  // semester. Editing never calls this — an existing activity's
  // semesterId is always preserved untouched.
  function semesterIdForNewActivity(subjectId) {
    if (!subjectId) return activeSemesterId ?? null;
    const subject = subjects.find((s) => s.id === subjectId);
    if (!subject) {
      throw new Error("Selected subject could not be found.");
    }
    if (semesters.length > 0 && (subject.semesterId ?? null) !== activeSemesterId) {
      throw new Error("Selected subject does not belong to the active semester.");
    }
    return subject.semesterId ?? null;
  }

  // Phase 9C Stage 9C-4A: wraps semesterIdForNewActivity so both the
  // plain-create and recurring-create paths in saveActivity share one
  // notice/cleanup behavior instead of duplicating the same try/catch.
  // For a recurring series this is called exactly ONCE for the whole
  // batch — never once per generated occurrence — so every occurrence
  // ends up with the identical, already-validated semesterId.
  function resolveNewActivitySemesterId(subjectId) {
    try {
      return { semesterId: semesterIdForNewActivity(subjectId) };
    } catch (e) {
      console.error("Takda: aborted creating activity —", e.message);
      return { errorMessage: e.message };
    }
  }

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

  // Stage 9A: Smart Reminders are scoped to the ACTIVE semester — never
  // selectedSemesterId (the transient viewing choice) — so browsing an
  // archived/inactive semester never changes what the student is reminded
  // about. This mirrors the exact same active-semester-scoping rule already
  // used for Free-plan quota (Stage 4D): zero semesters ever created keeps
  // legacy/no-adoption users on identical null-semesterId behavior, but once
  // semesters exist, "no active semester" means zero reminders rather than
  // falling back to the null/Unassigned bucket.
  const activeSemesterName = useMemo(
    () => semesters.find((s) => s.isActive)?.name ?? null,
    [semesters]
  );
  const hasActiveSemesterForReminders = activeSemesterId !== null;
  // Phase 10A Implementation #4: Dashboard active-semester context label.
  // The ACTIVE-scoped Dashboard block (Next Class/Today's Classes/Smart
  // Reminders/Smart Insights — see reminderRelevantActivities/
  // currentSemesterSubjectIds above) always reflects activeSemesterId,
  // never selectedSemesterId. This boolean is the sole condition for
  // showing a short label explaining that, computed here (not inside
  // Dashboard) so the presentational Dashboard component never needs to
  // know selectedSemesterId or perform semester comparisons itself.
  // Hidden whenever there is no ambiguity to explain: no semesters at
  // all, no active semester to name, or the browsed semester already IS
  // the active one.
  const showActiveSemesterContext =
    semesters.length > 0 && activeSemesterId !== null && selectedSemesterId !== activeSemesterId;
  const reminderRelevantActivities = useMemo(() => {
    if (semesters.length === 0) {
      return enrichedActivities.filter((a) => (a.semesterId ?? null) === null);
    }
    if (activeSemesterId === null) {
      return [];
    }
    return enrichedActivities.filter((a) => a.semesterId === activeSemesterId);
  }, [enrichedActivities, semesters.length, activeSemesterId]);

  // Phase 10A Implementation #2: Smart Insights. Reuses
  // reminderRelevantActivities AS-IS (already ACTIVE-semester-scoped,
  // never selectedSemesterId, with the exact same zero-semesters/
  // no-active-semester rules Smart Reminders above already follows) —
  // no second semester filter is introduced here. computeSmartInsights
  // itself already excludes completed activities and treats every
  // recurring occurrence as independent, so nothing further is filtered
  // here. `now` is read fresh at the point of computation (this file has
  // no existing shared "now" value to reuse, matching how
  // computeStatus/urgency/greeting already each call new Date()
  // independently) and is not tracked as a dependency, exactly like
  // contextMessage/focusLists above.
  const smartInsights = useMemo(
    () =>
      computeSmartInsights({
        activities: reminderRelevantActivities,
        now: new Date(),
      }),
    [reminderRelevantActivities]
  );

  // Phase 10A Implementation #3: overdue-only Smart Insight action.
  // Smart Insights are computed from the ACTIVE semester's activities
  // (reminderRelevantActivities above) — so before reusing the existing
  // goToActivities Activities-navigation handler, selectedSemesterId
  // (the transient viewing choice) must be synchronized to
  // activeSemesterId first, or the destination Activities list
  // (viewEnrichedActivities, which is selectedSemesterId-scoped) could
  // show a different semester's activities than the ones this insight
  // actually counted. Only done when semesters actually exist and one
  // is active — when semesters.length === 0, selectedSemesterId is
  // never touched here (it stays whatever the existing legacy
  // zero-semester behavior already has it at, i.e. null), so a legacy/
  // no-adoption user's Unassigned bucket is never disturbed.
  function activateOverdueSmartInsight() {
    if (semesters.length > 0 && activeSemesterId !== null) {
      setSelectedSemesterId(activeSemesterId);
    }
    goToActivities("overdue");
  }

  // Attaches onActivate ONLY to the "overdue" insight — near_term_deadlines
  // and busiest_upcoming_day have no exact existing Activities filter/
  // navigation equivalent (see the Phase 10A Implementation #3 audit), so
  // they are deliberately left as plain display-only insight objects,
  // unchanged from what computeSmartInsights already returns. This never
  // mutates smartInsights itself and never teaches SmartInsightsSection
  // anything about ACTIVITY_FILTER_KEYS/semester rules/goToActivities —
  // it only decides WHICH insight gets a callback.
  const smartInsightDescriptors = useMemo(
    () =>
      smartInsights.map((insight) =>
        insight.type === "overdue" ? { ...insight, onActivate: activateOverdueSmartInsight } : insight
      ),
    [smartInsights]
  );

  // Phase 9D Stage 9D-4A: Today's Classes / Next Class are scoped to the
  // ACTIVE semester using the exact same rule as Smart Reminders just above
  // (reminderRelevantActivities) — zero semesters ever created keeps
  // legacy/no-adoption users seeing their null-semesterId subjects' classes
  // exactly as before, but once semesters exist, "no active semester" means
  // zero current classes rather than falling back to the Unassigned bucket.
  // Purely derived — subjectSchedules itself is never filtered or mutated.
  const currentSemesterSubjectIds = useMemo(() => {
    if (semesters.length === 0) {
      return new Set(subjects.filter((s) => (s.semesterId ?? null) === null).map((s) => s.id));
    }
    if (activeSemesterId === null) return new Set();
    return new Set(subjects.filter((s) => s.semesterId === activeSemesterId).map((s) => s.id));
  }, [subjects, semesters.length, activeSemesterId]);

  const currentSemesterSchedules = useMemo(
    () => subjectSchedules.filter((row) => currentSemesterSubjectIds.has(row.subjectId)),
    [subjectSchedules, currentSemesterSubjectIds]
  );

  const todaysClasses = useMemo(() => {
    const todayDow = new Date().getDay();
    return currentSemesterSchedules
      .filter((row) => row.dayOfWeek === todayDow)
      .map((row) => ({ ...row, subject: subjectMap[row.subjectId] }))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [currentSemesterSchedules, subjectMap]);

  const nextClass = useMemo(
    () => findNextClass(currentSemesterSchedules, subjectMap),
    [currentSemesterSchedules, subjectMap]
  );

  // Non-completed only — urgency() already returns "done" for a completed
  // activity, so it can never land in overdue/today/tomorrow/week below, but
  // the computedStatus check is kept explicit rather than relied upon
  // implicitly.
  const reminderGroups = useMemo(() => {
    const open = reminderRelevantActivities.filter((a) => a.computedStatus !== "completed");
    return {
      overdue: open.filter((a) => a.urgencyKey === "overdue"),
      dueToday: open.filter((a) => a.urgencyKey === "today"),
      dueTomorrow: open.filter((a) => a.urgencyKey === "tomorrow"),
      dueSoon: open.filter((a) => a.urgencyKey === "week"),
    };
  }, [reminderRelevantActivities]);

  // Bell badge intentionally excludes "Due Soon" (the week-out bucket) —
  // only overdue/today/tomorrow are urgent enough to warrant a numeric badge.
  const reminderBadgeCount =
    reminderGroups.overdue.length + reminderGroups.dueToday.length + reminderGroups.dueTomorrow.length;

  // Stage 9B: fire device notifications for the same overdue/today/tomorrow
  // set as the bell badge — deliberately excludes "Due Soon" to avoid noise.
  // Reuses reminderGroups as-is; no second deadline calculation exists here.
  // Only runs at all when the student has actually enabled notifications
  // (permission granted AND their local preference is on).
  useEffect(() => {
    if (!notificationsActive) return;
    const notifiable = [...reminderGroups.overdue, ...reminderGroups.dueToday, ...reminderGroups.dueTomorrow];
    if (notifiable.length === 0) return;
    // Included so a permanently-overdue activity gets a gentle once-a-day
    // nudge instead of notifying only once ever — while still never firing
    // more than once for the same activity/category/deadline on the same
    // calendar day, including across re-renders and refreshes.
    const todayKey = formatLocalDate(new Date());
    notifiable.forEach((activity) => {
      const dedupKey = `${activity.id}|${activity.urgencyKey}|${activity.deadline}|${todayKey}`;
      if (hasNotifiedFor(dedupKey)) return;
      const subjectLabel = activity.subject?.name || "General";
      const deadlineLabel = fmtDate(activity.deadline);
      const title =
        activity.urgencyKey === "overdue"
          ? `Overdue: ${activity.title}`
          : activity.urgencyKey === "today"
          ? `Due Today: ${activity.title}`
          : `Due Tomorrow: ${activity.title}`;
      showDeviceNotification(title, {
        body: `${subjectLabel} • Due ${deadlineLabel}`,
        icon: "/takda-icon.png",
        tag: dedupKey,
      }).then((shown) => {
        // Only marked once actually shown, so a transient failure never
        // silently suppresses a real reminder forever.
        if (shown) markNotifiedFor(dedupKey);
      });
    });
  }, [reminderGroups, notificationsActive]);

  // Phase 9D Stage 9D-5: foreground class reminders. Reuses the exact same
  // notificationsActive gate, showDeviceNotification delivery, and
  // hasNotifiedFor/markNotifiedFor dedup store as the Activity effect just
  // above — only eligibility/timing/copy differ, and the two run fully
  // independently (distinct dedup namespaces, see classReminderDedupKey).
  // Foreground-only by design (Stage 9B infrastructure, not Web Push):
  // this only ever runs while TakdaApp is mounted/the tab is open.
  //
  // Unlike the Activity effect above — which only needs to notice a DATA
  // change — class reminders are minute-precision and must also notice
  // pure TIME passing with zero data changes (e.g. the tab sits open from
  // 7:30 to 7:45 with nothing else happening). A recurring interval covers
  // that; the focus/visibilitychange recheck (same two events already used
  // for the permission recheck near the top of this component) catches
  // anything missed while the tab/device was backgrounded or asleep,
  // bounded by getDueClassReminders' own grace window (eligible any time
  // up to the class's own endTime — never resurfaces a reminder for a
  // class that's already over).
  useEffect(() => {
    if (!notificationsActive) return;
    if (currentSemesterSchedules.length === 0) return;

    function checkClassReminders() {
      const due = getDueClassReminders(new Date(), currentSemesterSchedules, subjectMap, activeSemester);
      due.forEach(({ row, subject, classStart }) => {
        const dedupKey = classReminderDedupKey(row.id, classStart, row.reminderMinutes);
        if (hasNotifiedFor(dedupKey)) return;
        showDeviceNotification(classReminderTitle(subject?.name, row.reminderMinutes), {
          body: classReminderBody(row.startTime, row.location),
          icon: "/takda-icon.png",
          tag: dedupKey,
        }).then((shown) => {
          if (shown) markNotifiedFor(dedupKey);
        });
      });
    }

    checkClassReminders();
    const intervalId = setInterval(checkClassReminders, CLASS_REMINDER_CHECK_INTERVAL_MS);
    window.addEventListener("focus", checkClassReminders);
    document.addEventListener("visibilitychange", checkClassReminders);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", checkClassReminders);
      document.removeEventListener("visibilitychange", checkClassReminders);
    };
  }, [currentSemesterSchedules, subjectMap, activeSemester, notificationsActive]);

  // Stage 4D: view-level-only filtering by the currently SELECTED semester.
  // These derived arrays are for display alone — the save effect below still
  // sends the full, unfiltered subjects/activities/notes/grades arrays to
  // window.storage.set(), because storageAdapter's deleteRemovedRows()
  // deletes any row absent from what it's given. Passing a filtered array
  // there would permanently delete every hidden record.
  const viewSubjects = useMemo(
    () => subjects.filter((s) => (s.semesterId ?? null) === selectedSemesterId),
    [subjects, selectedSemesterId]
  );
  const viewEnrichedActivities = useMemo(
    () => enrichedActivities.filter((a) => (a.semesterId ?? null) === selectedSemesterId),
    [enrichedActivities, selectedSemesterId]
  );
  const viewNotes = useMemo(
    () => notes.filter((n) => (n.semesterId ?? null) === selectedSemesterId),
    [notes, selectedSemesterId]
  );
  const viewGrades = useMemo(
    () => grades.filter((g) => (g.semesterId ?? null) === selectedSemesterId),
    [grades, selectedSemesterId]
  );

  // Phase 9D Stage 9D-4B: Calendar's class occurrences use the exact same
  // selectedSemesterId scoping as viewSubjects/viewEnrichedActivities right
  // above — Calendar's own established semester behavior (browsing an
  // archived semester already shows that semester's activities; classes
  // now follow the same rule so the two never disagree about which
  // semester is "current" on that screen). This is deliberately NOT the
  // activeSemesterId scoping Dashboard's Today's Classes/Next Class use —
  // those are "what's actually happening now" regardless of what's being
  // browsed, while Calendar is inherently a browse-any-semester view.
  const viewSubjectIds = useMemo(() => new Set(viewSubjects.map((s) => s.id)), [viewSubjects]);
  const calendarSchedules = useMemo(
    () => subjectSchedules.filter((row) => viewSubjectIds.has(row.subjectId)),
    [subjectSchedules, viewSubjectIds]
  );

  // Free-plan limits are scoped to the ACTIVE semester only (never the
  // selected/viewed one, and never a global count). When there is no
  // active semester, the count is always 0 — legacy null-semesterId
  // records never count toward this quota, even though they're the ones
  // shown in the Unassigned bucket.
  const activeSemesterSubjectCount = useMemo(
    () => (activeSemesterId ? subjects.filter((s) => s.semesterId === activeSemesterId).length : 0),
    [subjects, activeSemesterId]
  );
  const activeSemesterActivityCount = useMemo(
    () => (activeSemesterId ? activities.filter((a) => a.semesterId === activeSemesterId).length : 0),
    [activities, activeSemesterId]
  );

  // Single source of truth for the Dashboard's urgency-based sections —
  // Overdue and Due Today are kept as separate, non-overlapping lists so
  // "Today's Tasks" never mixes in items that are actually overdue.
  // Purely derived from viewEnrichedActivities; nothing here is stored.
  const focusLists = useMemo(() => {
    const open = viewEnrichedActivities.filter((a) => a.computedStatus !== "completed");
    const byDeadlineAsc = (a, b) => new Date(a.deadline) - new Date(b.deadline);
    return {
      overdue: open.filter((a) => a.urgencyKey === "overdue").sort(byDeadlineAsc),
      dueToday: open.filter((a) => a.urgencyKey === "today").sort(byDeadlineAsc),
      upcoming: open.filter((a) => ["tomorrow", "week", "later"].includes(a.urgencyKey)).sort(byDeadlineAsc),
    };
  }, [viewEnrichedActivities]);

  const recentlyCompleted = useMemo(
    () =>
      viewEnrichedActivities
        .filter((a) => a.computedStatus === "completed")
        .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0))
        .slice(0, 5),
    [viewEnrichedActivities]
  );

  const stats = useMemo(() => {
    const pending = viewEnrichedActivities.filter((a) => a.computedStatus !== "completed").length;
    const completed = viewEnrichedActivities.filter((a) => a.computedStatus === "completed").length;
    // Reuse focusLists so "Due Today" has one definition across the whole
    // Dashboard — this must never include overdue activities.
    return { subjects: viewSubjects.length, pending, completed, dueToday: focusLists.dueToday.length };
  }, [viewEnrichedActivities, viewSubjects, focusLists]);

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

  // Phase 09B.10: timePeriod now lives in real state, re-derived from the
  // device clock on a lightweight 60s interval (not a high-frequency
  // timer), so the greeting/hero actually updates when the user crosses
  // a morning/afternoon/night boundary during an open session — the
  // previous `useMemo(..., [])` computed this once at mount and never
  // again, which this step was explicitly asked to fix (see Phase
  // 09B.10's own instruction #7).
  const [timePeriod, setTimePeriod] = useState(() => getTimePeriod());

  useEffect(() => {
    const id = setInterval(() => setTimePeriod(getTimePeriod()), 60000);
    return () => clearInterval(id);
  }, []);

  const greeting = useMemo(() => {
    if (timePeriod === "morning") return "Good Morning";
    if (timePeriod === "afternoon") return "Good Afternoon";
    return "Good Evening";
  }, [timePeriod]);

  // TAKDA 2.0 Dashboard (Phase 10A): Academic Performance overview card.
  // This is the EXACT SAME formula as GradesView's own `overallAverage`
  // (gradePercent is the same shared, unmodified pure function) —
  // computed once more here only so the Dashboard can display it
  // without GradesView itself passing anything new through. No grade
  // calculation was changed or duplicated with different logic.
  const dashboardOverallAverage = useMemo(() => {
    if (grades.length === 0) return null;
    return grades.reduce((sum, g) => sum + gradePercent(g), 0) / grades.length;
  }, [grades]);

  function captureLimitModalReturnFocus(element = document.activeElement) {
    limitModalReturnFocusRef.current = element instanceof HTMLElement ? element : null;
  }

  function requestAddSubject() {
    if (!canCreateInSelectedSemester) {
      setSemesterNotice(semesterCreationBlockedReason);
      return;
    }
    if (!isPro && activeSemesterSubjectCount >= FREE_SUBJECT_LIMIT) {
      captureLimitModalReturnFocus();
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

  // Single entry point for every "open the reminders modal" action (bell,
  // "View all reminders", and each individual urgency chip). Always sets the
  // filter explicitly before opening, so a previously selected filter can
  // never leak into the next opening.
  function openReminders(filter) {
    setReminderFilter(filter);
    setShowReminders(true);
  }

  // Reminders panel/bell → Subject Detail. Closes the panel first so the
  // student isn't left with a modal floating over the new view, reusing the
  // exact same navigation Dashboard's own ActivityRow already uses.
  function openSubjectFromReminders(subjectId) {
    if (!subjectId) return;
    setShowReminders(false);
    setActiveSubjectId(subjectId);
    setView("subject-detail");
  }

  // Stage 9B: only ever invoked from a direct click on the "Enable" button
  // in the Reminders panel — never on load, after login, after refresh, or
  // after any background state change.
  //
  // Stage 9E-2: once permission is granted, also attempts to capture and
  // persist a Web Push subscription for this device — additive only.
  // subscribeToPush() is fully self-contained (it no-ops on an
  // unsupported browser, a missing authenticated user, or a missing
  // public VAPID key) and never throws, so it can never block or alter
  // the existing foreground permission/preference flow above it.
  async function handleEnableNotifications() {
    const result = await requestNotificationPermission();
    setNotificationPermission(result);
    if (result === "granted") {
      setNotificationsEnabledPreference(true);
      setNotificationsPreferred(true);
      subscribeToPush();
    }
  }

  // Turns the device-local preference back off without touching the actual
  // browser permission — the student can re-enable later without another
  // permission prompt as long as permission is still "granted".
  //
  // Stage 9E-2: also unsubscribes THIS device's Web Push registration (and
  // removes only its own push_subscriptions row) — never another device's,
  // never another user's. Fire-and-forget: unsubscribeFromPush() never
  // throws, so it can never block the existing preference toggle above it.
  function handleDisableNotifications() {
    setNotificationsEnabledPreference(false);
    setNotificationsPreferred(false);
    unsubscribeFromPush();
  }

  // One clearly-labeled, user-initiated test notification. Deliberately
  // does not touch the dedup store — a test send must never suppress or be
  // suppressed by a real deadline reminder.
  //
  // No fixed `tag` here (unlike real deadline/class reminders, which keep
  // their own tag/dedup behavior entirely untouched elsewhere in this
  // file) — a repeated tag would make the browser silently replace this
  // MANUAL test notification instead of always visibly showing one, which
  // is exactly what a manual test needs to prove is working. Awaits and
  // returns showDeviceNotification()'s existing boolean result instead of
  // discarding it, so a failure is no longer silent.
  async function handleSendTestNotification() {
    const ok = await showDeviceNotification("Takda Notifications", {
      body: "Notifications are working on this device.",
      icon: "/takda-icon.png",
    });
    return ok
      ? { ok: true }
      : { ok: false, error: "Unable to show a notification on this device." };
  }

  // Stage 9E-3C: real background Web Push test trigger — a thin delegate
  // to lib/push.js's sendTestPush(), which owns all session/fetch
  // mechanics, mirroring subscribeToPush/unsubscribeFromPush's existing
  // handlers above. Separate from handleSendTestNotification (Stage
  // 9A/9B's local-only foreground test): that one is unchanged and still
  // never touches the network.
  function handleSendBackgroundPushTest() {
    return sendTestPush();
  }

  // scheduleGroups: the Class Schedule UI groups from SubjectModal (see
  // normalizeGroupsToRows) — always normalized into one subject_schedules
  // row per selected weekday before being written to state.
  function saveSubject(subj, scheduleGroups = []) {
    const isNewSubject = !subj.id;
    let savedSubjectId;
    if (isNewSubject) {
      if (!canCreateInSelectedSemester) {
        setShowAddSubject(false);
        setEditingSubject(null);
        setSemesterNotice(semesterCreationBlockedReason);
        return;
      }
      if (!isPro && activeSemesterSubjectCount >= FREE_SUBJECT_LIMIT) {
        // Block before persistence — the free limit may have been reached by
        // the time the modal is submitted (e.g. another tab). Existing
        // subjects are left untouched.
        setShowAddSubject(false);
        setEditingSubject(null);
        setLimitNotice("subjects");
        return;
      }
      savedSubjectId = uid();
      setSubjects((prev) => [...prev, { ...subj, id: savedSubjectId, semesterId: activeSemesterId ?? null }]);
    } else {
      if (isSemesterArchived(subj.semesterId)) {
        setShowAddSubject(false);
        setEditingSubject(null);
        setSemesterNotice("This semester is archived, so its records are read-only.");
        return;
      }
      // Edit: subj already carries its original semesterId (the modal
      // seeds its form from the full existing subject), so nothing here
      // needs to touch it — a plain replace preserves it unchanged.
      savedSubjectId = subj.id;
      setSubjects((prev) => prev.map((s) => (s.id === subj.id ? subj : s)));
    }
    const normalizedScheduleRows = normalizeGroupsToRows(scheduleGroups, savedSubjectId);
    setSubjectSchedules((prev) => [
      ...prev.filter((s) => s.subjectId !== savedSubjectId),
      ...normalizedScheduleRows,
    ]);
    setShowAddSubject(false);
    setEditingSubject(null);
  }

  function deleteSubject(id) {
    if (isSemesterArchived(subjectMap[id]?.semesterId)) {
      setSemesterNotice("This semester is archived, so its records are read-only.");
      return;
    }
    if (!window.confirm("Delete this subject? Its activities and notes will be deleted too.")) return;
    setSubjects((prev) => prev.filter((s) => s.id !== id));
    setActivities((prev) => prev.filter((a) => a.subjectId !== id));
    setNotes((prev) => prev.filter((n) => n.subjectId !== id));
    setGrades((prev) => prev.filter((g) => g.subjectId !== id));
    // Database cascade already removes subject_schedules for this subject —
    // this only prevents a ghost entry from lingering in frontend state.
    setSubjectSchedules((prev) => prev.filter((sch) => sch.subjectId !== id));
    // Hybrid Lesson Materials #9B: same reasoning as subjectSchedules
    // above — deleteRemovedSubjectsWithMaterialCleanup already removes
    // both the Storage object(s) and the subject_materials rows for
    // this subject server-side, but `materials` was never pruned
    // client-side before this fix, leaving stale upload rows inflating
    // the account-wide Storage Usage Indicator (and the materials list
    // itself, were this subject ever reopened without a full reload).
    setMaterials((prev) => prev.filter((m) => m.subjectId !== id));
    setActiveSubjectId(null);
    setView("subjects");
  }

  // Hybrid Lesson Materials #3: each function re-checks the archived
  // state defensively (same reasoning as deleteSubject's own check
  // above) rather than trusting only that the calling UI already
  // disabled the triggering button — belt-and-suspenders against the
  // same transient selectedSemesterId-vs-subject.semesterId mismatch
  // documented at canAddMaterials/materialsReadOnly above. create/update
  // throw so the modal's own try/catch (which awaits onSave) can
  // display the message; delete returns early instead, matching
  // deleteSubject's own synchronous-feeling early-return shape, since
  // nothing is awaiting its result.
  async function createMaterialLink(subjectId, payload) {
    // Hybrid Lesson Materials #7: clear any stale materialsError left
    // over from an earlier, unrelated action — this shared state must
    // never keep showing an old failure message once a new action has
    // begun, successful or not (a genuine new failure below sets its
    // own fresh message).
    setMaterialsError("");
    // Defense-in-depth: re-derives the SAME creation permission the UI
    // itself computes as canAddMaterials, from the subjectId actually
    // given here rather than trusting the caller's state — a null
    // semesterId is always creatable, a real semester must be the
    // currently active one. This single condition already rejects an
    // archived semester too, with no separate isSemesterArchived check
    // needed: an archived semester can never equal activeSemesterId
    // (semesters_not_active_and_archived is DB-enforced), so "not the
    // active semester" and "archived" are both covered by one check.
    const subjectSemesterId = subjectMap[subjectId]?.semesterId ?? null;
    const canCreate = subjectSemesterId === null || subjectSemesterId === activeSemesterId;
    if (!canCreate) {
      setSemesterNotice("Switch to your active semester to add a lesson material.");
      throw new Error("Switch to your active semester to add a lesson material.");
    }
    const created = await createSubjectMaterialLink({ subjectId, ...payload });
    setMaterials((prev) => [...prev, created]);
    return created;
  }

  async function updateMaterialLink(id, payload) {
    setMaterialsError("");
    const material = materials.find((m) => m.id === id);
    if (material && isSemesterArchived(subjectMap[material.subjectId]?.semesterId)) {
      setSemesterNotice("This semester is archived, so its records are read-only.");
      throw new Error("This semester is archived, so its records are read-only.");
    }
    const updated = await updateSubjectMaterialLink(id, payload);
    setMaterials((prev) => prev.map((m) => (m.id === id ? updated : m)));
    return updated;
  }

  async function deleteMaterialLink(id) {
    setMaterialsError("");
    const material = materials.find((m) => m.id === id);
    if (material && isSemesterArchived(subjectMap[material.subjectId]?.semesterId)) {
      setSemesterNotice("This semester is archived, so its records are read-only.");
      return;
    }
    if (!window.confirm("Delete this lesson material?")) return;
    try {
      await deleteSubjectMaterialLink(id);
      setMaterials((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      console.error("Takda: unable to delete material link", e);
      setMaterialsError(e.message || "Unable to delete this lesson material.");
    }
  }

  // Hybrid Lesson Materials #5C: same defense-in-depth reasoning as
  // createMaterialLink above — re-derives the SAME creation permission
  // from the subjectId actually given here, never trusting only that
  // the calling UI already disabled the Upload File button. This check
  // happens BEFORE createSubjectMaterialUpload is ever called, so a
  // semester-blocked upload attempt never performs a quota query or a
  // Storage call.
  async function createMaterialUpload(subjectId, payload) {
    setMaterialsError("");
    const subjectSemesterId = subjectMap[subjectId]?.semesterId ?? null;
    const canCreate = subjectSemesterId === null || subjectSemesterId === activeSemesterId;
    if (!canCreate) {
      setSemesterNotice("Switch to your active semester to add a lesson material.");
      throw new Error("Switch to your active semester to add a lesson material.");
    }
    const created = await createSubjectMaterialUpload({ subjectId, ...payload });
    setMaterials((prev) => [...prev, created]);
    return created;
  }

  // Mirrors deleteMaterialLink's shape exactly, but calls the upload
  // data layer (Storage-first delete, already built in #5B/#5B.5).
  async function deleteMaterialUpload(id) {
    setMaterialsError("");
    const material = materials.find((m) => m.id === id);
    if (material && isSemesterArchived(subjectMap[material.subjectId]?.semesterId)) {
      setSemesterNotice("This semester is archived, so its records are read-only.");
      return;
    }
    if (!window.confirm("Delete this lesson material?")) return;
    try {
      await deleteSubjectMaterialUpload(id);
      setMaterials((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      // Unlike the link delete path, deleteSubjectMaterialUpload can
      // throw a raw Storage/Supabase error (it has no custom error
      // class of its own) — a generic message here, with the real
      // error only logged to console, never shown to the user.
      console.error("Takda: unable to delete material upload", e);
      setMaterialsError("Unable to delete this lesson material right now. Please try again.");
    }
  }

  // Single dispatch point so a material's DB delete function can never be
  // mismatched with its actual material_type — an upload row must never
  // reach deleteSubjectMaterialLink (whose query would simply match zero
  // rows while the UI optimistically removed the card, orphaning the
  // real row and its Storage object), and a link must never reach the
  // upload delete path. An unrecognized materialType performs no
  // destructive action at all.
  async function deleteMaterial(material) {
    if (material.materialType === "upload") {
      return deleteMaterialUpload(material.id);
    }
    if (material.materialType === "link") {
      return deleteMaterialLink(material.id);
    }
  }

  // Hybrid Lesson Materials #6: opening is a READ, so it is
  // deliberately never gated by materialsReadOnly/canAddMaterials —
  // a material stays openable in an archived or otherwise mutation-
  // blocked semester, exactly like viewing the card itself already is.
  // The blank tab MUST be opened synchronously, before the signed-URL
  // request, or browsers can treat the later window.open as an
  // unrelated popup and block it — this is the whole reason this
  // function's first line runs before any await.
  async function openMaterial(material) {
    setMaterialsError("");
    const newTab = window.open("", "_blank");

    if (!newTab) {
      setMaterialsError("Unable to open a new tab. Please allow pop-ups and try again.");
      return;
    }

    try {
      const signedUrl = await createSubjectMaterialSignedUrl(material.id);
      newTab.location.href = signedUrl;
    } catch (e) {
      console.error("Takda: unable to open material", e);
      try {
        newTab.close();
      } catch {
        // Best effort only — some browsers restrict closing a tab
        // depending on how it was opened; nothing further to do.
      }
      setMaterialsError("Unable to open this file right now. Please try again.");
    }
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
    if (!canCreateInSelectedSemester) {
      setSemesterNotice(semesterCreationBlockedReason);
      return;
    }
    if (!isPro && activeSemesterActivityCount >= FREE_ACTIVITY_LIMIT) {
      captureLimitModalReturnFocus();
      setLimitNotice("activities");
      return;
    }
    if (subjectId !== undefined) setDefaultSubjectForActivity(subjectId);
    setDefaultDeadlineForActivity(deadline || null);
    setShowAddActivity(true);
  }

  function saveActivity(act) {
    const isNewActivity = !act.id;
    // Phase 9C Stage 9C-4A: recurrenceRule only ever comes from the
    // create-mode Repeat select — edit mode never exposes it, and an
    // existing activity's own recurrenceRule is irrelevant to how a
    // *save* of it should be handled (it's always occurrence-only).
    const isRecurring = isNewActivity && !!act.recurrenceRule;
    if (isNewActivity) {
      if (!canCreateInSelectedSemester) {
        setShowAddActivity(false);
        setEditingActivity(null);
        setDefaultSubjectForActivity(null);
        setDefaultDeadlineForActivity(null);
        setSemesterNotice(semesterCreationBlockedReason);
        return;
      }
      if (!isRecurring && !isPro && activeSemesterActivityCount >= FREE_ACTIVITY_LIMIT) {
        // Block before persistence, same as subjects — editing an existing
        // activity never hits this branch since it always has an id. A
        // recurring creation is quota-checked as a whole batch further
        // below instead, once the number of occurrences is known.
        setShowAddActivity(false);
        setEditingActivity(null);
        setDefaultSubjectForActivity(null);
        setDefaultDeadlineForActivity(null);
        setLimitNotice("activities");
        return;
      }
    } else if (isSemesterArchived(act.semesterId)) {
      setShowAddActivity(false);
      setEditingActivity(null);
      setDefaultSubjectForActivity(null);
      setDefaultDeadlineForActivity(null);
      setSemesterNotice("This semester is archived, so its records are read-only.");
      return;
    }
    // repeatUntil is a create-mode-only UI input for computing occurrence
    // dates — it is never a persisted activity field, so it's kept out of
    // `prepared` entirely (read directly from `act` below instead).
    const { repeatUntil, ...actWithoutRepeatUntil } = act;
    const prepared = {
      ...actWithoutRepeatUntil,
      completedAt: act.status === "completed" ? (act.completedAt || new Date().toISOString()) : null,
      // ActivityModal's "Does not repeat" default is "", but the DB CHECK
      // constraint on recurrence_rule only allows NULL or one of the four
      // rule values — "" must never reach storage as-is.
      recurrenceRule: act.recurrenceRule || null,
    };
    if (prepared.id) {
      // Edit: prepared never carries a semesterId of its own (only the
      // create branches below set one), so spreading it over the existing
      // record leaves a.semesterId untouched. recurrenceSeriesId and
      // recurrenceRule are likewise carried through from the original
      // activity untouched — editing is always occurrence-only and never
      // regenerates or reassigns sibling occurrences in a series.
      setActivities((prev) => prev.map((a) => (a.id === prepared.id ? { ...a, ...prepared } : a)));
    } else if (isRecurring) {
      const resolved = resolveNewActivitySemesterId(prepared.subjectId);
      if (resolved.errorMessage) {
        setShowAddActivity(false);
        setEditingActivity(null);
        setDefaultSubjectForActivity(null);
        setDefaultDeadlineForActivity(null);
        setSemesterNotice(resolved.errorMessage);
        return;
      }

      let occurrenceDates;
      try {
        occurrenceDates = generateRecurrenceDates({
          startDate: prepared.deadline,
          repeatUntil,
          recurrenceRule: prepared.recurrenceRule,
        });
      } catch (e) {
        console.error("Takda: aborted creating recurring activity —", e);
        const message =
          e instanceof RecurrenceValidationError
            ? e.code === "too_many_occurrences"
              ? "This repeat schedule creates more than 50 activities. Choose a shorter date range."
              : e.message
            : "Something went wrong generating this repeat schedule. Please try again.";
        setShowAddActivity(false);
        setEditingActivity(null);
        setDefaultSubjectForActivity(null);
        setDefaultDeadlineForActivity(null);
        setSemesterNotice(message);
        return;
      }

      if (occurrenceDates.length === 0) {
        // A structurally valid rule/range can still match nothing (e.g.
        // "Weekdays" over a Saturday-to-Sunday range) — this is a valid
        // empty result from the generator, not an error, so nothing is
        // created and the student is told why rather than seeing silence.
        setShowAddActivity(false);
        setEditingActivity(null);
        setDefaultSubjectForActivity(null);
        setDefaultDeadlineForActivity(null);
        setSemesterNotice("No dates match this repeat schedule. Choose a different date range.");
        return;
      }

      if (!isPro && activeSemesterActivityCount + occurrenceDates.length > FREE_ACTIVITY_LIMIT) {
        // Whole-batch quota check: either every occurrence fits under the
        // remaining Free quota, or none are created — never a partial
        // series just to reach the limit.
        setShowAddActivity(false);
        setEditingActivity(null);
        setDefaultSubjectForActivity(null);
        setDefaultDeadlineForActivity(null);
        setLimitNotice("activities");
        return;
      }

      // One shared series id and one shared, already-validated semesterId
      // for the whole batch — resolved exactly once above, never
      // re-derived per generated date. Everything except id/deadline is
      // identical across every occurrence.
      const recurrenceSeriesId = uid();
      const occurrences = occurrenceDates.map((deadline) => ({
        ...prepared,
        id: uid(),
        deadline,
        semesterId: resolved.semesterId,
        recurrenceSeriesId,
      }));
      setActivities((prev) => [...prev, ...occurrences]);
    } else {
      const resolved = resolveNewActivitySemesterId(prepared.subjectId);
      if (resolved.errorMessage) {
        // Invalid subjectId, or (semester hotfix) a subject that doesn't
        // belong to the active semester — abort. Nothing is appended, no
        // save is triggered. Closes the modal and surfaces the existing
        // semesterNotice banner rather than silently discarding the
        // input, since this should only be reachable via stale modal
        // state (the dropdown itself already excludes these subjects).
        setShowAddActivity(false);
        setEditingActivity(null);
        setDefaultSubjectForActivity(null);
        setDefaultDeadlineForActivity(null);
        setSemesterNotice(resolved.errorMessage);
        return;
      }
      setActivities((prev) => [...prev, { ...prepared, id: uid(), semesterId: resolved.semesterId }]);
    }
    setShowAddActivity(false);
    setEditingActivity(null);
    setDefaultSubjectForActivity(null);
    setDefaultDeadlineForActivity(null);
  }

  function toggleComplete(act) {
    if (isSemesterArchived(act.semesterId)) {
      setSemesterNotice("This semester is archived, so its records are read-only.");
      return;
    }
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
    if (isSemesterArchived(activities.find((a) => a.id === id)?.semesterId)) {
      setSemesterNotice("This semester is archived, so its records are read-only.");
      return;
    }
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
      if (isSemesterArchived(prepared.semesterId)) {
        setSemesterNotice("This semester is archived, so its records are read-only.");
        return false;
      }
      // Edit: prepared already carries its original semesterId (the modal
      // seeds its form from the full existing grade), so a plain replace
      // preserves it unchanged.
      setGrades((prev) => prev.map((g) => (g.id === prepared.id ? prepared : g)));
      return true;
    }

    if (!canCreateInSelectedSemester) {
      setSemesterNotice(semesterCreationBlockedReason);
      return false;
    }

    let semesterId;
    try {
      semesterId = semesterIdForNewChild(prepared.subjectId);
    } catch (e) {
      // Invalid subjectId — abort. Nothing is appended, no save is
      // triggered. Returning false tells GradesView's handleSave not to
      // close the modal, so the user's input isn't silently discarded.
      console.error("Takda: aborted creating grade —", e.message);
      return false;
    }
    setGrades((prev) => [...prev, { ...prepared, id: uid(), semesterId }]);
    return true;
  }

  function deleteGrade(id) {
    if (isSemesterArchived(grades.find((g) => g.id === id)?.semesterId)) {
      setSemesterNotice("This semester is archived, so its records are read-only.");
      return;
    }
    if (!window.confirm("Delete this grade?")) return;
    setGrades((prev) => prev.filter((g) => g.id !== id));
  }

  // Stage 4D: dedicated semester write handlers. These wrap the existing
  // storageAdapter RPC calls (already safe/atomic/RLS-scoped from Stages
  // 4A/4B) and reconcile local `semesters` state on success. Activating a
  // semester also moves the view to it, so the user immediately sees what
  // they just made active. Archiving only moves the view when the archived
  // semester was the one being viewed — every other selection is untouched.
  async function handleCreateSemester(payload) {
    const created = await createSemester(payload);
    setSemesters((prev) => [...prev, created]);
    return created;
  }

  async function handleUpdateSemester(semesterId, payload) {
    const updated = await updateSemesterMetadata(semesterId, payload);
    setSemesters((prev) => prev.map((s) => (s.id === semesterId ? updated : s)));
    return updated;
  }

  async function handleActivateSemester(semesterId) {
    const activated = await activateSemester(semesterId);
    setSemesters((prev) => prev.map((s) => (s.id === semesterId ? activated : { ...s, isActive: false })));
    setSelectedSemesterId(semesterId);
    return activated;
  }

  async function handleArchiveSemester(semesterId) {
    const archived = await archiveSemester(semesterId);
    setSemesters((prev) => prev.map((s) => (s.id === semesterId ? archived : s)));
    if (selectedSemesterId === semesterId) {
      // The semester being archived can never remain active, so the only
      // way another one is still active afterward is if it already was
      // (i.e. some semester other than the one just archived) — otherwise
      // there is now no active semester at all, and the view falls back
      // to Unassigned (null). Archiving never activates a different
      // semester on its own.
      const stillActiveId = semesters.find((s) => s.id !== semesterId && s.isActive)?.id ?? null;
      setSelectedSemesterId(stillActiveId);
    }
    return archived;
  }

  // Returns true/false so callers only clear their own local text input on
  // success, rather than discarding what the user typed when an invalid
  // subjectId aborts creation.
  function addNoteToSubject(body) {
    if (!canCreateInSelectedSemester) {
      setSemesterNotice(semesterCreationBlockedReason);
      return false;
    }
    let semesterId;
    try {
      semesterId = semesterIdForNewChild(activeSubjectId);
    } catch (e) {
      console.error("Takda: aborted creating note —", e.message);
      return false;
    }
    setNotes((prev) => [...prev, { id: uid(), subjectId: activeSubjectId, body, updatedAt: new Date().toISOString(), semesterId }]);
    return true;
  }

  function addNote(subjectId, body) {
    if (!canCreateInSelectedSemester) {
      setSemesterNotice(semesterCreationBlockedReason);
      return false;
    }
    let semesterId;
    try {
      semesterId = semesterIdForNewChild(subjectId);
    } catch (e) {
      console.error("Takda: aborted creating note —", e.message);
      return false;
    }
    setNotes((prev) => [...prev, { id: uid(), subjectId, body, updatedAt: new Date().toISOString(), semesterId }]);
    return true;
  }

  function editNote(id, body) {
    if (isSemesterArchived(notes.find((n) => n.id === id)?.semesterId)) {
      setSemesterNotice("This semester is archived, so its records are read-only.");
      return;
    }
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, body, updatedAt: new Date().toISOString() } : n)));
  }

  function deleteNote(id) {
    if (isSemesterArchived(notes.find((n) => n.id === id)?.semesterId)) {
      setSemesterNotice("This semester is archived, so its records are read-only.");
      return;
    }
    if (!window.confirm("Delete this note?")) return;
    setNotes((prev) => prev.filter((n) => n.id !== id));
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
      className="w-full min-h-[640px] max-w-md mx-auto md:max-w-7xl flex flex-col md:flex-row rounded-2xl overflow-hidden border border-[#E4E4F0] shadow-sm"
    >
      <style>{`
        .font-display { font-family: 'Fraunces', serif; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: #D8D8ED; border-radius: 4px; }
        /* Single source of truth for how much bottom clearance the
           authenticated scroll area must reserve on mobile so its last
           content can clear MobileNav. Traced from MobileNav's own
           markup, not guessed: pt-2(8px) + NavBtn content (py-1.5
           12px + icon 32px + gap-0.5 2px + text-[10px] label line
           ~12px = 58px) + baseline pb 8px = 74px row height, plus the
           center FAB's own -mt-6 (24px) visual protrusion above the
           row = 98px traced minimum, rounded up to 6.5rem (104px) for
           a small safety margin. env(safe-area-inset-bottom) is added
           on top of this at the point of use, matching MobileNav's own
           safe-area handling, so a real device's home-indicator inset
           is reserved for too. */
        :root { --mobile-nav-clearance: 6.5rem; }
      `}</style>

      <Sidebar view={view} setView={setView} onAddSubject={requestAddSubject} canCreate={canCreateInSelectedSemester} />

      <div className="flex-1 flex flex-col min-h-[640px] max-h-[85vh] md:max-h-[720px] overflow-hidden">
        <SemesterBar
          semesters={semesters}
          selectedSemesterId={selectedSemesterId}
          activeSemesterId={activeSemesterId}
          onSelect={setSelectedSemesterId}
          onManage={() => setShowSemesterManager(true)}
          reminderBadgeCount={reminderBadgeCount}
          onOpenReminders={() => openReminders("all")}
        />
        <div className="flex-1 overflow-y-auto pb-[calc(var(--mobile-nav-clearance)+env(safe-area-inset-bottom))] md:pb-6">
          {saveError && (
            <div className="mx-5 mt-4 md:mx-8 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-2">
              Your changes couldn't be saved just now — they may not be here after a refresh.
            </div>
          )}
          {semesterNotice && (
            <div className="mx-5 mt-4 md:mx-8 flex items-start justify-between gap-3 rounded-lg bg-[#F0EEFF] border border-[#DCD9FF] text-[#3D2FE0] text-xs px-3 py-2">
              <span>{semesterNotice}</span>
              <button onClick={() => setSemesterNotice("")} aria-label="Dismiss" className="shrink-0 text-[#3D2FE0]"><X size={14} /></button>
            </div>
          )}
          {view === "dashboard" && (
            <Dashboard
              greeting={greeting}
              contextMessage={contextMessage}
              timePeriod={timePeriod}
              focusLists={focusLists}
              stats={stats}
              recentlyCompleted={recentlyCompleted}
              hasAnySubjectEver={subjects.length > 0}
              hasAnyActivityEver={activities.length > 0}
              onToggle={toggleComplete}
              onOpenSubject={(id) => { setActiveSubjectId(id); setView("subject-detail"); }}
              onAddSubject={requestAddSubject}
              onAddActivity={() => requestAddActivity()}
              onViewSchedule={() => setView("calendar")}
              onOpenGrades={() => setView("grades")}
              isPro={isPro}
              onFocusFilter={goToActivities}
              canCreate={canCreateInSelectedSemester}
              reminderGroups={reminderGroups}
              activeSemesterName={activeSemesterName}
              hasSemesters={semesters.length > 0}
              hasActiveSemesterForReminders={hasActiveSemesterForReminders}
              onOpenReminders={openReminders}
              nextClass={nextClass}
              todaysClasses={todaysClasses}
              smartInsights={smartInsightDescriptors}
              showActiveSemesterContext={showActiveSemesterContext}
              studentName={studentName}
              overallAverage={dashboardOverallAverage}
              onOpenNotes={() => setView("notes")}
            />
          )}

          {view === "subjects" && (
            <SubjectsView
              subjects={viewSubjects}
              activities={viewEnrichedActivities}
              subjectSchedules={subjectSchedules}
              onOpen={(id) => { setActiveSubjectId(id); setView("subject-detail"); }}
              onAdd={requestAddSubject}
              canCreate={canCreateInSelectedSemester}
            />
          )}

          {view === "subject-detail" && activeSubjectId && subjectMap[activeSubjectId] && (
            <SubjectDetail
              subject={subjectMap[activeSubjectId]}
              activities={viewEnrichedActivities.filter((a) => a.subjectId === activeSubjectId)}
              notes={viewNotes.filter((n) => n.subjectId === activeSubjectId)}
              schedules={subjectSchedules.filter((s) => s.subjectId === activeSubjectId)}
              onBack={() => setView("subjects")}
              onEditSubject={() => { setEditingSubject(subjectMap[activeSubjectId]); setShowAddSubject(true); }}
              onDeleteSubject={() => deleteSubject(activeSubjectId)}
              onToggle={toggleComplete}
              onEditActivity={openEditActivity}
              onDeleteActivity={deleteActivity}
              onAddActivity={() => requestAddActivity(activeSubjectId)}
              onAddNote={addNoteToSubject}
              onEditNote={editNote}
              onDeleteNote={deleteNote}
              canCreate={canCreateInSelectedSemester}
              readOnly={isSelectedSemesterArchived}
              materials={materials.filter((m) => m.subjectId === activeSubjectId)}
              materialsLoading={materialsLoading}
              materialsError={materialsError}
              accountUploadUsageBytes={accountUploadUsageBytes}
              accountUploadUsageValid={accountUploadUsageValid}
              materialUploadLimitBytes={materialUploadLimitBytes}
              canAddMaterials={canAddMaterials}
              materialsReadOnly={materialsReadOnly}
              onAddMaterial={() => { setEditingMaterial(null); setShowMaterialModal(true); }}
              onAddUpload={() => setShowUploadModal(true)}
              onEditMaterial={(m) => { setEditingMaterial(m); setShowMaterialModal(true); }}
              onDeleteMaterial={deleteMaterial}
              onOpenMaterial={openMaterial}
            />
          )}

          {view === "calendar" && (
            <CalendarView
              activities={viewEnrichedActivities}
              subjectSchedules={calendarSchedules}
              subjectMap={subjectMap}
              semester={selectedSemester}
              onToggle={toggleComplete}
              onOpenSubject={(id) => { setActiveSubjectId(id); setView("subject-detail"); }}
              onAddActivity={(deadline) => requestAddActivity(undefined, deadline)}
              canCreate={canCreateInSelectedSemester}
              readOnly={isSelectedSemesterArchived}
            />
          )}

          {view === "notes" && (
            <NotesView
              notes={viewNotes}
              subjectMap={subjectMap}
              onAdd={addNote}
              onEdit={editNote}
              onDelete={deleteNote}
              subjects={viewSubjects}
              canCreate={canCreateInSelectedSemester}
              readOnly={isSelectedSemesterArchived}
            />
          )}

          {view === "activities" && (
            <AllActivities
              activities={viewEnrichedActivities}
              query={query}
              setQuery={setQuery}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              onToggle={toggleComplete}
              onEdit={openEditActivity}
              onDelete={deleteActivity}
              onAdd={() => requestAddActivity()}
              canCreate={canCreateInSelectedSemester}
              readOnly={isSelectedSemesterArchived}
            />
          )}

          {view === "grades" && (
            isPro ? (
              <GradesView
                grades={viewGrades}
                subjects={viewSubjects}
                subjectMap={subjectMap}
                onSave={saveGrade}
                onDelete={deleteGrade}
                canCreate={canCreateInSelectedSemester}
                readOnly={isSelectedSemesterArchived}
                onBlockedCreate={() => setSemesterNotice(semesterCreationBlockedReason)}
              />
            ) : (
              <GradeLockedView onUpgrade={onUpgrade} />
            )
          )}
        </div>

        <MobileNav view={view} setView={setView} onFab={() => requestAddActivity()} onMore={() => setShowMore(true)} canCreate={canCreateInSelectedSemester} />
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
          schedules={editingSubject ? subjectSchedules.filter((s) => s.subjectId === editingSubject.id) : []}
          onClose={() => { setShowAddSubject(false); setEditingSubject(null); }}
          onSave={saveSubject}
          onOpenerCapture={(element) => { limitModalReturnFocusRef.current = element; }}
        />
      )}

      {showMaterialModal && (
        <MaterialLinkModal
          material={editingMaterial}
          onClose={() => { setShowMaterialModal(false); setEditingMaterial(null); }}
          onSave={(payload) =>
            editingMaterial
              ? updateMaterialLink(editingMaterial.id, payload)
              : createMaterialLink(activeSubjectId, payload)
          }
        />
      )}

      {showUploadModal && (
        <MaterialUploadModal
          onClose={() => setShowUploadModal(false)}
          onSave={(payload) => createMaterialUpload(activeSubjectId, payload)}
        />
      )}

      {(showAddActivity) && (
        <ActivityModal
          activity={editingActivity}
          subjects={subjects}
          creatableSubjects={creatableSubjectsForActivity}
          defaultSubjectId={defaultSubjectForActivity}
          defaultDeadline={defaultDeadlineForActivity}
          onClose={() => { setShowAddActivity(false); setEditingActivity(null); setDefaultSubjectForActivity(null); setDefaultDeadlineForActivity(null); }}
          onSave={saveActivity}
          onOpenerCapture={(element) => { limitModalReturnFocusRef.current = element; }}
        />
      )}

      {limitNotice && (
        <LimitReachedModal
          kind={limitNotice}
          onClose={() => setLimitNotice(null)}
          onUpgrade={onUpgrade}
          returnFocusRef={limitModalReturnFocusRef}
        />
      )}

      {showSemesterManager && (
        <SemesterManagerModal
          semesters={semesters}
          activeSemesterId={activeSemesterId}
          onClose={() => setShowSemesterManager(false)}
          onCreate={handleCreateSemester}
          onUpdate={handleUpdateSemester}
          onActivate={handleActivateSemester}
          onArchive={handleArchiveSemester}
        />
      )}

      {showReminders && (
        <RemindersModal
          filter={reminderFilter}
          activeSemesterName={activeSemesterName}
          hasSemesters={semesters.length > 0}
          hasActiveSemesterForReminders={hasActiveSemesterForReminders}
          groups={reminderGroups}
          onToggle={toggleComplete}
          onOpenSubject={openSubjectFromReminders}
          onManageSemesters={() => { setShowReminders(false); setShowSemesterManager(true); }}
          onClose={() => setShowReminders(false)}
          notificationPermission={notificationPermission}
          notificationsActive={notificationsActive}
          onEnableNotifications={handleEnableNotifications}
          onDisableNotifications={handleDisableNotifications}
          onSendTestNotification={handleSendTestNotification}
          onSendBackgroundPushTest={handleSendBackgroundPushTest}
        />
      )}
    </div>
  );
}

/* ---------------- Free plan limit notice ---------------- */
function LimitReachedModal({ kind, onClose, onUpgrade, returnFocusRef }) {
  const dialogRef = useRef(null);
  const panelRef = useRef(null);
  const notNowRef = useRef(null);
  const focusLifecycleGenerationRef = useRef(0);
  const restoreFocusOnCleanupRef = useRef(true);
  const message =
    kind === "subjects"
      ? `You’ve reached the Free plan limit of ${FREE_SUBJECT_LIMIT} subjects. Upgrade to Takda Pro for unlimited subjects.`
      : `You’ve reached the Free plan limit of ${FREE_ACTIVITY_LIMIT} tasks. Upgrade to Takda Pro for unlimited tasks.`;

  useLayoutEffect(() => {
    function isAvailableElement(element) {
      if (!(element instanceof HTMLElement) || !element.isConnected || element.matches(":disabled")) return false;
      if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
      const style = window.getComputedStyle(element);
      return (
        !["none", "hidden", "collapse"].includes(style.visibility) &&
        style.display !== "none" &&
        element.getClientRects().length > 0
      );
    }

    function getTabbableElements(panel) {
      return Array.from(
        panel.querySelectorAll(
          "button, input:not([type='hidden']), select, textarea, a[href], area[href], [contenteditable='true'], audio[controls], video[controls], [tabindex]"
        )
      ).filter((element) => isAvailableElement(element) && element.tabIndex >= 0);
    }

    function getTopmostDialog() {
      const dialogs = Array.from(
        document.querySelectorAll('[role="dialog"][aria-modal="true"]')
      ).filter(isAvailableElement);
      return dialogs[dialogs.length - 1] || null;
    }

    function isTopmostDialog(dialog) {
      return getTopmostDialog() === dialog;
    }

    function isFocusableOpener(element) {
      if (!isAvailableElement(element)) return false;
      return (
        element.tabIndex >= 0 ||
        element.hasAttribute("tabindex") ||
        element.matches("button, input:not([type='hidden']), select, textarea, a[href], area[href], [contenteditable='true'], audio[controls], video[controls]")
      );
    }

    function handleKeyDown(event) {
      const dialog = dialogRef.current;
      const panel = panelRef.current;
      if (!dialog || !panel || !isTopmostDialog(dialog)) return;

      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        onClose();
        return;
      }

      if (
        event.key !== "Tab" ||
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) return;

      const tabbableElements = getTabbableElements(panel);
      const first = tabbableElements[0];
      const last = tabbableElements[tabbableElements.length - 1];
      const activeElement = document.activeElement;

      if (!first) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }

      if (!panel.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
        return;
      }

      if (activeElement === panel) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
        return;
      }

      const activeIndex = tabbableElements.indexOf(activeElement);
      if (activeIndex < 0) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      } else if (event.shiftKey && activeIndex === 0) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && activeIndex === tabbableElements.length - 1) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }

    function handleFocusIn(event) {
      const dialog = dialogRef.current;
      const panel = panelRef.current;
      if (!dialog || !panel || !isTopmostDialog(dialog) || panel.contains(event.target)) return;

      const firstTabbable = getTabbableElements(panel)[0];
      (firstTabbable || panel).focus({ preventScroll: true });
    }

    const dialog = dialogRef.current;
    ++focusLifecycleGenerationRef.current;
    if (isTopmostDialog(dialog)) {
      notNowRef.current?.focus({ preventScroll: true });
    }
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", handleFocusIn);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", handleFocusIn);
      const cleanupGeneration = ++focusLifecycleGenerationRef.current;
      queueMicrotask(() => {
        if (focusLifecycleGenerationRef.current !== cleanupGeneration) return;

        const savedOpener = returnFocusRef.current;
        const topmostDialog = getTopmostDialog();
        const openerBelongsToTopmost = topmostDialog?.contains(savedOpener);
        if (
          restoreFocusOnCleanupRef.current &&
          (!topmostDialog || openerBelongsToTopmost) &&
          isFocusableOpener(savedOpener)
        ) {
          savedOpener.focus({ preventScroll: true });
        }
      });
    };
  }, []);

  function handleUpgrade() {
    restoreFocusOnCleanupRef.current = false;
    onClose();
    onUpgrade?.();
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="limit-reached-title"
      aria-describedby="limit-reached-description"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full max-w-sm rounded-2xl bg-[var(--takda-bg-surface)] p-6 shadow-2xl"
        style={{ boxShadow: "inset 0 1px 0 var(--takda-glass-highlight), 0 20px 40px -12px rgba(15,23,42,0.28)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="takda-pro-badge inline-flex rounded-full px-2 py-1 text-[10px] font-extrabold tracking-wide">
          <span aria-hidden="true">✦</span> PRO
        </span>
        <h3 id="limit-reached-title" className="font-display mt-3 text-lg font-semibold" style={{ color: "var(--takda-text-primary)" }}>Free plan limit reached</h3>
        <p id="limit-reached-description" className="mt-2 text-sm leading-6" style={{ color: "var(--takda-text-muted-2)" }}>{message}</p>
        <div className="mt-5 flex gap-2">
          <button
            ref={notNowRef}
            type="button"
            onClick={onClose}
            className="takda-focus-visible flex-1 rounded-xl border border-[var(--takda-border)] py-2.5 text-sm font-semibold"
            style={{ color: "var(--takda-text-muted-2)" }}
          >
            Not now
          </button>
          <button
            type="button"
            onClick={handleUpgrade}
            className="takda-focus-visible takda-focus-visible-on-brand takda-interactive takda-cta-brand flex-1 rounded-xl py-2.5 text-sm font-bold text-white"
          >
            Upgrade to Pro
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Smart Reminders panel (Stage 9A — in-app only) ---------------- */
// Stage 9A fix: maps a single-category filter value to the matching
// reminderGroups key, its modal title, and its own positive empty-state
// copy — reusing the exact same groups object, never recalculating it.
const REMINDER_FILTER_META = {
  overdue: { groupKey: "overdue", title: "Overdue Reminders", emptyTitle: "No overdue tasks", emptySubtitle: "You're all caught up." },
  today: { groupKey: "dueToday", title: "Due Today", emptyTitle: "Nothing due today", emptySubtitle: "You're clear for today." },
  tomorrow: { groupKey: "dueTomorrow", title: "Due Tomorrow", emptyTitle: "Nothing due tomorrow." },
  soon: { groupKey: "dueSoon", title: "Due Soon", emptyTitle: "Nothing due soon." },
};

function RemindersModal({
  filter = "all",
  activeSemesterName,
  hasSemesters,
  hasActiveSemesterForReminders,
  groups,
  onToggle,
  onOpenSubject,
  onManageSemesters,
  onClose,
  notificationPermission,
  notificationsActive,
  onEnableNotifications,
  onDisableNotifications,
  onSendTestNotification,
  onSendBackgroundPushTest,
}) {
  const filterMeta = REMINDER_FILTER_META[filter] || null;
  const filteredItems = filterMeta ? groups[filterMeta.groupKey] : null;

  const title = filterMeta
    ? `${filterMeta.title}${filteredItems.length > 0 ? ` (${filteredItems.length})` : ""}`
    : (hasSemesters && activeSemesterName ? `Reminders for ${activeSemesterName}` : "Smart Reminders");

  const sections = filterMeta
    ? []
    : [
        { key: "overdue", label: "Overdue", items: groups.overdue },
        { key: "dueToday", label: "Due Today", items: groups.dueToday },
        { key: "dueTomorrow", label: "Due Tomorrow", items: groups.dueTomorrow },
        { key: "dueSoon", label: "Due Soon", items: groups.dueSoon },
      ].filter((s) => s.items.length > 0);

  return (
    <ModalShell title={title} onClose={onClose}>
      <NotificationSettings
        permission={notificationPermission}
        active={notificationsActive}
        onEnable={onEnableNotifications}
        onDisable={onDisableNotifications}
        onSendTest={onSendTestNotification}
        onSendBackgroundPushTest={onSendBackgroundPushTest}
      />
      {hasSemesters && !hasActiveSemesterForReminders ? (
        <div className="rounded-2xl bg-[var(--takda-status-later-bg)] border border-[var(--takda-border)] p-4 text-sm" style={{ color: "var(--takda-text-muted-2)" }}>
          <p className="mb-3">No semester is currently active, so there's nothing to remind you about yet. Reminders will pick back up once you activate a semester.</p>
          <button
            type="button"
            onClick={onManageSemesters}
            className="takda-focus-visible takda-interactive takda-cta-brand rounded-xl px-3 py-2 text-sm font-semibold text-white"
          >
            Manage Semesters
          </button>
        </div>
      ) : filterMeta ? (
        filteredItems.length === 0 ? (
          <DashboardEmptyState icon={CheckCircle2} title={filterMeta.emptyTitle} subtitle={filterMeta.emptySubtitle} />
        ) : (
          <div className="flex flex-col gap-2">
            {filteredItems.map((a) => (
              <ActivityRow key={a.id} activity={a} onToggle={onToggle} onOpenSubject={onOpenSubject} />
            ))}
          </div>
        )
      ) : sections.length === 0 ? (
        <DashboardEmptyState icon={CheckCircle2} title="You're all caught up." subtitle="No urgent deadlines right now." />
      ) : (
        sections.map((section) => (
          <div key={section.key} className="mb-5 last:mb-0">
            <h3 className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--takda-text-muted-1)" }}>{section.label} ({section.items.length})</h3>
            <div className="flex flex-col gap-2">
              {section.items.map((a) => (
                <ActivityRow key={a.id} activity={a} onToggle={onToggle} onOpenSubject={onOpenSubject} />
              ))}
            </div>
          </div>
        ))
      )}
    </ModalShell>
  );
}

/* ---------------- Device notification settings (Stage 9B) ---------------- */
// Renders inside the Reminders panel only — never on load, never auto-shown
// elsewhere. Permission is only ever requested from the Enable button below,
// which is a direct user click.
function NotificationSettings({ permission, active, onEnable, onDisable, onSendTest, onSendBackgroundPushTest }) {
  // Local, self-contained result state for the existing local/foreground
  // test button — never touches any state above this component, and
  // entirely separate from pushTestState below.
  const [localTestState, setLocalTestState] = useState({ status: "idle", message: "" });

  async function handleLocalTestClick() {
    setLocalTestState({ status: "sending", message: "" });
    const result = await onSendTest();
    if (!result?.ok) {
      setLocalTestState({ status: "error", message: result?.error || "Unable to show a notification on this device." });
      return;
    }
    setLocalTestState({ status: "success", message: "Notification sent." });
  }

  // Stage 9E-3C: local, self-contained result state for the background
  // push test only — never touches any state above this component.
  const [pushTestState, setPushTestState] = useState({ status: "idle", message: "" });

  async function handleBackgroundPushTestClick() {
    setPushTestState({ status: "sending", message: "" });
    const result = await onSendBackgroundPushTest();
    if (!result?.ok) {
      setPushTestState({ status: "error", message: result?.error || "Unable to send background push test." });
      return;
    }
    setPushTestState({
      status: "success",
      message:
        result.sent > 0
          ? `Sent to ${result.sent} device${result.sent === 1 ? "" : "s"}.`
          : result.message || "No push subscription found for this device yet.",
    });
  }

  if (permission === "unsupported") {
    return (
      <div className="mb-4 rounded-2xl bg-[var(--takda-bg-empty-state)] border border-[var(--takda-border)] px-3 py-2.5 text-xs" style={{ color: "var(--takda-text-muted-1)" }}>
        Notifications aren't supported on this browser or device.
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-2xl border border-[var(--takda-border)] px-3 py-2.5" style={{ boxShadow: "inset 0 1px 0 var(--takda-glass-highlight)" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold" style={{ color: "var(--takda-text-heading)" }}>Notifications</div>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--takda-text-muted-2)" }}>
            {permission === "denied"
              ? "Notification permission was blocked. You can change this in your browser or device settings."
              : "Get deadline alerts while Takda is active and your device supports notifications."}
          </p>
        </div>
        {permission === "denied" ? null : active ? (
          <button
            type="button"
            onClick={onDisable}
            className="takda-focus-visible shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-[var(--takda-border)] hover:bg-slate-50 transition-colors duration-150"
            style={{ color: "var(--takda-text-muted-3)" }}
          >
            Disable
          </button>
        ) : (
          <button
            type="button"
            onClick={onEnable}
            className="takda-focus-visible takda-interactive takda-cta-brand shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-xl text-white"
          >
            Enable
          </button>
        )}
      </div>
      {active && (
        <div className="mt-2 flex flex-col items-start gap-1.5">
          <button
            type="button"
            onClick={handleLocalTestClick}
            disabled={localTestState.status === "sending"}
            className="takda-focus-visible text-[11px] font-semibold hover:underline disabled:opacity-50"
            style={{ color: "var(--takda-brand)" }}
          >
            {localTestState.status === "sending" ? "Sending…" : "Send test notification"}
          </button>
          {localTestState.message && (
            <p className="text-[11px]" style={{ color: localTestState.status === "error" ? "#ef4444" : "var(--takda-text-muted-2)" }}>
              {localTestState.message}
            </p>
          )}
          <button
            type="button"
            onClick={handleBackgroundPushTestClick}
            disabled={pushTestState.status === "sending"}
            className="takda-focus-visible text-[11px] font-semibold hover:underline disabled:opacity-50"
            style={{ color: "var(--takda-brand)" }}
          >
            {pushTestState.status === "sending" ? "Sending…" : "Send background push test"}
          </button>
          {pushTestState.message && (
            <p className="text-[11px]" style={{ color: pushTestState.status === "error" ? "#ef4444" : "var(--takda-text-muted-2)" }}>
              {pushTestState.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- Reminder bell (global, in-app only) ---------------- */
// Stage 9A: pure UI — no Notification permission, no Notification API, no
// serviceWorker.showNotification() anywhere near this component. The badge
// is a count of derived state only.
function ReminderBell({ count, onClick, ringKey }) {
  return (
    <button
      onClick={onClick}
      className="relative p-1.5 -m-1.5 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-[#3D2FE0] takda-interactive"
      aria-label={count > 0 ? `Reminders — ${count} urgent` : "Reminders"}
    >
      <Bell
        key={ringKey}
        size={17}
        className={ringKey > 0 ? "takda-bell-ring" : undefined}
      />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#FF5A5F] text-white text-[10px] font-bold leading-4 text-center">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}

/* ---------------- Semester switcher (global, above the content area) ---------------- */
function SemesterBar({ semesters, selectedSemesterId, activeSemesterId, onSelect, onManage, reminderBadgeCount = 0, onOpenReminders }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const [ringKey, setRingKey] = useState(0);
  const prevRef = useRef({
    count: reminderBadgeCount,
    semesterId: activeSemesterId,
    initialized: false,
  });

  useEffect(() => {
    const prev = prevRef.current;
    const semesterChanged = prev.semesterId !== activeSemesterId;

    if (
      prev.initialized &&
      !semesterChanged &&
      reminderBadgeCount > prev.count
    ) {
      setRingKey((key) => key + 1);
    }

    prevRef.current = {
      count: reminderBadgeCount,
      semesterId: activeSemesterId,
      initialized: true,
    };
  }, [reminderBadgeCount, activeSemesterId]);

  useEffect(() => {
    function handleOutsideClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  if (semesters.length === 0) {
    return (
      <div className="takda-glass takda-glass-silver flex items-center justify-between gap-3 rounded-2xl px-5 md:px-8 py-3.5 m-3 md:m-4 shrink-0">
        <span className="text-xs text-[color:var(--takda-text-muted-2)]">No semesters set up yet.</span>
        <div className="flex items-center gap-3 shrink-0">
          <ReminderBell count={reminderBadgeCount} onClick={onOpenReminders} ringKey={ringKey} />
          <button onClick={onManage} className="takda-focus-visible text-xs font-semibold text-[color:var(--takda-brand)] hover:underline">
            + Set up semesters
          </button>
        </div>
      </div>
    );
  }

  const options = [
    ...semesters
      .slice()
      .sort((a, b) => {
        if (!!a.archivedAt !== !!b.archivedAt) return a.archivedAt ? 1 : -1;
        return new Date(b.createdAt) - new Date(a.createdAt);
      })
      .map((s) => ({ id: s.id, label: s.name, isActive: s.isActive, isArchived: !!s.archivedAt })),
    { id: null, label: "Unassigned / Previous Data", isActive: false, isArchived: false },
  ];

  const current = options.find((o) => o.id === selectedSemesterId) || options[options.length - 1];

  return (
    <div className="relative takda-glass takda-glass-silver flex items-center justify-between gap-3 rounded-2xl px-5 md:px-8 py-3.5 m-3 md:m-4 shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="takda-focus-visible flex items-center gap-2 min-w-0 rounded-lg px-2 py-1.5 -mx-2 hover:bg-white/40 transition-colors duration-150"
      >
        <CalendarIcon size={15} className="text-[color:var(--takda-brand)] shrink-0" />
        <span className="text-[15px] font-semibold truncate">{current.label}</span>
        {current.isActive && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200/70 rounded-full px-2 py-0.5">Active</span>}
        {current.isArchived && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-500 bg-slate-100 border border-slate-200/70 rounded-full px-2 py-0.5">Archived</span>}
        <ChevronDown size={14} className="text-slate-400 shrink-0" />
      </button>
      <div className="flex items-center gap-3 shrink-0">
        <ReminderBell count={reminderBadgeCount} onClick={onOpenReminders} ringKey={ringKey} />
        <button onClick={onManage} className="takda-focus-visible text-xs font-semibold text-[color:var(--takda-brand)] hover:underline">
          Manage Semesters
        </button>
      </div>

      {open && (
        <div className="absolute left-5 md:left-8 top-full mt-1 z-40 w-64 max-h-72 overflow-y-auto rounded-xl border border-[var(--takda-border)] bg-[var(--takda-bg-surface)] shadow-lg py-1.5">
          {options.map((o) => (
            <button
              key={o.id ?? "unassigned"}
              onClick={() => { onSelect(o.id); setOpen(false); }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 transition-colors duration-150"
              style={o.id === selectedSemesterId ? { color: "var(--takda-brand)", fontWeight: 600 } : undefined}
            >
              <span className="truncate">{o.label}</span>
              <span className="flex items-center gap-1 shrink-0">
                {o.isActive && <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-600">Active</span>}
                {o.isArchived && <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Archived</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Semester management modal ---------------- */
function SemesterManagerModal({ semesters, activeSemesterId, onClose, onCreate, onUpdate, onActivate, onArchive }) {
  const [mode, setMode] = useState("list");
  const [formSemester, setFormSemester] = useState(null);
  const [form, setForm] = useState({ name: "", schoolYear: "", startDate: "", endDate: "" });
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const sorted = useMemo(() => {
    return semesters.slice().sort((a, b) => {
      if (!!a.archivedAt !== !!b.archivedAt) return a.archivedAt ? 1 : -1;
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [semesters]);

  function openCreateForm() {
    setFormSemester(null);
    setForm({ name: "", schoolYear: "", startDate: "", endDate: "" });
    setError("");
    setMode("form");
  }

  function openEditForm(semester) {
    setFormSemester(semester);
    setForm({
      name: semester.name,
      schoolYear: semester.schoolYear || "",
      startDate: semester.startDate || "",
      endDate: semester.endDate || "",
    });
    setError("");
    setMode("form");
  }

  async function submitForm() {
    if (!form.name.trim()) {
      setError("A semester name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name.trim(),
        schoolYear: form.schoolYear.trim() || null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      };
      if (formSemester) {
        await onUpdate(formSemester.id, payload);
      } else {
        await onCreate(payload);
      }
      setMode("list");
    } catch (e) {
      setError(e.message || "Unable to save this semester.");
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate(id) {
    setBusyId(id);
    setError("");
    try {
      await onActivate(id);
    } catch (e) {
      setError(e.message || "Unable to activate this semester.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleArchive(id) {
    if (!window.confirm("Archive this semester? Its records become read-only, but nothing is deleted.")) return;
    setBusyId(id);
    setError("");
    try {
      await onArchive(id);
    } catch (e) {
      setError(e.message || "Unable to archive this semester.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ModalShell title={mode === "form" ? (formSemester ? "Edit Semester" : "New Semester") : "Manage Semesters"} onClose={onClose}>
      {error && (
        <div className="mb-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs px-3 py-2">{error}</div>
      )}

      {mode === "list" ? (
        <>
          <button
            onClick={openCreateForm}
            className="takda-focus-visible w-full mb-4 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--takda-brand-border-dashed)] py-2.5 text-sm font-semibold"
            style={{ color: "var(--takda-brand)" }}
          >
            <Plus size={15} /> New Semester
          </button>

          {sorted.length === 0 ? (
            <EmptyRow text="No semesters yet — create your first one to get started." />
          ) : (
            <div className="flex flex-col gap-2 mb-1">
              {sorted.map((s) => (
                <div key={s.id} className="rounded-2xl border border-[var(--takda-border)] p-3" style={{ boxShadow: "inset 0 1px 0 var(--takda-glass-highlight)" }}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{s.name}</div>
                      {(s.schoolYear || s.startDate || s.endDate) && (
                        <div className="text-[11px] truncate" style={{ color: "var(--takda-text-muted-2)" }}>
                          {[s.schoolYear, [s.startDate, s.endDate].filter(Boolean).join(" – ")].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      {s.isActive && <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 bg-emerald-50 rounded-full px-1.5 py-0.5">Active</span>}
                      {s.archivedAt && <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5" style={{ color: "var(--takda-text-muted-2)", background: "var(--takda-border)" }}>Archived</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <button
                      onClick={() => openEditForm(s)}
                      className="takda-focus-visible text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-[var(--takda-border)] hover:bg-slate-50 transition-colors duration-150"
                      style={{ color: "var(--takda-text-muted-3)" }}
                    >
                      Edit
                    </button>
                    {!s.isActive && !s.archivedAt && (
                      <button
                        onClick={() => handleActivate(s.id)}
                        disabled={busyId === s.id}
                        className="takda-focus-visible takda-interactive takda-cta-brand text-xs font-semibold px-2.5 py-1.5 rounded-xl text-white disabled:opacity-50"
                      >
                        {busyId === s.id ? "Activating…" : "Set as Active"}
                      </button>
                    )}
                    {!s.archivedAt && (
                      <button
                        onClick={() => handleArchive(s.id)}
                        disabled={busyId === s.id}
                        className="takda-focus-visible text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-[var(--takda-border)] text-red-500 hover:bg-red-50 transition-colors duration-150 disabled:opacity-50"
                      >
                        {busyId === s.id ? "Archiving…" : "Archive"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <Field label="Semester Name *">
            <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. 1st Semester 2025-2026" />
          </Field>
          <Field label="School Year">
            <input className={inputCls} value={form.schoolYear} onChange={(e) => setForm({ ...form, schoolYear: e.target.value })} placeholder="e.g. 2025-2026" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date">
              <input type="date" className={inputCls} value={form.startDate || ""} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </Field>
            <Field label="End Date">
              <input type="date" className={inputCls} value={form.endDate || ""} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </Field>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setMode("list")}
              className="takda-focus-visible flex-1 rounded-xl border border-[var(--takda-border)] py-2.5 text-sm font-semibold"
              style={{ color: "var(--takda-text-muted-2)" }}
            >
              Cancel
            </button>
            <button
              disabled={!form.name.trim() || saving}
              onClick={submitForm}
              className="takda-focus-visible takda-interactive takda-cta-brand flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {saving ? "Saving…" : formSemester ? "Save Changes" : "Create Semester"}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

/* ---------------- Sidebar (desktop) ---------------- */
function Sidebar({ view, setView, onAddSubject, canCreate = true }) {
  const items = [
    { key: "dashboard", label: "Dashboard", icon: Home },
    { key: "subjects", label: "Subjects", icon: BookOpen },
    { key: "activities", label: "Activities", icon: CheckCircle2 },
    { key: "calendar", label: "Calendar", icon: CalendarIcon },
    { key: "grades", label: "My Grades", icon: Lock },
    { key: "notes", label: "Notes", icon: StickyNote },
  ];
  // Phase 09C.2B: premium frosted-white redesign, deliberately with no
  // backdrop-filter — the Sidebar is a persistent full-height panel
  // beside the content (never scrolling over it), so there is nothing
  // for a blur to meaningfully sample; the "frosted"/"glass-inspired"
  // look instead comes from a plain inset box-shadow reusing the
  // existing --takda-glass-highlight token (same technique already
  // used by EmptyRow, Phase 09C.2A), plus a very soft directional
  // elevation shadow — both pure box-shadow, zero blur cost.
  return (
    <div
      className="hidden md:flex md:flex-col w-56 shrink-0 bg-[var(--takda-bg-surface)] border-r border-[var(--takda-border)] p-5"
      style={{ boxShadow: "inset -1px 0 0 var(--takda-glass-highlight), 1px 0 3px rgba(15,23,42,0.04)" }}
    >
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
              aria-current={active ? "page" : undefined}
              className={`takda-focus-visible flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold takda-interactive text-left ${active ? "" : "takda-sidebar-nav-hover"}`}
              style={{
                background: active ? "var(--takda-brand-tint-3)" : undefined,
                color: active ? "var(--takda-brand)" : "var(--takda-text-muted-3)",
                boxShadow: active ? "inset 0 1px 0 var(--takda-glass-highlight)" : undefined,
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
        aria-disabled={!canCreate}
        title={!canCreate ? "Switch to your active semester to add a subject." : undefined}
        className={`takda-focus-visible takda-focus-visible-on-brand mt-6 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white takda-interactive takda-cta-brand ${!canCreate ? "opacity-40" : ""}`}
        style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 10px -2px color-mix(in srgb, var(--takda-brand) 45%, transparent)" }}
      >
        <Plus size={16} /> Add Subject
      </button>
    </div>
  );
}

/* ---------------- Mobile bottom nav ---------------- */
function MobileNav({ view, setView, onFab, onMore, canCreate = true }) {
  const leftItems = [
    { key: "dashboard", label: "Home", icon: Home },
    { key: "subjects", label: "Subjects", icon: BookOpen },
  ];
  const rightItems = [{ key: "calendar", label: "Calendar", icon: CalendarIcon }];
  const moreActive = ["notes", "activities", "grades"].includes(view);
  return (
    <div className="md:hidden fixed inset-x-0 bottom-0 max-w-md mx-auto takda-glass takda-glass-neutral rounded-t-2xl px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center justify-between">
      {leftItems.map((it) => <NavBtn key={it.key} it={it} active={view === it.key || (it.key === "subjects" && view === "subject-detail")} onClick={() => setView(it.key)} />)}
      <button
        onClick={onFab}
        aria-disabled={!canCreate}
        className={`w-12 h-12 -mt-6 rounded-full flex items-center justify-center text-white shrink-0 takda-interactive takda-cta-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--takda-brand)] ${!canCreate ? "opacity-40" : ""}`}
        style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), 0 6px 14px -2px color-mix(in srgb, var(--takda-brand) 55%, transparent)" }}
        aria-label="Add activity"
        title={!canCreate ? "Switch to your active semester to add an activity." : undefined}
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
      className="flex flex-col items-center gap-0.5 px-2 py-1.5 flex-1 min-w-0 takda-interactive focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--takda-focus)] focus-visible:ring-offset-1 rounded-lg"
      style={{ color: active ? "var(--takda-brand)" : "#94A3B8" }}
    >
      <span
        className="flex items-center justify-center w-8 h-8 rounded-full transition-colors duration-200 ease-out"
        style={active ? { background: "var(--takda-brand-tint-2)", boxShadow: "0 0 10px 1px color-mix(in srgb, var(--takda-brand) 45%, transparent)" } : undefined}
      >
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
      <div className="bg-white w-full rounded-t-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] takda-sheet-enter" onClick={(e) => e.stopPropagation()}>
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

/* ---------------- TAKDA 2.0 Academic Overview (Phase 10A) ---------------- */
// One lightweight token-based card — no backdrop-filter, since there
// are always exactly 4 of these rendered together (the batch's
// "repeated-card performance" rule applies the same way it did to
// every other grid in this app's redesign).
// Phase 10A.2: 4 distinct pastel accents, each reusing EXISTING tokens
// already defined in index.css (status/brand tokens) — no new color was
// invented. These are the same "text-on-tint" pairs already used
// elsewhere in this app (ReminderChip/FocusTile urgency badges etc.),
// so their contrast is already an established, reused pattern; the
// amber pair (the one most likely to be borderline) was additionally
// re-verified by hand via the WCAG relative-luminance formula:
// #92400E on #FFFBEB -> ~6.84:1, comfortably clear of the 4.5:1 AA
// minimum.
const OVERVIEW_ACCENTS = {
  rose: { bg: "var(--takda-status-overdue-bg)", accent: "var(--takda-status-overdue-text)" },
  lavender: { bg: "var(--takda-brand-tint-2)", accent: "var(--takda-brand)" },
  mint: { bg: "var(--takda-status-week-bg)", accent: "var(--takda-status-week-text)" },
  amber: { bg: "var(--takda-status-tomorrow-bg)", accent: "var(--takda-status-tomorrow-text)" },
};

// The corner circle is a plain translucent version of the card's own
// accent color — an abstract shape, never a line/bar/sparkline, so it
// can never be read as a real trend graphic (explicitly required this
// phase: "do not imply fabricated academic trends").
function OverviewCard({ icon: Icon, label, value, bg, accent }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 border border-[var(--takda-border)]"
      style={{ background: bg, boxShadow: "inset 0 1px 0 var(--takda-glass-highlight), 0 1px 3px rgba(15,23,42,0.05)" }}
    >
      <span className="absolute -right-4 -bottom-4 w-16 h-16 rounded-full pointer-events-none" aria-hidden="true" style={{ background: accent, opacity: 0.1 }} />
      <span className="relative flex items-center justify-center w-9 h-9 rounded-xl mb-2" style={{ background: "rgba(255,255,255,0.6)" }}>
        <Icon size={16} color={accent} />
      </span>
      <div className="relative font-display text-2xl font-semibold" style={{ color: accent }}>{value}</div>
      <div className="relative text-xs mt-0.5 font-medium" style={{ color: accent }}>{label}</div>
    </div>
  );
}

// stats.pending/stats.subjects are the exact same already-computed
// values other Dashboard widgets reuse — not recalculated here.
// `classesToday` is `todaysClasses.length`, passed
// in by Dashboard — deliberately labeled "Classes Today" rather than
// the mockup's literal "Upcoming Classes" wording, because that is
// the actual, accurate meaning of the only count already available
// (there is no existing "classes in the next N days" aggregate
// anywhere in this app to reuse without inventing new logic).
// `overallAverage` reuses GradesView's own unmodified gradePercent-
// based formula (see TakdaApp's dashboardOverallAverage), and is only
// ever shown when `isPro` — Free users see a locked, Pro-upsell card
// instead, exactly mirroring GradeLockedView's own existing gating.
function AcademicOverview({ stats, classesToday, overallAverage, isPro, onOpenGrades }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-7">
      <OverviewCard icon={CheckCircle2} label="Pending Activities" value={stats.pending} bg={OVERVIEW_ACCENTS.rose.bg} accent={OVERVIEW_ACCENTS.rose.accent} />
      <OverviewCard icon={BookOpen} label="Active Subjects" value={stats.subjects} bg={OVERVIEW_ACCENTS.lavender.bg} accent={OVERVIEW_ACCENTS.lavender.accent} />
      <OverviewCard icon={CalendarIcon} label="Classes Today" value={classesToday} bg={OVERVIEW_ACCENTS.mint.bg} accent={OVERVIEW_ACCENTS.mint.accent} />
      {isPro ? (
        <OverviewCard
          icon={Lock}
          label="Academic Performance"
          value={overallAverage === null ? "—" : `${overallAverage.toFixed(1)}%`}
          bg={OVERVIEW_ACCENTS.amber.bg}
          accent={OVERVIEW_ACCENTS.amber.accent}
        />
      ) : (
        <button
          type="button"
          onClick={onOpenGrades}
          className="takda-focus-visible takda-interactive relative overflow-hidden rounded-2xl p-4 text-left border border-[var(--takda-border)]"
          style={{ background: OVERVIEW_ACCENTS.amber.bg, boxShadow: "inset 0 1px 0 var(--takda-glass-highlight), 0 1px 3px rgba(15,23,42,0.05)" }}
        >
          <span className="takda-pro-badge inline-flex rounded-full px-1.5 py-0.5 text-[8px] font-extrabold tracking-wide mb-2">
            <span aria-hidden="true">✦</span> PRO
          </span>
          <div className="text-sm font-semibold" style={{ color: OVERVIEW_ACCENTS.amber.accent }}>Academic Performance</div>
          <div className="text-[11px] mt-0.5" style={{ color: OVERVIEW_ACCENTS.amber.accent }}>Upgrade to see your average</div>
        </button>
      )}
    </div>
  );
}

// Phase 10A: a Monday-start 7-day strip, built entirely from
// `focusLists` (overdue/dueToday/upcoming — already passed into
// Dashboard, never a new fetch). A day is marked only when a real
// activity's own `deadline` falls on it — never an invented event.
// Purely informational (no onClick), so no new focus-visible/ARIA
// surface is needed beyond the existing heading semantics.
function CompactWeekCalendar({ focusLists }) {
  const today = startOfDay(new Date());
  const mondayOffset = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset);

  const dueDates = new Set(
    [...focusLists.overdue, ...focusLists.dueToday, ...focusLists.upcoming].map(
      (a) => parseLocalDate(a.deadline).toDateString()
    )
  );

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { date: d, isToday: d.toDateString() === today.toDateString(), hasItems: dueDates.has(d.toDateString()) };
  });

  return (
    <div
      className="rounded-2xl p-4 md:p-5 bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] mb-4"
      style={{ boxShadow: "inset 0 1px 0 var(--takda-glass-highlight), 0 1px 3px rgba(15,23,42,0.05)" }}
    >
      <h2 className="font-display text-sm font-semibold mb-3" style={{ color: "var(--takda-text-primary)" }}>This Week</h2>
      <div className="flex items-center justify-between gap-1 sm:gap-1.5">
        {weekDays.map(({ date, isToday, hasItems }) => {
          // The "has items due" dot is a color-only signal for sighted
          // users — this span carries the same information as real
          // text, so a screen reader (or anyone relying on more than
          // color alone) gets it too, not just a decorative dot.
          const dayLabel = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
          return (
            <div key={date.toDateString()} className="flex flex-col items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--takda-text-muted-2)" }} aria-hidden="true">
                {date.toLocaleDateString("en-US", { weekday: "narrow" })}
              </span>
              <span
                className="flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold transition-colors duration-150"
                style={
                  isToday
                    ? { background: "var(--takda-brand)", color: "#fff", boxShadow: "0 1px 4px rgba(61,47,224,0.35)" }
                    : { color: "var(--takda-text-primary)" }
                }
                aria-hidden="true"
              >
                {date.getDate()}
              </span>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: hasItems ? "var(--takda-brand)" : "transparent" }} aria-hidden="true" />
              <span className="sr-only">
                {dayLabel}{isToday ? " (today)" : ""}{hasItems ? " — has activities due" : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MOTIVATION_QUOTES = [
  "Small steps every day lead to big results.",
  "You've got this — one task at a time.",
  "Progress, not perfection.",
  "Future you is already proud of today's effort.",
];

// Phase 10A: purely decorative — clearly labeled "Daily Motivation",
// never academic data. The quote is picked once per mount (lazy
// useState initializer) so it stays stable for the session instead of
// re-rolling on every re-render.
function MotivationPanel() {
  const [quote] = useState(() => MOTIVATION_QUOTES[Math.floor(Math.random() * MOTIVATION_QUOTES.length)]);
  return (
    <div
      className="rounded-2xl p-4 text-center mb-4"
      style={{
        background: "linear-gradient(135deg, var(--takda-brand-tint-1), var(--takda-brand-tint-2))",
        boxShadow: "inset 0 1px 0 var(--takda-glass-highlight)",
      }}
    >
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--takda-brand)" }}>✨ Daily Motivation</span>
      <p className="text-sm mt-1.5 italic" style={{ color: "var(--takda-text-muted-3)" }}>{quote}</p>
    </div>
  );
}

// Phase 10A.3: "Today's Focus" unified productivity panel.
//
// Classification ground truth (discovered, not assumed — see
// `urgency()`/`computeStatus()` above and `focusLists`, both unchanged):
//   - Overdue  = incomplete, deadline strictly before today (local date).
//   - Today    = incomplete, deadline === today.
//   - Upcoming = incomplete, deadline any day after today — this has NO
//     fixed horizon cap in the existing app (it is every future
//     incomplete activity, grouped only for color/label purposes into
//     tomorrow/week/later elsewhere). The brief describes Upcoming as
//     "within the existing Dashboard's upcoming horizon," implying a
//     cutoff — no such cutoff actually exists in `focusLists`, so per
//     this phase's own instruction ("preserve the existing behavior
//     until clarified"), this panel reuses `focusLists.upcoming`
//     exactly as-is, uncapped, rather than inventing a new limit.
//   - Completed activities are excluded from all four tabs, exactly as
//     they always were (`focusLists` itself already filters them out
//     before this component ever sees the data) — "All" here means
//     "all pending," not "every activity ever," matching prior behavior.
//
// "All" is simply the 3 existing, unmodified lists concatenated — not a
// second/different classification system.
const TODAYS_FOCUS_TABS = [
  { key: "all", label: "All" },
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
];

const TODAYS_FOCUS_TAB_ACCENT = {
  all: { bg: "var(--takda-brand)", text: "#fff" },
  overdue: { bg: "var(--takda-status-overdue-bg)", text: "var(--takda-status-overdue-text)" },
  today: { bg: "var(--takda-status-tomorrow-bg)", text: "var(--takda-status-tomorrow-text)" },
  upcoming: { bg: "var(--takda-brand-tint-2)", text: "var(--takda-brand)" },
};

const TODAYS_FOCUS_EMPTY_COPY = {
  all: { title: "You're all caught up!", subtitle: "No pending activities right now." },
  overdue: { title: "No overdue activities.", subtitle: "You're on track." },
  today: { title: "Nothing due today.", subtitle: "Enjoy the breathing room." },
  upcoming: { title: "No upcoming activities.", subtitle: "Your schedule is clear for now." },
};

// `focusLists`/`onToggle`/`onOpenSubject`/`onFocusFilter`/`canCreate`/
// `onAddActivity` are all existing props Dashboard already receives —
// nothing new is fetched or computed outside this component. The 3
// `*Visible` slices reuse the exact same `DASHBOARD_*_VISIBLE` caps the
// old 3-section layout already used (same "View All" overflow pattern,
// same navigation target via the existing `onFocusFilter`).
function TodaysFocusPanel({ focusLists, onToggle, onOpenSubject, onFocusFilter, canCreate, onAddActivity }) {
  const [activeFilter, setActiveFilter] = useState("all");

  const overdueVisible = focusLists.overdue.slice(0, DASHBOARD_OVERDUE_VISIBLE);
  const dueTodayVisible = focusLists.dueToday.slice(0, DASHBOARD_DUE_TODAY_VISIBLE);
  const upcomingVisible = focusLists.upcoming.slice(0, DASHBOARD_UPCOMING_VISIBLE);

  const counts = {
    all: focusLists.overdue.length + focusLists.dueToday.length + focusLists.upcoming.length,
    overdue: focusLists.overdue.length,
    today: focusLists.dueToday.length,
    upcoming: focusLists.upcoming.length,
  };

  const visibleByTab = {
    all: [...overdueVisible, ...dueTodayVisible, ...upcomingVisible],
    overdue: overdueVisible,
    today: dueTodayVisible,
    upcoming: upcomingVisible,
  };
  const activeList = visibleByTab[activeFilter];

  // 10A.3A fix: "View All" must appear whenever the active tab is
  // actually hiding items. For the single-category tabs this is the
  // same check as before (each category is independently sliced to its
  // own DASHBOARD_*_VISIBLE cap). For "all", comparing the overall
  // total against the summed cap (14) under-reported truncation —
  // e.g. 0 overdue / 6 today / 0 upcoming has a total of 6 (≤ 14) but
  // dueTodayVisible still only has 5 of those 6, so one item was
  // silently hidden from the All tab with no way to reach it.
  // Comparing the actual rendered list length against the true count
  // is correct for every tab and needs no per-tab cap table.
  const showViewAll = activeList.length < counts[activeFilter];
  const emptyCopy = TODAYS_FOCUS_EMPTY_COPY[activeFilter];

  return (
    <div
      className="rounded-2xl p-4 md:p-5 bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] mb-7"
      style={{ boxShadow: "inset 0 1px 0 var(--takda-glass-highlight), 0 1px 3px rgba(15,23,42,0.05)" }}
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="font-display text-base font-semibold" style={{ color: "var(--takda-text-primary)" }}>Today's Focus</h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--takda-text-muted-2)" }}>Stay focused on what matters most.</p>
        </div>
        <span
          className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full"
          style={{ background: "var(--takda-brand-tint-2)", color: "var(--takda-brand)" }}
        >
          {counts.all} pending
        </span>
      </div>

      {/* 10A.3D fix: this row used to be a single nowrap line with
          overflow-x-auto — on narrower desktop widths (the panel is now
          ~60% of the grid, not 100%), "Upcoming" ran past the visible
          edge with no obvious scroll affordance, i.e. clipped. Wrapping
          instead of scrolling guarantees every tab is always visible —
          worst case it drops to two rows — with no horizontal overflow
          and no change to filter behavior/counts/keyboard order. */}
      {/* 10A.4E: slightly tighter gap/padding than 10A.3D's fix — lets
          all four tabs fit on one row more often at typical desktop
          widths. flex-wrap (the actual anti-clipping fix) is untouched,
          as is py-1.5 (touch-target height) and text-xs (readable
          floor) — only horizontal gap/padding were nudged in. */}
      <div className="flex flex-wrap items-center gap-1 mb-3 mt-3">
        {TODAYS_FOCUS_TABS.map((tab) => {
          const active = activeFilter === tab.key;
          const accent = TODAYS_FOCUS_TAB_ACCENT[tab.key];
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveFilter(tab.key)}
              aria-pressed={active}
              className="takda-focus-visible takda-interactive px-2 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors duration-150"
              style={
                active
                  ? { background: accent.bg, color: accent.text }
                  : { background: "var(--takda-bg-page)", color: "var(--takda-text-muted-3)", border: "1px solid var(--takda-border)" }
              }
            >
              {tab.label} ({counts[tab.key]})
            </button>
          );
        })}
      </div>

      {activeList.length === 0 ? (
        <>
          <DashboardEmptyState icon={CheckCircle2} title={emptyCopy.title} subtitle={emptyCopy.subtitle} />
          {activeFilter === "all" && (
            <button
              type="button"
              onClick={onAddActivity}
              aria-disabled={!canCreate}
              title={!canCreate ? "Switch to your active semester to add an activity." : undefined}
              className={`takda-focus-visible flex items-center gap-1 text-xs font-semibold -mt-4 ${!canCreate ? "opacity-40" : ""}`}
              style={{ color: "var(--takda-brand)" }}
            >
              <Plus size={13} /> Add Activity
            </button>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-2">
          {activeList.map((a, i) => (
            <ActivityRow
              key={a.id}
              activity={a}
              onToggle={onToggle}
              onOpenSubject={onOpenSubject}
              compact={activeFilter === "all" || activeFilter === "upcoming"}
              highlight={activeFilter === "upcoming" && i === 0}
              clampTitle
            />
          ))}
        </div>
      )}

      {showViewAll && (
        <div className="mt-2">
          <ViewAllLink
            label={`View all ${activeFilter === "all" ? "" : activeFilter + " "}(${counts[activeFilter]})`}
            onClick={() => onFocusFilter(activeFilter)}
          />
        </div>
      )}
    </div>
  );
}

function Dashboard({
  greeting,
  contextMessage,
  timePeriod,
  focusLists,
  stats,
  recentlyCompleted,
  hasAnySubjectEver,
  hasAnyActivityEver,
  onToggle,
  onOpenSubject,
  onAddSubject,
  onAddActivity,
  onViewSchedule,
  onOpenGrades,
  isPro,
  onFocusFilter,
  canCreate = true,
  reminderGroups,
  activeSemesterName,
  hasSemesters,
  hasActiveSemesterForReminders,
  onOpenReminders,
  nextClass,
  todaysClasses,
  smartInsights,
  showActiveSemesterContext,
  studentName,
  overallAverage,
  onOpenNotes,
}) {
  // overdueVisible/dueTodayVisible/upcomingVisible used to be computed
  // here for the old 3-stacked-sections render; that render is now
  // TodaysFocusPanel below, which recomputes the identical slices
  // itself from this same `focusLists` prop.
  return (
    <div className="relative p-5 md:p-8 takda-dashboard-enter">
      {/* Phase 09B.11: Dashboard-only background wash — purely decorative,
          built entirely from existing theme tokens (--takda-brand-tint-*)
          so it reads correctly in both Classic and Matcha with no new
          index.css rules. Sits behind all Dashboard content via -z-10
          inside this now-`relative` root, so it cannot bleed into the
          Sidebar, SemesterBar, MobileNav, or any other page. No
          animation — Rule 4 explicitly asks for static sparkles only. */}
      <div
        className="absolute inset-0 -z-10 overflow-hidden pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(circle at 12% 8%, var(--takda-brand-tint-1) 0%, transparent 42%), radial-gradient(circle at 88% 4%, var(--takda-brand-tint-2) 0%, transparent 38%), radial-gradient(circle at 50% 100%, var(--takda-brand-tint-3) 0%, transparent 46%)",
        }}
      >
        <span className="absolute top-[6%] left-[22%] w-1.5 h-1.5 rounded-full bg-white/70" style={{ boxShadow: "0 0 6px 2px rgba(255,255,255,0.5)" }} />
        <span className="absolute top-[14%] left-[68%] w-1 h-1 rounded-full bg-white/60" style={{ boxShadow: "0 0 5px 2px rgba(255,255,255,0.4)" }} />
        <span className="absolute top-[40%] left-[85%] w-1.5 h-1.5 rounded-full bg-white/60" style={{ boxShadow: "0 0 6px 2px rgba(255,255,255,0.4)" }} />
      </div>

      <GreetingHero greeting={greeting} contextMessage={contextMessage} studentName={studentName} />

      {showActiveSemesterContext && (
        <div className="rounded-xl bg-[var(--takda-status-later-bg)] border border-[var(--takda-border)] px-3 py-2.5 text-xs text-[color:var(--takda-text-muted-2)] mb-4">
          Current classes, reminders, and insights are from {activeSemesterName} (Active).
        </div>
      )}

      <AcademicOverview
        stats={stats}
        classesToday={todaysClasses.length}
        overallAverage={overallAverage}
        isPro={isPro}
        onOpenGrades={onOpenGrades}
      />

      <QuickActions
        onAddSubject={onAddSubject}
        onAddActivity={onAddActivity}
        onViewSchedule={onViewSchedule}
        onOpenNotes={onOpenNotes}
        canCreate={canCreate}
      />

      <NextClassCard nextClass={nextClass} onOpenSubject={onOpenSubject} />

      {/* 10A.5B: FocusForToday (Overdue/Due Today/Upcoming count tiles)
          removed from here — it duplicated the exact same counts
          TodaysFocusPanel's own filter tabs already show just below,
          per the 10A.5A audit finding. `onFocusFilter` is still passed
          to TodaysFocusPanel unchanged; nothing about its navigation,
          counts, or data was touched. */}

      {/* 10A.3D: 60/40 split (Today's Focus : supporting widgets) via a
          fluid fr-unit grid-template instead of equal columns — fr
          units share available space proportionally with no fixed
          width, so this can't cause overflow and still collapses to a
          single stacked column below lg exactly as before. */}
      {/* 10A.6B: lg:items-start stops the grid's default stretch from
          forcing the shorter column to the taller one's height — it
          does not, by itself, rebalance the unequal content volume
          between the two columns (not verified in a browser). */}
      {/* 10A.7B: Reminders and Stats relocated here from the right
          column (per the 10A.7A audit) to rebalance the 60/40 split's
          content volume — left column now has 4 widgets, right has 4,
          down from 2-vs-6. Every prop/handler below is unchanged from
          before the move; only each call's position in the tree moved,
          since all of them already read from this same Dashboard
          closure regardless of where they're rendered. The resulting
          single-column mobile/tablet order (Today's Focus → Reminders
          → Recently Completed → Stats → This Week → Today's Classes →
          Smart Insights → Motivation) is explicitly approved. */}
      {/* 10A.9B: content-aware Bento Grid, replacing the prior 60/40
          two-column layout. One flat grid with per-widget col-span
          instead of two block-stacked column <div>s — a true 2D grid
          is required so each card can take a different width rather
          than being grouped into exactly two columns.
            - Below lg (1024px): no grid classes apply at all, so this
              is a plain stacked block — identical mechanism, and
              identical resulting mobile/tablet order, to every prior
              phase (Today's Focus, Reminders, Recently Completed,
              This Week, Today's Classes, Smart Insights, Motivation —
              exactly this JSX's authoring order, unchanged).
            - lg (1024–1279px): 2 columns. Today's Focus and Smart
              Reminders are each full-width (col-span-2) at this size —
              Reminders explicitly to avoid a narrow chip grid at this
              range (its own container-query threshold is 380px,
              Phase 10A.4H), Today's Focus because it's the primary
              widget and benefits from the same width.
            - xl (>=1280px): 4 columns, matching the approved 50/50,
              50/25/25, 50/50 row arrangement via col-span-2/1 values.
          No row-span, no grid-auto-flow:dense, and no fixed/min height
          anywhere — align-items:start (reused from 10A.6B) plus the
          grid's own default row sizing means each row's height is
          whatever its own content naturally needs; this has not been
          confirmed in a browser. Every widget below keeps its exact
          original props/handlers — only a col-span wrapper was added
          around the ones that need a non-default span. */}
      {/* 10A.9F: xl:grid-cols-4 removed — the app shell itself is capped
          at md:max-w-5xl (1024px total, Sidebar included), so content
          width never exceeds ~736px regardless of viewport; a 4-column
          tier at that width gave each cell ~166px, too narrow for This
          Week's 7 day-circles or readable Today's Classes text (see
          10A.9E audit). The lg: 2-column arrangement is now the only
          tier. lg:gap-6 → lg:gap-x-6 (vertical gap removed from the
          grid itself) because every widget still carries its own
          pre-existing bottom margin (mb-7/mb-4, left untouched here),
          which was stacking additively with a vertical grid gap and
          roughly doubling the visual space between rows; vertical
          rhythm now comes from each widget's own margin alone, exactly
          as it did before this grid existed. Not verified in a
          browser. */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-x-6 lg:items-start">
        {/* Phase 10A.3: the old eyebrow heading + 3 separately-glassed
            sections (Needs Attention/Due Today/Upcoming Deadlines) are
            replaced by one unified TodaysFocusPanel with filter tabs.
            It receives the same focusLists/onToggle/onOpenSubject/
            onFocusFilter/canCreate/onAddActivity Dashboard already
            had in scope — no new data source, no new classification
            logic (see the component's own comment above its
            definition for the confirmed existing deadline-boundary
            rules this reuses verbatim). */}
        <div className="lg:col-span-2">
          <TodaysFocusPanel
            focusLists={focusLists}
            onToggle={onToggle}
            onOpenSubject={onOpenSubject}
            onFocusFilter={onFocusFilter}
            canCreate={canCreate}
            onAddActivity={onAddActivity}
          />
        </div>

        <div className="lg:col-span-2">
          <SmartRemindersSection
            groups={reminderGroups}
            activeSemesterName={activeSemesterName}
            hasSemesters={hasSemesters}
            hasActiveSemesterForReminders={hasActiveSemesterForReminders}
            onToggle={onToggle}
            onOpenSubject={onOpenSubject}
            onOpenReminders={onOpenReminders}
          />
        </div>

        {/* 10A.8B: always one consistent flat card (previously bare
            when empty, .takda-glass when populated — the last widget
            in this grid still on the old treatment). SectionHeader's
            own definition is left untouched (used elsewhere); this
            is a local heading + badge, same approach already used
            for TodaysFocusPanel/SmartInsightsSection. The completed
            count reuses the existing `stats.completed` value — no
            new calculation, no new query. */}
        <div
          className="rounded-2xl p-4 md:p-5 bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] mb-4"
          style={{ boxShadow: "inset 0 1px 0 var(--takda-glass-highlight), 0 1px 3px rgba(15,23,42,0.05)" }}
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="font-display text-sm font-semibold" style={{ color: "var(--takda-text-muted-1)" }}>Recently Completed</h2>
            <span
              className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full"
              style={{ background: "var(--takda-brand-tint-2)", color: "var(--takda-brand)" }}
              aria-label={`${stats.completed} completed ${stats.completed === 1 ? "activity" : "activities"}`}
            >
              {stats.completed} completed
            </span>
          </div>
          {recentlyCompleted.length === 0 ? (
            <DashboardEmptyState
              icon={CheckCircle2}
              title="Complete an activity and it will appear here."
              tone={{ bg: "transparent", border: "transparent", noMargin: true }}
            />
          ) : (
            <div className="flex flex-col gap-2 opacity-80">
              {recentlyCompleted.map((a) => (
                <ActivityRow key={a.id} activity={a} onToggle={onToggle} onOpenSubject={onOpenSubject} compact />
              ))}
            </div>
          )}
        </div>

        <CompactWeekCalendar focusLists={focusLists} />

        <TodaysClassesSection classes={todaysClasses} onOpenSubject={onOpenSubject} />

        <div>
          <SmartInsightsSection insights={smartInsights} />
        </div>

        <div className="lg:col-span-2">
          <MotivationPanel />
        </div>
      </div>

      {!hasAnySubjectEver && canCreate && (
        <div className="mt-4 rounded-xl border border-dashed border-[var(--takda-brand-border-dashed)] bg-[var(--takda-brand-tint-1)] p-4">
          <h2 className="font-display text-base font-semibold text-[color:var(--takda-text-primary)]">
            👋 Welcome to TAKDA!
          </h2>
          <p className="mt-1 text-sm text-[color:var(--takda-text-muted-2)]" aria-live="polite">
            Start organizing your academic journey! Add your first subject to
            manage your classes, activities, and deadlines.
          </p>
          <button
            type="button"
            onClick={onAddSubject}
            className="takda-focus-visible mt-3 w-full rounded-xl py-2.5 text-sm font-semibold text-white"
            style={{ background: "var(--takda-brand)" }}
          >
            + Add Your First Subject
          </button>
        </div>
      )}

      {hasAnySubjectEver && !hasAnyActivityEver && canCreate && (
        <div className="mt-4 rounded-xl border border-[var(--takda-border)] bg-[var(--takda-bg-surface)] p-4">
          <h2 className="font-display text-base font-semibold text-[color:var(--takda-text-primary)]">
            ✨ Great Start!
          </h2>
          <p className="mt-1 text-sm text-[color:var(--takda-text-muted-2)]" aria-live="polite">
            Your first subject is ready! Now, add an activity to start
            tracking assignments, quizzes, and deadlines.
          </p>
          <button
            type="button"
            onClick={onAddActivity}
            className="takda-focus-visible mt-3 w-full rounded-xl py-2.5 text-sm font-semibold text-white"
            style={{ background: "var(--takda-brand)" }}
          >
            + Add Your First Activity
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Greeting hero (Phase 09B.10) ---------------- */
// Pure function of the device clock — no new dependency, no network,
// no invented data. Only three buckets are needed by the approved
// design (morning / afternoon / evening-night), matching the existing
// Good Morning/Afternoon/Evening greeting text exactly.
function getTimePeriod() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "night";
}

// TAKDA 2.0 (Phase 10A.2): the approved illustrated asset
// (public/takda-hero-sunset.png) replaces the 3 CSS-gradient time-of-
// day variants and their decorative sun/moon/star shapes — there is
// only one supplied illustration, so it's used for every time of day;
// the greeting WORD itself ("Good Morning"/"Good Afternoon"/"Good
// Evening") still genuinely varies by time of day exactly as before,
// since that comes from the unchanged `greeting` prop (computed
// upstream in TakdaApp from its own unchanged `timePeriod` state) —
// only the background image/illustration stopped varying, not the
// text. Text color is now one fixed pair rather than 3, since the
// background is now one fixed image rather than 3 different gradients.
//
// Contrast: the approved mockup screenshot already shows this exact
// asset rendered with white text over its left (text) side, which is a
// deep navy sky — confirmed legible there. I have no image-analysis
// tool to re-measure WCAG contrast against actual pixel data, so a
// defensive dark gradient overlay (left-to-right, fading to transparent
// over the illustration) is layered under the text as a safety net
// rather than relying on the photo alone — this is the "subtle
// gradient overlay where necessary" this phase asked for.
const HERO_TEXT_COLOR = "#FFFFFF";
const HERO_SUBTLE_COLOR = "#F2EFFF";

// `greeting`/`contextMessage` are passed through unchanged from TakdaApp
// (the existing time-based greeting text and the existing overdue/due-
// today/all-caught-up message — this component invents no new deadline
// or class data of its own, per Phase 09B.10 instruction #4). `studentName`
// (Phase 10A) is an existing, already-fetched profile field threaded
// down from Root/TakdaApp, never a hardcoded sample name; it renders
// only when present. The date line (Phase 10A.2) is `new Date()`
// formatted inline on every render — no new timer, no new state; it
// self-corrects whenever anything else causes a re-render (including
// the existing 60s timePeriod poll in TakdaApp), which is more than
// sufficient for a value that only changes once every 24 hours.
function GreetingHero({ greeting, contextMessage, studentName }) {
  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  // 10A.12B: min-h reduced from 220/260px to 130/150px (desktop
  // target: ~140-160px, per the 10A.12A audit) to recover vertical
  // space for the rest of the Dashboard. min-h is a floor, not a cap
  // — the box still grows taller automatically if real content (e.g.
  // a longer contextMessage wrapping to 2 lines) needs more room,
  // satisfying "allow growth" without any extra class. py-6→py-5
  // gives a touch more breathing room relative to the smaller box.
  // Greeting/contextMessage/studentName/date badge content, the
  // sunset image asset, its gradient overlay, and HERO_TEXT_COLOR/
  // HERO_SUBTLE_COLOR contrast are all unchanged.
  return (
    <div
      className="takda-glass relative overflow-hidden rounded-2xl px-5 py-5 mb-6 min-h-[130px] md:min-h-[150px] flex items-end"
      style={{
        backgroundImage:
          "linear-gradient(to right, rgba(10,8,30,0.62) 0%, rgba(10,8,30,0.28) 45%, rgba(10,8,30,0.05) 70%), url('/takda-hero-sunset.png')",
        backgroundSize: "cover, cover",
        backgroundPosition: "left center, center",
        backgroundRepeat: "no-repeat, no-repeat",
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
      }}
    >
      <div className="relative max-w-[70%] md:max-w-[60%]">
        <h1 className="font-display text-2xl md:text-3xl font-semibold" style={{ color: HERO_TEXT_COLOR }}>
          {greeting}{studentName ? `, ${studentName}` : ""} 👋
        </h1>
        <p className="text-sm mt-1" style={{ color: HERO_SUBTLE_COLOR }}>{contextMessage}</p>
        <div
          className="inline-flex items-center gap-1.5 mt-3 rounded-full px-3 py-1.5 text-xs font-semibold"
          style={{ background: "rgba(255,255,255,0.14)", color: HERO_TEXT_COLOR }}
        >
          <CalendarIcon size={13} aria-hidden="true" />
          <span>{todayLabel}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Quick Actions (TAKDA 2.0, Phase 10A.2) ---------------- */
// Pastel per-tile accents, replacing the prior uniform indigo glossy
// gradient. All 4 colors reuse existing tokens — Add Subject/lavender
// reuses --takda-brand*, Add Activity/mint and Take Notes/amber reuse
// the same status tokens as the Academic Overview cards above, and
// View Calendar/blue reuses the existing --takda-label-inprogress*
// pair (STATUS_LABEL's "In Progress" blue) — no new color invented.
// No `.takda-glass`/backdrop-filter here at all now (these are flat
// pastel tiles, not glass) — consistent with "avoid backdrop-filter on
// repeated cards" for a 4-tile grid. Hover/press feedback is
// `motion-safe:`-gated Tailwind utilities (respects prefers-reduced-
// motion automatically) plus the existing `.takda-interactive` press
// scale (already reduced-motion-safe in index.css, untouched).
const QUICK_ACTION_ACCENTS = {
  lavender: { bg: "var(--takda-brand-tint-2)", accent: "var(--takda-brand)" },
  mint: { bg: "var(--takda-status-week-bg)", accent: "var(--takda-status-week-text)" },
  blue: { bg: "var(--takda-label-inprogress-bg)", accent: "var(--takda-label-inprogress)" },
  amber: { bg: "var(--takda-status-tomorrow-bg)", accent: "var(--takda-status-tomorrow-text)" },
};

function QuickActionTile({ icon: Icon, label, onClick, disabled, title, showProBadge, bg, accent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-disabled={disabled}
      title={title}
      className="takda-focus-visible takda-interactive flex flex-col items-center justify-center gap-1.5 rounded-2xl py-4 px-2 text-center relative border border-[var(--takda-border)] transition-shadow duration-200 hover:shadow-md motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-0.5"
      style={{ background: bg, boxShadow: "inset 0 1px 0 var(--takda-glass-highlight), 0 1px 3px rgba(15,23,42,0.05)" }}
    >
      {showProBadge && (
        <span
          className="takda-pro-badge inline-flex rounded-full px-1.5 py-0.5 text-[8px] font-extrabold tracking-wide"
          style={{ position: "absolute", top: "-6px", right: "-6px" }}
        >
          PRO
        </span>
      )}
      <Icon size={18} color={accent} />
      <span className="text-[11px] font-semibold" style={{ color: accent }}>{label}</span>
    </button>
  );
}

// Phase 10A: 4 tiles (Add Subject, Add Activity, View Calendar, Take
// Notes) — matching the TAKDA 2.0 mockup's own named examples.
// `onOpenNotes` is wiring added in Phase 10A (App.jsx + main.jsx) but
// navigates to the Notes page via the exact same `setView(...)`
// mechanism every other nav handler already uses — no new page, no new
// capability. Grade Tracker's own shortcut tile was removed from this
// grid (My Grades stays fully reachable from the Sidebar/mobile nav,
// unchanged) to keep 4 tiles matching the approved reference rather
// than introducing a 5th unrequested one — a deliberate recomposition
// choice, not a functionality removal. All click handlers, the
// `disabled`/`title` gating, and keyboard focus (`takda-focus-visible`)
// are unchanged from before this color pass.
function QuickActions({ onAddSubject, onAddActivity, onViewSchedule, onOpenNotes, canCreate = true }) {
  return (
    <div className="mb-7">
      {/* Visible "Quick Actions" heading removed per Phase 09B.6 — kept
          in the DOM as sr-only so screen-reader heading navigation and
          grouping context are preserved. */}
      <h2 className="sr-only">Quick Actions</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <QuickActionTile
          icon={BookOpen}
          label="Add Subject"
          onClick={onAddSubject}
          disabled={!canCreate}
          title={!canCreate ? "Switch to your active semester to add a subject." : undefined}
          bg={QUICK_ACTION_ACCENTS.lavender.bg}
          accent={QUICK_ACTION_ACCENTS.lavender.accent}
        />
        <QuickActionTile
          icon={CheckCircle2}
          label="Add Activity"
          onClick={onAddActivity}
          disabled={!canCreate}
          title={!canCreate ? "Switch to your active semester to add an activity." : undefined}
          bg={QUICK_ACTION_ACCENTS.mint.bg}
          accent={QUICK_ACTION_ACCENTS.mint.accent}
        />
        <QuickActionTile
          icon={CalendarIcon}
          label="View Calendar"
          onClick={onViewSchedule}
          bg={QUICK_ACTION_ACCENTS.blue.bg}
          accent={QUICK_ACTION_ACCENTS.blue.accent}
        />
        <QuickActionTile
          icon={StickyNote}
          label="Take Notes"
          onClick={onOpenNotes}
          bg={QUICK_ACTION_ACCENTS.amber.bg}
          accent={QUICK_ACTION_ACCENTS.amber.accent}
        />
      </div>
    </div>
  );
}

/* ---------------- Smart Reminders (Stage 9A — in-app only) ---------------- */
// Purely derived-state UI: reminderGroups come from TakdaApp's
// reminderRelevantActivities (active-semester-scoped, never
// selectedSemesterId), and nothing here writes to storage, requests
// Notification permission, or touches the service worker.
function SmartRemindersSection({ groups, activeSemesterName, hasSemesters, hasActiveSemesterForReminders, onToggle, onOpenSubject, onOpenReminders }) {
  const counts = {
    overdue: groups.overdue.length,
    dueToday: groups.dueToday.length,
    dueTomorrow: groups.dueTomorrow.length,
    dueSoon: groups.dueSoon.length,
  };
  const totalUrgent = counts.overdue + counts.dueToday + counts.dueTomorrow + counts.dueSoon;
  const captionText = hasSemesters
    ? (activeSemesterName ? `Reminders for ${activeSemesterName}` : "Reminders")
    : "Reminders";

  // Most urgent first, capped to keep the Dashboard from turning into a
  // second Activities list.
  const previewItems = [...groups.overdue, ...groups.dueToday, ...groups.dueTomorrow, ...groups.dueSoon].slice(0, 3);

  // Phase 09B.8: one neutral glass surface for the whole section, but
  // only when there's real content to show — the "no active semester"
  // prompt and the urgent-chips/preview-rows case both count; the plain
  // "all caught up" DashboardEmptyState (shared component) is left bare,
  // same convention used by every other Dashboard section this phase.
  const hasGlassContent = totalUrgent > 0 || (hasSemesters && !hasActiveSemesterForReminders);

  return (
    <div
      className={`takda-reminder-grid-container ${hasGlassContent ? "rounded-2xl p-4 md:p-5 bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] mb-7" : "mb-7"}`}
      style={hasGlassContent ? { boxShadow: "inset 0 1px 0 var(--takda-glass-highlight), 0 1px 3px rgba(15,23,42,0.05)" } : undefined}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="font-display text-sm font-semibold" style={{ color: "var(--takda-text-primary)" }}>{captionText}</h2>
        {totalUrgent > 0 && <ViewAllLink label="View all reminders" onClick={() => onOpenReminders("all")} />}
      </div>

      {hasSemesters && !hasActiveSemesterForReminders ? (
        <button
          type="button"
          onClick={() => onOpenReminders("all")}
          className="w-full text-left rounded-xl bg-[var(--takda-status-later-bg)] border border-[var(--takda-border)] px-3 py-3 text-xs text-[color:var(--takda-text-muted-2)]"
        >
          No semester is currently active, so there's nothing to remind you about yet. Activate a semester to start tracking its deadlines here.
        </button>
      ) : totalUrgent === 0 ? (
        <DashboardEmptyState icon={CheckCircle2} title="You're all caught up." />
      ) : (
        <>
          {/* Each chip narrows the modal to its own urgency group; only
              "View all reminders" above and the global bell open it showing
              every group. */}
          {/* 10A.4H: container-query grid (defined in index.css) instead
              of a fixed grid-cols-4 — this card sits in the Dashboard's
              narrower ~40% supporting column, where 4 equal columns
              left too little room for "Tomorrow"/"Due Soon" to render
              on one line. Defaults to 2 columns and only widens to 4
              once this grid's own rendered width actually allows it,
              independent of viewport size. */}
          <div className="takda-reminder-chip-grid mb-3">
            <ReminderChip label="Overdue" value={counts.overdue} urgencyKey="overdue" onClick={() => onOpenReminders("overdue")} />
            <ReminderChip label="Today" value={counts.dueToday} urgencyKey="today" onClick={() => onOpenReminders("today")} />
            <ReminderChip label="Tomorrow" value={counts.dueTomorrow} urgencyKey="tomorrow" onClick={() => onOpenReminders("tomorrow")} />
            <ReminderChip label="Due Soon" value={counts.dueSoon} urgencyKey="week" onClick={() => onOpenReminders("soon")} />
          </div>
          <div className="flex flex-col gap-2">
            {previewItems.map((a) => (
              <ActivityRow key={a.id} activity={a} onToggle={onToggle} onOpenSubject={onOpenSubject} compact clampTitle />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ReminderChip({ label, value, urgencyKey, onClick }) {
  const style = URGENCY_STYLE[urgencyKey];
  const active = value > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border p-3 flex flex-col items-start gap-1 text-left transition-colors duration-200 ease-out hover:shadow-sm motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3D2FE0] focus-visible:ring-offset-1"
      style={active ? { background: style.bg, borderColor: style.bg } : { background: "var(--takda-bg-surface)", borderColor: "var(--takda-border)" }}
      aria-label={`${label} — ${value}`}
    >
      <span className="font-display text-2xl font-semibold leading-none" style={{ color: active ? style.text : "#1B1B2F" }}>
        {value}
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: active ? style.text : "#64748B" }}>
        {label}
      </span>
    </button>
  );
}

/* ---------------- Smart Insights (Phase 10A — planningEngine.js) ---------------- */
// Purely presentational: `insights` already comes fully computed from
// TakdaApp's computeSmartInsights(reminderRelevantActivities) call above —
// this component invents nothing, never recomputes any date/status logic,
// and renders only each insight's own `message`. Reuses the existing
// SectionHeader/DashboardEmptyState components and the same plain
// white-card pattern already used by the Grades "Academic Insights"
// section, rather than introducing any new visual pattern.
//
// Phase 10A Implementation #3: an insight becomes a real <button> only
// when TakdaApp attached an `onActivate` callback to it (currently only
// the "overdue" insight) — this component never decides which insight
// types are actionable, never knows about ACTIVITY_FILTER_KEYS,
// selectedSemesterId/activeSemesterId, or goToActivities; it only checks
// whether the field is present.
// 10A.5B: `INSIGHT_ICON` is a pure type→icon lookup for presentation
// only — it reads `insight.type`, a field `computeSmartInsights`
// already returns, and invents no new data/classification. Falls back
// to AlertCircle for any unrecognized future type rather than crashing.
const INSIGHT_ICON = { overdue: AlertCircle, near_term_deadlines: Clock, busiest_upcoming_day: CalendarIcon };

function SmartInsightsSection({ insights }) {
  const list = Array.isArray(insights) ? insights : [];

  if (list.length === 0) {
    // 10A.5B: this "all caught up"-style empty state stays bare (no
    // card), matching the same established convention Reminders' own
    // "You're all caught up" empty state already uses — unlike Next
    // Class/Today's Classes (a different semantic category: "nothing
    // scheduled", not "nothing left to do"). SectionHeader intentionally
    // not used here — this component now renders its own heading
    // locally, matching every other migrated widget, without touching
    // the shared SectionHeader component used elsewhere.
    return (
      <>
        <h2 className="font-display text-sm font-semibold mb-2.5" style={{ color: "var(--takda-text-primary)" }}>Smart Insights</h2>
        <DashboardEmptyState
          icon={CheckCircle2}
          title="No workload alerts right now"
          subtitle="Your current academic workload looks clear."
        />
      </>
    );
  }

  return (
    <div
      className="rounded-2xl p-4 md:p-5 mb-7"
      style={{ background: "var(--takda-brand-tint-1)", boxShadow: "inset 0 1px 0 var(--takda-glass-highlight), 0 1px 3px rgba(15,23,42,0.05)" }}
    >
      <h2 className="font-display text-sm font-semibold mb-3" style={{ color: "var(--takda-text-primary)" }}>Smart Insights</h2>
      <div className="flex flex-col gap-2">
        {list.map((insight) => {
          const Icon = INSIGHT_ICON[insight.type] || AlertCircle;
          const rowContent = (
            <>
              <Icon size={15} className="shrink-0 mt-0.5" style={{ color: "var(--takda-brand)" }} />
              {/* 10A.6B: flex-1 min-w-0 (same defensive pattern already
                  used by ActivityRow's title block) lets this text wrap
                  within whatever width the flex row actually has,
                  instead of relying only on default flex sizing — same
                  message/icon/handler, no behavior change. */}
              <span className="flex-1 min-w-0">{insight.message}</span>
            </>
          );
          return insight.onActivate ? (
            <button
              key={insight.type}
              type="button"
              onClick={insight.onActivate}
              className="takda-focus-visible takda-interactive w-full text-left rounded-xl bg-[var(--takda-bg-page)] border border-[var(--takda-border)] p-3 text-sm text-[color:var(--takda-text-primary)] flex items-start gap-2 transition-colors duration-150 hover:border-[var(--takda-border-neutral-2)] hover:shadow-sm"
            >
              {rowContent}
            </button>
          ) : (
            <div key={insight.type} className="rounded-xl bg-[var(--takda-bg-page)] border border-[var(--takda-border)] p-3 text-sm text-[color:var(--takda-text-primary)] flex items-start gap-2">
              {rowContent}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionHeader({ title, muted, action }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2.5 mt-1">
      <h2 className={`text-sm ${muted ? "font-semibold text-[color:var(--takda-text-muted-1)]" : "font-semibold text-[color:var(--takda-text-heading)]"}`}>
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
      className="shrink-0 -my-1.5 py-1.5 px-1 text-xs font-semibold text-[color:var(--takda-brand)] hover:underline focus:outline-none focus-visible:underline"
    >
      {label} →
    </button>
  );
}

// 10A.4E: `tone` is a new, opt-in, default-undefined prop. Every one of
// the 10 existing call sites omits it, so `tone?.x ?? <same literal
// token as before>` resolves to the exact same background/border/icon
// color they already rendered — this is purely additive. Only Next
// Class/Today's Classes (below) pass a `tone`, to sit the empty state
// directly on their own card's pastel surface instead of the default
// neutral empty-state chip, without touching the shared default.
function DashboardEmptyState({ icon: Icon, title, subtitle, tone }) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 ${tone?.noMargin ? "" : "mb-7"}`}
      style={{
        background: tone?.bg ?? "var(--takda-bg-empty-state)",
        borderColor: tone?.border ?? "var(--takda-border)",
      }}
    >
      {Icon && (
        <Icon size={14} className="shrink-0 takda-emptystate-icon" style={{ color: tone?.iconColor ?? "var(--takda-success-icon)" }} />
      )}
      <p className="text-xs text-[color:var(--takda-text-muted-2)]">
        <span className="font-semibold text-[color:var(--takda-text-muted-3)]">{title}</span>
        {subtitle && <span> — {subtitle}</span>}
      </p>
    </div>
  );
}

// Phase 09C.2A: shared empty-state primitive, redesigned to the
// Balanced Premium token system. No backdrop-filter — the "glass"
// highlight is a plain inset box-shadow reusing the existing
// --takda-glass-highlight token (from the Phase 09B.3 foundation),
// which costs nothing beyond a normal box-shadow paint. Text color
// uses --takda-text-muted-3 (not -muted-2) specifically for contrast
// margin: --takda-text-muted-2 on --takda-bg-empty-state computes to
// only ~4.55:1 in Classic (just over the 4.5:1 AA minimum) via the WCAG
// relative-luminance formula, whereas --takda-text-muted-3 computes to
// ~7.2:1 (Classic) / ~6.8:1 (Matcha) — comfortably clear of AA in both
// themes, not a hairline pass.
function EmptyRow({ text }) {
  return (
    <div
      className="rounded-2xl text-center text-sm py-5 px-4 mb-7"
      style={{
        background: "var(--takda-bg-empty-state)",
        border: "1px solid var(--takda-border)",
        color: "var(--takda-text-muted-3)",
        boxShadow: "inset 0 1px 0 var(--takda-glass-highlight), 0 1px 3px rgba(15,23,42,0.05)",
      }}
    >
      {text}
    </div>
  );
}

/* ---------------- Phase 9D Stage 9D-4A: Dashboard class schedule ---------------- */
// nextClass/todaysClasses are purely derived (see findNextClass /
// TakdaApp's currentSemesterSchedules) — nothing here reads or writes
// subjectSchedules, and nothing here handles notification delivery.
function NextClassCard({ nextClass, onOpenSubject }) {
  // 10A.4B: flat pastel amber surface (reusing the same
  // --takda-status-tomorrow-* tokens OVERVIEW_ACCENTS.amber already
  // uses) replaces the old .takda-glass-gold backdrop-filter card, per
  // the 10A.4A audit's finding that Sunset Hero/Academic Overview/
  // Today's Focus already moved to this flat-surface language while
  // this card hadn't yet. No data/logic touched — nextClass/dayOffset/
  // startTime/location are read exactly as before.
  const dayLabel =
    nextClass && (nextClass.dayOffset === 0 ? "Today" : nextClass.dayOffset === 1 ? "Tomorrow" : SCHEDULE_WEEKDAY_FULL_LABEL[nextClass.dayOfWeek]);
  return (
    <div className="mb-7">
      <h2 className="font-display text-sm font-semibold mb-2.5" style={{ color: "var(--takda-text-primary)" }}>Next Class</h2>
      {!nextClass ? (
        // 10A.4E: sits on the same amber surface/padding as the filled
        // card below (via DashboardEmptyState's new opt-in `tone`) so
        // the empty and populated states read as one consistent card,
        // not a bare row that only gains a background once a class
        // exists. Message/subtitle text unchanged.
        <div
          className="rounded-2xl p-4 md:p-5"
          style={{
            background: "var(--takda-status-tomorrow-bg)",
            boxShadow: "inset 0 1px 0 var(--takda-glass-highlight), 0 1px 3px rgba(15,23,42,0.05)",
          }}
        >
          <DashboardEmptyState
            icon={CalendarIcon}
            title="No upcoming classes."
            subtitle="Add a class schedule from Add/Edit Subject to see it here."
            tone={{ bg: "transparent", border: "transparent", iconColor: "var(--takda-status-tomorrow-text)", noMargin: true }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => nextClass.subject && onOpenSubject(nextClass.subject.id)}
          className="takda-focus-visible takda-interactive w-full text-left rounded-2xl p-4 md:p-5 flex items-center gap-3"
          style={{
            background: "var(--takda-status-tomorrow-bg)",
            boxShadow: "inset 0 1px 0 var(--takda-glass-highlight), 0 1px 3px rgba(15,23,42,0.05)",
          }}
        >
          <span className="w-3 h-3 rounded-full shrink-0 ring-2 ring-white/60" style={{ background: nextClass.subject?.color || "var(--takda-brand)" }} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold line-clamp-2 break-words" style={{ color: "var(--takda-text-primary)" }}>
              {nextClass.subject?.name || "Untitled Subject"}
            </div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                style={{ background: "var(--takda-status-tomorrow-text)", color: "#fff" }}
              >
                {dayLabel}
              </span>
              <span className="text-xs font-medium" style={{ color: "var(--takda-text-muted-2)" }}>
                {formatScheduleTime(nextClass.startTime)}
              </span>
            </div>
            {nextClass.location && (
              <div className="text-xs mt-1 flex items-center gap-1" style={{ color: "var(--takda-text-muted-1)" }}><MapPin size={11} />{nextClass.location}</div>
            )}
          </div>
        </button>
      )}
    </div>
  );
}

// 10A.4B: visual-only vertical timeline. `classes` is still the exact
// same pre-sorted array Dashboard already computes (todaysClasses,
// sorted by startTime) — nothing here re-sorts, re-filters, or detects
// overlaps. The connecting line is purely decorative scaffolding
// between already-adjacent list items; it does not claim or imply any
// two classes have been checked against each other for a time conflict.
function TodaysClassesSection({ classes, onOpenSubject }) {
  // 10A.4E: the card now wraps both states (previously only the
  // populated list got the surface, and the empty state sat bare) so
  // it visually matches Next Class's card-first treatment. `classes`
  // itself — its contents, sort order, and semester scoping — is
  // untouched.
  return (
    <div
      className="rounded-2xl p-4 md:p-5 bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] mb-7"
      style={{ boxShadow: "inset 0 1px 0 var(--takda-glass-highlight), 0 1px 3px rgba(15,23,42,0.05)" }}
    >
      <h2 className="font-display text-sm font-semibold mb-3" style={{ color: "var(--takda-text-primary)" }}>Today's Classes</h2>
      {classes.length === 0 ? (
        <DashboardEmptyState
          icon={Clock}
          title="No classes scheduled for today."
          tone={{ bg: "transparent", border: "transparent", iconColor: "var(--takda-text-muted-1)", noMargin: true }}
        />
      ) : (
        <div className="flex flex-col">
          {classes.map((row, i) => {
            const isLast = i === classes.length - 1;
            return (
              <div key={row.id} className="flex gap-3">
                {/* Timeline rail: a dot per class, connected by a plain
                    line to the next one. Decorative only (aria-hidden) —
                    the button below already carries every bit of real
                    information a screen reader needs. */}
                <div className="flex flex-col items-center shrink-0 w-3" aria-hidden="true">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 mt-4 ring-2 ring-[var(--takda-bg-surface)]"
                    style={{ background: row.subject?.color || "var(--takda-brand)" }}
                  />
                  {!isLast && <span className="flex-1 w-px my-1" style={{ background: "var(--takda-border)" }} />}
                </div>
                <button
                  type="button"
                  onClick={() => row.subject && onOpenSubject(row.subject.id)}
                  className={`takda-focus-visible takda-interactive flex-1 text-left rounded-xl bg-[var(--takda-bg-page)] border border-[var(--takda-border)] p-3 flex items-center gap-3 transition-colors duration-150 hover:border-[var(--takda-border-neutral-2)] ${isLast ? "" : "mb-2"}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold" style={{ color: "var(--takda-brand)" }}>{formatScheduleTimeRange(row.startTime, row.endTime)}</div>
                    <div className="text-sm font-semibold mt-0.5 line-clamp-2 break-words" style={{ color: "var(--takda-text-primary)" }}>
                      {row.subject?.name || "Untitled Subject"}
                    </div>
                    {row.location && (
                      <div className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "var(--takda-text-muted-1)" }}><MapPin size={11} />{row.location}</div>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TypeChip({ type }) {
  if (!type) return null;
  return (
    <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-[color:var(--takda-text-muted-2)] bg-slate-100 rounded-full px-1.5 py-0.5">
      {type}
    </span>
  );
}

// 10A.3D: `clampTitle` is a new, opt-in, default-false prop — every
// existing call site (AllActivities, SubjectDetail, Calendar, etc.)
// keeps the original single-line `truncate` title exactly as before.
// Only TodaysFocusPanel passes `clampTitle` (Today's Focus is the only
// section this phase's brief covers), so this is additive and does not
// redesign ActivityRow's appearance anywhere else it's used.
function ActivityRow({ activity, onToggle, onOpenSubject, compact, highlight, clampTitle }) {
  const style = URGENCY_STYLE[activity.urgencyKey] || URGENCY_STYLE.later;
  const done = activity.computedStatus === "completed";
  return (
    <div
      className={`flex items-center gap-3 rounded-xl bg-[var(--takda-bg-surface)] border p-3 transition-shadow transition-colors duration-200 ease-out hover:shadow-sm motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-px ${highlight ? "border-[var(--takda-brand)]" : "border-[var(--takda-border)] hover:border-[var(--takda-border-neutral-2)]"}`}
    >
      <button
        onClick={() => onToggle(activity)}
        className="shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors duration-200 ease-out"
        style={{ borderColor: done ? "var(--takda-status-week-dot)" : "var(--takda-border-neutral-2)", background: done ? "var(--takda-status-week-dot)" : "transparent" }}
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
            <span className="text-[11px] font-medium text-[color:var(--takda-text-muted-2)] truncate">{activity.subject?.name || "General"}</span>
            <TypeChip type={activity.type} />
            <PriorityTag priority={activity.priority} />
          </div>
          <div className={`text-sm font-medium mt-0.5 transition-colors duration-200 ease-out ${clampTitle ? "line-clamp-2 break-words" : "truncate"} ${done ? "line-through text-[color:var(--takda-text-muted-1)]" : "text-[color:var(--takda-text-primary)]"}`}>{activity.title}</div>
        </button>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        {!compact && (
          <span className="text-[11px] font-semibold px-2 py-1 rounded-full" style={{ color: style.text, background: style.bg }}>
            {style.label}
          </span>
        )}
        <span className="text-[11px] text-[color:var(--takda-text-muted-1)] flex items-center gap-1">
          {compact && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: style.dot }} />}
          {fmtDate(activity.deadline)}
        </span>
      </div>
    </div>
  );
}

/* ---------------- Subjects ---------------- */
// Phase 09C.3A: Balanced Premium redesign. Cards stay plain token-based
// surfaces with a soft inset highlight + shadow — no backdrop-filter,
// per this batch's explicit "avoid backdrop-filter on repeated cards"
// performance rule (there can be many of these in one grid).
function SubjectsView({ subjects, activities, subjectSchedules = [], onOpen, onAdd, canCreate = true }) {
  return (
    <div className="p-5 md:p-8">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display text-2xl font-semibold">My Subjects</h1>
        <button
          onClick={onAdd}
          aria-disabled={!canCreate}
          title={!canCreate ? "Switch to your active semester to add a subject." : undefined}
          className={`takda-focus-visible takda-interactive takda-cta-brand flex items-center gap-1.5 text-sm font-semibold text-white rounded-xl px-3 py-2 ${!canCreate ? "opacity-40" : ""}`}
        >
          <Plus size={15} /> Add Subject
        </button>
      </div>
      {subjects.length === 0 ? (
        <EmptyRow text="No subjects yet — add one to start tracking assignments." />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {subjects.map((s) => {
            const subActs = activities.filter((a) => a.subjectId === s.id);
            const pending = subActs.filter((a) => a.computedStatus !== "completed").length;
            const completed = subActs.filter((a) => a.computedStatus === "completed").length;
            const subSchedules = subjectSchedules.filter((row) => row.subjectId === s.id);
            return (
              <button
                key={s.id}
                onClick={() => onOpen(s.id)}
                className="takda-focus-visible takda-interactive text-left rounded-2xl p-5 bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] transition-colors hover:border-[var(--takda-border-neutral-2)] hover:shadow-sm"
                style={{ boxShadow: "inset 0 1px 0 var(--takda-glass-highlight)" }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="font-display text-lg font-semibold truncate">{s.name}</span>
                </div>
                <div className="mb-3">
                  {s.teacher && <div className="text-xs mb-1 flex items-center gap-1" style={{ color: "var(--takda-text-muted-2)" }}><User size={12} />{s.teacher}</div>}
                  {s.schedule && <div className="text-xs mb-1 flex items-center gap-1" style={{ color: "var(--takda-text-muted-2)" }}><Clock size={12} />{s.schedule}</div>}
                  {subSchedules.length > 0 && <SubjectScheduleSummary schedules={subSchedules} />}
                </div>
                <div className="flex gap-2 text-xs font-semibold">
                  <span className="rounded-full px-2 py-0.5" style={{ background: "var(--takda-label-pending-bg)", color: "var(--takda-label-pending)" }}>{pending} Pending</span>
                  <span className="rounded-full px-2 py-0.5" style={{ background: "var(--takda-status-week-bg)", color: "var(--takda-status-week-text)" }}>{completed} Completed</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SubjectDetail({
  subject, activities, notes, schedules = [], onBack, onEditSubject, onDeleteSubject, onToggle,
  onEditActivity, onDeleteActivity, onAddActivity, onAddNote, onEditNote, onDeleteNote,
  canCreate = true, readOnly = false,
  materials = [], materialsLoading = false, materialsError = "",
  accountUploadUsageBytes = null, accountUploadUsageValid = false, materialUploadLimitBytes = null,
  canAddMaterials = true, materialsReadOnly = false,
  onAddMaterial, onAddUpload, onEditMaterial, onDeleteMaterial, onOpenMaterial,
}) {
  const [noteText, setNoteText] = useState("");
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNoteText, setEditNoteText] = useState("");
  const [deletingMaterialId, setDeletingMaterialId] = useState(null);
  const [openingMaterialId, setOpeningMaterialId] = useState(null);
  const pending = activities.filter((a) => a.computedStatus !== "completed");
  const completed = activities.filter((a) => a.computedStatus === "completed");
  return (
    <div className="p-5 md:p-8">
      <button onClick={onBack} className="takda-focus-visible flex items-center gap-1 text-sm mb-4" style={{ color: "var(--takda-text-muted-2)" }}><ArrowLeft size={15} /> Subjects</button>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: subject.color }} />
          <h1 className="font-display text-2xl font-semibold truncate">{subject.name}</h1>
          {readOnly && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5" style={{ color: "var(--takda-text-muted-2)", background: "var(--takda-border)" }}>Archived</span>}
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={onEditSubject} disabled={readOnly} aria-label="Edit subject" className="takda-focus-visible p-2.5 rounded-xl bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] transition-colors duration-150 hover:border-[var(--takda-border-neutral-2)] disabled:opacity-40"><Edit2 size={14} /></button>
          <button onClick={onDeleteSubject} disabled={readOnly} aria-label="Delete subject" className="takda-focus-visible p-2.5 rounded-xl bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] text-red-500 transition-colors duration-150 hover:bg-red-50 disabled:opacity-40"><Trash2 size={14} /></button>
        </div>
      </div>
      <div className="mb-6">
        <div className="flex flex-wrap gap-3 text-xs" style={{ color: "var(--takda-text-muted-2)" }}>
          {subject.teacher && <span className="flex items-center gap-1"><User size={12} />{subject.teacher}</span>}
          {subject.schedule && <span className="flex items-center gap-1"><Clock size={12} />{subject.schedule}</span>}
          {subject.room && <span className="flex items-center gap-1"><MapPin size={12} />{subject.room}</span>}
        </div>
        {schedules.length > 0 && (
          <div className="mt-2">
            <SubjectScheduleSummary schedules={schedules} />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-sm font-semibold min-w-0 truncate" style={{ color: "var(--takda-text-heading)" }}>Activities ({pending.length} pending, {completed.length} completed)</h2>
        <button onClick={onAddActivity} aria-disabled={!canCreate} title={!canCreate ? "Switch to your active semester to add an activity." : undefined} className={`takda-focus-visible flex items-center gap-1 text-xs font-semibold shrink-0 -my-1.5 py-1.5 px-1 rounded ${!canCreate ? "opacity-40" : ""}`} style={{ color: "var(--takda-brand)" }}><Plus size={13} /> Add</button>
      </div>
      {activities.length === 0 ? (
        <EmptyRow text="No activities for this subject yet." />
      ) : (
        <div className="flex flex-col gap-2 mb-7">
          {activities.sort((a,b)=>new Date(a.deadline)-new Date(b.deadline)).map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-2xl bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] p-3 transition-shadow transition-colors duration-200 ease-out hover:shadow-sm hover:border-[var(--takda-border-neutral-2)] motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-px"
              style={{ boxShadow: "inset 0 1px 0 var(--takda-glass-highlight)" }}
            >
              <button onClick={() => onToggle(a)} disabled={readOnly} className="takda-focus-visible shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors duration-200 ease-out disabled:opacity-40" style={{ borderColor: a.computedStatus === "completed" ? "var(--takda-status-week-dot)" : "var(--takda-border-neutral-2)", background: a.computedStatus === "completed" ? "var(--takda-status-week-dot)" : "transparent" }}>
                <Check size={14} color="white" className={`transition-all duration-200 ease-out motion-reduce:transition-none ${a.computedStatus === "completed" ? "opacity-100 scale-100" : "opacity-0 scale-50"}`} />
              </button>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate transition-colors duration-200 ease-out ${a.computedStatus === "completed" ? "line-through" : ""}`} style={{ color: a.computedStatus === "completed" ? "var(--takda-text-muted-1)" : undefined }}>{a.title}</div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-[11px]" style={{ color: "var(--takda-text-muted-2)" }}>{a.type} · {fmtDate(a.deadline)}</span>
                  <StatusBadge status={a.computedStatus} />
                  <PriorityTag priority={a.priority} />
                </div>
              </div>
              <button onClick={() => onEditActivity(a)} disabled={readOnly} aria-label="Edit activity" className="takda-focus-visible p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors duration-150 disabled:opacity-40"><Edit2 size={13} /></button>
              <button onClick={() => onDeleteActivity(a.id)} disabled={readOnly} aria-label="Delete activity" className="takda-focus-visible p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors duration-150 disabled:opacity-40"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}

      <h2 className="text-sm font-semibold mb-2.5" style={{ color: "var(--takda-text-heading)" }}>Notes</h2>
      <div className="flex gap-2 mb-3">
        <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Write a quick note…" className="takda-focus-visible flex-1 rounded-xl border border-[var(--takda-border)] bg-[var(--takda-bg-surface)] px-3 py-2 text-sm outline-none" />
        <button
          onClick={() => { if (noteText.trim() && onAddNote(noteText.trim())) setNoteText(""); }}
          aria-disabled={!canCreate}
          title={!canCreate ? "Switch to your active semester to add a note." : undefined}
          className={`takda-focus-visible takda-interactive takda-cta-brand rounded-xl px-3 py-2 text-sm font-semibold text-white ${!canCreate ? "opacity-40" : ""}`}
        >Save</button>
      </div>
      <div className="flex flex-col gap-2">
        {notes.length === 0 && <div className="text-sm" style={{ color: "var(--takda-text-muted-1)" }}>No notes yet.</div>}
        {notes.slice().reverse().map((n) => (
          <div
            key={n.id}
            className="rounded-2xl bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] p-3 text-sm"
            style={{ boxShadow: "inset 0 1px 0 var(--takda-glass-highlight)" }}
          >
            {editingNoteId === n.id ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={editNoteText}
                  onChange={(e) => setEditNoteText(e.target.value)}
                  rows={3}
                  autoFocus
                  className="takda-focus-visible w-full rounded-xl border border-[var(--takda-border)] px-3 py-2 text-sm outline-none resize-none"
                />
                <div className="flex flex-wrap justify-end gap-2">
                  <button onClick={() => { setEditingNoteId(null); setEditNoteText(""); }} className="takda-focus-visible rounded-xl px-3 py-1.5 text-sm font-semibold border border-[var(--takda-border)] transition-colors duration-150 hover:bg-slate-50" style={{ color: "var(--takda-text-muted-2)" }}>Cancel</button>
                  <button
                    onClick={() => { if (editNoteText.trim()) { onEditNote(n.id, editNoteText.trim()); setEditingNoteId(null); setEditNoteText(""); } }}
                    disabled={!editNoteText.trim()}
                    className="takda-focus-visible takda-interactive takda-cta-brand rounded-xl px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >Save Changes</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <span className="flex-1 min-w-0 break-words">{n.body}</span>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => { setEditingNoteId(n.id); setEditNoteText(n.body); }} disabled={readOnly} aria-label="Edit note" title="Edit note" className="takda-focus-visible p-2 -m-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors duration-150 disabled:opacity-40"><Edit2 size={13} /></button>
                  <button onClick={() => onDeleteNote(n.id)} disabled={readOnly} aria-label="Delete note" title="Delete note" className="takda-focus-visible p-2 -m-1 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors duration-150 disabled:opacity-40"><Trash2 size={13} /></button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <h2 className="text-sm font-semibold mb-2.5 mt-7" style={{ color: "var(--takda-text-heading)" }}>Lesson Materials</h2>
      {materialsError && <div className="text-sm text-red-500 mb-2">{materialsError}</div>}
      {!materialsLoading && !materialsError && typeof materialUploadLimitBytes === "number" && (
        accountUploadUsageValid ? (
          <MaterialStorageUsageIndicator
            usageBytes={accountUploadUsageBytes}
            limitBytes={materialUploadLimitBytes}
          />
        ) : (
          // computeAccountUploadUsageBytes found at least one upload
          // row whose fileSize could not be safely parsed — never show
          // a fabricated/corrupted number, and never surface the raw
          // value or any backend detail; a flat, neutral message only.
          <p className="text-xs mb-3" style={{ color: "var(--takda-text-muted-1)" }}>Storage usage is temporarily unavailable.</p>
        )
      )}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <span className="text-xs" style={{ color: "var(--takda-text-muted-1)" }}>{materialsLoading ? "Loading…" : `${materials.length} material${materials.length === 1 ? "" : "s"}`}</span>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <button
            onClick={onAddUpload}
            disabled={!canAddMaterials}
            title={!canAddMaterials ? "Switch to your active semester to add a lesson material." : undefined}
            className={`takda-focus-visible flex items-center gap-1 text-xs font-semibold shrink-0 -my-1.5 py-1.5 px-1 rounded ${!canAddMaterials ? "opacity-40" : ""}`}
            style={{ color: "var(--takda-brand)" }}
          ><Plus size={13} /> Upload File</button>
          <button
            onClick={onAddMaterial}
            disabled={!canAddMaterials}
            title={!canAddMaterials ? "Switch to your active semester to add a lesson material." : undefined}
            className={`takda-focus-visible flex items-center gap-1 text-xs font-semibold shrink-0 -my-1.5 py-1.5 px-1 rounded ${!canAddMaterials ? "opacity-40" : ""}`}
            style={{ color: "var(--takda-brand)" }}
          ><Plus size={13} /> Add Link</button>
        </div>
      </div>
      {!materialsLoading && materials.length === 0 ? (
        <EmptyRow text="No lesson materials yet." />
      ) : (
        <div className="flex flex-col gap-2">
          {materials.map((m) => {
            const deleting = deletingMaterialId === m.id;
            const handleDelete = async () => {
              setDeletingMaterialId(m.id);
              try {
                await onDeleteMaterial(m);
              } finally {
                setDeletingMaterialId(null);
              }
            };
            const opening = openingMaterialId === m.id;
            const handleOpen = async () => {
              setOpeningMaterialId(m.id);
              try {
                await onOpenMaterial(m);
              } finally {
                setOpeningMaterialId(null);
              }
            };

            // Explicit materialType dispatch — never inferred from the
            // presence/absence of externalUrl/storagePath. An unknown
            // future material_type renders a safe, non-actionable card
            // rather than being silently treated as a link.
            if (m.materialType === "link") {
              return (
                <MaterialLinkCard
                  key={m.id}
                  material={m}
                  readOnly={materialsReadOnly}
                  deleting={deleting}
                  onEdit={() => onEditMaterial(m)}
                  onDelete={handleDelete}
                />
              );
            }

            if (m.materialType === "upload") {
              return (
                <MaterialUploadCard
                  key={m.id}
                  material={m}
                  readOnly={materialsReadOnly}
                  deleting={deleting}
                  opening={opening}
                  onDelete={handleDelete}
                  onOpen={handleOpen}
                />
              );
            }

            return <UnknownMaterialCard key={m.id} material={m} />;
          })}
        </div>
      )}
    </div>
  );
}

// Hybrid Lesson Materials #9B: account-wide Storage Usage Indicator —
// strictly cosmetic, never consulted for any quota decision (see the
// accountUploadUsageBytes/materialUploadLimitBytes derivation above in
// TakdaApp). Rendered only once its caller has confirmed materials
// finished loading without error AND computeAccountUploadUsageBytes
// reported a valid result — this component itself has no loading/
// error/validity state of its own and never substitutes a fabricated
// zero for either value.
//
// aria-valuenow is clamped to aria-valuemax (never exceeds it, even
// when over the plan limit) to stay inside the WAI-ARIA progressbar
// value contract; aria-valuetext carries the TRUE, unclamped usage and
// an explicit "over your plan's limit" statement so a screen-reader
// user is never told the over-limit state only through the bar's red
// color — the same real text is also shown visually below the bar.
function MaterialStorageUsageIndicator({ usageBytes, limitBytes }) {
  const display = getMaterialUploadUsageDisplay(usageBytes, limitBytes);
  const accessibleValue = getMaterialUploadUsageAccessibleValue(usageBytes, limitBytes);
  const barColor = display.isOverLimit ? "#DC2626" : "var(--takda-brand)";

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-2 text-xs mb-1" style={{ color: "var(--takda-text-muted-2)" }}>
        <span>
          {display.usedMiBLabel} / {display.limitMiBLabel} used (account-wide)
        </span>
        <span>{display.remainingMiBLabel} left</span>
      </div>
      <div
        role="progressbar"
        aria-label="Lesson file storage used, account-wide"
        aria-valuemin={0}
        aria-valuemax={Math.round(limitBytes)}
        aria-valuenow={accessibleValue.valueNow}
        aria-valuetext={accessibleValue.valueText}
        className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden"
      >
        <div
          className="h-full rounded-full transition-[width] duration-150"
          style={{ width: `${display.percentClamped}%`, background: barColor }}
        />
      </div>
      {display.isOverLimit && (
        <p className="text-xs text-red-500 mt-1">
          You're over your plan's lesson-file storage limit. Delete an uploaded file to free space.
        </p>
      )}
    </div>
  );
}

// Hybrid Lesson Materials #3: hostname is derived purely client-side from
// the already-validated/stored external_url via the same URL API
// materialLinks.js already uses — no network request. Fails gracefully
// (omits the hostname line) rather than crashing SubjectDetail if a
// legacy/bad URL somehow can't be parsed.
function materialHostname(externalUrl) {
  try {
    return new URL(externalUrl).hostname;
  } catch {
    return null;
  }
}

function MaterialLinkCard({ material, readOnly, deleting, onEdit, onDelete }) {
  const hostname = materialHostname(material.externalUrl);
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] p-3" style={{ boxShadow: "inset 0 1px 0 var(--takda-glass-highlight)" }}>
      <span className="shrink-0 mt-0.5" style={{ color: "var(--takda-text-muted-1)" }}><Link2 size={16} /></span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{material.title}</div>
        {material.description && <div className="text-xs mt-0.5 break-words" style={{ color: "var(--takda-text-muted-2)" }}>{material.description}</div>}
        <a
          href={material.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="takda-focus-visible text-xs mt-1 inline-block truncate max-w-full hover:underline"
          style={{ color: "var(--takda-brand)" }}
        >
          {hostname || "Open link"}
        </a>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          onClick={onEdit}
          disabled={readOnly}
          aria-label="Edit lesson material"
          title={readOnly ? "Switch to your active semester to edit lesson materials." : "Edit"}
          className="takda-focus-visible p-2 -m-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors duration-150 disabled:opacity-40"
        ><Edit2 size={13} /></button>
        <button
          onClick={onDelete}
          disabled={readOnly || deleting}
          aria-label="Delete lesson material"
          title={readOnly ? "Switch to your active semester to delete lesson materials." : "Delete"}
          className="takda-focus-visible p-2 -m-1 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors duration-150 disabled:opacity-40"
        ><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

function MaterialLinkModal({ material, onClose, onSave }) {
  const [title, setTitle] = useState(material?.title || "");
  const [description, setDescription] = useState(material?.description || "");
  const [externalUrl, setExternalUrl] = useState(material?.externalUrl || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const trimmedTitle = title.trim();
  const trimmedUrl = externalUrl.trim();
  // Advisory only — a friendly early hint, never the authoritative check.
  // The real validation (HTTPS-only, no credentials, well-formed, etc.)
  // always runs inside createSubjectMaterialLink/updateSubjectMaterialLink
  // via normalizeExternalUrl, regardless of what this shows.
  const looksLikeHttps = trimmedUrl === "" || /^https:\/\//i.test(trimmedUrl);

  async function handleSubmit() {
    setSaving(true);
    setError("");
    try {
      await onSave({ title: trimmedTitle, description: description.trim(), externalUrl: trimmedUrl });
      onClose();
    } catch (e) {
      // Hybrid Lesson Materials #7: only a known-safe validation error's
      // own message is ever shown directly — anything else (e.g. a raw
      // backend/network error) falls back to a fixed generic message,
      // mirroring MaterialUploadModal's existing instanceof-based
      // pattern rather than surfacing arbitrary e.message.
      setError(
        e instanceof MaterialLinkValidationError
          ? e.message
          : "Unable to save this link right now. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={material ? "Edit Lesson Material" : "Add Link"} onClose={onClose}>
      <Field label="Title *">
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Lesson 1 — Skeletal System" />
      </Field>
      <Field label="Description">
        <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes" />
      </Field>
      <Field label="Link *">
        <input className={inputCls} value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://..." />
      </Field>
      {!looksLikeHttps && (
        <p className="text-xs text-amber-600 -mt-2 mb-3">Links must start with https://</p>
      )}
      {error && <p className="text-xs text-red-500 -mt-2 mb-3">{error}</p>}
      <button
        disabled={!trimmedTitle || !trimmedUrl || saving}
        onClick={handleSubmit}
        className="takda-focus-visible takda-interactive takda-cta-brand w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-40 mt-2"
      >
        {saving ? "Saving..." : "Save Material"}
      </button>
    </ModalShell>
  );
}

// Hybrid Lesson Materials #5C: upload-specific — no Open/Download/
// Preview (that is #6, via a signed URL) and no Edit/Replace (no
// data-layer function exists for it; delete + re-upload is the only
// path for now). Deliberately a separate component from
// MaterialLinkCard rather than branching inside it, since the two
// material types share almost nothing presentation-wise beyond the
// outer card shell.
// Hybrid Lesson Materials #6: Open is deliberately a <button>, never a
// signed-URL anchor — the URL is short-lived and must be created fresh
// on each click, not embedded as a static href. Open is never disabled
// by `readOnly` (opening a file is a read, not a mutation) — only by
// its own in-flight `opening` state, unlike Delete below.
// Phase 09C.8B: Balanced Premium card treatment, same rounded-2xl +
// token + soft inset-highlight pattern used by the Dashboard/Subjects/
// Activities/Grades redesign. No backdrop-filter — these can repeat
// many times in one Lesson Materials list.
function MaterialUploadCard({ material, readOnly, deleting, opening, onDelete, onOpen }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] p-3" style={{ boxShadow: "inset 0 1px 0 var(--takda-glass-highlight)" }}>
      <span className="shrink-0 mt-0.5" style={{ color: "var(--takda-text-muted-1)" }}><FileText size={16} /></span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{material.title}</div>
        {material.description && <div className="text-xs mt-0.5 break-words" style={{ color: "var(--takda-text-muted-2)" }}>{material.description}</div>}
        {material.fileName && <div className="text-xs mt-1 truncate" style={{ color: "var(--takda-text-muted-1)" }}>{material.fileName}</div>}
        <button
          onClick={onOpen}
          disabled={opening}
          className="takda-focus-visible text-xs mt-1 inline-flex items-center gap-1 hover:underline disabled:opacity-40"
          style={{ color: "var(--takda-brand)" }}
        >
          <ExternalLink size={12} /> {opening ? "Opening..." : "Open"}
        </button>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          onClick={onDelete}
          disabled={readOnly || deleting}
          aria-label="Delete lesson material"
          title={readOnly ? "Switch to your active semester to delete lesson materials." : "Delete"}
          className="takda-focus-visible p-2 -m-1 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors duration-150 disabled:opacity-40"
        ><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

// Safe fallback for any material_type this version of the UI doesn't
// recognize — displays only inert text, with NO Open/Edit/Delete
// control of any kind, so a future third material type can never be
// silently mishandled as a link or trigger an accidental mutation.
function UnknownMaterialCard({ material }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] p-3 opacity-70">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{material.title}</div>
        {material.description && <div className="text-xs mt-0.5 break-words" style={{ color: "var(--takda-text-muted-2)" }}>{material.description}</div>}
      </div>
    </div>
  );
}

function MaterialUploadModal({ onClose, onSave }) {
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleFileChange(e) {
    const selected = e.target.files?.[0] || null;
    setFile(selected);
    setError("");

    if (!selected) {
      setFileError("");
      return;
    }

    try {
      validateMaterialUploadFile(selected);
      setFileError("");

      // Only auto-fill (and only from a file that actually validated)
      // while the user hasn't typed their own title yet — selecting a
      // different file afterward must never overwrite a manually-
      // entered title, and an invalid file must never auto-fill at all.
      if (!titleTouched) {
        const derived = deriveMaterialUploadTitle(selected.name);
        if (derived) setTitle(derived);
      }
    } catch (err) {
      setFileError(err.message || "That file can't be uploaded.");
    }
  }

  function handleTitleChange(e) {
    setTitleTouched(true);
    setTitle(e.target.value);
  }

  const trimmedTitle = title.trim();

  async function handleSubmit() {
    if (!file || !trimmedTitle) return;

    // Re-validate immediately before submitting rather than relying
    // solely on the earlier file-change event — the same helper
    // (validateMaterialUploadFile) the data layer itself uses, so no
    // rule is duplicated here.
    try {
      validateMaterialUploadFile(file);
    } catch (err) {
      setFileError(err.message || "That file can't be uploaded.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSave({ title: trimmedTitle, description: description.trim(), file });
      onClose();
    } catch (e) {
      if (e instanceof MaterialUploadValidationError) {
        setFileError(e.message);
      } else if (e instanceof MaterialUploadQuotaError || e?.code === "quota_exceeded") {
        // Both checks recognize the SAME condition — instanceof is the
        // primary check; the .code fallback is extra defense-in-depth
        // only, never a different message/behavior. Never surfaces
        // limitBytes/currentUsageBytes/newFileSize or any backend
        // detail to the user.
        setError(
          "Lesson file storage limit reached. Free accounts can store up to 10 MiB, and Pro accounts up to 50 MiB of uploaded lesson files. Delete an uploaded file to free space, or use Add Link instead."
        );
      } else {
        setError("Unable to upload this file right now. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Upload File" onClose={onClose}>
      <Field label="File *">
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          onChange={handleFileChange}
          className={inputCls}
        />
      </Field>
      <p className="text-xs -mt-2 mb-3" style={{ color: "var(--takda-text-muted-1)" }}>PDF, JPG, or PNG — up to 10 MB</p>
      {fileError && <p className="text-xs text-red-500 -mt-2 mb-3">{fileError}</p>}
      <Field label="Title *">
        <input className={inputCls} value={title} onChange={handleTitleChange} placeholder="e.g. Lesson 1 — Skeletal System" />
      </Field>
      <Field label="Description">
        <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes" />
      </Field>
      {error && <p className="text-xs text-red-500 -mt-2 mb-3">{error}</p>}
      <button
        disabled={!file || !trimmedTitle || !!fileError || saving}
        onClick={handleSubmit}
        className="takda-focus-visible takda-interactive takda-cta-brand w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-40 mt-2"
      >
        {saving ? "Uploading..." : "Upload File"}
      </button>
    </ModalShell>
  );
}

/* ---------------- Calendar ---------------- */
const CALENDAR_DOT_LIMIT = 3;
const CALENDAR_CLASS_DOT_LIMIT = 3;
// Same soft-tint palette already used for FOCUS_TILE_STYLE on the Dashboard —
// reused values, not a new color scheme.
const CALENDAR_DAY_TONE = {
  overdue: { bg: "#FEF2F2", border: "#FBD5D5" },
  completed: { bg: "#F0FDF4", border: "#CDEFD8" },
};

// Phase 9D Stage 9D-4B: is `date` inside `semester`'s startDate/endDate
// range (inclusive)? A missing bound on either side is unbounded on that
// side; a null/undefined semester (the zero-semester or Unassigned/legacy
// bucket) is always unbounded. Uses the same local-date parsing as every
// other deadline/date comparison in this file (parseLocalDate/startOfDay)
// so this can never off-by-one from a UTC/local mismatch.
function isDateWithinSemesterRange(date, semester) {
  if (!semester) return true;
  const day = startOfDay(date);
  if (semester.startDate && day < parseLocalDate(semester.startDate)) return false;
  if (semester.endDate && day > parseLocalDate(semester.endDate)) return false;
  return true;
}

// Derives this ONE date's class occurrences from the weekly-recurring
// subjectSchedules rows already scoped (by the caller) to the semester
// being browsed — never persisted, never written back. `schedules` is
// assumed pre-filtered to subjects belonging to `semester` (or to the
// Unassigned/legacy bucket when semester is null), so the range check only
// needs to run once per date rather than once per row. Sorted ascending by
// start time.
function classOccurrencesForDate(date, schedules, subjectMap, semester) {
  if (!isDateWithinSemesterRange(date, semester)) return [];
  const dow = date.getDay();
  return schedules
    .filter((row) => row.dayOfWeek === dow)
    .map((row) => ({ ...row, date, subject: subjectMap[row.subjectId] }))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function CalendarView({ activities, subjectSchedules = [], subjectMap = {}, semester = null, onToggle, onOpenSubject, onAddActivity, canCreate = true, readOnly = false }) {
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

  // Phase 9D Stage 9D-4B: one derived (never persisted) class occurrence
  // list per visible day cell — subjectSchedules is already scoped by the
  // caller to the same semester as `activities` above, so this stays in
  // sync with whatever semester Calendar is currently browsing.
  const classesByDate = useMemo(() => {
    const m = {};
    cells.forEach((d) => {
      if (!d) return;
      const occurrences = classOccurrencesForDate(d, subjectSchedules, subjectMap, semester);
      if (occurrences.length > 0) m[d.toDateString()] = occurrences;
    });
    return m;
  }, [cells, subjectSchedules, subjectMap, semester]);

  // Computed independently of classesByDate/cells — `selected` can be a
  // date outside the currently displayed month (e.g. the user changed
  // months without picking a new day), exactly like selectedList/
  // activitiesByDate above already tolerate.
  const selectedClasses = useMemo(
    () => classOccurrencesForDate(selected, subjectSchedules, subjectMap, semester),
    [selected, subjectSchedules, subjectMap, semester]
  );

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

  // Phase 09C.5: Balanced Premium redesign. Per performance rule #6
  // ("avoid expensive visual effects inside calendar day cells"), the
  // ~35-42 day-cell buttons below get token-based colors only — no
  // box-shadow/glass highlight on any of them, unlike the agenda cards
  // further down which are a short list, not a dense grid.
  return (
    <div className="p-5 md:p-8">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="font-display text-2xl font-semibold">Calendar</h1>
        <button
          onClick={() => onAddActivity(formatLocalDate(selected))}
          aria-disabled={!canCreate}
          title={!canCreate ? "Switch to your active semester to add an activity." : undefined}
          className={`takda-focus-visible flex items-center gap-1.5 text-sm font-semibold text-white rounded-xl px-3 py-2 shrink-0 takda-interactive takda-cta-brand ${!canCreate ? "opacity-40" : ""}`}
        >
          <Plus size={15} /> Add Activity
        </button>
      </div>
      <p className="text-xs mb-4" style={{ color: "var(--takda-text-muted-2)" }}>
        {monthSummary.total} {monthSummary.total === 1 ? "deadline" : "deadlines"} • {monthSummary.overdue} overdue • {monthSummary.completed} completed
      </p>

      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          aria-label="Previous month"
          className="takda-focus-visible p-2.5 rounded-xl bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] transition-colors duration-150 hover:border-[var(--takda-border-neutral-2)] motion-safe:active:scale-95"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-display text-lg font-semibold truncate">{cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
          <button
            onClick={goToToday}
            className="takda-focus-visible shrink-0 text-[11px] font-semibold px-2 -my-1.5 py-2.5 rounded-full border border-[var(--takda-border)] transition-colors duration-150 hover:border-[var(--takda-brand)] hover:text-[color:var(--takda-brand)]"
            style={{ color: "var(--takda-text-muted-2)" }}
          >
            Today
          </button>
        </div>
        <button
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          aria-label="Next month"
          className="takda-focus-visible p-2.5 rounded-xl bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] transition-colors duration-150 hover:border-[var(--takda-border-neutral-2)] motion-safe:active:scale-95"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] mb-1" style={{ color: "var(--takda-text-muted-1)" }}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1 mb-6">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const key = d.toDateString();
          const items = activitiesByDate[key] || [];
          const dayClasses = classesByDate[key] || [];
          const isSelected = key === selectedKey;
          const isToday = key === today.toDateString();
          const hasOverdue = items.some((a) => a.computedStatus === "overdue");
          const hasActive = items.some((a) => a.computedStatus !== "completed");
          const hasOnlyCompleted = items.length > 0 && !hasActive;

          let cellStyle = { background: "var(--takda-bg-surface)", borderColor: "var(--takda-border)", color: "var(--takda-text-primary)" };
          if (hasOverdue) cellStyle = { background: CALENDAR_DAY_TONE.overdue.bg, borderColor: CALENDAR_DAY_TONE.overdue.border, color: "var(--takda-text-primary)" };
          else if (hasOnlyCompleted) cellStyle = { background: CALENDAR_DAY_TONE.completed.bg, borderColor: CALENDAR_DAY_TONE.completed.border, color: "var(--takda-text-primary)" };
          if (isToday && !isSelected) cellStyle.borderColor = "var(--takda-brand)";
          // Selected always wins outright rather than stacking with the
          // today/overdue/completed tint, so the two states never collide.
          if (isSelected) cellStyle = { background: "var(--takda-brand)", borderColor: "var(--takda-brand)", color: "#FFFFFF" };

          const visibleDots = items.slice(0, items.length > CALENDAR_DOT_LIMIT ? CALENDAR_DOT_LIMIT - 1 : CALENDAR_DOT_LIMIT);
          const overflowCount = items.length > CALENDAR_DOT_LIMIT ? items.length - visibleDots.length : 0;

          const dateLabel = d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
          const activityLabel = items.length > 0 ? `, ${items.length} ${items.length === 1 ? "activity" : "activities"}` : "";
          const classLabel = dayClasses.length > 0 ? `, ${dayClasses.length} ${dayClasses.length === 1 ? "class" : "classes"}` : "";

          // Phase 9D Stage 9D-4B: a second, visually distinct (hollow ring
          // vs. the solid activity dots below) indicator row in the cell's
          // opposite corner — additive only, never touches the activity dot
          // logic above/below it.
          const visibleClassDots = dayClasses.slice(0, dayClasses.length > CALENDAR_CLASS_DOT_LIMIT ? CALENDAR_CLASS_DOT_LIMIT - 1 : CALENDAR_CLASS_DOT_LIMIT);
          const classOverflowCount = dayClasses.length > CALENDAR_CLASS_DOT_LIMIT ? dayClasses.length - visibleClassDots.length : 0;

          return (
            <button
              key={i}
              onClick={() => setSelected(startOfDay(d))}
              aria-label={`${dateLabel}${activityLabel}${classLabel}`}
              aria-pressed={isSelected}
              className="takda-focus-visible aspect-square rounded-xl flex flex-col items-center justify-center relative text-xs border transition-colors duration-150 ease-out motion-safe:transition-transform motion-safe:hover:-translate-y-px"
              style={{ background: cellStyle.background, color: cellStyle.color, borderColor: cellStyle.borderColor, borderWidth: isToday && !isSelected ? 1.5 : 1 }}
            >
              {d.getDate()}
              {dayClasses.length > 0 && (
                <span className="absolute top-1 right-1 flex items-center gap-0.5">
                  {visibleClassDots.map((c, dotIndex) => (
                    <span
                      key={c.id || dotIndex}
                      className="w-1.5 h-1.5 rounded-full shrink-0 border"
                      style={{ borderColor: isSelected ? "#FFFFFF" : (c.subject?.color || "var(--takda-text-muted-1)"), background: "transparent" }}
                    />
                  ))}
                  {classOverflowCount > 0 && (
                    <span className="text-[7px] font-bold leading-none ml-0.5" style={{ color: isSelected ? "#FFFFFF" : "var(--takda-text-muted-2)" }}>
                      +{classOverflowCount}
                    </span>
                  )}
                </span>
              )}
              {items.length > 0 && (
                <span className="absolute bottom-1 flex items-center gap-0.5">
                  {visibleDots.map((a, dotIndex) => (
                    <span
                      key={a.id || dotIndex}
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: isSelected ? "#FFFFFF" : (a.subject?.color || "var(--takda-text-muted-1)") }}
                    />
                  ))}
                  {overflowCount > 0 && (
                    <span className="text-[8px] font-bold leading-none ml-0.5" style={{ color: isSelected ? "#FFFFFF" : "var(--takda-text-muted-2)" }}>
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
        <h2 className="text-sm font-semibold" style={{ color: "var(--takda-text-heading)" }}>{fmtDateFull(selected)}</h2>
        <span className="text-xs" style={{ color: "var(--takda-text-muted-1)" }}>{selectedList.length} {selectedList.length === 1 ? "activity" : "activities"}</span>
      </div>

      {selectedClasses.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--takda-text-muted-1)" }}>Classes</h3>
          <div className="flex flex-col gap-2">
            {selectedClasses.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => c.subject && onOpenSubject(c.subjectId)}
                className="takda-focus-visible w-full text-left flex items-center gap-3 rounded-2xl bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] p-3 transition-colors duration-150 hover:border-[var(--takda-border-neutral-2)]"
                style={{ boxShadow: "inset 0 1px 0 var(--takda-glass-highlight)" }}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0 border-2" style={{ borderColor: c.subject?.color || "var(--takda-text-muted-1)" }} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{c.subject?.name || "Untitled Subject"}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--takda-text-muted-2)" }}>{formatScheduleTimeRange(c.startTime, c.endTime)}</div>
                  {c.location && (
                    <div className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "var(--takda-text-muted-1)" }}><MapPin size={11} />{c.location}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

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
function NotesView({ notes, subjectMap, onAdd, onEdit, onDelete, subjects, canCreate = true, readOnly = false }) {
  const [subjectId, setSubjectId] = useState("");
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  return (
    <div className="p-5 md:p-8">
      <h1 className="font-display text-2xl font-semibold mb-5">Notes</h1>
      <div
        className="rounded-2xl bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] p-3 mb-6 flex flex-col gap-2"
        style={{ boxShadow: "inset 0 1px 0 var(--takda-glass-highlight)" }}
      >
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="takda-focus-visible rounded-xl border border-[var(--takda-border)] bg-[var(--takda-bg-surface)] px-2 py-1.5 text-sm outline-none">
          <option value="">General note</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Write something down…" className="takda-focus-visible rounded-xl border border-[var(--takda-border)] bg-[var(--takda-bg-surface)] px-3 py-2 text-sm outline-none resize-none" />
        <button
          onClick={() => { if (text.trim() && onAdd(subjectId || null, text.trim())) setText(""); }}
          aria-disabled={!canCreate}
          title={!canCreate ? "Switch to your active semester to add a note." : undefined}
          className={`takda-focus-visible takda-interactive takda-cta-brand self-end rounded-xl px-3 py-1.5 text-sm font-semibold text-white ${!canCreate ? "opacity-40" : ""}`}
        >Save note</button>
      </div>
      {notes.length === 0 ? (
        <EmptyRow text="No notes yet." />
      ) : (
        <div className="flex flex-col gap-2">
          {notes.slice().reverse().map((n) => (
            <div
              key={n.id}
              className="rounded-2xl bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] p-3 text-sm"
              style={{ boxShadow: "inset 0 1px 0 var(--takda-glass-highlight)" }}
            >
              {editingId === n.id ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    autoFocus
                    className="takda-focus-visible w-full rounded-xl border border-[var(--takda-border)] px-3 py-2 text-sm outline-none resize-none"
                  />
                  <div className="flex flex-wrap justify-end gap-2">
                    <button onClick={() => { setEditingId(null); setEditText(""); }} className="takda-focus-visible rounded-xl px-3 py-1.5 text-sm font-semibold border border-[var(--takda-border)] transition-colors duration-150 hover:bg-slate-50" style={{ color: "var(--takda-text-muted-2)" }}>Cancel</button>
                    <button
                      onClick={() => { if (editText.trim()) { onEdit(n.id, editText.trim()); setEditingId(null); setEditText(""); } }}
                      disabled={!editText.trim()}
                      className="takda-focus-visible takda-interactive takda-cta-brand rounded-xl px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                    >Save Changes</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex-1 min-w-0 break-words">{n.body}</span>
                    <div className="flex shrink-0 gap-1">
                      <button onClick={() => { setEditingId(n.id); setEditText(n.body); }} disabled={readOnly} aria-label="Edit note" title="Edit note" className="takda-focus-visible p-2 -m-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors duration-150 disabled:opacity-40"><Edit2 size={14} /></button>
                      <button onClick={() => onDelete(n.id)} disabled={readOnly} aria-label="Delete note" title="Delete note" className="takda-focus-visible p-2 -m-1 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors duration-150 disabled:opacity-40"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  {n.subjectId && subjectMap[n.subjectId] && (
                    <div className="flex items-center gap-1 mt-1.5 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: subjectMap[n.subjectId].color }} />
                      <span className="text-[11px] truncate" style={{ color: "var(--takda-text-muted-2)" }}>{subjectMap[n.subjectId].name}</span>
                    </div>
                  )}
                </>
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

function AllActivities({ activities, query, setQuery, statusFilter, setStatusFilter, onToggle, onEdit, onDelete, onAdd, canCreate = true, readOnly = false }) {
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
        <button
          onClick={onAdd}
          aria-disabled={!canCreate}
          title={!canCreate ? "Switch to your active semester to add an activity." : undefined}
          className={`takda-focus-visible flex items-center gap-1.5 text-sm font-semibold text-white rounded-xl px-3 py-2 shrink-0 takda-interactive takda-cta-brand ${!canCreate ? "opacity-40" : ""}`}
        >
          <Plus size={15} /> Add Activity
        </button>
      </div>
      <p className="text-xs mb-4" style={{ color: "var(--takda-text-muted-2)" }}>
        {filterCounts.overdue} Overdue • {filterCounts.today} Today • {filterCounts.upcoming} Upcoming
      </p>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex-1 min-w-[160px] flex items-center gap-2 rounded-xl border border-[var(--takda-border)] bg-[var(--takda-bg-surface)] px-3 py-2 transition-colors duration-150 focus-within:border-[var(--takda-brand)]">
          <Search size={15} className="shrink-0" style={{ color: "var(--takda-text-muted-1)" }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search activities…" className="flex-1 min-w-0 outline-none text-sm bg-transparent" />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="takda-focus-visible shrink-0 p-1.5 -m-1.5 text-slate-300 hover:text-slate-500 transition-colors duration-150"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          aria-label="Sort activities"
          className="takda-focus-visible shrink-0 rounded-xl border border-[var(--takda-border)] bg-[var(--takda-bg-surface)] px-2.5 py-2 text-xs font-medium outline-none transition-colors duration-150 focus:border-[var(--takda-brand)]"
          style={{ color: "var(--takda-text-muted-3)" }}
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
            className="takda-focus-visible takda-interactive px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap"
            style={{
              background: statusFilter === s ? "var(--takda-brand)" : "var(--takda-bg-surface)",
              color: statusFilter === s ? "#fff" : "var(--takda-text-muted-3)",
              border: `1px solid ${statusFilter === s ? "var(--takda-brand)" : "var(--takda-border)"}`,
            }}
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
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-2xl bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] p-3 transition-shadow transition-colors duration-200 ease-out hover:shadow-sm hover:border-[var(--takda-border-neutral-2)] motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-px"
              style={{ boxShadow: "inset 0 1px 0 var(--takda-glass-highlight)" }}
            >
              <button
                onClick={() => onToggle(a)}
                disabled={readOnly}
                className="takda-focus-visible shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors duration-200 ease-out hover:border-emerald-400 disabled:opacity-40"
                style={{ borderColor: a.computedStatus === "completed" ? "var(--takda-status-week-dot)" : "var(--takda-border-neutral-2)", background: a.computedStatus === "completed" ? "var(--takda-status-week-dot)" : "transparent" }}
                aria-label={a.computedStatus === "completed" ? "Reopen task" : "Mark complete"}
              >
                <Check size={14} color="white" className={`transition-all duration-200 ease-out motion-reduce:transition-none ${a.computedStatus === "completed" ? "opacity-100 scale-100" : "opacity-0 scale-50"}`} />
              </button>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate transition-colors duration-200 ease-out ${a.computedStatus === "completed" ? "line-through" : ""}`} style={{ color: a.computedStatus === "completed" ? "var(--takda-text-muted-1)" : undefined }}>{a.title}</div>
                <div className="text-[11px] truncate mt-0.5" style={{ color: "var(--takda-text-muted-2)" }}>{a.subject?.name || "General"} · {a.type}</div>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className="text-[11px]" style={{ color: "var(--takda-text-muted-1)" }}>{fmtDate(a.deadline)}</span>
                  <PriorityTag priority={a.priority} />
                  <StatusBadge status={a.computedStatus} />
                </div>
              </div>
              <button onClick={() => onEdit(a)} disabled={readOnly} className="takda-focus-visible p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors duration-150 disabled:opacity-40" aria-label="Edit activity"><Edit2 size={13} /></button>
              <button onClick={() => onDelete(a.id)} disabled={readOnly} className="takda-focus-visible p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors duration-150 disabled:opacity-40" aria-label="Delete activity"><Trash2 size={13} /></button>
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
      <div
        className="mx-auto max-w-md rounded-2xl border border-[var(--takda-border)] bg-[var(--takda-bg-surface)] p-8 text-center shadow-sm"
        style={{ boxShadow: "inset 0 1px 0 var(--takda-glass-highlight), 0 1px 3px rgba(15,23,42,0.05)" }}
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--takda-bg-grade-locked-icon)" }}>
          <Lock size={20} className="text-amber-700" />
        </div>
        <span className="takda-pro-badge inline-flex rounded-full px-2 py-1 text-[10px] font-extrabold tracking-wide">
          <span aria-hidden="true">✦</span> PRO
        </span>
        <h2 className="font-display mt-4 text-xl font-semibold" style={{ color: "var(--takda-text-primary)" }}>Grade Tracker</h2>
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--takda-text-muted-2)" }}>
          Track your scores, percentages, and subject averages with Takda Pro.
        </p>
        <button
          type="button"
          onClick={(event) => onUpgrade(event.currentTarget)}
          className="takda-focus-visible takda-interactive takda-cta-brand mt-6 w-full rounded-xl py-3 text-sm font-bold text-white"
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

function GradesView({ grades, subjects, subjectMap, onSave, onDelete, canCreate = true, readOnly = false, onBlockedCreate }) {
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
    // onSave (TakdaApp's saveGrade) returns false if creation was aborted
    // (e.g. an unresolvable subjectId) — only close the modal on success,
    // so an aborted save doesn't silently discard the user's input.
    if (onSave(grade)) closeModal();
  }

  return (
    <div className="p-5 md:p-8">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-2xl font-semibold">My Grades</h1>
          <p className="text-sm mt-1" style={{ color: "var(--takda-text-muted-2)" }}>Track your recorded scores and subject performance.</p>
        </div>
        <button
          onClick={() => {
            if (subjects.length === 0) return;
            if (!canCreate) {
              onBlockedCreate?.();
              return;
            }
            setEditingGrade(null);
            setShowModal(true);
          }}
          disabled={subjects.length === 0}
          aria-disabled={subjects.length === 0 || !canCreate}
          title={!canCreate ? "Switch to your active semester to add a grade." : undefined}
          className={`takda-focus-visible takda-interactive takda-cta-brand flex items-center gap-1.5 text-sm font-semibold text-white rounded-xl px-3 py-2 disabled:opacity-40 shrink-0 disabled:hover:opacity-40 disabled:active:scale-100 ${!canCreate && subjects.length > 0 ? "opacity-40" : ""}`}
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
          <h2 className="text-xs font-bold uppercase tracking-wide mb-2.5" style={{ color: "var(--takda-text-muted-1)" }}>Academic Overview</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <div className="rounded-2xl bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] p-4" style={{ boxShadow: "inset 0 1px 0 var(--takda-glass-highlight)" }}>
              <div className="text-xs mb-1" style={{ color: "var(--takda-text-muted-2)" }}>Overall Recorded Average</div>
              <div className="font-display text-2xl font-semibold">{overallAverage === null ? "—" : `${overallAverage.toFixed(1)}%`}</div>
              {overallAverage !== null && (
                <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
                    style={{ width: `${clampPercent(overallAverage)}%`, background: "var(--takda-brand)" }}
                    role="progressbar"
                    aria-valuenow={Math.round(overallAverage)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Overall recorded average"
                  />
                </div>
              )}
              <div className="text-[11px] mt-1.5" style={{ color: "var(--takda-text-muted-1)" }}>Based on grades recorded in Takda</div>
            </div>
            <div className="rounded-2xl bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] p-4" style={{ boxShadow: "inset 0 1px 0 var(--takda-glass-highlight)" }}>
              <div className="text-xs mb-1" style={{ color: "var(--takda-text-muted-2)" }}>Subjects With Grades</div>
              <div className="font-display text-2xl font-semibold">{subjectsWithGrades.length}</div>
              <div className="text-[11px] mt-1.5" style={{ color: "var(--takda-text-muted-1)" }}>Out of {subjects.length} {subjects.length === 1 ? "subject" : "subjects"}</div>
            </div>
            <div className="rounded-2xl bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] p-4" style={{ boxShadow: "inset 0 1px 0 var(--takda-glass-highlight)" }}>
              <div className="text-xs mb-1" style={{ color: "var(--takda-text-muted-2)" }}>Total Grade Entries</div>
              <div className="font-display text-2xl font-semibold">{grades.length}</div>
              <div className="text-[11px] mt-1.5" style={{ color: "var(--takda-text-muted-1)" }}>Recorded across all subjects</div>
            </div>
          </div>

          <h2 className="text-xs font-bold uppercase tracking-wide mb-2.5" style={{ color: "var(--takda-text-muted-1)" }}>Academic Insights</h2>
          <div className="flex flex-col gap-2 mb-6">
            {insights.map((text, i) => (
              <div
                key={i}
                className="rounded-2xl bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] p-3 text-sm"
                style={{ color: "var(--takda-text-primary)", boxShadow: "inset 0 1px 0 var(--takda-glass-highlight)" }}
              >
                {text}
              </div>
            ))}
          </div>

          {subjectPerformance.length > 0 && (
            <>
              <h2 className="text-xs font-bold uppercase tracking-wide mb-2.5" style={{ color: "var(--takda-text-muted-1)" }}>Subject Performance</h2>
              <div className="flex flex-col gap-2 mb-6">
                {subjectPerformance.map(({ subject, count, average }) => (
                  <button
                    key={subject.id}
                    onClick={() => setSubjectFilter(subject.id)}
                    className="takda-focus-visible text-left rounded-2xl bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] p-3 transition-shadow transition-colors duration-200 ease-out hover:shadow-sm hover:border-[var(--takda-border-neutral-2)] motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-px"
                    style={{ boxShadow: "inset 0 1px 0 var(--takda-glass-highlight)" }}
                  >
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: subject.color || "var(--takda-text-muted-1)" }} />
                        <span className="text-sm font-medium truncate">{subject.name}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold">{average.toFixed(1)}%</div>
                        <div className="text-[10px]" style={{ color: "var(--takda-text-muted-1)" }}>{count} {count === 1 ? "entry" : "entries"}</div>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
                        style={{ width: `${clampPercent(average)}%`, background: subject.color || "var(--takda-text-muted-1)" }}
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
              className="takda-focus-visible rounded-xl border border-[var(--takda-border)] bg-[var(--takda-bg-surface)] px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-[var(--takda-brand)]"
            >
              <option value="all">All Subjects</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {subjectFilter !== "all" && (
              <button onClick={() => setSubjectFilter("all")} className="takda-focus-visible text-xs font-medium transition-colors duration-150 hover:underline -my-1.5 py-1.5 px-1" style={{ color: "var(--takda-brand)" }}>Clear filter</button>
            )}
          </div>

          {categorySummary.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {categorySummary.map(({ category, average, count }) => (
                <div key={category} className="rounded-xl border border-[var(--takda-border)] bg-[var(--takda-bg-surface)] px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--takda-text-muted-1)" }}>{category}</div>
                  <div className="text-sm font-semibold mt-0.5">{average.toFixed(1)}%</div>
                  <div className="text-[10px]" style={{ color: "var(--takda-text-muted-1)" }}>{count} {count === 1 ? "entry" : "entries"}</div>
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
                    className="flex items-center gap-3 rounded-2xl bg-[var(--takda-bg-surface)] border border-[var(--takda-border)] p-3 transition-shadow transition-colors duration-200 ease-out hover:shadow-sm hover:border-[var(--takda-border-neutral-2)] motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-px"
                    style={{ boxShadow: "inset 0 1px 0 var(--takda-glass-highlight)" }}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: subjectMap[g.subjectId]?.color || "var(--takda-text-muted-1)" }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{g.title}</div>
                      <div className="text-[11px] truncate mt-0.5" style={{ color: "var(--takda-text-muted-2)" }}>{subjectMap[g.subjectId]?.name || "Unknown Subject"} · {g.category}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold">{g.score}/{g.totalScore}</div>
                      <div className="text-[11px]" style={{ color: "var(--takda-text-muted-2)" }}>{percent.toFixed(1)}%</div>
                    </div>
                    <button onClick={() => openEdit(g)} disabled={readOnly} className="takda-focus-visible p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors duration-150 disabled:opacity-40" aria-label="Edit grade"><Edit2 size={13} /></button>
                    <button onClick={() => onDelete(g.id)} disabled={readOnly} className="takda-focus-visible p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors duration-150 disabled:opacity-40" aria-label="Delete grade"><Trash2 size={13} /></button>
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
        <select disabled={!!grade} className={`${inputCls} disabled:bg-slate-50 disabled:text-slate-400`} value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {grade && <p className="text-[11px] mt-1" style={{ color: "var(--takda-text-muted-1)" }}>Subject is fixed after creation.</p>}
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
        <div
          className={`rounded-xl px-3 py-2 text-xs mb-3 ${validNumbers ? "" : "bg-red-50 text-red-600"}`}
          style={validNumbers ? { background: "var(--takda-brand-tint-2)", color: "var(--takda-brand)" } : undefined}
        >
          {validNumbers ? `Percentage: ${preview.toFixed(1)}%` : "Score must be between 0 and the total score."}
        </div>
      )}
      <button
        disabled={!canSave}
        onClick={() => onSave({ ...form, title: form.title.trim(), score, totalScore: total })}
        className="takda-focus-visible takda-interactive takda-cta-brand w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-40 mt-2"
      >
        {grade ? "Save Changes" : "Add Grade"}
      </button>
    </ModalShell>
  );
}

/* ---------------- Modals ---------------- */
function ModalShell({ title, onClose, onOpenerCapture, children }) {
  const dialogRef = useRef(null);
  const panelRef = useRef(null);
  const openerRef = useRef(null);
  const openerCapturedRef = useRef(false);
  const focusLifecycleGenerationRef = useRef(0);

  useLayoutEffect(() => {
    function isAvailableElement(element) {
      if (!(element instanceof HTMLElement) || !element.isConnected || element.matches(":disabled")) return false;
      if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
      const style = window.getComputedStyle(element);
      return (
        !["none", "hidden", "collapse"].includes(style.visibility) &&
        style.display !== "none" &&
        element.getClientRects().length > 0
      );
    }

    function getTabbableElements(panel) {
      return Array.from(
        panel.querySelectorAll(
          "button, input:not([type='hidden']), select, textarea, a[href], area[href], [contenteditable='true'], audio[controls], video[controls], [tabindex]"
        )
      ).filter((element) => isAvailableElement(element) && element.tabIndex >= 0);
    }

    function isTopmostDialog(dialog) {
      const dialogs = Array.from(
        document.querySelectorAll('[role="dialog"][aria-modal="true"]')
      ).filter(isAvailableElement);
      return dialogs[dialogs.length - 1] === dialog;
    }

    function getTopmostDialog() {
      const dialogs = Array.from(
        document.querySelectorAll('[role="dialog"][aria-modal="true"]')
      ).filter(isAvailableElement);
      return dialogs[dialogs.length - 1] || null;
    }

    function isFocusableOpener(element) {
      if (!isAvailableElement(element)) return false;
      return (
        element.tabIndex >= 0 ||
        element.hasAttribute("tabindex") ||
        element.matches("button, input:not([type='hidden']), select, textarea, a[href], area[href], [contenteditable='true'], audio[controls], video[controls]")
      );
    }

    function handleDialogKeyDown(event) {
      if (
        event.key !== "Tab" ||
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) return;

      const panel = panelRef.current;
      if (!panel) return;

      const tabbableElements = getTabbableElements(panel);
      const first = tabbableElements[0];
      const last = tabbableElements[tabbableElements.length - 1];
      const activeElement = document.activeElement;
      if (!isTopmostDialog(dialogRef.current)) return;

      if (!first) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }

      if (!panel.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
        return;
      }

      if (activeElement === panel) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
        return;
      }

      const activeIndex = tabbableElements.indexOf(activeElement);
      if (activeIndex < 0) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      } else if (event.shiftKey && activeIndex === 0) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && activeIndex === tabbableElements.length - 1) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }

    function handleFocusIn(event) {
      const dialog = dialogRef.current;
      const panel = panelRef.current;
      if (!dialog || !panel || !isTopmostDialog(dialog) || panel.contains(event.target)) return;

      const firstTabbable = getTabbableElements(panel)[0];
      (firstTabbable || panel).focus({ preventScroll: true });
    }

    const dialog = dialogRef.current;
    ++focusLifecycleGenerationRef.current;
    if (!openerCapturedRef.current) {
      const opener = document.activeElement;
      openerRef.current = opener instanceof HTMLElement ? opener : null;
      openerCapturedRef.current = true;
      onOpenerCapture?.(openerRef.current);
    }
    const panel = panelRef.current;
    if (isTopmostDialog(dialog)) {
      const firstTabbable = panel ? getTabbableElements(panel)[0] : null;
      (firstTabbable || panel)?.focus({ preventScroll: true });
    }
    document.addEventListener("keydown", handleDialogKeyDown);
    document.addEventListener("focusin", handleFocusIn);

    return () => {
      document.removeEventListener("keydown", handleDialogKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
      const cleanupGeneration = ++focusLifecycleGenerationRef.current;
      queueMicrotask(() => {
        if (focusLifecycleGenerationRef.current !== cleanupGeneration) return;

        const savedOpener = openerRef.current;
        const topmostDialog = getTopmostDialog();
        const openerBelongsToTopmost = topmostDialog?.contains(savedOpener);
        if ((!topmostDialog || openerBelongsToTopmost) && isFocusableOpener(savedOpener)) {
          savedOpener.focus({ preventScroll: true });
        }

        if (focusLifecycleGenerationRef.current === cleanupGeneration) {
          openerRef.current = null;
          openerCapturedRef.current = false;
        }
      });
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]'))
        .filter((element) => {
          if (!(element instanceof HTMLElement) || !element.isConnected) return false;
          if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
          const style = window.getComputedStyle(element);
          return style.display !== "none" &&
            !["none", "hidden", "collapse"].includes(style.visibility) &&
            element.getClientRects().length > 0;
        });
      if (dialogs[dialogs.length - 1] !== dialogRef.current) return;
      e.preventDefault();
      onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Phase 09C.8A: Balanced Premium surface for every modal built on
  // ModalShell (Reminders/Semester Manager/Material Link/Material
  // Upload/Grade/Subject/Activity). No backdrop-filter here — the panel
  // is fully opaque, so per this batch's performance rule a blur would
  // be wasted; the "glass-inspired" look instead comes from the same
  // plain inset-highlight technique already used elsewhere in this
  // redesign. None of the focus-trap/escape/backdrop-click logic above
  // this return statement was touched.
  return (
    <div
      className="absolute inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-0 md:p-4"
      onClick={onClose}
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="bg-[var(--takda-bg-surface)] w-full md:max-w-md rounded-t-2xl md:rounded-2xl max-h-[88vh] overflow-y-auto"
        style={{ boxShadow: "inset 0 1px 0 var(--takda-glass-highlight), 0 12px 28px -8px rgba(15,23,42,0.18)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--takda-border)] sticky top-0 bg-[var(--takda-bg-surface)]">
          <h3 className="font-display text-lg font-semibold" style={{ color: "var(--takda-text-heading)" }}>{title}</h3>
          <button onClick={onClose} aria-label="Close" className="takda-focus-visible p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors duration-150"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5 mb-3.5">
      <span className="text-xs font-medium" style={{ color: "var(--takda-text-muted-2)" }}>{label}</span>
      {children}
    </label>
  );
}
const inputCls = "rounded-xl border border-[var(--takda-border)] bg-[var(--takda-bg-surface)] px-3 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-[var(--takda-brand)]";

// Phase 9D Stage 9D-3: Class Schedule UI helpers. Legacy subjects.schedule
// and subjects.room (the free-text fields above) are never read, written,
// or converted by any of this — they stay exactly as the student left them.
// Display order is Mon..Sun; the stored dayOfWeek value stays the existing
// DB convention (Date.getDay(): Sunday = 0 .. Saturday = 6).
const SCHEDULE_WEEKDAYS = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
  { label: "Sun", value: 0 },
];
const SCHEDULE_WEEKDAY_ORDER = SCHEDULE_WEEKDAYS.map((d) => d.value);

const REMINDER_OPTIONS = [
  { label: "At class time", value: 0 },
  { label: "5 minutes before", value: 5 },
  { label: "15 minutes before", value: 15 },
  { label: "30 minutes before", value: 30 },
  { label: "1 hour before", value: 60 },
];

function sortDays(days) {
  return [...days].sort((a, b) => SCHEDULE_WEEKDAY_ORDER.indexOf(a) - SCHEDULE_WEEKDAY_ORDER.indexOf(b));
}

function newScheduleGroup() {
  return {
    localId: uid(),
    days: [],
    startTime: "08:00",
    endTime: "09:00",
    location: "",
    reminderMinutes: 15,
    notificationsEnabled: true,
    rowIdByDay: {},
  };
}

// Groups existing subject_schedules rows for ONE subject back into UI
// groups, purely for editing convenience. Rows only merge into the same
// group when startTime, endTime, location, reminderMinutes, and
// notificationsEnabled are all identical — anything else stays its own
// group, so logically different schedules never get merged into one.
function groupSchedulesForForm(schedules) {
  const groups = [];
  const byKey = new Map();
  schedules.forEach((row) => {
    const key = [row.startTime, row.endTime, row.location || "", row.reminderMinutes, row.notificationsEnabled].join("|");
    let group = byKey.get(key);
    if (!group) {
      group = {
        localId: uid(),
        days: [],
        startTime: row.startTime,
        endTime: row.endTime,
        location: row.location || "",
        reminderMinutes: row.reminderMinutes,
        notificationsEnabled: row.notificationsEnabled,
        rowIdByDay: {},
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.days.push(row.dayOfWeek);
    group.rowIdByDay[row.dayOfWeek] = row.id;
  });
  groups.forEach((g) => { g.days = sortDays(g.days); });
  return groups;
}

// Re-expands UI groups into one subject_schedules row per selected weekday.
// A day that already had a row in this group keeps its original id (an
// upsert/update); a newly selected day gets a fresh id (an insert). A day
// dropped from every group simply has no row here, so the storage adapter's
// deleteRemovedRows sync deletes it.
function normalizeGroupsToRows(groups, subjectId) {
  const rows = [];
  groups.forEach((group) => {
    group.days.forEach((day) => {
      rows.push({
        id: group.rowIdByDay?.[day] || uid(),
        subjectId,
        dayOfWeek: day,
        startTime: group.startTime,
        endTime: group.endTime,
        location: (group.location || "").trim(),
        reminderMinutes: group.reminderMinutes,
        notificationsEnabled: group.notificationsEnabled,
      });
    });
  });
  return rows;
}

function isScheduleGroupValid(group) {
  return group.days.length > 0 && !!group.startTime && !!group.endTime && group.startTime < group.endTime;
}

/* ---------------- Phase 9D Stage 9D-4A: Class Schedule display ----------------
   Pure, view-only helpers over the existing structured subjectSchedules rows
   from Stage 9D-3. None of this reads or writes legacy subjects.schedule /
   subjects.room, and none of it mutates the persisted subjectSchedules array
   — every function here takes rows in and returns new derived data out. */

const SCHEDULE_WEEKDAY_LABEL = Object.fromEntries(SCHEDULE_WEEKDAYS.map((d) => [d.value, d.label]));
const SCHEDULE_WEEKDAY_FULL_LABEL = {
  0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday",
};

// "HH:mm" (24-hour, as produced by <input type="time">) -> "8:00 AM".
function formatScheduleTime(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}
function formatScheduleTimeRange(startTime, endTime) {
  return `${formatScheduleTime(startTime)} – ${formatScheduleTime(endTime)}`;
}
function formatScheduleDays(days) {
  return days.map((d) => SCHEDULE_WEEKDAY_LABEL[d]).join(", ");
}

// Groups one subject's schedule rows into compact display lines — rows
// sharing the same startTime/endTime/location collapse into one line
// listing every matching day (Mon..Sun order), the same grouping rule the
// Add/Edit Subject editor uses (groupSchedulesForForm above), minus the
// reminder/notification keys, which don't affect what's shown here.
function groupSchedulesForDisplay(schedules) {
  const byKey = new Map();
  schedules.forEach((row) => {
    const key = `${row.startTime}|${row.endTime}|${row.location || ""}`;
    let group = byKey.get(key);
    if (!group) {
      group = { days: [], startTime: row.startTime, endTime: row.endTime, location: row.location || "" };
      byKey.set(key, group);
    }
    group.days.push(row.dayOfWeek);
  });
  return Array.from(byKey.values())
    .map((g) => ({ ...g, days: sortDays(g.days) }))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

// Finds the single "Next Class" (Stage 9D-4A definition) from already
// semester-scoped schedule rows: the earliest later-today class if one
// exists (startTime strictly after the current local time — an
// already-started class never counts), otherwise the earliest class on the
// next day that has one, searching at most 7 calendar days forward and
// wrapping the week (Saturday -> Sunday -> Monday) via modulo 7. Purely
// derived from the rows/map passed in; creates no schedule rows.
function findNextClass(schedules, subjectMap, now = new Date()) {
  if (schedules.length === 0) return null;
  const todayDow = now.getDay();
  const nowHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  for (let offset = 0; offset < 7; offset++) {
    const dow = (todayDow + offset) % 7;
    const candidates = schedules
      .filter((row) => row.dayOfWeek === dow && (offset > 0 || row.startTime > nowHHMM))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (candidates.length > 0) {
      return { ...candidates[0], subject: subjectMap[candidates[0].subjectId], dayOffset: offset };
    }
  }
  return null;
}

// Compact "Mon, Wed • 8:00 AM – 9:30 AM • Room 203" schedule lines for a
// Subject card or the Subject Detail header. Renders nothing when the
// subject has zero structured schedules — never a placeholder.
function SubjectScheduleSummary({ schedules }) {
  if (!schedules || schedules.length === 0) return null;
  const groups = groupSchedulesForDisplay(schedules);
  return (
    <div className="flex flex-col gap-0.5">
      {groups.map((g, i) => (
        <div key={i} className="flex items-center gap-1 text-xs text-slate-500 min-w-0">
          <Clock size={12} className="shrink-0" />
          <span className="truncate">
            {formatScheduleDays(g.days)} • {formatScheduleTimeRange(g.startTime, g.endTime)}
            {g.location && ` • ${g.location}`}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Phase 9D Stage 9D-5: Class Reminder Engine ----------------
   Foreground-only (Stage 9B infrastructure — not Web Push): while Takda is
   open, periodically checks already-eligible weekly class occurrences
   against local wall-clock time and fires a device notification through
   the exact same showDeviceNotification/hasNotifiedFor/markNotifiedFor
   primitives the Activity reminder effect already uses. Every function
   here is pure/derived — nothing creates or persists an occurrence row,
   mirroring the same rule classOccurrencesForDate above already follows. */

const CLASS_REMINDER_CHECK_INTERVAL_MS = 30000;

// Composes ONE specific wall-clock moment on `date` from an "HH:mm" string
// using the local Date(y, m, d, h, mi) constructor — the exact same safe
// pattern Calendar's `cells` and parseLocalDate already use elsewhere in
// this file. Never parses an ISO string, so this can never UTC-shift to
// the wrong calendar day.
function buildLocalDateTime(date, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0, 0);
}

// "class|" prefix keeps this namespace-distinct from the Activity dedup
// key format (`${activity.id}|${urgencyKey}|${deadline}|${todayKey}`, no
// prefix) — the two can never collide. scheduleId distinguishes multiple
// time-slots for the same subject on the same day; the local occurrence
// date lets the exact same weekly schedule notify again next week;
// reminderMinutes means changing that setting is treated as a fresh
// reminder going forward.
function classReminderDedupKey(scheduleId, occurrenceDate, reminderMinutes) {
  return `class|${scheduleId}|${formatLocalDate(occurrenceDate)}|${reminderMinutes}`;
}

const CLASS_REMINDER_MINUTES_LABEL = { 5: "5 minutes", 15: "15 minutes", 30: "30 minutes", 60: "1 hour" };

function classReminderTitle(subjectName, reminderMinutes) {
  const name = subjectName || "Untitled Subject";
  if (reminderMinutes === 0) return `${name} is starting now`;
  return `${name} starts in ${CLASS_REMINDER_MINUTES_LABEL[reminderMinutes] || `${reminderMinutes} minutes`}`;
}

// Never renders "• undefined"/"• null"/a bare trailing separator — the
// same blank-location omission already used by SubjectScheduleSummary and
// the Dashboard/Calendar class cards above.
function classReminderBody(startTime, location) {
  const time = formatScheduleTime(startTime);
  return location ? `${time} • ${location}` : time;
}

// Scans `schedules` (already scoped by the caller to the active semester's
// eligible subjects — see currentSemesterSchedules) for TODAY's occurrences
// whose reminder target has arrived. Grace window: eligible any time from
// the target minute up until the class's own endTime — never resurfaces a
// reminder for a class that has already finished, and never fires before
// its target minute. Purely derived; fires nothing itself.
function getDueClassReminders(now, schedules, subjectMap, semester) {
  const today = startOfDay(now);
  if (!isDateWithinSemesterRange(today, semester)) return [];
  const todayDow = now.getDay();

  return schedules
    .filter((row) => row.notificationsEnabled && row.dayOfWeek === todayDow)
    .map((row) => {
      const classStart = buildLocalDateTime(today, row.startTime);
      const classEnd = buildLocalDateTime(today, row.endTime);
      const target = new Date(classStart.getTime() - row.reminderMinutes * 60000);
      return { row, subject: subjectMap[row.subjectId], classStart, classEnd, target };
    })
    .filter(({ target, classEnd }) => now >= target && now < classEnd);
}

function ScheduleGroupCard({ index, group, onChange, onToggleDay, onRemove }) {
  const noDays = group.days.length === 0;
  const invalidRange = !!group.startTime && !!group.endTime && group.startTime >= group.endTime;

  return (
    <div className="rounded-2xl border border-[var(--takda-border)] p-3" style={{ boxShadow: "inset 0 1px 0 var(--takda-glass-highlight)" }}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs font-semibold" style={{ color: "var(--takda-text-muted-2)" }}>Schedule Group {index + 1}</span>
        <button type="button" onClick={onRemove} aria-label="Remove schedule" className="takda-focus-visible p-1.5 -m-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors duration-150">
          <Trash2 size={13} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {SCHEDULE_WEEKDAYS.map((day) => {
          const active = group.days.includes(day.value);
          return (
            <button
              key={day.value}
              type="button"
              onClick={() => onToggleDay(day.value)}
              aria-pressed={active}
              className={`takda-focus-visible takda-interactive px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${active ? "text-white border-transparent" : "border-[var(--takda-border)] bg-[var(--takda-bg-surface)]"}`}
              style={active ? { background: "var(--takda-brand)" } : { color: "var(--takda-text-muted-2)" }}
            >
              {day.label}
            </button>
          );
        })}
      </div>
      {noDays && <p className="text-[11px] text-red-500 mb-2.5">Select at least one day.</p>}

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Start Time">
          <input type="time" className={inputCls} value={group.startTime} onChange={(e) => onChange({ startTime: e.target.value })} />
        </Field>
        <Field label="End Time">
          <input type="time" className={inputCls} value={group.endTime} onChange={(e) => onChange({ endTime: e.target.value })} />
        </Field>
      </div>
      {invalidRange && <p className="text-[11px] text-red-500 -mt-2 mb-2.5">End time must be after start time.</p>}

      <Field label="Location / Room (optional)">
        <input className={inputCls} value={group.location} onChange={(e) => onChange({ location: e.target.value })} placeholder="e.g. Room 203" />
      </Field>

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Reminder">
          <select className={inputCls} value={group.reminderMinutes} onChange={(e) => onChange({ reminderMinutes: Number(e.target.value) })}>
            {REMINDER_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </Field>
        <label className="flex items-center gap-2 mt-5 text-xs font-medium select-none" style={{ color: "var(--takda-text-muted-3)" }}>
          <input
            type="checkbox"
            checked={group.notificationsEnabled}
            onChange={(e) => onChange({ notificationsEnabled: e.target.checked })}
            className="takda-focus-visible w-4 h-4 rounded border-[var(--takda-border)] accent-[var(--takda-brand)]"
          />
          Class notification
        </label>
      </div>
    </div>
  );
}

function SubjectModal({ subject, schedules = [], onClose, onSave, onOpenerCapture }) {
  const [form, setForm] = useState(subject || { name: "", teacher: "", schedule: "", room: "", color: COLORS[0] });
  const [groups, setGroups] = useState(() => groupSchedulesForForm(schedules));

  function updateGroup(localId, patch) {
    setGroups((prev) => prev.map((g) => (g.localId === localId ? { ...g, ...patch } : g)));
  }

  function toggleGroupDay(localId, day) {
    setGroups((prev) => prev.map((g) => {
      if (g.localId !== localId) return g;
      const days = g.days.includes(day) ? g.days.filter((d) => d !== day) : sortDays([...g.days, day]);
      return { ...g, days };
    }));
  }

  function removeGroup(localId) {
    setGroups((prev) => prev.filter((g) => g.localId !== localId));
  }

  const hasInvalidGroup = groups.some((g) => !isScheduleGroupValid(g));

  return (
    <ModalShell title={subject ? "Edit Subject" : "Add Subject"} onClose={onClose} onOpenerCapture={onOpenerCapture}>
      <Field label="Subject Name *">
        <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Mathematics" />
      </Field>
      <Field label="Teacher / Professor">
        <input className={inputCls} value={form.teacher} onChange={(e) => setForm({ ...form, teacher: e.target.value })} placeholder="e.g. Mr. Santos" />
      </Field>
      {/* Legacy free-text Schedule/Room inputs removed from UI (Phase 9D
          Stage 9D-3 amendment) — the structured Class Schedule below fully
          replaces them. form.schedule/form.room stay in state (seeded from
          the existing subject) and are still passed through unchanged in
          onSave below, so existing legacy values are preserved, not erased. */}
      <Field label="Color">
        <div className="flex gap-2 flex-wrap">
          {COLORS.map((c) => {
            const colorName = {
              "#3D2FE0": "Purple",
              "#FF5A5F": "Coral",
              "#16A34A": "Green",
              "#F59E0B": "Amber",
              "#0EA5A4": "Teal",
              "#DB2777": "Pink",
              "#7C3AED": "Violet",
              "#2563EB": "Blue",
            }[c];
            return (
              <button
                key={c}
                onClick={() => setForm({ ...form, color: c })}
                aria-label={`Select ${colorName} subject color`}
                aria-pressed={form.color === c}
                className="takda-focus-visible w-7 h-7 rounded-full"
                style={{ background: c, outline: form.color === c ? "2px solid var(--takda-text-primary)" : "none", outlineOffset: 2 }}
              />
            );
          })}
        </div>
      </Field>

      <div className="mt-1 mb-3.5 border-t border-[var(--takda-border)] pt-3.5">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-sm font-semibold" style={{ color: "var(--takda-text-primary)" }}>Class Schedule</span>
          <button
            type="button"
            onClick={() => setGroups((prev) => [...prev, newScheduleGroup()])}
            className="takda-focus-visible flex items-center gap-1 text-xs font-semibold"
            style={{ color: "var(--takda-brand)" }}
          >
            <Plus size={13} /> Add Schedule
          </button>
        </div>

        {groups.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--takda-text-muted-1)" }}>No class times added yet. Optional — add one to get reminders before class.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map((group, idx) => (
              <ScheduleGroupCard
                key={group.localId}
                index={idx}
                group={group}
                onChange={(patch) => updateGroup(group.localId, patch)}
                onToggleDay={(day) => toggleGroupDay(group.localId, day)}
                onRemove={() => removeGroup(group.localId)}
              />
            ))}
          </div>
        )}
      </div>

      <button
        disabled={!form.name.trim() || hasInvalidGroup}
        onClick={() => onSave(
          { ...form, name: form.name.trim(), teacher: form.teacher.trim(), room: form.room.trim() },
          groups
        )}
        className="takda-focus-visible takda-interactive takda-cta-brand w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-40 mt-2"
      >
        Save Subject
      </button>
    </ModalShell>
  );
}

function ActivityModal({ activity, subjects, creatableSubjects, defaultSubjectId, defaultDeadline, onClose, onSave, onOpenerCapture }) {
  // Semester hotfix: editing always shows the activity's own existing
  // subject relationship (even a legacy/cross-semester one — the dropdown
  // is disabled for edits regardless, per "Subject is fixed after
  // creation" below). Creating only ever offers subjects that already
  // belong to the semester the new activity is allowed to join, so a
  // legacy/Unassigned or other-semester subject can never be picked.
  const subjectOptions = activity ? subjects : (creatableSubjects || []);
  const [form, setForm] = useState(
    activity || {
      title: "",
      subjectId:
        (defaultSubjectId && subjectOptions.some((s) => s.id === defaultSubjectId) ? defaultSubjectId : "") ||
        (subjectOptions[0] && subjectOptions[0].id) ||
        "",
      type: "Assignment",
      description: "",
      deadline: defaultDeadline || formatLocalDate(new Date()),
      priority: "Medium",
      status: "pending",
      notes: "",
      // Phase 9C Stage 9C-4A: create-mode-only recurrence inputs. "" means
      // "Does not repeat" — repeatUntil is only ever read/required once a
      // real rule is selected below.
      recurrenceRule: "",
      repeatUntil: "",
    }
  );
  // Repeat/Repeat-until are create-mode only — editing an existing
  // occurrence never exposes or changes them (see saveActivity).
  const isRecurring = !activity && !!form.recurrenceRule;
  const repeatUntilInvalid =
    isRecurring && (!form.repeatUntil || parseLocalDate(form.repeatUntil) < parseLocalDate(form.deadline));
  return (
    <ModalShell title={activity ? "Edit Activity" : "Add Activity"} onClose={onClose} onOpenerCapture={onOpenerCapture}>
      <Field label="Title *">
        <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Problem Set #3" />
      </Field>
      <Field label="Subject">
        <select disabled={!!activity} className={`${inputCls} disabled:bg-slate-50 disabled:text-slate-400`} value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
          <option value="">General</option>
          {subjectOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {activity && <p className="text-[11px] mt-1" style={{ color: "var(--takda-text-muted-1)" }}>Subject is fixed after creation.</p>}
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
      {!activity && (
        <Field label="Repeat">
          <select
            className={inputCls}
            value={form.recurrenceRule}
            onChange={(e) => setForm({ ...form, recurrenceRule: e.target.value, repeatUntil: e.target.value ? form.repeatUntil : "" })}
          >
            {REPEAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      )}
      {isRecurring && (
        <Field label="Repeat until *">
          <input type="date" className={inputCls} value={form.repeatUntil} onChange={(e) => setForm({ ...form, repeatUntil: e.target.value })} />
          {form.repeatUntil && repeatUntilInvalid && (
            <p className="text-[11px] mt-1" style={{ color: "var(--takda-status-overdue-text)" }}>Repeat until must be on or after the deadline.</p>
          )}
        </Field>
      )}
      <Field label="Description">
        <textarea className={inputCls} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional details…" />
      </Field>
      <button
        disabled={!form.title.trim() || !form.deadline || repeatUntilInvalid}
        onClick={() => onSave({ ...form, title: form.title.trim(), description: form.description.trim() })}
        className="takda-focus-visible takda-interactive takda-cta-brand w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-40 mt-2"
      >
        Save Activity
      </button>
    </ModalShell>
  );
}
