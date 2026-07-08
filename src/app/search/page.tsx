import { PageHeader } from "@/components/PageHeader";
import { SearchClient } from "./SearchClient";

export const metadata = { title: "Wyszukiwanie — Talent Trop" };

export default function SearchPage() {
  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        kicker="live research"
        title="Wyszukiwanie"
        subtitle="Szybki research zawodnika po imieniu i nazwisku — live z sieci, niezależnie od bazy"
      />
      <SearchClient />
    </div>
  );
}
