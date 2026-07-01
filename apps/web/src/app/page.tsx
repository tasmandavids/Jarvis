import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CYPHER',
  description: 'Personal Intelligence Core',
};

// The CYPHER interface is a self-contained Claude Design (.dc.html) whose
// runtime (support.js) loads its own React/Babel and mounts to <x-dc>. We serve
// it from /public and embed it in a full-bleed iframe so its runtime stays
// isolated from Next.js's React tree.
export default function Home() {
  return (
    <iframe
      src="/cypher-interface.html"
      title="CYPHER Interface"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        border: 'none',
        background: '#020203',
      }}
    />
  );
}
