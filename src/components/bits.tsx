import type { CSSProperties } from "react";
import { Link } from "react-router";
import { nav, studio } from "../content.ts";
import { useReveal } from "../lib/scroll.ts";
import BlurText from "../reactbits/BlurText.tsx";

/** Titular en líneas que suben al entrar en pantalla. */
export function Lines({
  lines,
  as: Tag = "h2",
  className,
}: {
  lines: string[];
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  const ref = useReveal<HTMLHeadingElement>();
  return (
    <Tag ref={ref} className={className}>
      {lines.map((line, i) => (
        <span key={line} className="reveal-line" style={{ "--i": i } as CSSProperties}>
          <span>{line}</span>
        </span>
      ))}
    </Tag>
  );
}

/** Título de sección: las palabras entran desenfocadas (BlurText de React Bits). */
export function Title({ text, level = 2, className }: { text: string; level?: 1 | 2 | 3; className?: string }) {
  return (
    <div role="heading" aria-level={level} className={className}>
      <BlurText text={text} animateBy="words" direction="bottom" delay={90} />
    </div>
  );
}

/** Borde en onda entre secciones. El color viene de `color` en CSS. */
export function Wave({ className = "" }: { className?: string }) {
  return (
    <svg className={`wave ${className}`} viewBox="0 0 1200 80" preserveAspectRatio="none" aria-hidden="true">
      <path
        fill="currentColor"
        d="M0 80V42c90-34 190-40 300-14s210 34 310 8 190-40 300-22 200 30 290 6v60Z"
      />
    </svg>
  );
}

/** Hoja propia inspirada en el logo. El color viene de `color` en CSS. */
export function Leaf({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 200 320" aria-hidden="true">
      <path
        fill="currentColor"
        d="M100 0C150 60 196 130 190 205c-5 62-45 105-90 115C55 310 15 267 10 205 4 130 50 60 100 0Z"
      />
      <path
        fill="none"
        stroke="var(--canvas)"
        strokeWidth="7"
        strokeLinecap="round"
        d="M100 70v230M100 150l48-44M100 150 52 106M100 215l58-50M100 215 42 165M100 270l40-32M100 270 60 238"
      />
    </svg>
  );
}

export function Nav() {
  return (
    <header className="nav">
      <Link className="nav__brand" to="/">
        <img src={studio.logo} alt="" width={40} height={40} />
        {studio.name}
      </Link>
      <nav className="nav__links" aria-label="Main">
        {nav.map((item) => (
          <Link key={item.href} className="btn btn--sm" to={item.href}>
            {item.label}
          </Link>
        ))}
        <Link className="btn btn--sm btn--fill" to="/#contact">
          Contact
        </Link>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <hr className="dotted" />
      <div className="footer__row">
        <span className="caption">
          © {new Date().getFullYear()} {studio.name}
        </span>
        <Link className="caption" to="/admin">
          Team login
        </Link>
      </div>
    </footer>
  );
}
