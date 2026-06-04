"use client";

/**
 * A submit button that asks for confirmation (and optionally a typed reason)
 * before allowing the surrounding form to submit. Used for destructive /
 * irreversible admin actions.
 */
export function ConfirmButton({
  children,
  message,
  promptReason,
  reasonName = "reason",
  className = "btn-danger btn-sm",
}: {
  children: React.ReactNode;
  message: string;
  promptReason?: boolean;
  reasonName?: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (promptReason) {
          const reason = window.prompt(message);
          if (!reason || !reason.trim()) {
            e.preventDefault();
            return;
          }
          const form = e.currentTarget.form;
          if (form) {
            let input = form.elements.namedItem(reasonName) as
              | HTMLInputElement
              | null;
            if (!input) {
              input = document.createElement("input");
              input.type = "hidden";
              input.name = reasonName;
              form.appendChild(input);
            }
            input.value = reason.trim();
          }
        } else if (!window.confirm(message)) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
