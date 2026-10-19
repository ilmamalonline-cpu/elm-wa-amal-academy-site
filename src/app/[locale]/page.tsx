import Link from "next/link";
import { notFound } from "next/navigation";
import { site } from "@/content/site";
import { isLocale, route } from "@/lib/routes";
import { SiteShell } from "@/components/site-shell";
import {
  ProgramCards,
  LearningSteps,
  SectionTitle,
} from "@/components/public-content";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = site[locale];
  return (
    <SiteShell locale={locale}>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">{t.hero.eyebrow}</p>
            <h1>{t.hero.title}</h1>
            <p className="hero-description">{t.hero.description}</p>
            <div className="hero-actions">
              <Link className="button" href={route(locale, "packages")}>
                {t.hero.primary}
                <span aria-hidden="true">↗</span>
              </Link>
              <Link
                className="button button-light"
                href={`/${locale}/workspace`}
              >
                {t.demoLink}
              </Link>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="arch">
              <div className="arch-inner">
                <div className="ornament">✧</div>
                <div className="book-mark">
                  <span />
                  <span />
                </div>
                <div className="ornament ornament-bottom">✧</div>
              </div>
            </div>
            <div className="art-caption">{t.brand}</div>
          </div>
        </div>
      </section>
      <section className="home-intro">
        <div className="container">
          <SectionTitle
            eyebrow={t.intro.eyebrow}
            title={t.intro.title}
            description={t.intro.description}
          />
          <ProgramCards locale={locale} />
          <div className="section-end">
            <Link className="text-link" href={route(locale, "programs")}>
              {t.nav.programs}
              <span aria-hidden="true"> ↗</span>
            </Link>
          </div>
        </div>
      </section>
      <section className="method-section">
        <div className="container">
          <SectionTitle title={t.nav.learning} description={t.learningIntro} />
          <LearningSteps locale={locale} />
          <p className="notice">{t.learningNotice}</p>
        </div>
      </section>
      <section className="workflow-preview">
        <div className="container workflow-grid">
          <SectionTitle
            eyebrow={t.nav.learning}
            title={
              locale === "ar"
                ? "من الخطة إلى أثر يمكن متابعته"
                : "From a learning plan to progress you can follow"
            }
            description={t.learningIntro}
          />
          <div className="preview-panel">
            <p className="eyebrow">{t.preview}</p>
            <h2>{t.demoLink}</h2>
            <p>{t.publicPages.enrollment.description}</p>
            <Link className="button" href={`/${locale}/workspace`}>
              {t.demoLabel}
              <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
      </section>
      <section className="home-contact">
        <div className="container contact-row">
          <div>
            <p className="eyebrow">{t.nav.packages}</p>
            <h2>{t.packagesIntro}</h2>
          </div>
          <Link className="button" href={route(locale, "packages")}>
            {t.hero.primary}
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    </SiteShell>
  );
}
