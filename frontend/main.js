// main.js (frontend)
const API = "http://localhost:3000";

document.addEventListener("DOMContentLoaded", () => {
  const searchBtn = document.getElementById("searchBtn");
  const usernameInput = document.getElementById("username");
  if (searchBtn && usernameInput) {
    searchBtn.addEventListener("click", searchUser);
    usernameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") searchUser(); });
  }

  const contactForm = document.getElementById("contactForm");
  if (contactForm) contactForm.addEventListener("submit", submitContactForm);
});

function showLoading(show = true) {
  const l = document.getElementById("loading");
  if (!l) return;
  l.classList.toggle("hidden", !show);
}

function escapeHtml(s) {
  if (!s) return "";
  return String(s).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function safeList(items, emptyLabel = "None") {
  if (!items || items.length === 0) return `<p class="muted">${emptyLabel}</p>`;
  return `<ul>${items.map(it => `<li>${escapeHtml(it.name || it.title || "Untitled")}${it.url?` — <a href="${it.url}" target="_blank">Play</a>`:""}</li>`).join("")}</ul>`;
}

function renderInventory(items) {
  if (!items || items.length === 0) return `<p class="muted">No items found</p>`;
  return `<div class="inventory-grid">${items.map(i => `
    <div class="inv-card">
      <img src="${i.image || ''}" alt="${escapeHtml(i.name)}" onerror="this.style.opacity=0.6">
      <div style="margin-top:6px;font-size:13px;">${escapeHtml(i.name)}</div>
    </div>`).join("")}</div>`;
}

async function searchUser() {
  const qEl = document.getElementById("username");
  const result = document.getElementById("result");
  if (!qEl || !result) return;
  const q = qEl.value.trim();
  result.innerHTML = "";
  if (!q) { alert("Enter a username"); return; }

  showLoading(true);
  try {
    const res = await fetch(`${API}/api/user/${encodeURIComponent(q)}`);
    const data = await res.json();
    showLoading(false);

    if (!res.ok || data.error) {
      result.innerHTML = `<div class="card"><p class="muted">❌ ${data.error || "Failed to fetch user data"}</p></div>`;
      return;
    }

    // Profile card
    const profile = data.profile || {};
    const summary = data.summary || {};
    const profileHtml = `
      <div class="card profile-row">
        <img class="avatar" src="${data.avatar||''}" alt="avatar" onerror="this.style.opacity=0.6">
        <div class="profile-meta">
          <h2>${escapeHtml(summary.displayName || summary.username || profile.name || "Unknown")}</h2>
          <p class="muted">@${escapeHtml(summary.username || profile.name || "")} • ID: ${escapeHtml(summary.userId || "")}</p>
          <p class="muted">Scout Score: ${escapeHtml(String(summary.scoutScore || 0))}</p>
          <p class="muted">Created: ${profile.created ? new Date(profile.created).toLocaleDateString() : "Unknown"}</p>
        </div>
      </div>
    `;

    const favHtml = `<div class="card"><h3>⭐ Favorites</h3>${safeList(data.favorites, "No favorite games found")}</div>`;
    const createdHtml = `<div class="card"><h3>🏗️ Created Games</h3>${safeList(data.createdGames, "No created games found")}</div>`;
    const invHtml = `<div class="card"><h3>🎒 Inventory</h3>${renderInventory(data.inventory)}</div>`;
    const notesHtml = (data.notes && data.notes.length) ? `<div class="card"><strong>Notes:</strong><ul>${data.notes.map(n => `<li>${escapeHtml(n)}</li>`).join("")}</ul></div>` : "";

    result.innerHTML = profileHtml + favHtml + createdHtml + invHtml + notesHtml;
    result.scrollIntoView({ behavior: "smooth" });

  } catch (err) {
    showLoading(false);
    console.error(err);
    result.innerHTML = `<div class="card"><p class="muted">⚠️ Failed to fetch (check backend console)</p></div>`;
  }
}

async function submitContactForm(e) {
  e.preventDefault();
  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const message = document.getElementById("message").value.trim();
  const resp = document.getElementById("responseMsg");
  resp.textContent = "";

  if (!name || !email || !message) {
    resp.textContent = "Please fill all fields";
    resp.style.color = "yellow";
    return;
  }

  try {
    const r = await fetch(`${API}/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, message })
    });
    const data = await r.json();
    if (r.ok && data.success) {
      resp.textContent = "✅ Message saved locally (backend/messages.json)";
      resp.style.color = "lightgreen";
      document.getElementById("contactForm").reset();
    } else {
      resp.textContent = "❌ Failed to save message";
      resp.style.color = "red";
    }
  } catch (err) {
    console.error(err);
    resp.textContent = "⚠️ Server error (is backend running?)";
    resp.style.color = "red";
  }
}
