"use client";

import { useState, type FormEvent } from "react";
import type { AgeRangeValue, ChildCreateRequest } from "@app/types";

const AGE_RANGE_OPTIONS: { value: AgeRangeValue; label: string }[] = [
  { value: "AGE_3_5", label: "3–5 years" },
  { value: "AGE_6_8", label: "6–8 years" },
  { value: "AGE_9_12", label: "9–12 years" },
  { value: "AGE_13_15", label: "13–15 years" },
  { value: "AGE_16_17", label: "16–17 years" },
];

export interface ChildFormValues {
  firstName: string;
  ageRange?: AgeRangeValue;
  interests: string;
  supervisionScoreMinimum: number;
  dailyLimitMinutes: string;
  structuredLearningModeEnabled: boolean;
  structuredLearningGateEnforced: boolean;
}

const EMPTY_VALUES: ChildFormValues = {
  firstName: "",
  ageRange: undefined,
  interests: "",
  supervisionScoreMinimum: 900,
  dailyLimitMinutes: "",
  structuredLearningModeEnabled: false,
  structuredLearningGateEnforced: true,
};

export function ChildForm({
  initialValues = EMPTY_VALUES,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialValues?: ChildFormValues;
  submitLabel: string;
  onSubmit: (values: ChildCreateRequest) => Promise<void>;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!values.firstName.trim()) {
      setError("First name is required");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        firstName: values.firstName.trim(),
        ageRange: values.ageRange,
        interests: values.interests
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        contentCategories: [],
        supervisionScoreMinimum: values.supervisionScoreMinimum,
        dailyLimitMinutes: values.dailyLimitMinutes ? Number(values.dailyLimitMinutes) : undefined,
        structuredLearningModeEnabled: values.structuredLearningModeEnabled,
        structuredLearningGateEnforced: values.structuredLearningGateEnforced,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="alert-error">{error}</p>}
      <div>
        <label className="field-label" htmlFor="firstName">First name / nickname</label>
        <input
          id="firstName"
          className="field-input"
          value={values.firstName}
          onChange={(e) => setValues((v) => ({ ...v, firstName: e.target.value }))}
          required
        />
      </div>
      <div>
        <label className="field-label" htmlFor="ageRange">Age range</label>
        <select
          id="ageRange"
          className="field-input"
          value={values.ageRange ?? ""}
          onChange={(e) => setValues((v) => ({ ...v, ageRange: (e.target.value || undefined) as AgeRangeValue | undefined }))}
        >
          <option value="">Not set</option>
          {AGE_RANGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label" htmlFor="interests">Interests</label>
        <input
          id="interests"
          className="field-input"
          placeholder="dinosaurs, space, drawing"
          value={values.interests}
          onChange={(e) => setValues((v) => ({ ...v, interests: e.target.value }))}
        />
        <p className="mt-1 text-xs text-slate-500">Comma-separated. Helps future content discovery.</p>
      </div>
      <div>
        <label className="field-label" htmlFor="supervisionScoreMinimum">
          Minimum Supervision Score ({values.supervisionScoreMinimum}/1000)
        </label>
        <input
          id="supervisionScoreMinimum"
          type="range"
          min={0}
          max={1000}
          step={25}
          className="w-full"
          value={values.supervisionScoreMinimum}
          onChange={(e) => setValues((v) => ({ ...v, supervisionScoreMinimum: Number(e.target.value) }))}
        />
        <p className="mt-1 text-xs text-slate-500">
          Content below this score won&apos;t be suggested for auto-approval once that feature ships.
        </p>
      </div>
      <div>
        <label className="field-label" htmlFor="dailyLimitMinutes">Daily viewing limit (minutes, optional)</label>
        <input
          id="dailyLimitMinutes"
          type="number"
          min={0}
          className="field-input"
          value={values.dailyLimitMinutes}
          onChange={(e) => setValues((v) => ({ ...v, dailyLimitMinutes: e.target.value }))}
        />
      </div>
      <div className="rounded border border-slate-200 p-3 space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={values.structuredLearningModeEnabled}
            onChange={(e) => setValues((v) => ({ ...v, structuredLearningModeEnabled: e.target.checked }))}
          />
          Structured Learning Mode
        </label>
        <p className="text-xs text-slate-500">
          Alternates approved fun videos with approved learning videos (tag content as learning when
          approving it). Starts each new device session at 3 fun videos before the first learning
          video is due, then 2, then 1 — holding at 1-for-1 after that.
        </p>
        {values.structuredLearningModeEnabled && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={values.structuredLearningGateEnforced}
              onChange={(e) => setValues((v) => ({ ...v, structuredLearningGateEnforced: e.target.checked }))}
            />
            Require the learning video (lock fun videos until it&apos;s watched)
          </label>
        )}
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export { AGE_RANGE_OPTIONS };
