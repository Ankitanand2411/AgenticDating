import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agentic Dating",
  description: "Every person gets an agent. The agents read two public profiles, go on dates with each other, and rank who fits each person best.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="sticky top-0 z-20 border-b border-line/70 bg-ink/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
            <Link href="/" className="font-display text-xl tracking-tight text-paper no-underline">
              Agentic<span className="text-rose"> Dating</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <NavLink href="/">People</NavLink>
              <NavLink href="/dates">Dates</NavLink>
              <NavLink href="/rankings">Rankings</NavLink>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 pb-24 pt-8">{children}</main>
        <footer className="border-t border-line/60 py-8 text-center text-xs text-muted">
          Two sources per person: a public LinkedIn and a public Instagram. Nothing else.
        </footer>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-md px-3 py-1.5 text-muted no-underline transition hover:bg-surface hover:text-paper">
      {children}
    </Link>
  );
}
