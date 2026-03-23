const fs = require("fs");
const path = require("path");
const config = require("../config");

const TASKS_DIR = path.join(config.DATA_DIR, "tasks");
fs.mkdirSync(TASKS_DIR, { recursive: true });

function taskPath(id) {
  return path.join(TASKS_DIR, `${id}.json`);
}

function createTask({ name, steps, context }) {
  const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const task = {
    id,
    name,
    status: "in_progress",
    steps: (steps || []).map((s, i) => ({ index: i, description: s, status: "pending" })),
    currentStep: 0,
    context: context || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(taskPath(id), JSON.stringify(task, null, 2));
  return { id, name, totalSteps: task.steps.length };
}

function updateTask({ id, currentStep, stepStatus, status, context }) {
  const filePath = taskPath(id);
  if (!fs.existsSync(filePath)) return { error: `Task ${id} not found` };

  const task = JSON.parse(fs.readFileSync(filePath, "utf8"));

  if (currentStep !== undefined) task.currentStep = currentStep;
  if (stepStatus && task.steps[task.currentStep]) {
    task.steps[task.currentStep].status = stepStatus;
  }
  if (status) task.status = status;
  if (context) task.context = context;
  task.updatedAt = new Date().toISOString();

  fs.writeFileSync(filePath, JSON.stringify(task, null, 2));
  return { id, status: task.status, currentStep: task.currentStep, totalSteps: task.steps.length };
}

function getTask({ id }) {
  const filePath = taskPath(id);
  if (!fs.existsSync(filePath)) return { error: `Task ${id} not found` };
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listTasks() {
  try {
    const files = fs.readdirSync(TASKS_DIR).filter(f => f.endsWith(".json"));
    const tasks = files.map(f => {
      const task = JSON.parse(fs.readFileSync(path.join(TASKS_DIR, f), "utf8"));
      return { id: task.id, name: task.name, status: task.status, currentStep: task.currentStep, totalSteps: task.steps.length };
    });
    return { tasks };
  } catch {
    return { tasks: [] };
  }
}

module.exports = { createTask, updateTask, getTask, listTasks };
