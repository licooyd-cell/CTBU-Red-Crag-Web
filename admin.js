import { createSupabaseClient, isSupabaseConfigured } from "./backend.js";

const setupWarning = document.getElementById("setup-warning");
const loginPanel = document.getElementById("login-panel");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("login-message");
const dashboardMessage = document.getElementById("dashboard-message");
const participantList = document.getElementById("participant-list");
const dialog = document.getElementById("participant-dialog");
const participantForm = document.getElementById("participant-form");
const formMessage = document.getElementById("form-message");
const coverPreview = document.getElementById("cover-preview");
const saveButton = document.getElementById("save-button");
const toast = document.getElementById("admin-toast");
let supabase;
let editingRecord = null;
let previewUrl = null;
let toastTimer;

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[character];
  });

const setMessage = (element, message) => {
  element.textContent = message;
};

const describeSupabaseError = (error) => {
  const raw = error?.message || String(error);
  const normalized = raw.toLowerCase();
  if (error?.code === "42501" || normalized.includes("row-level security")) {
    return "当前账号没有管理员权限，请确认已将该用户加入 public.admin_users。";
  }
  if (normalized.includes("invalid login credentials")) {
    return "邮箱或密码不正确。请确认使用的是 Supabase Authentication 中已创建的账号。";
  }
  if (normalized.includes("email not confirmed")) {
    return "该账号的邮箱尚未确认，请在 Authentication 中确认邮箱，或关闭邮箱确认要求。";
  }
  return raw;
};

const showToast = (message) => {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2800);
};

const showLogin = () => {
  setupWarning.hidden = true;
  loginPanel.hidden = false;
  dashboard.hidden = true;
};

const showDashboard = (email) => {
  setupWarning.hidden = true;
  loginPanel.hidden = true;
  dashboard.hidden = false;
  document.getElementById("admin-email").textContent = email || "";
};

const getStoragePath = (publicUrl) => {
  if (!publicUrl) return null;
  try {
    const url = new URL(publicUrl);
    const configUrl = new URL(window.SUPABASE_CONFIG.url);
    const prefix = "/storage/v1/object/public/artworks/";
    if (url.origin !== configUrl.origin || !url.pathname.includes(prefix)) return null;
    return decodeURIComponent(url.pathname.slice(url.pathname.indexOf(prefix) + prefix.length));
  } catch (error) {
    return null;
  }
};

const loadParticipants = async () => {
  setMessage(dashboardMessage, "正在加载参赛者资料…");
  participantList.innerHTML = "";
  const { data, error } = await supabase
    .from("participants")
    .select("id, name, student_id, department, title, cover, category")
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (data.length === 0) {
    participantList.innerHTML = '<p class="admin-empty">还没有参赛者资料，点击“新增参赛者”开始添加。</p>';
  } else {
    participantList.innerHTML = data
      .map(
        (person) => `
          <article class="admin-row">
            <img src="${escapeHtml(person.cover)}" alt="" loading="lazy" />
            <div class="admin-row-main">
              <strong>${escapeHtml(person.name)} · ${escapeHtml(person.title)}</strong>
              <span>${escapeHtml(person.student_id)}　·　${escapeHtml(person.department)}　·　${escapeHtml(person.category)}</span>
            </div>
            <div class="admin-row-actions">
              <button type="button" data-action="edit" data-id="${escapeHtml(person.id)}">编辑</button>
              <button type="button" class="delete-button" data-action="delete" data-id="${escapeHtml(person.id)}">删除</button>
            </div>
          </article>`,
      )
      .join("");
  }
  setMessage(dashboardMessage, `共 ${data.length} 位参赛者`);
};

const verifyAdmin = async (session) => {
  const { data, error } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    await supabase.auth.signOut();
    showLogin();
    setMessage(loginMessage, "此账号尚未获管理员授权，请联系项目管理员。");
    return;
  }

  showDashboard(session.user.email);
  await loadParticipants();
};

const initialize = async () => {
  if (!isSupabaseConfigured()) {
    setupWarning.hidden = false;
    return;
  }

  loginPanel.hidden = false;
  setMessage(loginMessage, "正在连接管理服务…");
  try {
    supabase = await createSupabaseClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session) {
      await verifyAdmin(data.session);
    } else {
      showLogin();
      setMessage(loginMessage, "");
    }
  } catch (error) {
    showLogin();
    setMessage(loginMessage, `无法连接管理服务：${describeSupabaseError(error)}`);
  }
};

const setBusy = (busy) => {
  saveButton.disabled = busy;
  saveButton.textContent = busy ? "正在保存…" : editingRecord ? "保存修改" : "保存参赛者";
};

const revokePreview = () => {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
};

const openEditor = (record = null) => {
  editingRecord = record;
  participantForm.reset();
  participantForm.elements.id.value = record ? record.id : "";
  participantForm.elements.accent.value = record ? record.accent : "vermilion";
  participantForm.elements.name.value = record ? record.name : "";
  participantForm.elements.studentId.value = record ? record.student_id : "";
  participantForm.elements.department.value = record ? record.department : "";
  participantForm.elements.category.value = record ? record.category : "";
  participantForm.elements.quote.value = record ? record.quote : "";
  participantForm.elements.bio.value = record ? record.bio : "";
  participantForm.elements.title.value = record ? record.title : "";
  participantForm.elements.description.value = record ? record.description : "";
  participantForm.elements.story.value = record ? record.story : "";
  participantForm.elements.coverFile.required = !record;
  document.getElementById("form-title").textContent = record ? "编辑参赛者" : "新增参赛者";
  setMessage(formMessage, "");
  revokePreview();
  if (record && record.cover) {
    coverPreview.innerHTML = `<img src="${escapeHtml(record.cover)}" alt="当前作品封面" />`;
    coverPreview.hidden = false;
  } else {
    coverPreview.replaceChildren();
    coverPreview.hidden = true;
  }
  setBusy(false);
  dialog.showModal();
};

const uploadCover = async (personId, file) => {
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("请选择一张作品封面。");
  }
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error("封面仅支持 JPG、PNG 或 WebP 图片。");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("封面图片不能超过 10 MB。");
  }

  const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const path = `${personId}/${crypto.randomUUID()}.${extensions[file.type]}`;
  const { error } = await supabase.storage.from("artworks").upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    if (error.statusCode === "403" || error.message?.toLowerCase().includes("row-level security")) {
      throw new Error("图片上传被拒绝：当前账号没有管理员权限。请确认已将账号加入 public.admin_users。");
    }
    if (error.statusCode === "404" || error.message?.toLowerCase().includes("bucket")) {
      throw new Error("找不到 artworks 存储桶。请在 Supabase SQL Editor 执行 supabase/schema.sql。");
    }
    throw error;
  }

  const { data } = supabase.storage.from("artworks").getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
};

const saveParticipant = async (event) => {
  event.preventDefault();
  setMessage(formMessage, "");
  setBusy(true);

  const values = new FormData(participantForm);
  const id = values.get("id") || crypto.randomUUID();
  const file = values.get("coverFile");
  const payload = {
    id,
    name: values.get("name").trim(),
    student_id: values.get("studentId").trim(),
    department: values.get("department").trim(),
    category: values.get("category").trim(),
    quote: values.get("quote").trim(),
    bio: values.get("bio").trim(),
    title: values.get("title").trim(),
    description: values.get("description").trim(),
    story: values.get("story").trim(),
    accent: values.get("accent"),
    cover: editingRecord ? editingRecord.cover : "",
  };
  let uploadedPath = null;
  let saved = false;
  const missingField = [
    payload.name,
    payload.student_id,
    payload.department,
    payload.category,
    payload.quote,
    payload.bio,
    payload.title,
    payload.description,
    payload.story,
  ].some((value) => !value);

  if (missingField) {
    setMessage(formMessage, "请完整填写参赛者和作品信息。");
    setBusy(false);
    return;
  }

  try {
    if (file instanceof File && file.size > 0) {
      const uploaded = await uploadCover(id, file);
      payload.cover = uploaded.publicUrl;
      uploadedPath = uploaded.path;
    }
    if (!payload.cover) throw new Error("请选择一张作品封面。");

    const result = editingRecord
      ? await supabase.from("participants").update(payload).eq("id", id)
      : await supabase.from("participants").insert(payload);

    if (result.error) throw result.error;
    saved = true;
    dialog.close();
    try {
      await loadParticipants();
    } catch (error) {
      console.error("Participant was saved, but the list could not be refreshed:", error);
      setMessage(dashboardMessage, `资料已保存，但列表刷新失败：${error.message}`);
    }

    const oldPath = getStoragePath(editingRecord && editingRecord.cover);
    if (oldPath && uploadedPath && oldPath !== uploadedPath) {
      const { error } = await supabase.storage.from("artworks").remove([oldPath]);
      if (error) setMessage(dashboardMessage, `资料已保存，但旧封面清理失败：${error.message}`);
    }
    showToast(editingRecord ? "参赛者资料已更新" : "参赛者资料已添加");
  } catch (error) {
    if (uploadedPath && !saved) {
      const { error: cleanupError } = await supabase.storage.from("artworks").remove([uploadedPath]);
      if (cleanupError) console.error("Could not remove the unused uploaded cover:", cleanupError);
    }
    setMessage(formMessage, `保存失败：${describeSupabaseError(error)}`);
  } finally {
    setBusy(false);
  }
};

const deleteParticipant = async (id) => {
  const { data, error: lookupError } = await supabase
    .from("participants")
    .select("cover, name")
    .eq("id", id)
    .single();
  if (lookupError) throw lookupError;
  if (!window.confirm(`确定删除参赛者“${data.name}”及其作品资料吗？此操作无法撤销。`)) return;

  const { error } = await supabase.from("participants").delete().eq("id", id);
  if (error) throw error;
  const imagePath = getStoragePath(data.cover);
  if (imagePath) {
    const { error: storageError } = await supabase.storage.from("artworks").remove([imagePath]);
    if (storageError) {
      await loadParticipants();
      setMessage(dashboardMessage, `参赛者资料已删除，但封面清理失败：${storageError.message}`);
      return;
    }
  }
  await loadParticipants();
  showToast("参赛者资料已删除");
};

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(loginMessage, "正在登录…");
  const values = new FormData(loginForm);
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: values.get("email").trim(),
      password: values.get("password"),
    });
    if (error) throw error;
    await verifyAdmin(data.session);
  } catch (error) {
    setMessage(loginMessage, `登录失败：${describeSupabaseError(error)}`);
  }
});

document.getElementById("logout-button").addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    setMessage(dashboardMessage, `退出失败：${error.message}`);
    return;
  }
  showLogin();
  setMessage(loginMessage, "已退出登录。");
});

document.getElementById("add-button").addEventListener("click", () => openEditor());
document.getElementById("form-close").addEventListener("click", () => dialog.close());
document.getElementById("cancel-button").addEventListener("click", () => dialog.close());
participantForm.addEventListener("submit", saveParticipant);
participantForm.elements.coverFile.addEventListener("change", (event) => {
  const file = event.currentTarget.files[0];
  revokePreview();
  if (!file) return;
  previewUrl = URL.createObjectURL(file);
  coverPreview.innerHTML = `<img src="${previewUrl}" alt="所选作品封面预览" />`;
  coverPreview.hidden = false;
});
dialog.addEventListener("close", revokePreview);

participantList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  button.disabled = true;
  try {
    const { data, error } = await supabase.from("participants").select("*").eq("id", button.dataset.id).single();
    if (error) throw error;
    if (button.dataset.action === "edit") openEditor(data);
    if (button.dataset.action === "delete") await deleteParticipant(button.dataset.id);
  } catch (error) {
    setMessage(dashboardMessage, `操作失败：${describeSupabaseError(error)}`);
  } finally {
    button.disabled = false;
  }
});

void initialize();
