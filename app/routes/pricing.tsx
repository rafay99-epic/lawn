import { createFileRoute, redirect } from "@tanstack/react-router";
import { seoHead } from "@/lib/seo";
import { paymentsEnabled } from "@/lib/featureFlags";
import PricingPage from "./-pricing";

export const Route = createFileRoute("/pricing")({
  beforeLoad: () => {
    // Payments disabled: there is no pricing to show — send visitors home.
    if (!paymentsEnabled) {
      throw redirect({ to: "/" });
    }
  },
  head: () =>
    seoHead({
      title: "Pricing — $5/month, unlimited seats",
      description:
        "lawn pricing is simple. $5/month for unlimited seats, projects, and clients. $25/month if you need more storage. No per-user fees.",
      path: "/pricing",
      ogImage: "/og/pricing.png",
    }),
  component: PricingPage,
});
