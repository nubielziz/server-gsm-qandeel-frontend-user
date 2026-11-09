// LinkProblem: what an email-link page shows when the link is missing or no longer works (expired or used): one
// callout and the one next step. Server-compatible.
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";

export function LinkProblem({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="grid gap-5">
      <Alert tone="warning" title={title}>
        {text}
      </Alert>
      {action}
    </div>
  );
}
