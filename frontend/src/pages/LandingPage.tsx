import Navbar from "../components/landing/Navbar";
import Hero from "../components/landing/Hero";
import MarketSnapshot from "../components/landing/MarketSnapshot";
import ProductPreview from "../components/landing/ProductPreview";
import Footer from "../components/landing/Footer";

export default function LandingPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-screen bg-canvas text-ink"
    >
      <Navbar />
      <Hero />
      <MarketSnapshot />
      <ProductPreview />
      <Footer />
    </main>
  );
}
