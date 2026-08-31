import TransitLoader from "@/components/ui/TransitLoader";

/** Route-transition / Suspense fallback for the App Router. */
export default function Loading() {
  return <TransitLoader />;
}
