"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import type { FormState } from "@/app/actions";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

/**
 * Form wired to a server action. The success message only appears after the
 * server confirms — never optimistically.
 */
export function ActionForm({
  action, children, className, style, resetOnSuccess = false, confirm, confirmFor,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  resetOnSuccess?: boolean;
  /** Ask before irreversible approvals. */
  confirm?: string;
  /** Only confirm when the clicked submit button has this value. */
  confirmFor?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      style={style}
      onSubmit={(e) => {
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const applies = !confirmFor || submitter?.value === confirmFor;
        if (confirm && applies && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state && (
        <div className={`notice ${state.ok ? "notice-ok" : "notice-error"}`} role={state.ok ? "status" : "alert"} style={{ marginTop: 10 }}>
          {state.ok ? <CheckCircle2 size={16} aria-hidden /> : <AlertCircle size={16} aria-hidden />}
          <span>{state.message}</span>
        </div>
      )}
    </form>
  );
}

export function SubmitButton({
  children, pendingLabel, className = "btn btn-primary", name, value,
}: { children: React.ReactNode; pendingLabel?: string; className?: string; name?: string; value?: string }) {
  const { pending, data } = useFormStatus();
  // When a form has several submit buttons, only the clicked one shows a spinner.
  const mine = pending && (!name || data?.get(name) === value);
  return (
    <button type="submit" className={className} disabled={pending} data-pending={mine} name={name} value={value} aria-busy={mine}>
      {mine && <Loader2 size={15} className="spin" aria-hidden />}
      {mine ? (pendingLabel ?? "Saving…") : children}
    </button>
  );
}
