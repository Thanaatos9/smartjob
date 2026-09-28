"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, LayoutGrid, ClipboardList, History, UserRound, Zap, LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/search", label: "Rechercher", icon: Search },
  { href: "/dashboard", label: "Mes offres", icon: LayoutGrid },
  { href: "/applications", label: "Candidatures", icon: ClipboardList },
  { href: "/history", label: "Historique", icon: History },
  { href: "/auto-apply", label: "Auto-candidature", icon: Zap },
  { href: "/profile", label: "Profil", icon: UserRound },
];

export function Sidebar({ userName }: { userName?: string | null }) {
  const pathname = usePathname();
  const [name, setName] = useState<string | null>(userName ?? null);

  useEffect(() => {
    // Le nom est déjà résolu côté serveur sur la plupart des pages ; on ne
    // refait l'appel réseau ici que si aucune valeur n'a été fournie.
    if (userName !== undefined) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) return;
      const fullName =
        (user.user_metadata?.full_name as string | undefined)?.trim() ||
        user.email ||
        null;
      setName(fullName);
    });
  }, [userName]);

  const initial = (name ?? "?").charAt(0).toUpperCase();

  return (
    <aside className="sticky top-0 z-20 flex h-auto shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-4 py-3 md:h-dvh md:w-60 md:flex-col md:items-stretch md:justify-start md:border-b-0 md:border-r md:px-4 md:py-6">
      <Link
        href="/profile"
        className="flex items-center gap-2.5 md:mb-8 md:px-2"
        title={name ?? undefined}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {initial}
        </span>
        <span className="hidden max-w-[9rem] truncate text-sm font-semibold tracking-tight md:inline">
          {name ?? "Mon compte"}
        </span>
      </Link>

      <nav className="flex items-center gap-1 md:flex-1 md:flex-col md:items-stretch md:gap-1">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              <span className="hidden md:inline">{label}</span>
            </Link>
          );
        })}
      </nav>

      <form action={logout} className="md:mt-auto">
        <button
          type="submit"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
        >
          <LogOut className="size-5 shrink-0" aria-hidden />
          <span className="hidden md:inline">Déconnexion</span>
        </button>
      </form>
    </aside>
  );
}
