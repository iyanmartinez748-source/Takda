import { supabase } from "./supabase";

async function getUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
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

async function deleteMissing(table, userId, ids) {
  let q = supabase.from(table).delete().eq("user_id", userId);
  if (ids.length > 0) {
    q = q.not("id", "in", `(${ids.join(",")})`);
  }
  const { error } = await q;
  if (error) throw error;
}

export function installSupabaseStorageAdapter() {
  window.storage = {
    async get(key) {
      if (key !== "takda-app-data") return null;

      const user = await getUser();
      if (!user) return null;

      const [subjectsRes, activitiesRes, notesRes] = await Promise.all([
        supabase.from("subjects").select("*").eq("user_id", user.id).order("created_at"),
        supabase.from("activities").select("*").eq("user_id", user.id).order("created_at"),
        supabase.from("notes").select("*").eq("user_id", user.id).order("created_at"),
      ]);

      if (subjectsRes.error) throw subjectsRes.error;
      if (activitiesRes.error) throw activitiesRes.error;
      if (notesRes.error) throw notesRes.error;

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

      if (subjectRows.length) {
        const { error } = await supabase.from("subjects").upsert(subjectRows, { onConflict: "id" });
        if (error) throw error;
      }

      if (activityRows.length) {
        const { error } = await supabase.from("activities").upsert(activityRows, { onConflict: "id" });
        if (error) throw error;
      }

      if (noteRows.length) {
        const { error } = await supabase.from("notes").upsert(noteRows, { onConflict: "id" });
        if (error) throw error;
      }

      // Remove records deleted in the UI.
      await deleteMissing("activities", user.id, activities.map((a) => a.id));
      await deleteMissing("notes", user.id, notes.map((n) => n.id));
      await deleteMissing("subjects", user.id, subjects.map((s) => s.id));

      return true;
    },
  };
}
