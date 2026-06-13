const STORAGE_KEY = "secondary-school-alumni-records";
const SESSION_KEY = "secondary-school-current-member";
const ADMIN_SESSION_KEY = "secondary-school-admin-session";
const ADMIN_PASSWORD_KEY = "secondary-school-admin-password";
const ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "demosa014";

const seedMembers = [
  {
    id: "seed-1",
    fullName: "Aisha Mohammed",
    email: "aisha@example.com",
    phone: "+234 800 123 4567",
    startedClass: "JSS 1",
    leftClass: "Graduated",
    jsClass: "2008",
    ssClass: "2011",
    placement: "Science",
    maritalStatus: "Married",
    address: "Kano, Nigeria",
    workplace: "Federal Medical Centre",
    professionalExperience: "Healthcare professional with experience in clinical service and community health outreach.",
    password: "2348001234567",
    photo: "",
    status: "approved",
    deceased: false,
    createdAt: new Date().toISOString()
  },
  {
    id: "seed-2",
    fullName: "Daniel Okafor",
    email: "daniel@example.com",
    phone: "+234 803 222 7788",
    startedClass: "JSS 2",
    leftClass: "SS 3",
    jsClass: "",
    ssClass: "2010",
    placement: "Commercial",
    maritalStatus: "Single",
    address: "Abuja, Nigeria",
    workplace: "Zenith Bank",
    professionalExperience: "Banking and finance professional with experience in customer relationship management.",
    password: "2348032227788",
    photo: "",
    status: "approved",
    deceased: false,
    createdAt: new Date().toISOString()
  }
];

let members = loadMembers();
let currentMemberId = sessionStorage.getItem(SESSION_KEY) || "";
let adminLoggedIn = sessionStorage.getItem(ADMIN_SESSION_KEY) === "true";
let adminPassword = localStorage.getItem(ADMIN_PASSWORD_KEY) || DEFAULT_ADMIN_PASSWORD;
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
    if (button.dataset.view) {
      switchView(button.dataset.view);
    }
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
  if (window.matchMedia("(min-width: 641px)").matches) {
    closeMobileMenu();
  }
});

registrationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const record = buildRecord(new FormData(registrationForm), "pending", pendingPhoto);
  members.unshift(record);
  saveMembers();
  registrationForm.reset();
  clearPhotoPreview();
  render();
  switchView("login");
  showToast("Registration submitted. Login will work after admin approval.");
});

registrationForm.addEventListener("reset", () => {
  window.setTimeout(clearPhotoPreview, 0);
});

adminAddForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const record = buildRecord(new FormData(adminAddForm), "approved", "");
  members.unshift(record);
  saveMembers();
  adminAddForm.reset();
  render();
  showToast("Member added and approved.");
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const identifier = clean(formData.get("identifier")).toLowerCase();
  const password = clean(formData.get("password"));

  if (identifier === ADMIN_USERNAME && password === adminPassword) {
    adminLoggedIn = true;
    currentMemberId = "";
    selectedMemberId = "";
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
    loginForm.reset();
    render();
    switchView("admin");
    showToast("Admin login successful.");
    return;
  }

  const member = members.find((item) => {
    return (
      item.status === "approved" &&
      !item.deceased &&
      item.email.toLowerCase() === identifier &&
      getMemberPassword(item) === password
    );
  });

  if (!member) {
    showToast("Invalid login details or account not approved.");
    return;
  }

  currentMemberId = member.id;
  adminLoggedIn = false;
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  sessionStorage.setItem(SESSION_KEY, currentMemberId);
  loginForm.reset();
  render();
  switchView("dashboard");
  showToast(`Welcome, ${member.fullName}.`);
});

memberPasswordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const member = getCurrentMember();
  if (!member) {
    switchView("login");
    return;
  }

  const formData = new FormData(memberPasswordForm);
  const currentPassword = clean(formData.get("currentPassword"));
  const newPassword = clean(formData.get("newPassword"));
  const confirmPassword = clean(formData.get("confirmPassword"));

  if (currentPassword !== getMemberPassword(member)) {
    showToast("Current password is incorrect.");
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast("New passwords do not match.");
    return;
  }

  updateMember(member.id, { password: newPassword });
  memberPasswordForm.reset();
  showToast("Member password updated.");
});

adminPasswordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(adminPasswordForm);
  const currentPassword = clean(formData.get("currentPassword"));
  const newPassword = clean(formData.get("newPassword"));
  const confirmPassword = clean(formData.get("confirmPassword"));

  if (!adminLoggedIn) {
    switchView("login");
    return;
  }

  if (currentPassword !== adminPassword) {
    showToast("Current admin password is incorrect.");
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast("New admin passwords do not match.");
    return;
  }

  adminPassword = newPassword;
  localStorage.setItem(ADMIN_PASSWORD_KEY, adminPassword);
  adminPasswordForm.reset();
  showToast("Admin password updated.");
});

logoutButton.addEventListener("click", logoutMember);
headerLogoutButton.addEventListener("click", logoutMember);
adminLogoutButton.addEventListener("click", logoutAdmin);
headerAdminLogoutButton.addEventListener("click", logoutAdmin);

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const member = getCurrentMember();
  if (!member) {
    switchView("login");
    return;
  }

  const formData = new FormData(profileForm);
  const photoFile = profilePhotoInput.files[0];
  const updates = {
    fullName: clean(formData.get("fullName")),
    email: clean(formData.get("email")),
    phone: clean(formData.get("phone")),
    startedClass: clean(formData.get("startedClass")),
    leftClass: clean(formData.get("leftClass")),
    jsClass: clean(formData.get("jsClass")),
    ssClass: clean(formData.get("ssClass")),
    placement: clean(formData.get("placement")),
    maritalStatus: clean(formData.get("maritalStatus")),
    address: clean(formData.get("address")),
    workplace: clean(formData.get("workplace")),
    professionalExperience: clean(formData.get("professionalExperience")),
    photo: photoFile ? await readImage(photoFile) : member.photo
  };

  updateMember(member.id, updates);
  profilePhotoInput.value = "";
  showToast("Profile updated.");
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

pendingList.addEventListener("click", (event) => {
  const action = event.target.dataset.action;
  const id = event.target.dataset.id;
  if (!action || !id) return;

  if (action === "approve") {
    updateMember(id, { status: "approved" });
    showToast("Member approved. They can now login.");
  }

  if (action === "reject") {
    members = members.filter((member) => member.id !== id);
    saveMembers();
    render();
    showToast("Pending registration removed.");
  }
});

adminMembersList.addEventListener("click", (event) => {
  const action = event.target.dataset.action;
  const id = event.target.dataset.id;
  if (!action || !id) return;

  const member = members.find((item) => item.id === id);
  if (!member) return;

  if (action === "deceased") {
    const nextValue = !member.deceased;
    updateMember(id, { deceased: nextValue });
    if (nextValue && currentMemberId === id) {
      currentMemberId = "";
      sessionStorage.removeItem(SESSION_KEY);
    }
    showToast(nextValue ? "Member flagged as deceased." : "Deceased flag removed.");
  }

  if (action === "remove") {
    members = members.filter((item) => item.id !== id);
    if (currentMemberId === id) {
      currentMemberId = "";
      sessionStorage.removeItem(SESSION_KEY);
    }
    saveMembers();
    render();
    showToast("Member removed.");
  }
});

render();

function loadMembers() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return seedMembers;

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.map(withMemberPassword) : seedMembers;
  } catch {
    return seedMembers;
  }
}

function saveMembers() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(members));
}

function buildRecord(formData, status, photo) {
  return {
    id: makeId(),
    fullName: clean(formData.get("fullName")),
    email: clean(formData.get("email")),
    phone: clean(formData.get("phone")),
    startedClass: clean(formData.get("startedClass")),
    leftClass: clean(formData.get("leftClass")),
    jsClass: clean(formData.get("jsClass")),
    ssClass: clean(formData.get("ssClass")),
    placement: clean(formData.get("placement")),
    maritalStatus: clean(formData.get("maritalStatus")),
    address: clean(formData.get("address")),
    workplace: clean(formData.get("workplace")),
    professionalExperience: clean(formData.get("professionalExperience")),
    password: clean(formData.get("password")) || normalizePhone(formData.get("phone")) || "password123",
    photo,
    status,
    deceased: false,
    createdAt: new Date().toISOString()
  };
}

function makeId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clean(value) {
  return String(value || "").trim();
}

function normalizePhone(value) {
  return clean(value).replace(/\D/g, "");
}

function withMemberPassword(member) {
  return {
    ...member,
    password: getMemberPassword(member)
  };
}

function getMemberPassword(member) {
  return member.password || normalizePhone(member.phone) || "password123";
}

function getCurrentMember() {
  return members.find((member) => member.id === currentMemberId && member.status === "approved" && !member.deceased);
}

function logoutMember() {
  currentMemberId = "";
  selectedMemberId = "";
  sessionStorage.removeItem(SESSION_KEY);
  render();
  switchView("login");
  showToast("You have logged out.");
}

function logoutAdmin() {
  adminLoggedIn = false;
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  render();
  switchView("login");
  showToast("Admin logged out.");
}

function closeMobileMenu() {
  appHeader.classList.remove("menu-open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Open menu");
}

function updateMember(id, updates) {
  members = members.map((member) => {
    if (member.id !== id) return member;
    return { ...member, ...updates };
  });
  saveMembers();
  render();
}

function switchView(viewName) {
  let targetView = viewName;
  const protectedMemberViews = ["dashboard", "directory", "memberDetail"];

  if (protectedMemberViews.includes(viewName) && !getCurrentMember()) {
    targetView = "login";
  }

  if (viewName === "admin" && !adminLoggedIn) {
    targetView = "login";
  }

  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === targetView);
  });

  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === targetView);
  });

  if (protectedMemberViews.includes(viewName) && targetView === "login") {
    showToast("Please login before opening member pages.");
  }

  if (viewName === "admin" && targetView === "login") {
    showToast("Please login as admin first.");
  }
}

function render() {
  renderAuthState();
  renderDirectory();
  renderAdmin();
  renderDashboard();
  renderMemberDetail();
}

function renderAuthState() {
  const loggedIn = Boolean(getCurrentMember());
  document.querySelectorAll(".guest-only").forEach((element) => {
    element.classList.toggle("hidden", loggedIn);
  });

  document.querySelectorAll(".member-only").forEach((element) => {
    element.classList.toggle("hidden", !loggedIn);
  });

  document.querySelectorAll(".admin-only").forEach((element) => {
    element.classList.toggle("hidden", !adminLoggedIn);
  });

  if (!loggedIn && document.querySelector("#dashboard").classList.contains("active")) {
    switchView("login");
  }

  if (!loggedIn && document.querySelector("#directory").classList.contains("active")) {
    switchView("login");
  }

  if (!loggedIn && document.querySelector("#memberDetail").classList.contains("active")) {
    switchView("login");
  }

  if (!adminLoggedIn && document.querySelector("#admin").classList.contains("active")) {
    switchView("login");
  }
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
  const currentMember = getCurrentMember();
  if (!currentMember) {
    memberDetailContent.innerHTML = emptyState("Login to view member information.");
    return;
  }

  const member = members.find((item) => item.id === selectedMemberId && item.status === "approved");
  if (!member) {
    memberDetailContent.innerHTML = emptyState("Select a member from the directory to view their profile.");
    return;
  }

  memberDetailContent.innerHTML = memberDetailMarkup(member);
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
    <div class="profile-detail">
      <span>Phone</span>
      ${escapeHtml(member.phone)}
    </div>
    <div class="profile-detail">
      <span>Place of work</span>
      ${member.workplace ? escapeHtml(member.workplace) : "Not provided"}
    </div>
    <div class="profile-detail">
      <span>Professional experience</span>
      ${member.professionalExperience ? escapeHtml(member.professionalExperience) : "Not provided"}
    </div>
    <div class="profile-detail">
      <span>Address</span>
      ${member.address ? escapeHtml(member.address) : "Not provided"}
    </div>
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

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}
