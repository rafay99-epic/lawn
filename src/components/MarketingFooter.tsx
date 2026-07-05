import { Link } from "@tanstack/react-router";
import { paymentsEnabled } from "@/lib/featureFlags";

export function MarketingFooter() {
  return (
    <footer className="border-t-2 border-[#1a1a1a] bg-[#1a1a1a] px-6 py-16 text-[#f0f0e8]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-16 grid grid-cols-2 gap-12 md:grid-cols-4">
          <div>
            <h3 className="mb-4 text-sm font-black tracking-widest text-[#888] uppercase">
              Product
            </h3>
            <ul className="space-y-3 text-sm font-bold">
              {paymentsEnabled && (
                <li>
                  <Link to="/pricing" className="transition-colors hover:text-[#7cb87c]">
                    Pricing
                  </Link>
                </li>
              )}
              <li>
                <Link to="/sign-up" className="transition-colors hover:text-[#7cb87c]">
                  {paymentsEnabled ? "Start free trial" : "Get started"}
                </Link>
              </li>
              <li>
                <Link to="/sign-in" className="transition-colors hover:text-[#7cb87c]">
                  Sign in
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-4 text-sm font-black tracking-widest text-[#888] uppercase">
              Compare
            </h3>
            <ul className="space-y-3 text-sm font-bold">
              <li>
                <Link to="/compare/frameio" className="transition-colors hover:text-[#7cb87c]">
                  lawn vs Frame.io
                </Link>
              </li>
              <li>
                <Link to="/compare/wipster" className="transition-colors hover:text-[#7cb87c]">
                  lawn vs Wipster
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-4 text-sm font-black tracking-widest text-[#888] uppercase">
              Use cases
            </h3>
            <ul className="space-y-3 text-sm font-bold">
              <li>
                <Link to="/for/video-editors" className="transition-colors hover:text-[#7cb87c]">
                  For video editors
                </Link>
              </li>
              <li>
                <Link to="/for/agencies" className="transition-colors hover:text-[#7cb87c]">
                  For agencies
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-4 text-sm font-black tracking-widest text-[#888] uppercase">
              Open source
            </h3>
            <ul className="space-y-3 text-sm font-bold">
              <li>
                <a
                  href="https://github.com/pingdotgg/lawn"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-[#7cb87c]"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="flex flex-col items-center justify-between gap-4 border-t border-[#333] pt-8 md:flex-row">
          <span className="text-3xl font-black tracking-tighter">lawn.</span>
          <span className="text-sm text-[#888]">Video review for creative teams.</span>
        </div>
      </div>
    </footer>
  );
}
