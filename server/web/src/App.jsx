import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  Add, CalendarMonth, Check, ChevronLeft, Close, DeleteOutline, EventRepeat,
  Logout, Menu, NotificationsNone, RadioButtonUnchecked, Star, StarBorder,
  Sunny, TaskAlt, WbSunnyOutlined,
} from "@mui/icons-material";
import {
  Alert, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, MenuItem, Select, Snackbar, TextField, Tooltip,
} from "@mui/material";
import { DatePicker, DateTimePicker } from "@mui/x-date-pickers";
import { isTaskInView } from "./taskViews.mjs";

const API = "/api";
const todayKey = () => dayjs().format("YYYY-MM-DD");
const SYSTEM_IDS = new Set(["all"]);

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, options);
  if (response.status === 401) throw Object.assign(new Error("Please sign in again"), { unauthorized: true });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

function Login({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not sign in");
      onLogin();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <main className="loginPage">
    <form className="loginCard" onSubmit={submit}>
      <div className="logoMark">L</div><h1>Ledger</h1><p>Make today feel lighter.</p>
      <TextField autoFocus fullWidth type="password" label="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <Button fullWidth variant="contained" type="submit" disabled={busy || !password}>{busy ? <CircularProgress size={22} /> : "Enter"}</Button>
      {error && <Alert severity="error">{error}</Alert>}
    </form>
  </main>;
}

const views = [
  { id: "today", label: "My Day", icon: WbSunnyOutlined },
  { id: "important", label: "Important", icon: StarBorder },
  { id: "planned", label: "Planned", icon: CalendarMonth },
  { id: "all", label: "All tasks", icon: TaskAlt },
];

function Sidebar({ view, setView, lists, counts, onNewList, onDeleteList, mobileOpen, closeMobile, onLogout }) {
  return <>
    {mobileOpen && <button className="scrim" aria-label="Close navigation" onClick={closeMobile} />}
    <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
      <div className="brand"><div className="logoMark small">L</div><span>Ledger</span><IconButton size="small" onClick={onLogout} title="Log out"><Logout fontSize="small" /></IconButton></div>
      <nav>
        {views.map(({ id, label, icon: Icon }) => <button key={id} className={`navItem ${view === id ? "active" : ""}`} onClick={() => { setView(id); closeMobile(); }}>
          <Icon fontSize="small" /><span>{label}</span>{counts[id] > 0 && <b>{counts[id]}</b>}
        </button>)}
      </nav>
      <div className="listHeading"><span>Lists</span><IconButton size="small" onClick={onNewList}><Add fontSize="small" /></IconButton></div>
      <nav className="customLists">
        {lists.filter((list) => !SYSTEM_IDS.has(list.id)).map((list) => <div className={`navItem listNav ${view === list.id ? "active" : ""}`} key={list.id}>
          <button onClick={() => { setView(list.id); closeMobile(); }}><span className="listDot" /><span>{list.name}</span><b>{counts[list.id] || ""}</b></button>
          <IconButton className="deleteList" size="small" onClick={() => onDeleteList(list)}><DeleteOutline fontSize="small" /></IconButton>
        </div>)}
      </nav>
    </aside>
  </>;
}

function TaskRow({ task, listName, onOpen, onToggleDone, onToggleImportant }) {
  return <article className={`taskRow ${task.done ? "completed" : ""}`} onClick={() => onOpen(task.id)}>
    <IconButton className="checkButton" aria-label={task.done ? "Mark incomplete" : "Mark complete"} onClick={(event) => { event.stopPropagation(); onToggleDone(task); }}>
      {task.done ? <Check /> : <RadioButtonUnchecked />}
    </IconButton>
    <div className="taskCopy"><span className="taskTitle">{task.title}</span><span className="taskMeta">
      {listName && <i>{listName}</i>}{task.myDay === todayKey() && <i><Sunny fontSize="inherit" /> My Day</i>}{task.dueDate && <i><CalendarMonth fontSize="inherit" /> {dayjs(task.dueDate).format("MMM D")}</i>}{task.steps?.length > 0 && <i>{task.steps.filter((s) => s.done).length}/{task.steps.length} steps</i>}
    </span></div>
    <Tooltip title={task.important ? "Remove from Important" : "Mark important"}><IconButton className="starButton" onClick={(event) => { event.stopPropagation(); onToggleImportant(task); }}>{task.important ? <Star /> : <StarBorder />}</IconButton></Tooltip>
  </article>;
}

function DetailPane({ task, onClose, onPatch, onDelete, onAddStep, onPatchStep, onDeleteStep }) {
  const [stepTitle, setStepTitle] = useState("");
  const [title, setTitle] = useState(task?.title || "");
  const [note, setNote] = useState(task?.note || "");
  useEffect(() => setTitle(task?.title || ""), [task?.id, task?.title]);
  useEffect(() => setNote(task?.note || ""), [task?.id, task?.note]);
  if (!task) return null;
  const inMyDay = task.myDay === todayKey();
  async function addStep(event) { event.preventDefault(); if (!stepTitle.trim()) return; await onAddStep(task.id, stepTitle); setStepTitle(""); }
  async function setReminder(value) {
    if (value?.isValid() && "Notification" in window && Notification.permission === "default") await Notification.requestPermission();
    onPatch(task.id, { reminderAt: value?.isValid() ? value.toISOString() : null });
  }
  return <aside className="detailPane" aria-label="Task details">
    <header className="detailHeader"><IconButton onClick={onClose}><ChevronLeft /></IconButton><span>Task details</span><IconButton onClick={onClose}><Close /></IconButton></header>
    <section className="detailCard taskHeadline">
      <IconButton onClick={() => onPatch(task.id, { done: !task.done })}>{task.done ? <Check /> : <RadioButtonUnchecked />}</IconButton>
      <TextField variant="standard" fullWidth multiline value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => { const clean = title.trim(); if (clean && clean !== task.title) onPatch(task.id, { title: clean }); else setTitle(task.title); }} />
      <IconButton onClick={() => onPatch(task.id, { important: !task.important })}>{task.important ? <Star /> : <StarBorder />}</IconButton>
    </section>
    <section className="detailCard stepsCard">
      {task.steps?.map((step) => <div className="stepRow" key={step.id}><Checkbox size="small" checked={step.done} onChange={() => onPatchStep(step.id, { done: !step.done })} /><span className={step.done ? "done" : ""}>{step.title}</span><IconButton size="small" onClick={() => onDeleteStep(step.id)}><Close fontSize="small" /></IconButton></div>)}
      <form className="addStep" onSubmit={addStep}><Add /><input value={stepTitle} onChange={(e) => setStepTitle(e.target.value)} placeholder="Add step" /></form>
    </section>
    <section className="detailCard actionCard">
      <button className={inMyDay ? "selected" : ""} onClick={() => onPatch(task.id, { myDay: inMyDay ? null : todayKey() })}><Sunny /><span>{inMyDay ? "Added to My Day" : "Add to My Day"}</span>{inMyDay && <Check />}</button>
    </section>
    <section className="detailCard scheduleCard">
      <div className="pickerRow"><NotificationsNone /><DateTimePicker label="Remind me" value={task.reminderAt ? dayjs(task.reminderAt) : null} onAccept={setReminder} slotProps={{ field: { clearable: true, onClear: () => setReminder(null) } }} /></div>
      <div className="pickerRow"><CalendarMonth /><DatePicker label="Due date" value={task.dueDate ? dayjs(task.dueDate) : null} onAccept={(value) => onPatch(task.id, { dueDate: value?.isValid() ? value.format("YYYY-MM-DD") : null })} slotProps={{ field: { clearable: true, onClear: () => onPatch(task.id, { dueDate: null }) } }} /></div>
      <div className="pickerRow"><EventRepeat /><Select displayEmpty value={task.repeatRule || ""} onChange={(e) => onPatch(task.id, { repeatRule: e.target.value || null })}>
        <MenuItem value="">Does not repeat</MenuItem><MenuItem value="daily">Daily</MenuItem><MenuItem value="weekdays">Weekdays</MenuItem><MenuItem value="weekly">Weekly</MenuItem><MenuItem value="monthly">Monthly</MenuItem><MenuItem value="yearly">Yearly</MenuItem>
      </Select></div>
    </section>
    <section className="detailCard noteCard"><TextField fullWidth multiline minRows={5} placeholder="Add note" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== task.note && onPatch(task.id, { note })} /></section>
    <footer className="detailFooter"><span>Created {dayjs(task.createdAt).format("MMM D, YYYY")}</span><IconButton color="error" onClick={() => onDelete(task.id)}><DeleteOutline /></IconButton></footer>
  </aside>;
}

function App() {
  const [authenticated, setAuthenticated] = useState(null);
  const [state, setState] = useState({ lists: [], tasks: [] });
  const [view, setView] = useState("today");
  const [selectedId, setSelectedId] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [error, setError] = useState("");
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [currentDay, setCurrentDay] = useState(todayKey());

  const fail = (error) => { if (error.unauthorized) setAuthenticated(false); else setError(error.message); };
  async function load() { try { setState(await request("/state")); setAuthenticated(true); } catch (error) { fail(error); } }
  useEffect(() => { fetch(`${API}/auth/status`).then((r) => r.json()).then((x) => x.authenticated ? load() : setAuthenticated(false)).catch(() => setAuthenticated(false)); }, []);
  useEffect(() => { const refresh = () => !document.hidden && authenticated && load(); document.addEventListener("visibilitychange", refresh); return () => document.removeEventListener("visibilitychange", refresh); }, [authenticated]);
  useEffect(() => { const timer = setInterval(() => setCurrentDay(todayKey()), 60_000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "granted") return undefined;
    const timers = state.tasks.filter((task) => task.reminderAt && !task.done).map((task) => {
      const delay = new Date(task.reminderAt).getTime() - Date.now();
      if (delay <= 0 || delay > 2_147_000_000) return null;
      return setTimeout(() => new Notification(task.title, { body: "Ledger reminder", icon: "/icons/icon-192.png", tag: `ledger-${task.id}` }), delay);
    }).filter(Boolean);
    return () => timers.forEach(clearTimeout);
  }, [state.tasks]);

  const selectedTask = state.tasks.find((task) => task.id === selectedId);
  const visibleTasks = useMemo(() => state.tasks.filter((task) => isTaskInView(task, view, currentDay)), [state.tasks, view, currentDay]);
  const counts = useMemo(() => Object.fromEntries([...views.map((x) => x.id), ...state.lists.map((x) => x.id)].map((id) => [id, state.tasks.filter((task) => !task.done && isTaskInView(task, id, currentDay)).length])), [state, currentDay]);
  const title = views.find((x) => x.id === view)?.label || state.lists.find((x) => x.id === view)?.name || "Tasks";

  function replaceTask(updated) { setState((old) => ({ ...old, tasks: old.tasks.map((task) => task.id === updated.id ? updated : task) })); }
  async function patchTask(id, patch, localOnly = false) {
    if (localOnly) { setState((old) => ({ ...old, tasks: old.tasks.map((task) => task.id === id ? { ...task, ...patch } : task) })); return; }
    try {
      const current = state.tasks.find((task) => task.id === id);
      replaceTask(await request(`/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }));
      if (patch.done === true && current?.repeatRule) await load();
    } catch (error) { fail(error); await load(); }
  }
  async function addTask(event) {
    event.preventDefault(); const title = addTitle.trim(); if (!title) return;
    const listId = ["today", "important", "planned", "all"].includes(view) ? "all" : view;
    const body = { title, myDay: view === "today" ? currentDay : null, important: view === "important", dueDate: view === "planned" ? currentDay : null };
    try { const task = await request(`/lists/${listId}/tasks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); setState((old) => ({ ...old, tasks: [...old.tasks, task] })); setAddTitle(""); } catch (error) { fail(error); }
  }
  async function deleteTask(id) { try { await request(`/tasks/${id}`, { method: "DELETE" }); setState((old) => ({ ...old, tasks: old.tasks.filter((x) => x.id !== id) })); setSelectedId(null); } catch (error) { fail(error); } }
  async function addStep(taskId, title) { try { const step = await request(`/tasks/${taskId}/steps`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }); setState((old) => ({ ...old, tasks: old.tasks.map((task) => task.id === taskId ? { ...task, steps: [...(task.steps || []), step] } : task) })); } catch (error) { fail(error); } }
  async function patchStep(id, patch) { try { const step = await request(`/steps/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }); setState((old) => ({ ...old, tasks: old.tasks.map((task) => task.id === step.taskId ? { ...task, steps: task.steps.map((x) => x.id === id ? step : x) } : task) })); } catch (error) { fail(error); } }
  async function deleteStep(id) { try { await request(`/steps/${id}`, { method: "DELETE" }); setState((old) => ({ ...old, tasks: old.tasks.map((task) => ({ ...task, steps: task.steps?.filter((x) => x.id !== id) })) })); } catch (error) { fail(error); } }
  async function createList() { const name = newListName.trim(); if (!name) return; try { const list = await request("/lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }); setState((old) => ({ ...old, lists: [...old.lists, list] })); setView(list.id); setNewListName(""); setNewListOpen(false); } catch (error) { fail(error); } }
  async function deleteList(list) { if (!confirm(`Delete “${list.name}” and its tasks?`)) return; try { await request(`/lists/${list.id}`, { method: "DELETE" }); setState((old) => ({ lists: old.lists.filter((x) => x.id !== list.id), tasks: old.tasks.filter((x) => x.listId !== list.id) })); if (view === list.id) setView("today"); } catch (error) { fail(error); } }
  async function logout() { await fetch(`${API}/auth/logout`, { method: "POST" }); setAuthenticated(false); }

  if (authenticated === null) return <div className="centerLoader"><CircularProgress /></div>;
  if (!authenticated) return <Login onLogin={load} />;
  return <div className={`appShell ${selectedTask ? "detailsOpen" : ""}`}>
    <Sidebar view={view} setView={setView} lists={state.lists} counts={counts} onNewList={() => setNewListOpen(true)} onDeleteList={deleteList} mobileOpen={mobileOpen} closeMobile={() => setMobileOpen(false)} onLogout={logout} />
    <main className="taskArea">
      <header className="topbar"><IconButton className="menuButton" onClick={() => setMobileOpen(true)}><Menu /></IconButton><div><h1>{title}</h1><span>{dayjs().format("dddd, MMMM D")}</span></div></header>
      <div className="taskScroller">
        <form className="quickAdd" onSubmit={addTask}><Add /><input aria-label={`Add a task to ${title}`} placeholder="Add a task" value={addTitle} onChange={(e) => setAddTitle(e.target.value)} /><button type="submit">Add</button></form>
        <section className="taskList">
          {visibleTasks.map((task) => <TaskRow key={task.id} task={task} listName={state.lists.find((x) => x.id === task.listId)?.name} onOpen={setSelectedId} onToggleDone={(x) => patchTask(x.id, { done: !x.done })} onToggleImportant={(x) => patchTask(x.id, { important: !x.important })} />)}
          {!visibleTasks.length && <div className="empty"><TaskAlt /><h2>Nothing here</h2><p>Add a task when you’re ready.</p></div>}
        </section>
      </div>
    </main>
    <DetailPane task={selectedTask} onClose={() => setSelectedId(null)} onPatch={patchTask} onDelete={deleteTask} onAddStep={addStep} onPatchStep={patchStep} onDeleteStep={deleteStep} />
    <Dialog open={newListOpen} onClose={() => setNewListOpen(false)} fullWidth maxWidth="xs"><DialogTitle>New list</DialogTitle><DialogContent><TextField autoFocus fullWidth margin="dense" label="List name" value={newListName} onChange={(e) => setNewListName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createList()} /></DialogContent><DialogActions><Button onClick={() => setNewListOpen(false)}>Cancel</Button><Button variant="contained" onClick={createList}>Create</Button></DialogActions></Dialog>
    <Snackbar open={!!error} autoHideDuration={5000} onClose={() => setError("")}><Alert severity="error" onClose={() => setError("")}>{error}</Alert></Snackbar>
  </div>;
}

export default App;
