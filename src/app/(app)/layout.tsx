import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { BackgroundSync } from "@/components/layout/BackgroundSync";
import { InterfaceProvider } from "@/components/layout/InterfaceProvider";
import { ModernHeader } from "@/components/layout/ModernHeader";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <InterfaceProvider>
      <Sidebar />
      <div className="min-w-0 flex-1 pb-20 md:pb-0">
        <ModernHeader />
        <main className="interface-main mx-auto w-full max-w-[1600px] min-w-0 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
      <BottomNav />
      <BackgroundSync />
    </InterfaceProvider>
  );
}
