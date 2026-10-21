"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, CloudOff, Loader2, Plus, QrCode } from "lucide-react";
import { createDefect, syncOfflineDefect } from "@/app/actions";

type Opt = { id: string; label: string };
type Draft = {
  clientKey: string;
  projectId: string;
  title: string;
  locationId: string;
  room?: string;
  trade: string;
  contractorId?: string;
  priority: "low" | "medium" | "high" | "critical";
  dueDate?: string;
  photoCount: number;
  savedAt: string;
};

const QUEUE_KEY = "buildos_offline_defects";

function readQueue(): Draft[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function writeQueue(q: Draft[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* storage unavailable — draft stays in memory only */
  }
}

/**
 * Raise a defect in seconds: photo first, location, contractor, priority, due.
 * Offline, the draft and photo count are kept on the device and sent when
 * signal returns. A client key makes the retry idempotent on the server.
 * Note: photo files themselves are not uploaded in this prototype.
 */
export function DefectForm({
  projectId, locations, contractors, trades, canAssign, variant = "desktop", doneHref,
}: {
  projectId: string;
  locations: Opt[];
  contractors: (Opt & { trade: string })[];
  trades: string[];
  canAssign: boolean;
  variant?: "desktop" | "mobile";
  doneHref?: string;
}) {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [previews, setPreviews] = useState<string[]>([]);
  const [contractorId, setContractorId] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string; offline?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    setQueued(readQueue().length);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Send anything saved offline once we're back online.
  useEffect(() => {
    if (!online) return;
    const q = readQueue();
    if (!q.length) return;
    (async () => {
      const left: Draft[] = [];
      for (const d of q) {
        try {
          const { savedAt: _s, ...input } = d;
          void _s;
          const r = await syncOfflineDefect(input);
          if (!r.ok) left.push(d);
        } catch {
          left.push(d);
        }
      }
      writeQueue(left);
      setQueued(left.length);
      if (left.length < q.length) {
        setResult({ ok: true, message: `${q.length - left.length} defect${q.length - left.length > 1 ? "s" : ""} saved offline ${q.length - left.length > 1 ? "were" : "was"} sent.` });
        router.refresh();
      }
    })();
  }, [online, router]);

  function onPhotos(files: FileList | null) {
    if (!files) return;
    setPreviews((p) => [...p, ...Array.from(files).map((f) => URL.createObjectURL(f))]);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>, mode: "submit" | "draft") {
    e.preventDefault();
    const form = formRef.current!;
    const fd = new FormData(form);
    // A draft is saved as a Draft record: not yet in the open register.
    if (mode === "draft") fd.set("draft", "1");
    const clientKey = crypto.randomUUID();
    fd.set("clientKey", clientKey);
    const draft: Draft = {
      clientKey,
      projectId,
      title: String(fd.get("title") ?? ""),
      locationId: String(fd.get("locationId") ?? ""),
      room: String(fd.get("room") ?? "") || undefined,
      trade: String(fd.get("trade") ?? ""),
      contractorId: String(fd.get("contractorId") ?? "") || undefined,
      priority: (String(fd.get("priority") ?? "medium") as Draft["priority"]),
      dueDate: String(fd.get("dueDate") ?? "") || undefined,
      photoCount: fileRef.current?.files?.length ?? 0,
      savedAt: new Date().toISOString(),
    };
    const saveOffline = () => {
      const q = [...readQueue(), draft];
      writeQueue(q);
      setQueued(q.length);
      setResult({ ok: true, offline: true, message: `No signal — this defect${draft.photoCount ? ` and its ${draft.photoCount} photo${draft.photoCount > 1 ? "s" : ""}` : ""} ${draft.photoCount ? "are" : "is"} saved on your phone and will send automatically.` });
      form.reset();
      setPreviews([]);
      setContractorId("");
    };
    if (!navigator.onLine) return saveOffline();
    start(async () => {
      try {
        const r = await createDefect(null, fd);
        setResult(r);
        if (r?.ok) {
          form.reset();
          setPreviews([]);
          setContractorId("");
          router.refresh();
          if (doneHref) setTimeout(() => router.push(doneHref), 900);
        }
      } catch {
        saveOffline();
      }
    });
  }

  const mobile = variant === "mobile";
  return (
    <form ref={formRef} onSubmit={(e) => onSubmit(e, "submit")} className="stack" style={{ gap: 14 }} noValidate>
      <input type="hidden" name="projectId" value={projectId} />
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="label">Photos first</span>
        {online ? (
          queued > 0 ? <span className="badge badge-blue">{queued} waiting to send</span> : <span className="badge badge-green"><CheckCircle2 size={12} />Online</span>
        ) : (
          <span className="badge badge-dashed"><CloudOff size={12} />Offline</span>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
        <div className="photo-ph" style={{ minHeight: mobile ? 170 : 150, backgroundImage: previews[0] ? `url(${previews[0]})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }}>
          {!previews[0] && "Take or add a photo"}
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <div className="photo-ph" style={{ minHeight: 0, background: previews[1] ? `center/cover url(${previews[1]})` : "#dfe5e1" }} />
          <label className="photo-ph" style={{ minHeight: 0, background: "#fff", border: "1.5px dashed #a9b1aa", color: "var(--muted)", cursor: "pointer" }}>
            <Plus size={22} aria-hidden /><span className="sr-only">Add photos</span>
            <input ref={fileRef} type="file" name="photos" accept="image/*" capture="environment" multiple hidden onChange={(e) => onPhotos(e.target.files)} />
          </label>
        </div>
      </div>
      {previews.length > 0 && <span className="small muted">{previews.length} photo{previews.length > 1 ? "s" : ""} attached</span>}

      <label className="field"><span>What&apos;s wrong? <span className="req">*</span></span>
        <input name="title" className="input" required placeholder="e.g. Membrane lap short at shower hob" style={mobile ? { height: 48, fontSize: 16 } : undefined} />
      </label>

      <div className="field">
        <span id="loc-label">Location <span className="req">*</span></span>
        <div className="row">
          <select name="locationId" aria-labelledby="loc-label" className="input" required defaultValue="" style={mobile ? { height: 48, fontSize: 16 } : undefined}>
            <option value="" disabled>Building › Level › Zone</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <button type="button" className="icon-btn" style={{ width: 48, height: mobile ? 48 : 40, flex: "none" }} title="Scan room QR code" onClick={() => alert("QR location scanning uses the camera — planned for the PWA build.")}>
            <QrCode size={18} aria-hidden /><span className="sr-only">Scan QR</span>
          </button>
        </div>
        <input name="room" className="input" placeholder="Room / unit (optional)" style={mobile ? { height: 48, fontSize: 16 } : undefined} />
      </div>

      <label className="field"><span>Trade</span>
        <select name="trade" className="input" defaultValue="" style={mobile ? { height: 48, fontSize: 16 } : undefined}>
          <option value="">General</option>
          {trades.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>

      {canAssign && (
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Responsible contractor</legend>
          <div className="row wrap" style={{ gap: 6 }}>
            {contractors.map((c) => (
              <label key={c.id} className="chip" data-active={contractorId === c.id} style={{ height: mobile ? 44 : 32, cursor: "pointer" }}>
                <input type="radio" name="contractorId" value={c.id} checked={contractorId === c.id} onChange={() => setContractorId(c.id)} className="sr-only" />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <label className="field"><span>Priority</span>
          <select name="priority" className="input" defaultValue="high" style={mobile ? { height: 48, fontSize: 16 } : undefined}>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
          </select>
        </label>
        <label className="field"><span>Due {canAssign && contractorId && <span className="req">*</span>}</span>
          <input type="date" name="dueDate" className="input" style={mobile ? { height: 48, fontSize: 16 } : undefined} />
        </label>
      </div>
      {canAssign && contractorId && <p className="small muted" style={{ marginTop: -6 }}>Add a due date to assign it now; otherwise it&apos;s raised as Open.</p>}

      {result && (
        <div className={`notice ${result.ok ? (result.offline ? "notice-info" : "notice-ok") : "notice-error"}`} role={result.ok ? "status" : "alert"}>
          {result.offline ? <CloudOff size={16} /> : result.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{result.message}</span>
        </div>
      )}

      <div className="row" style={{ gap: 10 }}>
        <button type="button" className={`btn ${mobile ? "btn-lg" : ""}`} style={{ flex: mobile ? 1 : undefined }} disabled={pending} onClick={(e) => onSubmit(e as unknown as React.FormEvent<HTMLFormElement>, "draft")}>
          Save draft
        </button>
        <button type="submit" className={`btn btn-primary ${mobile ? "btn-lg" : ""}`} style={{ flex: mobile ? 1.4 : undefined }} disabled={pending} data-pending={pending}>
          {pending && <Loader2 size={15} className="spin" aria-hidden />}
          {pending ? "Raising…" : canAssign ? "Raise & assign" : "Raise defect"}
        </button>
      </div>
    </form>
  );
}
