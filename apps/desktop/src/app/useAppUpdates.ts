import { invoke, isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

export type AvailableUpdate = { version: string; releaseUrl: string; canInstall: boolean };
export type AppUpdates = ReturnType<typeof useAppUpdates>;

export function useAppUpdates() {
  const [available, setAvailable] = useState<AvailableUpdate | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const inFlight = useRef(false);
  const demo = import.meta.env.DEV && new URLSearchParams(window.location.search).has("updatePreview");

  const check = useCallback(async () => {
    if (inFlight.current) return;
    if (!isTauri() && !demo) return;
    inFlight.current = true;
    setChecking(true);
    setError(null);
    try {
      const update = demo ? { version: "0.2.5", releaseUrl: "https://github.com/Mortann/BlendUp/releases", canInstall: true } : await invoke<AvailableUpdate | null>("check_app_update");
      setAvailable(update);
      setChecked(true);
    } catch (err) { setError(String(err)); }
    finally { setChecking(false); inFlight.current = false; }
  }, [demo]);

  useEffect(() => {
    const startup = window.setTimeout(() => void check(), 1500);
    const periodic = window.setInterval(() => void check(), 6 * 60 * 60 * 1000);
    return () => { window.clearTimeout(startup); window.clearInterval(periodic); };
  }, [check]);

  const install = useCallback(async () => {
    if (!available || inFlight.current) return;
    if (demo) { setError("Aperçu de l’interface : installation disponible dans l’application desktop."); return; }
    inFlight.current = true;
    setInstalling(true);
    setError(null);
    try { await invoke("install_app_update", { version: available.version }); }
    catch (err) { setError(String(err)); }
    finally { setInstalling(false); inFlight.current = false; }
  }, [available, demo]);

  const openRelease = async () => {
    if (!available) return;
    try {
      if (isTauri()) await invoke("open_app_update_release", { version: available.version });
      else window.open(available.releaseUrl, "_blank", "noopener,noreferrer");
    } catch (err) { setError(String(err)); }
  };

  return { available, checking, installing, checked, error, check, install, openRelease,
    noticeVisible: available !== null && dismissed !== available.version,
    dismiss: () => setDismissed(available?.version ?? null) };
}
