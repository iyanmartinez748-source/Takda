import { supabase } from "./supabase";

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

  const subjectRows = subjects.map((s) => ({
    id: s.id,
    user_id: user.id,
    name: s.name,
    teacher: s.teacher || null,
    schedule: s.schedule || null,
    room: s.room || null,
    color: s.color || "#3D2FE0",
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
  }));

  const noteRows = notes.map((n) => ({
    id: n.id,
    user_id: user.id,
    subject_id: n.subjectId || null,
    body: n.body,
    updated_at: n.updatedAt || new Date().toISOString(),
  }));

  const gradeRows = grades.map((g) => ({
    id: g.id,
    user_id: user.id,
    subject_id: g.subjectId,
    title: g.title,
    category: g.category || "Quiz",
    score: Number(g.score) || 0,
    total_score: Number(g.totalScore) || 100,
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

export function installSupabaseStorageAdapter() {
  window.storage = {
    async get(key) {
      if (key !== "takda-app-data") return null;

      const user = await getUser();

      if (!user) {
        hydratedUserId = null;
        return null;
      }

      const [subjectsRes, activitiesRes, notesRes, gradesRes, semestersRes] =
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
        ]);

      if (subjectsRes.error) throw subjectsRes.error;
      if (activitiesRes.error) throw activitiesRes.error;
      if (notesRes.error) throw notesRes.error;
      if (gradesRes.error) throw gradesRes.error;
      if (semestersRes.error) throw semestersRes.error;

      // Only after ALL five tables successfully load
      // do we allow database synchronization.
      hydratedUserId = user.id;

      return {
        value: JSON.stringify({
          subjects: (subjectsRes.data || []).map(toSubject),
          activities: (activitiesRes.data || []).map(toActivity),
          notes: (notesRes.data || []).map(toNote),
          grades: (gradesRes.data || []).map(toGrade),
          semesters: (semestersRes.data || []).map(toSemester),
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
