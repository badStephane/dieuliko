import Link from "next/link";
import { Building2, Mail, MapPin, Phone, Search, type LucideIcon } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SITE } from "@/config/site";
import { COMPANIES_PATH, COMPANY_SPACE_PATH } from "@/lib/navigation";

interface ContactCard {
  readonly title: string;
  readonly icon: LucideIcon;
  readonly text: string;
  readonly href?: string;
}

/** Only real information: the city, plus the phone / e-mail once the owner provides them. */
function buildCards(): readonly ContactCard[] {
  const { city, phone, email } = SITE.contact;
  const optionalCards: readonly (ContactCard | null)[] = [
    phone ? { title: "Téléphone", icon: Phone, text: phone, href: `tel:${phone.replace(/\s+/g, "")}` } : null,
    email ? { title: "E-mail", icon: Mail, text: email, href: `mailto:${email}` } : null,
  ];
  return [
    { title: "Où nous trouver", icon: MapPin, text: city },
    ...optionalCards.filter((card): card is ContactCard => card !== null),
    { title: "Vous êtes candidat ?", icon: Search, text: "Parcourez l’annuaire des entreprises", href: COMPANIES_PATH },
    { title: "Vous êtes une entreprise ?", icon: Building2, text: "Découvrez l’espace entreprise", href: COMPANY_SPACE_PATH },
  ];
}

function ContactInfoCard({ card }: { readonly card: ContactCard }) {
  const Icon = card.icon;
  return (
    <li className="flex flex-col items-center rounded-[6px] bg-soft p-[30px] text-center">
      <span className="flex size-16 items-center justify-center rounded-[4px] bg-white text-primary">
        <Icon aria-hidden className="size-[34px]" strokeWidth={1.25} />
      </span>
      <h2 className="mt-8 text-[24px] leading-[36px] font-semibold">{card.title}</h2>
      {card.href ? (
        <Link
          href={card.href}
          className="mt-1 text-[18px] leading-[27px] text-ink-deep underline-offset-4 transition-colors duration-300 hover:text-primary hover:underline"
        >
          {card.text}
        </Link>
      ) : (
        <p className="mt-1 text-[18px] leading-[27px] text-ink-deep">{card.text}</p>
      )}
    </li>
  );
}

/** Grey information cards right under the Contact banner. */
export function ContactInfoCards() {
  const cards = buildCards();
  return (
    <section aria-label="Informations de contact" className="bg-white py-[60px] tab:py-20 desk:py-[120px]">
      <Container>
        <Reveal>
          <ul className="grid gap-5 tab:grid-cols-2 tab:gap-6 desk:grid-cols-3 desk:gap-[30px]">
            {cards.map((card) => (
              <ContactInfoCard key={card.title} card={card} />
            ))}
          </ul>
        </Reveal>
      </Container>
    </section>
  );
}
