// script.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAbToJbQ8fzxCkVpVyfeT5gZZENgACJAIg",
  authDomain: "opportunityhub-2cfe7.firebaseapp.com",
  projectId: "opportunityhub-2cfe7",
  storageBucket: "opportunityhub-2cfe7.firebasestorage.app",
  messagingSenderId: "694178892874",
  appId: "1:694178892874:web:63a661dde5e83da4baaab3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

const SKILL_ALIASES = {
  js: "javascript",
  "java script": "javascript",
  "react.js": "react",
  reactjs: "react",
  "node.js": "node",
  nodejs: "node",
  "rest api": "rest api",
  api: "rest api",
  "nest.js": "nestjs",
  nestjs: "nestjs",
  mern: "mern",
  mean: "mean",
  "c++": "cpp",
  "c#": "csharp"
};

function normalizeSkill(skill) {
  const raw = String(skill).trim().toLowerCase();
  const cleaned = raw.replace(/^[\[\]"'\s]+|[\[\]"'\s]+$/g, "");
  return SKILL_ALIASES[cleaned] || cleaned;
}

function toNormalizedArray(value) {
  let values = [];

  if (Array.isArray(value)) {
    values = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        values = Array.isArray(parsed) ? parsed : [trimmed];
      } catch {
        values = trimmed.split(",");
      }
    } else {
      values = trimmed.split(",");
    }
  }

  return [...new Set(values.map((item) => normalizeSkill(item)).filter(Boolean))];
}

function formatSkill(skill) {
  return String(skill)
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeUrl(url) {
  const value = String(url || "").trim();
  if (!value || value === "#") return "#";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function getErrorMessage(err, fallback = "Something went wrong.") {
  return err && typeof err.message === "string" ? err.message : fallback;
}

function setButtonBusy(button, isBusy, busyLabel) {
  if (!button) return;
  if (!button.dataset.originalHtml) {
    button.dataset.originalHtml = button.innerHTML || "";
  }
  button.disabled = isBusy;
  button.textContent = isBusy ? busyLabel : "";
  if (!isBusy) {
    button.innerHTML = button.dataset.originalHtml;
  }
}

function animateCountUp(element, duration = 1400) {
  const target = Number(element.dataset.target || 0);
  const suffix = element.dataset.suffix || "";
  if (!Number.isFinite(target) || target < 0) return;

  const startTime = performance.now();

  function tick(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.floor(target * eased);
    element.textContent = value.toLocaleString() + suffix;

    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      element.textContent = target.toLocaleString() + suffix;
    }
  }

  requestAnimationFrame(tick);
}

function initHeroStatsAnimation() {
  const counters = document.querySelectorAll(".count-up");
  if (!counters.length) return;

  counters.forEach((counter, index) => {
    setTimeout(() => {
      animateCountUp(counter);
    }, index * 140);
  });
}

function waitForUser() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

function hasCompleteProfile(data) {
  if (!data || typeof data !== "object") return false;
  const nameOk = typeof data.name === "string" && data.name.trim().length > 0;
  const collegeOk = typeof data.college === "string" && data.college.trim().length > 0;
  const skillsOk = Array.isArray(data.skills) && data.skills.length > 0;
  return nameOk && collegeOk && skillsOk;
}

async function routeSignedInUser(user) {
  const studentSnap = await getDoc(doc(db, "students", user.uid));
  if (studentSnap.exists() && hasCompleteProfile(studentSnap.data())) {
    window.location.href = "dashboard.html";
  } else {
    window.location.href = "profile.html";
  }
}

async function buildInternshipMatches(user) {
  const studentSnap = await getDoc(doc(db, "students", user.uid));
  if (!studentSnap.exists()) {
    return { status: "no_profile", internships: [] };
  }

  const studentData = studentSnap.data();
  if (!hasCompleteProfile(studentData)) {
    return { status: "incomplete_profile", internships: [] };
  }

  const studentSkills = toNormalizedArray(studentData.skills);
  if (!studentSkills.length) {
    return { status: "incomplete_profile", internships: [] };
  }

  const querySnapshot = await getDocs(collection(db, "internship"));
  const internships = [];

  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const requiredRaw =
      data.skillsRequired ??
      data.skillRequired ??
      data.requiredSkills ??
      data.skills ??
      [];

    const required = toNormalizedArray(requiredRaw);
    let matchCount = 0;
    required.forEach((skill) => {
      if (studentSkills.includes(skill)) matchCount++;
    });

    const hasSkillCriteria = required.length > 0;
    const matchPercent = hasSkillCriteria
      ? Math.round((matchCount / required.length) * 100)
      : null;

    const missing = required
      .filter((skill) => !studentSkills.includes(skill))
      .map((skill) => formatSkill(skill));

    internships.push({
      ...data,
      title: data.title || "Internship",
      company: data.company || "Unknown Company",
      applyLink: normalizeUrl(data.applyLink || data.link || "#"),
      matchPercent,
      hasSkillCriteria,
      missing,
      required: required.map((skill) => formatSkill(skill))
    });
  });

  internships.sort((a, b) => {
    const aRank = a.hasSkillCriteria ? 1 : 0;
    const bRank = b.hasSkillCriteria ? 1 : 0;
    if (aRank !== bRank) return bRank - aRank;
    return (b.matchPercent ?? -1) - (a.matchPercent ?? -1);
  });
  return { status: "ok", internships };
}

function renderInternships(target, internships) {
  target.innerHTML = "";

  internships.forEach((job) => {
    let badgeClass = "low";
    if (!job.hasSkillCriteria) badgeClass = "medium";
    else if (job.matchPercent >= 70) badgeClass = "high";
    else if (job.matchPercent >= 40) badgeClass = "medium";

    const matchLabel = job.hasSkillCriteria ? `${job.matchPercent}% Match` : "N/A Match";
    const gapLabel = job.hasSkillCriteria
      ? (job.missing.length ? job.missing.join(", ") : "None")
      : "Add required skills in internship document";
    const requiredLabel = job.required.length ? job.required.join(", ") : "Not set";
    const safeLink = escapeHtml(job.applyLink);
    const safeTitle = escapeHtml(job.title);
    const safeCompany = escapeHtml(job.company);
    const safeGap = escapeHtml(gapLabel);
    const safeRequired = escapeHtml(requiredLabel);
    const disabledApply = safeLink === "#";

    target.innerHTML += `
      <div class="home-card">
        <h3>${safeTitle}</h3>
        <p><strong>Company:</strong> ${safeCompany}</p>
        <p class="badge ${badgeClass}">${matchLabel}</p>
        <p><strong>Required Skills:</strong> ${safeRequired}</p>
        <p><strong>Skill Gap:</strong> ${safeGap}</p>
        <a href="${safeLink}" target="_blank" rel="noopener noreferrer">
          <button ${disabledApply ? "disabled" : ""}>${disabledApply ? "No Link" : "Apply"}</button>
        </a>
      </div>
    `;
  });
}

// ======================
// INDEX PAGE
// ======================
const navLoginBtn = document.getElementById("navLoginBtn");
const navProfileBtn = document.getElementById("navProfileBtn");
const navInternshipsBtn = document.getElementById("navInternshipsBtn");
const navLogoutBtn = document.getElementById("navLogoutBtn");

if (navLoginBtn && navProfileBtn && navInternshipsBtn && navLogoutBtn) {
  async function updateNavForUser(user) {
    if (!user) {
      navLoginBtn.classList.remove("hidden");
      navLoginBtn.textContent = "Login / Sign Up";
      navProfileBtn.classList.add("hidden");
      navProfileBtn.href = "profile.html";
      navInternshipsBtn.classList.add("hidden");
      navLogoutBtn.classList.add("hidden");
      return;
    }

    navLoginBtn.classList.add("hidden");
    navLogoutBtn.classList.remove("hidden");
    navProfileBtn.classList.remove("hidden");
    navProfileBtn.textContent = "Profile";
    navProfileBtn.href = "profile.html";

    try {
      const studentSnap = await getDoc(doc(db, "students", user.uid));
      if (studentSnap.exists() && hasCompleteProfile(studentSnap.data())) {
        navInternshipsBtn.classList.remove("hidden");
      } else {
        navInternshipsBtn.classList.add("hidden");
      }
    } catch {
      navInternshipsBtn.classList.add("hidden");
    }
  }

  navLogoutBtn.addEventListener("click", async () => {
    try {
      setButtonBusy(navLogoutBtn, true, "Logging out...");
      await signOut(auth);
      window.location.href = "index.html";
    } catch (err) {
      alert(getErrorMessage(err, "Logout failed."));
    } finally {
      setButtonBusy(navLogoutBtn, false, "Logging out...");
    }
  });

  updateNavForUser(auth.currentUser).catch(() => {});
  onAuthStateChanged(auth, (user) => {
    updateNavForUser(user).catch(() => {});
  });
}

// ======================
// LOGIN PAGE
// ======================
const signupBtn = document.getElementById("signupBtn");
const loginBtn = document.getElementById("loginBtn");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

if (signupBtn && loginBtn && emailInput && passwordInput) {
  const currentPath = window.location.pathname.toLowerCase();
  if (currentPath.endsWith("/login.html") || currentPath.endsWith("login.html")) {
    waitForUser().then(async (user) => {
      if (user) {
        try {
          await routeSignedInUser(user);
        } catch {
          window.location.href = "profile.html";
        }
      }
    });
  }

  signupBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      alert("Enter both email and password.");
      return;
    }

    try {
      setButtonBusy(signupBtn, true, "Creating...");
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      await setDoc(doc(db, "students", cred.user.uid), {
        email: cred.user.email,
        name: "",
        college: "",
        skills: []
      }, { merge: true });

      alert("Account Created");
      window.location.href = "profile.html";
    } catch (err) {
      alert(getErrorMessage(err, "Could not create account."));
    } finally {
      setButtonBusy(signupBtn, false, "Creating...");
    }
  });

  loginBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      alert("Enter both email and password.");
      return;
    }

    try {
      setButtonBusy(loginBtn, true, "Logging in...");
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await routeSignedInUser(cred.user);
    } catch (err) {
      alert(getErrorMessage(err, "Login failed."));
    } finally {
      setButtonBusy(loginBtn, false, "Logging in...");
    }
  });
}

// ======================
// PROFILE PAGE
// ======================
const saveProfileBtn = document.getElementById("saveProfile");
const nameInput = document.getElementById("name");
const collegeInput = document.getElementById("college");

if (saveProfileBtn && nameInput && collegeInput) {
  const profileHeading = document.querySelector("h2");
  (async () => {
    const user = auth.currentUser || await waitForUser();
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    try {
      const snap = await getDoc(doc(db, "students", user.uid));
      if (!snap.exists()) return;

      const profile = snap.data();
      nameInput.value = typeof profile.name === "string" ? profile.name : "";
      collegeInput.value = typeof profile.college === "string" ? profile.college : "";

      const selected = new Set(toNormalizedArray(profile.skills));
      document.querySelectorAll('input[type="checkbox"]').forEach((box) => {
        box.checked = selected.has(normalizeSkill(box.value));
      });

      if (hasCompleteProfile(profile)) {
        if (profileHeading) profileHeading.textContent = "Edit Profile";
        saveProfileBtn.textContent = "Update Profile";
      } else {
        if (profileHeading) profileHeading.textContent = "Create Profile";
        saveProfileBtn.textContent = "Save Profile";
      }
    } catch {
      // keep page usable even if preload fails
    }
  })();

  saveProfileBtn.addEventListener("click", async () => {
    try {
      const name = nameInput.value.trim();
      const college = collegeInput.value.trim();
      if (!name || !college) {
        alert("Enter both name and college.");
        return;
      }

      const user = auth.currentUser || await waitForUser();
      if (!user) {
        alert("Please login first.");
        window.location.href = "login.html";
        return;
      }

      const skills = [];
      document.querySelectorAll('input[type="checkbox"]:checked').forEach((box) => skills.push(box.value));
      if (!skills.length) {
        alert("Select at least one skill.");
        return;
      }
      const uniqueSkills = [...new Set(skills.map((s) => String(s).trim()).filter(Boolean))];

      setButtonBusy(saveProfileBtn, true, "Saving...");
      await setDoc(doc(db, "students", user.uid), {
        email: user.email || "",
        name,
        college,
        skills: uniqueSkills
      }, { merge: true });

      alert("Profile Saved!");
      window.location.href = "dashboard.html";
    } catch (err) {
      alert(`Could not save profile: ${getErrorMessage(err)}`);
    } finally {
      setButtonBusy(saveProfileBtn, false, "Saving...");
    }
  });
}

// ======================
// DASHBOARD PAGE
// ======================
const resultsDiv = document.getElementById("results");

if (resultsDiv) {
  async function loadMatches() {
    try {
      const user = auth.currentUser || await waitForUser();
      if (!user) {
        window.location.href = "login.html";
        return;
      }

      const result = await buildInternshipMatches(user);

      if (result.status === "no_profile" || result.status === "incomplete_profile") {
        resultsDiv.innerHTML = "<p>No profile found. Please complete your profile first.</p>";
        return;
      }

      if (!result.internships.length) {
        resultsDiv.innerHTML = "<p>No internships found in Firestore. Add docs in 'internship'.</p>";
        return;
      }

      renderInternships(resultsDiv, result.internships);
    } catch (err) {
      resultsDiv.innerHTML = `<p>Error loading matches: ${escapeHtml(getErrorMessage(err))}</p>`;
    }
  }

  loadMatches();
}


// Theme toggle functionality - add at the end of your script.js
document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.getElementById('themeToggle');
  const icon = themeToggle ? themeToggle.querySelector('i') : null;
  const body = document.body;

  // Check for saved theme preference
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    body.classList.add('dark-theme');
    if (icon) {
      icon.classList.remove('fa-moon');
      icon.classList.add('fa-sun');
    }
  }

  // Toggle theme on button click
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      body.classList.toggle('dark-theme');
      const isDark = body.classList.contains('dark-theme');

      // Update icon
      if (icon) {
        if (isDark) {
          icon.classList.remove('fa-moon');
          icon.classList.add('fa-sun');
        } else {
          icon.classList.remove('fa-sun');
          icon.classList.add('fa-moon');
        }
      }

      // Save preference
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
  }

  initHeroStatsAnimation();
});
