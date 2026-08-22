let currentDate = new Date();
let selectedDate = new Date();

let tasks = JSON.parse(localStorage.getItem("todoTasks")) || {};

const calendar = document.getElementById("calendar");
const monthYear = document.getElementById("monthYear");
const selectedDateText = document.getElementById("selectedDate");
const taskInput = document.getElementById("taskInput");
const timeInput = document.getElementById("timeInput");
const taskList = document.getElementById("taskList");

/* =========================
   LIVE DATE AND TIME
========================= */

function updateClock() {

  const now = new Date();

  const dateText = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const timeText = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  document.getElementById("currentDate").textContent = dateText;
  document.getElementById("currentTime").textContent = timeText;
}

updateClock();

setInterval(updateClock, 1000);


/* =========================
   DATE KEY
========================= */

function dateKey(date) {

  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


/* =========================
   CALENDAR
========================= */

function renderCalendar() {

  calendar.innerHTML = "";

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDay =
    new Date(year, month, 1).getDay();

  const daysInMonth =
    new Date(year, month + 1, 0).getDate();

  monthYear.textContent =
    currentDate.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric"
    });


  /* EMPTY DAYS */

  for (let i = 0; i < firstDay; i++) {

    const empty = document.createElement("div");

    empty.className = "day empty";

    calendar.appendChild(empty);
  }


  /* DAYS */

  for (let day = 1; day <= daysInMonth; day++) {

    const cellDate =
      new Date(year, month, day);

    const key = dateKey(cellDate);

    const cell =
      document.createElement("div");

    cell.className = "day";


    /* TODAY */

    if (
      dateKey(cellDate) ===
      dateKey(new Date())
    ) {

      cell.classList.add("today");
    }


    /* SELECTED */

    if (
      dateKey(cellDate) ===
      dateKey(selectedDate)
    ) {

      cell.classList.add("selected");
    }


    const number =
      document.createElement("div");

    number.className = "day-number";

    number.textContent = day;

    cell.appendChild(number);


    /* SHOW TASKS */

    if (tasks[key]) {

      tasks[key].forEach(task => {

        const dot =
          document.createElement("div");

        dot.className = "task-dot";

        if (task.completed) {
          dot.classList.add("completed");
        }

        dot.textContent =
          task.time
            ? `${task.time} ${task.text}`
            : task.text;

        cell.appendChild(dot);

      });
    }


    /* SELECT DATE */

    cell.addEventListener("click", () => {

      selectedDate = cellDate;

      renderCalendar();

      renderTasks();
    });


    calendar.appendChild(cell);
  }
}


/* =========================
   TASKS
========================= */

function renderTasks() {

  const key = dateKey(selectedDate);

  selectedDateText.textContent =
    selectedDate.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    });

  taskList.innerHTML = "";


  if (!tasks[key] || tasks[key].length === 0) {

    taskList.innerHTML =
      "<p>No tasks for this date.</p>";

    return;
  }


  tasks[key].forEach((task, index) => {

    const taskDiv =
      document.createElement("div");

    taskDiv.className = "task";


    if (task.completed) {
      taskDiv.classList.add("completed");
    }


    const left =
      document.createElement("div");

    left.className = "task-left";


    /* CHECKBOX */

    const checkbox =
      document.createElement("input");

    checkbox.type = "checkbox";

    checkbox.checked =
      task.completed;


    checkbox.addEventListener("change", () => {

      task.completed =
        checkbox.checked;

      saveTasks();

      renderTasks();

      renderCalendar();
    });


    /* TASK TEXT */

    const text =
      document.createElement("span");

    text.className = "task-text";

    text.textContent =
      task.time
        ? `${task.time} - ${task.text}`
        : task.text;


    left.appendChild(checkbox);

    left.appendChild(text);


    /* DELETE */

    const deleteButton =
      document.createElement("button");

    deleteButton.className =
      "delete-task";

    deleteButton.textContent =
      "Delete";


    deleteButton.addEventListener("click", () => {

      tasks[key].splice(index, 1);

      if (tasks[key].length === 0) {
        delete tasks[key];
      }

      saveTasks();

      renderTasks();

      renderCalendar();
    });


    taskDiv.appendChild(left);

    taskDiv.appendChild(deleteButton);

    taskList.appendChild(taskDiv);

  });
}


/* =========================
   ADD TASK
========================= */

function addTask() {

  const text =
    taskInput.value.trim();

  const time =
    timeInput.value;


  if (!text) {

    alert("Please enter a task.");

    return;
  }


  const key =
    dateKey(selectedDate);


  if (!tasks[key]) {

    tasks[key] = [];
  }


  tasks[key].push({

    text: text,

    time: time,

    completed: false

  });


  saveTasks();


  taskInput.value = "";

  timeInput.value = "";


  renderCalendar();

  renderTasks();
}


/* =========================
   SAVE
========================= */

function saveTasks() {

  localStorage.setItem(
    "todoTasks",
    JSON.stringify(tasks)
  );
}


/* =========================
   BUTTONS
========================= */

document
  .getElementById("addTask")
  .addEventListener(
    "click",
    addTask
  );


taskInput.addEventListener(
  "keydown",
  function(event) {

    if (event.key === "Enter") {

      addTask();
    }
  }
);


document
  .getElementById("prevMonth")
  .addEventListener(
    "click",
    () => {

      currentDate.setMonth(
        currentDate.getMonth() - 1
      );

      renderCalendar();
    }
  );


document
  .getElementById("nextMonth")
  .addEventListener(
    "click",
    () => {

      currentDate.setMonth(
        currentDate.getMonth() + 1
      );

      renderCalendar();
    }
  );


/* =========================
   START
========================= */

renderCalendar();

renderTasks();
