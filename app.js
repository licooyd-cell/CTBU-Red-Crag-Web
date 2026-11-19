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
  let selectedCategory = "全部作品";
  let toastTimer;

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
            <a class="card-art ${escapeHtml(person.accent)}" href="?id=${encodeURIComponent(person.id)}" aria-label="查看 ${escapeHtml(person.name)} 的作品：${escapeHtml(person.title)}">
              <img src="${escapeHtml(person.cover)}" alt="${escapeHtml(person.title)}作品插画" loading="lazy" />
              <span class="card-number">${String(index + 1).padStart(2, "0")} <i>/</i> ${String(participants.length).padStart(2, "0")}</span>
              <span class="card-category">${escapeHtml(person.category)}</span>
            </a>
            <div class="card-body">
              <div class="card-person">
                <span class="avatar ${escapeHtml(person.accent)}" aria-hidden="true">${escapeHtml(person.name.slice(0, 1))}</span>
                <div><h3>${escapeHtml(person.name)}</h3><span>${escapeHtml(person.department)} <i>·</i> ${escapeHtml(person.studentId)}</span></div>
                <button class="qr-mini" type="button" data-action="qr" data-id="${escapeHtml(person.id)}" aria-label="查看${escapeHtml(person.name)}的专属二维码" title="专属二维码">▦</button>
              </div>
              <h4>${escapeHtml(person.title)}</h4>
              <p class="card-description">${escapeHtml(person.description)}</p>
              <a class="card-link" href="?id=${encodeURIComponent(person.id)}">走进作品 <span aria-hidden="true">↗</span></a>
            </div>
          </article>`,
      )
      .join("");

    resultsNote.textContent = query || selectedCategory !== "全部作品" ? `找到 ${visible.length} 件作品` : "";
    emptyState.hidden = visible.length > 0;
  };

  const renderHome = () => {
    document.title = "红岩新声 · 青年创作档案";
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
    document.title = `${person.name} · ${person.title} — 红岩新声`;
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
        </div>
        <div class="detail-art ${escapeHtml(person.accent)}"><img src="${escapeHtml(person.cover)}" alt="${escapeHtml(person.title)}作品插画" /><span class="detail-art-label">SELECTED WORK <i>✳</i></span></div>
      </section>
      <section class="story-section">
        <div class="story-heading"><p class="eyebrow">BEHIND THE WORK <span>—</span> 创作手记</p><h2>每个故事，<br /><em>都从生活开始。</em></h2><button class="button button-outline" type="button" data-action="qr" data-id="${escapeHtml(person.id)}">查看专属二维码 <span aria-hidden="true">▦</span></button></div>
        <div class="story-content"><p class="story-lead">${escapeHtml(person.bio)}</p><span class="story-divider"></span><p>${escapeHtml(person.story)}</p><div class="story-signature"><span>创作者</span><strong>${escapeHtml(person.name)}</strong></div></div>
      </section>
      <section class="detail-footer"><a href="./" class="text-link"><span aria-hidden="true">←</span> 返回全部作品</a><span>RED ROCK · YOUTH CREATIVE ARCHIVE</span><button class="text-link share-link" type="button" data-action="copy" data-id="${escapeHtml(person.id)}">复制作品链接 <span aria-hidden="true">↗</span></button></section>`;
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

  void initialize();
})();
