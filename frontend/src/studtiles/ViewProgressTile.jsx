import { BarChart3, ClipboardList } from "lucide-react";
import { CardTitle, ProgressChart } from "../components/PageElements";

function ViewProgressTile({ values }) {
  return (
    <div className="card chart-card profile-progress-card">
      <CardTitle
        title="Progress"
        action={
          <div className="chart-actions">
            <button aria-label="Bar chart"><BarChart3 size={19} /></button>
            <button aria-label="Line chart"><ClipboardList size={18} /></button>
          </div>
        }
      />
      <ProgressChart values={values} />
    </div>
  );
}

export default ViewProgressTile;
