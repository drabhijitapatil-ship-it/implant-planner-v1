/**
 * iter-364 — Advanced Analytics Hub (Phase Analytics-2 + Analytics-3)
 *
 * Section tabs:
 *   1. Kaplan-Meier survival curves (per procedure type / per system)
 *   2. Torque × ISQ scatter (with survival colouring + sweet-spot card)
 *   3. Bone × Procedure × Outcome heatmap
 *   4. Cross-tab builder (pick any two dimensions + metric)
 *   5. Learning curve (student own, or faculty picking a student)
 *   6. Case-Mix Index (faculty only)
 *   7. Complication pareto
 *   8. Benchmarks vs literature
 *   9. Research export (de-identified JSON)
 *
 * Role gate identical to procedure-overview: student / supervisor /
 * implant_incharge / administrator only. Nurse blocked.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import Svg, {
  Path,
  Circle,
  Line,
  Text as SvgText,
  Rect,
} from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import api from "../../utils/api";
import { downloadAuthenticated } from "../../utils/csvDownload";
import CalendarPicker from "../../components/CalendarPicker";
import { useAuth } from "../../contexts/AuthContext";

type Section =
  | "km"
  | "scatter"
  | "heatmap"
  | "crosstab"
  | "learning"
  | "cmi"
  | "complications"
  | "failures"
  | "followup"
  | "adherence"
  | "benchmarks"
  | "export";

const SECTIONS: {
  key: Section;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  facultyOnly?: boolean;
}[] = [
  { key: "km", label: "Kaplan-Meier", icon: "pulse-outline" },
  { key: "scatter", label: "Torque × ISQ", icon: "analytics-outline" },
  { key: "heatmap", label: "Bone Heatmap", icon: "grid-outline" },
  { key: "crosstab", label: "Cross-tab", icon: "apps-outline" },
  { key: "learning", label: "Learning Curve", icon: "trending-up-outline" },
  {
    key: "cmi",
    label: "Case-Mix Index",
    icon: "medal-outline",
    facultyOnly: true,
  },
  { key: "complications", label: "Complications", icon: "warning-outline" },
  { key: "failures", label: "Failure Analysis", icon: "sad-outline" },
  { key: "followup", label: "Follow-up", icon: "repeat-outline" },
  { key: "adherence", label: "Plan Adherence", icon: "git-compare-outline" },
  { key: "benchmarks", label: "Benchmarks", icon: "ribbon-outline" },
  { key: "export", label: "Research Export", icon: "download-outline" },
];

const PALETTE = [
  "#1E88E5",
  "#43A047",
  "#FB8C00",
  "#8E24AA",
  "#00838F",
  "#6D4C41",
  "#C62828",
  "#5E35B1",
];

export default function AdvancedAnalyticsHub() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const canAccess =
    user?.role === "student" ||
    user?.role === "supervisor" ||
    user?.role === "implant_incharge" ||
    user?.role === "administrator";
  const isFaculty =
    user?.role === "supervisor" ||
    user?.role === "implant_incharge" ||
    user?.role === "administrator";

  const [section, setSection] = useState<Section>("km");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  if (authLoading) {
    return (
      <SafeAreaView style={s.center}>
        <ActivityIndicator size="large" color="#1E88E5" />
      </SafeAreaView>
    );
  }
  if (!canAccess) {
    return (
      <SafeAreaView style={s.center}>
        <Ionicons name="lock-closed" size={44} color="#B0BEC5" />
        <Text style={{ marginTop: 12, color: "#546E7A" }}>
          Advanced Analytics not available for your role.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.headerIcon}
          testID="adv-analytics-back"
        >
          <Ionicons name="chevron-back" size={22} color="#1A2332" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} data-testid="adv-analytics-title">
            Advanced Analytics
          </Text>
          <Text style={s.headerSub}>Phase Analytics-2 · Phase Analytics-3</Text>
        </View>
      </View>

      {/* Section tabs (uniform capsules) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.tabsScroll}
        contentContainerStyle={{
          paddingHorizontal: 10,
          gap: 6,
          alignItems: "center",
        }}
      >
        {SECTIONS.filter((sec) => !sec.facultyOnly || isFaculty).map((sec) => {
          const active = section === sec.key;
          return (
            <TouchableOpacity
              key={sec.key}
              onPress={() => setSection(sec.key)}
              style={[s.tab, active && s.tabActive]}
              testID={`adv-tab-${sec.key}`}
              /* @ts-ignore */ data-testid={`adv-tab-${sec.key}`}
            >
              <Ionicons
                name={sec.icon}
                size={13}
                color={active ? "#FFF" : "#546E7A"}
              />
              <Text
                style={[s.tabTxt, active && s.tabTxtActive]}
                numberOfLines={1}
              >
                {sec.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Date range picker (shared, calendar-based) */}
      <View style={s.dateRow}>
        <View style={{ flex: 1, marginRight: 6 }}>
          <Text style={s.dateLabel}>From</Text>
          <CalendarPicker
            value={fromDate}
            onChange={setFromDate}
            placeholder="Select date"
            allowPast
            compact
            testID="adv-from-date"
          />
        </View>
        <View style={{ flex: 1, marginLeft: 6 }}>
          <Text style={s.dateLabel}>To</Text>
          <CalendarPicker
            value={toDate}
            onChange={setToDate}
            placeholder="Select date"
            allowPast
            compact
            testID="adv-to-date"
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {section === "km" && (
          <KaplanMeierPane fromDate={fromDate} toDate={toDate} />
        )}
        {section === "scatter" && (
          <ScatterPane fromDate={fromDate} toDate={toDate} />
        )}
        {section === "heatmap" && (
          <HeatmapPane fromDate={fromDate} toDate={toDate} />
        )}
        {section === "crosstab" && (
          <CrossTabPane fromDate={fromDate} toDate={toDate} />
        )}
        {section === "learning" && <LearningCurvePane isFaculty={isFaculty} />}
        {section === "cmi" && isFaculty && (
          <CaseMixPane fromDate={fromDate} toDate={toDate} />
        )}
        {section === "complications" && (
          <ComplicationsPane fromDate={fromDate} toDate={toDate} />
        )}
        {section === "failures" && (
          <FailurePane fromDate={fromDate} toDate={toDate} />
        )}
        {section === "followup" && (
          <FollowUpPane fromDate={fromDate} toDate={toDate} />
        )}
        {section === "adherence" && (
          <AdherencePane fromDate={fromDate} toDate={toDate} />
        )}
        {section === "benchmarks" && (
          <BenchmarksPane fromDate={fromDate} toDate={toDate} />
        )}
        {section === "export" && (
          <ResearchExportPane fromDate={fromDate} toDate={toDate} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────── Kaplan-Meier (v2 with CI bands + log-rank) ───────────────────────
function KaplanMeierPane({
  fromDate,
  toDate,
}: {
  fromDate: string;
  toDate: string;
}) {
  const [groupBy, setGroupBy] = useState<"procedure_type" | "system">(
    "procedure_type",
  );
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { group_by: groupBy };
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      const r = await api.get("/analytics/kaplan-meier-v2", { params });
      setData(r.data);
    } finally {
      setLoading(false);
    }
  }, [groupBy, fromDate, toDate]);
  useEffect(() => {
    load();
  }, [load]);

  const width = 340,
    height = 240,
    padL = 40,
    padB = 30,
    padT = 10,
    padR = 10;
  const maxT = useMemo(
    () =>
      Math.max(
        30,
        ...(data?.curves || []).flatMap((c: any) =>
          c.points.map((p: any) => p.t),
        ),
      ),
    [data],
  );
  const xScale = (t: number) =>
    padL + (t / (maxT || 1)) * (width - padL - padR);
  const yScale = (s: number) => padT + (1 - s) * (height - padT - padB);

  const stepPath = (points: any[], key: "s" | "s_lo" | "s_hi") => {
    let d = `M ${xScale(0)} ${yScale(1)}`;
    let prevY = yScale(1);
    points.forEach((p: any) => {
      const v = p[key] ?? p.s;
      const x = xScale(p.t);
      const y = yScale(v);
      d += ` L ${x} ${prevY} L ${x} ${y}`;
      prevY = y;
    });
    return d;
  };

  return (
    <View style={s.pane}>
      <SectionCard
        title="Kaplan-Meier survival curves"
        hint="Solid line = KM estimate. Dashed lines = Greenwood 95% CI band. Steeper drop = more early failures."
      >
        <View style={s.pillRow}>
          {(["procedure_type", "system"] as const).map((g) => (
            <TouchableOpacity
              key={g}
              onPress={() => setGroupBy(g)}
              style={[s.pill, groupBy === g && s.pillActive]}
              testID={`km-group-${g}`}
            >
              <Text style={[s.pillTxt, groupBy === g && s.pillTxtActive]}>
                {g === "procedure_type"
                  ? "By Procedure Type"
                  : "By Implant System"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {loading ? (
          <ActivityIndicator style={{ marginVertical: 20 }} />
        ) : !data?.curves?.length ? (
          <EmptyMsg />
        ) : (
          <>
            <Svg width={width} height={height} testID="km-chart">
              <Line
                x1={padL}
                y1={padT}
                x2={padL}
                y2={height - padB}
                stroke="#CFD8DC"
                strokeWidth="1"
              />
              <Line
                x1={padL}
                y1={height - padB}
                x2={width - padR}
                y2={height - padB}
                stroke="#CFD8DC"
                strokeWidth="1"
              />
              {[0, 0.25, 0.5, 0.75, 1].map((v) => (
                <React.Fragment key={v}>
                  <Line
                    x1={padL - 3}
                    y1={yScale(v)}
                    x2={padL}
                    y2={yScale(v)}
                    stroke="#78909C"
                    strokeWidth="1"
                  />
                  <SvgText
                    x={padL - 5}
                    y={yScale(v) + 3}
                    fontSize="8"
                    fill="#78909C"
                    textAnchor="end"
                  >
                    {Math.round(v * 100)}%
                  </SvgText>
                </React.Fragment>
              ))}
              {data.curves.slice(0, 6).map((c: any, idx: number) => {
                const color = PALETTE[idx % PALETTE.length];
                return (
                  <React.Fragment key={c.key}>
                    {/* CI bands (dashed) */}
                    <Path
                      d={stepPath(c.points, "s_lo")}
                      stroke={color}
                      strokeWidth="1"
                      strokeDasharray="3,2"
                      fill="none"
                      opacity="0.5"
                    />
                    <Path
                      d={stepPath(c.points, "s_hi")}
                      stroke={color}
                      strokeWidth="1"
                      strokeDasharray="3,2"
                      fill="none"
                      opacity="0.5"
                    />
                    {/* Main KM */}
                    <Path
                      d={stepPath(c.points, "s")}
                      stroke={color}
                      strokeWidth="1.8"
                      fill="none"
                    />
                  </React.Fragment>
                );
              })}
              <SvgText
                x={width / 2}
                y={height - 5}
                fontSize="9"
                fill="#546E7A"
                textAnchor="middle"
              >
                Days from placement (max {maxT}d)
              </SvgText>
            </Svg>
            <View style={s.legendWrap}>
              {data.curves.slice(0, 6).map((c: any, idx: number) => (
                <View key={c.key} style={s.legendItem}>
                  <View
                    style={[
                      s.legendDot,
                      { backgroundColor: PALETTE[idx % PALETTE.length] },
                    ]}
                  />
                  <Text style={s.legendTxt} numberOfLines={1}>
                    {c.key} · n={c.n_implants} ·{" "}
                    {(c.final_survival * 100).toFixed(1)}%
                  </Text>
                </View>
              ))}
            </View>
            {data.log_rank_top2 && (
              <View style={s.logRankBox} testID="km-log-rank">
                <Text style={s.logRankHead}>Log-rank test (top 2 groups)</Text>
                <Text style={s.logRankLine}>
                  {data.log_rank_top2.group_a} vs {data.log_rank_top2.group_b}
                </Text>
                <Text
                  style={[
                    s.logRankLine,
                    {
                      fontWeight: "800",
                      color:
                        data.log_rank_top2.p_value < 0.05
                          ? "#C62828"
                          : "#546E7A",
                    },
                  ]}
                >
                  p = {data.log_rank_top2.p_value} ·{" "}
                  {data.log_rank_top2.interpretation}
                </Text>
              </View>
            )}
          </>
        )}
      </SectionCard>
    </View>
  );
}

// ─────────────────────── Torque × ISQ Scatter ───────────────────────
function ScatterPane({
  fromDate,
  toDate,
}: {
  fromDate: string;
  toDate: string;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params: any = {};
        if (fromDate) params.from_date = fromDate;
        if (toDate) params.to_date = toDate;
        const r = await api.get("/analytics/torque-isq-scatter", { params });
        setData(r.data);
      } finally {
        setLoading(false);
      }
    })();
  }, [fromDate, toDate]);

  const width = 340,
    height = 260,
    padL = 40,
    padB = 30,
    padT = 10,
    padR = 10;
  const xMin = 0,
    xMax = 80; // Torque
  const yMin = 40,
    yMax = 90; // ISQ
  const xScale = (v: number) =>
    padL + ((v - xMin) / (xMax - xMin)) * (width - padL - padR);
  const yScale = (v: number) =>
    padT + (1 - (v - yMin) / (yMax - yMin)) * (height - padT - padB);

  return (
    <View style={s.pane}>
      <SectionCard
        title="Torque × ISQ scatter"
        hint="Green = still active. Red = failed / replaced. The green cluster in the top-right is your primary-stability sweet spot."
      >
        {loading ? (
          <ActivityIndicator style={{ marginVertical: 20 }} />
        ) : !data?.points?.length ? (
          <EmptyMsg />
        ) : (
          <>
            <Svg width={width} height={height} testID="scatter-chart">
              {/* axes */}
              <Line
                x1={padL}
                y1={padT}
                x2={padL}
                y2={height - padB}
                stroke="#CFD8DC"
                strokeWidth="1"
              />
              <Line
                x1={padL}
                y1={height - padB}
                x2={width - padR}
                y2={height - padB}
                stroke="#CFD8DC"
                strokeWidth="1"
              />
              {[0, 20, 40, 60, 80].map((v) => (
                <SvgText
                  key={v}
                  x={xScale(v)}
                  y={height - padB + 12}
                  fontSize="8"
                  fill="#78909C"
                  textAnchor="middle"
                >
                  {v}
                </SvgText>
              ))}
              {[50, 60, 70, 80].map((v) => (
                <SvgText
                  key={v}
                  x={padL - 5}
                  y={yScale(v) + 3}
                  fontSize="8"
                  fill="#78909C"
                  textAnchor="end"
                >
                  {v}
                </SvgText>
              ))}
              {/* Sweet-spot band ~35-45 Ncm × 70-80 ISQ */}
              <Rect
                x={xScale(35)}
                y={yScale(80)}
                width={xScale(45) - xScale(35)}
                height={yScale(70) - yScale(80)}
                fill="#E8F5E9"
                stroke="#A5D6A7"
                strokeDasharray="3,3"
              />
              {/* points */}
              {data.points.slice(0, 400).map((p: any, idx: number) => {
                const color =
                  p.status === "Failed" || p.status === "Replaced"
                    ? "#C62828"
                    : "#43A047";
                return (
                  <Circle
                    key={idx}
                    cx={xScale(p.torque)}
                    cy={yScale(p.isq)}
                    r="3.5"
                    fill={color}
                    opacity="0.75"
                  />
                );
              })}
              <SvgText
                x={width / 2}
                y={height - 5}
                fontSize="9"
                fill="#546E7A"
                textAnchor="middle"
              >
                Insertion Torque (Ncm)
              </SvgText>
              <SvgText
                x={12}
                y={height / 2}
                fontSize="9"
                fill="#546E7A"
                textAnchor="middle"
                transform={`rotate(-90 12 ${height / 2})`}
              >
                ISQ
              </SvgText>
            </Svg>
            <View style={s.sweetCard} data-testid="scatter-sweet-spot">
              <Text style={s.sweetHead}>
                Survivor sweet-spot (n={data.sweet_spot.n_survivors})
              </Text>
              <Text style={s.sweetLine}>
                Torque: median{" "}
                <Text style={{ fontWeight: "800" }}>
                  {data.sweet_spot.median_torque ?? "—"} Ncm
                </Text>{" "}
                · mean {data.sweet_spot.mean_torque ?? "—"}
              </Text>
              <Text style={s.sweetLine}>
                ISQ: median{" "}
                <Text style={{ fontWeight: "800" }}>
                  {data.sweet_spot.median_isq ?? "—"}
                </Text>{" "}
                · mean {data.sweet_spot.mean_isq ?? "—"}
              </Text>
            </View>
            <Text style={s.paneNote}>
              Showing up to 400 points ({data.n_points} total)
            </Text>
          </>
        )}
      </SectionCard>
    </View>
  );
}

// ─────────────────────── Bone × Procedure Heatmap ───────────────────────
function HeatmapPane({
  fromDate,
  toDate,
}: {
  fromDate: string;
  toDate: string;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params: any = {};
        if (fromDate) params.from_date = fromDate;
        if (toDate) params.to_date = toDate;
        const r = await api.get("/analytics/bone-procedure-heatmap", {
          params,
        });
        setData(r.data);
      } finally {
        setLoading(false);
      }
    })();
  }, [fromDate, toDate]);

  const cellColor = (surv: number | null) => {
    if (surv === null) return "#ECEFF1";
    if (surv >= 95) return "#2E7D32";
    if (surv >= 85) return "#7CB342";
    if (surv >= 70) return "#FDD835";
    if (surv >= 50) return "#FB8C00";
    return "#C62828";
  };

  return (
    <View style={s.pane}>
      <SectionCard
        title="Bone × Procedure × Outcome"
        hint="Rows = Misch/L-Z bone density (D1-D4). Columns = procedure types. Colour = survival %."
      >
        {loading ? (
          <ActivityIndicator style={{ marginVertical: 20 }} />
        ) : !data?.matrix?.length ? (
          <EmptyMsg />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            testID="heatmap-scroll"
          >
            <View>
              {/* header row */}
              <View style={{ flexDirection: "row", marginLeft: 45 }}>
                {data.procedure_types.map((pt: string) => (
                  <View key={pt} style={{ width: 68, alignItems: "center" }}>
                    <Text style={s.heatColHead} numberOfLines={2}>
                      {pt}
                    </Text>
                  </View>
                ))}
              </View>
              {data.matrix.map((row: any) => (
                <View
                  key={row.bone}
                  style={{ flexDirection: "row", alignItems: "center" }}
                >
                  <View style={{ width: 45 }}>
                    <Text style={s.heatRowHead}>{row.bone}</Text>
                  </View>
                  {row.cells.map((c: any, ci: number) => (
                    <View
                      key={ci}
                      style={[
                        s.heatCell,
                        { backgroundColor: cellColor(c.survival) },
                      ]}
                    >
                      <Text style={s.heatCellVal}>
                        {c.survival !== null ? `${c.survival}%` : "—"}
                      </Text>
                      <Text style={s.heatCellN}>n={c.n}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </SectionCard>
    </View>
  );
}

// ─────────────────────── Cross-Tab Builder ───────────────────────
const DIMS = [
  "procedure_type",
  "system",
  "bone_type",
  "region",
  "diameter",
  "length",
] as const;
const METRICS = [
  "count",
  "success_rate",
  "mean_torque",
  "mean_isq",
  "mean_days",
] as const;
const METRIC_LABEL: Record<string, string> = {
  count: "Count",
  success_rate: "Success %",
  mean_torque: "Mean Torque",
  mean_isq: "Mean ISQ",
  mean_days: "Mean Days",
};
const DIM_LABEL: Record<string, string> = {
  procedure_type: "Procedure Type",
  system: "System",
  bone_type: "Bone Type",
  region: "Region",
  diameter: "Ø",
  length: "Length",
};

function CrossTabPane({
  fromDate,
  toDate,
}: {
  fromDate: string;
  toDate: string;
}) {
  const [rowDim, setRowDim] = useState<(typeof DIMS)[number]>("procedure_type");
  const [colDim, setColDim] = useState<(typeof DIMS)[number] | null>(null);
  const [metric, setMetric] = useState<(typeof METRICS)[number]>("count");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const body: any = { row_dim: rowDim, metric };
      if (colDim) body.col_dim = colDim;
      if (fromDate) body.from_date = fromDate;
      if (toDate) body.to_date = toDate;
      const r = await api.post("/analytics/cross-tab", body);
      setData(r.data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    run(); /* eslint-disable-next-line */
  }, []);

  return (
    <View style={s.pane}>
      <SectionCard
        title="Cross-tab builder"
        hint="Pivot any dimension against any other. Great for research questions."
      >
        <Text style={s.miniLbl}>Row</Text>
        <View style={s.chipsRow}>
          {DIMS.map((d) => (
            <TouchableOpacity
              key={d}
              onPress={() => setRowDim(d)}
              style={[s.chipTiny, rowDim === d && s.chipTinyActive]}
              testID={`ct-row-${d}`}
            >
              <Text
                style={[s.chipTinyTxt, rowDim === d && s.chipTinyTxtActive]}
              >
                {DIM_LABEL[d]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.miniLbl}>Column (optional)</Text>
        <View style={s.chipsRow}>
          <TouchableOpacity
            onPress={() => setColDim(null)}
            style={[s.chipTiny, colDim === null && s.chipTinyActive]}
            testID="ct-col-none"
          >
            <Text
              style={[s.chipTinyTxt, colDim === null && s.chipTinyTxtActive]}
            >
              None
            </Text>
          </TouchableOpacity>
          {DIMS.filter((d) => d !== rowDim).map((d) => (
            <TouchableOpacity
              key={d}
              onPress={() => setColDim(d)}
              style={[s.chipTiny, colDim === d && s.chipTinyActive]}
              testID={`ct-col-${d}`}
            >
              <Text
                style={[s.chipTinyTxt, colDim === d && s.chipTinyTxtActive]}
              >
                {DIM_LABEL[d]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.miniLbl}>Metric</Text>
        <View style={s.chipsRow}>
          {METRICS.map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => setMetric(m)}
              style={[s.chipTiny, metric === m && s.chipTinyActive]}
              testID={`ct-metric-${m}`}
            >
              <Text
                style={[s.chipTinyTxt, metric === m && s.chipTinyTxtActive]}
              >
                {METRIC_LABEL[m]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity onPress={run} style={s.applyBtn} testID="ct-run">
          <Text style={s.applyBtnTxt}>Run</Text>
        </TouchableOpacity>
        {loading ? (
          <ActivityIndicator style={{ marginVertical: 20 }} />
        ) : !data?.grid?.length ? (
          <EmptyMsg />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            style={{ marginTop: 10 }}
          >
            <View>
              <View style={{ flexDirection: "row" }}>
                <View style={[s.ctCell, s.ctHead, { width: 120 }]}>
                  <Text style={s.ctHeadTxt}>{DIM_LABEL[rowDim]}</Text>
                </View>
                {(data.cols as string[]).map((c) => (
                  <View key={c} style={[s.ctCell, s.ctHead]}>
                    <Text style={s.ctHeadTxt} numberOfLines={2}>
                      {c === "_total" ? "Total" : c}
                    </Text>
                  </View>
                ))}
              </View>
              {data.grid.map((row: any) => (
                <View key={row.row} style={{ flexDirection: "row" }}>
                  <View
                    style={[
                      s.ctCell,
                      { width: 120, backgroundColor: "#F5F7FB" },
                    ]}
                  >
                    <Text style={s.ctRowLbl} numberOfLines={2}>
                      {row.row}
                    </Text>
                  </View>
                  {row.cells.map((c: any, ci: number) => (
                    <View key={ci} style={s.ctCell}>
                      <Text style={s.ctCellVal}>
                        {c.value === null || c.value === undefined
                          ? "—"
                          : c.value}
                      </Text>
                      <Text style={s.ctCellN}>n={c.n}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </SectionCard>
    </View>
  );
}

// ─────────────────────── Learning Curve ───────────────────────
function LearningCurvePane({ isFaculty }: { isFaculty: boolean }) {
  const [studentId, setStudentId] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (studentId && isFaculty) params.student_id = studentId;
      const r = await api.get("/analytics/learning-curve", { params });
      setData(r.data);
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.detail || "Failed to load");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!isFaculty) load(); /* eslint-disable-next-line */
  }, []);

  const width = 340,
    height = 200,
    padL = 35,
    padB = 25,
    padT = 10,
    padR = 10;
  const series = data?.series || [];
  const xMax = Math.max(1, series.length);
  const xScale = (i: number) => padL + (i / xMax) * (width - padL - padR);
  const yScale = (v: number) => padT + (1 - v / 100) * (height - padT - padB);

  return (
    <View style={s.pane}>
      <SectionCard
        title="Learning curve"
        hint="Running success rate as cases accumulate. A trend upward = the student is improving."
      >
        {isFaculty && (
          <View style={{ marginBottom: 8 }}>
            <TextInput
              placeholder="Student ID (leave blank for self)"
              placeholderTextColor="#B0BEC5"
              value={studentId}
              onChangeText={setStudentId}
              style={{
                borderWidth: 1,
                borderColor: "#CFD8DC",
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 8,
                fontSize: 12,
                backgroundColor: "#FFF",
              }}
              testID="lc-student-id"
            />
            <TouchableOpacity
              onPress={load}
              style={[s.applyBtn, { marginTop: 6 }]}
              testID="lc-load"
            >
              <Text style={s.applyBtnTxt}>Load</Text>
            </TouchableOpacity>
          </View>
        )}
        {loading ? (
          <ActivityIndicator style={{ marginVertical: 20 }} />
        ) : !series.length ? (
          <EmptyMsg />
        ) : (
          <>
            <Text style={s.paneNote}>
              {data.student_name || "Student"} · {data.n_cases} cases
            </Text>
            <Svg width={width} height={height} testID="lc-chart">
              <Line
                x1={padL}
                y1={padT}
                x2={padL}
                y2={height - padB}
                stroke="#CFD8DC"
              />
              <Line
                x1={padL}
                y1={height - padB}
                x2={width - padR}
                y2={height - padB}
                stroke="#CFD8DC"
              />
              {[0, 50, 100].map((v) => (
                <SvgText
                  key={v}
                  x={padL - 5}
                  y={yScale(v) + 3}
                  fontSize="8"
                  fill="#78909C"
                  textAnchor="end"
                >
                  {v}%
                </SvgText>
              ))}
              {(() => {
                let d = "";
                series.forEach((row: any, i: number) => {
                  if (
                    row.running_success_rate === null ||
                    row.running_success_rate === undefined
                  )
                    return;
                  const x = xScale(i + 1);
                  const y = yScale(row.running_success_rate);
                  d += d ? ` L ${x} ${y}` : `M ${x} ${y}`;
                });
                return d ? (
                  <Path d={d} stroke="#1E88E5" strokeWidth="2" fill="none" />
                ) : null;
              })()}
              {series.map((row: any, i: number) => {
                const color =
                  row.status_bucket === "completed"
                    ? "#43A047"
                    : row.status_bucket === "terminated"
                      ? "#C62828"
                      : "#90A4AE";
                return (
                  <Circle
                    key={i}
                    cx={xScale(i + 1)}
                    cy={yScale(row.running_success_rate ?? 0)}
                    r="3"
                    fill={color}
                  />
                );
              })}
              <SvgText
                x={width / 2}
                y={height - 5}
                fontSize="9"
                fill="#546E7A"
                textAnchor="middle"
              >
                Case number
              </SvgText>
            </Svg>
          </>
        )}
      </SectionCard>
    </View>
  );
}

// ─────────────────────── Case-Mix Index (Faculty) ───────────────────────
function CaseMixPane({
  fromDate,
  toDate,
}: {
  fromDate: string;
  toDate: string;
}) {
  const [scope, setScope] = useState<"students" | "supervisors">("students");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params: any = { scope };
        if (fromDate) params.from_date = fromDate;
        if (toDate) params.to_date = toDate;
        const r = await api.get("/analytics/case-mix-index", { params });
        setData(r.data);
      } catch (e: any) {
        Alert.alert("Error", e?.response?.data?.detail || "Failed");
      } finally {
        setLoading(false);
      }
    })();
  }, [scope, fromDate, toDate]);

  return (
    <View style={s.pane}>
      <SectionCard
        title="Case-Mix Index (CMI)"
        hint="Complexity-weighted volume. Higher CMI = handling more complex procedures. Weights: Zygomatic 5.0 · All-on-X 4.0 · All-on-4/6 3.5-3.8 · Sinus/GBR 2.5 · Immediate 2.0 · Multiple 1.5 · Single 1.0."
      >
        <View style={s.pillRow}>
          {(["students", "supervisors"] as const).map((g) => (
            <TouchableOpacity
              key={g}
              onPress={() => setScope(g)}
              style={[s.pill, scope === g && s.pillActive]}
              testID={`cmi-${g}`}
            >
              <Text style={[s.pillTxt, scope === g && s.pillTxtActive]}>
                By {g}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {loading ? (
          <ActivityIndicator style={{ marginVertical: 20 }} />
        ) : !data?.rows?.length ? (
          <EmptyMsg />
        ) : (
          <View style={{ marginTop: 10 }}>
            {data.rows.slice(0, 30).map((r: any) => (
              <View
                key={r.user_id}
                style={s.cmiRow}
                testID={`cmi-row-${r.user_id}`}
              >
                <Text style={s.cmiName} numberOfLines={1}>
                  {r.user_name || r.user_id}
                </Text>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={s.cmiIdx}>{r.case_mix_index}</Text>
                  <Text style={s.cmiSub}>
                    {r.n_cases} cases · Σ{r.complexity_score}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </SectionCard>
    </View>
  );
}

// ─────────────────────── Complications Pareto ───────────────────────
function ComplicationsPane({
  fromDate,
  toDate,
}: {
  fromDate: string;
  toDate: string;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params: any = {};
        if (fromDate) params.from_date = fromDate;
        if (toDate) params.to_date = toDate;
        const r = await api.get("/analytics/complications", { params });
        setData(r.data);
      } finally {
        setLoading(false);
      }
    })();
  }, [fromDate, toDate]);

  const max = Math.max(1, ...(data?.pareto || []).map((p: any) => p.count));

  return (
    <View style={s.pane}>
      <SectionCard
        title="Complication pareto"
        hint="Failure reasons ranked. The 80/20 line reveals the few reasons responsible for most events."
      >
        {loading ? (
          <ActivityIndicator style={{ marginVertical: 20 }} />
        ) : !data?.pareto?.length ? (
          <EmptyMsg />
        ) : (
          <>
            <Text style={s.paneNote}>Total events: {data.total_events}</Text>
            {data.pareto.slice(0, 15).map((p: any) => (
              <View key={p.reason} style={{ marginTop: 8 }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 3,
                  }}
                >
                  <Text style={s.paretoLbl} numberOfLines={1}>
                    {p.reason}
                  </Text>
                  <Text style={s.paretoRight}>
                    {p.count} · {p.cum_pct}%
                  </Text>
                </View>
                <View style={s.paretoBar}>
                  <View
                    style={[
                      s.paretoBarFill,
                      { width: `${(p.count / max) * 100}%` },
                    ]}
                  />
                </View>
              </View>
            ))}
          </>
        )}
      </SectionCard>
    </View>
  );
}

// ─────────────────────── Failure Analysis ───────────────────────
// FDI anatomical arch mini-chart (upper/lower). Failure counts render as
// coloured circles sized by frequency + labelled with the FDI number.
function FdiFailureArch({
  toothCounts,
}: {
  toothCounts: Record<string, number>;
}) {
  // 4-quadrant layout: upper (11-18, 21-28), lower (41-48, 31-38)
  const upperRight = [18, 17, 16, 15, 14, 13, 12, 11];
  const upperLeft = [21, 22, 23, 24, 25, 26, 27, 28];
  const lowerLeft = [31, 32, 33, 34, 35, 36, 37, 38];
  const lowerRight = [48, 47, 46, 45, 44, 43, 42, 41];
  const upper = [...upperRight, ...upperLeft];
  const lower = [...lowerRight, ...lowerLeft];
  const maxCount = Math.max(1, ...Object.values(toothCounts));

  const Tooth = ({ n }: { n: number }) => {
    const c = toothCounts[String(n)] || 0;
    const intensity = c / maxCount;
    const size = 22 + intensity * 12;
    const bg =
      c === 0 ? "#ECEFF1" : `rgba(198, 40, 40, ${0.3 + intensity * 0.7})`;
    return (
      <View style={{ alignItems: "center", marginHorizontal: 1 }}>
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: bg,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: c === 0 ? "#CFD8DC" : "#C62828",
          }}
        >
          {c > 0 && (
            <Text style={{ fontSize: 9, fontWeight: "800", color: "#FFF" }}>
              {c}
            </Text>
          )}
        </View>
        <Text style={{ fontSize: 8, color: "#78909C", marginTop: 2 }}>{n}</Text>
      </View>
    );
  };

  return (
    <View>
      <Text style={s.paneNote}>Upper arch (maxilla)</Text>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          marginVertical: 6,
        }}
      >
        {upper.map((n) => (
          <Tooth key={n} n={n} />
        ))}
      </View>
      <View
        style={{ height: 1, backgroundColor: "#E1E7EF", marginVertical: 6 }}
      />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          marginVertical: 6,
        }}
      >
        {lower.map((n) => (
          <Tooth key={n} n={n} />
        ))}
      </View>
      <Text style={s.paneNote}>Lower arch (mandible)</Text>
    </View>
  );
}

function FailurePane({
  fromDate,
  toDate,
}: {
  fromDate: string;
  toDate: string;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params: any = {};
        if (fromDate) params.from_date = fromDate;
        if (toDate) params.to_date = toDate;
        const r = await api.get("/analytics/failure-analysis", { params });
        setData(r.data);
      } finally {
        setLoading(false);
      }
    })();
  }, [fromDate, toDate]);

  const toothMap = useMemo(() => {
    const m: Record<string, number> = {};
    (data?.tooth_heatmap || []).forEach((x: any) => {
      m[x.tooth] = x.failures;
    });
    return m;
  }, [data]);

  if (loading)
    return (
      <View style={s.pane}>
        <ActivityIndicator style={{ marginVertical: 40 }} />
      </View>
    );
  if (!data)
    return (
      <View style={s.pane}>
        <EmptyMsg />
      </View>
    );

  return (
    <View style={s.pane}>
      {/* Buckets */}
      <SectionCard
        title="Time to failure"
        hint="When failures happen relative to placement. Early = infection/osseointegration issues; Late = biomechanical/prosthetic."
      >
        <View style={s.bucketsRow}>
          {(data.time_to_failure_buckets || []).map((b: any) => (
            <View key={b.key} style={s.bucketCard} testID={`ttf-${b.key}`}>
              <Text style={s.bucketCount}>{b.count}</Text>
              <Text style={s.bucketLbl}>{b.label}</Text>
            </View>
          ))}
        </View>
        <Text style={s.paneNote}>
          Total events: {data.totals?.n_failed_events} · Replacements:{" "}
          {data.totals?.n_replacements}
        </Text>
      </SectionCard>

      {/* Replacement outcomes */}
      {data.replacement_outcomes?.n_replaced > 0 && (
        <SectionCard
          title="Replacement outcomes"
          hint="Of failed implants that were replaced, how many are currently still Active."
        >
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={[s.replBox, { backgroundColor: "#E8F5E9" }]}>
              <Text style={[s.replVal, { color: "#1B5E20" }]}>
                {data.replacement_outcomes.replacement_success_rate ?? "—"}%
              </Text>
              <Text style={s.replLbl}>Replacement success</Text>
            </View>
            <View style={[s.replBox, { backgroundColor: "#E3F2FD" }]}>
              <Text style={[s.replVal, { color: "#0D47A1" }]}>
                {data.replacement_outcomes.n_currently_active}/
                {data.replacement_outcomes.n_replaced}
              </Text>
              <Text style={s.replLbl}>Active / Replaced</Text>
            </View>
          </View>
          {data.replacement_outcomes.n_prior_revisions_total > 0 && (
            <Text style={[s.paneNote, { marginTop: 8 }]}>
              Prior revision chain:{" "}
              {data.replacement_outcomes.n_prior_revisions_active} active of{" "}
              {data.replacement_outcomes.n_prior_revisions_total} revisions in
              history.
            </Text>
          )}
        </SectionCard>
      )}

      {/* Failure by System */}
      {data.by_system?.length > 0 && (
        <SectionCard title="Failure by system">
          {data.by_system.slice(0, 8).map((r: any) => (
            <View key={r.key} style={s.failRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.failName} numberOfLines={1}>
                  {r.key}
                </Text>
                {r.top_reasons?.length > 0 && (
                  <Text style={s.failReasons} numberOfLines={1}>
                    {r.top_reasons
                      .map((rr: any) => `${rr.reason} (${rr.count})`)
                      .join(" · ")}
                  </Text>
                )}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={s.failRate}>
                  {r.failure_rate === null ? "—" : `${r.failure_rate}%`}
                </Text>
                <Text style={s.failN}>
                  {r.n_failed}/{r.n_placed}
                </Text>
              </View>
            </View>
          ))}
        </SectionCard>
      )}

      {/* Failure by Bone Type */}
      {data.by_bone?.length > 0 && (
        <SectionCard title="Failure by bone type">
          {data.by_bone.map((r: any) => (
            <View key={r.key} style={s.failRow}>
              <Text style={[s.failName, { flex: 1 }]}>{r.key}</Text>
              <Text style={s.failRate}>
                {r.failure_rate === null ? "—" : `${r.failure_rate}%`}
              </Text>
              <Text style={[s.failN, { marginLeft: 8 }]}>
                {r.n_failed}/{r.n_placed}
              </Text>
            </View>
          ))}
        </SectionCard>
      )}

      {/* Failure by Region */}
      {data.by_region?.length > 0 && (
        <SectionCard title="Failure by tooth region">
          {data.by_region.map((r: any) => (
            <View key={r.key} style={s.failRow}>
              <Text style={[s.failName, { flex: 1 }]}>
                {r.key.replace(/_/g, " ")}
              </Text>
              <Text style={s.failRate}>
                {r.failure_rate === null ? "—" : `${r.failure_rate}%`}
              </Text>
              <Text style={[s.failN, { marginLeft: 8 }]}>
                {r.n_failed}/{r.n_placed}
              </Text>
            </View>
          ))}
        </SectionCard>
      )}

      {/* Failure by Supervisor */}
      {data.by_supervisor?.length > 0 && (
        <SectionCard
          title="Failure by supervisor"
          hint="Per-supervisor institutional review."
        >
          {data.by_supervisor.slice(0, 15).map((r: any) => (
            <View key={r.key} style={s.failRow}>
              <Text style={[s.failName, { flex: 1 }]} numberOfLines={1}>
                {r.name || r.key}
              </Text>
              <Text style={s.failRate}>
                {r.failure_rate === null ? "—" : `${r.failure_rate}%`}
              </Text>
              <Text style={[s.failN, { marginLeft: 8 }]}>
                {r.n_failed}/{r.n_placed}
              </Text>
            </View>
          ))}
        </SectionCard>
      )}

      {/* FDI Failure Heatmap */}
      <SectionCard
        title="Failure heatmap (FDI arch)"
        hint="Circle intensity + size scale with the number of failures per tooth position."
      >
        {Object.keys(toothMap).length === 0 ? (
          <EmptyMsg />
        ) : (
          <FdiFailureArch toothCounts={toothMap} />
        )}
      </SectionCard>

      {/* ISQ Distribution by Region */}
      {data.isq_distribution_by_region?.length > 0 && (
        <SectionCard
          title="ISQ distribution by tooth position"
          hint="Median / interquartile range of Phase 3 ISQ values per anatomical region."
        >
          {data.isq_distribution_by_region.map((r: any) => (
            <View key={r.region} style={s.failRow}>
              <Text style={[s.failName, { flex: 1 }]}>
                {r.region.replace(/_/g, " ")}
              </Text>
              <Text style={[s.failRate, { color: "#0D47A1" }]}>
                {r.median ?? "—"}
              </Text>
              <Text style={[s.failN, { marginLeft: 8 }]}>
                Q1-Q3: {r.q1 ?? "—"}-{r.q3 ?? "—"} · n={r.n}
              </Text>
            </View>
          ))}
        </SectionCard>
      )}
    </View>
  );
}

// ─────────────────────── Benchmarks vs Literature ───────────────────────
function BenchmarksPane({
  fromDate,
  toDate,
}: {
  fromDate: string;
  toDate: string;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params: any = {};
        if (fromDate) params.from_date = fromDate;
        if (toDate) params.to_date = toDate;
        const r = await api.get("/analytics/benchmarks", { params });
        setData(r.data);
      } finally {
        setLoading(false);
      }
    })();
  }, [fromDate, toDate]);

  return (
    <View style={s.pane}>
      <SectionCard
        title="Benchmarks vs literature"
        hint="Compare your survival to published ranges. Verdict badges: ▲ above literature · = on par · ▼ below."
      >
        {loading ? (
          <ActivityIndicator style={{ marginVertical: 20 }} />
        ) : !data?.rows?.length ? (
          <EmptyMsg />
        ) : (
          data.rows.map((r: any) => {
            const badgeColor =
              r.verdict === "above"
                ? "#2E7D32"
                : r.verdict === "on_par"
                  ? "#0277BD"
                  : r.verdict === "below"
                    ? "#C62828"
                    : "#90A4AE";
            const badgeLabel =
              r.verdict === "above"
                ? "▲ Above"
                : r.verdict === "on_par"
                  ? "= On par"
                  : r.verdict === "below"
                    ? "▼ Below"
                    : "n/a";
            return (
              <View
                key={r.procedure_type}
                style={s.benchCard}
                testID={`bench-${r.procedure_type.replace(/\s+/g, "-").toLowerCase()}`}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text style={s.benchType}>{r.procedure_type}</Text>
                  <View style={[s.benchBadge, { backgroundColor: badgeColor }]}>
                    <Text style={s.benchBadgeTxt}>{badgeLabel}</Text>
                  </View>
                </View>
                <View style={{ marginTop: 6, flexDirection: "row", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.benchLbl}>Yours</Text>
                    <Text style={s.benchYou}>
                      {r.your_survival !== null ? `${r.your_survival}%` : "—"}
                    </Text>
                    <Text style={s.benchN}>n={r.your_n}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.benchLbl}>Literature</Text>
                    <Text style={s.benchLit}>
                      {r.literature_low}–{r.literature_high}%
                    </Text>
                  </View>
                </View>
                <Text style={s.benchCite} numberOfLines={2}>
                  {r.citation}
                </Text>
              </View>
            );
          })
        )}
      </SectionCard>
    </View>
  );
}

// ─────────────────────── Research Export ───────────────────────
function ResearchExportPane({
  fromDate,
  toDate,
}: {
  fromDate: string;
  toDate: string;
}) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<any>(null);

  const load = async () => {
    setBusy(true);
    try {
      const params: any = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      const r = await api.get("/analytics/research-export.json", { params });
      setPreview(r.data);
    } finally {
      setBusy(false);
    }
  };

  const _buildUrl = (fmt: "json" | "csv") => {
    const params: any = {};
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;
    const qs = new URLSearchParams(params).toString();
    const baseUrl = api.defaults.baseURL || "";
    return `${baseUrl}/analytics/research-export.${fmt}${qs ? `?${qs}` : ""}`;
  };

  const downloadJson = async () => {
    try {
      await downloadAuthenticated(
        _buildUrl("json"),
        `research-export-${new Date().toISOString().slice(0, 10)}.json`,
        "application/json",
      );
    } catch {
      /* alert handled inside util */
    }
  };
  const downloadCsv = async () => {
    try {
      await downloadAuthenticated(
        _buildUrl("csv"),
        `research-export-${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } catch {
      /* alert handled inside util */
    }
  };

  return (
    <View style={s.pane}>
      <SectionCard
        title="Research export (de-identified)"
        hint="JSON bundle with per-implant rows + a data dictionary sheet. All identifiers are hashed. Safe for statistical analysis or publication."
      >
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <TouchableOpacity
            onPress={load}
            style={[s.applyBtn, { flex: 1, minWidth: 90 }]}
            testID="research-preview"
          >
            <Text style={s.applyBtnTxt}>{busy ? "Loading…" : "Preview"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={downloadJson}
            style={[
              s.applyBtn,
              { flex: 1, minWidth: 110, backgroundColor: "#2E7D32" },
            ]}
            testID="research-download-json"
          >
            <Text style={s.applyBtnTxt}>Download JSON</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={downloadCsv}
            style={[
              s.applyBtn,
              { flex: 1, minWidth: 110, backgroundColor: "#0277BD" },
            ]}
            testID="research-download-csv"
          >
            <Text style={s.applyBtnTxt}>Download CSV</Text>
          </TouchableOpacity>
        </View>
        {preview && (
          <View style={{ marginTop: 12 }} testID="research-preview-block">
            <Text style={s.paneNote}>
              Rows: <Text style={{ fontWeight: "800" }}>{preview.n_rows}</Text>{" "}
              · Generated: {preview.generated_at?.slice(0, 19)}Z
            </Text>
            <Text style={[s.paneNote, { marginTop: 8, fontWeight: "700" }]}>
              Data dictionary
            </Text>
            {preview.data_dictionary.slice(0, 6).map((d: any) => (
              <Text key={d.field} style={s.dictLine}>
                <Text style={{ fontWeight: "700" }}>{d.field}</Text> · {d.type}{" "}
                · {d.desc}
              </Text>
            ))}
            <Text style={[s.paneNote, { marginTop: 6, fontStyle: "italic" }]}>
              +{preview.data_dictionary.length - 6} more fields
            </Text>
          </View>
        )}
      </SectionCard>
    </View>
  );
}

// ─────────────────────── Shared bits ───────────────────────
// ─────────────────────── Phase 5 Follow-up metrics (iter-389) ───────────────────────
function FollowUpPane({
  fromDate,
  toDate,
}: {
  fromDate: string;
  toDate: string;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      const r = await api.get("/analytics/followup-metrics", { params });
      setData(r.data);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);
  useEffect(() => {
    load();
  }, [load]);

  if (loading)
    return (
      <View style={s.pane}>
        <ActivityIndicator style={{ marginVertical: 24 }} />
      </View>
    );
  if (!data)
    return (
      <View style={s.pane}>
        <EmptyMsg />
      </View>
    );
  const c = data.compliance || {};
  return (
    <View style={s.pane} testID="followup-analytics-pane">
      <SectionCard
        title="Follow-up compliance"
        hint="Phase 5 recall discipline across completed cases in your scope."
      >
        <View style={s.bucketsRow}>
          <View style={s.bucketCard}>
            <Text style={[s.bucketCount, { color: "#1565C0" }]}>
              {c.completed_cases ?? 0}
            </Text>
            <Text style={s.bucketLbl}>Completed cases</Text>
          </View>
          <View style={s.bucketCard}>
            <Text style={[s.bucketCount, { color: "#1B5E20" }]}>
              {c.cases_with_followup ?? 0}
            </Text>
            <Text style={s.bucketLbl}>With ≥1 follow-up</Text>
          </View>
          <View style={s.bucketCard}>
            <Text style={[s.bucketCount, { color: "#00695C" }]}>
              {c.compliance_rate ?? 0}%
            </Text>
            <Text style={s.bucketLbl}>Compliance</Text>
          </View>
        </View>
        <View style={[s.bucketsRow, { marginTop: 8 }]}>
          <View style={s.bucketCard}>
            <Text style={[s.bucketCount, { color: "#37474F" }]}>
              {c.total_followups ?? 0}
            </Text>
            <Text style={s.bucketLbl}>Total follow-ups</Text>
          </View>
          <View style={s.bucketCard}>
            <Text style={[s.bucketCount, { color: "#37474F" }]}>
              {c.avg_days_to_first ?? "—"}
            </Text>
            <Text style={s.bucketLbl}>Avg days to first</Text>
          </View>
          <View style={s.bucketCard}>
            <Text
              style={[
                s.bucketCount,
                { color: (c.overdue || []).length ? "#C62828" : "#37474F" },
              ]}
            >
              {(c.overdue || []).length}
            </Text>
            <Text style={s.bucketLbl}>Overdue ({">"}6 mo)</Text>
          </View>
        </View>
      </SectionCard>

      <SectionCard
        title="Implant survival over time"
        hint="From Phase 5 survival reviews — % of reviewed implants surviving in each period after prosthesis delivery."
      >
        {(data.survival_over_time || []).every((b: any) => !b.reviewed) ? (
          <EmptyMsg />
        ) : (
          (data.survival_over_time || []).map((b: any) => (
            <View
              key={b.bucket}
              style={{ marginBottom: 8 }}
              testID={`fu-survival-bucket-${b.bucket}`}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text style={s.paretoLbl}>{b.bucket}</Text>
                <Text style={s.paretoRight}>
                  {b.reviewed
                    ? `${b.survival_rate}% · n=${b.reviewed}`
                    : "no reviews"}
                </Text>
              </View>
              <View style={s.paretoBar}>
                <View
                  style={[
                    s.paretoBarFill,
                    {
                      width: `${b.survival_rate || 0}%`,
                      backgroundColor:
                        (b.survival_rate ?? 100) >= 95
                          ? "#2E7D32"
                          : (b.survival_rate ?? 100) >= 85
                            ? "#F9A825"
                            : "#C62828",
                    },
                  ]}
                />
              </View>
            </View>
          ))
        )}
        {data.current_survival?.implants_tracked ? (
          <View style={s.sweetCard} testID="fu-current-survival">
            <Text style={s.sweetHead}>
              Current: {data.current_survival.surviving}/
              {data.current_survival.implants_tracked} implants surviving (
              {data.current_survival.rate}%)
            </Text>
            <Text style={s.sweetLine}>
              Based on each implant's most recent follow-up survival review.
            </Text>
          </View>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Probing depth trend vs baseline"
        hint="Mean change (mm) across the 4 probing sites vs the Phase 4 Step 2 baseline, per follow-up appointment."
      >
        {!(data.probing_trend || []).length ? (
          <EmptyMsg />
        ) : (
          (data.probing_trend || []).map((row: any) => (
            <View
              key={row.followup}
              style={s.failRow}
              testID={`fu-probing-row-${row.followup}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.failName}>{row.label}</Text>
                <Text style={s.failN}>n={row.n_sites} sites</Text>
              </View>
              <Text
                style={[
                  s.failRate,
                  {
                    color:
                      (row.mean_delta_mm ?? 0) > 1
                        ? "#C62828"
                        : (row.mean_delta_mm ?? 0) > 0
                          ? "#F9A825"
                          : "#2E7D32",
                  },
                ]}
              >
                {row.mean_delta_mm != null
                  ? `${row.mean_delta_mm > 0 ? "+" : ""}${row.mean_delta_mm} mm`
                  : "—"}
              </Text>
              <Text style={[s.failN, { marginLeft: 8 }]}>
                max{" "}
                {row.max_delta_mm != null
                  ? `${row.max_delta_mm > 0 ? "+" : ""}${row.max_delta_mm}`
                  : "—"}
              </Text>
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard
        title="Overdue recalls"
        hint="Completed cases with no follow-up in the last 6 months."
      >
        {!(c.overdue || []).length ? (
          <Text style={{ color: "#2E7D32", fontStyle: "italic", marginTop: 4 }}>
            No overdue recalls — every completed case has been seen within 6
            months.
          </Text>
        ) : (
          (c.overdue || []).map((row: any, i: number) => (
            <View key={i} style={s.failRow} testID={`fu-overdue-row-${i}`}>
              <View style={{ flex: 1 }}>
                <Text style={s.failName}>{row.patient_name}</Text>
                <Text style={s.failN}>
                  {row.student_name} · {row.followup_count} follow-up
                  {row.followup_count === 1 ? "" : "s"}
                </Text>
              </View>
              <Text style={s.failRate}>{row.days_since_last}d</Text>
            </View>
          ))
        )}
      </SectionCard>
    </View>
  );
}

// ─────────────────────── Guided-plan adherence (iter-392) ───────────────────────
function AdherencePane({ fromDate, toDate }: { fromDate: string; toDate: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      const r = await api.get('/analytics/protocol-adherence', { params });
      setData(r.data);
    } finally { setLoading(false); }
  }, [fromDate, toDate]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={s.pane}><ActivityIndicator style={{ marginVertical: 24 }} /></View>;
  if (!data) return <View style={s.pane}><EmptyMsg /></View>;
  const sum = data.summary || {};
  const rateColor = (r: number | null) => (r ?? 100) >= 90 ? '#2E7D32' : (r ?? 100) >= 70 ? '#F9A825' : '#C62828';
  return (
    <View style={s.pane} testID="adherence-analytics-pane">
      <SectionCard title="Guided-plan adherence" hint="How often the Phase 2 drilling protocol matched the Phase 1 surgical plan.">
        <View style={s.bucketsRow}>
          <View style={s.bucketCard}><Text style={[s.bucketCount, { color: '#1565C0' }]}>{sum.comparable_cases ?? 0}</Text><Text style={s.bucketLbl}>Comparable cases</Text></View>
          <View style={s.bucketCard}><Text style={[s.bucketCount, { color: '#1B5E20' }]}>{sum.as_planned ?? 0}</Text><Text style={s.bucketLbl}>As planned</Text></View>
          <View style={s.bucketCard}><Text style={[s.bucketCount, { color: sum.deviated ? '#C62828' : '#37474F' }]}>{sum.deviated ?? 0}</Text><Text style={s.bucketLbl}>Deviated</Text></View>
        </View>
        {sum.adherence_rate != null && (
          <View style={s.sweetCard} testID="adherence-rate-card">
            <Text style={[s.sweetHead, { color: rateColor(sum.adherence_rate) }]}>Overall adherence: {sum.adherence_rate}%</Text>
            <Text style={s.sweetLine}>Cases where the surgery followed the planned drilling protocol exactly.</Text>
          </View>
        )}
      </SectionCard>

      <SectionCard title="Adherence by student" hint="Sorted lowest first — a teaching KPI for who most often abandons the plan intra-operatively.">
        {!(data.by_student || []).length ? <EmptyMsg /> :
          (data.by_student || []).map((row: any) => (
            <View key={row.student_name} style={{ marginBottom: 8 }} testID={`adherence-student-${row.student_name}`}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={s.paretoLbl}>{row.student_name}</Text>
                <Text style={s.paretoRight}>{row.adherence_rate}% · {row.deviated}/{row.total} deviated</Text>
              </View>
              <View style={s.paretoBar}>
                <View style={[s.paretoBarFill, { width: `${row.adherence_rate}%`, backgroundColor: rateColor(row.adherence_rate) }]} />
              </View>
            </View>
          ))}
      </SectionCard>

      <SectionCard title="What changes most" hint="Which part of the protocol deviates most often during surgery.">
        {!(data.deviation_fields || []).length ? (
          <Text style={{ color: '#2E7D32', fontStyle: 'italic', marginTop: 4 }}>No deviations recorded — every surgery followed its plan.</Text>
        ) : (data.deviation_fields || []).map((row: any) => (
          <View key={row.field} style={s.failRow} testID={`adherence-field-${row.field}`}>
            <Text style={[s.failName, { flex: 1 }]}>{row.field}</Text>
            <Text style={s.failRate}>{row.count}</Text>
          </View>
        ))}
      </SectionCard>

      <SectionCard title="Recent deviations" hint="Latest cases where the intra-op protocol differed from the plan.">
        {!(data.recent_deviations || []).length ? <EmptyMsg /> :
          (data.recent_deviations || []).map((row: any, i: number) => (
            <View key={i} style={[s.failRow, { alignItems: 'flex-start' }]} testID={`adherence-recent-${i}`}>
              <View style={{ flex: 1 }}>
                <Text style={s.failName}>{row.patient_name}</Text>
                <Text style={s.failN}>{row.student_name}{row.date ? ` · ${row.date}` : ''}</Text>
                {(row.diffs || []).map((d: any, j: number) => (
                  <Text key={j} style={{ fontSize: 11, color: '#5D4037', marginTop: 1 }}>
                    {d.field}: {d.planned} → <Text style={{ color: '#C62828', fontWeight: '700' }}>{d.actual}</Text>
                  </Text>
                ))}
              </View>
            </View>
          ))}
      </SectionCard>
    </View>
  );
}
function SectionCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{title}</Text>
      {hint ? <Text style={s.cardHint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

function EmptyMsg() {
  return (
    <Text style={{ color: "#B0BEC5", fontStyle: "italic", marginTop: 10 }}>
      No data yet for this view.
    </Text>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FB" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F7FB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E1E7EF",
    flexShrink: 0,
    zIndex: 10,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F0F4F8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#1A2332" },
  headerSub: { fontSize: 11, color: "#78909C", marginTop: 2 },

  tabsScroll: {
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E1E7EF",
    paddingVertical: 8,
    maxHeight: 46,
    flexShrink: 0,
    zIndex: 8,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minWidth: 118,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#CFD8DC",
    backgroundColor: "#FAFCFF",
  },
  tabActive: { borderColor: "#1E88E5", backgroundColor: "#1E88E5" },
  tabTxt: { fontSize: 11, fontWeight: "700", color: "#546E7A" },
  tabTxtActive: { color: "#FFF" },

  dateRow: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "flex-end",
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E1E7EF",
    flexShrink: 0,
    zIndex: 6,
    minHeight: 84,
  },
  dateLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#1565C0",
    letterSpacing: 0.6,
    marginBottom: 5,
    textTransform: "uppercase",
  },

  pane: { paddingHorizontal: 14, paddingBottom: 20 },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E1E7EF",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1A2332",
    marginBottom: 4,
  },
  cardHint: {
    fontSize: 11,
    color: "#78909C",
    lineHeight: 15,
    marginBottom: 10,
  },
  paneNote: { fontSize: 11, color: "#78909C", marginTop: 6 },

  pillRow: { flexDirection: "row", gap: 6, marginBottom: 8 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#CFD8DC",
    backgroundColor: "#FAFCFF",
  },
  pillActive: { borderColor: "#1E88E5", backgroundColor: "#E3F2FD" },
  pillTxt: { fontSize: 11, fontWeight: "700", color: "#546E7A" },
  pillTxtActive: { color: "#1565C0" },

  applyBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: "#1E88E5",
    borderRadius: 999,
    marginTop: 8,
  },
  applyBtnTxt: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.3,
    textAlign: "center",
  },

  legendWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexBasis: "45%",
  },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendTxt: { fontSize: 10, color: "#546E7A", flex: 1 },

  sweetCard: {
    marginTop: 10,
    backgroundColor: "#E8F5E9",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#A5D6A7",
  },
  sweetHead: { fontSize: 12, fontWeight: "800", color: "#1B5E20" },
  sweetLine: { fontSize: 11, color: "#33691E", marginTop: 3 },

  heatColHead: {
    fontSize: 9,
    fontWeight: "700",
    color: "#546E7A",
    textAlign: "center",
    paddingHorizontal: 3,
    marginBottom: 3,
  },
  heatRowHead: { fontSize: 11, fontWeight: "800", color: "#1A2332" },
  heatCell: {
    width: 66,
    height: 42,
    marginRight: 2,
    marginBottom: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  heatCellVal: { fontSize: 12, fontWeight: "800", color: "#FFF" },
  heatCellN: { fontSize: 9, color: "#FFF", opacity: 0.85 },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 4 },
  chipTiny: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#CFD8DC",
    backgroundColor: "#FAFCFF",
  },
  chipTinyActive: { borderColor: "#1E88E5", backgroundColor: "#E3F2FD" },
  chipTinyTxt: { fontSize: 10, fontWeight: "700", color: "#546E7A" },
  chipTinyTxtActive: { color: "#1565C0" },
  miniLbl: {
    fontSize: 10,
    color: "#78909C",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 8,
    marginBottom: 4,
    fontWeight: "700",
  },

  ctCell: {
    width: 90,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#F0F4F8",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  ctHead: { backgroundColor: "#F5F7FB" },
  ctHeadTxt: {
    fontSize: 10,
    fontWeight: "800",
    color: "#546E7A",
    textAlign: "center",
  },
  ctRowLbl: { fontSize: 11, fontWeight: "700", color: "#1A2332" },
  ctCellVal: { fontSize: 13, fontWeight: "800", color: "#1A2332" },
  ctCellN: { fontSize: 9, color: "#90A4AE" },

  cmiRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F4F8",
  },
  cmiName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1A2332",
    flex: 1,
    marginRight: 8,
  },
  cmiIdx: { fontSize: 18, fontWeight: "800", color: "#1565C0" },
  cmiSub: { fontSize: 10, color: "#90A4AE" },

  paretoLbl: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1A2332",
    flex: 1,
    marginRight: 8,
  },
  paretoRight: { fontSize: 11, fontWeight: "700", color: "#78909C" },
  paretoBar: {
    height: 10,
    backgroundColor: "#ECEFF1",
    borderRadius: 5,
    overflow: "hidden",
  },
  paretoBarFill: { height: "100%", backgroundColor: "#C62828" },

  benchCard: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#FAFCFF",
    borderWidth: 1,
    borderColor: "#E1E7EF",
    marginTop: 8,
  },
  benchType: { fontSize: 13, fontWeight: "800", color: "#1A2332", flex: 1 },
  benchBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  benchBadgeTxt: { fontSize: 10, fontWeight: "800", color: "#FFF" },
  benchLbl: {
    fontSize: 9,
    color: "#78909C",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  benchYou: { fontSize: 18, fontWeight: "800", color: "#1565C0", marginTop: 2 },
  benchN: { fontSize: 10, color: "#90A4AE" },
  benchLit: { fontSize: 18, fontWeight: "700", color: "#546E7A", marginTop: 2 },
  benchCite: {
    fontSize: 10,
    color: "#78909C",
    fontStyle: "italic",
    marginTop: 6,
  },

  dictLine: { fontSize: 10, color: "#37474F", marginTop: 3, lineHeight: 14 },

  logRankBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: "#F5F7FB",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E1E7EF",
  },
  logRankHead: {
    fontSize: 10,
    fontWeight: "800",
    color: "#546E7A",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  logRankLine: { fontSize: 12, color: "#1A2332", marginTop: 2 },

  bucketsRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  bucketCard: {
    flex: 1,
    backgroundColor: "#F5F7FB",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E1E7EF",
  },
  bucketCount: { fontSize: 22, fontWeight: "800", color: "#C62828" },
  bucketLbl: {
    fontSize: 10,
    color: "#546E7A",
    textAlign: "center",
    marginTop: 2,
  },

  replBox: {
    flex: 1,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E1E7EF",
  },
  replVal: { fontSize: 20, fontWeight: "800" },
  replLbl: {
    fontSize: 10,
    color: "#546E7A",
    marginTop: 2,
    textAlign: "center",
  },

  failRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F4F8",
  },
  failName: { fontSize: 12, fontWeight: "700", color: "#1A2332" },
  failReasons: { fontSize: 10, color: "#78909C", marginTop: 2 },
  failRate: { fontSize: 14, fontWeight: "800", color: "#C62828" },
  failN: { fontSize: 10, color: "#90A4AE" },
});
