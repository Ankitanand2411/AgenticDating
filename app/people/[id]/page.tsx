import PersonView from "@/components/PersonView";

export default function Page({ params }: { params: { id: string } }) {
  return <PersonView id={params.id} />;
}
