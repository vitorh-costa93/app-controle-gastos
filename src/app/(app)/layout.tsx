import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1">
      <Sidebar />
      <div className="min-w-0 flex-1 pb-20 md:pb-0">
        <main className="mx-auto w-full max-w-[1600px] min-w-0 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
