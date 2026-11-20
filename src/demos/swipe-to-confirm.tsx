"use client";

/*
 * Swipe to Confirm demo: the author's Usage.tsx from
 * https://21st.dev/@romanvasnev/components/swipe-to-confirm (Vasnev.art, MIT,
 * see licenses/swipe-to-confirm.LICENSE), copied verbatim; only this comment was added.
 */

import * as React from "react";
import { ConfirmPanel, type ConfirmPanelProps } from "@/components/ui/swipe-to-confirm";

/* Live controls (21st Demo Controls). */
const settings = {
  mobileView: false,
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* demo content: a USDC mark for the send scenario */
const UsdcIcon = () => (
  <svg viewBox="0 0 32 32" width="100%" height="100%" aria-label="USDC">
    <circle cx="16" cy="16" r="16" fill="#2775CA" />
    <path d="M9.98 7.4A10.5 10.5 0 0 0 9.98 24.6M22.02 7.4A10.5 10.5 0 0 1 22.02 24.6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    <text x="16" y="16" dy=".36em" textAnchor="middle" fill="#fff" fontSize="15" fontWeight="700">
      $
    </text>
  </svg>
);

type Scenario = { id: string; label: string; panel: (attempt: { n: number }) => ConfirmPanelProps };

const SCENARIOS: Scenario[] = [
  {
    id: "send",
    label: "Send",
    panel: () => ({
      title: "Send",
      caption: "Balance $2,480.00",
      party: { name: "Alex Morgan", detail: "0x7a3f…c91e" },
      amount: { value: "250", token: { symbol: "USDC", icon: <UsdcIcon /> }, fiat: "≈ $250.00" },
      rows: [
        { label: "Network", value: "Base" },
        { label: "Fee", value: "$0.02" },
        { label: "Arrives", value: "~ 5 sec" },
      ],
      swipe: { label: "Slide to send", doneLabel: "Sent", onConfirm: () => wait(1400) },
    }),
  },
  {
    id: "pay",
    label: "Pay",
    panel: (attempt) => ({
      title: "Checkout",
      party: { name: "Pro plan", detail: "Billed yearly" },
      amount: { value: "$144" },
      rows: [
        { label: "Card", value: "Visa •••• 4242" },
        { label: "Renews", value: "Oct 20, 2027" },
      ],
      swipe: {
        label: "Slide to pay",
        doneLabel: "Paid",
        color: "#5856D6",
        onConfirm: async () => {
          await wait(1100);
          if (attempt.n++ === 0) throw new Error("Card declined. Try again.");
        },
      },
    }),
  },
  {
    id: "delete",
    label: "Delete",
    panel: () => ({
      title: "Delete workspace",
      party: { name: "Acme Studio", detail: "12 members · 3 projects" },
      hero: (
        <div className="rounded-[14px] bg-destructive/10 px-3.5 py-3 text-[15px] leading-[21px] text-destructive">
          This deletes every project and file for all members. You can't undo it.
        </div>
      ),
      swipe: {
        label: "Slide to delete",
        doneLabel: "Deleted",
        color: "var(--color-destructive)",
        onConfirm: () => wait(1200),
        icon: (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
          </svg>
        ),
      },
    }),
  },
];

/* segmented control on theme tokens */
function Segmented({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const i = Math.max(0, SCENARIOS.findIndex((x) => x.id === value));
  return (
    <div role="tablist" aria-label="Scenario" className="relative grid h-8 w-[252px] grid-cols-3 rounded-[9px] bg-muted p-[2px]">
      <div
        className="absolute bottom-[2px] left-[2px] top-[2px] w-[calc((100%-4px)/3)] rounded-[7px] bg-background shadow-[0_3px_8px_rgb(0_0_0/.12),0_3px_1px_rgb(0_0_0/.04)] transition-transform duration-300 [transition-timing-function:cubic-bezier(.2,.9,.25,1)]"
        style={{ transform: `translateX(${i * 100}%)` }}
      />
      {SCENARIOS.map((it) => (
        <button
          key={it.id}
          role="tab"
          type="button"
          aria-selected={it.id === value}
          onClick={() => onChange(it.id)}
          className={`relative z-10 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring ${it.id === value ? "font-semibold" : "font-medium"}`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export default function SwipeToConfirmDemo(props: Partial<typeof settings>) {
  const s = { ...settings, ...props };
  const [id, setId] = React.useState("send");
  const [run, setRun] = React.useState(0);
  const [open, setOpen] = React.useState(true);
  const attempt = React.useRef({ n: 0 });
  const sc = SCENARIOS.find((x) => x.id === id) ?? SCENARIOS[0];

  React.useEffect(() => {
    attempt.current.n = 0;
    setOpen(true);
    setRun((r) => r + 1);
  }, [id, s.mobileView]);

  const panel = sc.panel(attempt.current);
  const action = panel.swipe?.label?.replace("Slide to ", "") ?? "Open";

  return (
    <div
      className="flex min-h-screen w-full flex-col items-center justify-center gap-6 bg-background px-4 py-10 text-foreground"
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Segoe UI', Roboto, sans-serif",
        /* dot grid from the "work with AI" block of vasnev.art */
        backgroundImage: "radial-gradient(circle, color-mix(in oklab, var(--color-foreground) 7%, transparent) 0 1px, transparent 1.4px)",
        backgroundSize: "20px 13px",
        backgroundPosition: "-6px -1px",
      }}
    >
      <Segmented value={id} onChange={setId} />

      {s.mobileView ? (
        /* phone: same frame as Portfolio Hero */
        <div className="relative h-[720px] w-[360px] max-w-full overflow-hidden rounded-[47px] border-[5px] border-[#d4d4d2] bg-background shadow-2xl dark:border-[#1c1c1c]">
          <div className="absolute inset-0 grid place-items-center">
            <button
              type="button"
              onClick={() => {
                setRun((r) => r + 1);
                setOpen(true);
              }}
              className="h-[50px] rounded-xl bg-primary px-6 text-[17px] font-semibold capitalize text-primary-foreground outline-none transition-transform active:scale-[.97] focus-visible:ring-2 focus-visible:ring-ring"
            >
              {action}
            </button>
          </div>
          <ConfirmPanel key={`${id}-${run}`} {...panel} presentation="sheet" sheetContainer="parent" open={open} onOpenChange={setOpen} />
        </div>
      ) : (
        <ConfirmPanel key={`${id}-${run}`} {...panel} presentation="card" swipe={{ ...panel.swipe, resetAfter: 2600 }} />
      )}

      <p className="m-0 max-w-[360px] text-center text-[13px] leading-[18px] text-muted-foreground">
        {id === "pay" ? "The first try is declined on purpose, to show the error state." : "Drag the circle to the end, or focus it and press Enter. On phones the same panel opens as a bottom sheet."}
      </p>
    </div>
  );
}
