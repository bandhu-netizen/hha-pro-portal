import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Eyebrow, Field, Panel, SelectField } from "@/components/ui/field";
import { stateFromText, uid } from "@/lib/hha/logic";
import { checkNetLogin, tryLiveNetwork, useHha } from "@/lib/hha/store";
import type { NetworkRecord } from "@/lib/hha/types";
import { cn } from "@/lib/utils";

function emptyRecord(): NetworkRecord {
  return {
    _id: uid(),
    name: "",
    region: "",
    Agency_NAME: "",
    address: "",
    NPI: "",
    Tax_ID: "",
    medicaid_id: "",
    provider_id: "",
    vendor_id: "",
    lara_id: "",
    phone: "",
    fax: "",
    email: "",
    pay_rate: "",
    img: "",
    local: true,
  };
}

export function Network() {
  const authed = useHha((s) => s.netAuth);
  const setNetAuth = useHha((s) => s.setNetAuth);
  const network = useHha((s) => s.network);
  const source = useHha((s) => s.netSource);
  const setNetwork = useHha((s) => s.setNetwork);
  const upsert = useHha((s) => s.upsertNetwork);
  const remove = useHha((s) => s.removeNetwork);
  const addTask = useHha((s) => s.addTask);
  const setOpenItem = useHha((s) => s.setOpenItem);
  const name = useHha((s) => s.name);

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState(false);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("all");
  const [viewing, setViewing] = useState<NetworkRecord | null>(null);
  const [editing, setEditing] = useState<NetworkRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const regions = [...new Set(network.map((s) => (s.region || "").trim()).filter(Boolean))].sort();
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return network
      .filter((s) => (region === "all" ? true : s.region === region))
      .filter((s) =>
        !term
          ? true
          : [s.name, s.region, s.Agency_NAME, s.NPI, s.phone, s.email, s.address]
              .join(" ")
              .toLowerCase()
              .includes(term),
      )
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [network, q, region]);

  async function refresh() {
    setBusy(true);
    const live = await tryLiveNetwork();
    setBusy(false);
    if (live?.length) {
      setNetwork(live, "live");
      toast.success("Directory refreshed from the live API");
    } else {
      toast("Live API unavailable — using the local licensed directory");
    }
  }

  if (!authed) {
    return (
      <div className="mx-auto w-full max-w-md">
        <Panel className="p-7">
          <Eyebrow>Authorized only</Eyebrow>
          <div className="mt-1 font-display text-2xl">Network coverage</div>
          <p className="mt-2 mb-4 text-sm text-muted">Same gate as the Cottage all-states portal.</p>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-faint">Email</label>
          <Field type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          <label className="mb-1 mt-3 block text-[11px] font-semibold uppercase tracking-wider text-faint">Password</label>
          <Field
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete="current-password"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (checkNetLogin(email, pass)) {
                  setNetAuth(true);
                  toast.success("Verified");
                } else setErr(true);
              }
            }}
          />
          {err ? <p className="mt-2 text-xs text-crit">Invalid credentials</p> : null}
          <Button
            variant="primary"
            className="mt-4 w-full"
            onClick={() => {
              if (checkNetLogin(email, pass)) {
                setNetAuth(true);
                toast.success("Verified");
              } else setErr(true);
            }}
          >
            Continue
          </Button>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Panel className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Eyebrow>Riverside Select · DBA Cottage Homecare</Eyebrow>
            <div className="mt-1 font-display text-xl">Licensed agency directory</div>
            <p className="mt-1 text-xs text-muted">{source === "live" ? "Live API" : "Local cache — live API used when reachable"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void refresh()} disabled={busy}>Refresh</Button>
            <Button variant="primary" onClick={() => setEditing(emptyRecord())}>Add state</Button>
            <Button variant="danger" onClick={() => setNetAuth(false)}>Sign out</Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Field placeholder="Search state, agency, NPI, phone…" className="max-w-sm flex-1" value={q} onChange={(e) => setQ(e.target.value)} />
          <SelectField value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="all">All regions</option>
            {regions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </SelectField>
          <span className="ml-auto text-xs text-muted">
            {rows.length} shown · {network.length}
          </span>
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((s) => {
          const initials = (s.name || "??")
            .split(/\s+/)
            .map((w) => w[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);
          return (
            <button
              key={s._id}
              type="button"
              onClick={() => setViewing(s)}
              className="relative overflow-hidden rounded-2xl border border-line bg-surface p-4 text-left transition-transform duration-150 hover:-translate-y-0.5"
            >
              <button
                type="button"
                className="absolute right-2.5 top-2.5 z-10 grid size-8 place-items-center rounded-full border border-line bg-surface text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing({ ...s });
                }}
              >
                Edit
              </button>
              <div className="relative z-[1] pr-10">
                <div className="font-display text-lg">{s.name || "Unnamed"}</div>
                <Eyebrow className="mt-1">{s.region || "Territory"}</Eyebrow>
                <div className="mt-2 truncate text-xs text-muted">{s.Agency_NAME || "No agency"}</div>
              </div>
              <div className="pointer-events-none absolute bottom-[-6px] right-2.5 text-5xl font-extrabold text-line">
                {initials}
              </div>
            </button>
          );
        })}
      </div>

      {viewing ? (
        <Modal onClose={() => setViewing(null)}>
          <Eyebrow>{viewing.region}</Eyebrow>
          <h3 className="mt-1 font-display text-2xl">{viewing.name}</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(
              [
                ["Agency", viewing.Agency_NAME],
                ["Address", viewing.address],
                ["NPI", viewing.NPI],
                ["Tax ID", viewing.Tax_ID],
                ["Medicaid ID", viewing.medicaid_id],
                ["Provider ID", viewing.provider_id],
                ["Phone", viewing.phone],
                ["Email", viewing.email],
                ["Pay rate", viewing.pay_rate],
              ] as const
            )
              .filter(([, v]) => v && v !== "---")
              .map(([l, v]) => (
                <div key={l}>
                  <Eyebrow>{l}</Eyebrow>
                  <div className="mt-0.5 text-sm">{v}</div>
                </div>
              ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => {
                setEditing({ ...viewing });
                setViewing(null);
              }}
            >
              Edit
            </Button>
            <Button
              onClick={() => {
                const id = addTask({
                  title: `Follow-up · ${viewing.name}`,
                  assignee: "",
                  patient: viewing.Agency_NAME || "",
                  state: stateFromText(viewing.name, true) || "GENERAL",
                  priority: "auto",
                  due: null,
                  status: "Open",
                  source: "Network Coverage",
                  ref: viewing.NPI || "",
                  createdByName: name,
                  notes: viewing.phone
                    ? [{ id: uid(), text: [viewing.Agency_NAME, viewing.phone, viewing.email].filter(Boolean).join(" · "), at: Date.now(), byName: name }]
                    : [],
                });
                setViewing(null);
                setOpenItem("task:" + id);
                toast.success("Action created");
              }}
            >
              Create action
            </Button>
            <Button onClick={() => setViewing(null)}>Close</Button>
          </div>
        </Modal>
      ) : null}

      {editing ? (
        <Modal onClose={() => setEditing(null)}>
          <Eyebrow>Manage record</Eyebrow>
          <h3 className="mb-4 mt-1 font-display text-xl">
            {network.some((n) => n._id === editing._id) ? "Edit record" : "Add state"}
          </h3>
          <div className="grid max-h-[55vh] gap-3 overflow-y-auto sm:grid-cols-2">
            {(
              [
                ["name", "State name"],
                ["region", "Region"],
                ["Agency_NAME", "Agency legal name"],
                ["address", "Address"],
                ["NPI", "NPI"],
                ["Tax_ID", "Tax ID"],
                ["medicaid_id", "Medicaid ID"],
                ["provider_id", "Provider ID"],
                ["phone", "Phone"],
                ["email", "Email"],
                ["pay_rate", "Pay rate"],
              ] as const
            ).map(([k, label]) => (
              <div key={k} className={k === "Agency_NAME" || k === "address" ? "sm:col-span-2" : ""}>
                <Eyebrow className="mb-1">{label}</Eyebrow>
                <Field
                  value={String(editing[k] || "")}
                  onChange={(e) => setEditing({ ...editing, [k]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => {
                if (!editing.name.trim() || !editing.region.trim()) {
                  toast.error("State name and region are required");
                  return;
                }
                upsert({ ...editing, local: true });
                setEditing(null);
                toast.success("Saved locally");
              }}
            >
              Save
            </Button>
            {network.some((n) => n._id === editing._id) ? (
              <Button
                variant="danger"
                onClick={() => {
                  if (confirm("Remove this state record?")) {
                    remove(editing._id);
                    setEditing(null);
                  }
                }}
              >
                Remove
              </Button>
            ) : null}
            <Button onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-panel)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-3.5 top-3.5 grid size-8 place-items-center rounded-md border border-line"
          onClick={onClose}
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
}
