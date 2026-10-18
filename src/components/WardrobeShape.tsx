import { t } from '../i18n';
// A cutaway top view: the frame, clothes rail and two front doors identify the wardrobe.
export default function WardrobeShape({
  width, depth, mini = false,
}: { width: number; depth: number; mini?: boolean }) {
  return (
    <g data-shape="wardrobe" role="img" aria-label={t("Two-door wardrobe")}>
      <title>{t("Two-door wardrobe: hangers, shelf and handles")}</title>
      <g transform={`scale(${width / 100} ${depth / 100})`}>
        <rect width="100" height="100" rx="3" fill="#c79e75" stroke="#886342" strokeWidth="1.5" />
        <rect x="5" y="6" width="90" height="73" rx="1" fill="#f7efe3" stroke="#aa835d" />
        <path d="M8 8v69M92 8v69" stroke="#dfc3a0" strokeWidth="3" />
        <path d="M13 19h74" stroke="#81776b" strokeWidth="2.5" strokeLinecap="round" />
        {[24, 50, 76].map((x, index) => (
          <g key={x} data-wardrobe-part="clothes">
            <path d={`M${x} 27v-5q0 -4 3 -4t0 6l-3 3-10 9h20z`}
              fill="none" stroke="#8b7e6b" strokeWidth="1.2" strokeLinejoin="round" />
            <path d={`M${x - 6} 34l-7 5 3 9 4 -2v16h12V46l4 2 3 -9-7 -5-3 4h-6z`}
              fill={['#a5b9ce', '#b4bba5', '#dcc4a9'][index]} stroke="#8d958d" strokeWidth=".9" />
            {!mini && <path d={`M${x} 39v20`} stroke="#ffffff" opacity=".5" strokeWidth="1" />}
          </g>
        ))}
        <path d="M7 68h86" stroke="#aa835d" strokeWidth="2" />
        <rect x="13" y="70" width="27" height="5" rx="1" fill="#b8c8d7" stroke="#91a6b9" strokeWidth=".7" />
        <rect x="16" y="75" width="27" height="4" rx="1" fill="#d9c2ac" stroke="#b49a82" strokeWidth=".7" />
        <path d="M62 73q5 -5 10 0v5H58v-3zM79 73q5 -5 10 0v5H75v-3z" fill="#a8947c" />
        <rect x="4" y="82" width="45" height="14" rx="1" fill="#e8cfad" stroke="#9e7752" />
        <rect x="51" y="82" width="45" height="14" rx="1" fill="#efd9ba" stroke="#9e7752" />
        <path d="M45 86v6M55 86v6" stroke="#6e543d" strokeWidth="2" strokeLinecap="round" />
        <path d="M5 98h90" stroke="#866445" strokeWidth="2" />
      </g>
      {!mini && <text x={width * .25} y={depth * .93} textAnchor="middle"
        fontSize={Math.min(5, width / 12) * 1.06} fontWeight="600" letterSpacing=".6" fill="#785b40"
        pointerEvents="none">{t("WARDROBE")}</text>}
    </g>
  );
}
