import { motion } from "framer-motion";
import { PropertiesTab } from "../../components/settings/PropertiesTab";

export const LocationsRoute: React.FC = () => (
  <motion.div
    key="locations"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25 }}
  >
    <PropertiesTab />
  </motion.div>
);
