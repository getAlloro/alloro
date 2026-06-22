import { motion } from "framer-motion";
import { Calendar, DollarSign, Stethoscope, User } from "lucide-react";

import type { MonthBucket, MonthSummary } from "../types";
import { Odometer } from "./Odometer";
import { formatDataMonthShort } from "../../../utils/timeframe";

interface SummaryCardsProps {
  activeMonth: MonthBucket | undefined;
  targetMonth?: string | null;
  openMonthPicker: () => void;
  totals: MonthSummary;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({
  activeMonth,
  targetMonth,
  openMonthPicker,
  totals,
}) => {
  return (
    <>
      {activeMonth && (
        <div className="grid grid-cols-5 gap-4">
          {/* Month card - clickable */}
          <motion.div
            layout
            className={`rounded-2xl border bg-white p-4 flex flex-col justify-center transition ${
              targetMonth
                ? "cursor-default"
                : "cursor-pointer hover:border-gray-300"
            }`}
            onClick={targetMonth ? undefined : openMonthPicker}
          >
            <div className="flex items-center justify-center gap-2 text-xs font-bold text-gray-400 uppercase mb-2">
              <Calendar size={14} />
              Month
            </div>
            <div className="text-center text-lg font-semibold text-gray-900">
              {formatDataMonthShort(activeMonth.month)}
            </div>
          </motion.div>

          {[
            {
              label: "Self Referrals",
              value: totals.selfReferrals,
              icon: User,
              tint: "#C9765E22",
            },
            {
              label: "Doctor Referrals",
              value: totals.doctorReferrals,
              icon: Stethoscope,
              tint: "#C9765E11",
            },
            {
              label: "Total Referrals",
              value: totals.totalReferrals,
              icon: User,
              tint: "#C9765E18",
            },
            {
              label: "Production",
              value: totals.productionTotal.toLocaleString(),
              icon: DollarSign,
              tint: "#34D39922",
            },
          ].map((card, i) => (
            <motion.div
              key={i}
              layout
              className="rounded-2xl p-4 border flex flex-col justify-center"
              style={{
                background: `linear-gradient(135deg, ${card.tint}, #ffffff)`,
              }}
            >
              <div className="text-[10px] text-gray-400 uppercase text-center mb-1">
                {card.label}
              </div>
              <div className="flex items-center justify-center gap-2 scale-75">
                <card.icon size={20} className="text-gray-400" />
                <Odometer value={card.value} />
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </>
  );
};
