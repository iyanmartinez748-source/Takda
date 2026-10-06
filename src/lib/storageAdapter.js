import { supabase } from "./supabase";
import { normalizeExternalUrl } from "./materialLinks";
import { toSubjectMaterial } from "./subjectMaterials";
import {
  validateMaterialUploadFile,
  getMaterialUploadExtension,
} from "./materialUploads";

let hydratedUserId = null;

// Makes sure database saves happen ONE AT A TIME.
let saveQueue = Promise.resolve();

async function getUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  return user;
}

// Semester writes must always fail loudly when nobody is signed in,
// unlike getUser()'s callers elsewhere in this file (get()/performSave())
// which treat "no user" as a normal not-logged-in-yet state.
async function requireUser() {
  const user = await getUser();

  if (!user) {
    throw new Error("Takda: an authenticated user is required for this operation.");
  }

  return user;
}

function toSubject(row) {
  return {
    id: row.id,
    name: row.name,
    teacher: row.teacher || "",
    schedule: row.schedule || "",
    room: row.room || "",
    color: row.color || "#3D2FE0",
    semesterId: row.semester_id ?? null,
  };
}

function toActivity(row) {
  return {
    id: row.id,
    subjectId: row.subject_id || "",
    title: row.title,
    type: row.type || "Assignment",
    description: row.description || "",
    deadline: row.deadline,
    priority: row.priority || "Medium",
    status: row.status || "pending",
    completedAt: row.completed_at || null,
    notes: "",
    semesterId: row.semester_id ?? null,
    // Phase 9C Stage 9C-2: dormant recurrence metadata. Always null for
    // every activity created before this stage, and for any activity
    // created through the current (non-recurring) UI.
    recurrenceSeriesId: row.recurrence_series_id ?? null,
    recurrenceRule: row.recurrence_rule ?? null,
  };
}

function toNote(row) {
  return {
    id: row.id,
    subjectId: row.subject_id || null,
    body: row.body,
    updatedAt: row.updated_at,
    semesterId: row.semester_id ?? null,
  };
}

function toGrade(row) {
  return {
    id: row.id,
    subjectId: row.subject_id || "",
    title: row.title,
    category: row.category || "Quiz",
    score: Number(row.score) || 0,
    totalScore: Number(row.total_score) || 100,
    semesterId: row.semester_id ?? null,
  };
}

// Phase 9D Stage 9D-2: subject class schedule foundation. Pure DB->frontend
// mapping only — no UI reads this yet. One row = one weekday's recurring
// class session for a subject (see supabase/migrations for the schema).
function toSubjectSchedule(row) {
  return {
    id: row.id,
    subjectId: row.subject_id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    location: row.location || "",
    reminderMinutes: row.reminder_minutes,
    notificationsEnabled: row.notifications_enabled,
  };
}

function toSemester(row) {
  return {
    id: row.id,
    name: row.name,
    schoolYear: row.school_year || "",
    startDate: row.start_date || null,
    endDate: row.end_date || null,
    isActive: row.is_active || false,
    archivedAt: row.archived_at || null,
    createdAt: row.created_at,
  };
}

// A function declared RETURNS public.semesters typically comes back from
// supabase-js as a single object, not an array — but this normalizes
// either shape defensively rather than assuming one.
function normalizeRpcSemesterRow(data) {
  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    throw new Error("Takda: expected a semester row back from the database but received none.");
  }

  return row;
}

async function deleteRemovedRows(table, userId, desiredIds) {
  const { data: existingRows, error: fetchError } = await supabase
    .from(table)
    .select("id")
    .eq("user_id", userId);

  if (fetchError) {
    console.error(`Takda: unable to read ${table} before delete sync`, fetchError);
    throw fetchError;
  }

  const desiredSet = new Set(desiredIds);

  const idsToDelete = (existingRows || [])
    .map((row) => row.id)
    .filter((id) => !desiredSet.has(id));

  if (idsToDelete.length === 0) return;

  const { error: deleteError } = await supabase
    .from(table)
    .delete()
    .eq("user_id", userId)
    .in("id", idsToDelete);

  if (deleteError) {
    console.error(`Takda: unable to delete removed ${table}`, deleteError);
    throw deleteError;
  }
}

async function performSave(value) {
  const user = await getUser();

  if (!user) {
    console.warn("Takda: save skipped because there is no authenticated user.");
    return false;
  }

  if (hydratedUserId !== user.id) {
    console.warn(
      "Takda prevented a database save before initial data finished loading."
    );
    return false;
  }

  const parsed = JSON.parse(value);

  const subjects = parsed.subjects || [];
  const activities = parsed.activities || [];
  const notes = parsed.notes || [];
  const grades = parsed.grades || [];
  // Phase 9D Stage 9D-2: storage support only — App.jsx does not yet set
  // parsed.subjectSchedules, so this is always [] until a later stage
  // wires up the UI/state for it.
  const subjectSchedules = parsed.subjectSchedules || [];

  const subjectRows = subjects.map((s) => ({
    id: s.id,
    user_id: user.id,
    name: s.name,
    teacher: s.teacher || null,
    schedule: s.schedule || null,
    room: s.room || null,
    color: s.color || "#3D2FE0",
    semester_id: s.semesterId ?? null,
  }));

  const activityRows = activities.map((a) => ({
    id: a.id,
    user_id: user.id,
    subject_id: a.subjectId || null,
    title: a.title,
    type: a.type || "Assignment",
    description: a.description || null,
    deadline: a.deadline,
    priority: a.priority || "Medium",
    status: a.status || "pending",
    completed_at: a.completedAt || null,
    semester_id: a.semesterId ?? null,
    // Phase 9C Stage 9C-2: dormant recurrence metadata. Recurrence
    // generation does not exist yet, so every activity created through
    // the current UI has no recurrenceSeriesId/recurrenceRule and both
    // persist as null here, same as any other activity.
    recurrence_series_id: a.recurrenceSeriesId ?? null,
    recurrence_rule: a.recurrenceRule ?? null,
  }));

  const noteRows = notes.map((n) => ({
    id: n.id,
    user_id: user.id,
    subject_id: n.subjectId || null,
    body: n.body,
    updated_at: n.updatedAt || new Date().toISOString(),
    semester_id: n.semesterId ?? null,
  }));

  const gradeRows = grades.map((g) => ({
    id: g.id,
    user_id: user.id,
    subject_id: g.subjectId,
    title: g.title,
    category: g.category || "Quiz",
    score: Number(g.score) || 0,
    total_score: Number(g.totalScore) || 100,
    semester_id: g.semesterId ?? null,
  }));

  // Phase 9D Stage 9D-2: storage support only. No semester_id here —
  // a schedule's semester context is always inherited transitively
  // through its subject, never stored redundantly on the schedule row.
  const subjectScheduleRows = subjectSchedules.map((sch) => ({
    id: sch.id,
    user_id: user.id,
    subject_id: sch.subjectId,
    day_of_week: sch.dayOfWeek,
    start_time: sch.startTime,
    end_time: sch.endTime,
    location: sch.location || null,
    reminder_minutes: sch.reminderMinutes ?? 15,
    notifications_enabled: sch.notificationsEnabled ?? true,
  }));

  // -------------------------
  // UPSERT CURRENT DATA
  // -------------------------

  if (subjectRows.length > 0) {
    const { error } = await supabase
      .from("subjects")
      .upsert(subjectRows, { onConflict: "id" });

    if (error) {
      console.error("Takda SUBJECT save error:", error);
      throw error;
    }
  }

  if (activityRows.length > 0) {
    const { error } = await supabase
      .from("activities")
      .upsert(activityRows, { onConflict: "id" });

    if (error) {
      console.error("Takda ACTIVITY save error:", error);
      throw error;
    }
  }

  if (noteRows.length > 0) {
    const { error } = await supabase
      .from("notes")
      .upsert(noteRows, { onConflict: "id" });

    if (error) {
      console.error("Takda NOTE save error:", error);
      throw error;
    }
  }

  if (gradeRows.length > 0) {
    const { error } = await supabase
      .from("grades")
      .upsert(gradeRows, { onConflict: "id" });

    if (error) {
      console.error("Takda GRADE save error:", error);
      throw error;
    }

    console.log(`Takda: saved ${gradeRows.length} grade(s).`);
  }

  if (subjectScheduleRows.length > 0) {
    const { error } = await supabase
      .from("subject_schedules")
      .upsert(subjectScheduleRows, { onConflict: "id" });

    if (error) {
      console.error("Takda SUBJECT SCHEDULE save error:", error);
      throw error;
    }
  }

  // -------------------------
  // DELETE REMOVED DATA
  // -------------------------
  // Child records first.
  // Subjects last because the other tables reference subjects.

  await deleteRemovedRows(
    "activities",
    user.id,
    activities.map((a) => a.id)
  );

  await deleteRemovedRows(
    "notes",
    user.id,
    notes.map((n) => n.id)
  );

  await deleteRemovedRows(
    "grades",
    user.id,
    grades.map((g) => g.id)
  );

  await deleteRemovedRows(
    "subject_schedules",
    user.id,
    subjectSchedules.map((sch) => sch.id)
  );

  await deleteRemovedRows(
    "subjects",
    user.id,
    subjects.map((s) => s.id)
  );

  return true;
}

// -------------------------
// DEDICATED SEMESTER WRITE METHODS
// -------------------------
// Deliberately separate from get()/set()/performSave(): semesters are
// never part of the generic subjects/activities/notes/grades snapshot
// sync, so there is no deleteRemovedRows("semesters", ...) and no way
// for a semester to be removed just because it's absent from some
// array. Activation and archiving are never raw UPDATEs — they call
// the Stage 4A database functions, which own that logic atomically.

export async function createSemester({ name, schoolYear, startDate, endDate } = {}) {
  const user = await requireUser();

  const trimmedName = (name || "").trim();

  if (!trimmedName) {
    throw new Error("Takda: a semester name is required.");
  }

  const { data, error } = await supabase
    .from("semesters")
    .insert({
      user_id: user.id,
      name: trimmedName,
      school_year: schoolYear || null,
      start_date: startDate || null,
      end_date: endDate || null,
    })
    .select()
    .single();

  if (error) {
    console.error("Takda SEMESTER create error:", error);
    throw error;
  }

  return toSemester(data);
}

export async function updateSemesterMetadata(semesterId, { name, schoolYear, startDate, endDate } = {}) {
  await requireUser();

  if (!semesterId) {
    throw new Error("Takda: a semesterId is required to update semester metadata.");
  }

  const trimmedName = (name || "").trim();

  if (!trimmedName) {
    throw new Error("Takda: a semester name is required.");
  }

  const { data, error } = await supabase.rpc("update_semester_metadata", {
    p_semester_id: semesterId,
    p_name: trimmedName,
    p_school_year: schoolYear || null,
    p_start_date: startDate || null,
    p_end_date: endDate || null,
  });

  if (error) {
    console.error("Takda SEMESTER metadata update error:", error);
    throw error;
  }

  return toSemester(normalizeRpcSemesterRow(data));
}

export async function activateSemester(semesterId) {
  await requireUser();

  if (!semesterId) {
    throw new Error("Takda: a semesterId is required to activate a semester.");
  }

  const { data, error } = await supabase.rpc("activate_semester", {
    p_semester_id: semesterId,
  });

  if (error) {
    console.error("Takda SEMESTER activate error:", error);
    throw error;
  }

  return toSemester(normalizeRpcSemesterRow(data));
}

export async function archiveSemester(semesterId) {
  await requireUser();

  if (!semesterId) {
    throw new Error("Takda: a semesterId is required to archive a semester.");
  }

  const { data, error } = await supabase.rpc("archive_semester", {
    p_semester_id: semesterId,
  });

  if (error) {
    console.error("Takda SEMESTER archive error:", error);
    throw error;
  }

  return toSemester(normalizeRpcSemesterRow(data));
}

// -------------------------
// DEDICATED SUBJECT MATERIAL (LINK) WRITE METHODS
// -------------------------
// Hybrid Lesson Materials #2: deliberately separate from get()/set()/
// performSave(), same reasoning as the semester write methods above —
// subject_materials is never part of the generic subjects/activities/
// notes/grades snapshot sync, so there is no deleteRemovedRows(
// "subject_materials", ...) and no way for a material to be removed
// just because it's absent from some array. This stage only
// implements material_type = 'link' behavior; 'upload' rows are a
// later stage.

export async function loadSubjectMaterials() {
  const user = await requireUser();

  const { data, error } = await supabase
    .from("subject_materials")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at");

  if (error) {
    console.error("Takda: unable to load subject materials", error);
    throw error;
  }

  return (data || []).map(toSubjectMaterial);
}

export async function createSubjectMaterialLink({ subjectId, title, description, externalUrl } = {}) {
  const user = await requireUser();

  if (!subjectId) {
    throw new Error("Takda: a subjectId is required to add a material.");
  }

  const trimmedTitle = (title || "").trim();

  if (!trimmedTitle) {
    throw new Error("Takda: a material title is required.");
  }

  const trimmedDescription = (description || "").trim();
  const normalizedUrl = normalizeExternalUrl(externalUrl);

  const { data, error } = await supabase
    .from("subject_materials")
    .insert({
      user_id: user.id,
      subject_id: subjectId,
      material_type: "link",
      title: trimmedTitle,
      description: trimmedDescription || null,
      external_url: normalizedUrl,
    })
    .select()
    .single();

  if (error) {
    console.error("Takda: unable to create material link", error);
    throw error;
  }

  return toSubjectMaterial(data);
}

// Scoped to id + user_id + material_type = 'link' in the query itself
// (not just RLS) so this can never touch another user's row, and can
// never touch an 'upload' row even if given its id — if the row isn't
// owned by the current user or isn't a link, the WHERE clause matches
// zero rows and .single() below fails loudly rather than silently
// converting/ignoring it.
export async function updateSubjectMaterialLink(id, { title, description, externalUrl } = {}) {
  const user = await requireUser();

  if (!id) {
    throw new Error("Takda: a material id is required to update it.");
  }

  const trimmedTitle = (title || "").trim();

  if (!trimmedTitle) {
    throw new Error("Takda: a material title is required.");
  }

  const trimmedDescription = (description || "").trim();
  const normalizedUrl = normalizeExternalUrl(externalUrl);

  const { data, error } = await supabase
    .from("subject_materials")
    .update({
      title: trimmedTitle,
      description: trimmedDescription || null,
      external_url: normalizedUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("material_type", "link")
    .select()
    .single();

  if (error) {
    console.error("Takda: unable to update material link", error);
    throw error;
  }

  return toSubjectMaterial(data);
}

// Same id + user_id + material_type = 'link' query-level scoping as
// the update above — deleting an 'upload' row's id through this
// function is a safe no-op, not an accidental deletion. No Storage
// cleanup here: a link material never had a Storage object.
export async function deleteSubjectMaterialLink(id) {
  const user = await requireUser();

  if (!id) {
    throw new Error("Takda: a material id is required to delete it.");
  }

  const { error } = await supabase
    .from("subject_materials")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("material_type", "link");

  if (error) {
    console.error("Takda: unable to delete material link", error);
    throw error;
  }
}

// -------------------------
// DEDICATED SUBJECT MATERIAL (UPLOAD) WRITE METHODS
// -------------------------
// Hybrid Lesson Materials #5B: same deliberately-separate reasoning as
// the link write methods above — not part of the generic snapshot sync.
// This stage only implements the Storage/data-layer plumbing for
// material_type = 'upload' rows: no UI, no signed URL/preview, no
// quota, no subject-deletion Storage cleanup (all later stages).

export async function createSubjectMaterialUpload({ subjectId, title, description, file } = {}) {
  const user = await requireUser();

  const trimmedSubjectId = typeof subjectId === "string" ? subjectId.trim() : "";

  if (!trimmedSubjectId) {
    throw new Error("Takda: a subjectId is required to add a material.");
  }

  const trimmedTitle = (title || "").trim();

  if (!trimmedTitle) {
    throw new Error("Takda: a material title is required.");
  }

  const trimmedDescription = (description || "").trim();

  // Throws MaterialUploadValidationError (with a .code) on any invalid
  // file — never silently coerces. This is the only file-shape check
  // performed here; the bucket's own MIME/size configuration (see the
  // Storage migration) is an independent, defense-in-depth layer, not
  // a duplicate of this one.
  const { fileName, fileSize, mimeType } = validateMaterialUploadFile(file);
  const extension = getMaterialUploadExtension(mimeType);

  // Storage path deliberately never contains the original filename —
  // file_name is stored only as display metadata on the DB row below,
  // and subjectId here is always the trimmed, validated value (never
  // caller-supplied raw input) alongside user.id from requireUser().
  const storagePath = `${user.id}/${trimmedSubjectId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("subject-materials")
    .upload(storagePath, file, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    console.error("Takda: unable to upload material file", uploadError);
    throw uploadError;
  }

  const { data, error: insertError } = await supabase
    .from("subject_materials")
    .insert({
      user_id: user.id,
      subject_id: trimmedSubjectId,
      material_type: "upload",
      title: trimmedTitle,
      description: trimmedDescription || null,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mimeType,
      file_size: fileSize,
      external_url: null,
    })
    .select()
    .single();

  if (insertError) {
    console.error("Takda: unable to create material upload row", insertError);

    // Best-effort cleanup only — never masks the original DB error and
    // is never retried. A cleanup failure is logged without secrets/
    // tokens/file contents; the original insertError is always what
    // the caller receives below.
    const { error: cleanupError } = await supabase.storage
      .from("subject-materials")
      .remove([storagePath]);

    if (cleanupError) {
      console.warn(
        "Takda: uploaded file could not be cleaned up after a failed material insert",
        cleanupError
      );
    }

    throw insertError;
  }

  return toSubjectMaterial(data);
}

// Unlike deleteSubjectMaterialLink (which never touches Storage because
// a link never had an object), this must remove the Storage object
// FIRST and only delete the DB row after that succeeds — DB-first would
// risk an untraceable Storage orphan with no row pointing back to it.
// The caller may never supply storage_path directly; it is always read
// back from the DB row itself, scoped to this user, immediately before
// use.
export async function deleteSubjectMaterialUpload(id) {
  const user = await requireUser();

  const trimmedId = typeof id === "string" ? id.trim() : "";

  if (!trimmedId) {
    throw new Error("Takda: a material id is required to delete it.");
  }

  // .single() (not .maybeSingle()) to match the same fail-loudly
  // convention already used by updateSubjectMaterialLink's scoped query
  // above — a missing/foreign/non-upload id must surface as a clear
  // error rather than silently proceeding with an undefined path.
  const { data, error: selectError } = await supabase
    .from("subject_materials")
    .select("id, storage_path")
    .eq("id", trimmedId)
    .eq("user_id", user.id)
    .eq("material_type", "upload")
    .single();

  if (selectError) {
    console.error("Takda: unable to find material upload to delete", selectError);
    throw selectError;
  }

  const storagePath = data.storage_path;

  if (typeof storagePath !== "string" || !storagePath) {
    throw new Error("Takda: that material has no associated file to delete.");
  }

  // Defense-in-depth: even though storage_path came from our own query
  // scoped to this user's row, this guards against a corrupted/
  // tampered DB value ever causing a delete outside the current user's
  // Storage namespace. The error stays generic on purpose.
  if (!storagePath.startsWith(`${user.id}/`)) {
    throw new Error("Takda: unable to delete that material.");
  }

  const { error: removeError } = await supabase.storage
    .from("subject-materials")
    .remove([storagePath]);

  if (removeError) {
    console.error("Takda: unable to delete material file from storage", removeError);
    throw removeError;
  }

  // Storage object is already gone at this point. If this fails, the
  // DB row is left referencing a now-missing object — surfaced as a
  // normal thrown error rather than silently swallowed. No automatic
  // retry, no re-upload: a known, deliberately small limitation rather
  // than new infrastructure.
  const { error: deleteError } = await supabase
    .from("subject_materials")
    .delete()
    .eq("id", trimmedId)
    .eq("user_id", user.id)
    .eq("material_type", "upload");

  if (deleteError) {
    console.error(
      "Takda: unable to delete material upload row after removing its file",
      deleteError
    );
    throw deleteError;
  }
}

export function installSupabaseStorageAdapter() {
  window.storage = {
    async get(key) {
      if (key !== "takda-app-data") return null;

      const user = await getUser();

      if (!user) {
        hydratedUserId = null;
        return null;
      }

      const [subjectsRes, activitiesRes, notesRes, gradesRes, semestersRes, subjectSchedulesRes] =
        await Promise.all([
          supabase
            .from("subjects")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at"),

          supabase
            .from("activities")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at"),

          supabase
            .from("notes")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at"),

          supabase
            .from("grades")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at"),

          // Read-only in this phase — semesters have no write/delete path
          // yet. RLS already scopes this to the signed-in user; the
          // explicit .eq("user_id", ...) matches the pattern used above.
          supabase
            .from("semesters")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at"),

          // Phase 9D Stage 9D-2: loaded alongside everything else so the
          // adapter is ready ahead of the UI, but App.jsx does not read
          // parsed.subjectSchedules yet in this stage.
          supabase
            .from("subject_schedules")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at"),
        ]);

      if (subjectsRes.error) throw subjectsRes.error;
      if (activitiesRes.error) throw activitiesRes.error;
      if (notesRes.error) throw notesRes.error;
      if (gradesRes.error) throw gradesRes.error;
      if (semestersRes.error) throw semestersRes.error;
      if (subjectSchedulesRes.error) throw subjectSchedulesRes.error;

      // Only after ALL six tables successfully load
      // do we allow database synchronization.
      hydratedUserId = user.id;

      return {
        value: JSON.stringify({
          subjects: (subjectsRes.data || []).map(toSubject),
          activities: (activitiesRes.data || []).map(toActivity),
          notes: (notesRes.data || []).map(toNote),
          grades: (gradesRes.data || []).map(toGrade),
          semesters: (semestersRes.data || []).map(toSemester),
          subjectSchedules: (subjectSchedulesRes.data || []).map(toSubjectSchedule),
        }),
      };
    },

    async set(key, value) {
      if (key !== "takda-app-data") return false;

      // Queue every save.
      // Even if the previous save failed, the next save
      // is still allowed to run.
      const queuedSave = saveQueue
        .catch(() => {})
        .then(() => performSave(value));

      saveQueue = queuedSave.catch((error) => {
        console.error("Takda database synchronization error:", error);
      });

      try {
        return await queuedSave;
      } catch (error) {
        console.error("Takda save failed:", error);
        return false;
      }
    },
  };
}
