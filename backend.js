export const isSupabaseConfigured = () => {
  const config = window.SUPABASE_CONFIG;
  return Boolean(
    config &&
      typeof config.url === "string" &&
      /^https:\/\/[^\s/]+\.supabase\.co\/?$/.test(config.url.trim()) &&
      typeof config.publishableKey === "string" &&
      config.publishableKey.trim().length > 20,
  );
};

export async function createSupabaseClient() {
  const config = window.SUPABASE_CONFIG;
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase 配置无效：请在 supabase-config.js 填写 https://你的项目.supabase.co 和 publishable/anon 公钥。",
    );
  }

  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  return createClient(config.url.trim().replace(/\/$/, ""), config.publishableKey.trim(), {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });
}

export function mapParticipant(row) {
  return {
    id: row.id,
    name: row.name,
    studentId: row.student_id,
    department: row.department,
    category: row.category,
    quote: row.quote,
    bio: row.bio,
    title: row.title,
    description: row.description,
    story: row.story,
    cover: row.cover,
    accent: row.accent,
  };
}

export async function fetchParticipants(client) {
  const { data, error } = await client
    .from("participants")
    .select("id, name, student_id, department, category, quote, bio, title, description, story, cover, accent")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data.map(mapParticipant);
}
