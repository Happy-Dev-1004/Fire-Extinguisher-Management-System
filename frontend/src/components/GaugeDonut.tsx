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

  return (
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
            <Cell fill="#f1f5f9" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-bold text-gray-900 leading-none">{valor}%</span>
        {legenda && <span className="text-[10px] text-gray-400 mt-1">{legenda}</span>}
      </div>
    </div>
  );
}
