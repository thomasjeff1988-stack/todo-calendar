/* =========================================================
   PLANNER — SCRIPT.JS
   A vanilla-JS to-do list + calendar app.
   Data is persisted to LocalStorage. No backend, no build step.
   ========================================================= */

/* ---------------------------------------------------------
   1. CONSTANTS & STATE
   --------------------------------------------------------- */
const STORAGE_KEY = "planner_tasks_v1";
const THEME_KEY = "planner_theme_v1";
const SEEDED_KEY = "planner_seeded_v1";
const NOTIFIED_KEY = "planner_notified_ids_v1"; // reminders already fired, so we don't repeat them

const CATEGORY_LABELS = {
  school: "School",
  work: "Work",
  personal: "Personal",
  meeting: "Meeting",
  assignment: "Assignment",
  other: "Other",
};

const PRIORITY_LABELS = { high: "High", medium: "Medium", low: "Low" };

let tasks = [];               // in-memory copy of all tasks (mirrors LocalStorage)
let calendar = null;          // FullCalendar instance
let currentTab = "today";     // which task-list tab is visible
let editingTaskId = null;     // id of task currently open in the modal (null = "add" mode)
let notifiedIds = new Set();  // reminders already fired this session, loaded from storage

/* ---------------------------------------------------------
   2. UTILITIES
   --------------------------------------------------------- */

// Generates a reasonably unique id without needing any library.
function generateId() {
  return "t" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

// Escapes text before it is inserted as innerHTML, to avoid broken markup
// if a task title/description contains characters like < or &.
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// Formats "YYYY-MM-DD" into a friendly string like "August 24, 2026".
function formatDateFriendly(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

// Formats "HH:MM" (24h) into "H:MM AM/PM".
function formatTimeFriendly(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

// Returns "YYYY-MM-DD" for today, in local time (avoids UTC off-by-one bugs).
function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// Combines a task's date + time fields into a real Date object.
function taskDateTime(task, useEnd = false) {
  const time = useEnd ? (task.endTime || task.startTime) : task.startTime;
  if (task.allDay || !time) {
    const [y, m, d] = task.date.split("-").map(Number);
    return new Date(y, m - 1, d, useEnd ? 23 : 0, useEnd ? 59 : 0);
  }
  const [y, m, d] = task.date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

function showToast(title, message) {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<strong>${escapeHtml(title)}</strong>${escapeHtml(message)}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);
}

/* ---------------------------------------------------------
   3. STORAGE
   --------------------------------------------------------- */

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    tasks = raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Could not read tasks from LocalStorage:", err);
    tasks = [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (err) {
    console.error("Could not save tasks to LocalStorage:", err);
    showToast("Storage error", "Your changes could not be saved locally.");
  }
}

function loadNotifiedIds() {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    notifiedIds = new Set(raw ? JSON.parse(raw) : []);
  } catch {
    notifiedIds = new Set();
  }
}

function saveNotifiedIds() {
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...notifiedIds]));
}

/* Seeds a few sample tasks the very first time the app is opened,
   so the calendar and list are not empty. Sample tasks are flagged
   with isSample: true so they are visually/behaviorally no different,
   but the flag documents that they came from the app, not the user. */
function seedSampleDataIfNeeded() {
  if (localStorage.getItem(SEEDED_KEY)) return;

  const today = new Date();
  const iso = (offsetDays) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const samples = [
    {
      title: "Grade 7 Mathematics Lesson",
      description: "Fractions and decimals — bring worksheets for group work.",
      date: iso(0), startTime: "14:00", endTime: "15:00", allDay: false,
      priority: "high", category: "school", reminder: 30,
    },
    {
      title: "ICT Class",
      description: "Intro to spreadsheets, room 204.",
      date: iso(0), startTime: "09:00", endTime: "10:00", allDay: false,
      priority: "medium", category: "school", reminder: 15,
    },
    {
      title: "Prepare Lesson Plan",
      description: "Draft next week's lesson plan for Grade 8 science.",
      date: iso(1), startTime: "16:00", endTime: "17:00", allDay: false,
      priority: "medium", category: "assignment", reminder: 60,
    },
    {
      title: "Check Student Assignments",
      description: "Grade the algebra homework submitted this week.",
      date: iso(2), startTime: "", endTime: "", allDay: true,
      priority: "high", category: "assignment", reminder: 0,
    },
    {
      title: "STEAM Fair Planning",
      description: "Meet with the committee to finalize booth layout.",
      date: iso(3), startTime: "11:00", endTime: "12:30", allDay: false,
      priority: "medium", category: "meeting", reminder: 30,
    },
    {
      title: "Personal Task — Grocery Run",
      description: "Milk, eggs, coffee, and something for dinner.",
      date: iso(-1), startTime: "", endTime: "", allDay: true,
      priority: "low", category: "personal", reminder: 0,
      completed: true,
    },
  ];

  samples.forEach((s) => {
    tasks.push({
      id: generateId(),
      title: s.title,
      description: s.description,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      allDay: s.allDay,
      priority: s.priority,
      category: s.category,
      reminder: s.reminder,
      completed: !!s.completed,
      isSample: true,
      createdAt: new Date().toISOString(),
    });
  });

  saveTasks();
  localStorage.setItem(SEEDED_KEY, "1");
}

/* ---------------------------------------------------------
   4. TASK CRUD
   --------------------------------------------------------- */

function addTask(data) {
  const task = {
    id: generateId(),
    title: data.title,
    description: data.description || "",
    date: data.date,
    startTime: data.allDay ? "" : (data.startTime || ""),
    endTime: data.allDay ? "" : (data.endTime || ""),
    allDay: !!data.allDay,
    priority: data.priority,
    category: data.category,
    reminder: Number(data.reminder) || 0,
    completed: false,
    isSample: false,
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  saveTasks();
  return task;
}

function updateTask(id, data) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return null;
  Object.assign(task, {
    title: data.title,
    description: data.description || "",
    date: data.date,
    startTime: data.allDay ? "" : (data.startTime || ""),
    endTime: data.allDay ? "" : (data.endTime || ""),
    allDay: !!data.allDay,
    priority: data.priority,
    category: data.category,
    reminder: Number(data.reminder) || 0,
    completed: !!data.completed,
  });
  saveTasks();
  return task;
}

function deleteTask(id) {
  tasks = tasks.filter((t) => t.id !== id);
  notifiedIds.delete(id);
  saveTasks();
  saveNotifiedIds();
}

function completeTask(id, completed = true) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.completed = completed;
  saveTasks();
  renderAll();
}

/* ---------------------------------------------------------
   5. FILTERING & SEARCH
   --------------------------------------------------------- */

function getFilteredTasks() {
  const search = document.getElementById("searchInput").value.trim().toLowerCase();
  const priority = document.getElementById("filterPriority").value;
  const status = document.getElementById("filterStatus").value;
  const category = document.getElementById("filterCategory").value;

  return tasks.filter((t) => {
    if (priority !== "all" && t.priority !== priority) return false;
    if (status === "pending" && t.completed) return false;
    if (status === "completed" && !t.completed) return false;
    if (category !== "all" && t.category !== category) return false;
    if (search) {
      const haystack = `${t.title} ${t.description} ${CATEGORY_LABELS[t.category] || ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

/* ---------------------------------------------------------
   6. RENDERING — dashboard, task lists, calendar
   --------------------------------------------------------- */

function updateDashboard() {
  const today = todayISO();
  const todays = tasks.filter((t) => t.date === today && !t.completed).length;
  const upcoming = tasks.filter((t) => t.date > today && !t.completed).length;
  const completed = tasks.filter((t) => t.completed).length;
  const high = tasks.filter((t) => t.priority === "high" && !t.completed).length;

  document.getElementById("statToday").textContent = todays;
  document.getElementById("statUpcoming").textContent = upcoming;
  document.getElementById("statCompleted").textContent = completed;
  document.getElementById("statHigh").textContent = high;
}

function taskCardHtml(task) {
  const timeLabel = task.allDay
    ? "All day"
    : [formatTimeFriendly(task.startTime), formatTimeFriendly(task.endTime)].filter(Boolean).join(" – ");

  return `
    <li class="task-card ${task.completed ? "completed" : ""}" data-id="${task.id}">
      <input type="checkbox" class="task-checkbox" ${task.completed ? "checked" : ""}
             aria-label="Mark '${escapeHtml(task.title)}' as ${task.completed ? "pending" : "completed"}" />
      <div class="task-card-body">
        <p class="task-card-title">${escapeHtml(task.title)}</p>
        <p class="task-card-meta">${formatDateFriendly(task.date)}${timeLabel ? " • " + timeLabel : ""}</p>
        <div class="task-card-tags">
          <span class="tag tag-priority-${task.priority}">${PRIORITY_LABELS[task.priority]}</span>
          <span class="tag tag-category">${CATEGORY_LABELS[task.category] || "Other"}</span>
        </div>
        ${task.completed ? `<button type="button" class="task-card-restore" data-restore="${task.id}">Restore task</button>` : ""}
      </div>
    </li>`;
}

function renderTasks() {
  const today = todayISO();
  const filtered = getFilteredTasks();

  const todays = filtered.filter((t) => t.date === today && !t.completed)
    .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
  const upcoming = filtered.filter((t) => t.date > today && !t.completed)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || "").localeCompare(b.startTime || ""));
  const completed = filtered.filter((t) => t.completed)
    .sort((a, b) => b.date.localeCompare(a.date));

  const lists = {
    today: { el: document.getElementById("taskListToday"), items: todays, emptyText: "No tasks for today. Enjoy the calm, or add one with \u201cAdd Task\u201d." },
    upcoming: { el: document.getElementById("taskListUpcoming"), items: upcoming, emptyText: "Nothing upcoming yet." },
    completed: { el: document.getElementById("taskListCompleted"), items: completed, emptyText: "No completed tasks match the current filters." },
  };

  Object.values(lists).forEach(({ el, items, emptyText }) => {
    el.innerHTML = items.length
      ? items.map(taskCardHtml).join("")
      : `<li class="task-empty">${emptyText}</li>`;
  });
}

function fcColorForPriority(priority) {
  return priority === "high" ? "#E0553F" : priority === "medium" ? "#D98C10" : "#1E9E5A";
}

function tasksToEvents() {
  return tasks.map((t) => {
    const start = t.allDay ? t.date : `${t.date}T${t.startTime || "00:00"}`;
    let end;
    if (t.allDay) {
      end = undefined; // FullCalendar treats a single all-day date as one day
    } else if (t.endTime) {
      end = `${t.date}T${t.endTime}`;
    }
    return {
      id: t.id,
      title: t.title,
      start,
      end,
      allDay: t.allDay,
      backgroundColor: fcColorForPriority(t.priority),
      borderColor: fcColorForPriority(t.priority),
      classNames: [`priority-${t.priority}`, t.completed ? "task-completed" : ""],
      extendedProps: { priority: t.priority, category: t.category, completed: t.completed },
    };
  });
}

function renderCalendarEvents() {
  if (!calendar) return;
  calendar.removeAllEvents();
  calendar.addEventSource(tasksToEvents());
}

function renderAll() {
  updateDashboard();
  renderTasks();
  renderCalendarEvents();
}

/* ---------------------------------------------------------
   7. TASK TABS
   --------------------------------------------------------- */

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".task-tab").forEach((btn) => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll(".task-list").forEach((list) => {
    list.hidden = list.dataset.tabpanel !== tab;
  });
}

/* ---------------------------------------------------------
   8. MODAL (Add / Edit task)
   --------------------------------------------------------- */

const modalOverlay = document.getElementById("modalOverlay");
const taskForm = document.getElementById("taskForm");

function toggleTimeFieldsVisibility() {
  const allDay = document.getElementById("taskAllDay").checked;
  document.getElementById("timeRow").style.display = allDay ? "none" : "flex";
}

function openAddModal(prefillDate) {
  editingTaskId = null;
  taskForm.reset();
  document.getElementById("taskId").value = "";
  document.getElementById("modalTitle").textContent = "Add Task";
  document.getElementById("saveTaskBtn").textContent = "Save Task";
  document.getElementById("deleteTaskBtn").hidden = true;
  document.getElementById("completedField").hidden = true;
  document.getElementById("taskDate").value = prefillDate || todayISO();
  document.getElementById("titleError").textContent = "";
  document.getElementById("dateError").textContent = "";
  document.getElementById("timeError").textContent = "";
  toggleTimeFieldsVisibility();
  modalOverlay.hidden = false;
  document.getElementById("taskTitle").focus();
}

function openEditModal(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  editingTaskId = id;

  document.getElementById("taskId").value = task.id;
  document.getElementById("taskTitle").value = task.title;
  document.getElementById("taskDescription").value = task.description;
  document.getElementById("taskDate").value = task.date;
  document.getElementById("taskAllDay").checked = task.allDay;
  document.getElementById("taskStartTime").value = task.startTime || "";
  document.getElementById("taskEndTime").value = task.endTime || "";
  document.getElementById("taskPriority").value = task.priority;
  document.getElementById("taskCategory").value = task.category;
  document.getElementById("taskReminder").value = String(task.reminder || 0);
  document.getElementById("taskCompleted").checked = task.completed;

  document.getElementById("modalTitle").textContent = "Edit Task";
  document.getElementById("saveTaskBtn").textContent = "Update Task";
  document.getElementById("deleteTaskBtn").hidden = false;
  document.getElementById("completedField").hidden = false;
  document.getElementById("titleError").textContent = "";
  document.getElementById("dateError").textContent = "";
  document.getElementById("timeError").textContent = "";

  toggleTimeFieldsVisibility();
  modalOverlay.hidden = false;
  document.getElementById("taskTitle").focus();
}

function closeModal() {
  modalOverlay.hidden = true;
  editingTaskId = null;
}

function validateForm() {
  let valid = true;
  const title = document.getElementById("taskTitle").value.trim();
  const date = document.getElementById("taskDate").value;
  const allDay = document.getElementById("taskAllDay").checked;
  const start = document.getElementById("taskStartTime").value;
  const end = document.getElementById("taskEndTime").value;

  document.getElementById("titleError").textContent = "";
  document.getElementById("dateError").textContent = "";
  document.getElementById("timeError").textContent = "";

  if (!title) {
    document.getElementById("titleError").textContent = "Please enter a task title.";
    valid = false;
  }
  if (!date) {
    document.getElementById("dateError").textContent = "Please choose a date.";
    valid = false;
  }
  if (!allDay && start && end && end <= start) {
    document.getElementById("timeError").textContent = "End time must be after start time.";
    valid = false;
  }
  return valid;
}

taskForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  const data = {
    title: document.getElementById("taskTitle").value.trim(),
    description: document.getElementById("taskDescription").value.trim(),
    date: document.getElementById("taskDate").value,
    allDay: document.getElementById("taskAllDay").checked,
    startTime: document.getElementById("taskStartTime").value,
    endTime: document.getElementById("taskEndTime").value,
    priority: document.getElementById("taskPriority").value,
    category: document.getElementById("taskCategory").value,
    reminder: document.getElementById("taskReminder").value,
    completed: document.getElementById("taskCompleted").checked,
  };

  if (editingTaskId) {
    updateTask(editingTaskId, data);
    showToast("Task updated", data.title);
  } else {
    addTask(data);
    showToast("Task added", data.title);
  }

  closeModal();
  renderAll();
});

document.getElementById("taskAllDay").addEventListener("change", toggleTimeFieldsVisibility);
document.getElementById("addTaskBtn").addEventListener("click", () => openAddModal());
document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
document.getElementById("cancelTaskBtn").addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalOverlay.hidden) closeModal();
});

document.getElementById("deleteTaskBtn").addEventListener("click", () => {
  if (!editingTaskId) return;
  const task = tasks.find((t) => t.id === editingTaskId);
  const ok = confirm(`Are you sure you want to delete "${task ? task.title : "this task"}"?`);
  if (!ok) return;
  deleteTask(editingTaskId);
  closeModal();
  renderAll();
  showToast("Task deleted", task ? task.title : "");
});

/* ---------------------------------------------------------
   9. TASK LIST INTERACTIONS (checkbox, click-to-edit, restore)
   --------------------------------------------------------- */

document.querySelectorAll(".task-list").forEach((list) => {
  list.addEventListener("click", (e) => {
    const card = e.target.closest(".task-card");
    if (!card) return;
    const id = card.dataset.id;

    if (e.target.classList.contains("task-checkbox")) {
      completeTask(id, e.target.checked);
      return;
    }
    if (e.target.dataset.restore) {
      completeTask(e.target.dataset.restore, false);
      return;
    }
    openEditModal(id);
  });
});

document.querySelectorAll(".task-tab").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

/* ---------------------------------------------------------
   10. SEARCH & FILTERS
   --------------------------------------------------------- */

document.getElementById("searchInput").addEventListener("input", renderTasks);
document.getElementById("filterPriority").addEventListener("change", renderTasks);
document.getElementById("filterStatus").addEventListener("change", renderTasks);
document.getElementById("filterCategory").addEventListener("change", renderTasks);

/* ---------------------------------------------------------
   11. EXPORT / IMPORT / CLEAR ALL
   --------------------------------------------------------- */

document.getElementById("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `planner-tasks-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Export complete", "Your tasks were downloaded as a JSON file.");
});

document.getElementById("importInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported)) throw new Error("File does not contain a list of tasks.");

      const valid = imported.filter((t) =>
        t && typeof t.title === "string" && t.title.trim() &&
        typeof t.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.date)
      );

      if (!valid.length) throw new Error("No valid tasks were found in this file.");

      const cleaned = valid.map((t) => ({
        id: typeof t.id === "string" && t.id ? t.id : generateId(),
        title: String(t.title).slice(0, 120),
        description: typeof t.description === "string" ? t.description.slice(0, 600) : "",
        date: t.date,
        startTime: typeof t.startTime === "string" ? t.startTime : "",
        endTime: typeof t.endTime === "string" ? t.endTime : "",
        allDay: !!t.allDay,
        priority: ["high", "medium", "low"].includes(t.priority) ? t.priority : "medium",
        category: Object.keys(CATEGORY_LABELS).includes(t.category) ? t.category : "other",
        reminder: Number(t.reminder) || 0,
        completed: !!t.completed,
        isSample: false,
        createdAt: typeof t.createdAt === "string" ? t.createdAt : new Date().toISOString(),
      }));

      // Avoid duplicate ids clashing with existing tasks.
      const existingIds = new Set(tasks.map((t) => t.id));
      cleaned.forEach((t) => { if (existingIds.has(t.id)) t.id = generateId(); });

      tasks = tasks.concat(cleaned);
      saveTasks();
      renderAll();
      showToast("Import complete", `${cleaned.length} task(s) added.`);
    } catch (err) {
      console.error(err);
      showToast("Import failed", err.message || "The selected file could not be read.");
    } finally {
      e.target.value = ""; // allow importing the same file again later
    }
  };
  reader.readAsText(file);
});

document.getElementById("clearAllBtn").addEventListener("click", () => {
  const ok = confirm("Are you sure you want to delete ALL tasks? This cannot be undone.");
  if (!ok) return;
  tasks = [];
  notifiedIds = new Set();
  saveTasks();
  saveNotifiedIds();
  renderAll();
  showToast("All tasks cleared", "Your task list is now empty.");
});

/* ---------------------------------------------------------
   12. DARK MODE
   --------------------------------------------------------- */

function applyTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  localStorage.setItem(THEME_KEY, theme);
  if (calendar) calendar.render(); // repaint calendar so FullCalendar re-reads CSS vars
}

document.getElementById("darkModeToggle").addEventListener("click", () => {
  const isDark = document.body.classList.contains("dark");
  applyTheme(isDark ? "light" : "dark");
});

/* ---------------------------------------------------------
   13. REMINDERS
   --------------------------------------------------------- */

let notificationPermission = "default";

function requestNotificationPermission() {
  if (!("Notification" in window)) {
    showToast("Reminders", "This browser does not support notifications. In-app alerts will be used instead.");
    return;
  }
  Notification.requestPermission().then((permission) => {
    notificationPermission = permission;
    document.getElementById("notifBtn").classList.toggle("active-state", permission === "granted");
    if (permission === "granted") {
      showToast("Reminders enabled", "You'll get a browser notification while this tab stays open.");
    } else {
      showToast("Reminders limited", "Notifications were not allowed, so in-app alerts will be used instead.");
    }
  });
}

document.getElementById("notifBtn").addEventListener("click", requestNotificationPermission);

function fireReminder(task) {
  const title = "Task reminder";
  const body = `${task.title} — ${formatDateFriendly(task.date)}${task.startTime ? " • " + formatTimeFriendly(task.startTime) : ""}`;

  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(title, { body });
    } catch {
      showToast(title, body);
    }
  } else {
    showToast(title, body);
  }

  notifiedIds.add(task.id);
  saveNotifiedIds();
}

// Checks every 30 seconds whether any pending task's reminder time has arrived.
// This only works while the page/tab is open — see README for the explanation
// we show the user about this limitation.
function checkReminders() {
  const now = new Date();
  tasks.forEach((task) => {
    if (task.completed || !task.reminder || notifiedIds.has(task.id)) return;
    const due = taskDateTime(task, false);
    const reminderTime = new Date(due.getTime() - task.reminder * 60000);
    if (now >= reminderTime && now <= due) {
      fireReminder(task);
    }
  });
}

/* ---------------------------------------------------------
   14. CALENDAR INITIALIZATION
   --------------------------------------------------------- */

function initCalendar() {
  const calendarEl = document.getElementById("calendar");

  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
    },
    height: "auto",
    editable: true,
    eventResizableFromStart: true,
    dayMaxEvents: 3,
    nowIndicator: true,

    dateClick(info) {
      openAddModal(info.dateStr.slice(0, 10));
    },

    eventClick(info) {
      openEditModal(info.event.id);
    },

    eventDrop(info) {
      const task = tasks.find((t) => t.id === info.event.id);
      if (!task) return;
      const newDate = info.event.startStr.slice(0, 10);
      task.date = newDate;
      if (!task.allDay && info.event.start) {
        const start = info.event.start;
        task.startTime = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
        if (info.event.end) {
          const end = info.event.end;
          task.endTime = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
        }
      }
      saveTasks();
      renderTasks();
      updateDashboard();
      showToast("Task moved", `${task.title} → ${formatDateFriendly(task.date)}`);
    },

    eventResize(info) {
      const task = tasks.find((t) => t.id === info.event.id);
      if (!task) return;
      const start = info.event.start;
      const end = info.event.end;
      if (start) task.startTime = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
      if (end) task.endTime = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
      saveTasks();
      renderTasks();
      showToast("Task duration updated", task.title);
    },
  });

  calendar.render();
}

/* ---------------------------------------------------------
   15. INITIALIZATION
   --------------------------------------------------------- */

function init() {
  // Theme (before first paint of dynamic content, to avoid a flash).
  const savedTheme = localStorage.getItem(THEME_KEY) || "light";
  applyTheme(savedTheme);

  loadTasks();
  seedSampleDataIfNeeded();
  loadNotifiedIds();

  if ("Notification" in window && Notification.permission === "granted") {
    notificationPermission = "granted";
    document.getElementById("notifBtn").classList.add("active-state");
  }

  initCalendar();
  switchTab("today");
  renderAll();

  // Poll for due reminders every 30 seconds while the tab is open.
  checkReminders();
  setInterval(checkReminders, 30000);
}

document.addEventListener("DOMContentLoaded", init);
