import { DateView } from "@/components/DatesView";

export default function Page({ params }: { params: { id: string } }) {
  return <DateView id={params.id} />;
}
