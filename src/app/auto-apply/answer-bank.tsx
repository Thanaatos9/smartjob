"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { deleteAnswer, saveAnswer } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type BankRow = {
  id: string;
  question: string;
  type: string;
  options: string[] | null;
  answer: string;
  source: string;
};

function AnswerRow({ row }: { row: BankRow }) {
  const [state, formAction, pending] = useActionState(saveAnswer, null);
  const options = row.options ?? [];

  return (
    <li className="flex flex-col gap-2 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{row.question}</p>
        <Badge variant={row.source === "user" ? "success" : "muted"}>
          {row.source === "user" ? "Corrigée par toi" : "Réponse IA"}
        </Badge>
      </div>
      {options.length > 0 && (
        <p className="text-xs text-muted-foreground">Options : {options.join(" / ")}</p>
      )}
      <div className="flex flex-wrap items-start gap-2">
        <form action={formAction} className="flex min-w-0 flex-1 gap-2">
          <input type="hidden" name="id" value={row.id} />
          <Input
            name="answer"
            defaultValue={row.answer}
            aria-label={`Réponse à : ${row.question}`}
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "..." : "Enregistrer"}
          </Button>
        </form>
        <form action={deleteAnswer}>
          <input type="hidden" name="id" value={row.id} />
          <Button
            type="submit"
            variant="outline"
            size="icon"
            aria-label={`Supprimer la réponse à : ${row.question}`}
          >
            <Trash2 />
          </Button>
        </form>
      </div>
      <div aria-live="polite">
        {state?.error && (
          <p role="alert" className="text-xs text-destructive">
            {state.error}
          </p>
        )}
        {state?.success && <p className="text-xs font-medium text-success">Enregistrée.</p>}
      </div>
    </li>
  );
}

export function AnswerBank({ rows }: { rows: BankRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune réponse enregistrée pour l&apos;instant. Les réponses de l&apos;IA aux questions de
        formulaires apparaîtront ici : tu pourras les corriger une fois pour toutes.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <AnswerRow key={row.id} row={row} />
      ))}
    </ul>
  );
}
