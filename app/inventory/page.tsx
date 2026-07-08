import InventorySimulator from "@/components/inventory/InventorySimulator";

export const metadata = {
  title: "Inventory Simulator — Garden Retakes",
  description: "Build weapon loadouts with skins and stickers that sync in-game.",
};

export default function InventoryPage() {
  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-inner">
          <span className="eyebrow">Inventory Simulator</span>
          <h1>
            Build your <span className="grad">loadout</span>.
          </h1>
          <p className="muted">
            Pick a weapon, dress it in any skin, place your stickers, and swap between loadouts.
            Sign in with Steam and your picks appear in-game on Garden Retakes.
          </p>
        </div>
      </section>

      <InventorySimulator />
    </>
  );
}
