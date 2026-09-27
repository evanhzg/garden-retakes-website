import InventorySimulator from "@/components/inventory/InventorySimulator";
// After globals, so the page's own `.iv-*` rules sit on top of the site base.
import "./inventory.css";

export const metadata = {
  title: "Inventory Simulator — Garden Retakes",
  description: "Build weapon loadouts with skins and stickers that sync in-game.",
};

export default function InventoryPage() {
  return <InventorySimulator />;
}
