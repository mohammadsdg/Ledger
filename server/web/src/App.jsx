import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import moment from "moment-jalaali";
import {
  Add, CalendarMonth, Check, ChevronLeft, ChevronRight, Close, DeleteOutline, EventRepeat,
  Logout, Menu, NotificationsNone, RadioButtonUnchecked, Star, StarBorder,
  Sunny, TaskAlt, WbSunnyOutlined,
} from "@mui/icons-material";
import {
  Alert, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, MenuItem, Select, Snackbar, TextField, Tooltip,
} from "@mui/material";
import { DateCalendar, TimeClock } from "@mui/x-date-pickers";
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
      <div className="logoMark">§</div><h1>Ledger</h1><p>Make today feel lighter.</p>
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

function Sidebar({ view, onSelectView, lists, counts, onNewList, onDeleteList, mobileOpen, closeMobile, onLogout, onResizeStart }) {
  return <>
    {mobileOpen && <button className="scrim" aria-label="Close navigation" onClick={closeMobile} />}
    <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
      <div className="brand"><div className="logoMark small">§</div><span>Ledger</span><IconButton size="small" onClick={onLogout} title="Log out"><Logout fontSize="small" /></IconButton></div>
      <nav>
        {views.map(({ id, label, icon: Icon }) => <button key={id} className={`navItem ${view === id ? "active" : ""}`} onClick={() => onSelectView(id)}>
          <Icon fontSize="small" /><span>{label}</span>{counts[id] > 0 && <b>{counts[id]}</b>}
        </button>)}
      </nav>
      <div className="listHeading"><span>Lists</span><IconButton size="small" onClick={onNewList}><Add fontSize="small" /></IconButton></div>
      <nav className="customLists">
        {lists.filter((list) => !SYSTEM_IDS.has(list.id)).map((list) => <div className={`navItem listNav ${view === list.id ? "active" : ""}`} key={list.id}>
          <button onClick={() => onSelectView(list.id)}><span className="listDot" /><span>{list.name}</span><b>{counts[list.id] || ""}</b></button>
          <IconButton className="deleteList" size="small" onClick={() => onDeleteList(list)}><DeleteOutline fontSize="small" /></IconButton>
        </div>)}
      </nav>
      <div className="sidebarResizeHandle" aria-hidden="true" onPointerDown={onResizeStart} />
    </aside>
  </>;
}

function TaskRow({ task, listName, currentDay, onOpen, onToggleDone, onToggleImportant }) {
  const missedMyDay = task.myDay && task.myDay < currentDay && !task.done;
  const missedLabel = missedMyDay && dayjs(currentDay).diff(dayjs(task.myDay), "day") === 1 ? "Yesterday" : "Missed My Day";
  return <article className={`taskRow ${task.done ? "completed" : ""}`} onClick={() => onOpen(task.id)}>
    <IconButton className="checkButton" aria-label={task.done ? "Mark incomplete" : "Mark complete"} onClick={(event) => { event.stopPropagation(); onToggleDone(task); }}>
      {task.done ? <Check /> : <RadioButtonUnchecked />}
    </IconButton>
    <div className="taskCopy"><span className="taskTitle">{task.title}</span><span className="taskMeta">
      {listName && <i>{listName}</i>}{task.myDay === currentDay && <i><Sunny fontSize="inherit" /> My Day</i>}{missedMyDay && <i className="missed"><Sunny fontSize="inherit" /> {missedLabel}</i>}{task.dueDate && <i><CalendarMonth fontSize="inherit" /> {moment(task.dueDate).format("jD jMMM")}</i>}{task.steps?.length > 0 && <i>{task.steps.filter((s) => s.done).length}/{task.steps.length} steps</i>}
    </span></div>
    <Tooltip title={task.important ? "Remove from Important" : "Mark important"}><IconButton className="starButton" onClick={(event) => { event.stopPropagation(); onToggleImportant(task); }}>{task.important ? <Star /> : <StarBorder />}</IconButton></Tooltip>
  </article>;
}

function ReminderControl({ taskId, value, notificationsReady, onSave }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState("date");
  const [date, setDate] = useState(moment());
  const [time, setTime] = useState(moment().add(1, "hour").startOf("hour"));
  const [error, setError] = useState("");

  useEffect(() => {
    const syncWithHistory = (event) => {
      const isThisReminder = event.state?.layer === "reminder" && event.state?.taskId === taskId;
      setOpen(isThisReminder);
      if (!isThisReminder) setStep("date");
    };
    addEventListener("popstate", syncWithHistory);
    return () => removeEventListener("popstate", syncWithHistory);
  }, [taskId]);

  function openReminder() {
    const saved = value ? moment(value) : null;
    const nextTime = saved || moment().add(1, "hour").startOf("hour");
    setDate(saved || moment());
    setTime(nextTime);
    setStep("date");
    setError("");
    history.pushState({ ...history.state, ledger: true, layer: "reminder", taskId }, "");
    setOpen(true);
  }

  function closeReminder() {
    if (history.state?.layer === "reminder" && history.state?.taskId === taskId) history.back();
    else setOpen(false);
  }

  async function saveReminder() {
    const reminder = date.clone().hour(time.hour()).minute(time.minute()).second(0).millisecond(0);
    if (!reminder.isAfter(moment())) {
      setError("Choose a time in the future.");
      return;
    }
    if (await onSave(reminder)) closeReminder();
  }

  async function removeReminder() {
    if (await onSave(null)) closeReminder();
  }

  return <>
    <button type="button" className={`reminderRow ${value ? "hasValue" : ""}`} onClick={openReminder}>
      <span className={`reminderIcon ${notificationsReady ? "ready" : ""}`}><NotificationsNone /></span>
      <span className="reminderCopy"><strong>Remind me</strong></span>
      <ChevronRight className="reminderChevron" />
    </button>
    <Dialog className="reminderDialog" open={open} onClose={closeReminder} fullWidth maxWidth="xs">
      <DialogTitle>Set a reminder</DialogTitle>
      <DialogContent dividers>
        <div className="reminderSteps" aria-label="Reminder setup progress">
          <span className={step === "date" ? "active" : "done"}><b>1</b> Date</span>
          <span className={step === "time" ? "active" : ""}><b>2</b> Time</span>
        </div>
        {step === "date" ? <div className="reminderPicker">
          <DateCalendar value={date} onChange={(next) => next && setDate(next)} disablePast sx={{ width: "100%", maxWidth: 320 }} />
        </div> : <>
          <div className="reminderDateSummary"><CalendarMonth /><span>{date.format("dddd, jD jMMMM jYYYY")}</span><Button size="small" onClick={() => setStep("date")}>Change</Button></div>
          <div className="reminderPicker"><TimeClock value={time} onChange={(next) => next && setTime(next)} views={["hours", "minutes"]} minutesStep={5} sx={{ width: "100%", maxWidth: 320 }} /></div>
        </>}
        {error && <p className="reminderError">{error}</p>}
      </DialogContent>
      <DialogActions className="reminderActions">
        {value && <Button color="error" onClick={removeReminder}>Remove</Button>}
        <span />
        <Button onClick={step === "date" ? closeReminder : () => { setError(""); setStep("date"); }}>{step === "date" ? "Cancel" : "Back"}</Button>
        <Button variant="contained" onClick={() => { setError(""); step === "date" ? setStep("time") : saveReminder(); }}>{step === "date" ? "Choose time" : "Save reminder"}</Button>
      </DialogActions>
    </Dialog>
  </>;
}

function DueDateControl({ taskId, value, onSave }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(moment());

  useEffect(() => {
    const syncWithHistory = (event) => setOpen(event.state?.layer === "due-date" && event.state?.taskId === taskId);
    addEventListener("popstate", syncWithHistory);
    return () => removeEventListener("popstate", syncWithHistory);
  }, [taskId]);

  function openDueDate() {
    setDate(value ? moment(value, "YYYY-MM-DD") : moment());
    history.pushState({ ...history.state, ledger: true, layer: "due-date", taskId }, "");
    setOpen(true);
  }

  function closeDueDate() {
    if (history.state?.layer === "due-date" && history.state?.taskId === taskId) history.back();
    else setOpen(false);
  }

  async function saveDueDate() {
    await onSave(date.format("YYYY-MM-DD"));
    closeDueDate();
  }

  async function removeDueDate() {
    await onSave(null);
    closeDueDate();
  }

  return <>
    <button type="button" className={`reminderRow dueDateRow ${value ? "hasValue" : ""}`} onClick={openDueDate}>
      <span className="reminderIcon"><CalendarMonth /></span>
      <span className="reminderCopy"><strong>Due date</strong></span>
      <ChevronRight className="reminderChevron" />
    </button>
    <Dialog className="reminderDialog dueDateDialog" open={open} onClose={closeDueDate} fullWidth maxWidth="xs">
      <DialogTitle>Set a due date</DialogTitle>
      <DialogContent dividers>
        <div className="dueDateHeading"><CalendarMonth /><span>{date.format("dddd, jD jMMMM jYYYY")}</span></div>
        <div className="reminderPicker dueDatePicker"><DateCalendar value={date} onChange={(next) => next && setDate(next)} sx={{ width: "100%", maxWidth: 320 }} /></div>
      </DialogContent>
      <DialogActions className="reminderActions">
        {value && <Button color="error" onClick={removeDueDate}>Remove</Button>}
        <span />
        <Button onClick={closeDueDate}>Cancel</Button>
        <Button variant="contained" onClick={saveDueDate}>Save date</Button>
      </DialogActions>
    </Dialog>
  </>;
}

function DetailPane({ task, notificationsReady, onEnableNotifications, onClose, onPatch, onDelete, onAddStep, onPatchStep, onDeleteStep }) {
  const [stepTitle, setStepTitle] = useState("");
  const [title, setTitle] = useState(task?.title || "");
  const [note, setNote] = useState(task?.note || "");
  useEffect(() => setTitle(task?.title || ""), [task?.id, task?.title]);
  useEffect(() => setNote(task?.note || ""), [task?.id, task?.note]);
  if (!task) return null;
  const inMyDay = task.myDay === todayKey();
  async function addStep(event) { event.preventDefault(); if (!stepTitle.trim()) return; await onAddStep(task.id, stepTitle); setStepTitle(""); }
  async function setReminder(value) {
    if (value?.isValid() && !(await onEnableNotifications())) return false;
    await onPatch(task.id, { reminderAt: value?.isValid() ? value.toISOString() : null });
    return true;
  }
  return <aside className="detailPane" aria-label="Task details">
    <header className="detailHeader"><IconButton onClick={onClose}><ChevronLeft /></IconButton><span>Task details</span><IconButton onClick={onClose}><Close /></IconButton></header>
    <section className="detailCard taskHeadline">
      <IconButton onClick={() => onPatch(task.id, { done: !task.done })}>{task.done ? <Check /> : <RadioButtonUnchecked />}</IconButton>
      <TextField variant="standard" fullWidth multiline value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => { const clean = title.trim(); if (clean && clean !== task.title) onPatch(task.id, { title: clean }); else setTitle(task.title); }} />
      <IconButton onClick={() => onPatch(task.id, { important: !task.important })}>{task.important ? <Star /> : <StarBorder />}</IconButton>
    </section>
    <section className="detailCard stepsCard">
      {task.steps?.map((step) => <div className="stepRow" key={step.id}><Checkbox size="small" checked={step.done} onChange={() => onPatchStep(step.id, { done: !step.done })} /><span className={`stepTitle ${step.done ? "done" : ""}`}>{step.title}</span><IconButton size="small" onClick={() => onDeleteStep(step.id)}><Close fontSize="small" /></IconButton></div>)}
      <form className="addStep" onSubmit={addStep}><Add /><input value={stepTitle} onChange={(e) => setStepTitle(e.target.value)} placeholder="Add step" /></form>
    </section>
    <section className="detailCard actionCard">
      <button className={inMyDay ? "selected" : ""} onClick={() => onPatch(task.id, { myDay: inMyDay ? null : todayKey() })}><Sunny /><span>{inMyDay ? "Added to My Day" : "Add to My Day"}</span>{inMyDay && <Check />}</button>
    </section>
    <section className="detailCard scheduleCard">
      <ReminderControl taskId={task.id} value={task.reminderAt} notificationsReady={notificationsReady} onSave={setReminder} />
      <DueDateControl taskId={task.id} value={task.dueDate} onSave={(dueDate) => onPatch(task.id, { dueDate })} />
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
  const [notificationsReady, setNotificationsReady] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => Math.min(380, Math.max(190, Number(localStorage.getItem("ledger-sidebar-width")) || 250)));

  const fail = (error) => { if (error.unauthorized) setAuthenticated(false); else setError(error.message); };
  async function load() { try { const next = await request("/state"); setState(next); setAuthenticated(true); const taskId = new URLSearchParams(location.search).get("task"); if (taskId && next.tasks.some((task) => task.id === taskId)) setSelectedId(taskId); } catch (error) { fail(error); } }
  useEffect(() => {
    if (!history.state?.ledger) {
      const taskId = new URLSearchParams(location.search).get("task");
      const taskUrl = `${location.pathname}${location.search}`;
      history.replaceState({ ledger: true, view: "today" }, "", location.pathname);
      if (taskId) history.pushState({ ledger: true, view: "today", layer: "task", taskId }, "", taskUrl);
    }
    const onPopState = (event) => {
      const entry = event.state;
      if (!entry?.ledger) return;
      setView(entry.view || "today");
      setSelectedId(["task", "reminder", "due-date"].includes(entry.layer) ? entry.taskId : null);
      setMobileOpen(entry.layer === "sidebar");
      setNewListOpen(entry.layer === "new-list");
    };
    addEventListener("popstate", onPopState);
    return () => removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => { fetch(`${API}/auth/status`).then((r) => r.json()).then((x) => x.authenticated ? load() : setAuthenticated(false)).catch(() => setAuthenticated(false)); }, []);
  useEffect(() => { const refresh = () => !document.hidden && authenticated && load(); document.addEventListener("visibilitychange", refresh); return () => document.removeEventListener("visibilitychange", refresh); }, [authenticated]);
  useEffect(() => { const timer = setInterval(() => setCurrentDay(todayKey()), 60_000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (authenticated && "Notification" in window && Notification.permission === "granted") enableNotifications().catch(() => {}); }, [authenticated]);

  const selectedTask = state.tasks.find((task) => task.id === selectedId);
  const visibleTasks = useMemo(() => state.tasks.filter((task) => isTaskInView(task, view, currentDay)), [state.tasks, view, currentDay]);
  const counts = useMemo(() => Object.fromEntries([...views.map((x) => x.id), ...state.lists.map((x) => x.id)].map((id) => [id, state.tasks.filter((task) => !task.done && isTaskInView(task, id, currentDay)).length])), [state, currentDay]);
  const title = views.find((x) => x.id === view)?.label || state.lists.find((x) => x.id === view)?.name || "Tasks";

  function replaceTask(updated) { setState((old) => ({ ...old, tasks: old.tasks.map((task) => task.id === updated.id ? updated : task) })); }
  async function enableNotifications() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw new Error("Push notifications are not supported on this device.");
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Allow notifications to receive task reminders.");
    const registration = await navigator.serviceWorker.ready;
    const { publicKey } = await request("/push/public-key");
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
    await request("/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription) });
    setNotificationsReady(true);
    return true;
  }
  async function disableNotifications() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await request("/push/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
    await subscription.unsubscribe();
    setNotificationsReady(false);
  }
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
  async function deleteTask(id) { try { await request(`/tasks/${id}`, { method: "DELETE" }); setState((old) => ({ ...old, tasks: old.tasks.filter((x) => x.id !== id) })); closeSelectedTask(); } catch (error) { fail(error); } }
  async function addStep(taskId, title) { try { const step = await request(`/tasks/${taskId}/steps`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }); setState((old) => ({ ...old, tasks: old.tasks.map((task) => task.id === taskId ? { ...task, steps: [...(task.steps || []), step] } : task) })); } catch (error) { fail(error); } }
  async function patchStep(id, patch) { try { const step = await request(`/steps/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }); setState((old) => ({ ...old, tasks: old.tasks.map((task) => task.id === step.taskId ? { ...task, steps: task.steps.map((x) => x.id === id ? step : x) } : task) })); } catch (error) { fail(error); } }
  async function deleteStep(id) { try { await request(`/steps/${id}`, { method: "DELETE" }); setState((old) => ({ ...old, tasks: old.tasks.map((task) => ({ ...task, steps: task.steps?.filter((x) => x.id !== id) })) })); } catch (error) { fail(error); } }
  async function createList() { const name = newListName.trim(); if (!name) return; try { const list = await request("/lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }); setState((old) => ({ ...old, lists: [...old.lists, list] })); history.replaceState({ ledger: true, view: list.id }, "", location.pathname); setView(list.id); setNewListName(""); setNewListOpen(false); } catch (error) { fail(error); } }
  async function deleteList(list) { if (!confirm(`Delete “${list.name}” and its tasks?`)) return; try { await request(`/lists/${list.id}`, { method: "DELETE" }); setState((old) => ({ lists: old.lists.filter((x) => x.id !== list.id), tasks: old.tasks.filter((x) => x.listId !== list.id) })); if (view === list.id) { history.replaceState({ ledger: true, view: "today" }, "", location.pathname); setView("today"); } } catch (error) { fail(error); } }
  async function logout() { try { await disableNotifications(); } catch (_error) {} await fetch(`${API}/auth/logout`, { method: "POST" }); history.replaceState({ ledger: true, view: "today" }, "", location.pathname); setView("today"); setSelectedId(null); setMobileOpen(false); setNewListOpen(false); setAuthenticated(false); }
  function navigateView(nextView) {
    const entry = { ledger: true, view: nextView };
    if (history.state?.layer === "sidebar") history.replaceState(entry, "", location.pathname);
    else history.pushState(entry, "", location.pathname);
    setView(nextView); setMobileOpen(false); setSelectedId(null);
  }
  function openTask(id) { history.pushState({ ledger: true, view, layer: "task", taskId: id }, "", `?task=${encodeURIComponent(id)}`); setSelectedId(id); }
  function closeSelectedTask() { if (history.state?.layer === "task") history.back(); else setSelectedId(null); }
  function openMobileNav() { if (!mobileOpen) history.pushState({ ledger: true, view, layer: "sidebar" }, "", location.pathname); setMobileOpen(true); }
  function closeMobileNav() { if (history.state?.layer === "sidebar") history.back(); else setMobileOpen(false); }
  function openNewList() { history.pushState({ ledger: true, view, layer: "new-list" }, "", location.pathname); setNewListOpen(true); }
  function closeNewList() { if (history.state?.layer === "new-list") history.back(); else setNewListOpen(false); }
  function startSidebarResize(event) {
    if (innerWidth <= 800) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    let finalWidth = startWidth;
    document.body.classList.add("resizingSidebar");
    const move = (moveEvent) => {
      finalWidth = Math.min(380, Math.max(190, startWidth + moveEvent.clientX - startX));
      setSidebarWidth(finalWidth);
    };
    const stop = () => {
      localStorage.setItem("ledger-sidebar-width", String(Math.round(finalWidth)));
      document.body.classList.remove("resizingSidebar");
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", stop);
      removeEventListener("pointercancel", stop);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", stop);
    addEventListener("pointercancel", stop);
  }

  if (authenticated === null) return <div className="centerLoader"><CircularProgress /></div>;
  if (!authenticated) return <Login onLogin={load} />;
  return <div className={`appShell ${selectedTask ? "detailsOpen" : ""}`} style={{ "--sidebar-width": `${sidebarWidth}px` }}>
    <Sidebar view={view} onSelectView={navigateView} lists={state.lists} counts={counts} onNewList={openNewList} onDeleteList={deleteList} mobileOpen={mobileOpen} closeMobile={closeMobileNav} onLogout={logout} onResizeStart={startSidebarResize} />
    <main className="taskArea">
      <header className="topbar"><IconButton className="menuButton" onClick={openMobileNav}><Menu /></IconButton><div><h1>{title}</h1><span>{dayjs().format("dddd, MMMM D")}</span></div></header>
      <div className="taskScroller">
        <form className="quickAdd" onSubmit={addTask}><Add /><input aria-label={`Add a task to ${title}`} placeholder="Add a task" value={addTitle} onChange={(e) => setAddTitle(e.target.value)} /><button type="submit">Add</button></form>
        <section className="taskList">
          {visibleTasks.map((task) => <TaskRow key={task.id} task={task} currentDay={currentDay} listName={state.lists.find((x) => x.id === task.listId)?.name} onOpen={openTask} onToggleDone={(x) => patchTask(x.id, { done: !x.done })} onToggleImportant={(x) => patchTask(x.id, { important: !x.important })} />)}
          {!visibleTasks.length && <div className="empty"><TaskAlt /><h2>Nothing here</h2><p>Add a task when you’re ready.</p></div>}
        </section>
      </div>
    </main>
    <DetailPane task={selectedTask} notificationsReady={notificationsReady} onEnableNotifications={async () => { try { return await enableNotifications(); } catch (error) { fail(error); return false; } }} onClose={closeSelectedTask} onPatch={patchTask} onDelete={deleteTask} onAddStep={addStep} onPatchStep={patchStep} onDeleteStep={deleteStep} />
    <Dialog open={newListOpen} onClose={closeNewList} fullWidth maxWidth="xs"><DialogTitle>New list</DialogTitle><DialogContent><TextField autoFocus fullWidth margin="dense" label="List name" value={newListName} onChange={(e) => setNewListName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createList()} /></DialogContent><DialogActions><Button onClick={closeNewList}>Cancel</Button><Button variant="contained" onClick={createList}>Create</Button></DialogActions></Dialog>
    <Snackbar open={!!error} autoHideDuration={5000} onClose={() => setError("")}><Alert severity="error" onClose={() => setError("")}>{error}</Alert></Snackbar>
  </div>;
}

export default App;

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}
