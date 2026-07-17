import dynamic from "next/dynamic";

// Dynamic import with ssr: false is CRITICAL for Phaser 3 because it relies on window/document.
const PhaserSpikeNoSSR = dynamic(() => import("./PhaserSpike"), { ssr: false });

export default function PkmnSpikePage() {
  return <PhaserSpikeNoSSR />;
}
