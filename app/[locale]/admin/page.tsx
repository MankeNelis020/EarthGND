import { Link } from "@/i18n/navigation";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { ADMIN_NAV_GROUPS } from "@/lib/admin/nav";

export const dynamic = "force-dynamic";

export default function AdminHubPage() {
  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Admin"
        description="Instrumentatie, pipeline-monitoring en Moat-dashboards — één navigatie voor alle admin-pagina’s."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {ADMIN_NAV_GROUPS.map((group) => (
          <section
            key={group.id}
            className="rounded-2xl border border-white/10 bg-black/20 p-5"
          >
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#E8761A]">
              {group.label}
            </h2>
            <p className="mt-1 text-sm text-white/45">{group.description}</p>
            <ul className="mt-4 space-y-2">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex flex-col rounded-xl border border-white/10 bg-[#1C1917]/80 px-4 py-3 transition hover:border-[#E8761A]/40 hover:bg-black/40"
                  >
                    <span className="text-sm font-medium text-stone-100">{item.label}</span>
                    <span className="mt-0.5 text-xs text-stone-500">{item.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
