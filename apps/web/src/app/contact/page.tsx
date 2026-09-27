import type { Metadata } from "next";
import { ContactFormSection } from "@/components/contact/ContactFormSection";
import { ContactInfoCards } from "@/components/contact/ContactInfoCards";
import { PageBanner } from "@/components/layout/PageBanner";

export const metadata: Metadata = {
  title: "Contact",
  description: "Une question sur Dieuliko, en tant que candidat ou entreprise ? Écrivez-nous.",
};

export default function ContactPage() {
  return (
    <>
      <PageBanner
        title="Contact"
        subtitle="Une question, une suggestion, une entreprise à ajouter ? Écrivez-nous."
        bottomPaddingClassName="pb-[60px] tab:pb-20 desk:pb-[88px]"
      />
      <ContactInfoCards />
      <ContactFormSection />
    </>
  );
}
