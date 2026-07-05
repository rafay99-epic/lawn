import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { paymentsEnabled } from "@/lib/featureFlags";

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 z-50 flex w-full items-center justify-between px-6 py-4 transition-all duration-200 ${scrolled ? "border-b-2 border-[#1a1a1a] bg-[#f0f0e8] text-[#1a1a1a]" : "border-b-2 border-[#1a1a1a] bg-[#f0f0e8] text-[#1a1a1a]"}`}
    >
      <div className="flex items-center gap-4">
        <Link to="/" className="text-xl font-black tracking-tighter">
          lawn.
        </Link>
      </div>
      <div className="flex items-center gap-6 text-sm font-bold tracking-wide uppercase">
        {paymentsEnabled && (
          <Link to="/pricing" className="hidden underline-offset-4 hover:underline sm:block">
            Pricing
          </Link>
        )}
        <Link to="/compare/frameio" className="hidden underline-offset-4 hover:underline sm:block">
          Compare
        </Link>
        <Link to="/sign-in" className="underline-offset-4 hover:underline">
          Log in
        </Link>
        <Link
          to="/sign-up"
          className="border-2 border-[#1a1a1a] px-4 py-2 transition-colors hover:bg-[#1a1a1a] hover:text-[#f0f0e8]"
        >
          Start
        </Link>
      </div>
    </nav>
  );
}
