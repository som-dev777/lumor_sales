"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import {
  CHANNEL_CONDITIONS,
  PLAN_TYPES,
  STEP_CHANNELS,
  TEMPLATE_PURPOSES,
  type ChannelCondition,
  type PlanType,
  type StepChannel,
} from "@/lib/db/enums";
import { describeWait, WHEN_LABEL } from "@/lib/plan-format";
import { savePlan } from "@/server/actions/plans";
import { checkPlan, type Finding, type GuardSettings } from "@/server/plans/guardrails";
import styles from "./plans.module.scss";

export type BuilderStep = {
  channels: { channel: StepChannel; when: ChannelCondition }[];
  templatePurpose: string;
  templateId: string;
  script: string;
  waitDays: number;
};

export type BuilderPlan = {
  name: string;
  planType: PlanType;
  personaId: string;
  type: "Official" | "Personal";
  skipWeekends: boolean;
  steps: BuilderStep[];
};

type Props = {
  planId: string | null;
  initial: BuilderPlan;
  personas: { id: string; label: string }[];
  templates: { id: string; label: string }[];
  canMakeOfficial: boolean;
  settings: GuardSettings;
};

const NEW_STEP: BuilderStep = {
  channels: [{ channel: "LinkedIn message", when: "always" }],
  templatePurpose: "",
  templateId: "",
  script: "",
  waitDays: 3,
};

/** Create or edit a plan (F17). Guardrails are checked as you type and again on the server. */
export function PlanBuilder({
  planId,
  initial,
  personas,
  templates,
  canMakeOfficial,
  settings,
}: Props) {
  const router = useRouter();
  const notify = useToast();
  const [plan, setPlan] = useState<BuilderPlan>(initial);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [serverFindings, setServerFindings] = useState<Finding[]>([]);

  const live = useMemo(
    () =>
      checkPlan(
        plan.planType,
        plan.steps.map((s) => ({
          channels: s.channels,
          waitDays: Number(s.waitDays) || 0,
          script: s.script,
          text: s.script,
        })),
        settings,
      ),
    [plan.planType, plan.steps, settings],
  );
  const findings = serverFindings.length ? serverFindings : live;

  const setStep = (i: number, patch: Partial<BuilderStep>) => {
    setServerFindings([]);
    setPlan((p) => ({ ...p, steps: p.steps.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));
  };
  const move = (i: number, by: number) =>
    setPlan((p) => {
      const steps = [...p.steps];
      const [s] = steps.splice(i, 1);
      steps.splice(i + by, 0, s);
      return { ...p, steps };
    });

  const save = () =>
    start(async () => {
      setError(null);
      const r = await savePlan(planId, {
        ...plan,
        steps: plan.steps.map((s) => ({ ...s, waitDays: Number(s.waitDays) })),
      });
      if (!r.ok) {
        setError(r.error);
        setServerFindings(r.findings ?? []);
        return;
      }
      notify("success", r.message ?? "Saved.");
      if (r.link) router.push(r.link);
    });

  return (
    <div className={styles.builder}>
      <section className={styles.card} aria-label="Plan details">
        <div className={styles.grid2}>
          <TextField
            label="Name"
            value={plan.name}
            maxLength={80}
            onChange={(e) => setPlan({ ...plan, name: e.target.value })}
          />
          <SelectField
            label="Plan type"
            value={plan.planType}
            onChange={(e) => setPlan({ ...plan, planType: e.target.value as PlanType })}
            options={PLAN_TYPES.map((t) => ({ value: t, label: t }))}
          />
          <SelectField
            label="Persona (optional)"
            value={plan.personaId}
            onChange={(e) => setPlan({ ...plan, personaId: e.target.value })}
            options={[
              { value: "", label: "Any persona" },
              ...personas.map((p) => ({ value: p.id, label: p.label })),
            ]}
          />
          {planId === null && canMakeOfficial ? (
            <SelectField
              label="Official or Personal"
              value={plan.type}
              onChange={(e) =>
                setPlan({ ...plan, type: e.target.value as "Official" | "Personal" })
              }
              options={[
                { value: "Official", label: "Official (everyone's standard)" },
                { value: "Personal", label: "Personal (just mine)" },
              ]}
            />
          ) : (
            <p className={styles.muted}>{plan.type} plan</p>
          )}
        </div>
        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={plan.skipWeekends}
            onChange={(e) => setPlan({ ...plan, skipWeekends: e.target.checked })}
          />
          Skip weekends (a step due on Saturday or Sunday moves to Monday)
        </label>
      </section>

      {plan.steps.map((s, i) => (
        <section key={i} className={styles.card} aria-label={`Step ${i + 1}`}>
          <div className={styles.stepHead}>
            <h2 className={styles.stepTitle}>Step {i + 1}</h2>
            <span className={styles.muted}>{describeWait(plan.steps, i)}</span>
            <div className={styles.stepTools}>
              <Button
                variant="ghost"
                aria-label={`Move step ${i + 1} up`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp size={16} aria-hidden />
              </Button>
              <Button
                variant="ghost"
                aria-label={`Move step ${i + 1} down`}
                disabled={i === plan.steps.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown size={16} aria-hidden />
              </Button>
              <Button
                variant="ghost"
                aria-label={`Remove step ${i + 1}`}
                onClick={() => setPlan({ ...plan, steps: plan.steps.filter((_, k) => k !== i) })}
              >
                <Trash2 size={16} aria-hidden />
              </Button>
            </div>
          </div>
          <div className={styles.options}>
            {s.channels.map((c, k) => (
              <div key={k} className={styles.optionRow}>
                <SelectField
                  label={k === 0 ? "Channel" : `Otherwise, channel ${k + 1}`}
                  value={c.channel}
                  onChange={(e) =>
                    setStep(i, {
                      channels: s.channels.map((x, j) =>
                        j === k ? { ...x, channel: e.target.value as StepChannel } : x,
                      ),
                    })
                  }
                  options={STEP_CHANNELS.map((x) => ({ value: x, label: x }))}
                />
                <SelectField
                  label={k === 0 ? "When" : `When ${k + 1}`}
                  value={c.when}
                  onChange={(e) =>
                    setStep(i, {
                      channels: s.channels.map((x, j) =>
                        j === k ? { ...x, when: e.target.value as ChannelCondition } : x,
                      ),
                    })
                  }
                  options={CHANNEL_CONDITIONS.map((x) => ({ value: x, label: WHEN_LABEL[x] }))}
                />
                {s.channels.length > 1 && (
                  <Button
                    variant="ghost"
                    aria-label={`Remove channel option ${k + 1}`}
                    onClick={() => setStep(i, { channels: s.channels.filter((_, j) => j !== k) })}
                  >
                    <Trash2 size={16} aria-hidden />
                  </Button>
                )}
              </div>
            ))}
            {s.channels.length < 4 && (
              <Button
                variant="ghost"
                onClick={() =>
                  setStep(i, {
                    channels: [...s.channels, { channel: "LinkedIn message", when: "always" }],
                  })
                }
              >
                <Plus size={16} aria-hidden /> Add a fallback channel
              </Button>
            )}
          </div>
          <div className={styles.grid3}>
            <SelectField
              label="Template purpose"
              value={s.templatePurpose}
              onChange={(e) => setStep(i, { templatePurpose: e.target.value, templateId: "" })}
              options={[
                { value: "", label: "None" },
                ...TEMPLATE_PURPOSES.map((p) => ({ value: p, label: p })),
              ]}
            />
            <SelectField
              label="Or a fixed template"
              value={s.templateId}
              onChange={(e) => setStep(i, { templateId: e.target.value, templatePurpose: "" })}
              options={[
                { value: "", label: "None" },
                ...templates.map((t) => ({ value: t.id, label: t.label })),
              ]}
            />
            <TextField
              label="Wait (days)"
              type="number"
              min={0}
              max={90}
              value={String(s.waitDays)}
              onChange={(e) => setStep(i, { waitDays: Number(e.target.value) })}
            />
          </div>
          <TextArea
            label="Script (call script, task, or the note on a connection request)"
            rows={2}
            maxLength={2000}
            value={s.script}
            onChange={(e) => setStep(i, { script: e.target.value })}
          />
        </section>
      ))}

      <div className={styles.row}>
        <Button
          variant="secondary"
          disabled={plan.steps.length >= 12}
          onClick={() => setPlan({ ...plan, steps: [...plan.steps, NEW_STEP] })}
        >
          <Plus size={16} aria-hidden /> Add step
        </Button>
      </div>

      <section className={styles.card} aria-label="Guardrails">
        <h2 className={styles.stepTitle}>Cadence guardrails</h2>
        {findings.length === 0 ? (
          <p className={styles.ok}>This plan follows every guardrail.</p>
        ) : (
          <ul className={styles.findings}>
            {findings.map((f, k) => (
              <li key={k} className={f.level === "block" ? styles.block : styles.warn}>
                <strong>{f.level === "block" ? "Not allowed:" : "Check:"}</strong> {f.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && <Alert tone="error">{error}</Alert>}
      <div className={styles.row}>
        <Button variant="secondary" onClick={() => router.back()} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} loading={busy}>
          Save plan
        </Button>
      </div>
    </div>
  );
}
