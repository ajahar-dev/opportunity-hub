import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
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

function getErrorMessage(err, fallback = "Something went wrong.") {
  return err && typeof err.message === "string" ? err.message : fallback;
}

function setButtonBusy(button, isBusy, busyLabel) {
  if (!button) return;
  if (!button.dataset.originalLabel) {
    button.dataset.originalLabel = button.textContent || "";
  }
  button.disabled = isBusy;
  button.textContent = isBusy ? busyLabel : button.dataset.originalLabel;
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
      applyLink: data.applyLink || data.link || "#",
      matchPercent,
      hasSkillCriteria,
      missing,
      required: required.map((skill) => formatSkill(skill))
    });
  });

  internships.sort((a, b) => (b.matchPercent ?? -1) - (a.matchPercent ?? -1));
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

    target.innerHTML += `
      <div class="card">
        <h3>${safeTitle}</h3>
        <p><strong>Company:</strong> ${safeCompany}</p>
        <p class="badge ${badgeClass}">${matchLabel}</p>
        <p><strong>Required Skills:</strong> ${safeRequired}</p>
        <p><strong>Skill Gap:</strong> ${safeGap}</p>
        <a href="${safeLink}" target="_blank" rel="noopener noreferrer">
          <button>Apply</button>
        </a>
      </div>
    `;
  });
}

// ======================
// INDEX PAGE
// ======================
const navAuthState = document.getElementById("navAuthState");
const navLoginBtn = document.getElementById("navLoginBtn");
const navProfileBtn = document.getElementById("navProfileBtn");
const navInternshipsBtn = document.getElementById("navInternshipsBtn");

if (navAuthState && navLoginBtn && navProfileBtn && navInternshipsBtn) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      navAuthState.textContent = "Guest";
      navLoginBtn.classList.remove("hidden");
      navLoginBtn.textContent = "Login / Sign Up";
      navProfileBtn.classList.add("hidden");
      navProfileBtn.href = "profile.html";
      navInternshipsBtn.classList.add("hidden");
      return;
    }

    navAuthState.textContent = "Logged In";
    navLoginBtn.classList.add("hidden");
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

      setButtonBusy(saveProfileBtn, true, "Saving...");
      await setDoc(doc(db, "students", user.uid), {
        email: user.email || "",
        name,
        college,
        skills
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
