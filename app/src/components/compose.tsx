import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Eyebrow, Field, SelectField } from "@/components/ui/field";
import { US } from "@/lib/hha/constants";
import { useHha } from "@/lib/hha/store";

export function Compose({ open, onClose }: { open: boolean; onClose: () => void }) {
  const name = useHha((s) => s.name);
  const addTask = useHha((s) => s.addTask);
  const setOpenItem = useHha((s) => s.setOpenItem);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [patient, setPatient] = useState("");
  const [state, setState] = useState("GENERAL");
  const [due, setDue] = useState("");
  const [pri, setPri] = useState<"auto" | "critical" | "high" | "medium" | "low">("auto");
  const [note, setNote] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[10vh]" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-panel)]"
        onClick={(e) => e.stopPropagation()}
      >
        <Eyebrow>Log action</Eyebrow>
        <div className="mb-4 mt-1 font-display text-xl">What needs doing?</div>
        <div className="flex flex-col gap-2">
          <Field placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <div className="grid gap-2 sm:grid-cols-2">
            <Field placeholder="Assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} />
            <Field placeholder="Patient / account" value={patient} onChange={(e) => setPatient(e.target.value)} />
            <SelectField value={state} onChange={(e) => setState(e.target.value)}>
              <option value="GENERAL">General</option>
              {Object.keys(US).map((s) => (
                <option key={s} value={s}>
                  {s} · {US[s]}
                </option>
              ))}
            </SelectField>
            <Field type="datetime-local" className="font-mono text-xs" value={due} onChange={(e) => setDue(e.target.value)} />
            <SelectField value={pri} onChange={(e) => setPri(e.target.value as typeof pri)}>
              <option value="auto">Auto priority</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </SelectField>
            <Field placeholder="Opening note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="mt-2 flex gap-2">
            <Button
              variant="primary"
              onClick={() => {
                if (!title.trim()) return toast.error("Needs a title");
                const id = addTask({
                  title: title.trim(),
                  assignee,
                  patient,
                  state,
                  priority: pri,
                  due: due ? new Date(due).getTime() : null,
                  status: "Open",
                  source: "Desk",
                  ref: "",
                  createdByName: name,
                  notes: note.trim()
                    ? [{ id: "n1", text: note.trim(), at: Date.now(), byName: name }]
                    : [],
                });
                setOpenItem("task:" + id);
                onClose();
                setTitle("");
                setNote("");
                toast.success("Added to pipeline");
              }}
            >
              Add to pipeline
            </Button>
            <Button onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
