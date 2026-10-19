import Link from "next/link";
import { site, type Locale, type PageKey } from "@/content/site";
import { route } from "@/lib/routes";

export function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="section-title">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}

export function ProgramCards({ locale }: { locale: Locale }) {
  return (
    <div className="card-grid">
      {site[locale].programs.map((program, i) => (
        <article className="program-card" key={program.title}>
          <span className="card-index" aria-hidden="true">
            0{i + 1}
          </span>
          <h3>{program.title}</h3>
          <p>{program.description}</p>
        </article>
      ))}
    </div>
  );
}

export function PackageCards({ locale }: { locale: Locale }) {
  const t = site[locale];
  return (
    <>
      <div className="card-grid package-grid">
        {t.packages.map((pack, i) => (
          <article
            className={`package-card ${i === 1 ? "package-accent" : ""}`}
            key={pack.id}
            data-package={pack.id}
          >
            <p className="eyebrow">0{i + 1}</p>
            <h2>{pack.title}</h2>
            <p className="price">
              <bdi>{pack.price}</bdi>{" "}
              <span>
                {t.currency}
                <small>{t.perMonth}</small>
              </span>
            </p>
            <p className="lesson-meta">
              8 {t.lessons} <span aria-hidden="true">·</span>{" "}
              {pack.upTo && `${t.upTo} `}
              {pack.duration} {t.minutes}
            </p>
            <ul className="feature-list">
              {pack.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <Link
              className="button button-outline-dark"
              href={route(locale, "contact")}
            >
              {t.packageCta}
              <span aria-hidden="true">↗</span>
            </Link>
          </article>
        ))}
      </div>
      <p className="notice package-note">{t.packageNote}</p>
    </>
  );
}

export function LearningSteps({ locale }: { locale: Locale }) {
  return (
    <ol className="steps">
      {site[locale].steps.map((step, i) => (
        <li key={step.title}>
          <span className="step-index" aria-hidden="true">
            0{i + 1}
          </span>
          <div>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function FaqList({ locale }: { locale: Locale }) {
  return (
    <div className="faq-list">
      {site[locale].faqs.map((item) => (
        <details key={item.question}>
          <summary>{item.question}</summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </div>
  );
}

export function PublicPage({
  locale,
  page,
}: {
  locale: Locale;
  page: PageKey;
}) {
  const t = site[locale];
  const intro: Record<PageKey, string> = {
    about: t.publicPages.about.description,
    teachers: t.publicPages.teachers.description,
    enrollment: t.publicPages.enrollment.description,
    programs: t.intro.description,
    packages: t.packagesIntro,
    learning: t.learningIntro,
    faq: t.faqIntro,
    contact: t.contact.description,
    privacy: t.privacy.intro,
    terms: t.terms.intro,
  };
  return (
    <>
      <section className="page-heading">
        <div className="container">
          <Link className="breadcrumb" href={route(locale)}>
            {t.home}
          </Link>
          <h1>{t.nav[page]}</h1>
          <p>{intro[page]}</p>
        </div>
      </section>
      <section className="page-content">
        <div className="container">
          {page === "programs" && (
            <>
              <ProgramCards locale={locale} />
              <div className="section-end">
                <Link className="button" href={route(locale, "packages")}>
                  {t.nav.packages}
                  <span aria-hidden="true">↗</span>
                </Link>
              </div>
            </>
          )}
          {page === "packages" && <PackageCards locale={locale} />}
          {page === "learning" && (
            <>
              <LearningSteps locale={locale} />
              <p className="notice">{t.learningNotice}</p>
            </>
          )}
          {page === "faq" && <FaqList locale={locale} />}
          {(page === "about" || page === "teachers" || page === "enrollment") && (
            <div className="public-detail">
              <p className="eyebrow">{t.publicPages[page].eyebrow}</p>
              <h2>{t.publicPages[page].title}</h2>
              <p>{t.publicPages[page].description}</p>
              <ul className="feature-list">{t.publicPages[page].points.map((point) => <li key={point}>{point}</li>)}</ul>
              {page === "enrollment" && <Link className="button" href={`/${locale}/workspace`}>{t.demoLabel}<span aria-hidden="true">↗</span></Link>}
            </div>
          )}
          {page === "contact" && (
            <div className="contact-panel">
              <span className="status-label">{t.contact.status}</span>
              <h2>{t.contact.title}</h2>
              <p>{t.contact.phoneLabel}</p><p>{t.contact.whatsappLabel}</p>
              <p>{t.contact.notice}</p>
              <p><Link className="text-link" href={route(locale, "faq")}>{t.nav.faq}</Link> · <Link className="text-link" href={route(locale, "packages")}>{t.nav.packages}</Link> · <Link className="text-link" href={`/${locale}/workspace`}>{t.demoLink}</Link></p>
            </div>
          )}
          {(page === "privacy" || page === "terms") && (
            <div className="policy-sections">
              {t[page].sections.map((section) => (
                <section key={section.title}>
                  <h2>{section.title}</h2>
                  <p>{section.body}</p>
                </section>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
