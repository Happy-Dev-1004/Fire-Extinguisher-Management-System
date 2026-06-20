import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

// A compact radial gauge (like the POSM-compliance / campaign donuts in the
// reference dashboards): a single percentage rendered as a ring with the value
// in the centre. Pure presentational — pass the percent and a colour.
export function GaugeDonut({
  pct,
  cor = "#dc2626",
  legenda,
  tamanho = 132,
}: {
  pct: number;
  cor?: string;
  legenda?: string;
  tamanho?: number;
}) {
  const valor = Math.max(0, Math.min(100, Math.round(pct)));
  const dados = [
    { name: "feito", value: valor },
    { name: "resto", value: 100 - valor },
  ];

  // The legend sits BELOW the ring (not inside the narrow donut hole) so longer
  // words like "inspecionado" never get clipped. The donut track adapts to the
  // theme. Centred column keeps the % visually inside the ring.
  return (
    <div className="flex flex-col items-center shrink-0">
      <div className="relative" style={{ width: tamanho, height: tamanho }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={dados}
              dataKey="value"
              innerRadius="72%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke="none"
              isAnimationActive={false}
            >
              <Cell fill={cor} />
              <Cell className="fill-gray-100 dark:fill-gray-700" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-gray-900 dark:text-gray-50 leading-none">{valor}%</span>
        </div>
      </div>
      {legenda && (
        <span className="mt-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400 text-center whitespace-nowrap">
          {legenda}
        </span>
      )}
    </div>
  );
}
