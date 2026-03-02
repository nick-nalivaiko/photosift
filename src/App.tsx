import { useEffect } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useAppStore } from "./stores/appStore";
import { initEngine, addReference, getSystemInfo } from "./lib/ipc";
import "./index.css";
import { Header } from "./components/Header";
import { LeftPanel } from "./components/LeftPanel";
import { RightPanel } from "./components/RightPanel";
import { StatusBar } from "./components/StatusBar";

function App() {
  const { setPhase, setProgress, setStats, setSystemInfo, theme } = useAppStore();

  // Sync theme class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  useEffect(() => {
    let unlistenProgress: UnlistenFn | undefined;
    let unlistenError: UnlistenFn | undefined;

    const setupListeners = async () => {
      try {
        await initEngine();
        try {
          const sysInfo = await getSystemInfo();
          setSystemInfo(sysInfo);
        } catch (e) {
          console.error("Failed to get system info:", e);
        }
        // Sync persisted references to the face engine
        const storedRefs = useAppStore.getState().references;
        for (const ref of storedRefs) {
          try {
            await addReference(ref.path, ref.slotId);
          } catch (e) {
            console.error("Failed to sync reference on startup:", e);
          }
        }
      } catch (err) {
        console.error("Failed to init engine:", err);
      }

      unlistenProgress = await listen("progress", (event: any) => {
        const payload = event.payload;
        if (payload.phase) setPhase(payload.phase);
        if (payload.current !== undefined && payload.total !== undefined) {
          setProgress(payload.current, payload.total);
        }
        if (payload.stats) setStats(payload.stats);
      });

      unlistenError = await listen("error", (event: any) => {
        console.error("Sidecar Error:", event.payload);
        setPhase("idle"); // reset on error
        if (event.payload.type === 'error') {
          alert("PhotoSift Engine Error: " + (event.payload.message || "Unknown error"));
        }
      });
    };

    setupListeners();

    return () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenError) unlistenError();
    };
  }, [setPhase, setProgress, setStats]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header />
      <main className="flex-1 flex overflow-hidden">
        <LeftPanel />
        <RightPanel />
      </main>
      <StatusBar />
    </div>
  );
}

export default App;
