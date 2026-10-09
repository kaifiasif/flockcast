import type { AdviceResult } from '@/api/types';

type Finding = AdviceResult['findings'][number];

/** A small link to the web page a claim came from. Only http(s) links from the research render. */
export function Cite({ id, findings }: { id: string | null; findings: Finding[] }) {
  const f = id ? findings.find((x) => x.id === id) : undefined;
  if (!f || !/^https?:\/\//.test(f.url)) return null;
  return (
    <a href={f.url} target="_blank" rel="noopener noreferrer nofollow" className="text-xs font-medium whitespace-nowrap text-brand underline-offset-4 hover:underline">
      {f.source}
    </a>
  );
}
