import { createSupabaseClient, fetchParticipants, isSupabaseConfigured } from "./backend.js";

(() => {
  let participants = window.PARTICIPANTS || [];
  let categories = ["全部作品", ...new Set(participants.map((person) => person.category))];
  const app = document.getElementById("app");
  const grid = document.getElementById("works-grid");
  const filters = document.getElementById("filters");
  const search = document.getElementById("search");
  const resultsNote = document.getElementById("results-note");
  const emptyState = document.getElementById("empty-state");
  const dialog = document.getElementById("qr-dialog");
  const entryDialog = document.getElementById("entry-dialog");
  const entryChoices = document.getElementById("entry-choices");
  const entryAdminForm = document.getElementById("entry-admin-form");
  const entryMessage = document.getElementById("entry-message");
  const entryIntro = document.getElementById("entry-intro");
  const entryAdminSubmit = document.getElementById("entry-admin-submit");
  const entryRoleKey = "hongyan-entry-role";
  const ratingStorageKey = "hongyan-work-ratings-v1";
  const ratingLabels = ["不太喜欢", "一般", "不错", "很喜欢", "非常喜欢"];
  let ratings = {};
  let authClient;
  let selectedCategory = "全部作品";
  let toastTimer;

  try {
    const storedRatings = JSON.parse(window.localStorage.getItem(ratingStorageKey) || "{}");
    if (storedRatings && typeof storedRatings === "object") ratings = storedRatings;
  } catch (error) {
    ratings = {};
  }

  const getRating = (personId) => {
    const value = Number(ratings[personId]);
    return Number.isInteger(value) && value >= 0 && value <= 5 ? value : 0;
  };

  const saveRating = (personId, value) => {
    ratings[personId] = value;
    try {
      window.localStorage.setItem(ratingStorageKey, JSON.stringify(ratings));
    } catch (error) {
      // Keep the current-page rating usable when storage is unavailable.
    }
  };

  const renderRating = (person, variant = "card") => {
    const value = getRating(person.id);
    const stars = Array.from({ length: 5 }, (_, index) => {
      const score = index + 1;
      return `<button class="peek-rating__star${score <= value ? " is-lit" : ""}" type="button" role="radio" data-rating-value="${score}" aria-label="${score} 分：${ratingLabels[index]}" aria-checked="${score === value}"><span aria-hidden="true">★</span></button>`;
    }).join("");
    return `<div class="peek-rating peek-rating-${variant}" data-rating-id="${escapeHtml(person.id)}" data-rating-value="${value}" aria-label="为 ${escapeHtml(person.name)} 的作品评分">
      <span class="peek-rating__label">我的评分</span>
      <div class="peek-rating__row" role="radiogroup">${stars}</div>
      <span class="peek-rating__tip" data-show="false" aria-hidden="true"></span>
    </div>`;
  };

  const paintRating = (control, preview = null) => {
    if (!control) return;
    const value = getRating(control.dataset.ratingId);
    const shown = preview === null ? value : preview;
    control.dataset.preview = preview === null ? "" : String(preview);
    control.dataset.ratingValue = String(value);
    control.querySelectorAll(".peek-rating__star").forEach((star, index) => {
      const active = index < shown;
      star.classList.toggle("is-lit", active);
      star.classList.toggle("is-preview", preview !== null && active);
      star.setAttribute("aria-checked", String(index + 1 === value));
    });
    const tip = control.querySelector(".peek-rating__tip");
    if (tip) {
      tip.textContent = preview === null || preview === 0 ? "" : ratingLabels[preview - 1];
      tip.dataset.show = preview === null || preview === 0 ? "false" : "true";
    }
  };

  const refreshRatings = (personId) => {
    document.querySelectorAll(".peek-rating").forEach((control) => {
      if (control.dataset.ratingId === personId) paintRating(control);
    });
  };

  const handleRatingClick = (button) => {
    const control = button.closest(".peek-rating");
    if (!control) return;
    const personId = control.dataset.ratingId;
    const next = Number(button.dataset.ratingValue);
    const current = getRating(personId);
    saveRating(personId, next === current ? 0 : next);
    refreshRatings(personId);
    showToast(next === current ? "已取消评分" : `已记录 ${next} 分`);
  };

  const preparePhotoReveal = (root) => {
    root.querySelectorAll("img[data-photo-reveal]").forEach((image) => {
      const reveal = () => image.classList.add("is-loaded");
      if (image.complete) {
        window.requestAnimationFrame(reveal);
      } else {
        image.addEventListener("load", reveal, { once: true });
        image.addEventListener("error", reveal, { once: true });
      }
    });
  };

  const prepareElasticText = (root = document) => {
    root.querySelectorAll(".site-header a, .site-nav a, .header-note, .text-link, .card-link, .footer-year, .brand, .button, .filter-chip, .entry-choice, .entry-back, .qr-mini, .detail-breadcrumb a, .detail-footer a").forEach((element) => {
      element.classList.add("elastic-click");
      element.setAttribute("data-elastic-click", "true");
    });
  };

  const triggerElasticText = (element) => {
    if (!element) return;
    element.classList.remove("is-elastic-pressed");
    window.requestAnimationFrame(() => element.classList.add("is-elastic-pressed"));
  };

  const triggerPhotoReplay = (target) => {
    const image = target?.querySelector("img");
    if (!image) return;
    image.classList.remove("is-photo-clicked");
    window.requestAnimationFrame(() => image.classList.add("is-photo-clicked"));
  };

  document.addEventListener("pointerdown", (event) => {
    if (!(event.target instanceof Element)) return;
    triggerElasticText(event.target.closest("[data-elastic-click]"));
    triggerPhotoReplay(event.target.closest(".photo-click-target"));
  });
  document.addEventListener("keydown", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-elastic-click]") : null;
    if (!((event.key === "Enter" || event.key === " ") && target)) return;
    triggerElasticText(target);
  });
  document.addEventListener("animationend", (event) => {
    if (event.animationName === "elastic-text-click") event.target.classList.remove("is-elastic-pressed");
    if (event.animationName === "photo-click-replay") event.target.classList.remove("is-photo-clicked");
  });

  const setEntryMessage = (message) => {
    if (entryMessage) entryMessage.textContent = message;
  };

  const describeEntryError = (error) => {
    const message = String(error?.message || error || "").toLowerCase();
    if (message.includes("invalid login credentials")) return "邮箱或密码不正确。";
    if (message.includes("email not confirmed")) return "该邮箱尚未确认，请联系项目管理员。";
    if (message.includes("failed to fetch") || message.includes("network")) return "暂时无法连接登录服务，请稍后重试。";
    return error?.message || "登录失败，请稍后重试。";
  };

  const hasChosenEntryRole = () => {
    try {
      return Boolean(window.localStorage.getItem(entryRoleKey));
    } catch (error) {
      return false;
    }
  };

  const rememberEntryRole = (role) => {
    try {
      window.localStorage.setItem(entryRoleKey, role);
    } catch (error) {
      // Private browsing or a strict browser policy may disable localStorage.
    }
  };

  const showAdminEntry = () => {
    entryChoices.hidden = true;
    entryAdminForm.hidden = false;
    entryIntro.textContent = "请输入 Supabase 中已创建并获管理员授权的账号。";
    setEntryMessage("");
    entryAdminForm.elements.email.focus();
  };

  const showEntryChoices = () => {
    entryChoices.hidden = false;
    entryAdminForm.hidden = true;
    entryIntro.textContent = "请选择访问方式，开始浏览青年创作。";
    entryAdminForm.reset();
    setEntryMessage("");
  };

  const verifyEntryAdmin = async (session) => {
    const { data, error } = await authClient
      .from("admin_users")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      await authClient.auth.signOut();
      throw new Error("此账号尚未获管理员授权，请联系项目管理员。 ");
    }
  };

  const submitAdminEntry = async (event) => {
    event.preventDefault();
    entryAdminSubmit.disabled = true;
    setEntryMessage("正在验证管理员账号…");

    try {
      if (!isSupabaseConfigured()) {
        throw new Error("Supabase 尚未配置，暂时无法进行管理员登录。 ");
      }
      authClient ||= await createSupabaseClient();
      const values = new FormData(entryAdminForm);
      const { data, error } = await authClient.auth.signInWithPassword({
        email: String(values.get("email") || "").trim(),
        password: values.get("password"),
      });
      if (error) throw error;
      if (!data.session) throw new Error("登录服务没有返回有效会话，请稍后重试。 ");
      await verifyEntryAdmin(data.session);
      rememberEntryRole("admin");
      setEntryMessage("登录成功，正在进入管理后台…");
      window.location.assign("admin.html");
    } catch (error) {
      setEntryMessage(describeEntryError(error));
    } finally {
      entryAdminSubmit.disabled = false;
    }
  };

  const setupEntryGate = () => {
    if (!entryDialog || hasChosenEntryRole()) return;
    entryDialog.showModal();
  };

  document.getElementById("guest-entry")?.addEventListener("click", () => {
    rememberEntryRole("guest");
    entryDialog.close();
  });
  document.getElementById("admin-entry")?.addEventListener("click", showAdminEntry);
  document.getElementById("entry-back")?.addEventListener("click", showEntryChoices);
  entryAdminForm?.addEventListener("submit", submitAdminEntry);
  entryDialog?.addEventListener("cancel", (event) => event.preventDefault());

  const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (character) => {
      const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
      return entities[character];
    });

  const personUrl = (person) => {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("id", person.id);
    return url.href;
  };

  const renderFilters = () => {
    filters.innerHTML = categories
      .map(
        (category) =>
          `<button type="button" class="filter-chip${category === selectedCategory ? " is-selected" : ""}" data-category="${escapeHtml(category)}" aria-pressed="${category === selectedCategory}">${escapeHtml(category)}</button>`,
      )
      .join("");
  };

  const renderCards = () => {
    const query = search.value.trim().toLocaleLowerCase();
    const visible = participants.filter((person) => {
      const matchesCategory = selectedCategory === "全部作品" || person.category === selectedCategory;
      const matchesQuery =
        !query ||
        [person.name, person.studentId, person.department, person.title, person.description]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query);
      return matchesCategory && matchesQuery;
    });

    grid.innerHTML = visible
      .map(
        (person, index) => `
          <article class="work-card">
            <a class="card-art photo-click-target ${escapeHtml(person.accent)}" style="--reveal-delay:${index * 90}ms" href="?id=${encodeURIComponent(person.id)}" aria-label="查看 ${escapeHtml(person.name)} 的作品：${escapeHtml(person.title)}">
              <img data-photo-reveal src="${escapeHtml(person.cover)}" alt="${escapeHtml(person.title)}作品插画" loading="lazy" />
              <span class="card-number">${String(index + 1).padStart(2, "0")} <i>/</i> ${String(participants.length).padStart(2, "0")}</span>
              <span class="card-category">${escapeHtml(person.category)}</span>
            </a>
            <div class="card-body" style="--reveal-delay:${index * 90}ms">
              <div class="card-person">
                <span class="avatar ${escapeHtml(person.accent)}" aria-hidden="true">${escapeHtml(person.name.slice(0, 1))}</span>
                <div><h3>${escapeHtml(person.name)}</h3><span>${escapeHtml(person.department)} <i>·</i> ${escapeHtml(person.studentId)}</span></div>
                <button class="qr-mini" type="button" data-action="qr" data-id="${escapeHtml(person.id)}" aria-label="查看${escapeHtml(person.name)}的专属二维码" title="专属二维码">▦</button>
              </div>
              <h4>${escapeHtml(person.title)}</h4>
              ${renderRating(person)}
              <p class="card-description">${escapeHtml(person.description)}</p>
              <a class="card-link" href="?id=${encodeURIComponent(person.id)}">走进作品 <span aria-hidden="true">↗</span></a>
            </div>
          </article>`,
      )
      .join("");

    preparePhotoReveal(grid);
    prepareElasticText(document);

    resultsNote.textContent = query || selectedCategory !== "全部作品" ? `找到 ${visible.length} 件作品` : "";
    emptyState.hidden = visible.length > 0;
  };

  const renderHome = () => {
    document.title = "红岩铸魂-3D文创季";
    document.body.classList.remove("is-detail");
    app.classList.remove("detail-view");
    document.querySelector(".sample-notice").hidden = isSupabaseConfigured();
    search.value = "";
    selectedCategory = "全部作品";
    document.getElementById("participant-count").textContent = String(participants.length).padStart(2, "0");
    const heroLabel = document.querySelector(".hero-art-label span:last-child");
    if (heroLabel) heroLabel.textContent = `NO. 01 — ${String(participants.length).padStart(2, "0")}`;
    renderFilters();
    renderCards();
  };

  const renderDetail = (person) => {
    document.title = `${person.name} · ${person.title} — 红岩铸魂-3D文创季`;
    document.body.classList.add("is-detail");
    app.classList.add("detail-view");
    app.innerHTML = `
      <nav class="detail-breadcrumb" aria-label="面包屑导航"><a href="./">作品档案</a><span>/</span><span>${escapeHtml(person.name)}</span></nav>
      <section class="detail-hero">
        <div class="detail-copy">
          <p class="eyebrow"><span>作品档案</span><i></i>${escapeHtml(person.category)}</p>
          <p class="detail-quote">“${escapeHtml(person.quote)}”</p>
          <h1>${escapeHtml(person.title)}</h1>
          <p class="detail-description">${escapeHtml(person.description)}</p>
          <div class="detail-meta"><span class="avatar ${escapeHtml(person.accent)}" aria-hidden="true">${escapeHtml(person.name.slice(0, 1))}</span><div><strong>${escapeHtml(person.name)}</strong><span>${escapeHtml(person.department)}　·　${escapeHtml(person.studentId)}</span></div></div>
          ${renderRating(person, "detail")}
        </div>
        <div class="detail-art photo-click-target ${escapeHtml(person.accent)}"><img data-photo-reveal src="${escapeHtml(person.cover)}" alt="${escapeHtml(person.title)}作品插画" /><span class="detail-art-label">SELECTED WORK <i>✳</i></span></div>
      </section>
      <section class="story-section">
        <div class="story-heading"><p class="eyebrow">BEHIND THE WORK <span>—</span> 创作手记</p><h2>每个故事，<br /><em>都从生活开始。</em></h2><button class="button button-outline" type="button" data-action="qr" data-id="${escapeHtml(person.id)}">查看专属二维码 <span aria-hidden="true">▦</span></button></div>
        <div class="story-content"><p class="story-lead">${escapeHtml(person.bio)}</p><span class="story-divider"></span><p>${escapeHtml(person.story)}</p><div class="story-signature"><span>创作者</span><strong>${escapeHtml(person.name)}</strong></div></div>
      </section>
      <section class="detail-footer"><a href="./" class="text-link"><span aria-hidden="true">←</span> 返回全部作品</a><span>红岩铸魂-3D文创季</span><button class="text-link share-link" type="button" data-action="copy" data-id="${escapeHtml(person.id)}">复制作品链接 <span aria-hidden="true">↗</span></button></section>`;
    preparePhotoReveal(app);
    prepareElasticText(document);
  };

  const showToast = (message) => {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
  };

  const openQr = (person) => {
    document.getElementById("qr-person").textContent = `${person.name} · ${person.title}`;
    const code = document.getElementById("qr-code");
    const error = document.getElementById("qr-error");
    const download = document.getElementById("qr-download");
    code.replaceChildren();
    error.hidden = true;
    download.hidden = false;

    if (typeof window.QRCode !== "function") {
      error.textContent = "二维码组件未能加载，请检查网络连接后刷新页面。";
      error.hidden = false;
      download.hidden = true;
    } else {
      new window.QRCode(code, {
        text: personUrl(person),
        width: 220,
        height: 220,
        colorDark: "#7b241f",
        colorLight: "#fffefa",
        correctLevel: window.QRCode.CorrectLevel.H,
      });
      window.setTimeout(() => {
        const image = code.querySelector("img");
        const canvas = code.querySelector("canvas");
        const imageUrl = image && image.src ? image.src : canvas && canvas.toDataURL("image/png");
        if (imageUrl) download.href = imageUrl;
      }, 100);
    }

    if (!dialog.open) dialog.showModal();
  };

  const copyLink = async (person) => {
    try {
      await navigator.clipboard.writeText(personUrl(person));
      showToast("作品链接已复制");
    } catch (error) {
      showToast("复制失败，请从地址栏手动复制作品链接");
    }
  };

  document.addEventListener("click", (event) => {
    const ratingButton = event.target.closest(".peek-rating__star");
    if (ratingButton) {
      event.preventDefault();
      handleRatingClick(ratingButton);
      return;
    }

    const button = event.target.closest("[data-action]");
    if (button) {
      const action = button.dataset.action;
      if (action === "qr") {
        const person = participants.find((entry) => entry.id === button.dataset.id);
        if (person) openQr(person);
      } else if (action === "copy") {
        const person = participants.find((entry) => entry.id === button.dataset.id);
        if (person) void copyLink(person);
      } else if (action === "reset-filters") {
        selectedCategory = "全部作品";
        search.value = "";
        renderFilters();
        renderCards();
      }
      return;
    }

    const chip = event.target.closest("[data-category]");
    if (chip) {
      selectedCategory = chip.dataset.category;
      renderFilters();
      renderCards();
    }
  });

  document.addEventListener("pointerover", (event) => {
    const ratingButton = event.target.closest(".peek-rating__star");
    if (!ratingButton || event.pointerType !== "mouse") return;
    const control = ratingButton.closest(".peek-rating");
    if (control) paintRating(control, Number(ratingButton.dataset.ratingValue));
  });

  document.addEventListener("pointerout", (event) => {
    const control = event.target.closest(".peek-rating");
    if (!control || (event.relatedTarget instanceof Element && control.contains(event.relatedTarget))) return;
    paintRating(control);
  });

  document.addEventListener("keydown", (event) => {
    const ratingButton = event.target.closest?.(".peek-rating__star");
    if (!ratingButton) return;
    const control = ratingButton.closest(".peek-rating");
    const stars = [...control.querySelectorAll(".peek-rating__star")];
    const currentIndex = stars.indexOf(ratingButton);
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      stars[Math.min(stars.length - 1, currentIndex + 1)]?.focus();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      stars[Math.max(0, currentIndex - 1)]?.focus();
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      saveRating(control.dataset.ratingId, 0);
      refreshRatings(control.dataset.ratingId);
      showToast("已取消评分");
    }
  });

  search.addEventListener("input", renderCards);
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      search.focus();
    }
  });
  document.getElementById("qr-download").addEventListener("click", (event) => {
    if (!event.currentTarget.href || event.currentTarget.hidden) event.preventDefault();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  const initialize = async () => {
    if (isSupabaseConfigured()) {
      try {
        const client = await createSupabaseClient();
        participants = await fetchParticipants(client);
        categories = ["全部作品", ...new Set(participants.map((person) => person.category))];
      } catch (error) {
        console.error("Could not load published participant records:", error);
        document.querySelector(".intro-strip").hidden = true;
        app.innerHTML = `<section class="service-error" role="alert"><h1>作品资料暂时无法加载</h1><p>请稍后刷新页面，或联系网站管理员。</p><small>${escapeHtml(error.message)}</small></section>`;
        return;
      }
    }

    const requestedId = new URLSearchParams(window.location.search).get("id");
    const requestedPerson = participants.find((person) => person.id === requestedId);
    if (requestedId && requestedPerson) {
      document.querySelector(".site-nav").innerHTML = '<a href="./" class="nav-link">全部作品</a><a href="#app" class="nav-link is-active">创作者故事</a>';
      renderDetail(requestedPerson);
    } else {
      renderHome();
      if (requestedId) showToast("未找到这位创作者，已为你展示全部作品");
    }
  };

  setupEntryGate();
  prepareElasticText();
  void initialize();
})();
