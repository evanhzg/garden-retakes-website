export default function InventoryPage() {
  return (
    <section className="panel">
      <h2>Inventory Simulator</h2>
      <p className="muted">
        Coming soon: this page will integrate{" "}
        <a href="https://inventory.cstrike.app" target="_blank" rel="noreferrer">
          InventorySimulator (cs2-inventory-simulator)
        </a>{" "}
        so you can build the skin loadout you use on the server. The game server will run the
        companion CounterStrikeSharp plugin and read loadouts from the simulator&apos;s API.
      </p>
      <p className="muted">
        Planned flow: sign in through Steam on the simulator, equip skins, and they appear
        in-game on Garden Retakes automatically.
      </p>
    </section>
  );
}
