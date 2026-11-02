"use client";

import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js";
import { useId, useMemo } from "react";
import fieldStyles from "@/components/ui/TextField.module.scss";
import styles from "./calendar.module.scss";

/** 🇮🇳 from "IN". */
export const flagOf = (code: string) =>
  String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

/** Every country with its flag and dialling code, India first, then by name. */
export function useCountries() {
  return useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      names = null;
    }
    const rows = getCountries().map((code) => ({
      code,
      name: names?.of(code) ?? code,
      dial: getCountryCallingCode(code as CountryCode),
    }));
    rows.sort((a, b) =>
      a.code === "IN" ? -1 : b.code === "IN" ? 1 : a.name.localeCompare(b.name),
    );
    return rows;
  }, []);
}

/**
 * A phone number with a country dropdown (D-042). The open list shows full names; once
 * picked, the box shows just "🇮🇳 IN +91" (D-043): the real dropdown sits invisibly on top.
 */
export function PhoneField({
  label,
  required = false,
  country,
  number,
  onCountry,
  onNumber,
  error,
}: {
  label: string;
  required?: boolean;
  country: string;
  number: string;
  onCountry: (code: string) => void;
  onNumber: (value: string) => void;
  error?: string;
}) {
  const id = useId();
  const countries = useCountries();
  const picked = countries.find((c) => c.code === country) ?? countries[0];
  return (
    <div className={fieldStyles.field}>
      <label htmlFor={`${id}-number`} className={fieldStyles.label}>
        {label}
        {required && (
          <span className={fieldStyles.req} aria-hidden>
            {" "}
            *
          </span>
        )}
      </label>
      <div className={styles.phoneRow}>
        <div className={`${fieldStyles.input} ${styles.countryBox}`}>
          <span aria-hidden className={styles.countryShown}>
            {flagOf(picked.code)} {picked.code} +{picked.dial}
          </span>
          <select
            aria-label="Country code"
            className={styles.countrySelect}
            value={country}
            onChange={(e) => onCountry(e.target.value)}
          >
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {flagOf(c.code)} {c.name} (+{c.dial})
              </option>
            ))}
          </select>
        </div>
        <input
          id={`${id}-number`}
          type="tel"
          autoComplete="tel-national"
          inputMode="tel"
          required={required}
          placeholder="98765 43210"
          className={`${fieldStyles.input} ${styles.phoneInput} ${error ? fieldStyles.invalid : ""}`}
          value={number}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onNumber(e.target.value)}
        />
      </div>
      {error && (
        <p id={`${id}-error`} className={fieldStyles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
