import { DOC_SECTIONS } from "@/lib/apiDocs";
import DocsOverviewClient from "./DocsOverviewClient";

export default function DocsPage() {
  return <DocsOverviewClient apiSections={DOC_SECTIONS} />;
}
