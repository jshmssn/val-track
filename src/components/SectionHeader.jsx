// src/components/SectionHeader.jsx
import { styles } from "../styles/tokens";

export function SectionHeader({ title, sub }) {
  return (
    <div style={styles.sectionHeader}>
      <div style={styles.sectionTitle}>{title}</div>
      <div style={styles.sectionSub}>{sub}</div>
    </div>
  );
}
