const API_BASE = window.location.protocol === "file:" ? "http://localhost:8000/api" : "/api";
const TOKEN_KEY = "demosa-session-token";

let members = [];
let currentUser = null;
let selectedMemberId = "";
let pendingPhoto = "";

const registrationForm = document.querySelector("#registrationForm");
const adminAddForm = document.querySelector("#adminAddForm");
const loginForm = document.querySelector("#loginForm");
const profileForm = document.querySelector("#profileForm");
const memberPasswordForm = document.querySelector("#memberPasswordForm");
const adminPasswordForm = document.querySelector("#adminPasswordForm");
const logoutButton = document.querySelector("#logoutButton");
const headerLogoutButton = document.querySelector("#headerLogoutButton");
const adminLogoutButton = document.querySelector("#adminLogoutButton");
const headerAdminLogoutButton = document.querySelector("#headerAdminLogoutButton");
const photoInput = document.querySelector("#photoInput");
const profilePhotoInput = document.querySelector("#profilePhotoInput");
const photoPreview = document.querySelector("#photoPreview");
const photoPlaceholder = document.querySelector("#photoPlaceholder");
const membersList = document.querySelector("#membersList");
const dashboardMembersList = document.querySelector("#dashboardMembersList");
const memberDetailContent = document.querySelector("#memberDetailContent");
const pendingList = document.querySelector("#pendingList");
const adminMembersList = document.querySelector("#adminMembersList");
const profileSummary = document.querySelector("#profileSummary");
const memberSearch = document.querySelector("#memberSearch");
const dashboardMemberSearch = document.querySelector("#dashboardMemberSearch");
const placementFilter = document.querySelector("#placementFilter");
const toast = document.querySelector("#toast");
const appHeader = document.querySelector(".app-header");
const menuToggle = document.querySelector("#menuToggle");

document.querySelectorAll(".nav-button").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.view) switchView(button.dataset.view);
    closeMobileMenu();
  });
});

document.querySelectorAll("[data-view-jump]").forEach((button) => {
  button.addEventListener("click", () => {
    switchView(button.dataset.viewJump);
    closeMobileMenu();
  });
});

menuToggle.addEventListener("click", () => {
  const isOpen = appHeader.classList.toggle("menu-open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
});

window.addEventListener("resize", () => {
  if (window.matchMedia("(min-width: 641px)").matches) closeMobileMenu();
});

registrationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await apiForm("/register", new FormData(registrationForm));
    registrationForm.reset();
    clearPhotoPreview();
    switchView("login");
    showToast("Registration submitted. Login will work after admin approval.");
  } catch (error) {
    showToast(error.message);
  }
});

registrationForm.addEventListener("reset", () => {
  window.setTimeout(clearPhotoPreview, 0);
});

adminAddForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await apiForm("/admin/members", new FormData(adminAddForm), { auth: true });
    adminAddForm.reset();
    await refreshMembers();
    showToast("Member added and approved.");
  } catch (error) {
    showToast(error.message);
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  try {
    const result = await apiJson("/login", {
      method: "POST",
      body: {
        identifier: clean(formData.get("identifier")),
        password: clean(formData.get("password"))
      }
    });
    sessionStorage.setItem(TOKEN_KEY, result.token);
    loginForm.reset();
    await loadSession();
    await refreshMembers();
    switchView(result.role === "admin" ? "admin" : "dashboard");
    showToast(result.role === "admin" ? "Admin login successful." : `Welcome, ${result.member.fullName}.`);
  } catch (error) {
    showToast(error.message);
  }
});

logoutButton.addEventListener("click", logoutCurrentUser);
headerLogoutButton.addEventListener("click", logoutCurrentUser);
adminLogoutButton.addEventListener("click", logoutCurrentUser);
headerAdminLogoutButton.addEventListener("click", logoutCurrentUser);

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const member = getCurrentMember();
  if (!member) {
    switchView("login");
    return;
  }
  try {
    await apiForm(`/members/${member.id}`, new FormData(profileForm), { method: "PUT", auth: true });
    profilePhotoInput.value = "";
    await loadSession();
    await refreshMembers();
    showToast("Profile updated.");
  } catch (error) {
    showToast(error.message);
  }
});

memberPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await changePassword(memberPasswordForm, "Member password updated.");
});

adminPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await changePassword(adminPasswordForm, "Admin password updated.");
});

photoInput.addEventListener("change", async () => {
  const file = photoInput.files[0];
  if (!file) {
    clearPhotoPreview();
    return;
  }
  pendingPhoto = await readImage(file);
  photoPreview.src = pendingPhoto;
  photoPreview.hidden = false;
  photoPlaceholder.textContent = file.name;
});

memberSearch.addEventListener("input", renderDirectory);
dashboardMemberSearch.addEventListener("input", renderDashboardMembers);
placementFilter.addEventListener("change", renderDirectory);
membersList.addEventListener("click", handleMemberCardClick);
dashboardMembersList.addEventListener("click", handleMemberCardClick);

pendingList.addEventListener("click", async (event) => {
  const action = event.target.dataset.action;
  const id = event.target.dataset.id;
  if (!action || !id) return;
  try {
    if (action === "approve") {
      await apiJson(`/members/${id}/approve`, { method: "POST", auth: true });
      showToast("Member approved. They can now login.");
    }
    if (action === "reject") {
      await apiJson(`/members/${id}`, { method: "DELETE", auth: true });
      showToast("Pending registration removed.");
    }
    await refreshMembers();
  } catch (error) {
    showToast(error.message);
  }
});

adminMembersList.addEventListener("click", async (event) => {
  const action = event.target.dataset.action;
  const id = event.target.dataset.id;
  if (!action || !id) return;
  const member = members.find((item) => item.id === id);
  if (!member) return;
  try {
    if (action === "deceased") {
      await apiJson(`/members/${id}/deceased`, {
        method: "POST",
        auth: true,
        body: { deceased: !member.deceased }
      });
      showToast(!member.deceased ? "Member flagged as deceased." : "Deceased flag removed.");
    }
    if (action === "remove") {
      await apiJson(`/members/${id}`, { method: "DELETE", auth: true });
      showToast("Member removed.");
    }
    await refreshMembers();
  } catch (error) {
    showToast(error.message);
  }
});

initialize();

async function initialize() {
  await loadSession();
  await refreshMembers();
  render();
}

async function loadSession() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) {
    currentUser = null;
    return;
  }
  try {
    currentUser = await apiJson("/me", { auth: true });
  } catch {
    sessionStorage.removeItem(TOKEN_KEY);
    currentUser = null;
  }
}

async function refreshMembers() {
  if (!currentUser) {
    members = [];
    render();
    return;
  }
  const status = currentUser.role === "admin" ? "all" : "approved";
  const result = await apiJson(`/members?status=${status}`, { auth: true });
  members = result.members || [];
  render();
}

async function apiJson(path, options = {}) {
  const headers = { Accept: "application/json" };
  if (options.body) headers["Content-Type"] = "application/json";
  if (options.auth) headers.Authorization = `Bearer ${sessionStorage.getItem(TOKEN_KEY) || ""}`;
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

async function apiForm(path, formData, options = {}) {
  if (options.auth) {
    const token = sessionStorage.getItem(TOKEN_KEY) || "";
    const response = await fetch(`${API_BASE}${path}`, {
      method: options.method || "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed");
    return payload;
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "POST",
    body: formData
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

async function changePassword(form, successMessage) {
  const formData = new FormData(form);
  try {
    await apiJson("/password", {
      method: "POST",
      auth: true,
      body: {
        currentPassword: clean(formData.get("currentPassword")),
        newPassword: clean(formData.get("newPassword")),
        confirmPassword: clean(formData.get("confirmPassword"))
      }
    });
    form.reset();
    showToast(successMessage);
  } catch (error) {
    showToast(error.message);
  }
}

async function logoutCurrentUser() {
  try {
    await apiJson("/logout", { method: "POST", auth: true });
  } catch {
    // Logging out locally still matters if the server session already expired.
  }
  currentUser = null;
  members = [];
  selectedMemberId = "";
  sessionStorage.removeItem(TOKEN_KEY);
  render();
  switchView("login");
  showToast("You have logged out.");
}

function getCurrentMember() {
  return currentUser && currentUser.role === "member" ? currentUser.member : null;
}

function isAdmin() {
  return currentUser && currentUser.role === "admin";
}

function switchView(viewName) {
  let targetView = viewName;
  const protectedMemberViews = ["dashboard", "directory", "memberDetail"];
  if (protectedMemberViews.includes(viewName) && !getCurrentMember()) targetView = "login";
  if (viewName === "admin" && !isAdmin()) targetView = "login";

  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === targetView);
  });
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === targetView);
  });
  if (protectedMemberViews.includes(viewName) && targetView === "login") showToast("Please login before opening member pages.");
  if (viewName === "admin" && targetView === "login") showToast("Please login as admin first.");
}

function render() {
  renderAuthState();
  renderDirectory();
  renderAdmin();
  renderDashboard();
  renderMemberDetail();
}

function renderAuthState() {
  const memberLoggedIn = Boolean(getCurrentMember());
  const adminLoggedIn = isAdmin();
  document.querySelectorAll(".guest-only").forEach((element) => {
    element.classList.toggle("hidden", memberLoggedIn || adminLoggedIn);
  });
  document.querySelectorAll(".member-only").forEach((element) => {
    element.classList.toggle("hidden", !memberLoggedIn);
  });
  document.querySelectorAll(".admin-only").forEach((element) => {
    element.classList.toggle("hidden", !adminLoggedIn);
  });
  if (!memberLoggedIn && document.querySelector("#dashboard").classList.contains("active")) switchView("login");
  if (!memberLoggedIn && document.querySelector("#directory").classList.contains("active")) switchView("login");
  if (!memberLoggedIn && document.querySelector("#memberDetail").classList.contains("active")) switchView("login");
  if (!adminLoggedIn && document.querySelector("#admin").classList.contains("active")) switchView("login");
}

function renderDirectory() {
  const query = memberSearch.value.trim().toLowerCase();
  const placement = placementFilter.value;
  const approved = members
    .filter((member) => member.status === "approved")
    .filter((member) => !placement || member.placement === placement)
    .filter((member) => matchesSearch(member, query));
  membersList.innerHTML = approved.length
    ? approved.map(memberCard).join("")
    : emptyState("No approved members match this view.");
}

function renderAdmin() {
  const pending = members.filter((member) => member.status === "pending");
  const approved = members.filter((member) => member.status === "approved");
  const deceased = approved.filter((member) => member.deceased);
  document.querySelector("#pendingCount").textContent = pending.length;
  document.querySelector("#approvedCount").textContent = approved.length;
  document.querySelector("#deceasedCount").textContent = deceased.length;
  pendingList.innerHTML = pending.length
    ? pending.map((member) => adminCard(member, "pending")).join("")
    : emptyState("There are no registrations waiting for approval.");
  adminMembersList.innerHTML = approved.length
    ? approved.map((member) => adminCard(member, "approved")).join("")
    : emptyState("No approved members yet.");
}

function renderDashboard() {
  const member = getCurrentMember();
  if (!member) {
    profileSummary.innerHTML = emptyState("Login to view your profile.");
    profileForm.reset();
    dashboardMembersList.innerHTML = "";
    return;
  }
  profileSummary.innerHTML = profileSummaryMarkup(member);
  fillProfileForm(member);
  renderDashboardMembers();
}

function renderDashboardMembers() {
  const member = getCurrentMember();
  if (!member) {
    dashboardMembersList.innerHTML = "";
    return;
  }
  const query = dashboardMemberSearch.value.trim().toLowerCase();
  const approved = members
    .filter((item) => item.status === "approved" && item.id !== member.id)
    .filter((item) => matchesSearch(item, query));
  dashboardMembersList.innerHTML = approved.length
    ? approved.map(memberCard).join("")
    : emptyState("No other approved members match this search.");
}

function handleMemberCardClick(event) {
  const button = event.target.closest("[data-action='view-member']");
  if (!button) return;
  selectedMemberId = button.dataset.id;
  renderMemberDetail();
  switchView("memberDetail");
}

function renderMemberDetail() {
  if (!getCurrentMember()) {
    memberDetailContent.innerHTML = emptyState("Login to view member information.");
    return;
  }
  const member = members.find((item) => item.id === selectedMemberId && item.status === "approved");
  memberDetailContent.innerHTML = member
    ? memberDetailMarkup(member)
    : emptyState("Select a member from the directory to view their profile.");
}

function fillProfileForm(member) {
  Object.entries(member).forEach(([key, value]) => {
    const field = profileForm.elements[key];
    if (!field || field.type === "file") return;
    field.value = value || "";
  });
}

function matchesSearch(member, query) {
  if (!query) return true;
  return [
    member.fullName,
    member.email,
    member.phone,
    member.startedClass,
    member.leftClass,
    member.jsClass,
    member.ssClass,
    member.placement,
    member.workplace,
    member.professionalExperience
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function memberCard(member) {
  return `
    <article class="member-card">
      <div class="member-top">
        ${photoMarkup(member)}
        <div>
          <h3>${escapeHtml(member.fullName)}</h3>
          <p>${escapeHtml(member.email)}</p>
        </div>
      </div>
      <div class="badges">
        <span class="badge">${escapeHtml(member.placement)}</span>
        <span class="badge">${escapeHtml(member.startedClass)} to ${escapeHtml(member.leftClass)}</span>
        ${member.jsClass ? `<span class="badge">JS ${escapeHtml(member.jsClass)}</span>` : ""}
        ${member.ssClass ? `<span class="badge">SS ${escapeHtml(member.ssClass)}</span>` : ""}
        ${member.deceased ? '<span class="badge warning">Deceased</span>' : ""}
      </div>
      <p>${escapeHtml(member.phone)}</p>
      <p>${member.workplace ? escapeHtml(member.workplace) : "Place of work not provided"}</p>
      <p>${member.professionalExperience ? escapeHtml(member.professionalExperience) : "Professional experience not provided"}</p>
      <p>${member.address ? escapeHtml(member.address) : "Address not provided"}</p>
      <div class="card-actions">
        <button type="button" data-action="view-member" data-id="${member.id}">View Member</button>
      </div>
    </article>
  `;
}

function memberDetailMarkup(member) {
  return `
    <article class="member-detail-card">
      <div class="member-detail-photo">
        ${member.photo ? `<img src="${member.photo}" alt="${escapeHtml(member.fullName)}">` : `<div class="avatar-fallback">${initials(member.fullName)}</div>`}
      </div>
      <div class="member-detail-info">
        <h3>${escapeHtml(member.fullName)}</h3>
        <div class="badges">
          <span class="badge">${escapeHtml(member.placement)}</span>
          <span class="badge">${escapeHtml(member.startedClass)} to ${escapeHtml(member.leftClass)}</span>
          ${member.jsClass ? `<span class="badge">JS ${escapeHtml(member.jsClass)}</span>` : ""}
          ${member.ssClass ? `<span class="badge">SS ${escapeHtml(member.ssClass)}</span>` : ""}
          ${member.deceased ? '<span class="badge warning">Deceased</span>' : ""}
        </div>
        <dl class="info-list">
          <div><dt>Email</dt><dd>${escapeHtml(member.email)}</dd></div>
          <div><dt>Phone</dt><dd>${escapeHtml(member.phone)}</dd></div>
          <div><dt>Address</dt><dd>${member.address ? escapeHtml(member.address) : "Not provided"}</dd></div>
          <div><dt>Marital status</dt><dd>${member.maritalStatus ? escapeHtml(member.maritalStatus) : "Not provided"}</dd></div>
          <div><dt>Place of work</dt><dd>${member.workplace ? escapeHtml(member.workplace) : "Not provided"}</dd></div>
          <div><dt>Professional experience</dt><dd>${member.professionalExperience ? escapeHtml(member.professionalExperience) : "Not provided"}</dd></div>
        </dl>
      </div>
    </article>
  `;
}

function profileSummaryMarkup(member) {
  return `
    <div class="member-top">
      ${photoMarkup(member)}
      <div>
        <h3>${escapeHtml(member.fullName)}</h3>
        <p>${escapeHtml(member.email)}</p>
      </div>
    </div>
    <div class="badges">
      <span class="badge">${escapeHtml(member.placement)}</span>
      <span class="badge">${escapeHtml(member.startedClass)} to ${escapeHtml(member.leftClass)}</span>
      ${member.deceased ? '<span class="badge warning">Deceased</span>' : ""}
    </div>
    <div class="profile-detail"><span>Phone</span>${escapeHtml(member.phone)}</div>
    <div class="profile-detail"><span>Place of work</span>${member.workplace ? escapeHtml(member.workplace) : "Not provided"}</div>
    <div class="profile-detail"><span>Professional experience</span>${member.professionalExperience ? escapeHtml(member.professionalExperience) : "Not provided"}</div>
    <div class="profile-detail"><span>Address</span>${member.address ? escapeHtml(member.address) : "Not provided"}</div>
  `;
}

function adminCard(member, mode) {
  const actions =
    mode === "pending"
      ? `
        <button data-action="approve" data-id="${member.id}">Approve</button>
        <button class="danger" data-action="reject" data-id="${member.id}">Reject</button>
      `
      : `
        <button class="${member.deceased ? "secondary" : "danger"}" data-action="deceased" data-id="${member.id}">
          ${member.deceased ? "Remove Deceased Flag" : "Flag as Deceased"}
        </button>
        <button class="secondary" data-action="remove" data-id="${member.id}">Remove</button>
      `;
  return `
    <article class="list-card">
      <div class="member-top">
        ${photoMarkup(member)}
        <div>
          <h4>${escapeHtml(member.fullName)}</h4>
          <p>${escapeHtml(member.email)} | ${escapeHtml(member.phone)}</p>
        </div>
      </div>
      <div class="badges">
        <span class="badge">${escapeHtml(member.placement || "No placement")}</span>
        <span class="badge">${escapeHtml(member.startedClass)} to ${escapeHtml(member.leftClass)}</span>
        ${member.jsClass ? `<span class="badge">JS ${escapeHtml(member.jsClass)}</span>` : ""}
        ${member.ssClass ? `<span class="badge">SS ${escapeHtml(member.ssClass)}</span>` : ""}
        ${member.deceased ? '<span class="badge warning">Deceased</span>' : ""}
      </div>
      <p>${member.workplace ? escapeHtml(member.workplace) : "Place of work not provided"}</p>
      <p>${member.professionalExperience ? escapeHtml(member.professionalExperience) : "Professional experience not provided"}</p>
      <div class="list-card-actions">${actions}</div>
    </article>
  `;
}

function photoMarkup(member) {
  if (member.photo) {
    return `<img class="member-photo" src="${member.photo}" alt="${escapeHtml(member.fullName)}">`;
  }
  return `<div class="member-photo avatar-fallback" aria-hidden="true">${initials(member.fullName)}</div>`;
}

function initials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function emptyState(message) {
  return `<p class="empty">${message}</p>`;
}

function clearPhotoPreview() {
  pendingPhoto = "";
  photoPreview.removeAttribute("src");
  photoPreview.hidden = true;
  photoPlaceholder.textContent = "No picture selected";
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function clean(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function closeMobileMenu() {
  appHeader.classList.remove("menu-open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Open menu");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 3000);
}
