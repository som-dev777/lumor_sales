"use client";

import { CalendarClock, Mail, Phone, UserMinus, UserPlus, Video } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { PersonDialogButton } from "@/components/leads/PersonDialogButton";
import { EMPTY_PERSON } from "@/components/leads/PersonForm";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import {
  addTeammateAction,
  removeTeammateAction,
  rescheduleBookingAction,
  rescheduleSlotsAction,
} from "@/server/actions/calendar";
import type { LeadFormOptions } from "@/server/leads/options";
import { CancelBookingButton } from "./CancelBookingButton";
import { SlotPicker, useTimeZone } from "./SlotPicker";
import styles from "./calendar.module.scss";

export type DetailData = {
  id: string;
  status: "Confirmed" | "Cancelled";
  meetingTypeName: string;
  when: string;
  durationMin: number;
  where: string | null;
  isMeet: boolean;
  upcoming: boolean;
  invitee: {
    name: string;
    company: string;
    email: string;
    phone: string | null;
    linkedin: string | null;
  };
  answers: { question: string; answer: string }[];
  note: string | null;
  cancelReason: string | null;
  cancelledBy: "invitee" | "host" | null;
  rescheduled: boolean;
  person: { id: string; name: string } | null;
  team: { id: string; name: string; host: boolean }[];
  /** A meeting the rep scheduled themselves (D-043): its recipients and message. */
  scheduled: { to: string[]; cc: string[]; message: string | null } | null;
};

/** A meeting's details on the calendar, opened from ?booking=… (F22 round 2). */
export function MeetingDetailDialog({
  data,
  canManage,
  canChangeTeam,
  choices,
  options,
  canChooseOwner,
}: {
  data: DetailData;
  /** Host or Admin: reschedule and cancel. */
  canManage: boolean;
  /** Host, a teammate or Admin: add and remove teammates. */
  canChangeTeam: boolean;
  choices: { id: string; name: string }[];
  options: LeadFormOptions;
  canChooseOwner: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("booking");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  const cancelled = data.status === "Cancelled";
  const open = data.upcoming && !cancelled;

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && close()}
      size="lg"
      title={`${data.meetingTypeName} with ${data.invitee.name}`}
    >
      <div className={styles.stack}>
        <div className={styles.detailWhen}>
          <CalendarClock size={18} aria-hidden />
          <div>
            <strong>{data.when}</strong> · {data.durationMin} min{" "}
            {cancelled && (
              <Badge tone="danger">
                Cancelled{data.cancelledBy === "invitee" ? " by them" : ""}
              </Badge>
            )}
            {data.rescheduled && !cancelled && <Badge tone="primary">Rescheduled</Badge>}
            {cancelled && data.cancelReason && (
              <p className={styles.muted}>Reason: {data.cancelReason}</p>
            )}
          </div>
        </div>
        {data.where &&
          (/^https?:\/\//.test(data.where) ? (
            <a
              className={styles.joinButton}
              href={data.where}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Video size={18} aria-hidden />{" "}
              {data.isMeet ? "Join Google Meet" : "Join the meeting"}
            </a>
          ) : (
            <p>Where: {data.where}</p>
          ))}

        <section className={styles.detailSection} aria-label="People on the meeting">
          <h3 className={styles.sectionTitle}>On the meeting</h3>
          <ul className={styles.teamList}>
            {data.team.map((m) => (
              <TeamRow
                key={m.id}
                bookingId={data.id}
                member={m}
                canRemove={open && canChangeTeam && !m.host}
              />
            ))}
          </ul>
          {open && canChangeTeam && (
            <AddTeammate
              bookingId={data.id}
              choices={choices.filter((c) => !data.team.some((m) => m.id === c.id))}
            />
          )}
        </section>

        {data.scheduled && (
          <section className={styles.detailSection} aria-label="Invited">
            <h3 className={styles.sectionTitle}>Invited</h3>
            <p>
              <strong>To:</strong> {data.scheduled.to.join(", ")}
            </p>
            {data.scheduled.cc.length > 0 && (
              <p>
                <strong>CC:</strong> {data.scheduled.cc.join(", ")}
              </p>
            )}
            {data.scheduled.message && <p className={styles.muted}>{data.scheduled.message}</p>}
            {data.person && (
              <Link href={`/people/${data.person.id}`}>Open {data.person.name} →</Link>
            )}
          </section>
        )}

        {!data.scheduled && (
          <section className={styles.detailSection} aria-label="Booked by">
            <h3 className={styles.sectionTitle}>Booked by</h3>
            <p>
              <strong>{data.invitee.name}</strong>, {data.invitee.company}
            </p>
            <p className={styles.row}>
              <Mail size={14} aria-hidden />
              <a href={`mailto:${data.invitee.email}`}>{data.invitee.email}</a>
              {data.invitee.phone && (
                <>
                  <Phone size={14} aria-hidden />
                  <a href={`tel:${data.invitee.phone.replace(/\s/g, "")}`}>{data.invitee.phone}</a>
                </>
              )}
            </p>
            {data.invitee.linkedin && (
              <p>
                <a href={data.invitee.linkedin} target="_blank" rel="noopener noreferrer">
                  LinkedIn profile
                </a>
              </p>
            )}
            {(data.answers.some((a) => a.answer) || data.note) && (
              <dl className={styles.answers}>
                {data.answers
                  .filter((a) => a.answer)
                  .map((a) => (
                    <div key={a.question}>
                      <dt>{a.question}</dt>
                      <dd>{a.answer}</dd>
                    </div>
                  ))}
                {data.note && (
                  <div>
                    <dt>Note</dt>
                    <dd>{data.note}</dd>
                  </div>
                )}
              </dl>
            )}
            <div className={styles.row}>
              {data.person ? (
                <Link href={`/people/${data.person.id}`}>Open {data.person.name} →</Link>
              ) : (
                <PersonDialogButton
                  label="Add as person"
                  ariaLabel={`Add ${data.invitee.name} as a person`}
                  options={options}
                  canChooseOwner={canChooseOwner}
                  defaults={{
                    ...EMPTY_PERSON,
                    fullName: data.invitee.name,
                    companyName: data.invitee.company,
                    email: data.invitee.email,
                    phone: data.invitee.phone ?? "",
                    linkedinUrl: data.invitee.linkedin ?? "",
                  }}
                />
              )}
            </div>
          </section>
        )}

        {open && canManage && (
          <div className={styles.detailActions}>
            {data.scheduled ? (
              <MoveToTime bookingId={data.id} onMoved={close} />
            ) : (
              <RescheduleButton bookingId={data.id} onMoved={close} />
            )}
            <CancelBookingButton id={data.id} who={data.invitee.name} />
          </div>
        )}
      </div>
    </Dialog>
  );
}

function TeamRow({
  bookingId,
  member,
  canRemove,
}: {
  bookingId: string;
  member: { id: string; name: string; host: boolean };
  canRemove: boolean;
}) {
  const notify = useToast();
  const [busy, start] = useTransition();
  return (
    <li className={styles.teamRow}>
      <span>
        {member.name} {member.host && <Badge tone="neutral">Host</Badge>}
      </span>
      {canRemove && (
        <Button
          variant="ghost"
          loading={busy}
          aria-label={`Remove ${member.name} from the meeting`}
          onClick={() =>
            start(async () => {
              const r = await removeTeammateAction(bookingId, member.id);
              notify(r.ok ? "success" : "error", r.ok ? (r.message ?? "Removed.") : r.error);
            })
          }
        >
          <UserMinus size={16} aria-hidden />
        </Button>
      )}
    </li>
  );
}

function AddTeammate({
  bookingId,
  choices,
}: {
  bookingId: string;
  choices: { id: string; name: string }[];
}) {
  const notify = useToast();
  const [who, setWho] = useState("");
  const [busy, start] = useTransition();
  if (choices.length === 0) return null;
  return (
    <div className={styles.addMate}>
      <SelectField
        label="Add a teammate"
        value={who}
        options={[
          { value: "", label: "Choose a rep…" },
          ...choices.map((c) => ({ value: c.id, label: c.name })),
        ]}
        onChange={(e) => setWho(e.target.value)}
      />
      <Button
        variant="secondary"
        disabled={!who}
        loading={busy}
        onClick={() =>
          start(async () => {
            const r = await addTeammateAction(bookingId, who);
            notify(r.ok ? "success" : "error", r.ok ? (r.message ?? "Added.") : r.error);
            if (r.ok) setWho("");
          })
        }
      >
        <UserPlus size={16} aria-hidden /> Add
      </Button>
    </div>
  );
}

/** The host picks a new free time; the person who booked is emailed (D-042). */
function RescheduleButton({ bookingId, onMoved }: { bookingId: string; onMoved: () => void }) {
  const notify = useToast();
  const tz = useTimeZone();
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  if (slots === null) {
    return (
      <Button
        variant="secondary"
        loading={busy}
        onClick={() =>
          start(async () => {
            const r = await rescheduleSlotsAction(bookingId);
            if (r.ok) setSlots(r.slots);
            else notify("error", r.error);
          })
        }
      >
        Reschedule
      </Button>
    );
  }
  return (
    <div className={styles.stack}>
      <h3 className={styles.sectionTitle}>Move to a new time</h3>
      {error && <Alert tone="error">{error}</Alert>}
      <SlotPicker slots={slots} value={slot} onChange={setSlot} tz={tz} />
      <div className={styles.row}>
        <Button
          disabled={!slot}
          loading={busy}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await rescheduleBookingAction(bookingId, slot!);
              if (r.ok) {
                notify("success", r.message ?? "Moved.");
                onMoved();
              } else setError(r.error);
            })
          }
        >
          Move to this time
        </Button>
        <Button variant="ghost" onClick={() => setSlots(null)} disabled={busy}>
          Keep the current time
        </Button>
      </div>
    </div>
  );
}

/** A meeting the rep scheduled moves to any date and time they pick (D-043). */
function MoveToTime({ bookingId, onMoved }: { bookingId: string; onMoved: () => void }) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Reschedule
      </Button>
    );
  }
  return (
    <div className={styles.stack}>
      <h3 className={styles.sectionTitle}>Move to a new time (IST)</h3>
      {error && <Alert tone="error">{error}</Alert>}
      <div className={styles.grid2}>
        <TextField
          label="New date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <TextField
          label="New start time"
          type="time"
          step={300}
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </div>
      <div className={styles.row}>
        <Button
          disabled={!date || !time}
          loading={busy}
          onClick={() =>
            start(async () => {
              setError(null);
              const iso = new Date(`${date}T${time}:00+05:30`).toISOString();
              const r = await rescheduleBookingAction(bookingId, iso);
              if (r.ok) {
                notify("success", "Meeting moved. Everyone invited has been emailed.");
                onMoved();
              } else setError(r.error);
            })
          }
        >
          Move to this time
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Keep the current time
        </Button>
      </div>
    </div>
  );
}
