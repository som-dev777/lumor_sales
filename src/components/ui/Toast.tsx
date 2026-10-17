"use client";

import * as RadixToast from "@radix-ui/react-toast";
import { X } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import styles from "./Toast.module.scss";

type ToastMessage = { id: number; tone: "success" | "error"; message: string };
type Notify = (tone: ToastMessage["tone"], message: string) => void;

const ToastContext = createContext<Notify>(() => {});

/** Short messages in the corner after an action ("Saved", "Copied…"). Wraps the signed-in app. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const notify = useCallback<Notify>((tone, message) => {
    setToasts((list) => [...list, { id: Date.now() + Math.random(), tone, message }]);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      <RadixToast.Provider swipeDirection="right" duration={5000}>
        {children}
        {toasts.map((t) => (
          <RadixToast.Root
            key={t.id}
            className={`${styles.toast} ${styles[t.tone]}`}
            onOpenChange={(open) => !open && setToasts((list) => list.filter((x) => x.id !== t.id))}
          >
            <RadixToast.Description className={styles.message}>{t.message}</RadixToast.Description>
            <RadixToast.Close className={styles.close} aria-label="Dismiss">
              <X size={14} aria-hidden />
            </RadixToast.Close>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className={styles.viewport} />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): Notify {
  return useContext(ToastContext);
}
