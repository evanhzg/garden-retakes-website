import InventorySimulator from "@/components/inventory/InventorySimulator";
// After globals, so the page's own rules win over the .inv4-* blocks still
// living there. See the note at the top of the file.
import "./inventory.css";

export const metadata = {
  title: "Inventory Simulator — Garden Retakes",
  description: "Build weapon loadouts with skins and stickers that sync in-game.",
};

export default function InventoryPage() {
  return <InventorySimulator />;
}
