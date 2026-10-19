import Link from "next/link";
import { site, type Locale, type PageKey } from "@/content/site";
import { route } from "@/lib/routes";

export function SiteShell({
  locale,
  page,
  children,
}: {
  locale: Locale;
  page?: PageKey;
  children: React.ReactNode;
}) {
  const t = site[locale];
  const other = locale === "ar" ? "en" : "ar";
  const primary: PageKey[] = [
    "about",
    "teachers",
    "enrollment",
    "programs",
    "packages",
    "learning",
    "faq",
    "contact",
  ];
  const links = primary.map((key) => (
    <Link
      key={key}
      href={route(locale, key)}
      aria-current={page === key ? "page" : undefined}
    >
      {t.nav[key]}
    </Link>
  ));
  return (
    <>
      <a className="skip-link" href="#main-content">
        {t.skip}
      </a>
      <div className="preview-banner">{t.preview}</div>
      <header className="site-header">
        <div className="container header-row">
          <Link
            className="brand"
            href={route(locale)}
            aria-label={`${t.brand} — ${t.home}`}
          >
            <span className="brand-mark" aria-hidden="true">
              ع
            </span>
            <span>
              <strong>{t.brand}</strong>
              <small>{t.brandSubtitle}</small>
            </span>
          </Link>
          <nav className="desktop-nav" aria-label={t.home}>
            {links}
          </nav>
          {/* A document navigation refreshes root lang/dir across locales. */}
          <Link className="workspace-link" href={`/${locale}/workspace`}>{t.demoLink}</Link>
          <a
            className="language-link"
            href={route(other, page)}
            hrefLang={other}
            lang={other}
          >
            {t.language}
            <span aria-hidden="true"> ⇄</span>
          </a>
          <details className="mobile-nav">
            <summary>{t.home}</summary>
            <nav aria-label={t.home}>{links}</nav>
          </details>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <div className="container">
          <div className="footer-top">
            <div>
              <strong>{t.brand}</strong>
              <p>{t.brandSubtitle}</p>
            </div>
            <nav
              aria-label={locale === "ar" ? "روابط السياسات" : "Policy links"}
            >
              <Link href={route(locale, "privacy")}>{t.nav.privacy}</Link>
              <Link href={route(locale, "terms")}>{t.nav.terms}</Link>
              <Link href={route(locale, "contact")}>{t.nav.contact}</Link>
            </nav>
          </div>
          <p className="future-note">{t.future}</p>
          <p className="copyright">© 2026 {t.footer}</p>
        </div>
      </footer>
    </>
  );
}
