import { GraphView } from "@/components/graph/GraphView";

export const metadata = { title: "Grafo — JARVIS" };

export default async function GraphPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const { focus } = await searchParams;
  return <GraphView focusId={focus} />;
}
