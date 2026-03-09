"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Dashboard", href: "/" },
  { label: "Daily Entry", href: "/entry" },
  { label: "Plan", href: "/plan" },
  { label: "Goals", href: "/goals" },
  { label: "Review", href: "/review" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[220px] h-screen bg-tempo-surface border-r border-tempo-border fixed top-0 left-0 bottom-0 flex flex-col py-8 max-md:hidden">
      <div className="px-7 mb-10">
        <h1 className="font-display text-2xl tracking-tight text-tempo-text">
          Tempo
        </h1>
      </div>

      <nav className="flex flex-col flex-1">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`font-ui text-sm py-2.5 px-7 border-l-2 transition-colors ${
                isActive
                  ? "text-tempo-text font-medium border-tempo-text"
                  : "text-tempo-muted border-transparent hover:text-tempo-text"
              }`}
            >
              {item.label}
            </Link>
          );
        })}

        <div className="mt-auto pt-6 border-t border-tempo-border">
          <Link
            href="/settings"
            className={`font-ui text-sm py-2.5 px-7 border-l-2 transition-colors block ${
              pathname === "/settings"
                ? "text-tempo-text font-medium border-tempo-text"
                : "text-tempo-muted border-transparent hover:text-tempo-text"
            }`}
          >
            Settings
          </Link>
        </div>
      </nav>
    </aside>
  );
}
