import { motion } from "framer-motion";

/**
 * Odometer animation component for numbers
 */
export const Odometer = ({ value }: { value: string | number }) => {
  const str = String(value);
  const digitHeight = 48;
  const digitWidth = 22;

  return (
    <div className="flex items-center overflow-visible">
      {str.split("").map((char, i) => {
        if (isNaN(Number(char))) {
          return (
            <div
              key={i}
              className="mx-0 text-2xl font-semibold leading-none flex items-center"
            >
              {char}
            </div>
          );
        }

        return (
          <div
            key={i}
            className="relative overflow-hidden"
            style={{ height: digitHeight, width: digitWidth }}
          >
            <motion.div
              animate={{ y: -Number(char) * digitHeight }}
              transition={{ type: "spring", stiffness: 120, damping: 18 }}
              className="absolute top-0 left-0"
            >
              {Array.from({ length: 10 }).map((_, n) => (
                <div
                  key={n}
                  style={{ height: digitHeight }}
                  className="flex items-center justify-center text-3xl font-semibold leading-none"
                >
                  {n}
                </div>
              ))}
            </motion.div>
          </div>
        );
      })}
    </div>
  );
};
