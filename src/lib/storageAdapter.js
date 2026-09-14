import { supabase } from "./supabase";

let hydratedUserId = null;

async function getUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
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
  };
}

function toNote(row) {
  return {
    id: row.id,
    subjectId: row.subject_id || null,
    body: row.body,
    updatedAt: row.updated_at,
  };
}

async function deleteRemovedRows(table, userId, desiredIds) {
  const { data: existingRows, error: fetchError } = await supabase
    .from(table)
    .select("id")
    .eq("user_id", userId);

  if (fetchError) throw fetchError;

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

  if (deleteError) throw deleteError;
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

      const [subjectsRes, activitiesRes, notesRes] = await Promise.all([
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
      ]);

      if (subjectsRes.error) throw subjectsRes.error;
      if (activitiesRes.error) throw activitiesRes.error;
      if (notesRes.error) throw notesRes.error;

      // Important:
      // Allow destructive syncing only AFTER a successful database load.
      hydratedUserId = user.id;

      return {
        value: JSON.stringify({
          subjects: (subjectsRes.data || []).map(toSubject),
          activities: (activitiesRes.data || []).map(toActivity),
          notes: (notesRes.data || []).map(toNote),
        }),
      };
    },

    async set(key, value) {
      if (key !== "takda-app-data") return false;

      const user = await getUser();
      if (!user) return false;

      // Safety protection:
      // Never sync/delete until this user's data has successfully loaded.
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

      // UPSERT CURRENT DATA
      if (subjectRows.length > 0) {
        const { error } = await supabase
          .from("subjects")
          .upsert(subjectRows, { onConflict: "id" });

        if (error) throw error;
      }

      if (activityRows.length > 0) {
        const { error } = await supabase
          .from("activities")
          .upsert(activityRows, { onConflict: "id" });

        if (error) throw error;
      }

      if (noteRows.length > 0) {
        const { error } = await supabase
          .from("notes")
          .upsert(noteRows, { onConflict: "id" });

        if (error) throw error;
      }

      // DELETE ONLY RECORDS THE USER ACTUALLY REMOVED.
      // Child records first, subjects last.
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
        "subjects",
        user.id,
        subjects.map((s) => s.id)
      );

      return true;
    },
  };
}
