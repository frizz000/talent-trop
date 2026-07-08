"use client";

import { useOptimistic, useState, useTransition } from "react";
import { WORKFLOWS } from "@/lib/workflows";
import { setPipelineEnabled, setWorkflowEnabled } from "./actions";

export type PipelineSettingsRow = {
  is_enabled: boolean;
  disabled_by_reason: string | null;
  updated_at: string | null;
};

export type WorkflowSettingsRow = {
  workflow_id: string;
  is_enabled: boolean;
  updated_at: string | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pl-PL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Switch({
  checked,
  disabled,
  onToggle,
  title,
  size = "sm",
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  title?: string;
  size?: "sm" | "lg";
}) {
  const w = size === "lg" ? 58 : 42;
  const h = size === "lg" ? 30 : 22;
  const knob = h - 6;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      title={title}
      onClick={onToggle}
      style={{
        width: w,
        height: h,
        borderRadius: 999,
        border: `1px solid ${checked ? "transparent" : "var(--color-border-strong)"}`,
        backgroundColor: checked
          ? "var(--color-trend-up)"
          : "var(--color-surface-2)",
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        position: "relative",
        transition: "background-color .15s ease",
        flexShrink: 0,
        padding: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? w - knob - 4 : 2,
          width: knob,
          height: knob,
          borderRadius: "50%",
          backgroundColor: checked ? "#0a0d17" : "var(--color-muted)",
          transition: "left .15s ease",
        }}
      />
    </button>
  );
}

export function PipelineControls({
  global,
  workflows,
}: {
  global: PipelineSettingsRow | null;
  workflows: WorkflowSettingsRow[];
}) {
  const [, startTransition] = useTransition();
  const [reasonDraft, setReasonDraft] = useState("");

  // Brak wiersza (migracja 0008 niewykonana) → traktuj jako włączony;
  // pierwsza zmiana utworzy wiersz przez upsert w server action
  const [optGlobal, setOptGlobal] = useOptimistic<PipelineSettingsRow>(
    global ?? { is_enabled: true, disabled_by_reason: null, updated_at: null }
  );
  const [optWorkflows, applyWorkflowPatch] = useOptimistic(
    workflows,
    (state, patch: { workflow_id: string; is_enabled: boolean }) => {
      const exists = state.some((w) => w.workflow_id === patch.workflow_id);
      const next = exists
        ? state.map((w) =>
            w.workflow_id === patch.workflow_id
              ? { ...w, is_enabled: patch.is_enabled, updated_at: new Date().toISOString() }
              : w
          )
        : [...state, { ...patch, updated_at: new Date().toISOString() }];
      return next;
    }
  );

  const globalOn = optGlobal.is_enabled;

  function toggleGlobal() {
    const next = !globalOn;
    const reason = next ? null : reasonDraft.trim() || null;
    startTransition(async () => {
      setOptGlobal({
        is_enabled: next,
        disabled_by_reason: reason,
        updated_at: new Date().toISOString(),
      });
      await setPipelineEnabled(next, reason);
    });
    if (next) setReasonDraft("");
  }

  function toggleWorkflow(workflowId: string, current: boolean) {
    startTransition(async () => {
      applyWorkflowPatch({ workflow_id: workflowId, is_enabled: !current });
      await setWorkflowEnabled(workflowId, !current);
    });
  }

  return (
    <div className="mb-8">
      {/* Belka ostrzegawcza gdy pipeline globalnie wstrzymany */}
      {!globalOn && (
        <div
          className="mb-4 px-4 py-3"
          style={{
            borderRadius: 12,
            border: "1px solid var(--color-accent)",
            backgroundColor: "rgba(230, 13, 63, 0.12)",
          }}
        >
          <p
            className="text-sm font-bold"
            style={{ color: "var(--color-accent-hover)" }}
          >
            ⚠ Pipeline wstrzymany globalnie — wszystkie workflowy kończą się
            natychmiast
          </p>
          {optGlobal.disabled_by_reason && (
            <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
              Powód: {optGlobal.disabled_by_reason}
            </p>
          )}
        </div>
      )}

      <h2
        className="text-sm font-bold uppercase tracking-wider mb-3"
        style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
      >
        Kontrola Pipeline&apos;u
      </h2>

      {/* Master switch */}
      <div className="card p-5 mb-4">
        <div className="flex flex-wrap items-center gap-5">
          <Switch checked={globalOn} onToggle={toggleGlobal} size="lg" />
          <div className="flex-1 min-w-[200px]">
            <p
              className="text-3xl font-bold uppercase leading-none"
              style={{
                fontFamily: "var(--font-display)",
                color: globalOn
                  ? "var(--color-trend-up)"
                  : "var(--color-accent)",
              }}
            >
              Pipeline: {globalOn ? "Włączony" : "Wyłączony"}
            </p>
            <p
              className="stat text-xs mt-2"
              style={{ color: "var(--color-muted)" }}
            >
              ostatnia zmiana: {formatDate(optGlobal.updated_at)}
            </p>
          </div>
          {globalOn && (
            <input
              type="text"
              value={reasonDraft}
              onChange={(e) => setReasonDraft(e.target.value)}
              placeholder="Powód wyłączenia (opcjonalnie)"
              className="text-sm px-3 py-2"
              style={{
                backgroundColor: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                color: "var(--color-text)",
                minWidth: 240,
                outline: "none",
              }}
            />
          )}
        </div>
      </div>

      {/* Per-workflow switches */}
      <h2
        className="text-sm font-bold uppercase tracking-wider mb-3"
        style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
      >
        GitHub Actions Workflows
      </h2>
      <div className="card overflow-hidden">
        {WORKFLOWS.map((meta, i) => {
          const row = optWorkflows.find((w) => w.workflow_id === meta.id);
          const enabled = row?.is_enabled ?? true;
          return (
            <div
              key={meta.id}
              className="flex items-center gap-4 px-4 py-3"
              style={{
                borderBottom:
                  i < WORKFLOWS.length - 1
                    ? "1px solid var(--color-border)"
                    : "none",
                opacity: globalOn && !enabled ? 0.65 : 1,
              }}
            >
              <span
                className="stat text-sm font-bold"
                style={{
                  color: enabled ? "var(--color-text)" : "var(--color-muted)",
                  minWidth: 200,
                }}
              >
                {meta.file}
                {!enabled && globalOn && (
                  <span
                    className="ml-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                    style={{
                      borderRadius: 999,
                      backgroundColor: "var(--color-surface-2)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-muted)",
                    }}
                  >
                    wyłączony
                  </span>
                )}
              </span>
              <span
                className="text-xs flex-1"
                style={{ color: "var(--color-muted)" }}
              >
                {meta.description}
              </span>
              <span
                className="stat text-xs hidden sm:block"
                style={{ color: "var(--color-muted)" }}
              >
                {meta.schedule}
              </span>
              <Switch
                checked={enabled}
                disabled={!globalOn}
                title={
                  !globalOn ? "Włącz najpierw globalny pipeline" : undefined
                }
                onToggle={() => toggleWorkflow(meta.id, enabled)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
