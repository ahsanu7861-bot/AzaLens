import {
  GreetingHero,
  WatchlistPreview,
  PortfolioSummary,
} from "../components/dashboard";

export default function DashboardPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="app-atmosphere min-h-[calc(100dvh-68px)] px-5 py-8 sm:px-8 lg:px-10"
    >
      <div className="relative mx-auto max-w-[1500px] space-y-8">
        <GreetingHero />

        <div className="grid gap-6 xl:grid-cols-2">
          <WatchlistPreview />
          <PortfolioSummary />
        </div>
      </div>
    </main>
  );
}
