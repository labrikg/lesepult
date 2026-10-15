import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { BrandMark } from "./components/BrandMark";
import { useStore } from "./store";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { PdfPane } from "./components/PdfPane";
import { NotePane } from "./components/NotePane";
import { SearchDialog } from "./components/SearchDialog";
import { InlineInput } from "./components/InlineInput";
import { applyTheme, onSystemThemeChange } from "./lib/theme";
import { TodayView } from "./study/TodayView";
import { CourseView } from "./study/CourseView";
import { StatsView } from "./study/StatsView";
import { ReviewSession } from "./study/ReviewSession";
import { TimerHost } from "./study/Timer";

export default function App() {
  const init = useStore((s) => s.init);
  const ready = useStore((s) => s.ready);
  const error = useStore((s) => s.error);
  const notice = useStore((s) => s.notice);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => useStore.setState({ notice: null }), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    init().then(() => useStore.getState().loadStudyMeta());
  }, [init]);

  // Learning cards come due within minutes: keep the counts fresh.
  useEffect(() => {
    const refresh = () => useStore.getState().loadStudyMeta();
    const t = window.setInterval(refresh, 5 * 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const review = useStore((s) => s.review);

  // Theme: match the window to the saved choice, and follow the system when set to "System".
  useEffect(() => {
    const { themePref, theme, darkPdf, syncSystemTheme } = useStore.getState();
    applyTheme(themePref, theme, darkPdf);
    return onSystemThemeChange(syncSystemTheme);
  }, []);

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <TopBar />
        {ready ? <Workspace /> : <div className="loading" aria-busy="true" />}
      </main>
      <SearchDialog />
      <TimerHost />
      {review && <ReviewSession courseId={review.courseId} cram={!!review.cram} />}
      {notice && !error && (
        <div className="toast toast--ok" role="status">
          <Check size={15} aria-hidden="true" />
          <span>{notice}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => useStore.setState({ notice: null })}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
      {error && (
        <div className="toast" role="alert">
          <span>Something went wrong: {error}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => useStore.setState({ error: null })}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

function Workspace() {
  const page = useStore((s) => s.page);
  const viewMode = useStore((s) => s.viewMode);
  const view = useStore((s) => s.view);

  if (view.kind === "today")
    return (
      <div className="study-pane">
        <TodayView />
      </div>
    );
  if (view.kind === "stats")
    return (
      <div className="study-pane">
        <StatsView />
      </div>
    );
  if (view.kind === "course")
    return (
      <div className="study-pane">
        <CourseView courseId={view.courseId} />
      </div>
    );
  if (!page) return <Welcome />;

  return (
    <div className={`workspace workspace--${viewMode}`}>
      {viewMode !== "note" && <PdfPane />}
      {viewMode !== "pdf" && <NotePane page={page} />}
    </div>
  );
}

function Welcome() {
  const tree = useStore((s) => s.tree);
  const addSemester = useStore((s) => s.addSemester);
  const [adding, setAdding] = useState(false);
  const empty = tree.length === 0;

  return (
    <div className="welcome">
      <div className="empty-card">
        <BrandMark size={56} />
        <h1>{empty ? "Welcome to Lesepult" : "Pick a page"}</h1>
        <p>
          {empty
            ? "Start with a semester, add your courses to it, then create pages for lectures and exercises."
            : "Choose a page in the sidebar, or create one with “Add page” under a course."}
        </p>
        {empty &&
          (adding ? (
            <InlineInput
              label="Semester name"
              placeholder="e.g. Winter 26/27"
              onSubmit={(name) => {
                setAdding(false);
                addSemester(name);
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setAdding(true)}
            >
              Add your first semester
            </button>
          ))}
      </div>
    </div>
  );
}
