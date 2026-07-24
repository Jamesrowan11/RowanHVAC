"use client";

type Props = {
  action: (formData: FormData) => Promise<void>;
  confirmText: string;
  children: React.ReactNode;
  className?: string;
};

/** A form that asks for confirmation before submitting (deletes, cancels…). */
export default function ConfirmForm({ action, confirmText, children, className }: Props) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
