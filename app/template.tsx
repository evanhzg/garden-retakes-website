export default function Template({ children }: { children: React.ReactNode }) {
  // Re-mounts on every route change so pages animate in.
  return <div className="page-enter">{children}</div>;
}
