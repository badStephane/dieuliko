import Image from "next/image";
import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { SITE } from "@/config/site";
import { Container } from "@/components/ui/Container";
import { NewsletterForm } from "@/components/layout/NewsletterForm";
import { getCompanyRepository } from "@/features/companies/json-source";
import { getSectorLabel } from "@/features/companies/sectors";
import { FOOTER_QUICK_LINKS, sectorHref, type NavLink } from "@/lib/navigation";

const FOOTER_LOGO_SRC = "/brand/logo-on-dark.svg";
const FOOTER_SECTOR_COUNT = 4;
const FOOTER_TAGLINE =
  "L'annuaire des entreprises du Sénégal pour envoyer vos candidatures spontanées, même sans offre publiée.";

function FooterColumn({ title, links }: { readonly title: string; readonly links: readonly NavLink[] }) {
  return (
    <div>
      <h2 className="text-[24px] leading-9 font-semibold text-white">{title}</h2>
      <ul className="mt-[34px] flex flex-col gap-7 leading-[23px]">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-[18px] leading-[23px] text-white/85 transition-colors hover:text-primary">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function contactRows() {
  const { city, email, phone } = SITE.contact;
  return [
    { icon: MapPin, label: city, href: null },
    email ? { icon: Mail, label: email, href: `mailto:${email}` } : null,
    phone ? { icon: Phone, label: phone, href: `tel:${phone.replace(/\s+/g, "")}` } : null,
  ].filter((row) => row !== null);
}

export async function Footer() {
  const repository = await getCompanyRepository();
  const topSectors = (await repository.sectorCounts()).slice(0, FOOTER_SECTOR_COUNT);
  const sectorLinks: readonly NavLink[] = topSectors.map(({ sector }) => ({
    label: getSectorLabel(sector),
    href: sectorHref(sector),
  }));

  return (
    <footer className="border-t border-white/10 bg-ink text-white">
      <Container>
        <div className="grid gap-8 pt-20 pb-10 tab:grid-cols-2 tab:pt-[110px] tab:pb-[51px] desk:grid-cols-[398px_224px_238px_340px] desk:gap-0 desk:pt-[120px] desk:pb-[109px]">
          <div>
            <Image src={FOOTER_LOGO_SRC} alt="Dieuliko" width={175} height={48} />
            <p className="mt-6 max-w-[320px] text-[18px] leading-[27px] text-white/85">{FOOTER_TAGLINE}</p>
            <ul className="mt-[34px] flex flex-col gap-4 desk:mt-[33px]">
              {contactRows().map(({ icon: Icon, label, href }) => (
                <li key={label} className="flex items-center gap-2.5 text-[18px] leading-[23px] text-white/85">
                  <Icon className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
                  {href ? (
                    <a href={href} className="transition-colors hover:text-primary">
                      {label}
                    </a>
                  ) : (
                    <span>{label}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <FooterColumn title="Liens rapides" links={FOOTER_QUICK_LINKS} />
          <FooterColumn title="Secteurs" links={sectorLinks} />
          <div className="max-w-[340px]">
            <h2 className="text-[24px] leading-9 font-semibold text-white">Newsletter</h2>
            <p className="mt-2.5 text-[18px] leading-[27px] text-white/85">
              Recevez les nouvelles entreprises de l&apos;annuaire et nos conseils de candidature.
            </p>
            <NewsletterForm className="mt-8" />
          </div>
        </div>
        <div className="border-t border-white/10 py-6 text-center text-[18px] leading-[27px] text-white/85">
          © {new Date().getFullYear()} {SITE.name}. {SITE.tagline}
        </div>
      </Container>
    </footer>
  );
}
