import { motion } from "framer-motion";

/**
 * Pulsing green dot + "LIVE TRACKING" label shown in the drawer header
 * while the detail drawer is open. Dot is static green between poll ticks
 * and pulses brighter during the in-flight request so the admin can see
 * that new data is actively being pulled (not just stale).
 */
export default function LiveIndicator({ fetching }: { fetching: boolean }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-50 border border-green-100 shrink-0">
      <span className="relative flex h-2 w-2">
        {fetching && (
          <motion.span
            className="absolute inline-flex h-full w-full rounded-full bg-green-500"
            initial={{ opacity: 0.7, scale: 1 }}
            animate={{ opacity: 0, scale: 2.6 }}
            transition={{ duration: 0.9, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wider text-green-700">
        Live Tracking
      </span>
    </div>
  );
}
