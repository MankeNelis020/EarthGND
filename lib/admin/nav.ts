/** Shared EarthGND admin navigation — single source for all /admin pages. */

export type AdminNavItem = {
  id: string;
  href: string;
  label: string;
  description: string;
  /** Match this path prefix for active state (defaults to href). */
  match?: string;
};

export type AdminNavGroup = {
  id: string;
  label: string;
  description: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    id: "instrumentatie",
    label: "Instrumentatie",
    description: "Evidence, data-pipeline en bodemmonitoring.",
    items: [
      {
        id: "evidence-lab",
        href: "/admin/evidence-lab",
        label: "Evidence Lab",
        description: "Kalibratie, GeoTOP-validatie en empirical gates.",
        match: "/admin/evidence-lab",
      },
      {
        id: "pipeline",
        href: "/admin/pipeline",
        label: "Pipeline",
        description: "Healthchecks van externe bodem- en GeoTOP-bronnen.",
        match: "/admin/pipeline",
      },
      {
        id: "soil-monitoring",
        href: "/admin/soil-monitoring",
        label: "Soil monitoring",
        description: "Shadow learning, drift en confidence-signalen.",
        match: "/admin/soil-monitoring",
      },
    ],
  },
  {
    id: "moat",
    label: "Moat",
    description: "Directeur-, sales- en operations-dashboards.",
    items: [
      {
        id: "moat-board",
        href: "/admin/moat",
        label: "Directeur",
        description: "Board-overzicht: pipeline, retention en unit economics.",
        match: "/admin/moat",
      },
      {
        id: "moat-sales",
        href: "/admin/moat/sales",
        label: "Sales",
        description: "Leads, conversie en credit-consumptie.",
        match: "/admin/moat/sales",
      },
      {
        id: "moat-ops",
        href: "/admin/moat/ops",
        label: "Operations",
        description: "Installaties, fouten en operationele KPI’s.",
        match: "/admin/moat/ops",
      },
    ],
  },
];

/** Alias used by hub page. */
export const ADMIN_NAV_GROUPS = ADMIN_NAV;

/** Longest-prefix match so /admin/moat does not steal /admin/moat/sales. */
export function resolveActiveAdminId(pathname: string): string | null {
  const path = pathname.replace(/^\/(nl|en|de)(?=\/)/, "") || pathname;
  if (path === "/admin" || path === "/admin/") return null;
  if (path === "/admin/moat") return "moat-board";

  let best: { id: string; len: number } | null = null;
  for (const group of ADMIN_NAV) {
    for (const item of group.items) {
      const match = item.match ?? item.href;
      if (path === match || path.startsWith(`${match}/`)) {
        if (!best || match.length > best.len) {
          best = { id: item.id, len: match.length };
        }
      }
    }
  }
  return best?.id ?? null;
}

export function adminHrefIsActive(pathname: string, item: AdminNavItem): boolean {
  return resolveActiveAdminId(pathname) === item.id;
}
