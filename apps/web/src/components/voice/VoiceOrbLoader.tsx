'use client';

import dynamic from 'next/dynamic';

const VoiceOrb = dynamic(() => import('./VoiceOrb'), { ssr: false });

export default function VoiceOrbLoader() {
  return <VoiceOrb />;
}
