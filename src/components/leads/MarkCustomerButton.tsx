"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BadgeCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useServerResult } from "@/components/auth/useServerResult";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { customerSchema, type CustomerData, type CustomerInput } from "@/lib/validation/leads";
import { markCustomer } from "@/server/actions/leads";
import styles from "./leads.module.scss";

type Props = {
  companyId: string;
  companyName: string;
  today: string;
  defaults?: Partial<CustomerInput>;
};

/** Records plan, deal value (INR) and start date, and sets the company to Customer (F03). */
export function MarkCustomerButton({ companyId, companyName, today, defaults }: Props) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CustomerInput, unknown, CustomerData>({
    resolver: zodResolver(customerSchema),
    defaultValues: { planTier: "", dealValueInr: "", customerStartDate: today, ...defaults },
  });
  const { formError, apply } = useServerResult(setError);

  const onSubmit = handleSubmit(async (values) => {
    const result = await markCustomer(companyId, values);
    apply(result);
    if (result.ok) {
      notify("success", result.message ?? "Saved.");
      setOpen(false);
    }
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <BadgeCheck size={16} aria-hidden />
        Mark as customer
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={`Mark ${companyName} as a customer`}>
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}
          <TextField
            label="Plan or tier"
            autoFocus
            error={errors.planTier?.message}
            {...register("planTier")}
          />
          <TextField
            label="Deal value (₹)"
            inputMode="numeric"
            error={errors.dealValueInr?.message}
            {...register("dealValueInr")}
          />
          <TextField
            label="Customer since"
            type="date"
            error={errors.customerStartDate?.message}
            {...register("customerStartDate")}
          />
          <div className={styles.formActions}>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Mark as customer
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
